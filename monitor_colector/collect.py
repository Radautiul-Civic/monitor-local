"""Colectarea propriu-zisă: postări din API + arhiva HCL de pe site-ul vechi."""
import logging
import os
from datetime import datetime

from . import config, parse
from .wp import WPClient

log = logging.getLogger(__name__)


def _posted(post):
    return (post.get("date") or "")[:10] or None


def handle_post(store, source, post, base_url):
    """Salvează postarea, documentele ei și entitatea specifică sursei."""
    status = store.upsert_post(source, post)
    content = post["content"]["rendered"] if isinstance(post.get("content"), dict) else post.get("content", "")
    title = parse.clean_title(post["title"]["rendered"] if isinstance(post.get("title"), dict) else post.get("title"))
    docs = parse.extract_documents(content, base_url)
    for d in docs:
        store.add_document(d["url"], post["id"], "site", d["text"])

    if source == "hcl":
        h = parse.parse_hcl_post(title, post.get("slug"), docs)
        store.upsert_hcl({
            **h, "title": title, "origin": "site", "wp_id": post["id"],
            "posted": _posted(post), "pdf_url": docs[0]["url"] if docs else None,
        })
    elif source == "pv":
        store.upsert_pv(post["id"], parse.parse_pv(title), _posted(post), title)
    elif source in ("cu", "ac"):
        store.upsert_registry(post["id"], source, parse.parse_registry_period(title), _posted(post), title)
    return status


def collect_api(store, client=None, sources=None, full=False):
    client = client or WPClient()
    sources = sources or list(config.CATEGORIES)
    ids = client.category_ids([config.CATEGORIES[s] for s in sources])
    stats = {}
    for src in sources:
        slug = config.CATEGORIES[src]
        if slug not in ids:
            log.warning("categoria %s nu există pe site; o sar", slug)
            stats[src] = "categorie_lipsa"
            continue
        last = None if full else store.last_modified(src)
        # Reluăm de la începutul zilei ultimei modificări: salvarea e idempotentă,
        # iar așa nu pierdem postări modificate în aceeași secundă.
        since = last[:10] + "T00:00:00" if last else None
        counts = {"new": 0, "changed": 0, "same": 0}
        for post in client.posts(ids[slug], modified_after=since):
            counts[handle_post(store, src, post, client.base)] += 1
        store.db.commit()
        stats[src] = counts
        log.info("%s: %s", src, counts)
    return stats


def _save_raw(html_text, name):
    """Păstrează HTML-ul brut al paginilor de arhivă (pentru verificarea parserului)."""
    try:
        d = os.path.join(config.DATA_DIR, "raw")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, name), "w", encoding="utf-8") as f:
            f.write(html_text)
    except OSError as e:
        log.debug("nu pot salva %s: %s", name, e)


def collect_archive(store, client=None, years=None):
    """HCL 2013-2025 din paginile anuale ale arhivei (HTML, un PDF per hotărâre)."""
    client = client or WPClient(base_url=config.ARCHIVE_URL)
    stats = {}
    for year, path in sorted(config.ARCHIVE_HCL_PAGES.items()):
        if years and year not in years:
            continue
        try:
            page = client.get_html(path)
        except Exception as e:
            log.warning("arhiva %s: %s", year, e)
            stats[year] = f"eroare: {e}"
            continue
        _save_raw(page, f"arhiva-{year}.html")
        items = parse.parse_archive_list(page, client.base, year)
        for it in items:
            store.add_document(it["url"], None, "arhiva", it["title"])
            for extra in it.get("extra_urls", []):
                store.add_document(extra, None, "arhiva", it["title"] + " (anexă)")
            store.upsert_hcl({**it, "origin": "arhiva", "pdf_url": it["url"]})
        store.db.commit()
        stats[year] = {"hcl": len(items), "probleme": sum(1 for i in items if i["issues"])}
    return stats


def _sid(url):
    """ID negativ stabil pentru documentele din arhivă (care nu au ID WordPress)."""
    import zlib
    return -(zlib.crc32(url.encode("utf-8")) % 2_000_000_000) - 1


def _pseudo_post(store, sid, source, link, title):
    """Intrare în „posts” pentru un document din arhivă: leagă documentul de pagina-sursă."""
    from .store import now
    store.db.execute(
        "INSERT INTO posts (wp_id, source, slug, link, title, date, modified, categories, content_html, "
        "content_hash, first_seen, last_seen) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(wp_id) DO UPDATE SET link=excluded.link, title=excluded.title, last_seen=excluded.last_seen",
        (sid, source, None, link, title, None, None, "[]", "", "", now(), now()))


def collect_archive_lists(store, client=None):
    """Procesele-verbale 2015-2025 și registrele CU/AC 2015-2025 din arhiva site-ului vechi."""
    client = client or WPClient(base_url=config.ARCHIVE_URL)
    stats = {}
    # procese-verbale
    try:
        page = client.get_html(config.ARCHIVE_PV_PAGE)
        _save_raw(page, "arhiva-pv.html")
        link = client.base + config.ARCHIVE_PV_PAGE
        n = fara_data = 0
        for it in parse.parse_archive_links(page, client.base):
            pv = parse.parse_pv(it["text"])
            if not pv["session_date"]:
                fara_data += 1
                continue
            sid = _sid(it["url"])
            _pseudo_post(store, sid, "pv", link, it["text"])
            store.add_document(it["url"], sid, "arhiva", it["text"])
            store.upsert_pv(sid, pv, None, it["text"])
            n += 1
        store.db.commit()
        stats["pv"] = {"pv": n, "fara_data": fara_data}
    except Exception as e:
        log.warning("arhiva pv: %s", e)
        stats["pv"] = f"eroare: {e}"
    # registre de urbanism
    for kind, path in config.ARCHIVE_REGISTRE.items():
        try:
            page = client.get_html(path)
            _save_raw(page, f"arhiva-{kind}.html")
            link = client.base + path
            n = 0
            for it in parse.parse_archive_links(page, client.base):
                per = parse.parse_registry_period(it["text"])
                if not per["start"] and not per["end"]:
                    continue   # ex. „Documente necesare ...”
                sid = _sid(it["url"])
                _pseudo_post(store, sid, kind, link, it["text"])
                store.add_document(it["url"], sid, "arhiva", it["text"])
                store.upsert_registry(sid, kind, per, None, it["text"])
                n += 1
            store.db.commit()
            stats[kind] = n
        except Exception as e:
            log.warning("arhiva %s: %s", kind, e)
            stats[kind] = f"eroare: {e}"
    return stats


def discover(client=None):
    """Listează categoriile site-ului (pentru a adăuga surse noi în config)."""
    client = client or WPClient()
    return sorted(client.categories(), key=lambda c: -c.get("count", 0))


def started():
    return datetime.now().replace(microsecond=0).isoformat()
