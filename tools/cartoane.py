"""Cartoane pătrate (1080x1080) pentru Facebook și Instagram, din descrieri JSON, cu șablonul Rădăuțiul Civic.

  python tools/cartoane.py fa surse/analize/<nume>.json [--out folder]    cartoanele unei analize scrise de mână
  python tools/cartoane.py analize                                        toate analizele din surse/analize -> site_intern/analize
  python tools/cartoane.py ciorna rezumat.json [--out folder]             ciorna de cartoane și de texte dintr-un rezumat de ședință
  python tools/cartoane.py auto                                           ciorne pentru rezumatele aprobate (rulare automată, urcă în zona internă)

Descrierea unei analize:
  {"titlu": "...", "data": "AAAA-LL-ZZ", "antet": "Consiliul Local Rădăuți · 24 noiembrie 2026", "sursa": "Sursa: ...",
   "fisier": "Caldura 24 noiembrie", "postari": {"facebook": "...", "instagram": "..."}, "surse": ["..."],
   "cartoane": [{"titlu": "...", "sub": "...", "sigla": "sc", "blocuri": [{"tip": "...", ...}]}]}

Tipuri de blocuri: text, cifra, vot, bare, legenda, lista, nota, pas, verificare, doua, persoana, sume, mic, html.
În texte se poate folosi <b>. Imaginile se caută în tools/cartoane_res și în folderul „resurse” de lângă descriere;
o imagine care lipsește e pur și simplu sărită (fotografiile cu drepturi neclare nu stau în depozitul public).

Ciornele automate sunt doar un punct de plecare: voturile se verifică pe înregistrare înainte de orice postare.
"""
import argparse
import asyncio
import html as _html
import json
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "tools", "cartoane_res")
ANALIZE_SRC = os.path.join(ROOT, "surse", "analize")
ANALIZE_OUT = os.path.join(ROOT, "site_intern", "analize")
LUNI = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"]
CUL = {"albastru": "#1c5cab", "rosu": "#c94a3a", "verde": "#2f9e6b", "portocaliu": "#ec7a2c", "galben": "#d98a1f", "gri": "#7a8087",
       "bleu": "#2a78d6", "mov": "#8a6fb0", "otel": "#5b6b7b"}

CSS = """
@font-face{font-family:'Fira Sans';font-weight:400;src:url(fonturi/FiraSans-Regular.ttf)}
@font-face{font-family:'Fira Sans';font-weight:600;src:url(fonturi/FiraSans-SemiBold.ttf)}
@font-face{font-family:'Fira Sans';font-weight:700;src:url(fonturi/FiraSans-Bold.ttf)}
@font-face{font-family:'Fira Sans';font-weight:800;src:url(fonturi/FiraSans-ExtraBold.ttf)}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1080px;font-family:'Fira Sans',sans-serif;background:#f6f3ec;color:#1a1c1e}
.c{position:relative;width:1080px;height:1080px;padding:52px 64px 0}
.k{font-size:23px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#1c5cab}
.pg{position:absolute;top:52px;right:64px;font-size:22px;color:#8a8f94;font-weight:600}
h1{font-size:56px;line-height:1.08;font-weight:800;margin:16px 0 0;letter-spacing:-.01em}
.sub{font-size:28px;line-height:1.36;color:#3d4247;margin-top:16px}
.f{position:absolute;left:64px;right:64px;bottom:36px;display:flex;align-items:center;justify-content:space-between;gap:24px;border-top:2px solid #ddd6c8;padding-top:16px}
.f p{font-size:18px;line-height:1.35;color:#5d6268;max-width:600px}
.f .a{display:flex;align-items:center;gap:12px;font-size:22px;font-weight:700;white-space:nowrap}.f img{width:44px}
.big{margin-top:34px;background:#fff;border-radius:24px;padding:34px 40px;border:2px solid #e6e1d6}
.big b{display:block;font-size:92px;line-height:1;font-weight:800;color:#c94a3a;letter-spacing:-.02em}.big span{display:block;font-size:29px;line-height:1.35;margin-top:14px;color:#3d4247}
.bar{display:flex;border-radius:14px;overflow:hidden}.bar div{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800}
.o{background:#ec7a2c}.bl{background:#2a78d6}
.row{margin-top:20px}.row .l{font-size:25px;font-weight:700;margin-bottom:5px;color:#3d4247}
.lg{margin-top:18px;display:grid;gap:10px}.lg div{display:flex;gap:14px;align-items:flex-start;font-size:25px;line-height:1.32}.lg i{flex:0 0 26px;height:26px;border-radius:6px;margin-top:3px}
.call{background:#fff;border-left:10px solid #ec7a2c;border-radius:14px;padding:18px 26px;font-size:27px;line-height:1.34;margin-top:20px}
.v{background:#fff;border-radius:20px;padding:18px 28px 22px;border:2px solid #e6e1d6;margin-top:18px}
.v .t{font-size:30px;font-weight:800}.v .s{font-size:24px;color:#3d4247;margin-top:3px}
.vt{position:relative;height:62px;display:flex;border-radius:12px;overflow:hidden;background:#ece7dc}.vt .p{background:#2f9e6b}.vt .m{background:#c94a3a}.vt .ab{background:#9aa0a6}
.vt div{display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;font-weight:800;white-space:nowrap}
.tk{position:absolute;bottom:4px;transform:translateX(-50%);font-size:21px;font-weight:700;white-space:nowrap;padding-bottom:22px}.tk:after{content:"";position:absolute;left:50%;bottom:-4px;height:26px;border-left:4px solid #1a1c1e}
.pt{display:flex;align-items:center;gap:14px;margin-top:14px;font-size:25px;line-height:1.3}.pt img{height:46px;width:auto;border-radius:6px}
ul.p{margin-top:22px;list-style:none;display:grid;gap:18px}ul.p li{font-size:27px;line-height:1.36;padding-left:36px;position:relative}
ul.p li:before{content:"";position:absolute;left:0;top:11px;width:16px;height:16px;border-radius:50%;background:#1c5cab}
ul.r li:before{background:#c94a3a}
.fc{background:#fff;border:2px solid #e6e1d6;border-radius:16px;padding:12px 20px;margin-top:12px}.fc .q{font-size:25px;font-weight:800;line-height:1.22}
.fc .vd{display:inline-block;color:#fff;font-weight:800;font-size:19px;border-radius:99px;padding:3px 13px;margin:6px 0 5px}.fc .e{font-size:21px;line-height:1.32;color:#3d4247}
.who{display:flex;gap:20px;align-items:center;margin-top:16px}.who img{width:120px;height:120px;border-radius:50%;object-fit:cover;object-position:50% 20%}.who div{font-size:25px;line-height:1.3;color:#3d4247}.who b{color:#1a1c1e;font-size:29px}
.dl{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:20px}.d{background:#fff;border-radius:18px;padding:18px 22px;border-top:12px solid}
.d h3{font-size:31px;font-weight:800}.d p{font-size:22px;line-height:1.33;margin-top:9px;color:#3d4247}.d p.w{font-size:25px;color:#1a1c1e}
.sm{font-size:19px;color:#6b7177;margin-top:10px;line-height:1.35}
.st{background:#fff;border-left:10px solid #1c5cab;border-radius:14px;padding:14px 22px;margin-top:14px}.st b{font-size:27px;color:#1c5cab}.st p{font-size:23px;line-height:1.34;margin-top:4px;color:#3d4247}
.pr{display:grid;grid-template-columns:250px 1fr 190px;gap:14px;align-items:center;padding:7px 0;border-bottom:1px solid #e6e1d6}
.pl{font-size:22px;font-weight:700}.pl small,.pv small{display:block;font-size:17px;font-weight:400;color:#6b7177}.pb{height:30px;background:#ece7dc;border-radius:8px;overflow:hidden}.pb i{display:block;height:100%}
.pv{text-align:right;font-size:22px}
.gr{display:flex;align-items:flex-end;gap:5px;height:400px;margin-top:10px;border-bottom:2px solid #c9c2b4;padding-bottom:26px;position:relative}
.gc{flex:1;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-end;position:relative;height:100%}
.gc i{display:block}.gc i.bl{border-radius:4px 4px 0 0}.gt{font-size:14px;font-weight:700;text-align:center;margin-bottom:2px}
.gx{position:absolute;bottom:-24px;left:50%;transform:translateX(-50%);font-size:11.5px;white-space:nowrap;color:#5d6268}
.sclogo{display:block;height:50px;width:auto;border-radius:6px;margin-bottom:10px}
.cph{margin-top:12px;height:170px;border-radius:14px;overflow:hidden;position:relative}.cph img{width:100%;height:100%;object-fit:cover;object-position:50% 45%}
.cph span{position:absolute;left:10px;bottom:8px;background:rgba(0,0,0,.62);color:#fff;font-size:16px;padding:3px 9px;border-radius:6px}
.ciorna{position:absolute;top:46px;right:150px;background:#c94a3a;color:#fff;font-size:18px;font-weight:700;border-radius:99px;padding:4px 14px}
"""
SIGLE = {"pnl": "pnl.png", "psd": "psd.png", "aur": "aur.jpg", "sc": "sc.png", "rc": "sigla.png"}


def esc(s):
    return _html.escape(str(s if s is not None else ""), quote=True)


def _t(s):
    """Text din descriere: se păstrează doar <b>, restul e text simplu; fără linie lungă de dialog."""
    s = esc(s).replace("&lt;b&gt;", "<b>").replace("&lt;/b&gt;", "</b>")
    return s.replace("—", "-").replace("–", "-")


def _c(x, implicit="albastru"):
    x = x or implicit
    return CUL.get(x, x)


def _num(x, zec=2):
    return (f"{x:.{zec}f}".rstrip("0").rstrip(".") if isinstance(x, float) else str(x)).replace(".", ",")


def b_text(b):
    return f'<p class="sub">{_t(b.get("text"))}</p>'


def b_cifra(b):
    return f'<div class="big"><b style="color:{_c(b.get("culoare"), "rosu")}">{_t(b.get("mare"))}</b><span>{_t(b.get("text"))}</span></div>'


def b_vot(b):
    total = b.get("total") or 19
    cul_rez = {"adoptat": "#2f9e6b", "respins": "#c94a3a"}.get(b.get("rezultat"), "#d98a1f")
    h = f'<div class="v"><div class="t">{_t(b.get("titlu"))}' + (f' · <span style="color:{cul_rez}">{_t(b["rezultat"])}</span>' if b.get("rezultat") else "") + "</div>"
    if b.get("sub"):
        h += f'<div class="s">{_t(b["sub"])}</div>'
    if b.get("necesar"):
        h += f'<div style="position:relative;margin-top:56px"><span class="tk" style="left:{100 * b["necesar"] / total:.2f}%">{b["necesar"]} voturi necesare</span></div>'
    else:
        h += '<div style="margin-top:12px"></div>'
    seg = [x for x in b.get("segmente") or [] if x[0]]
    h += '<div class="vt">' + "".join(f'<div class="{esc(c)}" style="width:{100 * n / total:.2f}%">{n}{" " + _t(e) if n / total >= 0.24 else ""}</div>' for n, e, c in seg) + '<div style="flex:1"></div></div>'
    if any(n / total < 0.24 for n, e, c in seg):   # segmentele înguste arată doar cifra; explicația vine dedesubt
        h += '<div class="s" style="margin-top:8px">' + ", ".join(f"{n} {_t(e)}" for n, e, c in seg) + "</div>"
    for r in b.get("randuri") or []:
        h += '<div class="pt">' + "".join(f'<img src="{SIGLE.get(s, s)}" alt="{esc(s.upper())}">' for s in r.get("sigle") or []) + f'<span>{_t(r.get("text"))}</span></div>'
    return h + "</div>"


def b_bare(b):
    """Bare orizontale împărțite pe segmente: [[valoare, text sau null, culoare], ...]; „latime” = procent din lățimea cartonului."""
    h = ""
    for r in b.get("randuri") or []:
        tot = sum(s[0] for s in r["segmente"]) or 1
        bara = '<div class="bar" style="height:%dpx">' % (r.get("inaltime") or 78) + "".join(
            f'<div style="width:{100 * v / tot:.2f}%;background:{_c(c)};font-size:{r.get("font") or 30}px">{_t(t if t is not None else _num(v))}</div>' for v, t, c in r["segmente"]) + "</div>"
        h += '<div class="row">' + (f'<div class="l">{_t(r["eticheta"])}</div>' if r.get("eticheta") else "") + (f'<div style="width:{r["latime"]}%">{bara}</div>' if r.get("latime") else bara) + "</div>"
    return h + (b_legenda(b) if b.get("legenda") else "")


def b_legenda(b):
    return '<div class="lg">' + "".join(f'<div><i style="background:{_c(c)}"></i><span>{_t(t)}</span></div>' for c, t in b.get("legenda") or b.get("randuri") or []) + "</div>"


def b_lista(b):
    return f'<ul class="p{" r" if b.get("rosu") else ""}">' + "".join(f"<li>{_t(x)}</li>" for x in b.get("puncte") or []) + "</ul>"


def b_nota(b):
    return f'<div class="call" style="border-left-color:{_c(b.get("culoare"), "portocaliu")}">{_t(b.get("text"))}</div>'


def b_pas(b):
    c = _c(b.get("culoare"))
    return f'<div class="st" style="border-left-color:{c}"><b style="color:{c}">{_t(b.get("titlu"))}</b><p>{_t(b.get("text"))}</p></div>'


def b_verificare(b):
    return f'<div class="fc"><div class="q">„{_t(b.get("spus"))}”</div><div class="vd" style="background:{_c(b.get("culoare"), "galben")}">{_t(b.get("verdict"))}</div><div class="e">{_t(b.get("text"))}</div></div>'


def b_doua(b):
    return '<div class="dl">' + "".join(f'<div class="d" style="border-color:{_c(k.get("culoare"))}"><h3>{_t(k.get("titlu"))}</h3>' +
                                        (f'<p class="w">{_t(k["accent"])}</p>' if k.get("accent") else "") + (f'<p>{_t(k["text"])}</p>' if k.get("text") else "") + "</div>"
                                        for k in (b.get("coloane") or [])[:2]) + "</div>"


def b_persoana(b):
    return '<div class="who">' + (f'<img src="{esc(b["img"])}" alt="">' if b.get("img") else "") + f'<div><b>{_t(b.get("nume"))}</b><br>{_t(b.get("rol"))}</div></div>'


def b_sume(b):
    """Rânduri cu etichetă, bară și sumă: {eticheta, sub, pct, culoare, valoare, sub_valoare}."""
    return '<div style="margin-top:12px">' + "".join(
        f'<div class="pr"><span class="pl">{_t(r.get("eticheta"))}' + (f'<small>{_t(r["sub"])}</small>' if r.get("sub") else "") +
        f'</span><span class="pb"><i style="width:{r.get("pct") or 0}%;background:{_c(r.get("culoare"), "bleu")}"></i></span><span class="pv"><b>{_t(r.get("valoare"))}</b>' +
        (f'<small>{_t(r["sub_valoare"])}</small>' if r.get("sub_valoare") else "") + "</span></div>" for r in b.get("randuri") or []) + "</div>"


def b_mic(b):
    return f'<p class="sm">{_t(b.get("text"))}</p>'


def b_html(b):
    return b.get("html") or ""


BLOCURI = {"text": b_text, "cifra": b_cifra, "vot": b_vot, "bare": b_bare, "legenda": b_legenda, "lista": b_lista, "nota": b_nota, "pas": b_pas,
           "verificare": b_verificare, "doua": b_doua, "persoana": b_persoana, "sume": b_sume, "mic": b_mic, "html": b_html}


def _fara_imagini_lipsa(h, folder):
    """Scoate imaginile care nu există (și caseta foto rămasă goală)."""
    def tine(m):
        return m.group(0) if os.path.exists(os.path.join(folder, m.group(1))) else ""
    h = re.sub(r'<img[^>]*\bsrc="([^"]+)"[^>]*>', tine, h)
    return re.sub(r'<div class="cph">\s*(?:<span>[^<]*</span>)?\s*</div>', "", h)


def pagina(spec, i, folder):
    k = spec["cartoane"][i]
    n = len(spec["cartoane"])
    corp = (f'<img class="sclogo" src="{SIGLE.get(k["sigla"], k["sigla"])}" alt="">' if k.get("sigla") else "")
    antet = f'<div class="k">{_t(k.get("antet") or spec.get("antet") or "")}</div>'
    z = f'<h1>{_t(k.get("titlu"))}</h1>' + (f'<p class="sub">{_t(k["sub"])}</p>' if k.get("sub") else "")
    for b in k.get("blocuri") or []:
        if b.get("tip") not in BLOCURI:
            raise ValueError(f'cartonul {i + 1}: tip de bloc necunoscut „{b.get("tip")}”')
        z += BLOCURI[b["tip"]](b)
    subsol = f'<div class="f"><p>{_t(spec.get("sursa") or "")}</p><div class="a"><img src="sigla.png" alt="">Asociația Rădăuțiul Civic</div></div>'
    h = (f'<!doctype html><html lang="ro"><head><meta charset="utf-8"><style>{CSS}</style></head><body><div class="c"><div class="pg">{i + 1}/{n}</div>' +
         ('<div class="ciorna">ciornă, de verificat</div>' if spec.get("ciorna") else "") + f'{corp}{antet}<div id="z">{z}</div>{subsol}</div></body></html>')
    return _fara_imagini_lipsa(h, folder)


async def _deseneaza(spec, out, folder):
    from playwright.async_api import async_playwright
    nume = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1080, "height": 1080})
        for i in range(len(spec["cartoane"])):
            f = os.path.join(folder, f"p{i + 1}.html")
            with open(f, "w", encoding="utf-8") as fh:
                fh.write(pagina(spec, i, folder))
            await pg.goto("file://" + f)
            await pg.evaluate("document.fonts.ready")
            await pg.wait_for_timeout(150)
            z, gol = float(spec.get("scara_max") or 1.45), 0
            while z > 0.5:   # conținutul se mărește cât încape deasupra subsolului
                await pg.evaluate("z=>document.getElementById('z').style.zoom=z", z)
                gol = await pg.evaluate("document.querySelector('.f').getBoundingClientRect().top-document.getElementById('z').getBoundingClientRect().bottom")
                if gol >= 22:
                    break
                z -= 0.03
            n = f'{spec.get("fisier") or "carton"} {i + 1}.png'
            await pg.screenshot(path=os.path.join(out, n))
            nume.append(n)
            print(f"  {n}: scara {z:.2f}, spațiu liber {gol:.0f}px" + ("  ATENȚIE: nu încape" if gol < 0 else ""))
        await b.close()
    return nume


def fa(spec, out, resurse=None):
    """Desenează cartoanele descrierii în folderul `out`; întoarce numele fișierelor PNG."""
    os.makedirs(out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copytree(RES, tmp, dirs_exist_ok=True)
        if resurse and os.path.isdir(resurse):
            shutil.copytree(resurse, tmp, dirs_exist_ok=True)
        return asyncio.run(_deseneaza(spec, out, tmp))


# ---------- ciorna dintr-un rezumat de ședință ----------

def zi_lunga(d):
    a, l, z = (int(x) for x in d[:10].split("-"))
    return f"{z} {LUNI[l - 1]} {a}"


def _voturi(detalii):
    """„15 pentru, 2 împotrivă, 1 abținere” -> segmente pentru bara de vot."""
    t = (detalii or "").lower()
    seg = []
    for rx, e, c in ((r"(\d+)\s*(?:voturi\s*)?pentru", "pentru", "p"), (r"(\d+)\s*(?:voturi\s*)?[iî]mpotriv", "împotrivă", "m"), (r"(\d+)\s*ab[tț]iner", "abțineri", "ab")):
        m = re.search(rx, t)
        if m and int(m.group(1)):
            seg.append([int(m.group(1)), e, c])
    return seg if seg and sum(s[0] for s in seg) <= 19 else []


def _scurt(s, n):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def din_rezumat(x):
    """Ciorna (descriere de cartoane + texte de postare) dintr-un rezumat aprobat: {data, rezumat{rezumat, puncte, alte_subiecte}}."""
    R, data = x.get("rezumat") or {}, x["data"]
    P = R.get("puncte") or []
    rez = lambda p: ((p.get("vot") or {}).get("rezultat") or "").lower()
    adoptate = [p for p in P if rez(p) == "adoptat"]
    altfel = [p for p in P if rez(p) in ("respins", "amânat", "retras")]
    cu_dezbatere = [p for p in P if (p.get("interventii") or rez(p) in ("respins", "amânat", "retras"))]
    cu_dezbatere.sort(key=lambda p: (rez(p) not in ("respins", "amânat", "retras"), -len(p.get("interventii") or [])))
    K = [{"titlu": f"Ședința Consiliului Local din {zi_lunga(data)}", "blocuri": [
        {"tip": "text", "text": _scurt(R.get("rezumat"), 520)},
        {"tip": "doua", "coloane": [{"titlu": f"{len(adoptate)} adoptate" if len(adoptate) != 1 else "1 adoptat", "text": f"din {len(P)} puncte pe ordinea de zi", "culoare": "verde"},
                                    {"titlu": f"{len(altfel)} respinse, amânate sau retrase" if len(altfel) != 1 else f"1 {rez(altfel[0])}", "text": "; ".join(_scurt(p.get("titlu"), 60) for p in altfel[:2]) or "niciun punct", "culoare": "rosu" if altfel else "gri"}]}]}]
    for p in cu_dezbatere[:5]:
        v = p.get("vot") or {}
        bl = []
        seg = _voturi(v.get("detalii"))
        if seg:
            bl.append({"tip": "vot", "titlu": "Votul", "rezultat": rez(p) or None, "segmente": seg, "sub": "după " + ("procesul-verbal" if v.get("sursa") == "proces-verbal" else "înregistrarea ședinței")})
        elif rez(p):
            bl.append({"tip": "nota", "text": f"Rezultat: <b>{str(rez(p))}</b>" + (f". {str(v['detalii'])}" if v.get("detalii") else ""), "culoare": {"adoptat": "verde", "respins": "rosu"}.get(rez(p), "galben")})
        if p.get("interventii"):
            bl.append({"tip": "lista", "puncte": [f"<b>{str(i.get('cine') or 'Un participant')}:</b> {str(_scurt(i.get('ce'), 190))}" for i in p["interventii"][:3]]})
        elif p.get("discutie"):
            bl.append({"tip": "text", "text": _scurt(p["discutie"], 380)})
        K.append({"titlu": _scurt(p.get("titlu"), 110), "sub": _scurt(p.get("pe_scurt"), 260), "blocuri": bl})
    rest = [p for p in adoptate if p not in cu_dezbatere[:5]]
    if rest:
        K.append({"titlu": "Ce s-a mai hotărât", "blocuri": [{"tip": "lista", "puncte": [str(_scurt(p.get("titlu"), 115)) for p in rest[:7]]}] +
                  ([{"tip": "mic", "text": f"Și alte {len(rest) - 7} hotărâri."}] if len(rest) > 7 else [])})
    if R.get("alte_subiecte"):
        K.append({"titlu": "Ce s-a mai discutat", "blocuri": [{"tip": "lista", "puncte": [str(_scurt(a.get("ce"), 200)) for a in R["alte_subiecte"][:5]]}]})
    z = f"{data[8:10]}.{data[5:7]}.{data[:4]}"
    sursa = f"Sursa: ședința Consiliului Local din {z} și hotărârile (și proiectele) Consiliului Local, publicate pe primariaradauti.ro"
    linii = [f"🏛️ Ce s-a hotărât în ședința Consiliului Local din {zi_lunga(data)}", "", R.get("rezumat") or "", ""]
    for p in cu_dezbatere[:5]:
        v = p.get("vot") or {}
        linii.append(f"• {p.get('titlu')}: {rez(p) or 'rezultat neclar'}" + (f" ({v['detalii']})" if v.get("detalii") else "") + ".")
    if rest:
        linii += ["", f"✅ Au mai fost adoptate {len(rest)} hotărâri, între care: " + "; ".join(_scurt(p.get("titlu"), 90) for p in rest[:3]) + "."]
    fb = "\n".join(linii + ["", sursa, "Asociația Rădăuțiul Civic"]).replace("—", "-")
    ig = "\n".join([f"🏛️ Consiliul Local, {zi_lunga(data)}", "", _scurt(R.get("rezumat"), 600), "", "Glisează pentru detalii. " + sursa.replace("Consiliului Local", "CL") + ". Asociația Rădăuțiul Civic"]).replace("—", "-")
    return {"titlu": f"Ședința din {zi_lunga(data)}", "data": data, "antet": f"Consiliul Local Rădăuți · {zi_lunga(data)}", "sursa": sursa,
            "fisier": f"Sedinta {data}", "ciorna": True, "scara_max": 1.7, "cartoane": K, "postari": {"facebook": fb, "instagram": ig}}


# ---------- comenzi ----------

def cmd_analize():
    """Toate analizele din surse/analize: cartoanele + index.json în site_intern/analize (urcate apoi în zona internă)."""
    idx = []
    for f in sorted(os.listdir(ANALIZE_SRC)):
        if not f.endswith(".json"):
            continue
        with open(os.path.join(ANALIZE_SRC, f), encoding="utf-8") as fh:
            spec = json.load(fh)
        slug = f[:-5]
        print(slug)
        out = os.path.join(ANALIZE_OUT, slug)
        shutil.rmtree(out, ignore_errors=True)
        nume = fa(spec, out, os.path.join(ANALIZE_SRC, spec.get("resurse") or slug))
        for i, n in enumerate(nume, 1):   # pe site, nume simple; numele frumos e pus la descărcare
            os.replace(os.path.join(out, n), os.path.join(out, f"{i}.png"))
        nume = [f"{i}.png" for i in range(1, len(nume) + 1)]
        idx.append({"id": slug, "fisier": spec.get("fisier") or slug, "titlu": spec.get("titlu"), "data": spec.get("data"), "pe_scurt": spec.get("pe_scurt"), "cartoane": nume,
                    "titluri": [k.get("titlu") for k in spec["cartoane"]], "postari": spec.get("postari") or {}, "surse": spec.get("surse") or [], "note": spec.get("note") or []})
    idx.sort(key=lambda a: a.get("data") or "", reverse=True)
    with open(os.path.join(ANALIZE_OUT, "index.json"), "w", encoding="utf-8") as fh:
        json.dump({"analize": idx}, fh, ensure_ascii=False, indent=1)
    print(f"{len(idx)} analize -> {ANALIZE_OUT}")


def cmd_auto(maxim=3):
    """Ciorne de cartoane pentru rezumatele aprobate care nu au încă (sau au fost reaprobate între timp)."""
    sys.path.insert(0, ROOT)
    import requests
    from monitor_colector.intern_ftp import Intern
    INDEX, FOLDER = "intern/date/cartoane.json", "intern/cartoane"
    pub = requests.get("https://monitor.radautiulcivic.ro/date/rezumate.json", timeout=60, headers={"User-Agent": "MonitorLocal-cartoane"})
    rezumate = (pub.json().get("rezumate") or []) if pub.ok else []
    with Intern() as I:
        idx = I.json(INDEX, {}) or {}
        de_facut = [x for x in rezumate if (x.get("rezumat") or {}).get("puncte") and (idx.get(x["id"]) or {}).get("aprobat_la") != x.get("aprobat_la")][:maxim]
        print(f"{len(rezumate)} rezumate aprobate, {len(de_facut)} de făcut")
        if de_facut and os.environ.get("GITHUB_ACTIONS"):   # browserul pentru desenat se instalează doar când e ceva de făcut
            import subprocess
            subprocess.run([sys.executable, "-m", "playwright", "install", "--with-deps", "chromium"], check=True, stdout=subprocess.DEVNULL)
        for x in de_facut:
            spec = din_rezumat(x)
            with tempfile.TemporaryDirectory() as out:
                nume = fa(spec, out)
                for i, n in enumerate(nume, 1):
                    with open(os.path.join(out, n), "rb") as fh:
                        I.scrie(f"{FOLDER}/{x['id']}/{i}.png", fh.read())
            idx[x["id"]] = {"data": x["data"], "titlu": spec["titlu"], "aprobat_la": x.get("aprobat_la"), "generat_la": datetime.now().isoformat(timespec="seconds"),
                            "cartoane": [f"{i}.png" for i in range(1, len(nume) + 1)], "titluri": [k["titlu"] for k in spec["cartoane"]], "postari": spec["postari"]}
            I.scrie(INDEX, idx)
            print(f"  {x['id']}: {len(nume)} cartoane urcate")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="cartoane", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fa")
    f.add_argument("descriere")
    f.add_argument("--out")
    sub.add_parser("analize")
    c = sub.add_parser("ciorna")
    c.add_argument("rezumat")
    c.add_argument("--out")
    sub.add_parser("auto")
    a = ap.parse_args(argv)
    if a.cmd == "analize":
        return cmd_analize()
    if a.cmd == "auto":
        return cmd_auto()
    with open(a.descriere if a.cmd == "fa" else a.rezumat, encoding="utf-8") as fh:
        d = json.load(fh)
    if a.cmd == "fa":
        p = os.path.abspath(a.descriere)
        fa(d, a.out or os.path.splitext(p)[0] + "-cartoane", os.path.join(os.path.dirname(p), d.get("resurse") or os.path.basename(p)[:-5]))
    else:
        spec = din_rezumat(d)
        out = a.out or "cartoane-ciorna"
        fa(spec, out)
        with open(os.path.join(out, "descriere.json"), "w", encoding="utf-8") as fh:
            json.dump(spec, fh, ensure_ascii=False, indent=1)
        with open(os.path.join(out, "postari.txt"), "w", encoding="utf-8") as fh:
            fh.write("FACEBOOK\n\n" + spec["postari"]["facebook"] + "\n\n\nINSTAGRAM\n\n" + spec["postari"]["instagram"] + "\n")
        print(f"ciorna: {out} (voturile se verifică pe înregistrare înainte de postare)")


if __name__ == "__main__":
    sys.exit(main())
