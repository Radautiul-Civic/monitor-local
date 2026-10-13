"""Execuția bugetară a municipiului și a instituțiilor din Rădăuți.

Sursa: API-ul public al transparenta.eu (https://api.transparenta.eu/graphql), care preia datele
din portalul Transparență bugetară al Ministerului Finanțelor (raportările lunare ale instituțiilor,
prin Forexebug). Interogările sunt cele folosite chiar de paginile transparenta.eu (cod deschis,
github.com/ClaudiuBogdan/hack-for-facts-eb-client).

Ce aducem, pentru fiecare an:
  - pentru municipiu (CUI 4244148): veniturile și cheltuielile totale, plus fiecare rând din execuție
    (capitol funcțional, articol economic, funcționare sau dezvoltare), ca să vedem pe ce se cheltuie;
  - pentru celelalte instituții din oraș (subordonate și cele din SICAP): veniturile și cheltuielile totale.

Bugetul municipiului e raportat „agregat la nivel de ordonator principal”: include și instituțiile
finanțate prin primărie, deci nu se adună peste ele.
"""
import json
import logging
import re
import time
import unicodedata
from datetime import date

import requests

from . import config

log = logging.getLogger(__name__)

URL = "https://api.transparenta.eu/graphql"
CUI_MUNICIPIU = "4244148"
AN_START = 2016
SCHEMA = """
CREATE TABLE IF NOT EXISTS buget_entitate (cui TEXT PRIMARY KEY, nume TEXT, tip TEXT, raport TEXT, populatie INTEGER,
    sursa TEXT, json TEXT, actualizat_la TEXT);
CREATE TABLE IF NOT EXISTS buget_an (cui TEXT, an INTEGER, venituri REAL, cheltuieli REAL, PRIMARY KEY (cui, an));
CREATE TABLE IF NOT EXISTS buget_rand (cui TEXT, an INTEGER, categorie TEXT, cod_functional TEXT, nume_functional TEXT,
    cod_economic TEXT, nume_economic TEXT, fel TEXT, sursa_finantare INTEGER, suma REAL);
CREATE INDEX IF NOT EXISTS buget_rand_ix ON buget_rand (cui, an);
"""

Q_ENTITATE = """
query E($cui: ID!) {
  entity(cui: $cui) {
    cui name default_report_type entity_type is_uat
    uat { name population county_name }
    children { cui name }
    parents { cui name }
  }
}"""

Q_TREND = """
query T($cui: ID!, $trend: ReportPeriodInput!, $reportType: ReportType, $normalization: Normalization, $currency: Currency, $inflation_adjusted: Boolean) {
  entity(cui: $cui) {
    incomeTrend(period: $trend, reportType: $reportType, normalization: $normalization, currency: $currency, inflation_adjusted: $inflation_adjusted) { data { x y } }
    expensesTrend(period: $trend, reportType: $reportType, normalization: $normalization, currency: $currency, inflation_adjusted: $inflation_adjusted) { data { x y } }
  }
}"""

Q_RANDURI = """
query R($cui: ID!, $reportPeriod: ReportPeriodInput!, $reportType: ReportType, $normalization: Normalization, $currency: Currency, $inflation_adjusted: Boolean) {
  entity(cui: $cui) {
    ch: executionLineItems(filter: { account_category: ch, report_period: $reportPeriod, report_type: $reportType, normalization: $normalization, currency: $currency, inflation_adjusted: $inflation_adjusted }, sort: { by: "amount", order: "DESC" }, limit: 15000) {
      nodes { account_category funding_source_id expense_type functionalClassification { functional_name functional_code } economicClassification { economic_name economic_code } ytd_amount }
    }
    vn: executionLineItems(filter: { account_category: vn, report_period: $reportPeriod, report_type: $reportType, normalization: $normalization, currency: $currency, inflation_adjusted: $inflation_adjusted }, sort: { by: "amount", order: "DESC" }, limit: 15000) {
      nodes { account_category funding_source_id expense_type functionalClassification { functional_name functional_code } economicClassification { economic_name economic_code } ytd_amount }
    }
  }
}"""

Q_CAUTA = """
query S($filter: EntityFilter, $limit: Int) {
  entities(filter: $filter, limit: $limit) { nodes { cui name entity_type is_uat uat { name county_name } } }
}"""

NORMARE = {"normalization": "total", "currency": "RON", "inflation_adjusted": False}


def init(db):
    db.executescript(SCHEMA)


def _n(s):
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


class Client:
    def __init__(self, session=None, delay=1.0):
        self.s = session or requests.Session()
        if not session:
            self.s.headers.update({"User-Agent": config.USER_AGENT, "Content-Type": "application/json",
                                   "Accept": "application/json"})
        self.delay, self._t, self.cereri = delay, 0.0, 0

    def q(self, query, variables):
        for i in range(3):
            w = self.delay - (time.monotonic() - self._t)
            if w > 0:
                time.sleep(w)
            self._t = time.monotonic()
            self.cereri += 1
            try:
                r = self.s.post(URL, data=json.dumps({"query": query, "variables": variables}), timeout=120)
                d = r.json()
                if d.get("errors"):
                    raise ValueError("; ".join(str(e.get("message")) for e in d["errors"])[:300])
                r.raise_for_status()
                return d.get("data") or {}
            except ValueError:
                raise
            except requests.RequestException:
                if i == 2:
                    raise
                time.sleep(5 * (i + 1))
        return {}


def perioada_ani(a0, a1):
    return {"type": "YEAR", "selection": {"interval": {"start": str(a0), "end": str(a1)}}}


def perioada_an(an):
    return {"type": "YEAR", "selection": {"dates": [str(an)]}}


def _serie(s):
    out = {}
    for p in (s or {}).get("data") or []:
        try:
            out[int(str(p["x"])[:4])] = float(p["y"])
        except (KeyError, TypeError, ValueError):
            continue
    return out


def entitati(db, cl):
    """Municipiul, instituțiile lui (copiii din raportări), instituțiile din SICAP și cele găsite după „Rădăuți”."""
    cui = {CUI_MUNICIPIU: "municipiu"}
    d = cl.q(Q_ENTITATE, {"cui": CUI_MUNICIPIU}).get("entity") or {}
    for c in d.get("children") or []:
        cui.setdefault(str(c["cui"]), "subordonata")
    try:
        for r in db.execute("SELECT cui FROM sicap_ca WHERE inclus=1 AND cui IS NOT NULL"):
            cui.setdefault(str(r[0]), "sicap")
    except Exception:
        pass
    for t in ("RADAUTI", "RĂDĂUȚI"):
        try:
            for e in (cl.q(Q_CAUTA, {"filter": {"search": t}, "limit": 200}).get("entities") or {}).get("nodes") or []:
                n = _n(e.get("name"))
                if "radauti" in n and not re.search(r"radauti\W*prut|sucevei si radautilor", n) and not e.get("is_uat"):
                    cui.setdefault(str(e["cui"]), "cautare")
        except Exception as ex:
            log.warning("căutare transparenta.eu %s: %s", t, ex)
    return cui


def colecteaza(store, cl=None, azi=None, detaliat=(CUI_MUNICIPIU,)):
    """Totalurile pe ani pentru toate instituțiile; rândurile execuției pentru cele din `detaliat`."""
    db = store.db
    init(db)
    cl = cl or Client()
    azi = azi or date.today()
    st = {"entitati": 0, "cu_date": 0, "randuri": 0, "erori": {}}
    for cui, sursa in entitati(db, cl).items():
        try:
            e = cl.q(Q_ENTITATE, {"cui": cui}).get("entity")
            if not e:
                continue
            rt = e.get("default_report_type") or "PRINCIPAL_AGGREGATED"
            t = cl.q(Q_TREND, dict(NORMARE, cui=cui, trend=perioada_ani(AN_START, azi.year), reportType=rt)).get("entity") or {}
            ven, chel = _serie(t.get("incomeTrend")), _serie(t.get("expensesTrend"))
            st["entitati"] += 1
            if not (ven or chel):
                continue
            st["cu_date"] += 1
            uat = e.get("uat") or {}
            db.execute("INSERT OR REPLACE INTO buget_entitate VALUES (?,?,?,?,?,?,?,?)", (
                cui, e.get("name"), e.get("entity_type"), rt, uat.get("population"), sursa,
                json.dumps(e, ensure_ascii=False), azi.isoformat()))
            for an in sorted(set(ven) | set(chel)):
                db.execute("INSERT OR REPLACE INTO buget_an VALUES (?,?,?,?)", (cui, an, ven.get(an), chel.get(an)))
            if cui in detaliat:
                # anii încheiați se aduc o singură dată; anul curent (și cel trecut, până se închide) la fiecare rulare
                vechi = {r[0] for r in db.execute("SELECT DISTINCT an FROM buget_rand WHERE cui=?", (cui,))}
                for an in sorted(set(ven) | set(chel)):
                    if an in vechi and an < azi.year - 1:
                        continue
                    d = cl.q(Q_RANDURI, dict(NORMARE, cui=cui, reportPeriod=perioada_an(an), reportType=rt)).get("entity") or {}
                    db.execute("DELETE FROM buget_rand WHERE cui=? AND an=?", (cui, an))
                    for cat in ("vn", "ch"):
                        for x in ((d.get(cat) or {}).get("nodes") or []):
                            fc, ec = x.get("functionalClassification") or {}, x.get("economicClassification") or {}
                            db.execute("INSERT INTO buget_rand VALUES (?,?,?,?,?,?,?,?,?,?)", (
                                cui, an, cat, fc.get("functional_code"), fc.get("functional_name"), ec.get("economic_code"),
                                ec.get("economic_name"), x.get("expense_type"), x.get("funding_source_id"), x.get("ytd_amount")))
                            st["randuri"] += 1
            db.commit()
        except Exception as ex:
            st["erori"][cui] = str(ex)[:200]
            log.warning("buget %s: %s", cui, ex)
    st["cereri"] = getattr(cl, "cereri", None)
    return st


# capitolele clasificației funcționale (primele două cifre), cu nume scurte pentru grafice
CAPITOLE_CH = {"51": "Administrație publică", "54": "Alte servicii publice generale", "55": "Datoria publică (dobânzi și rate)",
               "56": "Transferuri între niveluri de administrație", "60": "Apărare", "61": "Ordine publică și siguranță",
               "65": "Învățământ", "66": "Sănătate", "67": "Cultură, sport, religie, recreere",
               "68": "Asistență socială", "70": "Locuințe, servicii și dezvoltare publică (iluminat, apă, drumuri locale)",
               "74": "Protecția mediului (salubritate, canalizare)", "80": "Acțiuni economice generale",
               "81": "Combustibili și energie (termoficare)", "83": "Agricultură, silvicultură",
               "84": "Transporturi (străzi, drumuri, transport public)", "87": "Alte acțiuni economice"}
CAPITOLE_VN = {"03": "Impozit pe venit", "04": "Cote și sume defalcate din impozitul pe venit",
               "07": "Impozite și taxe pe proprietate", "11": "Sume defalcate din TVA",
               "12": "Taxe pe servicii specifice", "15": "Taxe pe utilizarea bunurilor", "16": "Taxe pe utilizarea bunurilor (auto)",
               "18": "Alte impozite și taxe fiscale", "30": "Venituri din proprietate", "33": "Venituri din prestări servicii",
               "34": "Venituri din taxe administrative", "35": "Amenzi, penalități, confiscări", "36": "Diverse venituri",
               "37": "Transferuri voluntare", "39": "Venituri din valorificarea unor bunuri", "40": "Operațiuni financiare",
               "41": "Operațiuni financiare", "42": "Subvenții de la bugetul de stat", "43": "Subvenții de la alte administrații",
               "45": "Fonduri europene nerambursabile", "46": "Fonduri europene (perioada 2014-2020)",
               "48": "Fonduri europene nerambursabile", "50": "Fonduri externe nerambursabile"}


def _cap(cod, nume, tabel):
    c = re.sub(r"\D", "", str(cod or ""))[:2]
    return tabel.get(c) or (re.sub(r"\s+", " ", nume or "").strip()[:60] if nume else (f"Capitolul {c}" if c else "Neclasificat"))


# sursele de venit, grupate pentru graficul pe ani (după primele două cifre ale codului de venit)
SURSE = [("Impozite și taxe locale", ("07", "12", "15", "16", "18")),
         ("Cote din impozitul pe venit", ("03", "04")),
         ("Sume defalcate din TVA", ("11",)),
         ("Alte venituri proprii (chirii, servicii, amenzi)", ("30", "31", "33", "34", "35", "36", "37", "39")),
         ("Subvenții de la stat și alte bugete", ("42", "43")),
         ("Fonduri europene", ("45", "46", "48", "50", "56", "58")),
         ("Excedent din anii trecuți și alte operațiuni financiare", ("40", "41"))]
SURSA_IMPRUMUT = "Împrumuturi"


def sursa_venit(cod, nume):
    if _tragere(nume):
        return SURSA_IMPRUMUT
    c = re.sub(r"\D", "", str(cod or ""))[:2]
    for g, coduri in SURSE:
        if c in coduri:
            return g
    return "Alte venituri"


def _tragere(nume):
    """Rând de venit care e o tragere dintr-un împrumut (nu rambursarea unui împrumut acordat de municipiu)."""
    t = _n(nume)
    return bool(re.search(r"trager|incasari din imprumut|imprumuturi (interne|externe)|finantari rambursabile", t)) and \
        not re.search(r"rambursar|acordat", t)


def datorie(db, cui=CUI_MUNICIPIU):
    """Datoria municipiului, din execuția bugetară: pe ani, banii trași din împrumuturi (datorie nouă),
    ratele rambursate și dobânzile plătite. Soldul datoriei nu e raportat aici; se completează din
    documentele primăriei (config.DATORIE_SOLD)."""
    pe = {}
    for r in db.execute("SELECT an, categorie, cod_functional, nume_functional, cod_economic, nume_economic, suma "
                        "FROM buget_rand WHERE cui=?", (cui,)):
        a = pe.setdefault(str(r["an"]), {"trageri": 0.0, "rambursari": 0.0, "dobanzi": 0.0})
        s = r["suma"] or 0
        e = re.sub(r"\D", "", str(r["cod_economic"] or ""))[:2]
        if r["categorie"] == "ch":
            if e == "81":
                a["rambursari"] += s
            elif e == "30":
                a["dobanzi"] += s
        elif _tragere(f"{r['nume_functional'] or ''} {r['nume_economic'] or ''}"):
            a["trageri"] += s
    pe = {k: {x: round(v, 2) for x, v in a.items()} for k, a in sorted(pe.items()) if any(a.values())}
    return {"pe_ani": pe, "sold": getattr(config, "DATORIE_SOLD", {})}


def export(store):
    db = store.db
    init(db)
    ent = {}
    for r in db.execute("SELECT * FROM buget_entitate"):
        ent[r["cui"]] = {"cui": r["cui"], "nume": r["nume"], "sursa": r["sursa"], "populatie": r["populatie"],
                         "raport": r["raport"], "ani": {}}
    for r in db.execute("SELECT * FROM buget_an ORDER BY an"):
        if r["cui"] in ent:
            ent[r["cui"]]["ani"][str(r["an"])] = {"venituri": r["venituri"], "cheltuieli": r["cheltuieli"]}
    det = {}
    for r in db.execute("SELECT cui, an, categorie, cod_functional, nume_functional, cod_economic, nume_economic, fel, suma "
                        "FROM buget_rand"):
        d = det.setdefault(r["cui"], {}).setdefault(str(r["an"]), {"ch": {}, "vn": {}, "fel": {}, "economic": {}, "surse": {}, "dezv": {}})
        s = r["suma"] or 0
        if r["categorie"] == "ch":
            k = _cap(r["cod_functional"], r["nume_functional"], CAPITOLE_CH)
            d["ch"][k] = d["ch"].get(k, 0) + s
            f = {"dezvoltare": "Investiții (dezvoltare)", "functionare": "Funcționare"}.get(r["fel"] or "", "Nespecificat")
            d["fel"][f] = d["fel"].get(f, 0) + s
            if r["fel"] == "dezvoltare":   # pe ce s-a investit
                d["dezv"][k] = d["dezv"].get(k, 0) + s
            e = re.sub(r"\D", "", str(r["cod_economic"] or ""))[:2]
            ek = {"10": "Cheltuieli de personal", "20": "Bunuri și servicii", "30": "Dobânzi", "40": "Subvenții",
                  "50": "Fonduri de rezervă", "51": "Transferuri", "55": "Alte transferuri", "56": "Proiecte cu fonduri europene",
                  "57": "Asistență socială", "58": "Proiecte cu fonduri europene", "59": "Alte cheltuieli",
                  "70": "Investiții (active nefinanciare)", "71": "Investiții (active nefinanciare)",
                  "81": "Rambursări de credite"}.get(e, "Altele")
            d["economic"][ek] = d["economic"].get(ek, 0) + s
        else:
            k = _cap(r["cod_functional"], r["nume_functional"], CAPITOLE_VN)
            d["vn"][k] = d["vn"].get(k, 0) + s
            g = sursa_venit(r["cod_functional"], f"{r['nume_functional'] or ''} {r['nume_economic'] or ''}")
            d["surse"][g] = d["surse"].get(g, 0) + s
    for c in det.values():
        for a in c.values():
            for k in a:
                a[k] = {x: round(v, 2) for x, v in sorted(a[k].items(), key=lambda t: -t[1]) if v}
    return {"datorie": datorie(db), "generat_la": date.today().isoformat(), "sursa": "transparenta.eu (Transparență bugetară, Ministerul Finanțelor)",
            "municipiu": CUI_MUNICIPIU, "entitati": sorted(ent.values(), key=lambda e: (e["cui"] != CUI_MUNICIPIU, e["nume"] or "")),
            "detalii": det}
