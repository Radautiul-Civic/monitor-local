"""Registrele de urbanism (certificate de urbanism, autorizații de construire/desființare),
extrase din PDF-urile cu text publicate de primărie, rând cu rând.

Formate întâlnite:
  „nou”   (2026): tabel cu câte un rând pe act; antet pe un rând (Nr., Data, Solicitant, ...).
  „centralizator” (AC până în 2025): fiecare autorizație ocupă un bloc de rânduri; în aceeași
          coloană stau mai multe câmpuri unul sub altul (nr. autorizație / data / nr. cerere),
          deci le despărțim după poziția verticală în bloc.
Rezultatul e publicat integral, așa cum îl publică primăria.
"""
import json
import logging
import re
import time
import unicodedata

log = logging.getLogger(__name__)

VERSIUNE = 1   # se mărește când se schimbă extragerea, ca registrele să fie citite din nou

DATE_RE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b")


def _n(s):
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def _clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip() or None


def _spatiat(s):
    """„D e b r a n s a r e d e l a ...” (litere separate prin spații, așa cum apar în unele PDF-uri)."""
    tok = (s or "").split()
    return len(tok) >= 6 and sum(1 for t in tok if len(t) == 1) / len(tok) > 0.6


def _lipeste(s):
    return re.sub(r"(?<!\S)(\S) (?=\S(?:\s|$))", r"\1", s) if s else s


def _clean_join(parts):
    return _clean(" ".join(p for p in parts if p))


def _date(s):
    m = DATE_RE.search(s or "")
    if not m:
        return None
    d, mo, y = map(int, m.groups())
    if not (1 <= d <= 31 and 1 <= mo <= 12 and 1990 <= y <= 2100):
        return None
    return f"{y:04d}-{mo:02d}-{d:02d}"


def valoare(s):
    """„368.959,14” / „1286299,69 lei fara TVA” / „3740” -> float."""
    if not s:
        return None
    m = re.search(r"\d[\d.\s]*(?:,\d+)?", s.replace("\n", " "))
    if not m:
        return None
    t = m.group(0).replace(" ", "")
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    elif t.count(".") >= 1 and len(t.split(".")[-1]) == 3:
        t = t.replace(".", "")
    try:
        return float(t)
    except ValueError:
        return None


def strada(adresa):
    """Strada din adresă: „..., str. GHEORGHE LAZAR, nr. 33, ...” -> „Gheorghe Lazăr” (fără număr)."""
    if not adresa:
        return None
    m = re.search(r"\b(str|strada|calea|b-dul|bd|bulevardul|aleea|piata|piața|sos|șos)\.?\s+([^,;]+)", adresa, re.I)
    if not m:
        return None
    s = re.sub(r"\s+nr\.?.*$", "", m.group(2), flags=re.I).strip(" .")
    pref = {"calea": "Calea ", "aleea": "Aleea ", "piata": "Piața ", "piața": "Piața ",
            "b-dul": "Bulevardul ", "bd": "Bulevardul ", "bulevardul": "Bulevardul "}.get(m.group(1).lower(), "")
    if not s:
        return None
    t = s.title()
    t = re.sub(r"\b(Cel|De|Lui|Si|Și|La|Din|Al|A)\b", lambda m: m.group(1).lower(), t)
    return (pref + t[0].upper() + t[1:]).strip()


CATEGORII = [   # (categorie, cuvinte-cheie în scop / obiectiv), în ordinea priorității
    ("Debranșare de la termoficare", ("debransare",)),
    ("Desființare", ("desfiintare", "demolare")),
    ("Dezmembrare / alipire de teren", ("dezmembrare", "alipire", "dezlipire", "comasare", "parcelare", "lotizare")),
    ("Schimbare de destinație", ("schimbare destinatie", "schimbare de destinatie", "schimbarea destinatiei")),
    ("Clădiri și infrastructură publică", ("spital", "scoala", "gradinita", "liceu", "colegiu", "biserica",
                                           "uat ", "municipiul radauti", "strada ", "drum", "trotuar", "pod ",
                                           "iluminat", "parc ", "teren de sport", "sala de sport")),
    ("Locuințe", ("locuinta", "locuinte", "constr. loc", "casa ", "casa,", "mansardare", "etajare", "bloc de")),
    ("Industrie și depozitare", ("hala", "hale", "productie", "depozit", "atelier", "fabrica")),
    ("Comercial și servicii", ("comercial", "magazin", "spatiu", "hotel", "pensiune", "birou", "service", "cabinet",
                               "restaurant", "terasa", "reclam", "firma luminoasa", "statie", "benzinarie")),
    ("Racorduri și branșamente", ("racord", "bransament", "rebransare", "alimentare cu energie", "alimentare cu gaz",
                                  "alimentare cu apa", "extindere retea", "retea de", "retele", "post de transformare")),
    ("Reparații, extinderi, renovări", ("reparati", "extindere", "reabilitare", "modernizare", "renovare",
                                        "consolidare", "termoizolare", "anvelopare", "refacere", "acoperis", "invelitoare")),
    ("Anexe și împrejmuiri", ("anexa", "imprejmuire", "garaj", "magazie", "bucatarie de vara", "foisor", "gard")),
    ("Informare / vânzare / altele", ("informare", "vanzare", "cumparare", "notarial", "intabulare", "succesiune", "litigiu")),
]


def categorie(text):
    t = _n(text)
    for nume, keys in CATEGORII:
        if any(k in t for k in keys):
            return nume
    return "Altele"


def persoana_juridica(nume):
    t = _n(nume)
    return bool(re.search(r"\b(s\.?r\.?l|s\.?a\b|s\.?c\b|asociatia|fundatia|parohia|biserica|municipiul|uat|primaria|"
                          r"scoala|liceul|colegiul|gradinita|spitalul|directia|serviciul|compania|societatea|delgaz|"
                          r"e-?distributie|acet|regia|cooperativa|i\.?i\b|p\.?f\.?a|i\.?f\b)", t))


# ---------- formatul nou: un rând pe act ----------

CAMPURI_NOU = [   # (cheie, cuvinte din antet)
    ("nr", ("nr. cu", "nr.", "numar autori", "numar")),
    ("data", ("data",)),
    ("solicitant", ("solicitant",)),
    ("adresa", ("adresa",)),
    ("nr_cadastral", ("cadastral",)),
    ("carte_funciara", ("funciara",)),
    ("scop", ("scopul", "denumire obiectiv")),
    ("utilizabil", ("poate fi",)),
    ("valoare", ("valoare",)),
    ("sup_construita", ("construit",)),
    ("sup_desfasurata", ("desfasura",)),
    ("sup_utila", ("utila",)),
    ("sup_locuibila", ("locuibila",)),
]


def _map_header(row):
    idx = {}
    for i, cell in enumerate(row):
        h = _n((cell or "").replace("\n", " ")).replace("- ", "")
        h = re.sub(r"\s+", " ", h)
        hz = h.replace(" ", "")
        for key, words in CAMPURI_NOU:
            if key in idx:
                continue
            if any(w in h or w.replace(" ", "") in hz for w in words):
                if key == "nr" and ("cadastral" in h or "cam" in h):
                    continue
                if key == "data" and not h.startswith("data"):
                    continue
                idx[key] = i
                break
    return idx


def _tip_din_antet(cells):
    h = _n(" ".join(c or "" for c in cells))
    if "scopul" in h or "nr. cu" in h or "data cu" in h or "poate fi" in h:
        return "cu"
    if "autoriza" in h or "obiectiv" in h:
        return "ac"
    return None


def _parse_nou(tables):
    acte, idx, tipdet = [], None, None
    for tb in tables:
        for row in tb:
            cells = [c if c is not None else "" for c in row]
            if (not any(_date(c) for c in cells) and any("solicitant" in _n(c) for c in cells)
                    and any(_n(c).startswith("data") for c in cells)):
                idx = _map_header(cells)
                tipdet = _tip_din_antet(cells)
                continue
            if not idx or "data" not in idx:
                continue
            get = lambda k: _clean(cells[idx[k]]) if k in idx and idx[k] < len(cells) else None
            d = _date(get("data"))
            nr = get("nr")
            if not d:
                # rând de continuare (celulă ruptă între pagini): lipim textul la actul anterior
                if acte and any(_clean(c) for c in cells):
                    for k in ("solicitant", "adresa", "scop"):
                        v = get(k)
                        if v:
                            acte[-1][k] = _clean_join([acte[-1].get(k), v])
                continue
            a = {"nr": nr, "data": d, "tip_detectat": tipdet}
            for k in ("solicitant", "adresa", "scop", "utilizabil", "sup_construita", "sup_desfasurata",
                      "sup_utila", "sup_locuibila"):
                a[k] = get(k)
            cf = cells[idx["carte_funciara"]] if "carte_funciara" in idx else (cells[idx["nr_cadastral"]] if "nr_cadastral" in idx else "")
            cf = _clean(re.sub(r"-\s*\n\s*", "-", cf or ""))
            if cf:
                tok = []
                for t in re.sub(r"^CF:\s*", "", cf).replace(",", " ").split():
                    if t not in tok:
                        tok.append(t)
                a["cf_cadastral"] = ", ".join(tok) or None
            else:
                a["cf_cadastral"] = None
            a["valoare"] = valoare(get("valoare"))
            fara = lambda t: re.sub(r"\s+", "", _n(t or ""))
            if _spatiat(a.get("scop")):
                if a.get("utilizabil") and not _spatiat(a["utilizabil"]) and fara(a["utilizabil"]).startswith(fara(a["scop"])[:20]):
                    a["scop"] = a["utilizabil"]
                else:
                    a["scop"] = _lipeste(a["scop"])
            # coloana „poate fi / nu poate fi utilizat” repetă adesea scopul (defect al exportului)
            if a.get("utilizabil") and a.get("scop") and fara(a["utilizabil"]) == fara(a["scop"]):
                a["utilizabil"] = None
            # nota „Nu poate fi folosit / utilizat ...” e scrisă în continuarea scopului
            m = re.search(r"(?i)\bnu\s+poate\s+fi\s+(folosit|utilizat)", a.get("scop") or "")
            if m:
                a["utilizabil"] = a["scop"][m.start():].strip()
                a["scop"] = a["scop"][:m.start()].strip(" ,;.") or a["scop"]
            acte.append(a)
    return acte


# ---------- formatul „centralizator”: un bloc de rânduri pe act ----------

# coloană -> câmpuri în ordinea verticală din bloc (din antetul registrului)
SLOTURI_CENTRALIZATOR = {
    1: ["nr", "data", "nr_cerere"],
    2: ["solicitant"],
    3: ["adresa_beneficiar", "adresa"],
    4: ["scop", "structura"],
    5: ["regim_inaltime", "sup_construita", "sup_desfasurata", "sup_utila"],
    6: ["nr_camere", "nr_ap", "sup_locuibila", "dotari"],
    7: ["proiectant", "executant"],
    8: ["data_inceperii", "data_finalizarii", "data_expirarii"],
    9: ["valoare_initiala", "taxa", "valoare_finala", "taxa_diferenta"],
    10: ["observatii"],
}


def _parse_centralizator(page):
    acte = []
    for t in page.find_tables():
        rows = t.rows
        starts = []
        for i, r in enumerate(rows):
            c0 = r.cells[0]
            if c0 is None:
                continue
            txt = (page.crop(c0).extract_text() or "").strip()
            if re.fullmatch(r"\d{1,4}", txt):
                starts.append((i, int(txt)))
        for k, (i0, nrcrt) in enumerate(starts):
            i1 = starts[k + 1][0] if k + 1 < len(starts) else len(rows)
            top = rows[i0].bbox[1]
            bottom = rows[i1 - 1].bbox[3]
            h = max(bottom - top, 1)
            vals = {}
            for r in rows[i0:i1]:
                for ci, cell in enumerate(r.cells):
                    if cell is None or ci not in SLOTURI_CENTRALIZATOR:
                        continue
                    txt = _clean(page.crop(cell).extract_text())
                    if not txt:
                        continue
                    slots = SLOTURI_CENTRALIZATOR[ci]
                    mid = (cell[1] + cell[3]) / 2
                    s = min(len(slots) - 1, int((mid - top) / h * len(slots)))
                    vals.setdefault(slots[s], []).append(txt)
            a = {k2: _clean_join(v) for k2, v in vals.items()}
            a["nr_crt"] = nrcrt
            a["data"] = _date(a.get("data"))
            for k2 in ("data_inceperii", "data_finalizarii", "data_expirarii"):
                a[k2] = _date(a.get(k2))
            a["valoare"] = valoare(a.get("valoare_finala")) or valoare(a.get("valoare_initiala"))
            if a.get("data"):
                acte.append(a)
    return acte


def strada_centralizator(adresa, cunoscute):
    """„SUCEAVA, municipiul RĂDĂUŢI,RĂDĂUŢICA LARASI, Nr. 7” -> „Călărași” (dacă o știm din registrele noi)."""
    if not adresa:
        return None
    m = re.search(r"R[ĂA]D[ĂA]U[ŢȚT]I\s*,\s*R[ĂA]D[ĂA]U[ŢȚT]I\s*(.+?)\s*,\s*Nr", adresa, re.I)
    if not m:
        return None
    brut = m.group(1)
    cheie = re.sub(r"[^a-z0-9]", "", _n(brut))
    if cheie in cunoscute:
        return cunoscute[cheie]
    # cuvânt rupt la capăt de rând: un fragment de 1-2 litere se lipește de următorul („Ca Larasi”)
    tok = re.sub(r"\s+", " ", brut).strip().split(" ")
    out = []
    for t in tok:
        if out and len(out[-1]) <= 2 and out[-1].isalpha() and t[:1].isalpha():
            out[-1] += t
        else:
            out.append(t)
    return " ".join(out).title()


def parse_pdf(path):
    """Întoarce (format, listă de acte)."""
    import pdfplumber
    acte, fmt = [], None
    with pdfplumber.open(path) as pdf:
        first = (pdf.pages[0].extract_text() or "") if pdf.pages else ""
        t = _n(first)
        if "nr. aut" in t or ("centralizator" in t and "autoriza" in t):
            fmt = "centralizator"
        elif "centralizator" in t or "solicitant" not in t:
            fmt = "necunoscut"   # alt format (ex. certificate „centralizator”): nu ghicim coloanele
        else:
            fmt = "nou"
        if fmt == "necunoscut":
            return fmt, []
        if fmt == "nou":
            acte = _parse_nou([tb for p in pdf.pages for tb in p.extract_tables()])
        else:
            for p in pdf.pages:
                acte += _parse_centralizator(p)
    for a in acte:
        a["strada"] = strada(a.get("adresa")) if fmt == "nou" else None
        a["categorie"] = categorie(" ".join(x for x in (a.get("scop"), a.get("structura")) if x)
                                   + (" uat " if re.match(r"(?i)\s*(uat|municipiul)", a.get("solicitant") or "") else ""))
        a["pj"] = persoana_juridica(a.get("solicitant"))
    return fmt, acte


def repara_strazi(acte):
    """Completează strada actelor din „centralizator” cu forma corectă din registrele noi."""
    cunoscute = {}
    for a in acte:
        if a.get("strada"):
            cunoscute.setdefault(re.sub(r"[^a-z0-9]", "", _n(a["strada"])), a["strada"])
    for a in acte:
        if not a.get("strada") and a.get("format") == "centralizator":
            a["strada"] = strada_centralizator(a.get("adresa"), cunoscute)
    return acte


# ---------- integrarea în colector ----------

def _cheie(a):
    nr = (a.get("nr") or "").strip()
    return f"{nr}/{a.get('data')}" if nr else f"fn/{a.get('data')}/{_n(a.get('solicitant') or '')[:40]}"


def colecteaza(store, fortat=False):
    """Citește registrele CU/AC descărcate (PDF cu text) și salvează actele, fără dubluri.
    Registrele se suprapun; la același act rămâne varianta din registrul cel mai nou."""
    db = store.db
    stats = {"registre_citite": 0, "registre_sarite": 0, "scanate": 0, "acte": 0, "erori": 0, "formate": {},
             "pe_registru": []}
    rows = db.execute(
        "SELECT r.wp_id, r.kind, r.posted, d.url, d.local_path, d.sha256, d.text_layer FROM registries r "
        "JOIN documents d ON d.wp_id = r.wp_id WHERE d.local_path IS NOT NULL ORDER BY r.posted, r.wp_id").fetchall()
    toate = []
    for r in rows:
        if not r["local_path"].lower().endswith(".pdf"):
            continue
        if r["text_layer"] == 0:
            stats["scanate"] += 1   # registru scanat: îl lăsăm pentru o etapă ulterioară
            stats["pe_registru"].append(f"{r['kind']} SCANAT: {r['url'].rsplit('/', 1)[-1]}")
            continue
        prev = db.execute("SELECT sha256, versiune FROM urbanism_registre WHERE url=?", (r["url"],)).fetchone()
        if prev and prev["sha256"] == r["sha256"] and prev["versiune"] == VERSIUNE and not fortat:
            stats["registre_sarite"] += 1
            continue
        try:
            fmt, acte = parse_pdf(r["local_path"])
        except Exception as e:
            log.warning("registru %s: %s", r["url"], e)
            stats["erori"] += 1
            continue
        gresit = False
        for a in acte:
            det = a.pop("tip_detectat", None)
            tip = det or r["kind"]
            gresit = gresit or tip != r["kind"]
            a["format"], a["_tip"], a["_wp"], a["_pdf"] = fmt, tip, r["wp_id"], r["url"]
        if gresit:   # ex. registru de certificate publicat la autorizații
            stats.setdefault("registre_la_alta_categorie", []).append(r["url"])
        toate += acte
        stats["formate"][fmt] = stats["formate"].get(fmt, 0) + 1
        stats["pe_registru"].append(f"{r['kind']} {fmt} {len(acte)} acte: {r['url'].rsplit('/', 1)[-1]}")
        stats["registre_citite"] += 1
        db.execute("INSERT OR REPLACE INTO urbanism_registre VALUES (?,?,?,?,?,?)",
                   (r["url"], r["sha256"], VERSIUNE, fmt, len(acte), time.strftime("%Y-%m-%dT%H:%M:%S")))
    # străzile din formatul vechi se repară cu cele cunoscute (din toate actele salvate până acum)
    for row in db.execute("SELECT date_json FROM urbanism_acte"):
        toate.append(dict(json.loads(row[0]), _deja=True))
    repara_strazi(toate)
    for a in toate:
        if a.pop("_deja", False):
            continue
        tip, wp, pdf = a.pop("_tip"), a.pop("_wp"), a.pop("_pdf")
        db.execute("INSERT OR REPLACE INTO urbanism_acte VALUES (?,?,?,?,?,?,?,?)",
                   (tip, _cheie(a), a.get("data"), a.get("nr"), wp, pdf, a.get("format"),
                    json.dumps(a, ensure_ascii=False)))
        stats["acte"] += 1
    db.commit()
    return stats


CAMPURI_PUBLICE = ["nr", "data", "solicitant", "adresa", "adresa_beneficiar", "strada", "cf_cadastral", "scop",
                   "structura", "utilizabil", "categorie", "valoare", "valoare_initiala", "valoare_finala",
                   "regim_inaltime", "sup_construita", "sup_desfasurata", "sup_utila", "sup_locuibila", "nr_camere",
                   "nr_ap", "proiectant", "executant", "data_inceperii", "data_finalizarii", "data_expirarii",
                   "nr_cerere", "observatii", "pj"]


def export(store):
    """data/urbanism.json: toate actele, așa cum sunt publicate în registrele primăriei."""
    out = {"cu": [], "ac": []}
    links = {r["wp_id"]: r["link"] for r in store.db.execute("SELECT wp_id, link FROM posts")}
    for r in store.db.execute("SELECT tip, registru_wp_id, registru_pdf, date_json FROM urbanism_acte "
                              "ORDER BY data DESC, CAST(nr AS INTEGER) DESC"):
        a = json.loads(r["date_json"])
        x = {k: a[k] for k in CAMPURI_PUBLICE if a.get(k) not in (None, "", "/")}
        x["registru_pdf"], x["registru_pagina"] = r["registru_pdf"], links.get(r["registru_wp_id"])
        out.setdefault(r["tip"], []).append(x)
    return out


def indicatori(store):
    """Pe ani și luni, pe categorii, pe străzi; valoarea autorizată; observații despre registre."""
    res = {}
    for tip in ("cu", "ac"):
        acte = [json.loads(r[0]) for r in store.db.execute("SELECT date_json FROM urbanism_acte WHERE tip=?", (tip,))]
        if not acte:
            continue
        pe_luni, pe_ani, cat, str_, val = {}, {}, {}, {}, {}
        for a in acte:
            d = a.get("data") or ""
            pe_luni[d[:7]] = pe_luni.get(d[:7], 0) + 1
            pe_ani[d[:4]] = pe_ani.get(d[:4], 0) + 1
            an = d[:4]
            cat.setdefault(an, {})
            cat[an][a.get("categorie") or "Altele"] = cat[an].get(a.get("categorie") or "Altele", 0) + 1
            if a.get("strada"):
                str_[a["strada"]] = str_.get(a["strada"], 0) + 1
            if tip == "ac" and a.get("valoare"):
                val[an] = round(val.get(an, 0) + a["valoare"], 2)
        res[tip] = {
            "total": len(acte), "pe_ani": dict(sorted(pe_ani.items())), "pe_luni": dict(sorted(pe_luni.items())),
            "categorii_pe_ani": cat, "top_strazi": sorted(str_.items(), key=lambda x: -x[1])[:15],
            "persoane_juridice": sum(1 for a in acte if a.get("pj")),
        }
        if tip == "ac":
            res[tip]["valoare_pe_ani"] = dict(sorted(val.items()))
            res[tip]["fara_natura_constructiei"] = sum(1 for a in acte if a.get("format") == "centralizator" and not a.get("scop"))
        if tip == "cu":
            res[tip]["neutilizabile"] = sum(1 for a in acte if a.get("utilizabil"))
    return res
