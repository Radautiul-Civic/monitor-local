"""Componența consiliului local, de pe pagina primăriei „Componența” (primariaradauti.ro/componenta/): pentru fiecare
consilier, fotografia, sigla partidului și declarațiile de avere și de interese.

Pagina e un tabel TablePress (Nume | Fotografie | Partid | Decl. avere | Decl. interese). Fotografiile și siglele le
copiem la noi (micșorate), ca monitorul să nu depindă de site-ul primăriei (care cere uneori o verificare anti-robot).
Consilierii se leagă de profilurile din procesele-verbale după nume (aceeași cheie ca în voturi.py, cu toleranță la o
literă greșită de OCR: „Hrițcan” / „Hrițean”).
"""
import hashlib
import html
import io
import json
import os
import re

from .voturi import _tok

PARTIDE = [(r"social.?democrat|\bpsd\b", "PSD"), (r"\bpnl\b|national.?liberal", "PNL"), (r"\busr\b|salvati", "USR"),
           (r"\baur\b|unirea.?romanilor", "AUR"), (r"\budmr\b", "UDMR"), (r"\bpmp\b|miscarea.?populara", "PMP"),
           (r"\balde\b", "ALDE"), (r"forta.?dreptei", "Forța Dreptei"), (r"\bsos\b", "S.O.S. România"),
           (r"\bpot\b|oamenilor.?tineri", "POT"), (r"independent", "Independent")]


def partid_din(text):
    t = re.sub(r"[_\-.]+", " ", (text or "").lower())
    for rx, nume in PARTIDE:
        if re.search(rx, t):
            return nume
    return None


def _text(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def parse(continut):
    """Rândurile tabelului: [{nume, foto, sigla, avere:[{text,url}], interese:[...]}]."""
    out = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", continut or "", re.S | re.I):
        cel = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)
        if len(cel) < 3:
            continue
        nume = _text(cel[0])
        if not nume or len(nume) > 80:
            continue
        img = lambda c: (re.search(r'<img[^>]+src="([^"]+)"', c) or [None, None])[1]
        lk = lambda c: [{"text": _text(t) or "declarație", "url": html.unescape(u)}
                        for u, t in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', c, re.S)]
        alt_sigla = (re.search(r'<img[^>]+alt="([^"]*)"', cel[2]) or [None, ""])[1]
        sigla = img(cel[2])
        out.append({"nume": nume, "foto": img(cel[1]), "sigla": sigla,
                    "partid": partid_din((sigla or "").rsplit("/", 1)[-1] + " " + alt_sigla + " " + _text(cel[2])),
                    "avere": lk(cel[3]) if len(cel) > 3 else [], "interese": lk(cel[4]) if len(cel) > 4 else []})
    return out


def _lev1(a, b):
    """Diferă prin cel mult o literă (înlocuire, adăugare sau lipsă)?"""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) <= 1
    s, l = (a, b) if len(a) < len(b) else (b, a)
    return any(l[:i] + l[i + 1:] == s for i in range(len(l)))


def leaga(nume, consilieri):
    """ID-ul profilului din voturi.json pentru un nume de pe pagina primăriei (sau None)."""
    t = sorted(_tok(nume))
    k = "-".join(t)
    ids = [c["id"] for c in consilieri]
    if k in ids:
        return k
    for c in consilieri:
        u = c["id"].split("-")
        if len(u) == len(t) and all(any(_lev1(a, b) for b in u) for a in t):
            return c["id"]
    return None


CORECTII = os.path.join(os.path.dirname(os.path.dirname(__file__)), "surse", "componenta", "corectii.json")


def corecteaza(rows, cons, cale=CORECTII):
    """Pagina primăriei nu e mereu la zi: partidele lipsă, consilierii plecați și cei noi vin din surse/componenta/corectii.json."""
    try:
        with open(cale, encoding="utf-8") as f:
            c = json.load(f)
    except (OSError, ValueError):
        return rows
    k = lambda n: "-".join(sorted(_tok(n)))
    for x in rows:
        if not x.get("partid") and k(x["nume"]) in c.get("partide", {}):
            x["partid"] = c["partide"][k(x["nume"])]
        if k(x["nume"]) in c.get("iesiti", {}):
            x["iesit"] = c["iesiti"][k(x["nume"])]
    nume = {k(x["nume"]) for x in rows}
    for a in c.get("adaugati", []):
        if k(a["nume"]) not in nume:
            rows.append({"nume": a["nume"], "foto": None, "sigla": None, "partid": a.get("partid"), "avere": [], "interese": [],
                         "nou": {"din": a.get("din"), "text": a.get("text")}, "id": leaga(a["nume"], cons)})
    # sigla partidului pentru cei adăugați sau corectați: aceeași ca la ceilalți consilieri ai partidului
    sigle = {}
    for x in rows:
        if x.get("partid") and x.get("sigla"):
            sigle.setdefault(x["partid"], x["sigla"])
    for x in rows:
        if x.get("partid") and not x.get("sigla") and x["partid"] in sigle:
            x["sigla"] = sigle[x["partid"]]
    return rows


def _imagine(sesiune, url, cale, latura):
    from PIL import Image
    r = sesiune.get(url, timeout=60)
    r.raise_for_status()
    im = Image.open(io.BytesIO(r.content))
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    im.thumbnail((latura, latura))
    os.makedirs(os.path.dirname(cale), exist_ok=True)
    if cale.endswith(".png"):
        im.save(cale, "PNG", optimize=True)
    else:
        im.convert("RGB").save(cale, "JPEG", quality=84, optimize=True, progressive=True)


def scrie(data_dir, client=None, slug="componenta"):
    from .wp import WPClient
    c = client or WPClient()
    r = c._get("/wp-json/wp/v2/pages", {"slug": slug, "_fields": "link,modified,content"})
    d = r.json() if r is not None else []
    if not d:
        return {"eroare": "pagina nu a fost găsită"}
    rows = parse(d[0]["content"]["rendered"])
    try:
        with open(os.path.join(data_dir, "intern-date", "voturi.json"), encoding="utf-8") as f:
            cons = json.load(f).get("consilieri") or []
    except (OSError, ValueError):
        cons = []
    folder = os.path.join(data_dir, "consilieri")
    out, erori = [], 0
    for x in rows:
        x["id"] = leaga(x["nume"], cons)
        cheie = x["id"] or "-".join(sorted(_tok(x["nume"])))
        for camp, nume_f, lat in (("foto", cheie + ".jpg", 320), ("sigla", None, 96)):
            u = x.get(camp)
            if not u:
                continue
            if camp == "sigla":
                nume_f = "partid-" + hashlib.sha1(u.encode()).hexdigest()[:10] + ".png"
            p = os.path.join(folder, nume_f)
            try:
                if not os.path.exists(p):
                    _imagine(c.s, u, p, lat)
                x[camp] = "consilieri/" + nume_f
            except Exception:
                erori += 1
                x[camp] = None
        out.append(x)
    out = corecteaza(out, cons)
    rez = {"sursa": d[0]["link"], "actualizat": d[0]["modified"][:10], "consilieri": out}
    with open(os.path.join(data_dir, "componenta.json"), "w", encoding="utf-8") as f:
        json.dump(rez, f, ensure_ascii=False, separators=(",", ":"))
    return {"consilieri": len(out), "legati": sum(1 for x in out if x["id"]), "fara_foto": sum(1 for x in out if not x["foto"]),
            "partide": sorted({x["partid"] or "?" for x in out}), "erori_imagini": erori}
