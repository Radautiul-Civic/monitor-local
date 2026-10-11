"""Client pentru API-ul REST WordPress al site-ului primăriei (/wp-json/wp/v2)."""
import time
import logging

import requests

from . import config

log = logging.getLogger(__name__)

POST_FIELDS = "id,date,date_gmt,modified,modified_gmt,slug,link,title,content,categories"


class WPClient:
    def __init__(self, base_url=config.BASE_URL, session=None, delay=config.REQUEST_DELAY,
                 timeout=config.TIMEOUT, retries=4):
        self.base = base_url.rstrip("/")
        self.s = session or requests.Session()
        self.s.headers.setdefault("User-Agent", config.USER_AGENT)
        self.delay = delay
        self.timeout = timeout
        self.retries = retries
        self._last = 0.0

    def _get(self, path, params=None):
        url = self.base + path
        for attempt in range(self.retries + 1):
            wait = self.delay - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            try:
                r = self.s.get(url, params=params, timeout=self.timeout)
            except requests.RequestException as e:
                if attempt == self.retries:
                    raise
                log.warning("eroare rețea %s (%s), reîncerc", url, e)
                time.sleep(2 ** attempt)
                continue
            if r.status_code in (429, 500, 502, 503, 504) and attempt < self.retries:
                log.warning("HTTP %s la %s, reîncerc", r.status_code, url)
                time.sleep(int(r.headers.get("Retry-After", 2 ** attempt)))
                continue
            # WordPress întoarce 400 „rest_post_invalid_page_number” după ultima pagină.
            if r.status_code == 400 and "invalid_page_number" in r.text:
                return None
            r.raise_for_status()
            return r
        return None

    def categories(self):
        """Toate categoriile: listă de dict cu id, slug, name, count."""
        out, page = [], 1
        while True:
            r = self._get("/wp-json/wp/v2/categories",
                          {"per_page": 100, "page": page, "_fields": "id,slug,name,count"})
            if r is None:
                break
            out.extend(r.json())
            if page >= int(r.headers.get("X-WP-TotalPages", 1)):
                break
            page += 1
        return out

    def category_ids(self, slugs):
        """Rezolvă slug -> id. Slug-urile inexistente lipsesc din rezultat."""
        found = {c["slug"]: c["id"] for c in self.categories()}
        return {s: found[s] for s in slugs if s in found}

    def posts(self, category_id, modified_after=None):
        """Generator cu toate postările dintr-o categorie, în ordinea modificării.

        modified_after (ISO 8601, ex. „2026-10-01T00:00:00”) permite colectarea incrementală.
        """
        page = 1
        while True:
            params = {"categories": category_id, "per_page": 100, "page": page,
                      "orderby": "modified", "order": "asc", "_fields": POST_FIELDS}
            if modified_after:
                params["modified_after"] = modified_after
            r = self._get("/wp-json/wp/v2/posts", params)
            if r is None:
                return
            items = r.json()
            yield from items
            total = int(r.headers.get("X-WP-TotalPages", 1))
            if page >= total or not items:
                return
            page += 1

    def get_html(self, url):
        """Pagină HTML oarecare (folosit pentru arhiva site-ului vechi)."""
        if url.startswith("/"):
            url = self.base + url
        wait = self.delay - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()
        r = self.s.get(url, timeout=self.timeout)
        r.raise_for_status()
        r.encoding = r.encoding or "utf-8"
        return r.text
