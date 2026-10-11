"""Listele publice de documente (HCL, procese-verbale, registre de urbanism).

Pentru fiecare act: date de identificare, titlul publicat de primărie și
linkuri spre sursa originală (pagina de pe site și PDF-ul). Nu conține textul
documentelor: acesta poate include date personale, care nu se republică.
"""
from datetime import date


def _pdf_of(db, wp_id):
    r = db.execute("SELECT url, text_layer FROM documents WHERE wp_id=? ORDER BY rowid LIMIT 1",
                   (wp_id,)).fetchone()
    return (r["url"], r["text_layer"]) if r else (None, None)


def export(store, today=None):
    db = store.db
    links = {r["wp_id"]: r["link"] for r in db.execute("SELECT wp_id, link FROM posts")}
    text_layer = {r["url"]: r["text_layer"] for r in db.execute("SELECT url, text_layer FROM documents")}

    hcl = []
    for r in db.execute("SELECT year, number, adoption_date, title, origin, wp_id, posted, pdf_url "
                        "FROM hcl ORDER BY year DESC, number DESC"):
        tl = text_layer.get(r["pdf_url"])
        hcl.append({"an": r["year"], "nr": r["number"], "data": r["adoption_date"], "titlu": r["title"],
                    "postat": r["posted"], "pagina": links.get(r["wp_id"]), "pdf": r["pdf_url"],
                    "sursa": r["origin"], "scanat": None if tl is None else int(tl == 0)})

    pv = []
    for r in db.execute("SELECT wp_id, kind, session_type, session_date, hour, posted, title FROM pv "
                        "ORDER BY session_date DESC, wp_id DESC"):
        url, tl = _pdf_of(db, r["wp_id"])
        pv.append({"data": r["session_date"], "tip": r["session_type"], "fel": r["kind"], "ora": r["hour"],
                   "titlu": r["title"], "postat": r["posted"], "pagina": links.get(r["wp_id"]), "pdf": url,
                   "scanat": None if tl is None else int(tl == 0)})

    reg = []
    for r in db.execute("SELECT wp_id, kind, period_start, period_end, posted, title FROM registries "
                        "ORDER BY period_end DESC, kind"):
        url, _ = _pdf_of(db, r["wp_id"])
        reg.append({"tip": r["kind"], "de_la": r["period_start"], "pana_la": r["period_end"],
                    "titlu": r["title"], "postat": r["posted"], "pagina": links.get(r["wp_id"]), "pdf": url})

    return {"generat_la": (today or date.today()).isoformat(), "hcl": hcl, "pv": pv, "registre": reg}
