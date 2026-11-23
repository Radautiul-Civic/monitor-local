"""Declarațiile de avere și de interese ale consilierilor locali, puse lângă achizițiile din SICAP și registrele de urbanism.

DOAR PENTRU ZONA INTERNĂ (decizie 23.11.2026): rezultatul (intern-date/declaratii.json) nu se publică și nici textele
declarațiilor nu intră în indexul public de căutare. Potrivirile sunt automate, după numele firmelor citite din
declarații (OCR); nu înseamnă nereguli și se verifică întotdeauna în documente.
"""
import json
import os
import re

from .parse import norm
from .voturi import _tok

FORME = r"(?:s\.?\s?c\.?\s*)?"
JURIDIC = r"(s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?c\.?\s?s\.?)(?![a-z])"
NU_FIRMA = re.compile(r"\b(declarat|subsemnat|functi|consilier|calitat|unitat|denumir|adres|valoar|nr\b|numar|parti sociale|actiuni|"
                      r"semnatur|data complet|venit|banca|bancar|cont|depozit|credit|sold|asociat|actionar|membru|beneficiar|contract)", re.I)


def _nucleu(nume):
    """„S.C. BEST STYLE CONSTRUCT S.R.L.” -> „best style construct” (pentru comparare)."""
    t = norm(nume or "")
    t = re.sub(r"\b(s\.?\s?c\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|societatea|comerciala|companie)(?![a-z])", " ", t)
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return " ".join(w for w in t.split() if len(w) > 1)


def firme_din_text(text):
    """Numele de firme dintr-o declarație: secvențe urmate de forma juridică (SRL, SA, SNC, SCS), cu contextul lor."""
    t = norm(text or "")
    out, vazut = [], set()
    for m in re.finditer(r"([a-z0-9][a-z0-9&.\- \"„”']{2,60}?)[\s,.\"”]+" + JURIDIC, t):
        brut = m.group(1)
        # ce e după ultimul cuvânt-cheie de formular („denumirea”, „unitatea”...) sau după ghilimele/„s.c.”
        brut = re.split(r"(?:denumirea|unitatea|societatea|s\.?\s?c\.?)\s*[:\-–]?\s*|[\"„]", brut)[-1]
        n = _nucleu(brut)
        if len(n) < 3 or not re.search(r"[a-z]{3}", n) or NU_FIRMA.search(n) or len(n.split()) > 6:
            continue
        if n in vazut:
            continue
        vazut.add(n)
        out.append({"nume": (brut.strip(" .,-\"”„'") + " " + m.group(2)).upper(), "nucleu": n,
                    "context": re.sub(r"\s+", " ", t[max(0, m.start() - 120): m.end() + 120]).strip()})
    return out


def _consilier_din(text, url, link_text, cons):
    """Consilierul declarației: după numele din fișier/titlu sau „Subsemnatul/Subsemnata X”."""
    surse = [link_text or "", os.path.basename(url or "").replace("_", " ").replace("-", " ")]
    m = re.search(r"subsemnat\w*\s*,?\s*([a-zăâîșşțţ \-]{5,60}?)\s*,?\s*(?:avand|având|cu domiciliul|cnp|in calitate)", norm(text or "")[:3000])
    if m:
        surse.insert(0, m.group(1))
    for s in surse:
        tok = set(_tok(re.sub(r"([a-z])([A-Z])", r"\1 \2", s)))
        if not tok:
            continue
        best = None
        for c in cons:
            u = set(c["id"].split("-"))
            if len(u) >= 2 and u <= tok | {w for w in tok}:   # toate cuvintele numelui apar
                if not best or len(u) > len(best[1]):
                    best = (c["id"], u)
        if best:
            return best[0]
    return None


def scrie(store, data_dir):
    db = store.db
    try:
        with open(os.path.join(data_dir, "intern-date", "voturi.json"), encoding="utf-8") as f:
            cons = json.load(f).get("consilieri") or []
    except (OSError, ValueError):
        cons = []
    try:
        with open(os.path.join(data_dir, "componenta.json"), encoding="utf-8") as f:
            comp = json.load(f).get("consilieri") or []
    except (OSError, ValueError):
        comp = []
    url_cons = {}
    for x in comp:
        for d in (x.get("avere") or []) + (x.get("interese") or []):
            if x.get("id"):
                url_cons[d["url"]] = x["id"]
    # furnizorii SICAP și solicitanții persoane juridice din urbanism, după nucleul numelui
    sicap, urb = {}, {}
    try:
        with open(os.path.join(data_dir, "sicap-explorer.json"), encoding="utf-8") as f:
            sx = json.load(f)
        furn, inst = sx["furn"], sx["inst"]
        for r in sx.get("da") or []:
            if r[11] and r[9] < 2 and r[3] >= 0:
                n = _nucleu(furn[r[3]][1])
                g = sicap.setdefault(n, {"cui": furn[r[3]][0], "nume": furn[r[3]][1], "n": 0, "lei": 0.0, "inst": set()})
                g["n"] += 1; g["lei"] += r[5] or 0; g["inst"].add(inst[r[1]][1])
        for r in sx.get("can") or []:
            if r[10] >= 0 and r[12] != 2:
                n = _nucleu(furn[r[10]][1])
                g = sicap.setdefault(n, {"cui": furn[r[10]][0], "nume": furn[r[10]][1], "n": 0, "lei": 0.0, "inst": set()})
                g["n"] += 1; g["lei"] += r[4] or 0; g["inst"].add(inst[r[1]][1])
    except (OSError, ValueError, KeyError):
        pass
    try:
        with open(os.path.join(data_dir, "urbanism.json"), encoding="utf-8") as f:
            U = json.load(f)
        for t in ("ac", "cu"):
            for a in U.get(t) or []:
                if a.get("pj"):
                    urb.setdefault(_nucleu(re.split(r"\bprin\b", a.get("solicitant") or "", flags=re.I)[0]), []).append(
                        {"t": t, "nr": a.get("nr"), "data": a.get("data"), "strada": a.get("strada"), "scop": (a.get("scop") or "")[:160]})
    except (OSError, ValueError):
        pass

    pe_cons = {}
    rows = db.execute("SELECT d.url, d.link_text, d.text_path, p.source, p.title, p.date FROM documents d JOIN posts p ON p.wp_id=d.wp_id "
                      "WHERE p.source IN ('decl_avere_cl', 'decl_interese_cl') ORDER BY p.date DESC").fetchall()
    for url, lt, tp, src, ptitlu, pdata in rows:
        text = ""
        if tp:
            try:
                with open(tp, encoding="utf-8") as f:
                    text = f.read()
            except OSError:
                pass
        cid = url_cons.get(url) or _consilier_din(text, url, lt, cons)
        an = re.findall(r"\b(20[12]\d)\b", " ".join([lt or "", url, ptitlu or ""]))
        x = pe_cons.setdefault(cid or "?", {"id": cid, "declaratii": [], "firme": {}})
        x["declaratii"].append({"url": url, "fel": "avere" if src == "decl_avere_cl" else "interese", "an": max(an) if an else (pdata or "")[:4],
                                "titlu": (lt or ptitlu or "")[:200], "citita": bool(text)})
        for f in firme_din_text(text):
            g = x["firme"].setdefault(f["nucleu"], {"nume": f["nume"], "nucleu": f["nucleu"], "contexte": [], "declaratii": []})
            if len(g["contexte"]) < 3:
                g["contexte"].append(f["context"])
            g["declaratii"].append(url)
    out = []
    for cid, x in pe_cons.items():
        firme = []
        for n, g in x["firme"].items():
            s = sicap.get(n)
            u = urb.get(n) or []
            firme.append(dict(g, sicap={"cui": s["cui"], "nume": s["nume"], "n": s["n"], "lei": round(s["lei"], 2), "institutii": sorted(s["inst"])} if s else None,
                              urbanism=u[:20], urbanism_n=len(u)))
        firme.sort(key=lambda f: (not f["sicap"], not f["urbanism_n"], f["nume"]))
        nume = next((c["nume"] for c in cons if c["id"] == cid), None)
        out.append({"id": cid, "nume": nume, "declaratii": x["declaratii"], "firme": firme,
                    "potriviri": sum(1 for f in firme if f["sicap"] or f["urbanism_n"])})
    out.sort(key=lambda x: (-x["potriviri"], x["nume"] or "~"))
    os.makedirs(os.path.join(data_dir, "intern-date"), exist_ok=True)
    with open(os.path.join(data_dir, "intern-date", "declaratii.json"), "w", encoding="utf-8") as f:
        json.dump({"consilieri": out}, f, ensure_ascii=False, separators=(",", ":"))
    return {"declaratii": len(rows), "citite": sum(1 for r in rows if r[2]), "consilieri": len(out),
            "firme": sum(len(x["firme"]) for x in out), "cu_potriviri": sum(1 for x in out if x["potriviri"])}
