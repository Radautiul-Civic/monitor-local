"""Litigiile în care e parte Municipiul Rădăuți (primăria, primarul, consiliul local, poliția locală).

Sursa: serviciul public de interogare al portalului instanțelor (portalquery.just.ro), același pe care
îl folosește portal.just.ro. Căutăm după numele părții („Rădăuți”, cu și fără diacritice), pe ferestre
de timp după data înregistrării dosarului; serviciul întoarce cel mult 1.000 de dosare pe căutare,
așa că o fereastră plină se împarte în două. Din rezultate păstrăm doar dosarele în care una dintre
părți e administrația municipiului.

Date personale: numele persoanelor fizice care sunt părți în dosare NU se publică. În exportul public
apar ca „persoană fizică”; numele lor rămân doar în baza de date și în pagina internă.
"""
import json
import logging
import re
import time
import unicodedata
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from xml.sax.saxutils import escape

import requests

from . import config

log = logging.getLogger(__name__)

URLS = ("https://portalquery.just.ro/query.asmx", "http://portalquery.just.ro/query.asmx")
NS = "portalquery.just.ro"
PLAFON = 1000
START = date(2010, 1, 1)
# instanțele unde ajung de obicei dosarele municipiului, dacă serviciul nu acceptă căutarea fără instanță
INSTANTE_REZERVA = ("JudecatoriaRADAUTI", "TribunalulSUCEAVA", "CurteadeApelSUCEAVA", "JudecatoriaSUCEAVA",
                    "TribunalulBUCURESTI", "CurteadeApelBUCURESTI")
TERMENI = ("RADAUTI", "RĂDĂUŢI", "RĂDĂUȚI")

SCHEMA = """
CREATE TABLE IF NOT EXISTS litigii_dosar (
    numar TEXT, institutie TEXT, data TEXT, obiect TEXT, materie TEXT, stadiu TEXT, data_modificare TEXT,
    entitati TEXT,                -- JSON: entitățile municipiului care sunt părți, cu calitatea lor
    json TEXT, gasit_la TEXT, actualizat_la TEXT,
    PRIMARY KEY (numar, institutie)
);
"""


def init(db):
    db.executescript(SCHEMA)


def _n(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Z0-9 ]+", " ", s.upper()).strip()


# ---------- cine e „administrația municipiului” ----------

def entitate(nume):
    """Eticheta entității municipiului pentru o parte, sau None dacă partea nu e administrația locală."""
    n = re.sub(r"\s+", " ", _n(nume))
    if "RADAUTI" not in n or re.search(r"RADAUTI\s*PRUT", n):
        return None
    if re.search(r"\bPOLITIA LOCALA\b", n):
        return "Poliția Locală"
    if re.search(r"\bCONSILIUL LOCAL\b", n):
        return "Consiliul Local"
    if re.search(r"\bPRIMARUL\b", n):
        return "Primarul"
    if re.search(r"\bPRIMARIA\b", n):
        return "Primăria"
    if re.search(r"\b(MUNICIPIUL|U ?A ?T|UNITATEA ADMINISTRATIV TERITORIALA|ORASUL)\b", n):
        return "Municipiul"
    if re.search(r"\b(DIRECTIA|SERVICIUL PUBLIC|SERVICIUL DE|DAS|DGASPC LOCAL)\b", n) and "MUNICIPIUL" in n:
        return "Servicii ale primăriei"
    return None


PJ = re.compile(r"\b(S ?R ?L|S ?A|S ?C|S ?N ?C|SRL|SA|PFA|I ?I|I ?F|ASOCIATIA|FUNDATIA|SOCIETATEA|COMPANIA|REGIA|"
                r"MUNICIPIUL|ORASUL|COMUNA|JUDETUL|PRIMARIA|PRIMARUL|CONSILIUL|INSTITUTIA|INSTITUTUL|AGENTIA|AUTORITATEA|"
                r"DIRECTIA|INSPECTORATUL|MINISTERUL|GUVERNUL|PREFECT|PREFECTURA|ADMINISTRATIA|OFICIUL|CASA|SPITALUL|"
                r"SCOALA|LICEUL|COLEGIUL|UNIVERSITATEA|GRADINITA|PAROHIA|EPISCOPIA|MITROPOLIA|PARTIDUL|SINDICATUL|"
                r"BANCA|BANK|CABINET|BIROUL|SOCIETATE|COOPERATIVA|CLUBUL|ASOCIATIE|FEDERATIA|UNIUNEA|CAMERA|"
                r"SERVICIUL|POLITIA|PARCHETUL|TRIBUNALUL|STATUL|U ?A ?T|LTD|GMBH|INC|LLC|IFN|EXECUTOR|"
                r"LICHIDATOR|INSOLVENTA|ADMINISTRATOR JUDICIAR|DGRFP|ANAF|DGFP|ITM|CJ|INTREPRINDERE)\b")


def persoana_juridica(nume):
    return bool(PJ.search(re.sub(r"\s+", " ", _n(nume))))


def nume_public(nume):
    """Numele unei părți, așa cum îl publicăm: persoanele fizice nu se numesc."""
    return nume if persoana_juridica(nume) else "persoană fizică"


# ---------- serviciul portalului ----------

class Client:
    def __init__(self, session=None, delay=config.REQUEST_DELAY):
        self.s = session or requests.Session()
        if not session:
            self.s.headers.update({"User-Agent": config.USER_AGENT})
        self.delay, self._t, self.cereri, self.url = delay, 0.0, 0, None
        self.fara_instanta = True

    def _wait(self):
        w = self.delay - (time.monotonic() - self._t)
        if w > 0:
            time.sleep(w)
        self._t = time.monotonic()
        self.cereri += 1

    def cautare(self, nume_parte=None, numar=None, institutie=None, d0=None, d1=None):
        campuri = ""
        if numar:
            campuri += f"<numarDosar>{escape(numar)}</numarDosar>"
        if nume_parte:
            campuri += f"<numeParte>{escape(nume_parte)}</numeParte>"
        campuri += (f"<institutie>{escape(institutie)}</institutie>" if institutie
                    else '<institutie xsi:nil="true" />')
        if d0:
            campuri += f"<dataStart>{d0.isoformat()}T00:00:00</dataStart>"
        if d1:
            campuri += f"<dataStop>{d1.isoformat()}T23:59:59</dataStop>"
        corp = ('<?xml version="1.0" encoding="utf-8"?>'
                '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
                'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
                f'<soap:Body><CautareDosare xmlns="{NS}">{campuri}</CautareDosare></soap:Body></soap:Envelope>')
        hdr = {"Content-Type": "text/xml; charset=utf-8", "SOAPAction": f'"{NS}/CautareDosare"'}
        ultima = None
        for url in ([self.url] if self.url else URLS):
            for i in range(3):
                self._wait()
                try:
                    r = self.s.post(url, data=corp.encode("utf-8"), headers=hdr, timeout=120)
                    if r.status_code == 500 and b"Fault" in r.content:
                        raise ValueError(_fault(r.content))
                    r.raise_for_status()
                    self.url = url
                    return parse(r.content)
                except ValueError:
                    raise
                except requests.RequestException as e:
                    ultima = e
                    time.sleep(5 * (i + 1))
        raise RuntimeError(f"portalquery.just.ro indisponibil: {ultima}")


def _fault(xml_bytes):
    try:
        root = ET.fromstring(xml_bytes)
        for el in root.iter():
            if el.tag.endswith("faultstring"):
                return el.text or "SOAP Fault"
    except ET.ParseError:
        pass
    return "SOAP Fault"


def _local(tag):
    return tag.rsplit("}", 1)[-1]


def _el_dict(el):
    out = {}
    for c in el:
        k = _local(c.tag)
        if k in ("parti", "sedinte", "caiAtac"):
            out[k] = [_el_dict(x) for x in c]
        elif len(c):
            out[k] = _el_dict(c)
        else:
            out[k] = (c.text or "").strip()
    return out


def parse(xml_bytes):
    """Lista de dosare (dicționare) din răspunsul SOAP."""
    root = ET.fromstring(xml_bytes)
    return [_el_dict(el) for el in root.iter() if _local(el.tag) == "Dosar"]


# ---------- colectare ----------

def _cauta_fereastra(cl, termen, d0, d1, institutie, stats):
    lst = cl.cautare(nume_parte=termen, institutie=institutie, d0=d0, d1=d1)
    if len(lst) >= PLAFON and d1 > d0:
        mij = d0 + (d1 - d0) // 2
        return (_cauta_fereastra(cl, termen, d0, mij, institutie, stats)
                + _cauta_fereastra(cl, termen, mij + timedelta(days=1), d1, institutie, stats))
    if len(lst) >= PLAFON:
        stats["trunchiate"] = stats.get("trunchiate", 0) + 1
    return lst


def _salveaza(db, d, azi):
    ent = []
    for p in d.get("parti") or []:
        e = entitate(p.get("nume"))
        if e:
            ent.append({"entitate": e, "nume": p.get("nume"), "calitate": p.get("calitateParte")})
    if not ent:
        return False
    numar, inst = d.get("numar"), d.get("institutie")
    vechi = db.execute("SELECT gasit_la FROM litigii_dosar WHERE numar=? AND institutie=?", (numar, inst)).fetchone()
    db.execute("INSERT OR REPLACE INTO litigii_dosar VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
        numar, inst, (d.get("data") or "")[:10] or None, d.get("obiect"), d.get("categorieCazNume") or d.get("categorieCaz"),
        d.get("stadiuProcesualNume") or d.get("stadiuProcesual"), (d.get("dataModificare") or "")[:10] or None,
        json.dumps(ent, ensure_ascii=False), json.dumps(d, ensure_ascii=False),
        vechi["gasit_la"] if vechi else azi.isoformat(), azi.isoformat()))
    return True


def colecteaza(store, cl=None, tot=False, azi=None, termeni=TERMENI):
    """tot=True (sau baza goală): toți anii din 2010; altfel anul curent și cel trecut, plus
    reîmprospătarea dosarelor care mai au termene, căutate după număr."""
    cl = cl or Client()
    db = store.db
    init(db)
    azi = azi or date.today()
    gol = db.execute("SELECT COUNT(*) FROM litigii_dosar").fetchone()[0] == 0
    d0 = START if (tot or gol) else date(azi.year - 1, 1, 1)
    st = {"gasite": 0, "pastrate": 0, "reimprospatate": 0}
    instante = [None]
    for termen in termeni:
        y = d0.year
        while y <= azi.year:
            a, b = max(d0, date(y, 1, 1)), min(azi, date(y, 12, 31))
            for inst in list(instante):
                try:
                    lst = _cauta_fereastra(cl, termen, a, b, inst, st)
                except ValueError as e:   # serviciul cere instanța: trecem pe lista de rezervă
                    if inst is None and instante == [None]:
                        log.warning("căutare fără instanță respinsă (%s); folosesc instanțele de rezervă", e)
                        st["fara_instanta"] = str(e)[:200]
                        instante[:] = list(INSTANTE_REZERVA)
                        y -= 1
                        break
                    raise
                st["gasite"] += len(lst)
                st.setdefault("pe_termen", {})[termen] = st.get("pe_termen", {}).get(termen, 0) + len(lst)
                for d in lst:
                    st["pastrate"] += int(_salveaza(db, d, azi))
                db.commit()
            y += 1
    # dosarele cu termene viitoare sau fără soluție: le cerem din nou după număr (ca să prindem noile termene)
    for r in db.execute("SELECT numar, institutie, json FROM litigii_dosar").fetchall():
        if stare(json.loads(r["json"]), azi)["stare"] == "fără termen viitor" and r["numar"]:
            continue
        try:
            for d in cl.cautare(numar=r["numar"], institutie=r["institutie"] if instante != [None] else None):
                if d.get("numar") == r["numar"]:
                    _salveaza(db, d, azi)
                    st["reimprospatate"] += 1
        except Exception as e:
            log.warning("dosar %s: %s", r["numar"], e)
    db.commit()
    st["cereri"] = cl.cereri
    return st


# ---------- stare, export ----------

AMANARI = re.compile(r"(?i)amân|aman|suspend|repune|ataşează|ataseaza|conexare|preschimb|^$")


def stare(d, azi=None):
    """Starea unui dosar la o instanță: termen viitor, ultima ședință și soluția ei."""
    azi = (azi or date.today()).isoformat()
    sed = sorted((s for s in d.get("sedinte") or [] if s.get("data")), key=lambda s: s["data"])
    viit = [s for s in sed if s["data"][:10] >= azi]
    trec = [s for s in sed if s["data"][:10] < azi]
    ult = trec[-1] if trec else None
    sol = next((s for s in reversed(trec) if s.get("solutie") and not AMANARI.search(s.get("solutie") or "")), None)
    # fără termen viitor și fără soluție: în curs doar dacă ultima ședință e din ultimul an
    # (dosarele vechi fără soluție afișată pe portal sunt, de regulă, închise de mult)
    recent = bool(ult) and ult["data"][:10] >= (date.fromisoformat(azi) - timedelta(days=365)).isoformat()
    if not sed:   # dosar nou, încă fără termen fixat
        recent = (d.get("data") or "")[:10] >= (date.fromisoformat(azi) - timedelta(days=365)).isoformat()
        return {"stare": "în curs" if recent else "fără ședințe", "termen": None, "ultima": None,
                "solutie": None, "sumar": None, "data_solutie": None}
    return {"stare": "în curs" if viit or (ult and not sol and recent) else "fără termen viitor",
            "termen": viit[0]["data"][:10] if viit else None,
            "ultima": ult["data"][:10] if ult else None,
            "solutie": (sol or {}).get("solutie"), "sumar": (sol or {}).get("solutieSumar"),
            "data_solutie": ((sol or {}).get("dataPronuntare") or (sol or {}).get("data") or "")[:10] or None}


ORASE = {"RADAUTI": "Rădăuți", "SUCEAVA": "Suceava", "BUCURESTI": "București", "IASI": "Iași", "FALTICENI": "Fălticeni",
         "CAMPULUNGMOLDOVENESC": "Câmpulung Moldovenesc", "GURAHUMORULUI": "Gura Humorului", "VATRADORNEI": "Vatra Dornei",
         "BOTOSANI": "Botoșani", "CLUJ": "Cluj", "TIMISOARA": "Timișoara", "BACAU": "Bacău", "PITESTI": "Pitești"}


def instanta(cod):
    """„TribunalulSUCEAVA” -> „Tribunalul Suceava”."""
    m = re.match(r"(CurteadeApel|Tribunalul|Judecatoria|TribunalulMilitar|InaltaCurte\w*)(.*)$", cod or "")
    if not m:
        return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", cod or "")
    fel = {"CurteadeApel": "Curtea de Apel", "Judecatoria": "Judecătoria"}.get(m.group(1), m.group(1))
    oras = m.group(2)
    if oras.startswith("SECTORUL"):
        nr = re.match(r"SECTORUL(\d)", oras)
        return f"{fel} Sectorului {nr.group(1)} București" if nr else f"{fel} {oras}"
    return f"{fel} {ORASE.get(oras, oras.title())}"


def _rol(calitate):
    c = _n(calitate)
    if re.search(r"RECLAMANT|PETENT|CREDITOR|CONTESTATOR|PETITIONAR|PARTE CIVILA|PERSOANA VATAMATA", c):
        return "a dat în judecată"
    if re.search(r"PARAT|INTIMAT|DEBITOR|INCULPAT|CHEMAT|CONTRAVENIENT", c):
        return "a fost chemată în judecată"
    if re.search(r"APELANT|RECURENT", c):
        return "a atacat hotărârea"
    return "altă calitate"


INITIATOR = re.compile(r"RECLAMANT|PETENT|CREDITOR|CONTESTATOR|PETITIONAR|APELANT|RECURENT|REVIZUENT|PARTE CIVILA|PERSOANA VATAMATA")
RESPONDENT = re.compile(r"PARAT|INTIMAT|DEBITOR|CHEMAT|INCULPAT|PARTE RESPONSABILA")


def verdict(stadiu, solutie, sumar):
    """„admite” / „respinge” / „partial” / None, pentru cererea care se judecă în etapa respectivă
    (acțiunea la fond, apelul în apel, recursul în recurs)."""
    t = _n((sumar or "") + " " + (solutie or ""))
    cale = r"(APELUL|APELURILE|RECURSUL|RECURSURILE)" if _n(stadiu) in ("APEL", "RECURS") else \
        r"(ACTIUNEA|CEREREA|CERERILE|PLANGEREA|CONTESTATIA|CEREREA DE CHEMARE IN JUDECATA)"
    if re.search(r"\bADMITE IN PARTE " + cale, t) or re.search(r"\bADMITE IN PARTE\b", _n(solutie)):
        return "partial"
    if re.search(r"\bRESPINGE " + cale, t) or re.search(r"\bANULEAZA " + cale, t):
        return "respinge"
    if re.search(r"\bADMITE " + cale, t):
        return "admite"
    s0 = _n(solutie)
    if s0.startswith("ADMITE") and "EXCEPTIA" not in s0:
        return "admite"
    if s0.startswith("RESPINGE") or s0.startswith("ANULEAZA"):
        return "respinge"
    return None


def rezultat_etapa(etapa, sumar):
    """Rezultatul pentru municipiu într-o etapă: câștigat / pierdut / parțial / None (neclar)."""
    v = verdict(etapa.get("stadiu"), etapa.get("solutie"), sumar)
    if not v:
        return None
    if v == "partial":
        return "parțial"
    cal = " ".join(_n(e.get("calitate")) for e in etapa.get("entitati") or [])
    if INITIATOR.search(cal):
        return "câștigat" if v == "admite" else "pierdut"
    if RESPONDENT.search(cal):
        return "pierdut" if v == "admite" else "câștigat"
    return None


GRUPE_OBIECT = [
    ("Contravenții", r"CONTRAVEN|PROCES VERBAL"),
    ("Anulare act administrativ", r"ANULARE ACT|ACT ADMINISTRATIV|SUSPENDARE EXECUTARE ACT|HOTARAR"),
    ("Insolvență", r"INSOLVEN|FALIMENT"),
    ("Executare silită", r"EXECUTAR"),
    ("Pretenții și despăgubiri", r"PRETENT|DESPAGUB|RASPUNDERE|DAUNE"),
    ("Proprietate și fond funciar", r"FOND FUNCIAR|UZUCAPIUNE|REVENDICARE|GRANITUIRE|PARTAJ|CONSTATARE|PROPRIETATE|INTABULARE|CARTE FUNCIARA"),
    ("Funcționari publici și muncă", r"FUNCTIONAR|MUNCA|SALARI|DREPTURI BANESTI|CONTESTATIE DECIZIE DE CONCEDIERE"),
    ("Taxe și impozite", r"TAXE|IMPOZIT|TIMBRU|FISCAL|CONTESTATIE ACT ADMINISTRATIV FISCAL"),
    ("Contracte și achiziții", r"ACHIZIT|CONTRACT|ATRIBUIRE"),
    ("Urbanism și construcții", r"AUTORIZA|CONSTRUCT|DEMOLAR|DESFIINTAR|URBANISM"),
    ("Obligația de a face", r"OBLIGATIA DE A FACE|OBLIGATIE DE A FACE"),
    ("Informații de interes public", r"544|INFORMATI"),
]


def grup_obiect(obiect):
    o = _n(obiect)
    for nume, rx in GRUPE_OBIECT:
        if re.search(rx, o):
            return nume
    return "Altele"


def export(store, public=True, azi=None):
    """Dosarele, grupate pe număr (aceeași cauză la fond, apel, recurs). public=True ascunde
    numele persoanelor fizice."""
    db = store.db
    init(db)
    azi = azi or date.today()
    pe_nr = {}
    for r in db.execute("SELECT * FROM litigii_dosar ORDER BY data, numar"):
        d = json.loads(r["json"])
        ent = json.loads(r["entitati"])
        s = stare(d, azi)
        sumar = s.get("sumar")
        if public:   # rezumatul soluției poate numi persoane fizice („obligă pârâtul X...”): doar intern
            s["sumar"] = None
        parti = []
        for p in d.get("parti") or []:
            e = entitate(p.get("nume"))
            parti.append({"nume": p.get("nume") if (not public or e) else nume_public(p.get("nume")),
                          "calitate": p.get("calitateParte"), "municipiu": bool(e)})
        etapa = {"instanta": instanta(r["institutie"]), "cod_instanta": r["institutie"], "stadiu": r["stadiu"],
                 "data": r["data"], "materie": r["materie"], "obiect": r["obiect"], "parti": parti,
                 "entitati": [{"entitate": e["entitate"], "calitate": e["calitate"]} for e in ent], **s}
        etapa["rezultat"] = rezultat_etapa(etapa, sumar) if s["stare"] != "în curs" else None
        pe_nr.setdefault(r["numar"], []).append(etapa)
    dosare = []
    for nr, et in pe_nr.items():
        et.sort(key=lambda e: (e["data"] or "", {"Fond": 0, "Apel": 1, "Recurs": 2}.get(e["stadiu"] or "", 3)))
        prima, ultima = et[0], et[-1]
        rol = _rol((prima["entitati"] or [{}])[0].get("calitate"))
        in_curs = any(e["stare"] == "în curs" for e in et)
        # rezultatul: ultima etapă cu o soluție interpretabilă; dacă o etapă ulterioară e în curs, e provizoriu
        decise = [e for e in et if e.get("rezultat")]
        rez = decise[-1]["rezultat"] if decise else None
        provizoriu = bool(decise) and in_curs
        adverse, vazute = [], set()
        for e in et:
            for p in e["parti"]:
                if not p["municipiu"] and (p["nume"], p["calitate"]) not in vazute:
                    vazute.add((p["nume"], p["calitate"]))
                    adverse.append({"nume": p["nume"], "calitate": p["calitate"]})
        stadii = [e["stadiu"] for e in et if e["stadiu"]]
        dosare.append({"numar": nr, "data": prima["data"], "an": (prima["data"] or "")[:4], "obiect": prima["obiect"] or ultima["obiect"],
                       "grup": grup_obiect(prima["obiect"] or ultima["obiect"]),
                       "materie": prima["materie"], "entitati": sorted({e["entitate"] for x in et for e in x["entitati"]}),
                       "rol": rol, "stare": "în curs" if in_curs else ultima["stare"],
                       "termen": min((e["termen"] for e in et if e["termen"]), default=None),
                       "solutie": ultima["solutie"], "sumar": ultima["sumar"], "data_solutie": ultima["data_solutie"],
                       "rezultat": ("în curs" if in_curs and not rez else rez) or "neclar", "provizoriu": provizoriu,
                       "rezultat_la": f"{decise[-1]['stadiu'] or ''} · {decise[-1]['instanta']}".strip(" ·") if decise else None,
                       "stadiu_max": stadii[-1] if stadii else None, "instante": sorted({e["instanta"] for e in et}),
                       "cod_portal": (nr.split("/")[1] if nr and nr.count("/") >= 2 else None),
                       "adverse": adverse, "etape": et})
    dosare.sort(key=lambda x: x["data"] or "", reverse=True)
    return {"generat_la": azi.isoformat(), "dosare": dosare}


def indicatori(ex):
    D = ex["dosare"]
    pe_ani, obiecte, materii, roluri, instante = {}, {}, {}, {}, {}
    for d in D:
        a = d["an"] or "?"
        p = pe_ani.setdefault(a, {"total": 0, "în curs": 0, "a dat în judecată": 0, "a fost chemată în judecată": 0})
        p["total"] += 1
        p["în curs"] += int(d["stare"] == "în curs")
        if d["rol"] in p:
            p[d["rol"]] += 1
        o = re.sub(r"\s+", " ", (d["obiect"] or "nemenționat").strip().lower())[:80]
        obiecte[o] = obiecte.get(o, 0) + 1
        materii[d["materie"] or "nemenționată"] = materii.get(d["materie"] or "nemenționată", 0) + 1
        roluri[d["rol"]] = roluri.get(d["rol"], 0) + 1
        for e in d["etape"]:
            instante[e["instanta"]] = instante.get(e["instanta"], 0) + 1
    top = lambda o, n: dict(sorted(o.items(), key=lambda x: -x[1])[:n])
    rez = {}
    for d in D:
        rez[d["rezultat"]] = rez.get(d["rezultat"], 0) + 1
    return {"total": len(D), "in_curs": sum(1 for d in D if d["stare"] == "în curs"), "rezultate": rez,
            "pe_ani": dict(sorted(pe_ani.items())), "obiecte": top(obiecte, 15), "materii": top(materii, 10),
            "roluri": roluri, "instante": top(instante, 10),
            "termene_viitoare": sorted(({"numar": d["numar"], "termen": d["termen"], "obiect": d["obiect"]}
                                        for d in D if d["termen"]), key=lambda x: x["termen"])[:20]}
