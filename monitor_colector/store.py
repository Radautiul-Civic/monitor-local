"""Stocare SQLite. Fiecare tabel păstrează legătura cu sursa (URL, ID WordPress)."""
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS posts (
    wp_id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,              -- hcl, pv, cu, ac, contracte, ...
    slug TEXT, link TEXT, title TEXT,
    date TEXT, modified TEXT,          -- data publicării / modificării pe site
    categories TEXT,                   -- JSON
    content_html TEXT,
    content_hash TEXT,
    first_seen TEXT, last_seen TEXT
);
CREATE TABLE IF NOT EXISTS post_versions (   -- istoric: primăria poate modifica postările
    wp_id INTEGER, modified TEXT, content_hash TEXT, title TEXT, seen_at TEXT,
    PRIMARY KEY (wp_id, content_hash)
);
CREATE TABLE IF NOT EXISTS documents (
    url TEXT PRIMARY KEY,
    wp_id INTEGER,                     -- NULL pentru documentele din arhivă
    origin TEXT,                       -- site / arhiva
    link_text TEXT,
    sha256 TEXT, size INTEGER, last_modified TEXT, fetched_at TEXT,
    local_path TEXT,
    pages INTEGER, text_layer INTEGER, -- 1 = are text, 0 = scanat
    text_path TEXT, ocr_at TEXT
);
CREATE TABLE IF NOT EXISTS hcl (
    year INTEGER, number INTEGER,
    adoption_date TEXT, title TEXT,
    origin TEXT,                       -- site / arhiva
    wp_id INTEGER, posted TEXT,        -- data postării pe site (doar origin=site)
    pdf_url TEXT, redacted INTEGER, issues TEXT,
    PRIMARY KEY (year, number)
);
CREATE TABLE IF NOT EXISTS pv (
    wp_id INTEGER PRIMARY KEY, kind TEXT, session_type TEXT, session_date TEXT,
    hour TEXT, hcl_from INTEGER, hcl_to INTEGER, posted TEXT, title TEXT
);
CREATE TABLE IF NOT EXISTS registries (
    wp_id INTEGER PRIMARY KEY, kind TEXT, period_start TEXT, period_end TEXT,
    posted TEXT, title TEXT
);
CREATE TABLE IF NOT EXISTS runs (
    started TEXT, finished TEXT, command TEXT, stats TEXT
);
"""


def now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def iso(d):
    return d.isoformat() if d else None


class Store:
    def __init__(self, path):
        d = os.path.dirname(path)
        if d:
            os.makedirs(d, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    def close(self):
        self.db.commit()
        self.db.close()

    # ---------- postări ----------
    def upsert_post(self, source, post):
        """Salvează o postare; întoarce 'new', 'changed' sau 'same'."""
        title = post["title"]["rendered"] if isinstance(post.get("title"), dict) else post.get("title")
        content = post["content"]["rendered"] if isinstance(post.get("content"), dict) else post.get("content", "")
        h = hashlib.sha256((title + "\n" + content).encode("utf-8")).hexdigest()
        ts = now()
        row = self.db.execute("SELECT content_hash FROM posts WHERE wp_id=?", (post["id"],)).fetchone()
        if row is None:
            status = "new"
            self.db.execute(
                "INSERT INTO posts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (post["id"], source, post.get("slug"), post.get("link"), title, post.get("date"),
                 post.get("modified"), json.dumps(post.get("categories", [])), content, h, ts, ts))
        else:
            status = "same" if row["content_hash"] == h else "changed"
            self.db.execute(
                "UPDATE posts SET slug=?, link=?, title=?, date=?, modified=?, categories=?, "
                "content_html=?, content_hash=?, last_seen=? WHERE wp_id=?",
                (post.get("slug"), post.get("link"), title, post.get("date"), post.get("modified"),
                 json.dumps(post.get("categories", [])), content, h, ts, post["id"]))
        self.db.execute("INSERT OR IGNORE INTO post_versions VALUES (?,?,?,?,?)",
                        (post["id"], post.get("modified"), h, title, ts))
        return status

    def last_modified(self, source):
        r = self.db.execute("SELECT MAX(modified) FROM posts WHERE source=?", (source,)).fetchone()
        return r[0]

    # ---------- documente ----------
    def add_document(self, url, wp_id, origin, link_text):
        self.db.execute(
            "INSERT INTO documents (url, wp_id, origin, link_text) VALUES (?,?,?,?) "
            "ON CONFLICT(url) DO UPDATE SET link_text=COALESCE(NULLIF(excluded.link_text,''), link_text)",
            (url, wp_id, origin, link_text))

    def documents_to_fetch(self, limit=None):
        q = "SELECT * FROM documents WHERE fetched_at IS NULL ORDER BY rowid"
        return self.db.execute(q + (f" LIMIT {int(limit)}" if limit else "")).fetchall()

    def documents_to_ocr(self, limit=None):
        q = ("SELECT * FROM documents WHERE text_layer=0 AND ocr_at IS NULL "
             "AND local_path IS NOT NULL ORDER BY rowid")
        return self.db.execute(q + (f" LIMIT {int(limit)}" if limit else "")).fetchall()

    def update_document(self, url, **fields):
        cols = ", ".join(f"{k}=?" for k in fields)
        self.db.execute(f"UPDATE documents SET {cols} WHERE url=?", (*fields.values(), url))

    # ---------- entități ----------
    def upsert_hcl(self, rec):
        """Site-ul nou are prioritate față de arhivă pentru același (an, număr)."""
        if rec.get("year") is None or rec.get("number") is None:
            return
        existing = self.db.execute("SELECT origin FROM hcl WHERE year=? AND number=?",
                                   (rec["year"], rec["number"])).fetchone()
        if existing and existing["origin"] == "site" and rec["origin"] == "arhiva":
            return
        self.db.execute(
            "INSERT OR REPLACE INTO hcl VALUES (?,?,?,?,?,?,?,?,?,?)",
            (rec["year"], rec["number"], iso(rec.get("date")), rec.get("title"), rec["origin"],
             rec.get("wp_id"), rec.get("posted"), rec.get("pdf_url"),
             int(bool(rec.get("redacted"))), json.dumps(rec.get("issues", []), ensure_ascii=False)))

    def upsert_pv(self, wp_id, pv, posted, title):
        self.db.execute("INSERT OR REPLACE INTO pv VALUES (?,?,?,?,?,?,?,?,?)",
                        (wp_id, pv["kind"], pv["session_type"], iso(pv["session_date"]), pv["hour"],
                         pv["hcl_from"], pv["hcl_to"], posted, title))

    def upsert_registry(self, wp_id, kind, period, posted, title):
        self.db.execute("INSERT OR REPLACE INTO registries VALUES (?,?,?,?,?,?)",
                        (wp_id, kind, iso(period["start"]), iso(period["end"]), posted, title))

    def log_run(self, started, command, stats):
        self.db.execute("INSERT INTO runs VALUES (?,?,?,?)",
                        (started, now(), command, json.dumps(stats, ensure_ascii=False)))
        self.db.commit()
