"""Colectarea propriu-zisă: postări din API + arhiva HCL de pe site-ul vechi."""
import logging
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


def collect_archive(store, client=None, years=None):
    """HCL 2013-2024 din paginile anuale ale arhivei (HTML, un PDF per hotărâre)."""
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
        items = parse.parse_archive_list(page, client.base, year)
        for it in items:
            store.add_document(it["url"], None, "arhiva", it["title"])
            store.upsert_hcl({**it, "origin": "arhiva", "pdf_url": it["url"]})
        store.db.commit()
        stats[year] = {"hcl": len(items), "probleme": sum(1 for i in items if i["issues"])}
    return stats


def discover(client=None):
    """Listează categoriile site-ului (pentru a adăuga surse noi în config)."""
    client = client or WPClient()
    return sorted(client.categories(), key=lambda c: -c.get("count", 0))


def started():
    return datetime.now().replace(microsecond=0).isoformat()
