"""Păstrarea documentelor publice: copii de siguranță ale site-urilor primăriei.

Trei straturi, fiecare cu rostul lui:
  1. inventar  - lista completă a fișierelor (biblioteca media WordPress), a paginilor
                 (sitemap) și conținutul tuturor postărilor/paginilor (API), pentru
                 ambele site-uri: arhiva veche și site-ul nou;
  2. copie     - fiecare fișier descărcat, cu amprentă SHA-256, și urcat pe hostingul
                 asociației (folderul protejat intern/arhiva-copie/), cu aceeași cale;
  3. wayback   - fiecare adresă trimisă în Internet Archive (Wayback Machine): copie
                 publică, independentă, cu dată certă.
Un manifest (adresă, dată, mărime, SHA-256, link Wayback) se publică pe site: arată ce
exista, când, și permite oricui să verifice că o copie e identică cu originalul.

Rulare: python -m monitor_colector.pastrare inventar | copiaza [--minute N] | wayback [--minute N] | manifest
"""
import argparse
import csv
import ftplib
import gzip
import hashlib
import json
import logging
import os
import re
import sqlite3
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, FIRST_COMPLETED, wait
from urllib.parse import urlparse, unquote
from urllib.request import Request, urlopen
from urllib.error import HTTPError

import requests

from . import config

log = logging.getLogger("pastrare")

DIR = os.environ.get("MC_PASTRARE_DIR", "data-arhiva")
DB = os.path.join(DIR, "pastrare.sqlite")
SITES = {"arhiva": config.ARCHIVE_URL, "site": config.BASE_URL}
DEST = "intern/arhiva-copie"          # pe hosting; „intern/” cere parolă
INTERN_URL = os.environ.get("INTERN_URL", "https://monitor.radautiulcivic.ro/intern/")
DELAY = float(os.environ.get("MC_DELAY", "1.0"))
# copia de siguranță: fișiere statice (wp-content/uploads), deci se pot cere mai des decât paginile;
# câteva descărcări și urcări în paralel, fiecare cu conexiunea ei FTP
DELAY_COPIE = float(os.environ.get("MC_ARHIVA_DELAY", "0.35"))
PARALEL = int(os.environ.get("MC_ARHIVA_PARALEL", "4"))
EXT_DOC = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".odt", ".ods", ".zip", ".rar", ".rtf", ".ppt", ".pptx", ".txt", ".csv")
# Adrese care NU se trimit în Internet Archive (copia publică e permanentă și nu mai poate fi
# retrasă de noi). Ex.: r"publicatii-casatorii|casatori" pentru anunțurile de căsătorie.
# Se copiază oricum pe hostingul nostru (protejat).
WAYBACK_EXCLUS = re.compile(os.environ.get("MC_WAYBACK_EXCLUS", r"(?!x)x"), re.I)

SCHEMA = """
CREATE TABLE IF NOT EXISTS fisiere (
    url TEXT PRIMARY KEY, site TEXT, sursa TEXT,          -- sursa: media / pagina / link
    media_id INTEGER, data_upload TEXT, mime TEXT, titlu TEXT, filesize_api INTEGER,
    vazut_prima TEXT, vazut_ultima TEXT, disparut_la TEXT,
    sha256 TEXT, marime INTEGER, copiat_la TEXT, cale TEXT, erori INTEGER DEFAULT 0, eroare TEXT,
    wayback_la TEXT, wayback_url TEXT, wayback_erori INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_copiat ON fisiere(copiat_la);
CREATE TABLE IF NOT EXISTS rulari (cand TEXT, pas TEXT, stats TEXT);
"""


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def db():
    os.makedirs(DIR, exist_ok=True)
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    return c


def sesiune():
    s = requests.Session()
    s.headers["User-Agent"] = config.USER_AGENT
    return s


class Ritm:
    """Cel mult o cerere la DELAY secunde (politețe față de serverul primăriei)."""
    def __init__(self, delay=DELAY):
        self.delay, self.t = delay, 0.0
        self._lock = threading.Lock()

    def asteapta(self):
        with self.__dict__.setdefault("_lock", threading.Lock()):   # comun pentru toate firele de lucru
            w = self.delay - (time.monotonic() - self.t)
            if w > 0:
                time.sleep(w)
            self.t = time.monotonic()


def _vazut(c, url, site, sursa, **f):
    t = now()
    row = c.execute("SELECT url FROM fisiere WHERE url=?", (url,)).fetchone()
    if row:
        sets = ", ".join(f"{k}=COALESCE(?, {k})" for k in f)
        c.execute(f"UPDATE fisiere SET vazut_ultima=?, disparut_la=NULL{', ' + sets if sets else ''} WHERE url=?",
                  (t, *f.values(), url))
        return False
    cols = ["url", "site", "sursa", "vazut_prima", "vazut_ultima", *f.keys()]
    c.execute(f"INSERT INTO fisiere ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
              (url, site, sursa, t, t, *f.values()))
    return True


UPLOAD_RE = re.compile(r"https?://[^\s\"'<>()]+/wp-content/uploads/[^\s\"'<>()]+", re.I)


# ---------- 1. inventar ----------

def inventar(c, s=None, ritm=None, sites=SITES):
    s, ritm = s or sesiune(), ritm or Ritm()
    stats = {}
    inceput = now()
    for site, base in sites.items():
        st = {"media": 0, "media_noi": 0, "pagini": 0, "linkuri": 0, "continut": {}}
        # a) biblioteca media: toate fișierele încărcate
        page = 1
        while True:
            ritm.asteapta()
            r = s.get(base + "/wp-json/wp/v2/media", timeout=60, params={
                "per_page": 100, "page": page, "orderby": "id", "order": "asc",
                "_fields": "id,date,mime_type,source_url,title,filesize"})
            if r.status_code == 400:   # dincolo de ultima pagină
                break
            r.raise_for_status()
            items = r.json()
            if not items:
                break
            for it in items:
                url = it.get("source_url")
                if not url:
                    continue
                titlu = (it.get("title") or {}).get("rendered") if isinstance(it.get("title"), dict) else it.get("title")
                st["media_noi"] += _vazut(c, url, site, "media", media_id=it.get("id"), data_upload=it.get("date"),
                                          mime=it.get("mime_type"), titlu=titlu, filesize_api=it.get("filesize"))
                st["media"] += 1
            c.commit()
            if page >= int(r.headers.get("X-WP-TotalPages", page)):
                break
            page += 1
        # b) conținutul postărilor și paginilor (text, linkuri) + linkuri spre fișiere din afara bibliotecii
        for tip in ("posts", "pages", "agenda"):
            cale = os.path.join(DIR, "continut", f"{site}-{tip}.jsonl.gz")
            os.makedirs(os.path.dirname(cale), exist_ok=True)
            n, page = 0, 1
            with gzip.open(cale + ".tmp", "wt", encoding="utf-8") as out:
                while True:
                    ritm.asteapta()
                    r = s.get(base + f"/wp-json/wp/v2/{tip}", timeout=60, params={"per_page": 100, "page": page})
                    if r.status_code in (400, 404):
                        break
                    r.raise_for_status()
                    items = r.json()
                    if not items:
                        break
                    for it in items:
                        out.write(json.dumps(it, ensure_ascii=False) + "\n")
                        n += 1
                        html = json.dumps(it.get("content", {}), ensure_ascii=False)
                        for u in set(UPLOAD_RE.findall(html.replace("\\/", "/"))):
                            if urlparse(u).netloc == urlparse(base).netloc:
                                st["linkuri"] += _vazut(c, u.split("#")[0], site, "link")
                        if it.get("link"):
                            _vazut(c, it["link"], site, "pagina", mime="text/html", data_upload=it.get("date"),
                                   titlu=(it.get("title") or {}).get("rendered"))
                    c.commit()
                    if page >= int(r.headers.get("X-WP-TotalPages", page)):
                        break
                    page += 1
            if n:
                os.replace(cale + ".tmp", cale)
            else:
                os.remove(cale + ".tmp")
            st["continut"][tip] = n
        # c) pagini din sitemap (inclusiv cele fără API, ex. categorii)
        try:
            ritm.asteapta()
            idx = s.get(base + "/wp-sitemap.xml", timeout=60)
            for sm in re.findall(r"<loc>([^<]+)</loc>", idx.text if idx.ok else ""):
                ritm.asteapta()
                r = s.get(sm, timeout=60)
                for u in re.findall(r"<loc>([^<]+)</loc>", r.text if r.ok else ""):
                    st["pagini"] += _vazut(c, u, site, "pagina", mime="text/html")
            c.commit()
        except requests.RequestException as e:
            log.warning("sitemap %s: %s", site, e)
        stats[site] = st
    # ce nu a mai apărut în inventar: posibil șters de pe site (rămâne în copie și în Wayback)
    for site in sites:
        cunoscute = c.execute("SELECT COUNT(*) FROM fisiere WHERE site=? AND sursa='media' AND disparut_la IS NULL",
                              (site,)).fetchone()[0]
        if stats[site]["media"] < 0.9 * cunoscute:   # inventar incomplet azi (pană?): nu tragem concluzii
            stats[site]["disparute_acum"] = "nu se evaluează (inventar incomplet)"
            continue
        stats[site]["disparute_acum"] = c.execute(
            "UPDATE fisiere SET disparut_la=? WHERE site=? AND sursa='media' AND vazut_ultima < ? AND disparut_la IS NULL",
            (now(), site, inceput)).rowcount
    c.commit()
    return stats


# ---------- 2. copie pe hosting ----------

def intern_protejat(url=INTERN_URL):
    try:
        urlopen(Request(url, headers={"User-Agent": "MonitorLocal-pastrare"}), timeout=30)
        return False
    except HTTPError as e:
        return e.code == 401
    except Exception:
        return False


def cale_copie(url, site):
    p = urlparse(url)
    path = unquote(p.path).lstrip("/") or "index"
    if path.endswith("/") or not os.path.splitext(path)[1]:
        path = path.rstrip("/") + "/index.html"
    path = re.sub(r"[^\w\-./ ăâîșțşţĂÂÎȘȚŞŢ]", "_", path)
    return f"{DEST}/{site}/{path}"


class FTP:
    def __init__(self):
        self.f, self.cwd = None, None

    def conecteaza(self):
        f = ftplib.FTP_TLS()
        f.connect(os.environ["FTP_HOST"], int(os.environ.get("FTP_PORT", "21")), timeout=120)
        f.login(os.environ["FTP_USER"], os.environ["FTP_PASSWORD"])
        f.prot_p()
        self.f, self.cwd = f, None

    def sterge(self, remote):
        """Șterge un fișier de pe hosting, dacă există (ex. date mutate din zona publică în cea internă)."""
        try:
            if self.f is None:
                self.conecteaza()
            self.f.cwd("/")
            self.cwd = None
            self.f.delete(remote)
            return True
        except ftplib.all_errors:
            return False

    def urca(self, local, remote):
        d, name = remote.rsplit("/", 1)
        for incercare in range(2):
            try:
                if self.f is None:
                    self.conecteaza()
                if self.cwd != d:
                    self.f.cwd("/")
                    for part in d.split("/"):
                        try:
                            self.f.cwd(part)
                        except ftplib.error_perm:
                            self.f.mkd(part)
                            self.f.cwd(part)
                    self.cwd = d
                with open(local, "rb") as fh:
                    self.f.storbinary(f"STOR {name}", fh)
                return
            except ftplib.error_perm as e:
                if str(e).startswith(("552", "452")):   # spațiu epuizat pe hosting
                    raise
                if incercare:
                    raise
                self.f = None
            except (OSError, EOFError, ftplib.error_temp):
                if incercare:
                    raise
                self.f = None

    def inchide(self):
        try:
            if self.f:
                self.f.quit()
        except Exception:
            pass


class SpatiuEpuizat(Exception):
    pass


def _prioritate_sql():
    """Documentele întâi (PDF, Word, Excel, arhive), apoi celelalte fișiere (imagini), apoi paginile."""
    doc = " OR ".join(f"lower(url) LIKE '%{e}'" for e in EXT_DOC)
    return f"CASE WHEN {doc} THEN 0 WHEN sursa='pagina' THEN 2 ELSE 1 END"


def _o_copie(url, site, s, ritm, ftp):
    """Descarcă un fișier și îl urcă pe hosting. Întoarce (sha256, octeți, cale)."""
    ritm.asteapta()
    tmp = None
    try:
        h, n = hashlib.sha256(), 0
        with s.get(url, stream=True, timeout=120) as resp:
            resp.raise_for_status()
            fd, tmp = tempfile.mkstemp(dir=DIR)
            with os.fdopen(fd, "wb") as out:
                for chunk in resp.iter_content(1 << 16):
                    out.write(chunk)
                    h.update(chunk)
                    n += len(chunk)
        cale = cale_copie(url, site)
        ftp.urca(tmp, cale)
        return h.hexdigest(), n, cale
    finally:
        if tmp and os.path.exists(tmp):
            os.remove(tmp)


def copiaza(c, minute=None, s=None, ritm=None, ftp=None, limita=None, paralel=None):
    """Descarcă fișierele încă necopiate și le urcă pe hosting, cu `paralel` fire de lucru (fiecare cu
    conexiunea lui FTP). Se oprește la bugetul de timp sau când spațiul de pe hosting e plin."""
    if ftp is None and not intern_protejat():
        raise RuntimeError("folderul intern/ nu cere parolă: copiile nu se urcă")
    paralel = 1 if ftp is not None else (paralel or PARALEL)
    ritm = ritm or Ritm(DELAY_COPIE)
    t0 = time.time()
    stop = t0 + minute * 60 if minute else None
    stats = {"copiate": 0, "octeti": 0, "erori": 0, "oprit_la_buget": False, "spatiu_epuizat": False,
             "paralel": paralel, "ramase_inainte": 0, "exemple_erori": {}}
    rows = c.execute("SELECT url, site FROM fisiere WHERE copiat_la IS NULL AND erori < 3 "
                     f"ORDER BY {_prioritate_sql()}, data_upload").fetchall()
    rows = rows[:limita] if limita else rows
    stats["ramase_inainte"] = len(rows)
    local = threading.local()
    toate_ftp, lacat = [], threading.Lock()

    def lucreaza(url, site):
        if not hasattr(local, "ftp"):
            local.ftp = ftp or FTP()
            local.s = s or sesiune()
            with lacat:
                toate_ftp.append(local.ftp)
        return _o_copie(url, site, local.s, ritm, local.ftp)

    def rezultat(url, fut):
        try:
            h, n, cale = fut.result()
            c.execute("UPDATE fisiere SET sha256=?, marime=?, copiat_la=?, cale=?, eroare=NULL WHERE url=?",
                      (h, n, now(), cale, url))
            stats["copiate"] += 1
            stats["octeti"] += n
        except ftplib.error_perm as e:
            if str(e).startswith(("552", "452")):
                stats["spatiu_epuizat"] = True
                raise SpatiuEpuizat(str(e))
            _eroare(url, e)
        except SpatiuEpuizat:
            raise
        except Exception as e:
            _eroare(url, e)

    def _eroare(url, e):
        c.execute("UPDATE fisiere SET erori=erori+1, eroare=? WHERE url=?", (str(e)[:300], url))
        stats["erori"] += 1
        k = re.sub(r"\d{3,}|https?://\S+", "#", str(e))[:80]
        stats["exemple_erori"][k] = stats["exemple_erori"].get(k, 0) + 1

    pool = ThreadPoolExecutor(max_workers=paralel)
    in_lucru = {}
    try:
        it = iter(rows)
        while True:
            while len(in_lucru) < paralel * 2:
                if stop and time.time() > stop:
                    stats["oprit_la_buget"] = True
                    break
                r = next(it, None)
                if r is None:
                    break
                in_lucru[pool.submit(lucreaza, r["url"], r["site"])] = r["url"]
            if not in_lucru:
                break
            gata, _ = wait(list(in_lucru), return_when=FIRST_COMPLETED)
            for f in gata:
                rezultat(in_lucru.pop(f), f)
            c.commit()
            if stats["oprit_la_buget"] and not in_lucru:
                break
    except SpatiuEpuizat:
        for f in in_lucru:
            f.cancel()
    finally:
        pool.shutdown(wait=True)
        c.commit()
        for f in toate_ftp:
            f.inchide()
    dur = max(1.0, time.time() - t0)
    stats["secunde"] = round(dur)
    stats["fisiere_pe_ora"] = round(stats["copiate"] * 3600 / dur)
    return stats


# ---------- 3. Internet Archive (Wayback Machine) ----------

def wayback(c, minute=None, s=None, limita=None):
    """Trimite adresele în Wayback Machine. Cu cheile unui cont archive.org (IA_ACCESS, IA_SECRET)
    merge mai repede; fără ele, folosește trimiterea anonimă, mai lentă."""
    s = s or sesiune()
    k, sec = os.environ.get("IA_ACCESS"), os.environ.get("IA_SECRET")
    ritm = Ritm(4.0 if k and sec else 12.0)
    stop = time.time() + minute * 60 if minute else None
    stats = {"deja_in_arhiva": 0, "trimise": 0, "erori": 0, "oprit_la_buget": False, "cont": bool(k and sec)}
    rows = c.execute("SELECT url FROM fisiere WHERE wayback_la IS NULL AND wayback_erori < 3 "
                     "ORDER BY sursa='pagina' DESC, data_upload").fetchall()
    for r in rows[:limita] if limita else rows:
        if stop and time.time() > stop:
            stats["oprit_la_buget"] = True
            break
        url = r["url"]
        if WAYBACK_EXCLUS.search(url):
            stats["excluse"] = stats.get("excluse", 0) + 1
            continue
        try:
            ritm.asteapta()
            a = s.get("https://archive.org/wayback/available", params={"url": url}, timeout=60).json()
            snap = ((a.get("archived_snapshots") or {}).get("closest") or {})
            if snap.get("available") and snap.get("url"):
                c.execute("UPDATE fisiere SET wayback_la=?, wayback_url=? WHERE url=?", (now(), snap["url"], url))
                stats["deja_in_arhiva"] += 1
                continue
            ritm.asteapta()
            if k and sec:
                resp = s.post("https://web.archive.org/save", timeout=120, data={"url": url, "skip_first_archive": "1"},
                              headers={"Accept": "application/json", "Authorization": f"LOW {k}:{sec}"})
            else:
                resp = s.get("https://web.archive.org/save/" + url, timeout=120, allow_redirects=False)
            if resp.status_code in (200, 302):
                c.execute("UPDATE fisiere SET wayback_la=?, wayback_url=? WHERE url=?",
                          (now(), "https://web.archive.org/web/*/" + url, url))
                stats["trimise"] += 1
            elif resp.status_code == 429:   # prea multe cereri: ne oprim pentru azi
                stats["limita_atinsa"] = True
                break
            else:
                raise RuntimeError(f"HTTP {resp.status_code}")
        except Exception as e:
            c.execute("UPDATE fisiere SET wayback_erori=wayback_erori+1 WHERE url=?", (url,))
            stats["erori"] += 1
            log.debug("wayback %s: %s", url, e)
        finally:
            c.commit()
    return stats


# ---------- 4. manifest și stare ----------

def manifest(c):
    """data-arhiva/manifest.csv și .json (public: adrese, date, amprente, fără conținut) + stare.json."""
    rows = c.execute("SELECT site, sursa, url, mime, data_upload, titlu, sha256, marime, copiat_la, wayback_url, "
                     "vazut_prima, disparut_la, cale FROM fisiere ORDER BY site, data_upload, url").fetchall()
    with open(os.path.join(DIR, "manifest.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["site", "tip", "adresa", "mime", "data_incarcarii", "sha256", "marime_octeti",
                    "copiat_la", "wayback", "vazut_prima_data", "disparut_de_pe_site"])
        for r in rows:
            w.writerow([r["site"], r["sursa"], r["url"], r["mime"], r["data_upload"], r["sha256"], r["marime"],
                        r["copiat_la"], r["wayback_url"], r["vazut_prima"], r["disparut_la"]])
    with open(os.path.join(DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump([{"s": r["site"], "t": r["sursa"], "u": r["url"], "d": (r["data_upload"] or "")[:10],
                    "n": r["titlu"], "h": r["sha256"], "m": r["marime"], "c": r["cale"],
                    "w": r["wayback_url"], "x": r["disparut_la"]} for r in rows], f, ensure_ascii=False,
                  separators=(",", ":"))
    stare = {"actualizat_la": now(), "site_uri": {}}
    for site in SITES:
        q = c.execute("SELECT COUNT(*), SUM(copiat_la IS NOT NULL), SUM(COALESCE(marime,0)), "
                      "SUM(wayback_la IS NOT NULL), SUM(disparut_la IS NOT NULL), SUM(COALESCE(filesize_api,0)) "
                      "FROM fisiere WHERE site=?", (site,)).fetchone()
        stare["site_uri"][site] = {"adresa": SITES[site], "total": q[0] or 0, "copiate": q[1] or 0,
                                   "octeti_copiati": q[2] or 0, "in_wayback": q[3] or 0, "disparute": q[4] or 0,
                                   "octeti_estimati": q[5] or 0}
    try:   # ritmul ultimelor copieri, ca să estimăm când se termină
        rs = [json.loads(r[0]) for r in c.execute("SELECT stats FROM rulari WHERE pas='copiaza' ORDER BY cand DESC LIMIT 1")]
        if rs and isinstance(rs[0], dict):
            stare["ultima_copiere"] = {k: rs[0].get(k) for k in ("copiate", "octeti", "erori", "secunde", "fisiere_pe_ora",
                                                                  "paralel", "spatiu_epuizat", "exemple_erori")}
        stare["documente"] = dict(zip(("total", "copiate"), c.execute(
            f"SELECT COUNT(*), SUM(copiat_la IS NOT NULL) FROM fisiere WHERE {_prioritate_sql()} = 0").fetchone()))
    except Exception as e:
        log.warning("stare: %s", e)
    with open(os.path.join(DIR, "stare.json"), "w", encoding="utf-8") as f:
        json.dump(stare, f, ensure_ascii=False, indent=1)
    return stare


def publica_manifest():
    """Urcă manifestul, starea și conținutul copiilor DOAR în zona internă (cu parolă)."""
    ftp = FTP()
    try:
        protejat = intern_protejat()
        for name in ("manifest.csv", "manifest.json", "stare.json"):
            ftp.sterge(f"date/arhiva-{name}")   # versiunile vechi, publice
            p = os.path.join(DIR, name)
            if os.path.exists(p) and protejat:
                ftp.urca(p, f"intern/date/arhiva-{name}")
        cont = os.path.join(DIR, "continut")
        if os.path.isdir(cont) and protejat:
            for n in os.listdir(cont):
                ftp.urca(os.path.join(cont, n), f"{DEST}/continut/{n}")
    finally:
        ftp.inchide()


def main(argv=None):
    ap = argparse.ArgumentParser(prog="monitor_colector.pastrare")
    ap.add_argument("pas", choices=["inventar", "copiaza", "wayback", "manifest", "publica"])
    ap.add_argument("--minute", type=int, default=None)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    c = db()
    if a.pas == "inventar":
        st = inventar(c)
    elif a.pas == "copiaza":
        st = copiaza(c, minute=a.minute)
    elif a.pas == "wayback":
        st = wayback(c, minute=a.minute)
    elif a.pas == "manifest":
        st = manifest(c)
    else:
        publica_manifest()
        st = "publicat"
    c.execute("INSERT INTO rulari VALUES (?,?,?)", (now(), a.pas, json.dumps(st, ensure_ascii=False, default=str)))
    c.commit()
    print(json.dumps(st, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
