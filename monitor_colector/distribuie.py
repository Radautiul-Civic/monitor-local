"""Pagini de distribuit pe rețelele sociale: pentru fiecare ședință, proiect în consultare și hotărâre recentă, o pagină
mică (s/<cheie>.html) cu titlu, descriere și o imagine de previzualizare (s/img/<cheie>.png, 1200x630), care trimite
cititorul mai departe în monitor.

Facebook, WhatsApp și celelalte nu rulează JavaScript și nu citesc partea de după „#” din adresă, așa că pagina
monitorului (o singură pagină, cu adrese „#consiliu/hcl/2026/123”) apare la distribuire mereu la fel. Paginile de aici
au fiecare propriile etichete og:*; omul care dă click ajunge imediat în locul potrivit din monitor.
"""
import html
import json
import os
import re
from datetime import date, timedelta

from .parse import clean_title

SITE = "https://monitor.radautiulcivic.ro"
LUNI = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie",
        "noiembrie", "decembrie"]
FONTURI = os.path.join(os.path.dirname(__file__), "fonturi")
SIGLA = os.path.join(os.path.dirname(os.path.dirname(__file__)), "site", "assets", "img", "sigla.png")
TIP_SED = {"ordinara": "ordinară", "extraordinara": "extraordinară", "extraordinara_de_indata": "convocată de îndată"}
# culorile monitorului (app.css)
CUL = {"sedinta": (42, 120, 214), "consultare": (98, 80, 214), "hcl": (27, 175, 122), "rezumat": (42, 120, 214), "consilier": (42, 120, 214)}


def zi(d):
    try:
        x = date.fromisoformat(d[:10])
        return f"{x.day} {LUNI[x.month - 1]} {x.year}"
    except (TypeError, ValueError):
        return d or ""


def _scurt(t, n):
    t = re.sub(r"\s+", " ", t or "").strip()
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0].rstrip(",;:") + "..."


def _obiect(t):
    """„Proiect de hotărâre nr. 99582/20.11.2026 privind X” -> „X” (cu majusculă)."""
    t = clean_title(t or "")
    m = re.search(r"\b(privind|pentru)\b\s*", t, re.I)
    t = t[m.end():] if m and m.start() < 90 else t
    t = t.rstrip(". ")
    return t[:1].upper() + t[1:]


def elemente(sed, hcl, rezumate=None, azi=None):
    """Ce se poate distribui: [{cheie, tip, eticheta, titlu, descriere, jos, link}]."""
    azi = azi or date.today()
    rez = {r.get("data"): r for r in (rezumate or []) if r.get("data")}
    out = []
    for c in (sed.get("urmatoare") or []) + (sed.get("recente") or []):
        d = c.get("data")
        if not d:
            continue
        od = c.get("ordinea_de_zi") or []
        r = (rez.get(d) or {}).get("rezumat") or {}
        viitoare = d >= azi.isoformat()
        if r.get("rezumat"):
            descr, et, tip = r["rezumat"], "Rezumatul ședinței", "rezumat"
        else:
            descr = "Pe ordinea de zi: " + "; ".join(_obiect(p["text"]) for p in od[:4]) + ("..." if len(od) > 4 else "") if od else \
                "Ordinea de zi e în dispoziția de convocare."
            et, tip = "Ședința Consiliului Local", "sedinta"
        out.append({"cheie": f"sedinta-{d}", "tip": tip, "eticheta": et,
                    "titlu": f"Ședința {TIP_SED.get(c.get('tip'), '')} a Consiliului Local din {zi(d)}".replace("  ", " "),
                    "descriere": _scurt(descr, 300),
                    "jos": (f"{zi(d)}" + (f", ora {c['ora']}" if c.get("ora") else "") + (f" · {len(od)} puncte pe ordinea de zi" if od else "")),
                    "link": "#consiliu/urmatoare" if viitoare and not r else f"#consiliu/sedinte/{d}"})
    for p in sed.get("consultare") or []:
        if not p.get("nr") or p.get("adoptat"):
            continue
        out.append({"cheie": f"proiect-{p['nr']}", "tip": "consultare", "eticheta": "Proiect în consultare publică",
                    "titlu": _obiect(p.get("obiect")),
                    "descriere": (f"Poți trimite propuneri până pe {zi(p['termen'])}. " if p.get("deschis") and p.get("termen") else "") +
                                 "Proiect de hotărâre al Consiliului Local Rădăuți, publicat de primărie pe " + zi(p.get("postat")) + ".",
                    "jos": (f"Propuneri până pe {zi(p['termen'])}" if p.get("deschis") and p.get("termen") else f"Publicat pe {zi(p.get('postat'))}"),
                    "link": "#consiliu/urmatoare"})
    for h in hcl:
        out.append({"cheie": f"hcl-{h['an']}-{h['nr']}", "tip": "hcl", "eticheta": f"Hotărârea nr. {h['nr']}/{h['an']}",
                    "titlu": _obiect(h["titlu"]),
                    "descriere": f"Hotărâre a Consiliului Local al Municipiului Rădăuți, adoptată pe {zi(h['data'])}. Textul hotărârii și votul, pe Monitor local.",
                    "jos": f"Adoptată pe {zi(h['data'])}", "link": f"#consiliu/hcl/{h['an']}/{h['nr']}"})
    return out


def consilieri(vot, comp):
    """Fișele consilierilor din componența actuală: prezența și voturile din mandatul în curs (din procesele-verbale)."""
    M = vot.get("mandate") or {}
    if not M:
        return []
    start = max(M.values())
    V = {c["id"]: c for c in vot.get("consilieri") or []}
    out = []
    for x in (comp or {}).get("consilieri") or []:
        c = V.get(x.get("id"))
        if not c or x.get("iesit"):
            continue
        st = {"sedinte": 0, "absent": 0, "I": 0, "A": 0, "N": 0}
        for d, cod in c.get("cod", {}).items():
            if d < start or not cod:
                continue
            st["sedinte"] += 1
            if cod[0] == "X":   # prezența: ședințele în care nu e numit printre absenți, ca pe site
                st["absent"] += 1
            for k in cod[1:]:
                if k in ("I", "A", "N"):
                    st[k] += 1
        t = st["sedinte"]
        if not t:
            continue
        prez = round(100 * (t - st["absent"]) / t)
        out.append({"cheie": f"consilier-{x['id']}", "tip": "consilier", "eticheta": "Consilier local" + (f" · {x['partid']}" if x.get("partid") else ""),
                    "titlu": x["nume"], "foto": x.get("foto"),
                    "cifre": [(f"{prez}%", "prezență"), (str(st["absent"]), "absențe"), (str(st["I"]), "voturi împotrivă"), (str(st["A"]), "abțineri")],
                    "descriere": f"{x['nume']}, consilier local în Rădăuți: prezență {prez}% la ședințele din mandatul actual, {st['absent']} absențe, "
                                 f"{st['I']} voturi împotrivă și {st['A']} abțineri, din procesele-verbale.",
                    "jos": f"Extras automat din procesele-verbale, din {zi(start)}", "link": f"#consiliu/consilieri/{x['id']}"})
    return out


def pagina(e):
    esc = lambda s: html.escape(s or "", quote=True)
    url, img, tinta = f"{SITE}/s/{e['cheie']}.html", f"{SITE}/s/img/{e['cheie']}.png", f"{SITE}/{e['link']}"
    titlu = (f"{e['titlu']}, consilier local" if e["tip"] == "consilier" else
             f"{e['eticheta']}: {e['titlu']}" if e["tip"] not in ("sedinta", "rezumat") else e["titlu"])
    return f"""<!doctype html>
<html lang="ro"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(_scurt(titlu, 110))} - Monitor local Rădăuți</title>
<meta name="description" content="{esc(e['descriere'])}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Monitor local Rădăuți">
<meta property="og:locale" content="ro_RO">
<meta property="og:title" content="{esc(_scurt(titlu, 110))}">
<meta property="og:description" content="{esc(e['descriere'])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{esc(_scurt(titlu, 200))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">
<link rel="canonical" href="{url}">
<script>location.replace({json.dumps(tinta)});</script>
<style>body{{font:17px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#1a1c1e}}a{{color:#1c5cab}}</style>
</head><body>
<p><b>{esc(e['eticheta'])}</b></p><h1 style="font-size:1.3rem">{esc(e['titlu'])}</h1><p>{esc(e['descriere'])}</p>
<p><a href="{esc(tinta)}">Vezi pe Monitor local</a></p>
</body></html>
"""


def _rupe(d, text, font, latime, maxim):
    cuv, linii, cur = text.split(), [], ""
    for w in cuv:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) <= latime:
            cur = t
        else:
            if cur:
                linii.append(cur)
            cur = w
        if len(linii) == maxim:
            break
    if cur and len(linii) < maxim:
        linii.append(cur)
    if len(linii) == maxim and " ".join(linii) != " ".join(cuv):
        ult = linii[-1]
        while ult and d.textlength(ult + "...", font=font) > latime:
            ult = ult.rsplit(" ", 1)[0] if " " in ult else ult[:-1]
        linii[-1] = ult.rstrip(",;:") + "..."
    return linii


def imagine(e, cale):
    """Imaginea de previzualizare: 1200x630, eticheta colorată, titlul mare, data jos, sigla și adresa monitorului."""
    from PIL import Image, ImageDraw, ImageFont
    W, H, M = 1200, 630, 72
    cul = CUL.get(e["tip"], (28, 92, 171))
    im = Image.new("RGB", (W, H), (245, 244, 240))
    d = ImageDraw.Draw(im)
    f = lambda n, g: ImageFont.truetype(os.path.join(FONTURI, "Inter-Bold.otf" if g else "Inter-Regular.otf"), n)
    d.rectangle([0, 0, W, 14], fill=cul)
    # antet: sigla și numele
    x = M
    if os.path.exists(SIGLA):
        s = Image.open(SIGLA).convert("RGBA")
        s.thumbnail((56, 56))
        im.paste(s, (M, 52), s)
        x = M + s.width + 16
    d.text((x, 54), "Monitor local", font=f(30, True), fill=(26, 28, 30))
    d.text((x, 90), "Rădăuți · Asociația Rădăuțiul Civic", font=f(20, False), fill=(107, 113, 119))
    # eticheta
    fe = f(24, True)
    et = e["eticheta"].upper()
    lw = d.textlength(et, font=fe)
    d.rounded_rectangle([M, 160, M + lw + 36, 206], radius=23, fill=cul)
    d.text((M + 18, 168), et, font=fe, fill=(255, 255, 255))
    if e.get("cifre"):   # fișa unui consilier: fotografia, numele, patru cifre
        y0 = 236
        foto = os.path.join(DATA_FOTO, e["foto"]) if e.get("foto") and DATA_FOTO else None
        xt = M
        if foto and os.path.exists(foto):
            from PIL import ImageOps
            f0 = ImageOps.fit(Image.open(foto).convert("RGB"), (150, 150), centering=(0.5, 0.3))
            masca = Image.new("L", (150, 150), 0)
            ImageDraw.Draw(masca).ellipse([0, 0, 149, 149], fill=255)
            im.paste(f0, (M, y0), masca)
            xt = M + 180
        d.text((xt, y0 + 30), _scurt(e["titlu"], 40), font=f(54, True), fill=(26, 28, 30))
        w = (W - 2 * M - 3 * 16) // 4
        for i, (v, l) in enumerate(e["cifre"]):
            x0 = M + i * (w + 16)
            d.rounded_rectangle([x0, 410, x0 + w, 510], radius=14, fill=(255, 255, 255), outline=(227, 225, 218), width=2)
            d.text((x0 + 18, 420), v, font=f(46, True), fill=cul)
            d.text((x0 + 18, 476), l, font=f(20, False), fill=(77, 82, 87))
        lin, mar = [], 0
    else:
        lin, mar = None, None
    # titlul: cât mai mare care încape în 4 rânduri
    for mar in (() if lin is not None else (58, 52, 46, 40)):
        ft = f(mar, True)
        lin = _rupe(d, e["titlu"], ft, W - 2 * M, 4)
        if len(lin) <= 3 or mar == 40:
            break
    y = 236
    for l in lin:
        d.text((M, y), l, font=ft, fill=(26, 28, 30))
        y += int(mar * 1.22)
    # jos: data / termenul și adresa
    d.line([M, H - 96, W - M, H - 96], fill=(227, 225, 218), width=2)
    d.text((M, H - 74), _scurt(e["jos"], 70), font=f(26, True), fill=cul)
    adr = "monitor.radautiulcivic.ro"
    fa = f(24, False)
    d.text((W - M - d.textlength(adr, font=fa), H - 72), adr, font=fa, fill=(77, 82, 87))
    os.makedirs(os.path.dirname(cale), exist_ok=True)
    im.save(cale, "PNG", optimize=True)


DATA_FOTO = None   # folderul data/ (fotografiile consilierilor sunt în data/consilieri/)


def hcl_recente(db, azi, zile=365):
    de_la = (azi - timedelta(days=zile)).isoformat()
    return [{"an": r["year"], "nr": r["number"], "titlu": r["title"] or "", "data": r["adoption_date"]}
            for r in db.execute("SELECT year, number, title, adoption_date FROM hcl WHERE adoption_date>=? AND title IS NOT NULL "
                                "ORDER BY adoption_date DESC, number DESC", (de_la,))]


def rezumate_publicate(url=SITE + "/date/rezumate.json"):
    """Rezumatele aprobate (le scrie panoul intern direct pe hosting, deci le citim de acolo)."""
    try:
        import requests
        r = requests.get(url, timeout=30, headers={"User-Agent": "MonitorLocal-distribuie"})
        return r.json() if r.ok else []
    except Exception:
        return []


def scrie(store, data_dir, azi=None):
    azi = azi or date.today()
    try:
        with open(os.path.join(data_dir, "sedinte.json"), encoding="utf-8") as f:
            sed = json.load(f)
    except (OSError, ValueError):
        sed = {}
    global DATA_FOTO
    DATA_FOTO = data_dir
    rez = rezumate_publicate()
    el = elemente(sed, hcl_recente(store.db, azi), rez if isinstance(rez, list) else [], azi)
    try:
        with open(os.path.join(data_dir, "intern-date", "voturi.json"), encoding="utf-8") as f:
            vot = json.load(f)
        with open(os.path.join(data_dir, "componenta.json"), encoding="utf-8") as f:
            comp = json.load(f)
        el += consilieri(vot, comp)
    except (OSError, ValueError):
        pass
    d = os.path.join(data_dir, "distribuie")
    os.makedirs(os.path.join(d, "img"), exist_ok=True)
    pastrate = set()
    for e in el:
        if e["cheie"] in pastrate:
            continue
        pastrate.add(e["cheie"])
        html_ = pagina(e)
        p = os.path.join(d, e["cheie"] + ".html")
        vechi = open(p, encoding="utf-8").read() if os.path.exists(p) else None
        if vechi != html_ or not os.path.exists(os.path.join(d, "img", e["cheie"] + ".png")):   # imaginea se refă doar când s-a schimbat ceva
            with open(p, "w", encoding="utf-8") as f:
                f.write(html_)
            imagine(e, os.path.join(d, "img", e["cheie"] + ".png"))
    for n in os.listdir(d):   # ce nu mai e de distribuit (hotărâri mai vechi de un an) iese din folder
        if n.endswith(".html") and n[:-5] not in pastrate:
            os.remove(os.path.join(d, n))
            try:
                os.remove(os.path.join(d, "img", n[:-5] + ".png"))
            except OSError:
                pass
    with open(os.path.join(d, "index.json"), "w", encoding="utf-8") as f:
        json.dump(sorted(pastrate), f, separators=(",", ":"))
    return {"pagini": len(pastrate)}
