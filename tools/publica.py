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


def _manifest(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def texte_de_urcat(base):
    """Documentele Word (data/texte/) pentru intern/: [(local, folder, nume, cheie, amprentă)], manifestul vechi."""
    texte = os.path.join(ROOT, "data", "texte")
    done = _manifest(MANIFEST)
    files = []
    if os.path.isdir(texte):
        for dirpath, _, names in os.walk(texte):
            rel = os.path.relpath(dirpath, os.path.join(ROOT, "data"))
            for n in names:
                p = os.path.join(dirpath, n)
                sig = f"{os.path.getsize(p)}-{int(os.path.getmtime(p))}"
                key = f"{rel}/{n}"
                if done.get(key) != sig:
                    files.append((p, "/".join(x for x in ("intern", rel.replace(os.sep, "/")) if x), n, key, sig))
    # pagina internă (aceeași aplicație ca site-ul public, cu linkuri la Word)
    files.append((cu_versiune(os.path.join(ROOT, "site_intern", "index.html")), "intern", "index.html", None, None))
    # panoul de aprobare a rezumatelor (PHP, în folderul cu parolă)
    files.append((os.path.join(ROOT, "site_intern", "api.php"), "intern", "api.php", None, None))
    return files, done


# Decizie (22.11.2026): versiunea publică are tot ce are cea internă, mai puțin litigiile. Documentele sunt luate
# de pe site-ul primăriei și se publică așa cum sunt acolo.
SCOASE_DIN_PUBLIC = ("litigii.json", "arhiva-stare.json", "arhiva-manifest.json", "arhiva-manifest.csv", "sicap-de-verificat.txt")


def _fara_litigii_indicatori(ind):
    ind = dict(ind)
    ind.pop("litigii", None)
    # ce lipsește din sursele noastre (numere de hotărâre lipsă, stadiul monitorului) rămâne intern
    for k in ("hcl_numere_lipsa", "stadiu"):
        ind.pop(k, None)
    # problemele de publicare semnalate automat apar public doar după verificarea manuală (pot fi alarme false)
    ind["hcl_probleme"] = [p for p in ind.get("hcl_probleme") or [] if p.get("verificare") == "confirmat"]
    return ind


def public_date():
    """date/ public: toate datele, fără litigii (și fără rapoartele de verificare, care rămân interne)."""
    out = {}
    d = os.path.join(ROOT, "data")
    os.makedirs(os.path.join(d, "_public"), exist_ok=True)
    try:
        with open(os.path.join(d, "indicatori.json"), encoding="utf-8") as f:
            ind = _fara_litigii_indicatori(json.load(f))
        p = os.path.join(d, "_public", "indicatori.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(ind, f, ensure_ascii=False, separators=(",", ":"))
        out["indicatori.json"] = p
    except (OSError, ValueError) as e:
        print(f"atenție: indicatori: {e}", file=sys.stderr)
    for name in ("liste.json", "urbanism.json", "sicap.json", "sicap-explorer.json", "buget.json", "concursuri.json",
                 "sedinte.json", "noutati.json", "noutati.xml", "acasa.json", "componenta.json"):
        if os.path.exists(os.path.join(d, name)):
            out[name] = os.path.join(d, name)
    di = os.path.join(d, "intern-date")   # voturi, consilieri etc.; litigiile rămân interne
    if os.path.isdir(di):
        for n in sorted(os.listdir(di)):
            if n.endswith(".json") and n != "litigii.json":
                out[n] = os.path.join(di, n)
    return out


def intern_date():
    """intern/date/: toate datele, în forma completă."""
    d = os.path.join(ROOT, "data")
    out = {}
    for name in ("indicatori.json", "liste.json", "urbanism.json", "sicap.json", "sicap-explorer.json", "buget.json", "concursuri.json",
                 "sedinte.json", "noutati.json", "acasa.json", "componenta.json"):
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


# indicele de căutare stă în zona publică (date/cautare/), iar pagina internă îl citește de acolo;
# manifest nou, ca la prima rulare să se urce tot în noul loc
MANIFEST_CAUTARE = os.path.join(ROOT, "data", "publicat-cautare-public.json")


def cautare_de_urcat(base):
    """Indexul de căutare în text (data/cautare/), doar fișierele noi sau schimbate, după amprentă.
    Ordinea contează când urcarea se întrerupe: întâi bucățile de index, apoi docs.json (care le enumeră),
    la urmă textele (folosite doar pentru fragmentele afișate)."""
    import hashlib
    d = os.path.join(ROOT, "data", "cautare")
    if not os.path.isdir(d):
        return [], None
    done = _manifest(MANIFEST_CAUTARE)
    files = []
    for dirpath, _, names in os.walk(d):
        rel = os.path.relpath(dirpath, d).replace(os.sep, "/")
        for n in sorted(names):
            p = os.path.join(dirpath, n)
            with open(p, "rb") as f:
                h = hashlib.sha1(f.read()).hexdigest()
            key = (rel + "/" + n) if rel != "." else n
            if done.get(key) != h:
                files.append((p, "/".join(x for x in ("date", "cautare", rel if rel != "." else "") if x), n, key, h))
    ordine = lambda x: 0 if x[3].startswith("idx/") else 1 if x[3] == "docs.json" else 2
    return sorted(files, key=ordine), done


# paginile de distribuit (s/<cheie>.html) și imaginile lor (s/img/), doar cele noi sau schimbate
MANIFEST_DISTRIBUIE = os.path.join(ROOT, "data", "publicat-distribuie.json")


def _folder_de_urcat(local, remote, manifest, subfoldere=("",)):
    """Fișierele noi sau schimbate (după amprentă) dintr-un folder din data/, pentru folderul `remote` de pe hosting."""
    import hashlib
    d = os.path.join(ROOT, "data", local)
    if not os.path.isdir(d):
        return [], None
    done = _manifest(manifest)
    files = []
    for sub in subfoldere:
        p0 = os.path.join(d, sub)
        if not os.path.isdir(p0):
            continue
        for n in sorted(os.listdir(p0)):
            p = os.path.join(p0, n)
            if not os.path.isfile(p):
                continue
            with open(p, "rb") as f:
                h = hashlib.sha1(f.read()).hexdigest()
            key = (sub + "/" + n) if sub else n
            if done.get(key) != h:
                files.append((p, "/".join(x for x in (remote, sub) if x), n, key, h))
    return files, done


def distribuie_de_urcat():
    # întâi imaginile, ca pagina să nu trimită spre o imagine încă neurcată
    return _folder_de_urcat("distribuie", "s", MANIFEST_DISTRIBUIE, ("img", ""))


MANIFEST_CONSILIERI = os.path.join(ROOT, "data", "publicat-consilieri.json")


RAPOARTE = ("indicatori.md", "urbanism-registre.txt", "sicap-de-verificat.txt", "sicap-castigatori-proba.json",
            "voturi-proba.txt", "concursuri-proba.txt", "rulare-geocodare.txt", "rulare-buget.txt", "rulare-litigii.txt", "rulare-sicap.txt")


def golire_cloudflare():
    """Golește cache-ul Cloudflare al monitorului (dacă există secretele), ca vizitatorii să vadă imediat pagina nouă.
    O facem imediat după ce s-au urcat pagina și datele, nu la sfârșit: indexul de căutare poate dura zeci de minute."""
    tok, zona = os.environ.get("CF_API_TOKEN"), os.environ.get("CF_ZONE_ID")
    if not (tok and zona):
        return False
    import urllib.request
    for corp in ({"hosts": ["monitor.radautiulcivic.ro"]}, {"purge_everything": True}):
        try:
            req = urllib.request.Request(f"https://api.cloudflare.com/client/v4/zones/{zona}/purge_cache", data=json.dumps(corp).encode(),
                                         headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=30) as r:
                if json.load(r).get("success"):
                    print("cache Cloudflare golit după urcarea paginii și a datelor")
                    return True
        except Exception as e:
            print(f"golirea cache-ului Cloudflare n-a mers ({list(corp)[0]}): {e}", file=sys.stderr)
    return False


def _conectare(host, user, pwd):
    ftp = ftplib.FTP_TLS()
    ftp.connect(host, int(os.environ.get("FTP_PORT", "21")), timeout=60)
    ftp.login(user, pwd)
    ftp.prot_p()
    _cwd[0] = None
    return ftp


def _scrie_manifest(path, d):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f)
    os.replace(tmp, path)


def main():
    import time
    host, user, pwd = (os.environ.get(k) for k in ("FTP_HOST", "FTP_USER", "FTP_PASSWORD"))
    if not (host and user and pwd):
        print("lipsesc FTP_HOST / FTP_USER / FTP_PASSWORD; sar peste publicare", file=sys.stderr)
        return 1
    base = os.environ.get("FTP_DIR", "").strip("/")
    # Căutarea în text are mii de fișiere: o urcăm cât încape în timpul dat și continuăm la rularea următoare.
    buget_cautare = float(os.environ.get("PUBLICARE_MINUTE_CAUTARE", "40")) * 60
    files = []   # (local, folder, nume, manifest, cheie, amprentă)
    site = os.path.join(ROOT, "site")
    for dirpath, _, names in os.walk(site):
        rel = os.path.relpath(dirpath, site)
        for n in names:
            local = os.path.join(dirpath, n)
            if n.endswith(".html"):
                local = cu_versiune(local)
            files.append((local, "" if rel == "." else rel, n, None, None, None))
    # zona publică: toate datele, fără litigii
    for name, local in public_date().items():
        files.append((local, "date", name, None, None, None))
    manifeste = {}
    if intern_protejat():
        # zona internă: toate datele (cu litigiile și rapoartele), apoi documentele Word
        for name, local in intern_date().items():
            files.append((local, "intern/date", name, None, None, None))
        tf, manifeste["texte"] = texte_de_urcat(base)
        print(f"intern: {len(tf)} fișiere noi sau modificate")
        files += [(p, r, n, "texte", k, h) for p, r, n, k, h in tf]
    else:
        print("intern: folderul nu cere parolă (sau nu există); litigiile și rapoartele NU se urcă", file=sys.stderr)
    cf, manifeste["cautare"] = cautare_de_urcat(base)
    print(f"căutare în text: {len(cf)} fișiere noi sau modificate")
    files += [(p, r, n, "cautare", k, h) for p, r, n, k, h in cf]
    df, manifeste["distribuie"] = distribuie_de_urcat()
    print(f"distribuie: {len(df)} fișiere noi sau modificate")
    files = files[:len(files) - len(cf)] + [(p, r, n, "distribuie", k, h) for p, r, n, k, h in df] + files[len(files) - len(cf):]
    kf, manifeste["consilieri"] = _folder_de_urcat("consilieri", "date/consilieri", MANIFEST_CONSILIERI)
    files = files[:len(files) - len(cf)] + [(p, r, n, "consilieri", k, h) for p, r, n, k, h in kf] + files[len(files) - len(cf):]
    cai = {"texte": MANIFEST, "cautare": MANIFEST_CAUTARE, "distribuie": MANIFEST_DISTRIBUIE, "consilieri": MANIFEST_CONSILIERI}

    def salveaza():
        for m, d in manifeste.items():
            if d is not None:
                _scrie_manifest(cai[m], d)

    ftp = _conectare(host, user, pwd)
    urcate, start_cautare, oprit, golit = 0, None, 0, False
    try:
        for name in SCOASE_DIN_PUBLIC:   # fișiere publicate înainte în zona publică, acum doar interne
            try:
                ftp.cwd("/")
                ftp.delete("/".join(x for x in (base, "date", name) if x))
                print(f"șters din zona publică: date/{name}")
            except ftplib.all_errors:
                pass
        _cwd[0] = None
        for i, (local, rel, name, man, key, sig) in enumerate(files):
            if man == "cautare":
                if not golit:
                    golit = True
                    golire_cloudflare()
                start_cautare = start_cautare or time.monotonic()
                if time.monotonic() - start_cautare > buget_cautare:
                    oprit = len(files) - i
                    break
            for incercare in range(3):   # o conexiune căzută (timeout) se reface; fișierul se reia
                try:
                    upload(ftp, local, "/".join(p for p in (base, rel) if p), name)
                    break
                except (ftplib.all_errors + (OSError,)) as e:
                    print(f"eroare la {rel}/{name}: {e}; reconectare", file=sys.stderr)
                    try:
                        ftp.close()
                    except Exception:
                        pass
                    if incercare == 2:
                        raise
                    time.sleep(10 * (incercare + 1))
                    ftp = _conectare(host, user, pwd)
            if man:
                manifeste[man][key] = sig
            urcate += 1
            if urcate % 200 == 0:
                salveaza()   # progresul rămâne și dacă rularea se întrerupe
    finally:
        salveaza()
        try:
            ftp.quit()
        except Exception:
            pass
    if oprit:
        print(f"căutare în text: {oprit} fișiere rămase pentru rularea următoare (limita de timp)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
