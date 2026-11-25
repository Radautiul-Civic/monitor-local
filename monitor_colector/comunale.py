"""Documentele publicate de Servicii Comunale SA (serviciicomunale.ro): bilanțuri, rapoarte de audit, hotărâri AGA,
contracte, achiziții, regulamente, anunțuri despre termoficare și salubritate.

Site-ul e WordPress, deci se citește prin API-ul lui REST: toate articolele (cu textul și documentele legate), paginile
(„Termoficare”, „Salubritate”, „Despre”...) și biblioteca de fișiere încărcate (media), ca să prindem și documentele
care nu sunt legate din niciun articol. Totul intră în aceeași bază ca datele primăriei, cu sursa „comunale”, ca
descărcarea, extragerea textului, OCR-ul și sonda să meargă la fel.

ID-urile WordPress ale societății s-ar suprapune cu ale primăriei, așa că fiecare articol primește un ID negativ
stabil, din adresa lui (ca documentele din arhivă).

Documentele societății conțin uneori date personale (CNP, adresă, act de identitate: contractul de administrare,
hotărârile AGA, declarațiile de avere), deci rămân doar în zona internă: „comunale” e în config.SURSE_DOAR_INTERN, iar
lista lor se scrie în data/intern-date/comunale-documente.json.

  python -m monitor_colector.comunale            # colectare (tot site-ul, are doar câteva sute de articole și fișiere)
  python -m monitor_colector.comunale --lista    # doar lista pentru zona internă
"""
import argparse
import html
import json
import logging
import os
import re
import sys

from . import config
from .collect import _pseudo_post, _sid
from .parse import extract_documents

log = logging.getLogger("comunale")
BAZA = os.environ.get("MC_COMUNALE_URL", "https://www.serviciicomunale.ro")
SURSA = "comunale"
EXT = re.compile(r"\.(pdf|docx?|odt|xlsx?|ods|rtf|zip)(?:$|\?)", re.I)


def _text(h):
    """Textul unei bucăți de HTML, pe rânduri."""
    h = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", h or "")
    h = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</h\d>|</tr>", "\n", h)
    t = html.unescape(re.sub(r"<[^>]+>", " ", h))
    return "\n".join(" ".join(r.split()) for r in t.splitlines() if r.strip())


def _toate(cl, cale, campuri, extra=None):
    """Toate elementele unui tip din API (articole, pagini, media), pagină cu pagină."""
    page = 1
    while True:
        r = cl._get(cale, {"per_page": 100, "page": page, "_fields": campuri, **(extra or {})})
        if r is None:
            return
        try:
            items = r.json()
        except ValueError:
            log.warning("%s: răspunsul nu e JSON (pagina %s)", cale, page)
            return
        if not isinstance(items, list) or not items:
            return
        yield from items
        if page >= int(r.headers.get("X-WP-TotalPages", 1)):
            return
        page += 1


def _salveaza(store, sid, link, titlu, data, modificat, categorii, continut):
    _pseudo_post(store, sid, SURSA, link, titlu)
    store.db.execute("UPDATE posts SET date=?, modified=?, categories=?, content_html=?, slug=? WHERE wp_id=?",
                     (data, modificat, json.dumps(categorii, ensure_ascii=False), continut or "", "sc", sid))


def colecteaza(store, client=None):
    from .wp import WPClient
    cl = client or WPClient(base_url=BAZA)
    stats = {"articole": 0, "pagini": 0, "documente": 0, "media": 0, "media_noi": 0}
    try:
        cat = {c["id"]: c["name"] for c in cl.categories()}
    except Exception as e:   # noqa: BLE001
        log.warning("categoriile nu s-au putut citi: %s", e)
        cat = {}
    legate = set(r[0] for r in store.db.execute(
        "SELECT d.url FROM documents d JOIN posts p ON p.wp_id=d.wp_id WHERE p.source=? AND p.slug='sc'", (SURSA,)))

    def documente(sid, continut, link):
        n = 0
        for d in extract_documents(continut, link):
            store.add_document(d["url"], sid, SURSA, d["text"])
            legate.add(d["url"])
            n += 1
        # și imaginile mari (scanări puse ca imagine, nu ca PDF) nu le luăm: OCR-ul merge doar pe PDF
        return n

    for fel, cale in (("articole", "/wp-json/wp/v2/posts"), ("pagini", "/wp-json/wp/v2/pages")):
        try:
            for p in _toate(cl, cale, "id,date,modified,link,title,content,categories"):
                link = p.get("link") or f"{BAZA}/?p={p['id']}"
                sid = _sid("serviciicomunale:" + link)
                titlu = _text((p.get("title") or {}).get("rendered"))[:300] or link
                continut = (p.get("content") or {}).get("rendered") or ""
                _salveaza(store, sid, link, titlu, p.get("date"), p.get("modified"),
                          [cat.get(c, str(c)) for c in p.get("categories") or []] or ([] if fel == "articole" else ["Pagină"]), continut)
                stats[fel] += 1
                stats["documente"] += documente(sid, continut, link)
        except Exception as e:   # noqa: BLE001
            log.warning("%s: %s", cale, e)

    # biblioteca de fișiere: documentele care nu sunt legate din niciun articol
    try:
        for m in _toate(cl, "/wp-json/wp/v2/media", "id,date,modified,link,title,source_url,mime_type,post"):
            url = m.get("source_url") or ""
            if not EXT.search(url):
                continue
            stats["media"] += 1
            if url in legate:
                continue
            sid = _sid("serviciicomunale-media:" + url)
            titlu = _text((m.get("title") or {}).get("rendered"))[:300] or url.rsplit("/", 1)[-1]
            _salveaza(store, sid, m.get("link") or url, titlu, m.get("date"), m.get("modified"), ["Fișier încărcat (nelegat din articole)"], "")
            store.add_document(url, sid, SURSA, titlu)
            stats["media_noi"] += 1
    except Exception as e:   # noqa: BLE001
        log.warning("media: %s", e)
    store.db.commit()
    scrie_lista(store)
    return stats


def lista(db):
    """Documentele și articolele societății, cele mai noi primele (pentru zona internă)."""
    out = []
    for r in db.execute("SELECT wp_id, link, title, date, categories, content_html FROM posts WHERE source=? ORDER BY date DESC", (SURSA,)):
        docs = [{"url": d["url"], "titlu": d["link_text"] or d["url"].rsplit("/", 1)[-1], "pagini": d["pages"],
                 "text": bool(d["text_path"]), "scanat": d["text_layer"] == 0, "ocr": bool(d["ocr_at"])}
                for d in db.execute("SELECT url, link_text, pages, text_path, text_layer, ocr_at FROM documents WHERE wp_id=? ORDER BY rowid", (r["wp_id"],))]
        try:
            cats = json.loads(r["categories"] or "[]")
        except ValueError:
            cats = []
        txt = _text(r["content_html"])
        out.append({"titlu": r["title"], "data": (r["date"] or "")[:10] or None, "categorii": cats, "pagina": r["link"],
                    "rezumat": txt[:400], "documente": docs})
    return out


def scrie_lista(store, data_dir=config.DATA_DIR):
    d = os.path.join(data_dir, "intern-date")
    os.makedirs(d, exist_ok=True)
    x = lista(store.db)
    with open(os.path.join(d, "comunale-documente.json"), "w", encoding="utf-8") as f:
        json.dump({"sursa": BAZA, "articole": x}, f, ensure_ascii=False, separators=(",", ":"))
    return len(x)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="monitor_colector.comunale")
    ap.add_argument("--lista", action="store_true", help="doar refă lista pentru zona internă")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    from .store import Store
    st = Store(config.DB_PATH)
    if a.lista:
        print(scrie_lista(st))
        return 0
    print(json.dumps(colecteaza(st), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
