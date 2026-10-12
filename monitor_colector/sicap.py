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
"""

# autorități din alte localități care conțin „Rădăuți” în nume
EXCLUSE = re.compile(r"radauti[\s\-]*prut", re.I)


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


# ---------- autoritățile contractante din Rădăuți ----------

def autoritati(store, cl, termeni=("RADAUTI", "RĂDĂUŢI", "RĂDĂUȚI"), cui_extra=()):
    db = store.db
    init(db)
    gasite = {}
    for t in list(termeni) + list(cui_extra):
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
        inclus = int(("radauti" in _n(text) or (cui and cui in cui_extra)) and not EXCLUSE.search(_n(text)))
        row = db.execute("SELECT inclus FROM sicap_ca WHERE id=?", (i,)).fetchone()
        if row is None:
            noi += 1
            db.execute("INSERT INTO sicap_ca VALUES (?,?,?,?,?)", (i, text, cui, inclus, date.today().isoformat()))
        else:
            db.execute("UPDATE sicap_ca SET text=?, cui=? WHERE id=?", (text, cui, i))
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


def colecteaza(store, cl=None, tot=False, azi=None, cui_extra=()):
    """tot=True: istoricul din 2018; altfel ultimele 90 de zile (incremental, zilnic)."""
    cl = cl or Client()
    db = store.db
    init(db)
    azi = azi or date.today()
    stats = {"autoritati": autoritati(store, cl, cui_extra=cui_extra), "da": 0, "cn": 0, "can": 0}
    d0 = START if tot else azi - timedelta(days=90)
    for ca in db.execute("SELECT id FROM sicap_ca WHERE inclus=1").fetchall():
        ca_id = ca["id"]
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
    stats["cereri"] = cl.cereri
    return stats


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


def export(store):
    """(rezumat, {ca_id: detalii}) pentru date/sicap.json și date/sicap/<id>.json."""
    db = store.db
    init(db)
    rezumat, detalii = {"autoritati": [], "generat_la": date.today().isoformat()}, {}
    for ca in db.execute("SELECT * FROM sicap_ca WHERE inclus=1 ORDER BY text"):
        da = [dict(r) for r in db.execute(
            "SELECT id, cod, nume, cpv, data_finalizare, furnizor, furnizor_cui, valoare, valoare_estimata "
            "FROM sicap_da WHERE ca_id=? ORDER BY data_finalizare DESC", (ca["id"],))]
        cn = [dict(r) for r in db.execute(
            "SELECT id, nr, titlu, procedura, tip_contract, cpv, valoare_estimata, data, stare, contestatie "
            "FROM sicap_cn WHERE ca_id=? ORDER BY data DESC", (ca["id"],))]
        can = [dict(r) for r in db.execute(
            "SELECT id, nr, titlu, procedura, tip_contract, cpv, valoare, oferta_min, oferta_max, data "
            "FROM sicap_can WHERE ca_id=? ORDER BY data DESC", (ca["id"],))]
        pe_ani = {}
        for a in da:
            y = (a["data_finalizare"] or "")[:4]
            p = pe_ani.setdefault(y, {"da_n": 0, "da_val": 0.0, "cn_n": 0, "cn_val": 0.0, "can_n": 0, "can_val": 0.0})
            p["da_n"] += 1
            p["da_val"] += a["valoare"] or 0
        for x, k in ((cn, "cn"), (can, "can")):
            for a in x:
                y = (a["data"] or "")[:4]
                p = pe_ani.setdefault(y, {"da_n": 0, "da_val": 0.0, "cn_n": 0, "cn_val": 0.0, "can_n": 0, "can_val": 0.0})
                p[k + "_n"] += 1
                p[k + "_val"] += (a.get("valoare") if k == "can" else a.get("valoare_estimata")) or 0
        furn = {}
        for a in da:
            if a["furnizor_cui"]:
                f = furn.setdefault(a["furnizor_cui"], {"nume": a["furnizor"], "cui": a["furnizor_cui"], "n": 0, "val": 0.0})
                f["n"] += 1
                f["val"] += a["valoare"] or 0
        cpv = {}
        for a in da:
            c = (a["cpv"] or "")
            k = c[:2] + "000000" if c else "necunoscut"
            cpv[k] = cpv.get(k, 0) + (a["valoare"] or 0)
        cui, nume = cui_si_nume(ca["text"])
        rez = {"id": ca["id"], "nume": nume or ca["text"], "cui": ca["cui"] or cui, "da": len(da), "cn": len(cn),
               "can": len(can), "pe_ani": {y: {k: round(v, 2) if isinstance(v, float) else v for k, v in p.items()}
                                           for y, p in sorted(pe_ani.items()) if y},
               "top_furnizori": sorted(furn.values(), key=lambda f: -f["val"])[:15],
               "cpv_valoare": dict(sorted(cpv.items(), key=lambda x: -x[1])[:12]),
               "semnale_divizare": semnale_divizare(da)[:50]}
        rezumat["autoritati"].append({k: rez[k] for k in ("id", "nume", "cui", "da", "cn", "can", "pe_ani")})
        detalii[ca["id"]] = dict(rez, lista_da=da, lista_cn=cn, lista_can=can)
    return rezumat, detalii
