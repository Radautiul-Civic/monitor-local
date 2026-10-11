"""Urcă pagina monitorului și indicatorii pe hosting prin FTPS (TLS explicit).

Variabile de mediu: FTP_HOST, FTP_USER, FTP_PASSWORD (obligatorii),
FTP_PORT (implicit 21), FTP_DIR (implicit "/", folderul subdomeniului e deja
rădăcina contului FTP).

Se urcă DOAR: site/*, data/indicatori.json și data/liste.json (în folderul date/).
Baza de date și documentele nu se urcă niciodată.
"""
import ftplib
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ensure_dir(ftp, path):
    for part in [p for p in path.split("/") if p]:
        try:
            ftp.cwd(part)
        except ftplib.error_perm:
            ftp.mkd(part)
            ftp.cwd(part)


def upload(ftp, local, remote_dir, name):
    ftp.cwd("/")
    ensure_dir(ftp, remote_dir)
    with open(local, "rb") as f:
        ftp.storbinary(f"STOR {name}", f)
    print(f"urcat: {remote_dir}/{name}")


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
            files.append((os.path.join(dirpath, n), "" if rel == "." else rel, n))
    for name in ("indicatori.json", "liste.json"):
        p = os.path.join(ROOT, "data", name)
        if os.path.exists(p):
            files.append((p, "date", name))
        else:
            print(f"atenție: data/{name} nu există", file=sys.stderr)

    ftp = ftplib.FTP_TLS()
    ftp.connect(host, int(os.environ.get("FTP_PORT", "21")), timeout=60)
    ftp.login(user, pwd)
    ftp.prot_p()
    try:
        for local, rel, name in files:
            upload(ftp, local, "/".join(p for p in (base, rel) if p), name)
    finally:
        ftp.quit()
    return 0


if __name__ == "__main__":
    sys.exit(main())
