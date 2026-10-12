"""Urcă pagina monitorului și indicatorii pe hosting prin FTPS (TLS explicit).

Variabile de mediu: FTP_HOST, FTP_USER, FTP_PASSWORD (obligatorii),
FTP_PORT (implicit 21), FTP_DIR (implicit "/", folderul subdomeniului e deja
rădăcina contului FTP).

Se urcă: site/*, data/indicatori.json și data/liste.json (în folderul date/).

Documentele Word cu textul extras (data/texte/) merg în folderul intern/, DOAR
dacă acesta cere parolă: înainte de urcare verificăm că
https://monitor.radautiulcivic.ro/intern/ răspunde cu 401. Altfel nu se urcă nimic
din texte (pot conține date personale). Se urcă incremental: data/publicat-intern.json
ține evidența fișierelor deja urcate.

Baza de date și PDF-urile nu se urcă niciodată.
"""
import ftplib
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ensure_dir(ftp, path):
    for part in [p for p in path.split("/") if p]:
        try:
            ftp.cwd(part)
        except ftplib.error_perm:
            ftp.mkd(part)
            ftp.cwd(part)


_cwd = [None]


def upload(ftp, local, remote_dir, name):
    if _cwd[0] != remote_dir:   # schimbăm folderul doar când e nevoie (mii de fișiere)
        ftp.cwd("/")
        ensure_dir(ftp, remote_dir)
        _cwd[0] = remote_dir
    with open(local, "rb") as f:
        ftp.storbinary(f"STOR {name}", f)
    print(f"urcat: {remote_dir}/{name}")


INTERN_URL = os.environ.get("INTERN_URL", "https://monitor.radautiulcivic.ro/intern/")
MANIFEST = os.path.join(ROOT, "data", "publicat-intern.json")


def intern_protejat(url=INTERN_URL):
    """True doar dacă folderul intern cere autentificare (HTTP 401)."""
    try:
        urlopen(Request(url, headers={"User-Agent": "MonitorLocal-publicare"}), timeout=30)
        return False
    except HTTPError as e:
        return e.code == 401
    except Exception as e:
        print(f"nu pot verifica {url}: {e}", file=sys.stderr)
        return False


def cu_versiune(html_path):
    """Copie a paginii în care linkurile spre assets/app.css și app.js au ?v=<amprentă>, ca
    browserele și Cloudflare să nu folosească o versiune veche din cache."""
    import hashlib
    h = hashlib.sha256()
    for n in ("app.css", "app.js"):
        with open(os.path.join(ROOT, "site", "assets", n), "rb") as f:
            h.update(f.read())
    v = h.hexdigest()[:10]
    with open(html_path, encoding="utf-8") as f:
        html = f.read()
    for n in ("app.css", "app.js"):
        html = html.replace(f"assets/{n}\"", f"assets/{n}?v={v}\"")
    out = os.path.join(ROOT, "data", "_publicare_" + os.path.basename(os.path.dirname(html_path)) + ".html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    return out


def texte_de_urcat(base):
    texte = os.path.join(ROOT, "data", "texte")
    if not os.path.isdir(texte):
        return [], {}
    try:
        with open(MANIFEST, encoding="utf-8") as f:
            done = json.load(f)
    except (OSError, ValueError):
        done = {}
    files, new = [], {}
    for dirpath, _, names in os.walk(texte):
        rel = os.path.relpath(dirpath, os.path.join(ROOT, "data"))
        for n in names:
            p = os.path.join(dirpath, n)
            sig = f"{os.path.getsize(p)}-{int(os.path.getmtime(p))}"
            key = f"{rel}/{n}"
            if done.get(key) != sig:
                files.append((p, "/".join(x for x in (base, "intern", rel.replace(os.sep, "/")) if x), n))
            new[key] = sig
    # pagina internă (aceeași aplicație ca site-ul public, cu linkuri la Word)
    files.append((cu_versiune(os.path.join(ROOT, "site_intern", "index.html")), "/".join(x for x in (base, "intern") if x), "index.html"))
    return files, new


def main():
    host, user, pwd = (os.environ.get(k) for k in ("FTP_HOST", "FTP_USER", "FTP_PASSWORD"))
    if not (host and user and pwd):
        print("lipsesc FTP_HOST / FTP_USER / FTP_PASSWORD; sar peste publicare", file=sys.stderr)
        return 1
    base = os.environ.get("FTP_DIR", "").strip("/")
    files = []
    site = os.path.join(ROOT, "site")
    for dirpath, _, names in os.walk(site):
        rel = os.path.relpath(dirpath, site)
        for n in names:
            local = os.path.join(dirpath, n)
            if n.endswith(".html"):
                local = cu_versiune(local)
            files.append((local, "" if rel == "." else rel, n))
    for name in ("indicatori.json", "liste.json", "urbanism.json", "sicap.json", "sicap-explorer.json", "litigii.json"):
        p = os.path.join(ROOT, "data", name)
        if os.path.exists(p):
            files.append((p, "date", name))
        else:
            print(f"atenție: data/{name} nu există", file=sys.stderr)

    manifest = None
    if intern_protejat():
        tf, manifest = texte_de_urcat(base)
        print(f"intern: {len(tf)} fișiere noi sau modificate")
        files += tf
        # date doar pentru pagina internă (ex. numele părților din litigii, voturile neverificate)
        di = os.path.join(ROOT, "data", "intern-date")
        if os.path.isdir(di):
            for n in sorted(os.listdir(di)):
                if n.endswith(".json"):
                    files.append((os.path.join(di, n), "/".join(x for x in (base, "intern", "date-intern") if x), n))
    else:
        print("intern: folderul nu cere parolă (sau nu există); textele NU se urcă", file=sys.stderr)

    ftp = ftplib.FTP_TLS()
    ftp.connect(host, int(os.environ.get("FTP_PORT", "21")), timeout=60)
    ftp.login(user, pwd)
    ftp.prot_p()
    try:
        for local, rel, name in files:
            upload(ftp, local, "/".join(p for p in (base, rel) if p), name)
    finally:
        ftp.quit()
    if manifest is not None:
        with open(MANIFEST, "w", encoding="utf-8") as f:
            json.dump(manifest, f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
