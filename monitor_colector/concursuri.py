"""Concursuri și angajări: anunțurile de recrutare și promovare ale primăriei și ale instituțiilor subordonate,
grupate pe concursuri, cu etapele și rezultatele lor, plus istoricul organigramei (din hotărârile consiliului).

Surse (toate publice):
  - site-ul primăriei, categoria „Angajări” (din noiembrie 2024), colectată ca sursa „angajari”;
  - arhiva site-ului vechi, categoria „Anunțuri recrutare / promovare” (aprox. 2017-2025), sursa „angajari_arhiva”;
  - hotărârile consiliului local care aprobă sau modifică organigrama, statul de funcții sau numărul de posturi.

Fiecare postare e o etapă (anunț, selecția dosarelor, proba scrisă, interviu, rezultate finale, contestații).
Etapele se leagă într-un concurs după felul procedurii, instituție, funcție și apropierea în timp. Rezultatele
(admis / respins / absent) se numără din textul documentelor atașate (PDF-uri, multe scanate și citite prin OCR),
deci sunt orientative și au mereu linkul spre documentul primăriei.
"""
import json
import os
import re
from datetime import date, timedelta

from . import config
from .parse import clean_title, norm

ID_ARHIVA = 200_000_000   # ID-urile postărilor din arhivă se mută aici, ca să nu se suprapună cu cele de pe site

# ---------- clasificarea unei postări ----------

ETAPE = ["anunt", "selectie", "scrisa", "practica", "interviu", "contestatie", "final", "modificare", "barem", "alta"]
NUME_ETAPA = {"anunt": "Anunț", "selectie": "Selecția dosarelor", "scrisa": "Proba scrisă", "practica": "Proba practică",
              "interviu": "Interviu", "contestatie": "Contestații", "final": "Rezultate finale", "modificare": "Modificare / amânare",
              "barem": "Barem", "alta": "Altă informare"}
R_FINAL_LA_PROBA = re.compile(r"rezulta\w*\s+final\w*\s+(?:obtinut\w*\s+)?la\s+proba\s+(\w+)")
R_FINAL = re.compile(r"rezulta?\w*\s+final|raport\w*\s+final|rezultele\s+finale|rezultate\s+finale")


def etapa(t):
    """Etapa concursului din titlul (normalizat) al postării."""
    if "contestati" in t:
        return "contestatie"
    if "barem" in t:
        return "barem"
    m = R_FINAL_LA_PROBA.search(t)
    if m:
        p = m.group(1)
        return "interviu" if p.startswith("interv") else "practica" if p.startswith("practic") else "scrisa"
    if R_FINAL.search(t):
        return "final"
    if re.search(r"\binterviu", t):
        return "interviu"
    if re.search(r"prob\w*\s+practic", t):
        return "practica"
    if re.search(r"prob\w*\s+scris|lucrar\w*\s+scris", t):
        return "scrisa"
    if re.search(r"selecti\w*|eligibilit|verificar\w*\s+(?:a\s+)?(?:dosare|eligib)|dosarelor", t):
        return "selectie"
    if re.search(r"amana|reprogram|suspenda|anular|anulat|modificar|rectificar|\berata\b|prelungir", t):
        return "modificare"
    if re.search(r"\banunt|concurs|examen|organizar|recrutar|ocupar|post\w* vacant", t):
        return "anunt"
    return "alta"


def procedura(t):
    if re.search(r"concurs\w*\s+de\s+proiecte|proiect\w*\s+de\s+management", t):
        return "management"
    if "promovar" in t or re.search(r"\bin\s+(?:grad|treapta)\s+profesional", t):
        return "promovare"
    if "transfer" in t:
        return "transfer"
    return "recrutare"


NUME_PROCEDURA = {"recrutare": "Concurs de recrutare", "promovare": "Examen de promovare", "transfer": "Transfer la cerere",
                  "management": "Concurs de proiecte de management"}

INSTITUTII = [   # (nume afișat, regex pe titlul normalizat); ordinea contează
    ("Clubul Sportiv Municipal Bucovina", r"club\w*\s+sportiv|\bcsm\b"),
    ("Căminul pentru persoane vârstnice", r"camin\w*\s+(?:pentru\s+)?persoane\w*\s+varstnic"),
    ("Centrul comunitar de resurse", r"centr\w*\s+comunitar"),
    ("Casa de Cultură", r"cas\w*\s+(?:municipal\w*\s+)?de\s+cultura"),
    ("Poliția Locală", r"politi\w*\s+local"),
    ("Direcția de Asistență Socială", r"directi\w*\s+de\s+asistent\w*\s+social|\bd\.?\s?a\.?\s?s\.?\b"),
    ("Adăpostul de câini", r"adapost"),
    ("Creșe și grădinițe", r"\bcres\w*|gradinit"),
    ("Spitalul Municipal", r"spital"),
    ("Biblioteca Municipală", r"bibliotec"),
    ("Muzeul", r"\bmuze"),
]
PRIMARIA = "Primăria (aparatul de specialitate al primarului)"


def institutie(t):
    for nume, rx in INSTITUTII:
        if re.search(rx, t):
            return nume
    return PRIMARIA


# funcțiile (meseriile) care apar în anunțuri; prima potrivire, cea mai specifică, câștigă
FUNCTII = [
    "consilier juridic", "consilier achizitii publice", "consilier", "inspector de specialitate", "inspector",
    "referent de specialitate", "referent", "auditor", "arhitect sef", "arhitect", "politist local", "agent",
    "sef serviciu", "sef birou", "sef compartiment", "director executiv adjunct", "director executiv", "director adjunct",
    "director", "manager", "administrator", "casier", "contabil", "economist", "magaziner", "arhivar",
    "asistent medical", "asistent social", "asistent personal", "infirmier", "ingrijitor", "ingrijitoare", "brancardier",
    "medic", "psiholog", "psihopedagog", "logoped", "kinetoterapeut", "fiziokinetoterapeut", "educator", "educatoare",
    "pedagog", "instructor", "antrenor", "salvamar", "mediator", "tehnician", "operator", "dispecer", "sofer",
    "muncitor calificat", "muncitor necalificat", "muncitor", "paznic", "portar", "bucatar", "spalatoreasa", "lenjereasa",
    "electrician", "instalator", "fochist", "mecanic", "zidar", "tamplar", "lacatus", "gradinar", "femeie de serviciu",
    "bibliotecar", "muzeograf", "custode", "artist", "secretar", "registrator", "expert", "analist",
]
R_FUNCTII = re.compile(r"\b(" + "|".join(re.escape(f) for f in FUNCTII) + r")\w*")


def functii(t):
    """Funcțiile din titlu, fără dubluri, în ordinea apariției (ex. ['kinetoterapeut', 'logoped'])."""
    out = []
    for m in R_FUNCTII.finditer(t):
        f = m.group(1)
        f = {"ingrijitoare": "ingrijitor", "educatoare": "educator", "fiziokinetoterapeut": "kinetoterapeut"}.get(f, f)
        if f not in out and not any(f in o for o in out):
            out.append(f)
    return out


def categorie(t):
    if re.search(r"functi\w*\s+public", t) or re.search(r"functionar\w*\s+public", t):
        return "funcție publică"
    if "contractual" in t:
        return "personal contractual"
    return None


def durata(t):
    if "temporar vacant" in t or re.search(r"durat\w*\s+determinat|perioad\w*\s+determinat", t):
        return "determinată"
    if "nedeterminat" in t:
        return "nedeterminată"
    return None


def nivel(t):
    if re.search(r"(?:functi\w*|post\w*)\s+(?:\w+\s+){0,2}de\s+conducere|\bsef\b|director|manager", t):
        return "conducere"
    if "executie" in t:
        return "execuție"
    return None


NUMERE = {"unui": 1, "unei": 1, "un": 1, "o": 1, "doua": 2, "doi": 2, "trei": 3, "patru": 4, "cinci": 5, "sase": 6}


def posturi(t, fn):
    m = re.search(r"\b(unui|unei|doua|doi|trei|patru|cinci|sase|\d{1,2})\s+(?:\(\w+\)\s+)?(?:post|functi)", t)
    if m:
        v = m.group(1)
        return int(v) if v.isdigit() else NUMERE[v]
    return max(1, len(fn)) if fn else None


LUNI = {"ianuarie": 1, "februarie": 2, "martie": 3, "aprilie": 4, "mai": 5, "iunie": 6, "iulie": 7, "august": 8,
        "septembrie": 9, "octombrie": 10, "noiembrie": 11, "decembrie": 12}


def _d(y, m, d):
    try:
        return date(int(y), int(m), int(d)).isoformat()
    except ValueError:
        return None


def date_titlu(t):
    """Datele calendaristice din titlu (ex. ziua probei), în ordine. „21 și 25 octombrie 2024” dă două date."""
    out = []
    for m in re.finditer(r"(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})", t):
        out.append(_d(m.group(3), m.group(2), m.group(1)))
    for m in re.finditer(r"((?:\d{1,2}\s*(?:,|si)\s*)*)(\d{1,2})\s+(" + "|".join(LUNI) + r")\s+(\d{4})", t):
        for z in re.findall(r"\d{1,2}", m.group(1)) + [m.group(2)]:
            out.append(_d(m.group(4), LUNI[m.group(3)], z))
    return [x for x in out if x]


def nr_anunt(t):
    m = re.search(r"\banunt\w*\s+(?:nr\.?\s*)?(\d{2,6})\b", t) or re.search(r"\b(?:nr\.?|adresa|rezultat\w*)\s*(\d{3,6})\s+din\b", t)
    return m.group(1) if m else None


def structura(titlu):
    """Compartimentul / serviciul din titlu, cu forma originală (ex. „Compartimentul Evidența persoanelor”)."""
    from .voturi import normalizeaza   # păstrează pozițiile caracterelor, ca să putem lua forma originală
    titlu = re.sub(r"\s+", " ", titlu or "")
    m = re.search(r"\b((?:la|in cadrul|din cadrul)\s+)?((?:compartiment|serviciu|birou|directi|biroul)\w*\s+[^,;:()]{3,80}?)"
                  r"(?=\s+(?:din cadrul|al|a|din|la|pe durata|in vederea|organizat)\b|[,;:()]|$)", normalizeaza(titlu))
    if not m:
        return None
    if re.match(r"directi\w*\s+de\s+asistent", m.group(2)):
        return None   # e instituția, nu o structură
    s = titlu[m.start(2):m.end(2)].strip()
    return s[:1].upper() + s[1:]


def clasifica(titlu):
    t = norm(titlu)
    fn = functii(t)
    return {"etapa": etapa(t), "procedura": procedura(t), "institutie": institutie(t), "functii": fn,
            "categorie": categorie(t), "durata": durata(t), "nivel": nivel(t), "posturi": posturi(t, fn),
            "date_titlu": date_titlu(t), "nr_anunt": nr_anunt(t), "structura": structura(titlu)}


# ---------- rezultate (din textul documentelor) ----------

R_ADMIS = re.compile(r"\b(admis|admisa|promovat|promovata|reusit)\b")
R_RESPINS = re.compile(r"\b(respins|respinsa|nepromovat|nepromovata|nereusit|necorespunzator)\b")
R_ABSENT = re.compile(r"\b(absent|absenta|neprezentat|neprezentata|nu s-a prezentat)\b")
R_ANTET = re.compile(r"admis\w*\s*/\s*respins\w*|promovat\w*\s*/\s*nepromovat\w*|\badmis\w*\s+sau\s+\W?respins\w*")


def numara_rezultate(text):
    """{admis, respins, absent} din textul unui document cu rezultate. Antetele de tabel („admis/respins”) nu contează."""
    t = R_ANTET.sub(" ", norm(text))
    # formulele din textul legal („candidații declarați admiși”, „vor fi respinși”) au forme de plural, deci nu se numără
    return {"admis": len(R_ADMIS.findall(t)), "respins": len(R_RESPINS.findall(t)), "absent": len(R_ABSENT.findall(t))}


# ---------- citirea din baza de date ----------

def _text_doc(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except (OSError, TypeError):
        return ""


def _fara_html(h):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h or "")).strip()


def postari(db):
    """Postările de angajări (site + arhivă), fără dublurile publicate în ambele locuri, cu documentele și textul lor."""
    rows = db.execute("SELECT wp_id, source, link, title, date, content_html FROM posts "
                      "WHERE source IN ('angajari','angajari_arhiva') ORDER BY date, wp_id").fetchall()
    docs = {}
    for d in db.execute("SELECT d.wp_id, d.url, d.link_text, d.text_path FROM documents d JOIN posts p ON p.wp_id=d.wp_id "
                        "WHERE p.source IN ('angajari','angajari_arhiva') ORDER BY d.rowid"):
        docs.setdefault(d["wp_id"], []).append(d)
    out, vazute = [], {}
    for r in rows:
        titlu = clean_title(r["title"])
        zi = (r["date"] or "")[:10] or None
        cheie = (norm(titlu)[:140], zi)
        if cheie in vazute:   # aceeași postare pe site și în arhivă: păstrăm varianta de pe site
            if r["source"] == "angajari":
                out[vazute[cheie]]["link"] = r["link"]
            continue
        ds = docs.get(r["wp_id"], [])
        text = "\n".join(_text_doc(d["text_path"]) for d in ds if d["text_path"]) or _fara_html(r["content_html"])
        x = {"id": r["wp_id"], "sursa": "arhiva" if r["source"] == "angajari_arhiva" else "site", "titlu": titlu, "data": zi,
             "link": r["link"], "docs": [{"url": d["url"], "text": clean_title(d["link_text"] or "")} for d in ds],
             "are_text": any(d["text_path"] for d in ds), "_text": text}
        x.update(clasifica(titlu))
        vazute[cheie] = len(out)
        out.append(x)
    return out


# ---------- gruparea etapelor în concursuri ----------

def _cuvinte(t):
    return set(w for w in re.findall(r"[a-z]{4,}", norm(t)) if w not in _COMUNE)


_COMUNE = set("""anunt anuntul privind rezultatul rezultatele rezultat finale final proba probei scrise scrisa interviu interviului
practica concursul concursului examenul examenului organizat organizata organizarea organizarii data datele zilele pentru vederea ocuparii
ocuparea functiei functiilor functii postului posturi unui unei contractuale contractuala publice publica executie vacante vacanta
durata nedeterminata determinata cadrul municipiului radauti primariei primarului aparatului specialitate selectiei selectia
dosarelor dosare inscriere candidatilor candidatilor inscrisi eligibilitatii verificarii solutionarii contestatiei contestatiilor
depuse promovare promovarii gradul grad profesional imediat superior urmator celui detinut catre clasa ianuarie februarie martie
aprilie iunie iulie august septembrie octombrie noiembrie decembrie""".split())


def _seaman(a, b):
    A, B = _cuvinte(a), _cuvinte(b)
    return len(A & B) / max(1, min(len(A), len(B))) if A and B else 0.0


def _zile(a, b):
    try:
        return abs((date.fromisoformat(a) - date.fromisoformat(b)).days)
    except (TypeError, ValueError):
        return 9999


def _potrivire(c, p):
    """Cât de bine se potrivește postarea p cu concursul c (0 = deloc)."""
    if c["procedura"] != p["procedura"] or c["institutie"] != p["institutie"]:
        return 0
    if _zile(c["ultima"], p["data"]) > 75 or (p["etapa"] == "anunt" and c["are_anunt"] and _zile(c["inceput"], p["data"]) > 10):
        return 0
    if c["inchis"] and p["etapa"] not in ("contestatie",) and _zile(c["ultima"], p["data"]) > 3:
        return 0
    s = 0.0
    if p["date_titlu"] and set(p["date_titlu"]) & c["date"]:
        s += 2   # aceeași zi a probei: aproape sigur același concurs
    fc, fp = set(c["functii"]), set(p["functii"])
    if fc and fp:
        if not (fc & fp):
            return 0
        s += 1
    s += _seaman(c["titlu"], p["titlu"])
    return s


def grupeaza(posts):
    """Lista de concursuri, fiecare cu etapele lui (postările), în ordinea datelor."""
    cs = []
    for p in sorted(posts, key=lambda x: (x["data"] or "", ETAPE.index(x["etapa"]))):
        if p["etapa"] == "alta" and not p["functii"]:
            continue
        best, scor = None, 0.6
        for c in cs[-40:]:
            s = _potrivire(c, p)
            if s > scor:
                best, scor = c, s
        if best is None:
            best = {"procedura": p["procedura"], "institutie": p["institutie"], "functii": list(p["functii"]), "titlu": p["titlu"],
                    "inceput": p["data"], "ultima": p["data"], "date": set(), "are_anunt": False, "inchis": False, "etape": []}
            cs.append(best)
        best["etape"].append(p)
        best["ultima"] = max(best["ultima"] or "", p["data"] or "") or None
        best["date"] |= set(p["date_titlu"])
        best["are_anunt"] = best["are_anunt"] or p["etapa"] == "anunt"
        best["inchis"] = best["inchis"] or p["etapa"] == "final"
        for f in p["functii"]:
            if f not in best["functii"]:
                best["functii"].append(f)
        if p["etapa"] == "anunt" or len(p["titlu"]) > len(best["titlu"]) * 1.3:
            best["titlu"] = p["titlu"]   # titlul anunțului descrie cel mai bine concursul
    return cs


def _prima(lista, cheie):
    for x in lista:
        if x.get(cheie):
            return x[cheie]
    return None


def rezuma(c, azi=None):
    """Concursul în forma exportată: date, etape, candidați, rezultat."""
    azi = azi or date.today()
    E = c["etape"]
    an = next((e for e in E if e["etapa"] == "anunt"), None)
    fin = [e for e in E if e["etapa"] == "final"]
    sel = [e for e in E if e["etapa"] == "selectie"]
    r_fin = numara_rezultate("\n".join(e["_text"] for e in fin)) if fin else None
    r_sel = numara_rezultate("\n".join(e["_text"] for e in sel)) if sel else None
    candidati = None
    if r_sel and (r_sel["admis"] + r_sel["respins"]):
        candidati = r_sel["admis"] + r_sel["respins"]
    elif r_fin and (r_fin["admis"] + r_fin["respins"] + r_fin["absent"]):
        candidati = r_fin["admis"] + r_fin["respins"] + r_fin["absent"]
    if fin:
        if r_fin and r_fin["admis"]:
            stare = "ocupat" if c["procedura"] != "promovare" else "promovat"
        elif r_fin and (r_fin["respins"] or r_fin["absent"]):
            stare = "neocupat" if c["procedura"] != "promovare" else "nepromovat"
        elif any(e["are_text"] for e in fin):
            stare = "rezultat necitit"
        else:
            stare = "rezultat în document scanat"
    elif _zile(c["ultima"], azi.isoformat()) <= 60:
        stare = "în desfășurare"
    else:
        stare = "fără rezultat final publicat"
    ziua_probei = sorted(c["date"])
    durata_zile = _zile(c["inceput"], fin[-1]["data"]) if fin and c["inceput"] else None
    return {
        "id": E[0]["id"], "titlu": c["titlu"], "procedura": c["procedura"], "procedura_nume": NUME_PROCEDURA[c["procedura"]],
        "institutie": c["institutie"], "functii": c["functii"], "structura": _prima(E, "structura"),
        "categorie": _prima(E, "categorie"), "durata": _prima(E, "durata"), "nivel": _prima(E, "nivel"),
        "posturi": (an or {}).get("posturi") or _prima(E, "posturi"),
        "inceput": c["inceput"], "sfarsit": c["ultima"], "an": int((c["inceput"] or "0")[:4]) or None,
        "proba_de_la": ziua_probei[0] if ziua_probei else None, "nr_anunt": (an or {}).get("nr_anunt"),
        "are_anunt": bool(an), "contestatii": sum(1 for e in E if e["etapa"] == "contestatie"),
        "candidati": candidati, "admisi": r_fin["admis"] if r_fin else None, "respinsi": r_fin["respins"] if r_fin else None,
        "absenti": r_fin["absent"] if r_fin else None, "stare": stare, "durata_zile": durata_zile,
        "etape": [{"etapa": e["etapa"], "nume": NUME_ETAPA[e["etapa"]], "data": e["data"], "titlu": e["titlu"], "link": e["link"],
                   "docs": e["docs"][:6], "sursa": e["sursa"]} for e in E],
    }


# ---------- organigrama (din hotărârile consiliului) ----------

R_ORG = re.compile(r"organigram|stat\w*\s+de\s+functii|numar\w*\s+(?:total\s+)?de\s+(?:posturi|personal)|structur\w*\s+organizatoric")
INSTITUTII_ORG = [
    ("Primăria (aparatul de specialitate)", r"aparat\w*\s+de\s+specialitate|primari"),
    ("Direcția de Asistență Socială", r"asistent\w*\s+social"),
    ("Clubul Sportiv Municipal Bucovina", r"club\w*\s+sportiv"),
    ("Casa de Cultură", r"cas\w*\s+(?:municipal\w*\s+)?de\s+cultura"),
    ("Poliția Locală", r"politi\w*\s+local"),
    ("Spitalul Municipal", r"spital"),
    ("Serviciul de Evidență a Persoanelor", r"evidenta\s+(?:a\s+)?persoanelor"),
    ("Creșe", r"\bcres"),
    ("Biblioteca Municipală", r"bibliotec"),
    ("Muzeul", r"\bmuze"),
]
R_TOTAL = [
    ("total", r"(?:numar\w*\s+)?total\w*\s+(?:general\s+)?(?:de\s+)?(?:posturi|functii)(?:\s+(?:aprobate|din\s+organigrama))?\s*(?:[:=-]|este\s+de|de)?\s*(\d{1,4})\b"),
    ("total", r"numar\w*\s+(?:maxim\s+)?de\s+posturi\s+(?:\w+\s+){0,4}?(?:la|de)\s+(\d{1,4})\s+(?:de\s+)?posturi"),
    ("demnitate", r"functii\s+de\s+demnitate\s+public\w*\s*[:=-]?\s*(\d{1,3})\b"),
    ("publice", r"(?:total\s+)?functii\s+publice\s*[:=-]?\s*(\d{1,4})\b"),
    ("contractuale", r"(?:total\s+)?(?:functii|personal)\s+contractual\w*\s*[:=-]?\s*(\d{1,4})\b"),
    ("conducere", r"functii\s+(?:publice\s+)?de\s+conducere\s*[:=-]?\s*(\d{1,3})\b"),
    ("executie", r"functii\s+(?:publice\s+)?de\s+executie\s*[:=-]?\s*(\d{1,4})\b"),
]


def organigrama(db):
    """Hotărârile despre organigramă / stat de funcții / număr de posturi, cu cifrele citite din text (orientativ)."""
    out = []
    for r in db.execute("SELECT year, number, adoption_date, title, wp_id, pdf_url FROM hcl WHERE title IS NOT NULL "
                        "ORDER BY adoption_date, number"):
        t = norm(r["title"])
        if not R_ORG.search(t):
            continue
        inst = [n for n, rx in INSTITUTII_ORG if re.search(rx, t)] or ["Primăria (aparatul de specialitate)"]
        text = ""
        if r["wp_id"]:
            text = "\n".join(_text_doc(x["text_path"]) for x in db.execute(
                "SELECT text_path FROM documents WHERE wp_id=? AND text_path IS NOT NULL ORDER BY rowid", (r["wp_id"],)))
        if not text and r["pdf_url"]:
            x = db.execute("SELECT text_path FROM documents WHERE url=? AND text_path IS NOT NULL", (r["pdf_url"],)).fetchone()
            text = _text_doc(x["text_path"]) if x else ""
        cifre, fragmente = {}, []
        tn = norm(text)
        for cheie, rx in R_TOTAL:
            if cheie in cifre:
                continue
            m = re.search(rx, tn)
            if m:
                v = int(m.group(1))
                if 0 < v < 2000:
                    cifre[cheie] = v
                    fragmente.append(tn[max(0, m.start() - 60): m.end() + 40])
        tip = ("modificare" if re.search(r"modificar|completar|transformar|actualizar", t) else "aprobare")
        out.append({"an": r["year"], "nr": r["number"], "data": r["adoption_date"], "titlu": clean_title(r["title"]),
                    "institutii": inst, "tip": tip, "cifre": cifre, "are_text": bool(text.strip()), "_fragmente": fragmente})
    return out


# ---------- export ----------

def statistici(C, azi=None):
    azi = azi or date.today()
    pe_ani = {}
    for c in C:
        if not c["an"]:
            continue
        a = pe_ani.setdefault(str(c["an"]), {"total": 0, "recrutare": 0, "promovare": 0, "transfer": 0, "management": 0,
                                              "ocupate": 0, "neocupate": 0, "fara_rezultat": 0, "un_candidat": 0, "contestatii": 0})
        a["total"] += 1
        a[c["procedura"]] += 1
        a["ocupate"] += c["stare"] in ("ocupat", "promovat")
        a["neocupate"] += c["stare"] in ("neocupat", "nepromovat")
        a["fara_rezultat"] += c["stare"] == "fără rezultat final publicat"
        a["un_candidat"] += c["candidati"] == 1
        a["contestatii"] += bool(c["contestatii"])
    inst, fn = {}, {}
    for c in C:
        i = inst.setdefault(c["institutie"], {"total": 0, "recrutare": 0, "ocupate": 0})
        i["total"] += 1
        i["recrutare"] += c["procedura"] == "recrutare"
        i["ocupate"] += c["procedura"] == "recrutare" and c["stare"] == "ocupat"
        if c["procedura"] == "recrutare":
            for f in c["functii"] or ["(nedeterminat)"]:
                fn[f] = fn.get(f, 0) + 1
    rec = [c for c in C if c["procedura"] == "recrutare"]
    cu_cand = [c["candidati"] for c in rec if c["candidati"]]
    dur = [c["durata_zile"] for c in C if c["durata_zile"] is not None]
    return {
        "total": len(C), "recrutare": len(rec), "primul_an": min((c["an"] for c in C if c["an"]), default=None),
        "ocupate_prin_concurs": sum(1 for c in rec if c["stare"] == "ocupat"),
        "neocupate": sum(1 for c in rec if c["stare"] == "neocupat"),
        "in_desfasurare": sum(1 for c in C if c["stare"] == "în desfășurare"),
        "un_candidat": sum(1 for c in rec if c["candidati"] == 1),
        "cu_candidati_cunoscuti": len(cu_cand),
        "candidati_medie": round(sum(cu_cand) / len(cu_cand), 1) if cu_cand else None,
        "durata_medie_zile": round(sum(dur) / len(dur)) if dur else None,
        "pe_ani": pe_ani, "pe_institutii": inst,
        "functii": sorted(fn.items(), key=lambda x: (-x[1], x[0]))[:25],
    }


def export(store, azi=None):
    db = store.db
    try:
        P = postari(db)
    except Exception:   # tabelele există doar după prima colectare
        P = []
    C = [rezuma(c, azi) for c in grupeaza(P)]
    C.sort(key=lambda c: (c["sfarsit"] or "", c["id"]), reverse=True)
    try:
        O = organigrama(db)
    except Exception:
        O = []
    return {"generat_la": (azi or date.today()).isoformat(), "concursuri": C, "statistici": statistici(C, azi),
            "organigrama": [{k: v for k, v in o.items() if not k.startswith("_")} for o in O],
            "organigrama_curenta": {"pagina": "https://primariaradauti.ro/organigrama/",
                                    "stat_de_functii": "https://primariaradauti.ro/stat-de-functii/"},
            "postari": len(P)}, P, O


def indicatori(store):
    ex, _, _ = export(store)
    s = ex["statistici"]
    if not s["total"]:
        return None
    return {"total": s["total"], "angajare": s["recrutare"], "primul_an": s["primul_an"],
            "ocupate_prin_concurs": s["ocupate_prin_concurs"], "un_candidat": s["un_candidat"], "postari": ex["postari"]}


def raport(P, C, O):
    """Raport de verificare (concursuri-proba.txt, intern): cum a fost clasificată fiecare postare și cum s-au grupat."""
    L = [f"Concursuri și angajări - de verificat ({date.today().isoformat()})", "",
         f"Postări: {len(P)} (site {sum(1 for p in P if p['sursa'] == 'site')}, arhivă {sum(1 for p in P if p['sursa'] == 'arhiva')}); "
         f"cu text: {sum(1 for p in P if p['are_text'])}; concursuri formate: {len(C)}", ""]
    et = {}
    for p in P:
        et[p["etapa"]] = et.get(p["etapa"], 0) + 1
    L.append("Etape: " + ", ".join(f"{k} {v}" for k, v in sorted(et.items(), key=lambda x: -x[1])))
    st = {}
    for c in C:
        st[c["stare"]] = st.get(c["stare"], 0) + 1
    L.append("Stări: " + ", ".join(f"{k} {v}" for k, v in sorted(st.items(), key=lambda x: -x[1])))
    L += ["", "Postări neclasificate sau fără funcție (de verificat):"]
    for p in P:
        if p["etapa"] == "alta" or not p["functii"]:
            L.append(f"  {p['data']} | {p['etapa']} | {p['institutie']} | {p['titlu'][:170]}")
    L += ["", "Concursuri (primele 120):"]
    for c in C[:120]:
        L.append(f"- {c['inceput']} .. {c['sfarsit']} | {c['procedura']} | {c['institutie']} | {', '.join(c['functii']) or '?'} | "
                 f"stare: {c['stare']} | candidați {c['candidati']} | admiși {c['admisi']} respinși {c['respinsi']} absenți {c['absenti']}")
        for e in c["etape"]:
            L.append(f"    {e['data']} {e['etapa']:<11} {e['titlu'][:150]}")
    L += ["", "Rezultate finale: fragmente din text (primele 25), pentru reglarea numărării:"]
    n = 0
    for p in P:
        if p["etapa"] == "final" and p["_text"] and n < 25:
            n += 1
            t = re.sub(r"\s+", " ", p["_text"])[:900]
            L.append(f"  [{p['data']}] {p['titlu'][:120]}\n    {t}\n    -> {numara_rezultate(p['_text'])}")
    L += ["", "Organigrama: hotărâri găsite și cifrele citite (de verificat):"]
    for o in O:
        L.append(f"- HCL {o['nr']}/{o['an']} ({o['data']}) | {', '.join(o['institutii'])} | {o['tip']} | text: {o['are_text']} | {o['cifre']}")
        L.append(f"    {o['titlu'][:200]}")
        for fr in o["_fragmente"][:4]:
            L.append(f"    … {fr} …")
    return "\n".join(L) + "\n"


def scrie(store, data_dir=config.DATA_DIR):
    ex, P, O = export(store)
    os.makedirs(data_dir, exist_ok=True)
    with open(os.path.join(data_dir, "concursuri.json"), "w", encoding="utf-8") as f:
        json.dump(ex, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(data_dir, "concursuri-proba.txt"), "w", encoding="utf-8") as f:
        f.write(raport(P, ex["concursuri"], O))
    return {"postari": len(P), "concursuri": len(ex["concursuri"]), "organigrama_hcl": len(O)}
