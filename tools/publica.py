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


# ce fișiere de date sunt publice și ce doar interne
PUBLIC_INDICATORI = ("calculat_la", "hcl_pe_ani", "hcl_intarziere_publicare", "hcl_cele_mai_intarziate", "hcl_probleme", "sicap",
                     "registre_urbanism", "urbanism")
SCOASE_DIN_PUBLIC = ("litigii.json", "buget.json", "sicap.json", "arhiva-stare.json",
                     "arhiva-manifest.json", "arhiva-manifest.csv", "sicap-de-verificat.txt")


def public_date():
    """date/ public: hotărârile, registrele de urbanism (fără coordonatele pentru hartă) și exploratorul SICAP."""
    out = {}
    d = os.path.join(ROOT, "data")
    os.makedirs(os.path.join(d, "_public"), exist_ok=True)
    try:
        with open(os.path.join(d, "indicatori.json"), encoding="utf-8") as f:
            ind = json.load(f)
        pub = {k: ind[k] for k in PUBLIC_INDICATORI if k in ind}
        # problemele de publicare: doar cele verificate manual
        pub["hcl_probleme"] = [p for p in pub.get("hcl_probleme") or [] if p.get("verificare") == "confirmat"]
        p = os.path.join(d, "_public", "indicatori.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(pub, f, ensure_ascii=False, separators=(",", ":"))
        out["indicatori.json"] = p
    except (OSError, ValueError) as e:
        print(f"atenție: indicatori: {e}", file=sys.stderr)
    try:
        with open(os.path.join(d, "liste.json"), encoding="utf-8") as f:
            L = json.load(f)
        p = os.path.join(d, "_public", "liste.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump({"generat_la": L.get("generat_la"), "hcl": L.get("hcl", []), "registre": L.get("registre", [])},
                      f, ensure_ascii=False, separators=(",", ":"))
        out["liste.json"] = p
    except (OSError, ValueError) as e:
        print(f"atenție: liste: {e}", file=sys.stderr)
    try:   # registrele de urbanism, așa cum le publică primăria; poziția pe hartă rămâne internă
        with open(os.path.join(d, "urbanism.json"), encoding="utf-8") as f:
            U = json.load(f)
        for k in ("cu", "ac"):
            for a in U.get(k) or []:
                for c in ("lat", "lon", "precizie"):
                    a.pop(c, None)
        p = os.path.join(d, "_public", "urbanism.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(U, f, ensure_ascii=False, separators=(",", ":"))
        out["urbanism.json"] = p
    except (OSError, ValueError) as e:
        print(f"atenție: urbanism: {e}", file=sys.stderr)
    if os.path.exists(os.path.join(d, "sicap-explorer.json")):
        out["sicap-explorer.json"] = os.path.join(d, "sicap-explorer.json")
    return out


def intern_date():
    """intern/date/: toate datele, în forma completă."""
    d = os.path.join(ROOT, "data")
    out = {}
    for name in ("indicatori.json", "liste.json", "urbanism.json", "sicap.json", "sicap-explorer.json", "buget.json"):
        if os.path.exists(os.path.join(d, name)):
            out[name] = os.path.join(d, name)
    di = os.path.join(d, "intern-date")   # litigii cu numele părților, voturi
    if os.path.isdir(di):
        for n in sorted(os.listdir(di)):
            if n.endswith(".json"):
                out[n] = os.path.join(di, n)
    # rapoartele de verificare (înainte erau artefacte GitHub, vizibile oricui are cont): acum doar intern
    import zipfile
    rap = [os.path.join(d, n) for n in RAPOARTE if os.path.exists(os.path.join(d, n))]
    if rap:
        z = os.path.join(d, "_intern", "rapoarte.zip")
        os.makedirs(os.path.dirname(z), exist_ok=True)
        with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as f:
            for p in rap:
                f.write(p, os.path.basename(p))
        out["rapoarte.zip"] = z
    return out   # arhiva de siguranță se urcă în intern/date/ de fluxul „Arhivare”


RAPOARTE = ("indicatori.md", "urbanism-registre.txt", "sicap-de-verificat.txt", "sicap-castigatori-proba.json",
            "voturi-proba.txt", "rulare-geocodare.txt", "rulare-buget.txt", "rulare-litigii.txt", "rulare-sicap.txt")


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
    # zona publică: doar hotărârile consiliului local și achizițiile din SICAP
    for name, local in public_date().items():
        files.append((local, "date", name))

    manifest = None
    if intern_protejat():
        tf, manifest = texte_de_urcat(base)
        print(f"intern: {len(tf)} fișiere noi sau modificate")
        files += tf
        # zona internă: toate datele (urbanism, litigii cu nume, buget, voturi, contracte...)
        for name, local in intern_date().items():
            files.append((local, "intern/date", name))
    else:
        print("intern: folderul nu cere parolă (sau nu există); textele și datele interne NU se urcă", file=sys.stderr)

    ftp = ftplib.FTP_TLS()
    ftp.connect(host, int(os.environ.get("FTP_PORT", "21")), timeout=60)
    ftp.login(user, pwd)
    ftp.prot_p()
    try:
        for name in SCOASE_DIN_PUBLIC:   # fișiere publicate înainte în zona publică, acum doar interne
            try:
                ftp.cwd("/")
                ftp.delete("/".join(x for x in (base, "date", name) if x))
                print(f"șters din zona publică: date/{name}")
            except ftplib.all_errors:
                pass
        _cwd[0] = None
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
