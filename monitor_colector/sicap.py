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
        inclus = int(("radauti" in _n(text) or (cui and cui in cui_extra)) and not EXCLUSE.search(_n(text)))
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
        inst.append([ca["id"], nume or ca["text"], ca["cui"] or cui])
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
    rez = {ca: {"da": 0, "cn": 0, "can": 0, "da_val": 0.0, "can_val": 0.0} for ca in inst_ix}
    ids = ",".join(str(int(x)) for x in inst_ix) or "NULL"
    # cele mai noi întâi: numele furnizorului rămâne cel mai recent
    for r in db.execute(f"SELECT * FROM sicap_da WHERE ca_id IN ({ids}) ORDER BY data_finalizare DESC, id DESC"):
        d = r["data_finalizare"] or (r["data_publicare"] or "")
        niv = nivel_valoare(r["valoare"], d, r["cpv"])
        da.append([r["id"], inst_ix[r["ca_id"]], d, fx(r["furnizor_cui"], r["furnizor"]), cx(r["cpv"]),
                   r["valoare"], curs.eur(r["valoare"], d), r["nume"] or "", r["cod"] or "", niv])
        rez[r["ca_id"]]["da"] += 1
        if niv < 2:
            rez[r["ca_id"]]["da_val"] += r["valoare"] or 0
    if inst_ix:
        for r in db.execute(f"SELECT * FROM sicap_can WHERE ca_id IN ({ids}) ORDER BY data DESC, id DESC"):
            can.append([r["id"], inst_ix[r["ca_id"]], r["data"] or "", cx(r["cpv"]), r["valoare"],
                        curs.eur(r["valoare"], r["data"]), r["titlu"] or "", r["nr"] or "", r["procedura"] or "",
                        r["tip_contract"] or ""])
            rez[r["ca_id"]]["can"] += 1
            rez[r["ca_id"]]["can_val"] += r["valoare"] or 0
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
        "valori_de_verificat": sum(1 for x in da if x[9]), "curs": curs.sursa}
    explorator = {"generat_la": azi, "curs": {"sursa": curs.sursa, "medii": curs.medii_anuale()},
                  "inst": inst, "furn": furn, "cpv": cpvs, "da": da, "can": can, "cn": cn,
                  "coloane": {"da": ["id", "inst", "data", "furnizor", "cpv", "lei", "euro", "obiect", "cod", "nivel"],
                              "can": ["id", "inst", "data", "cpv", "lei", "euro", "obiect", "nr", "procedura", "tip"],
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
        lst = sorted((x for x in expl["da"] if x[9] == niv), key=lambda x: -(x[5] or 0))
        out += ["", f"{titlu}: {len(lst)}"]
        for x in lst[:200]:
            out.append(f"  {x[2]} | {x[5]:,.2f} lei | {furn[x[3]][1]} (CUI {furn[x[3]][0]}) | {inst[x[1]][1]} | "
                       f"{x[7][:80]} | {BASE}/pub/direct-acquisition/view/{x[0]}")
    tot = {}
    for x in expl["da"]:
        if x[9] < 2:
            tot[x[3]] = tot.get(x[3], 0) + (x[5] or 0)
    out += ["", "Cei mai mari furnizori (achiziții directe, fără valorile de peste 10 ori pragul):"]
    for f, v in sorted(tot.items(), key=lambda t: -t[1])[:30]:
        out.append(f"  {v:,.2f} lei | {furn[f][1]} (CUI {furn[f][0]})")
    return "\n".join(out) + "\n"
