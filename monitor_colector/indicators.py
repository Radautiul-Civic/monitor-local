"""Indicatori de transparență calculați din baza de date.

Fiecare indicator e o observație la o dată anume, nu o concluzie: raportul
indică mereu data calculului și sursa.
"""
import json
from collections import defaultdict
from datetime import date
from statistics import median


def _d(s):
    return date.fromisoformat(s[:10]) if s else None


def compute(store, today=None):
    today = today or date.today()
    db = store.db
    out = {"calculat_la": today.isoformat()}

    # --- HCL: întârzierea publicării pe site ---
    lags = defaultdict(list)
    slow = []
    for r in db.execute("SELECT year, number, adoption_date, posted FROM hcl "
                        "WHERE origin='site' AND adoption_date IS NOT NULL AND posted IS NOT NULL"):
        lag = (_d(r["posted"]) - _d(r["adoption_date"])).days
        if lag >= 0:
            lags[r["year"]].append(lag)
            slow.append((lag, r["year"], r["number"]))
    # Dacă peste jumătate din HCL-urile unui an au data postării egală cu data
    # adoptării, postările au fost cel mai probabil retrodatate (ex. la migrarea
    # site-ului): data postării nu măsoară publicarea reală, deci anul nu se afișează.
    out["hcl_intarziere_publicare"] = {
        str(y): {"hcl": len(v), "mediana_zile": median(v), "max_zile": max(v),
                 "fiabil": sum(1 for x in v if x == 0) <= len(v) / 2}
        for y, v in sorted(lags.items())}
    out["hcl_cele_mai_intarziate"] = [
        {"an": y, "nr": n, "zile": lag} for lag, y, n in sorted(slow, reverse=True)[:10]]

    # --- HCL: numere lipsă în secvența anuală ---
    gaps = {}
    for r in db.execute("SELECT year, MAX(number) AS mx, COUNT(*) AS c FROM hcl GROUP BY year"):
        nums = {x[0] for x in db.execute("SELECT number FROM hcl WHERE year=?", (r["year"],))}
        missing = [n for n in range(1, r["mx"] + 1) if n not in nums]
        # Un an cu acoperire sub 90% înseamnă că nu avem încă toate documentele
        # (limitare a colectorului, nu o constatare despre primărie): nu se publică.
        completa = r["c"] >= 0.9 * r["mx"]
        gaps[str(r["year"])] = {"ultimul_nr": r["mx"], "gasite": r["c"], "lipsa": missing[:50],
                                "lipsa_total": len(missing), "acoperire_completa": completa}
    out["hcl_numere_lipsa"] = gaps

    # --- HCL: probleme de publicare (fișiere greșite, numere neconcordante) ---
    # "nume_fisier_neparsabil" e o limitare tehnică a colectorului (ex. fișiere
    # SKM_*.pdf), nu o problemă a primăriei: se numără separat, nu se publică.
    TEHNICE = {"nume_fisier_neparsabil"}
    issues, tehnice = [], 0
    for r in db.execute("SELECT year, number, origin, pdf_url, issues FROM hcl WHERE issues != '[]'"):
        todas = json.loads(r["issues"])
        pr = [x for x in todas if x not in TEHNICE]
        if len(pr) != len(todas):
            tehnice += 1
        if pr:
            issues.append({"an": r["year"], "nr": r["number"], "sursa": r["origin"],
                           "probleme": pr, "pdf": r["pdf_url"]})
    out["hcl_probleme"] = issues
    out["hcl_diagnostic_nume_fisier"] = tehnice
    out["hcl_anonimizate"] = db.execute("SELECT COUNT(*) FROM hcl WHERE redacted=1").fetchone()[0]

    # --- Ședințe și PV-uri ---
    pv_lags, types = [], defaultdict(lambda: defaultdict(int))
    for r in db.execute("SELECT session_type, session_date, posted FROM pv WHERE kind='pv_sedinta'"):
        if r["session_date"] and r["posted"]:
            pv_lags.append((_d(r["posted"]) - _d(r["session_date"])).days)
        if r["session_date"]:
            types[r["session_date"][:4]][r["session_type"] or "necunoscut"] += 1
    out["pv_intarziere_publicare"] = (
        {"pv": len(pv_lags), "mediana_zile": median(pv_lags), "max_zile": max(pv_lags)} if pv_lags else None)
    out["sedinte_pe_tip"] = {y: dict(v) for y, v in sorted(types.items())}

    # --- Registre CU / AC: cât de vechi e ultima perioadă publicată ---
    reg = {}
    for kind in ("cu", "ac"):
        r = db.execute("SELECT MAX(period_end) FROM registries WHERE kind=?", (kind,)).fetchone()[0]
        reg[kind] = {"ultima_perioada_pana_la": r,
                     "zile_neacoperite": (today - _d(r)).days if r else None}
    out["registre_urbanism"] = reg

    # --- Contracte publicate pe site ---
    r = db.execute("SELECT MAX(date) FROM posts WHERE source='contracte'").fetchone()[0]
    out["contracte_site"] = {"ultima_postare": r[:10] if r else None,
                             "zile_de_la_ultima": (today - _d(r)).days if r else None}

    # --- Documente: cât e scanat (are nevoie de OCR) ---
    d = db.execute("SELECT COUNT(*), SUM(text_layer=1), SUM(text_layer=0), SUM(ocr_at IS NOT NULL) "
                   "FROM documents WHERE fetched_at IS NOT NULL").fetchone()
    out["documente"] = {"descarcate": d[0], "cu_text": d[1] or 0, "scanate": d[2] or 0, "ocr_facut": d[3] or 0}
    q = db.execute("SELECT SUM(fetched_at IS NULL), SUM(text_layer=0 AND ocr_at IS NULL), COUNT(*), "
                   "SUM(CASE WHEN text_layer=0 AND ocr_at IS NULL THEN pages END) FROM documents").fetchone()
    out["documente"].update(total=q[2], de_descarcat=q[0] or 0, de_ocr=q[1] or 0, pagini_de_ocr=q[3] or 0)
    pe_surse = {}
    for r in db.execute("SELECT COALESCE(p.source, d.origin) AS s, COUNT(*) AS n, "
                        "SUM(d.fetched_at IS NOT NULL) AS desc, SUM(d.text_layer=1) AS txt, "
                        "SUM(d.text_layer=0) AS scan, SUM(d.ocr_at IS NOT NULL) AS ocr "
                        "FROM documents d LEFT JOIN posts p ON p.wp_id = d.wp_id GROUP BY s ORDER BY n DESC"):
        pe_surse[r["s"]] = {"total": r["n"], "descarcate": r["desc"] or 0, "cu_text": r["txt"] or 0,
                            "scanate": r["scan"] or 0, "ocr_facut": r["ocr"] or 0}
    out["documente_pe_surse"] = pe_surse
    return out


def to_markdown(ind):
    L = [f"# Indicatori Monitor local - calculați la {ind['calculat_la']}", ""]
    L.append("## HCL - întârzierea publicării (zile de la adoptare la postare)")
    for y, v in ind["hcl_intarziere_publicare"].items():
        nf = "" if v.get("fiabil", True) else " - NEFIABIL (date de postare probabil retrodatate), nu se afișează"
        L.append(f"- {y}: {v['hcl']} HCL, mediană {v['mediana_zile']} zile, maxim {v['max_zile']} zile{nf}")
    L += ["", "## HCL - numere lipsă în secvență"]
    for y, v in ind["hcl_numere_lipsa"].items():
        if not v.get("acoperire_completa", True):
            L.append(f"- {y}: acoperire incompletă ({v['gasite']} din {v['ultimul_nr']}), nu se raportează lipsuri")
            continue
        extra = f" (ex. {', '.join(map(str, v['lipsa'][:10]))})" if v["lipsa_total"] else ""
        L.append(f"- {y}: ultimul nr. {v['ultimul_nr']}, găsite {v['gasite']}, lipsă {v['lipsa_total']}{extra}")
    L += ["", f"## HCL cu probleme de publicare: {len(ind['hcl_probleme'])}"]
    for p in ind["hcl_probleme"][:20]:
        L.append(f"- HCL {p['nr']}/{p['an']} ({p['sursa']}): {', '.join(p['probleme'])}")
    pv = ind["pv_intarziere_publicare"]
    L += ["", "## Procese-verbale"]
    L.append(f"- întârziere: mediană {pv['mediana_zile']} zile, maxim {pv['max_zile']} zile ({pv['pv']} PV)"
             if pv else "- fără date")
    for y, t in ind["sedinte_pe_tip"].items():
        L.append(f"- {y}: " + ", ".join(f"{k} {v}" for k, v in sorted(t.items())))
    L += ["", "## Registre urbanism"]
    for k, v in ind["registre_urbanism"].items():
        L.append(f"- {k.upper()}: ultima perioadă până la {v['ultima_perioada_pana_la']}, "
                 f"{v['zile_neacoperite']} zile neacoperite")
    c = ind["contracte_site"]
    L += ["", "## Contracte publicate pe site",
          f"- ultima postare: {c['ultima_postare']} ({c['zile_de_la_ultima']} zile)"]
    d = ind["documente"]
    L += ["", "## Documente",
          f"- total {d.get('total')}: descărcate {d['descarcate']} (cu text {d['cu_text']}, scanate {d['scanate']}, "
          f"OCR făcut {d['ocr_facut']})",
          f"- în coadă: de descărcat {d.get('de_descarcat')}, de OCR {d.get('de_ocr')} ({d.get('pagini_de_ocr')} pagini cunoscute)"]
    L += [f"- {k}: {v['total']} total, {v['descarcate']} descărcate, {v['cu_text']} cu text, "
          f"{v['scanate']} scanate, {v['ocr_facut']} OCR" for k, v in ind.get("documente_pe_surse", {}).items()]
    L.append(f"- diagnostic: {ind.get('hcl_diagnostic_nume_fisier', 0)} HCL cu nume de fișier necitit de parser")
    return "\n".join(L) + "\n"
