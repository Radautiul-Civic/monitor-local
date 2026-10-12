"""Achizițiile publice din SICAP (e-licitatie.ro) ale instituțiilor din Rădăuți.

Sursa: API-ul public pe care îl folosește chiar pagina e-licitatie.ro (fără cont). Câmpurile
au fost verificate în codul aplicației (octombrie 2026):
  - autorități:        GET  /api-pub/ComboPub/searchContractingAuthorities/?filter=&pageIndex=&pageSize=
  - achiziții directe: POST /api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/
                       (contractingAuthorityId, finalizationDateStart/End)
  - licitații:         POST /api-pub/NoticeCommon/GetCNoticeList/   (startPublicationDate/End)
  - atribuiri:         POST /api-pub/NoticeCommon/GetCANoticeList/  (startPublicationDate/End)
O căutare întoarce cel mult ~2.000 de rezultate („searchTooLong”): perioada se împarte în
bucăți tot mai mici până încape.
"""
import json
import logging
import re
import time
import unicodedata
from datetime import date, datetime, timedelta

import requests

from . import config

log = logging.getLogger(__name__)

BASE = "https://www.e-licitatie.ro"
START = date(2018, 1, 1)          # SICAP (platforma actuală); istoricul vechi e pe istoric.e-licitatie.ro
PAGINA = 100
PLAFON = 2000

SCHEMA = """
CREATE TABLE IF NOT EXISTS sicap_ca (id INTEGER PRIMARY KEY, text TEXT, cui TEXT, inclus INTEGER, gasit_la TEXT);
CREATE TABLE IF NOT EXISTS sicap_da (id INTEGER PRIMARY KEY, ca_id INTEGER, cod TEXT, nume TEXT, cpv TEXT,
    data_publicare TEXT, data_finalizare TEXT, furnizor TEXT, furnizor_cui TEXT, valoare_estimata REAL,
    valoare REAL, stare TEXT, json TEXT);
CREATE TABLE IF NOT EXISTS sicap_cn (id INTEGER PRIMARY KEY, ca_id INTEGER, nr TEXT, titlu TEXT, procedura TEXT,
    tip_contract TEXT, cpv TEXT, valoare_estimata REAL, data TEXT, stare TEXT, contestatie INTEGER, json TEXT);
CREATE TABLE IF NOT EXISTS sicap_can (id INTEGER PRIMARY KEY, ca_id INTEGER, nr TEXT, titlu TEXT, procedura TEXT,
    tip_contract TEXT, cpv TEXT, valoare REAL, oferta_min REAL, oferta_max REAL, data TEXT, json TEXT);
-- contractele din fiecare anunț de atribuire, cu câștigătorul (unul sau mai mulți, în asociere)
CREATE TABLE IF NOT EXISTS sicap_contract (id TEXT PRIMARY KEY, can_id INTEGER, nr TEXT, data TEXT, titlu TEXT,
    valoare REAL, castigator TEXT, castigator_cui TEXT, json TEXT, tip INTEGER);
CREATE TABLE IF NOT EXISTS sicap_can_verificat (can_id INTEGER PRIMARY KEY, la TEXT, contracte INTEGER, eroare TEXT);
CREATE TABLE IF NOT EXISTS sicap_meta (k TEXT PRIMARY KEY, v TEXT);
"""

# autorități din alte localități care conțin „Rădăuți” în nume (Rădăuți-Prut, județul Botoșani;
# Arhiepiscopia Sucevei și Rădăuților, cu sediul la Suceava)
EXCLUSE = re.compile(r"radauti[\s\-]*prut|sucevei\s+si\s+radautilor", re.I)


# instituții din oraș al căror nume din SICAP poate să nu conțină „Rădăuți” (nume unice în țară)
NUME_INCLUSE = re.compile(r"colegiul\s+national\s+\W*eudoxiu\s+hurmuzachi|andronic\s+motrescu|"
                          r"biblioteca\s+municipala\W+tudor\s+flondor|samuil\s+si\s+eugenia\s+ionet")

# grupele de instituții (lista instituțiilor subordonate e cea de pe site-ul primăriei)
GRUPE = [
    ("Primăria", r"\bmunicipiul\s+radauti\b|\bprimaria\b"),
    ("Instituții subordonate primăriei", r"politi|asistenta\s+sociala|spitalul\s+municipal|servicii\s+comunale|casa\s+(municipala\s+)?de\s+cultura|"
                                         r"biblioteca|muzeul|galeri|zoologic|clubul\s+sportiv\s+(municipal|scolar)"),
    ("Școli și grădinițe", r"scoala|gradinita|colegiul|liceul|seminar|clubul\s+copiilor|palatul\s+copiilor"),
]


def grupa(nume):
    n = _n(nume)
    for g, rx in GRUPE:
        if re.search(rx, n):
            return g
    return "Alte instituții din oraș"


def _n(s):
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def cui_si_nume(s):
    """„RO 6865630 DELTA PLUS TRADING S.R.L.” / „4701479 - SCOALA ...” -> („6865630”, „DELTA PLUS ...”)."""
    m = re.match(r"\s*(?:RO\s*)?(\d{2,10})\s*-?\s*(.*)$", s or "")
    return (m.group(1), m.group(2).strip()) if m else (None, (s or "").strip())


def _iso(d, sfarsit=False):
    return (datetime(d.year, d.month, d.day, 23, 59, 59) if sfarsit else datetime(d.year, d.month, d.day)).strftime(
        "%Y-%m-%dT%H:%M:%S.000Z")


def _txt(x):
    return x.get("text") if isinstance(x, dict) else x


class Client:
    def __init__(self, session=None, delay=config.REQUEST_DELAY):
        self.s = session or requests.Session()
        if not session:
            self.s.headers.update({
                "User-Agent": config.USER_AGENT, "Accept": "application/json, text/plain, */*",
                "Origin": BASE, "Referer": BASE + "/pub/direct-acquisitions/list/1",
                "X-Requested-With": "XMLHttpRequest"})
        self.delay, self._t, self.cereri = delay, 0.0, 0

    def _wait(self):
        w = self.delay - (time.monotonic() - self._t)
        if w > 0:
            time.sleep(w)
        self._t = time.monotonic()
        self.cereri += 1

    def get(self, path, params):
        for i in range(3):
            self._wait()
            try:
                r = self.s.get(BASE + path, params=params, timeout=90)
                if r.status_code < 500:
                    r.raise_for_status()
                    return r.json()
            except requests.RequestException:
                if i == 2:
                    raise
            time.sleep(5 * (i + 1))
        raise RuntimeError(f"SICAP {path}: eroare de server")

    def text(self, path):
        self._wait()
        r = self.s.get(BASE + path, timeout=90, headers={"Accept": "*/*"})
        r.raise_for_status()
        return r.text

    def post(self, path, body):
        for i in range(3):
            self._wait()
            try:
                r = self.s.post(BASE + path, json=body, timeout=90)
                if r.status_code < 500:
                    r.raise_for_status()
                    return r.json()
            except requests.RequestException:
                if i == 2:
                    raise
            time.sleep(5 * (i + 1))
        raise RuntimeError(f"SICAP {path}: eroare de server")


def init(db):
    db.executescript(SCHEMA)
    if "tip" not in [r[1] for r in db.execute("PRAGMA table_info(sicap_contract)")]:
        # 1 = contract, 2 = acord-cadru (valoare maximă, nu cheltuială), 3 = contract subsecvent
        db.execute("ALTER TABLE sicap_contract ADD COLUMN tip INTEGER")
        for r in db.execute("SELECT id, json FROM sicap_contract").fetchall():
            try:
                t = json.loads(r[1] or "{}").get("contractType")
            except ValueError:
                t = None
            db.execute("UPDATE sicap_contract SET tip=? WHERE id=?", (t, r[0]))
        db.commit()
    # o autoritate exclusă ulterior (vezi EXCLUSE) nu mai intră în date
    for r in db.execute("SELECT id, text FROM sicap_ca WHERE inclus=1").fetchall():
        if EXCLUSE.search(_n(r[1])):
            db.execute("UPDATE sicap_ca SET inclus=0 WHERE id=?", (r[0],))
    db.commit()
    col = [r[1] for r in db.execute("PRAGMA table_info(sicap_ca)")]
    if "istoric" not in col:
        # data la care s-a adus tot istoricul instituției (din 2018); instituțiile care au deja
        # date le considerăm aduse, ca să nu reluăm colectarea completă
        db.execute("ALTER TABLE sicap_ca ADD COLUMN istoric TEXT")
        db.execute("UPDATE sicap_ca SET istoric=gasit_la WHERE id IN (SELECT ca_id FROM sicap_da "
                   "UNION SELECT ca_id FROM sicap_cn UNION SELECT ca_id FROM sicap_can)")
        db.commit()


# ---------- autoritățile contractante din Rădăuți ----------

def autoritati(store, cl, termeni=("RADAUTI", "RĂDĂUŢI", "RĂDĂUȚI"), cui_extra=(), termeni_extra=()):
    db = store.db
    init(db)
    gasite = {}
    for t in list(termeni) + list(termeni_extra) + list(cui_extra):
        page = 0
        while True:
            d = cl.get("/api-pub/ComboPub/searchContractingAuthorities/",
                       {"filter": t, "pageIndex": page, "pageSize": 50})
            items = (d or {}).get("items") or []
            for it in items:
                if it.get("id"):
                    gasite[it["id"]] = it.get("text") or ""
            page += 1
            if not items or page * 50 >= (d.get("total") or 0):
                break
    noi = 0
    for i, text in gasite.items():
        cui, _ = cui_si_nume(text)
        if cui is None:
            m = re.search(r"\b(\d{4,10})\b", text)
            cui = m.group(1) if m else None
        inclus = int(("radauti" in _n(text) or (cui and cui in cui_extra) or bool(NUME_INCLUSE.search(_n(text))))
                     and not EXCLUSE.search(_n(text)))
        row = db.execute("SELECT inclus FROM sicap_ca WHERE id=?", (i,)).fetchone()
        if row is None:
            noi += 1
            db.execute("INSERT INTO sicap_ca (id, text, cui, inclus, gasit_la) VALUES (?,?,?,?,?)",
                       (i, text, cui, inclus, date.today().isoformat()))
        else:
            db.execute("UPDATE sicap_ca SET text=?, cui=? WHERE id=?", (text, cui, i))
            if inclus and not row["inclus"]:   # CUI adăugat ulterior în config.SICAP_CUI_EXTRA
                db.execute("UPDATE sicap_ca SET inclus=1 WHERE id=?", (i,))
    db.commit()
    return {"gasite": len(gasite), "noi": noi,
            "incluse": db.execute("SELECT COUNT(*) FROM sicap_ca WHERE inclus=1").fetchone()[0]}


# ---------- căutare cu ferestre adaptive ----------

def _ferestre(cl, path, corp, cheie_start, cheie_end, d0, d1, stats):
    """Toate rezultatele din [d0, d1]; dacă depășesc plafonul, perioada se împarte în două."""
    body = dict(corp, pageSize=PAGINA, pageIndex=0, **{cheie_start: _iso(d0), cheie_end: _iso(d1, True)})
    d = cl.post(path, body) or {}
    total = d.get("total") or 0
    if (d.get("searchTooLong") or total >= PLAFON) and d1 > d0:
        mij = d0 + (d1 - d0) // 2
        return (_ferestre(cl, path, corp, cheie_start, cheie_end, d0, mij, stats)
                + _ferestre(cl, path, corp, cheie_start, cheie_end, mij + timedelta(days=1), d1, stats))
    if d.get("searchTooLong") or total >= PLAFON:
        stats["trunchiate"] = stats.get("trunchiate", 0) + 1
    items = list(d.get("items") or [])
    page = 1
    while len(items) < min(total, PLAFON) and d.get("items"):
        body["pageIndex"] = page
        d = cl.post(path, body) or {}
        items += d.get("items") or []
        page += 1
    return items


def _salveaza_da(db, ca_id, it):
    fcui, fnume = cui_si_nume(it.get("supplier"))
    db.execute("INSERT OR REPLACE INTO sicap_da VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (
        it["directAcquisitionId"], ca_id, it.get("uniqueIdentificationCode"), it.get("directAcquisitionName"),
        it.get("cpvCode"), (it.get("publicationDate") or "")[:10] or None, (it.get("finalizationDate") or "")[:10] or None,
        fnume, fcui, it.get("estimatedValueRon"), it.get("closingValue"), _txt(it.get("sysDirectAcquisitionState")),
        json.dumps(it, ensure_ascii=False)))


def _salveaza_cn(db, ca_id, it):
    db.execute("INSERT OR REPLACE INTO sicap_cn VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
        it["cNoticeId"], ca_id, it.get("noticeNo"), it.get("contractTitle"), _txt(it.get("sysProcedureType")),
        _txt(it.get("sysAcquisitionContractType")), it.get("cpvCodeAndName"), it.get("estimatedValueRon"),
        (it.get("noticeStateDate") or "")[:10] or None, _txt(it.get("sysProcedureState")), int(bool(it.get("hasAppeal"))),
        json.dumps(it, ensure_ascii=False)))


def _salveaza_can(db, ca_id, it):
    db.execute("INSERT OR REPLACE INTO sicap_can VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
        it["caNoticeId"], ca_id, it.get("noticeNo"), it.get("contractTitle"), _txt(it.get("sysProcedureType")),
        _txt(it.get("sysAcquisitionContractType")), it.get("cpvCodeAndName"), it.get("ronContractValue"),
        it.get("lowestOfferValue"), it.get("highestOfferValue"), (it.get("noticeStateDate") or "")[:10] or None,
        json.dumps(it, ensure_ascii=False)))


def colecteaza(store, cl=None, tot=False, azi=None, cui_extra=(), termeni_extra=()):
    """tot=True: istoricul din 2018; altfel ultimele 90 de zile (incremental, zilnic).
    O instituție nouă (sau adăugată ulterior) își primește tot istoricul la prima rulare."""
    cl = cl or Client()
    db = store.db
    init(db)
    azi = azi or date.today()
    stats = {"autoritati": autoritati(store, cl, cui_extra=cui_extra, termeni_extra=termeni_extra),
             "da": 0, "cn": 0, "can": 0, "istoric_nou": 0}
    for ca in db.execute("SELECT id, istoric FROM sicap_ca WHERE inclus=1").fetchall():
        ca_id = ca["id"]
        complet = tot or not ca["istoric"]
        stats["istoric_nou"] += int(complet and not tot)
        d0 = START if complet else azi - timedelta(days=90)
        # an cu an: ferestre mici, ușor de reluat
        y = d0.year
        while y <= azi.year:
            a, b = max(d0, date(y, 1, 1)), min(azi, date(y, 12, 31))
            for it in _ferestre(cl, "/api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/",
                                {"showOngoingDa": False, "cookieContext": None, "sysDirectAcquisitionStateId": None,
                                 "contractingAuthorityId": ca_id},
                                "finalizationDateStart", "finalizationDateEnd", a, b, stats):
                _salveaza_da(db, ca_id, it)
                stats["da"] += 1
            for it in _ferestre(cl, "/api-pub/NoticeCommon/GetCNoticeList/",
                                {"sysNoticeTypeIds": [2, 6, 7, 17], "sortProperties": [], "hasUnansweredQuestions": False,
                                 "contractingAuthorityId": ca_id},
                                "startPublicationDate", "endPublicationDate", a, b, stats):
                _salveaza_cn(db, ca_id, it)
                stats["cn"] += 1
            for it in _ferestre(cl, "/api-pub/NoticeCommon/GetCANoticeList/",
                                {"sysNoticeTypeIds": [3, 13, 18], "sortProperties": [], "contractingAuthorityId": ca_id},
                                "startPublicationDate", "endPublicationDate", a, b, stats):
                _salveaza_can(db, ca_id, it)
                stats["can"] += 1
            db.commit()
            y += 1
        if complet:
            db.execute("UPDATE sicap_ca SET istoric=? WHERE id=?", (azi.isoformat(), ca_id))
            db.commit()
    stats["cereri"] = cl.cereri
    return stats


# ---------- câștigătorii licitațiilor (contractele din anunțurile de atribuire) ----------

# Lista de anunțuri de atribuire nu spune cine a câștigat. Pagina publică a anunțului își încarcă
# contractele printr-o cerere separată, definită într-un modul încărcat la cerere
# (views/pub/notices/ca-notice/service.js). Calea exactă o citim din acel modul; dacă nu reușim,
# încercăm căile probabile, în ordine.
CAI_CONTRACTE = [
    ("POST", "/api-pub/C_PUBLIC_CANotice/GetCANoticeContracts/"),
    ("POST", "/api-pub/PUBLICCANotice/GetCANoticeContracts/"),
    ("POST", "/api-pub/CANoticeCommon/GetCANoticeContracts/"),
    ("POST", "/api-pub/NoticeCommon/GetCANoticeContracts/"),
]


def _corp_contracte(can_id, skip=0, take=50):
    gol = {"from": None, "to": None}
    return {"caNoticeId": can_id, "contractNo": None, "winnerTitle": None, "winnerFiscalNumber": None,
            "contractDate": dict(gol), "contractValue": dict(gol), "contractMinOffer": dict(gol),
            "contractMaxOffer": dict(gol), "contractTitle": None, "lots": None, "sortOrder": [],
            "sysContractFrameworkType": {}, "skip": skip, "take": take}


def cai_din_modul(js):
    """Calea cererii GetCANoticeContracts din codul modulului SICAP: [(metodă, cale)]."""
    out = []
    for m in re.finditer(r'GetCANoticeContracts\s*=\s*function\s*\(\w*\)\s*\{\s*return\s+this\.(POST|GET)\(\s*'
                         r'this\.(\w+)\s*\+\s*"(/?GetCANoticeContracts/?)"', js):
        b = re.search(r'this\.%s\s*=\s*"([^"]+)"' % re.escape(m.group(2)), js)
        if b:
            out.append((m.group(1), "/" + b.group(1).strip("/") + "/" + m.group(3).strip("/") + "/"))
    return out


def _cere_contracte(cl, metoda, cale, can_id, skip=0):
    corp = _corp_contracte(can_id, skip)
    return cl.post(cale, corp) if metoda == "POST" else cl.get(cale, corp)


def _gaseste_calea(cl, db, can_id):
    """Prima cale care întoarce o listă de contracte pentru un anunț de atribuire; o ține minte."""
    r = db.execute("SELECT v FROM sicap_meta WHERE k='cale_contracte'").fetchone()
    if r:
        return json.loads(r["v"])
    cand = []
    for suf in (".min.js", ".js"):
        try:
            cand += cai_din_modul(cl.text("/views/pub/notices/ca-notice/service" + suf))
        except Exception as e:
            log.info("modulul SICAP %s: %s", suf, e)
    for metoda, cale in cand + [c for c in CAI_CONTRACTE if c not in cand]:
        try:
            d = _cere_contracte(cl, metoda, cale, can_id)
        except Exception as e:
            log.info("SICAP %s: %s", cale, e)
            continue
        if isinstance(d, dict) and isinstance(d.get("items"), list):
            db.execute("INSERT OR REPLACE INTO sicap_meta VALUES ('cale_contracte', ?)", (json.dumps([metoda, cale]),))
            db.commit()
            return [metoda, cale]
    return None


def _castigatori(it):
    """[(nume, cui)] din înregistrarea unui contract, oricum ar fi numite câmpurile."""
    gasite = []

    def walk(o, cheie=""):
        if isinstance(o, dict):
            nume = cui = None
            for k, v in o.items():
                kl = k.lower()
                if isinstance(v, (str, int)) and v not in ("", None):
                    if re.search(r"fiscal|cif|cui|taxcode", kl):
                        cui = re.sub(r"\D", "", str(v)) or None
                    elif re.search(r"name|title|denumire|nume", kl) and re.search(r"winner|supplier|contractor|entity|ofertant", (cheie + kl)):
                        nume = str(v)
            if nume or (cui and re.search(r"winner|supplier|contractor|ofertant", cheie.lower())):
                gasite.append((nume, cui))
            for k, v in o.items():
                if isinstance(v, (dict, list)):
                    walk(v, k)
        elif isinstance(o, list):
            for v in o:
                if isinstance(v, str) and re.search(r"winner|supplier|castig", cheie.lower()):
                    c, n = cui_si_nume(v)
                    gasite.append((n, c))
                else:
                    walk(v, cheie)

    walk(it)
    # câmpuri plate pe contract: winnerTitle / winnerFiscalNumber, supplierName / supplierCif
    flat_n = it.get("winnerCaption") or it.get("winnerTitle") or it.get("winnerName") or it.get("supplierName") or it.get("winner")
    flat_c = it.get("winnerFiscalNumber") or it.get("supplierCif") or it.get("winnerCif")
    if isinstance(flat_n, str) and flat_n:
        c, n = cui_si_nume(flat_n)
        gasite.insert(0, (n, re.sub(r"\D", "", str(flat_c)) if flat_c else c))
    out, vazute = [], set()
    for n, c in gasite:
        k = (c or "", _n(n or ""))
        if k not in vazute and (n or c):
            vazute.add(k)
            out.append((n, c))
    return out


def _num(v):
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, dict):
        for k in ("ronValue", "value", "amount", "valoare"):
            if isinstance(v.get(k), (int, float)):
                return float(v[k])
    return None


def salveaza_contracte(db, can_id, items):
    n = 0
    for k, it in enumerate(items):
        cid = it.get("caNoticeContractId") or it.get("contractId") or it.get("id")
        cast = _castigatori(it)
        val = None
        for key in ("contractValue", "ronContractValue", "contractValueRon", "value", "closingValue"):
            val = _num(it.get(key))
            if val is not None:
                break
        tip = it.get("contractType")
        db.execute("INSERT OR REPLACE INTO sicap_contract VALUES (?,?,?,?,?,?,?,?,?,?)", (
            str(cid if cid is not None else f"{can_id}-{k}"), can_id,
            it.get("contractNo") or it.get("contractNumber"), (str(it.get("contractDate") or ""))[:10] or None,
            it.get("contractTitle") or it.get("title"), val,
            "; ".join(n for n, _ in cast if n) or None, (cast[0][1] if cast else None) or None,
            json.dumps(it, ensure_ascii=False), tip if isinstance(tip, int) else None))
        n += 1
    return n


def castigatori(store, cl=None, maxim=800, proba=None):
    """Contractele (cu câștigătorii) pentru anunțurile de atribuire încă neverificate, cele mai noi întâi.
    proba: listă în care se pun primele răspunsuri brute, pentru verificarea formatului."""
    cl = cl or Client()
    db = store.db
    init(db)
    rows = db.execute("SELECT c.id FROM sicap_can c JOIN sicap_ca a ON a.id=c.ca_id AND a.inclus=1 "
                      "LEFT JOIN sicap_can_verificat v ON v.can_id=c.id "
                      "WHERE v.can_id IS NULL OR (v.contracte < 0 AND v.la < date('now', '-7 day')) "
                      "ORDER BY c.data DESC LIMIT ?", (maxim,)).fetchall()
    st = {"de_verificat": len(rows), "verificate": 0, "contracte": 0, "erori": 0, "cale": None}
    if not rows:
        return st
    cale = _gaseste_calea(cl, db, rows[0]["id"])
    st["cale"] = cale
    if not cale:
        st["eroare"] = "nu am găsit cererea pentru contractele anunțului"
        return st
    for r in rows:
        try:
            items, skip = [], 0
            while True:
                d = _cere_contracte(cl, cale[0], cale[1], r["id"], skip) or {}
                lot = d.get("items") or []
                if proba is not None and len(proba) < 5:
                    proba.append({"can_id": r["id"], "raspuns": d})
                if (d.get("total") or 0) > 300:   # un anunț nu are sute de contracte: cererea nu filtrează
                    raise RuntimeError(f"răspuns nefiltrat ({d.get('total')} contracte)")
                items += lot
                skip += len(lot)
                if not lot or skip >= (d.get("total") or 0):
                    break
            n = salveaza_contracte(db, r["id"], items)
            db.execute("INSERT OR REPLACE INTO sicap_can_verificat VALUES (?,?,?,NULL)", (r["id"], date.today().isoformat(), n))
            st["verificate"] += 1
            st["contracte"] += n
        except Exception as e:   # se reîncearcă peste o săptămână
            st["erori"] += 1
            db.execute("INSERT OR REPLACE INTO sicap_can_verificat VALUES (?,?,-1,?)", (r["id"], date.today().isoformat(), str(e)[:200]))
            if st["erori"] >= 20 and not st["verificate"]:   # calea ținută minte nu mai merge: o căutăm din nou data viitoare
                db.execute("DELETE FROM sicap_meta WHERE k='cale_contracte'")
                db.commit()
                st["eroare"] = str(e)[:200]
                break
        db.commit()
    return st


# ---------- indicatori și export ----------

def prag_achizitie_directa(data_iso, cpv):
    """Pragul legal (lei, fără TVA) sub care se poate face achiziție directă (Legea 98/2016):
    135.060 / 450.200 lei (furnizare-servicii / lucrări) până la Legea 208/2022, apoi 270.120 / 900.400 lei."""
    lucrari = (cpv or "").startswith("45")
    if (data_iso or "") >= "2022-07-14":
        return 900400 if lucrari else 270120
    return 450200 if lucrari else 135060


def semnale_divizare(acte):
    """Același furnizor, aceeași categorie CPV (primele 3 cifre), același an, mai multe achiziții directe
    fiecare sub prag, dar cu suma peste prag. Nu e o constatare: e un caz de verificat (divizarea se judecă
    după necesarul estimat al autorității, nu doar după furnizor)."""
    grup = {}
    for a in acte:
        if not a.get("furnizor_cui") or not a.get("data_finalizare"):
            continue
        k = (a["data_finalizare"][:4], a["furnizor_cui"], (a.get("cpv") or "")[:3])
        grup.setdefault(k, []).append(a)
    out = []
    for (an, cui, cpv3), lst in grup.items():
        if len(lst) < 2:
            continue
        suma = sum(x.get("valoare") or 0 for x in lst)
        prag = prag_achizitie_directa(max(x["data_finalizare"] for x in lst), lst[0].get("cpv"))
        if suma > prag and all((x.get("valoare") or 0) < prag for x in lst):
            out.append({"an": an, "furnizor": lst[0].get("furnizor"), "furnizor_cui": cui, "cpv": lst[0].get("cpv"),
                        "nr": len(lst), "suma": round(suma, 2), "prag": prag, "ids": [x["id"] for x in lst]})
    return sorted(out, key=lambda x: -x["suma"])


NEREALIZATE = ("refuz", "respins", "anulat", "expirat", "retras", "neatribuit", "esuat", "renunt", "neaccept")


def realizata(stare):
    """O achiziție directă se socotește doar dacă s-a încheiat: „Condiții refuzate”, „Ofertă respinsă”,
    „Anulată” etc. nu înseamnă bani cheltuiți. O stare necunoscută sau lipsă se socotește încheiată."""
    s = _n(stare)
    return not any(k in s for k in NEREALIZATE)


def nivel_valoare(valoare, data_iso, cpv):
    """0 = obișnuită; 1 = peste pragul legal al achiziției directe chiar și cu TVA (19-21%) inclus;
    2 = peste de 10 ori pragul: aproape sigur o greșeală de introducere în SICAP (nu intră în totaluri)."""
    if not valoare:
        return 0
    prag = prag_achizitie_directa(data_iso, cpv)
    if valoare > 10 * prag:
        return 2
    return 1 if valoare > prag * 1.21 else 0


def _cpv(s):
    return re.sub(r"\s*\(Rev\.\d\)\s*$", "", (s or "").strip())


def _rezerva_curs(db):
    """Cursul EUR/RON pe ani, din SICAP (valoarea estimată în RON și în euro), pentru când BNR lipsește."""
    pe_an = {}
    for r in db.execute("SELECT data_finalizare, json FROM sicap_da"):
        try:
            j = json.loads(r["json"] or "{}")
            ron, alt = j.get("estimatedValueRon"), j.get("estimatedValueOtherCurrency")
            if ron and alt and ron > 100:
                k = ron / alt
                if 3.5 < k < 7:
                    pe_an.setdefault((r["data_finalizare"] or "")[:4], []).append(k)
        except (ValueError, TypeError, ZeroDivisionError):
            continue
    return {y: sorted(v)[len(v) // 2] for y, v in pe_an.items() if y}


def export(store, azi=None):
    """(rezumat, explorator) pentru date/sicap.json și date/sicap-explorer.json.

    Exploratorul are toate achizițiile tuturor instituțiilor, în formă compactă (rânduri cu
    indici în tabelele de instituții, furnizori și coduri CPV), ca pagina să poată filtra,
    grupa și desena graficele direct în browser."""
    from . import curs as curs_mod
    db = store.db
    init(db)
    curs = curs_mod.Curs(db, _rezerva_curs(db))
    azi = (azi or date.today()).isoformat()
    inst, inst_ix = [], {}
    for ca in db.execute("SELECT * FROM sicap_ca WHERE inclus=1 ORDER BY text"):
        cui, nume = cui_si_nume(ca["text"])
        inst_ix[ca["id"]] = len(inst)
        inst.append([ca["id"], nume or ca["text"], ca["cui"] or cui, grupa(nume or ca["text"])])
    furn, furn_ix, cpvs, cpv_ix = [], {}, [], {}

    def fx(cui, nume):
        k = cui or ("?" + (nume or ""))
        if k not in furn_ix:
            furn_ix[k] = len(furn)
            furn.append([cui or "", nume or ""])
        elif nume and not furn[furn_ix[k]][1]:
            furn[furn_ix[k]][1] = nume
        return furn_ix[k]

    def cx(c):
        c = _cpv(c)
        if c not in cpv_ix:
            cpv_ix[c] = len(cpvs)
            cpvs.append(c)
        return cpv_ix[c]

    da, cn, can = [], [], []
    stari, stari_ix = [], {}

    def sx(st):
        st = st or ""
        if st not in stari_ix:
            stari_ix[st] = len(stari)
            stari.append(st)
        return stari_ix[st]

    rez = {ca: {"da": 0, "cn": 0, "can": 0, "da_val": 0.0, "can_val": 0.0, "da_nerealizate": 0} for ca in inst_ix}
    ids = ",".join(str(int(x)) for x in inst_ix) or "NULL"
    # cele mai noi întâi: numele furnizorului rămâne cel mai recent
    for r in db.execute(f"SELECT * FROM sicap_da WHERE ca_id IN ({ids}) ORDER BY data_finalizare DESC, id DESC"):
        d = r["data_finalizare"] or (r["data_publicare"] or "")
        niv = nivel_valoare(r["valoare"], d, r["cpv"])
        ok = realizata(r["stare"])
        da.append([r["id"], inst_ix[r["ca_id"]], d, fx(r["furnizor_cui"], r["furnizor"]), cx(r["cpv"]),
                   r["valoare"], curs.eur(r["valoare"], d), r["nume"] or "", r["cod"] or "", niv,
                   sx(r["stare"]), int(ok)])
        if not ok:
            rez[r["ca_id"]]["da_nerealizate"] += 1
            continue
        rez[r["ca_id"]]["da"] += 1
        if niv < 2:
            rez[r["ca_id"]]["da_val"] += r["valoare"] or 0
    if inst_ix:
        contracte = {}
        for c in db.execute("SELECT * FROM sicap_contract ORDER BY can_id, data, id"):
            contracte.setdefault(c["can_id"], []).append(c)
        for r in db.execute(f"SELECT * FROM sicap_can WHERE ca_id IN ({ids}) ORDER BY data DESC, id DESC"):
            ct = [c for c in contracte.get(r["id"], []) if c["valoare"]]
            if ct:   # cu contractele cunoscute: câte un rând pe contract, cu câștigătorul lui
                for c in ct:
                    dc = c["data"] or r["data"] or ""
                    tip = c["tip"] or 1
                    can.append([r["id"], inst_ix[r["ca_id"]], dc, cx(r["cpv"]), c["valoare"], curs.eur(c["valoare"], dc),
                                c["titlu"] or r["titlu"] or "", r["nr"] or "", r["procedura"] or "", r["tip_contract"] or "",
                                fx(c["castigator_cui"], c["castigator"]) if (c["castigator"] or c["castigator_cui"]) else -1,
                                c["nr"] or "", tip])
                    if tip != 2:   # acordul-cadru e valoarea maximă; banii se văd în contractele subsecvente
                        rez[r["ca_id"]]["can_val"] += c["valoare"] or 0
            else:
                try:
                    atr = _txt(json.loads(r["json"] or "{}").get("sysContractAssigmentType")) or ""
                except ValueError:
                    atr = ""
                tip = 2 if "acord" in _n(atr) else 0
                can.append([r["id"], inst_ix[r["ca_id"]], r["data"] or "", cx(r["cpv"]), r["valoare"],
                            curs.eur(r["valoare"], r["data"]), r["titlu"] or "", r["nr"] or "", r["procedura"] or "",
                            r["tip_contract"] or "", -1, "", tip])
                if tip != 2:
                    rez[r["ca_id"]]["can_val"] += r["valoare"] or 0
            rez[r["ca_id"]]["can"] += 1
        for r in db.execute(f"SELECT * FROM sicap_cn WHERE ca_id IN ({ids}) ORDER BY data DESC, id DESC"):
            cn.append([r["id"], inst_ix[r["ca_id"]], r["data"] or "", cx(r["cpv"]), r["valoare_estimata"],
                       curs.eur(r["valoare_estimata"], r["data"]), r["titlu"] or "", r["nr"] or "",
                       r["procedura"] or "", r["stare"] or "", int(r["contestatie"] or 0)])
            rez[r["ca_id"]]["cn"] += 1
    excluse = [{"id": r["id"], "text": r["text"]} for r in db.execute(
        "SELECT id, text FROM sicap_ca WHERE inclus=0 ORDER BY text")]
    rezumat = {"generat_la": azi, "autoritati": [
        dict(id=i[0], nume=i[1], cui=i[2], **{k: round(v, 2) if isinstance(v, float) else v for k, v in rez[i[0]].items()})
        for i in inst], "excluse": excluse,
        "valori_de_verificat": sum(1 for x in da if x[9] and x[11]), "curs": curs.sursa,
        "contracte_cu_castigator": db.execute("SELECT COUNT(*) FROM sicap_contract WHERE castigator IS NOT NULL").fetchone()[0]}
    explorator = {"generat_la": azi, "curs": {"sursa": curs.sursa, "medii": curs.medii_anuale()},
                  "inst": inst, "furn": furn, "cpv": cpvs, "stari": stari, "da": da, "can": can, "cn": cn,
                  "coloane": {"da": ["id", "inst", "data", "furnizor", "cpv", "lei", "euro", "obiect", "cod", "nivel",
                                     "stare", "incheiata"],
                              "can": ["id", "inst", "data", "cpv", "lei", "euro", "obiect", "nr", "procedura", "tip",
                                      "castigator", "nr_contract", "fel_contract (1 contract, 2 acord-cadru, 3 subsecvent)"],
                              "cn": ["id", "inst", "data", "cpv", "lei_estimat", "euro", "obiect", "nr", "procedura",
                                     "stare", "contestatie"]}}
    return rezumat, explorator


def raport_de_verificat(expl):
    """Text simplu: autoritățile incluse, valorile neobișnuite și cei mai mari furnizori, cu linkuri SICAP."""
    inst, furn = expl["inst"], expl["furn"]
    out = [f"SICAP - de verificat ({expl['generat_la']}), curs: {expl['curs']['sursa']}", "",
           "Instituții incluse:"]
    out += [f"  {i[2]} {i[1]} (id {i[0]})" for i in inst]
    for niv, titlu in ((2, "Valori de peste 10 ori pragul legal (excluse din totaluri)"),
                       (1, "Achiziții directe peste pragul legal, chiar cu TVA inclus")):
        lst = sorted((x for x in expl["da"] if x[9] == niv and x[11]), key=lambda x: -(x[5] or 0))
        out += ["", f"{titlu}: {len(lst)}"]
        for x in lst[:200]:
            out.append(f"  {x[2]} | {x[5]:,.2f} lei | {furn[x[3]][1]} (CUI {furn[x[3]][0]}) | {inst[x[1]][1]} | "
                       f"{x[7][:80]} | {BASE}/pub/direct-acquisition/view/{x[0]}")
    ner = sorted((x for x in expl["da"] if not x[11]), key=lambda x: -(x[5] or 0))
    pe_stare = {}
    for x in ner:
        pe_stare[expl["stari"][x[10]]] = pe_stare.get(expl["stari"][x[10]], 0) + 1
    out += ["", f"Achiziții directe neîncheiate (nu intră în totaluri): {len(ner)} "
            + ", ".join(f"{k or 'fără stare'}: {v}" for k, v in sorted(pe_stare.items(), key=lambda t: -t[1]))]
    for x in ner[:50]:
        out.append(f"  {x[2]} | {x[5] or 0:,.2f} lei | {expl['stari'][x[10]]} | {furn[x[3]][1]} | {inst[x[1]][1]} | "
                   f"{BASE}/pub/direct-acquisition/view/{x[0]}")
    toate = {}
    for x in expl["da"]:
        toate[expl["stari"][x[10]]] = toate.get(expl["stari"][x[10]], 0) + 1
    out += ["", "Toate stările achizițiilor directe: " + ", ".join(f"{k or 'fără stare'}: {v}" for k, v in toate.items())]
    cc = [x for x in expl["can"] if x[10] >= 0]
    ac = [x for x in expl["can"] if x[12] == 2]
    out += ["", f"Contracte din licitații cu câștigător cunoscut: {len(cc)} din {len(expl['can'])} rânduri de atribuire",
            f"Acorduri-cadru (valoare maximă, nu intră în totaluri): {len(ac)}, în total {sum(x[4] or 0 for x in ac):,.2f} lei",
            f"Contracte și contracte subsecvente (intră în totaluri): {sum(1 for x in expl['can'] if x[12] != 2)}, "
            f"în total {sum(x[4] or 0 for x in expl['can'] if x[12] != 2):,.2f} lei"]
    tot = {}
    for x in expl["da"]:
        if x[9] < 2 and x[11]:
            tot[x[3]] = tot.get(x[3], 0) + (x[5] or 0)
    out += ["", "Cei mai mari furnizori (achiziții directe, fără valorile de peste 10 ori pragul):"]
    for f, v in sorted(tot.items(), key=lambda t: -t[1])[:30]:
        out.append(f"  {v:,.2f} lei | {furn[f][1]} (CUI {furn[f][0]})")
    return "\n".join(out) + "\n"
