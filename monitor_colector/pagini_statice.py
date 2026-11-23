"""Pagini statice pentru motoarele de căutare (p/...) și harta site-ului (sitemap.xml, robots.txt).

Monitorul e o singură pagină cu adrese „#consiliu/hcl/2026/201”; Google vede din ea doar pagina de start. Aici scriem câte
o pagină HTML obișnuită pentru fiecare hotărâre, ședință, consilier, obiectiv de investiții, stradă și firmă, cu
informațiile principale în text, ca cine caută „HCL 201/2026 Rădăuți” sau „strada Putnei Rădăuți” să ajungă la monitor.
Fiecare pagină trimite, cu un link vizibil, la pagina interactivă din monitor.
"""
import html
import json
import os
import re
from datetime import date

from .distribuie import zi, SITE
from .parse import norm

ESC = lambda s: html.escape(str(s if s is not None else ""), quote=True)
TIP = {"ordinara": "ordinară", "extraordinara": "extraordinară", "extraordinara_de_indata": "convocată de îndată"}


def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", norm(s or "")).strip("-")
    return s[:80] or "x"


def lei(v):
    if v is None:
        return "-"
    if v >= 1e6:
        return f"{v / 1e6:.1f} mil. lei".replace(".", ",")
    return f"{round(v):,} lei".replace(",", ".")


def pagina(titlu, descriere, corp, spa, cale):
    """Pagina completă. `spa` = adresa paginii interactive („#consiliu/hcl/2026/201”), `cale` = calea paginii („p/hcl/2026-201.html”)."""
    adancime = cale.count("/")
    rad = "../" * adancime
    url = f"{SITE}/{cale}"
    return f"""<!doctype html>
<html lang="ro"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{ESC(titlu)} - Monitor local Rădăuți</title>
<meta name="description" content="{ESC(descriere[:300])}">
<link rel="canonical" href="{url}">
<meta property="og:title" content="{ESC(titlu)}"><meta property="og:description" content="{ESC(descriere[:300])}">
<meta property="og:image" content="{SITE}/assets/img/og.png"><meta property="og:url" content="{url}">
<link rel="icon" type="image/png" href="{rad}assets/img/favicon.png">
<link rel="stylesheet" href="{rad}assets/app.css">
</head><body data-sec="consiliu">
<header class="top"><div class="wrap bar"><a class="brand" href="{rad}"><img src="{rad}assets/img/sigla.png" alt="" width="36" height="37"><span class="bt"><b>Monitor local</b><span>Rădăuți · Asociația Rădăuțiul Civic</span></span></a>
<nav class="main" aria-label="Secțiuni"><a href="{rad}#acasa">Acasă</a><a href="{rad}#consiliu/hcl">Consiliul Local</a><a href="{rad}#primarie/buget">Primărie</a><a href="{rad}#achizitii/sicap">Achiziții publice</a><a href="{rad}#strada">Strada mea</a><a href="{rad}#cauta">Caută</a></nav></div></header>
<div class="wrap"><main id="app" class="static">
<div class="page-head"><h1>{ESC(titlu)}</h1><p>{ESC(descriere[:300])}</p></div>
<p><a class="btn ok" href="{rad}{spa}">Deschide în Monitor local, cu toate detaliile →</a></p>
{corp}
</main>
<footer><p>Un proiect al <a href="https://radautiulcivic.ro">Asociației Rădăuțiul Civic</a>, din documentele publice ale Primăriei Municipiului Rădăuți. Textul documentelor scanate e citit automat și poate avea greșeli; documentul-sursă e cel care contează.</p></footer>
</div></body></html>
"""


def _sectiune(titlu, interior):
    return f'<section class="card section"><h2>{ESC(titlu)}</h2>{interior}</section>' if interior else ""


def _tabel(randuri):
    return '<div class="tw"><table><tbody>' + "".join(f"<tr><th>{ESC(a)}</th><td>{b}</td></tr>" for a, b in randuri if b) + "</tbody></table></div>"


def _lk(url, text):
    return f'<a href="{ESC(url)}" rel="noopener">{ESC(text)}</a>' if url and str(url).startswith("http") else ""


def extras_hcl(text, maxim=1500):
    """Partea de după „adoptă prezenta hotărâre” (articolele), curățată; altfel începutul textului."""
    t = re.sub(r"[ \t]+", " ", text or "")
    m = re.search(r"(adopt[ăa]\s+prezenta\s+hot[ăa]r[âa]re|HOT[ĂA]R[ĂAÂ]ȘTE|HOTARASTE)\s*:?", t, re.I)
    t = t[m.end():] if m else t
    t = re.sub(r"\n{2,}", "\n", t).strip()
    return t if len(t) <= maxim else t[:maxim].rsplit(" ", 1)[0] + "..."


def construieste(db, data_dir, out_dir):
    """Scrie paginile în out_dir; întoarce lista de căi (pentru sitemap)."""
    def citeste(nume, implicit=None):
        for p in (os.path.join(data_dir, nume), os.path.join(data_dir, "intern-date", nume)):
            try:
                with open(p, encoding="utf-8") as f:
                    return json.load(f)
            except (OSError, ValueError):
                continue
        return implicit
    L = citeste("liste.json", {}) or {}
    V = citeste("voturi.json", {}) or {}
    C = citeste("componenta.json", {}) or {}
    T = citeste("teme.json", {}) or {}
    U = citeste("urbanism.json", {}) or {}
    SX = citeste("sicap-explorer.json", None)
    pagini = []

    def scrie(cale, continut):
        p = os.path.join(out_dir, cale)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        vechi = open(p, encoding="utf-8").read() if os.path.exists(p) else None
        if vechi != continut:
            with open(p, "w", encoding="utf-8") as f:
                f.write(continut)
        pagini.append(cale)

    # voturile, după hotărâre
    vot_hcl = {}
    for s in V.get("sedinte") or []:
        for v in s.get("voturi") or []:
            h = v.get("hcl")
            if h:
                vot_hcl[(int(h["an"]), int(h["nr"]))] = (s, v)
    texte = {}
    if db is not None:
        for an, nr, tp in db.execute("SELECT h.year, h.number, d.text_path FROM hcl h JOIN documents d ON d.url=h.pdf_url WHERE d.text_path IS NOT NULL"):
            texte[(an, nr)] = tp

    # ---- hotărâri
    pe_zi = {}
    for h in L.get("hcl") or []:
        an, nr = int(h["an"]), int(h["nr"])
        pe_zi.setdefault(h.get("data"), []).append(h)
        sv = vot_hcl.get((an, nr))
        vot = ""
        if sv:
            s, v = sv
            vot = ("unanimitate" if v.get("unanimitate") else f"pentru {v.get('pentru')}, împotrivă {v.get('impotriva')}, abțineri {v.get('abtineri')}") + \
                  (f"; împotrivă: {', '.join(v['nume_impotriva'])}" if v.get("nume_impotriva") else "") + \
                  (f"; abțineri: {', '.join(v['nume_abtineri'])}" if v.get("nume_abtineri") else "")
        text = ""
        if (an, nr) in texte:
            try:
                with open(texte[(an, nr)], encoding="utf-8") as f:
                    text = extras_hcl(f.read())
            except OSError:
                pass
        corp = _sectiune("Pe scurt", _tabel([
            ("Adoptată", ESC(zi(h.get("data"))) if h.get("data") else ""),
            ("Ședința", f'<a href="../sedinta/{ESC(h["data"])}.html">ședința din {ESC(zi(h["data"]))}</a>' if h.get("data") else ""),
            ("Publicată pe site", ESC(zi(h.get("postat"))) if h.get("postat") else ""),
            ("Votul (din procesul-verbal, citit automat)", ESC(vot)),
            ("Documentul", " · ".join(x for x in (_lk(h.get("pdf"), "PDF"), _lk(h.get("pagina"), "pagina de pe site-ul primăriei")) if x))]))
        if text:
            corp += _sectiune("Din textul hotărârii (citit automat)", f'<p style="white-space:pre-wrap">{ESC(text)}</p>')
        titlu = f"HCL {nr}/{an} Rădăuți"
        scrie(f"p/hcl/{an}-{nr}.html", pagina(titlu, h.get("titlu") or "", corp, f"#consiliu/hcl/{an}/{nr}", f"p/hcl/{an}-{nr}.html"))

    # ---- ședințe
    pv = {}
    for p in L.get("pv") or []:
        pv.setdefault(p.get("data"), []).append(p)
    sed_v = {s["data"]: s for s in V.get("sedinte") or []}
    for d in sorted(set(k for k in list(pe_zi) + list(pv) if k)):
        H = sorted(pe_zi.get(d, []), key=lambda h: int(h["nr"]))
        s = sed_v.get(d) or {}
        tip = TIP.get(s.get("tip") or (pv.get(d) or [{}])[0].get("tip"), "")
        corp = _sectiune("Hotărârile adoptate", "<ul>" + "".join(f'<li><a href="../hcl/{h["an"]}-{h["nr"]}.html">HCL {h["nr"]}/{h["an"]}</a>: {ESC(h.get("titlu"))}</li>' for h in H) + "</ul>" if H else "")
        if s:
            corp += _sectiune("Prezența (din procesul-verbal, citit automat)", _tabel([
                ("Prezenți", ESC(f"{s.get('prezenti')} din {s.get('in_functie')}" if s.get("prezenti") else "")),
                ("Absenți", ESC(", ".join(s.get("absenti") or []))), ("Voturi găsite", ESC(len(s.get("voturi") or [])))]))
        corp += _sectiune("Procesul-verbal", "<ul>" + "".join(f"<li>{_lk(p.get('pdf') or p.get('pagina'), p.get('titlu') or 'proces-verbal')}</li>" for p in pv.get(d, [])) + "</ul>" if pv.get(d) else "")
        titlu = f"Ședința {tip} a Consiliului Local Rădăuți din {zi(d)}".replace("  ", " ")
        scrie(f"p/sedinta/{d}.html", pagina(titlu, f"{len(H)} hotărâri adoptate. Ordinea de zi, voturile și procesul-verbal.", corp, f"#consiliu/sedinte/{d}", f"p/sedinta/{d}.html"))

    # ---- consilieri (componența actuală și toți cei din procesele-verbale)
    comp = {x.get("id"): x for x in C.get("consilieri") or [] if x.get("id")}
    for c in V.get("consilieri") or []:
        k = comp.get(c["id"]) or {}
        dec = "".join(f"<li>{_lk(d['url'], 'Declarația de avere ' + d['text'])}</li>" for d in k.get("avere") or []) + \
              "".join(f"<li>{_lk(d['url'], 'Declarația de interese ' + d['text'])}</li>" for d in k.get("interese") or [])
        corp = _sectiune("Pe scurt", _tabel([("Partidul", ESC(k.get("partid"))), ("Mandatele", ESC(", ".join(c.get("mandate") or []))),
                                             ("În consiliu", ESC("; ".join(f"{zi(p[0])} - {zi(p[1])}" for p in c.get("perioade") or [])))]))
        corp += _sectiune("Declarații de avere și de interese", f"<ul>{dec}</ul>" if dec else "")
        scrie(f"p/consilier/{c['id']}.html", pagina(f"{c['nume']}, consilier local Rădăuți", "Prezența la ședințe, voturile și declarațiile consilierului local, din documentele publice ale primăriei.",
                                                    corp, f"#consiliu/consilieri/{c['id']}", f"p/consilier/{c['id']}.html"))

    # ---- investiții
    for x in T.get("investitii") or []:
        sl = slug(x["nume"])
        corp = _sectiune("Hotărârile", "<ul>" + "".join(f'<li>{ESC(zi(p["data"]))}: <a href="../hcl/{p["an"]}-{p["nr"]}.html">HCL {p["nr"]}/{p["an"]}</a> ({ESC(p["pas"])})'
                                                         f'{" · " + lei(p["valoare"]) if p.get("valoare") else ""}</li>' for p in x["pasi"]) + "</ul>")
        if x.get("sicap"):
            corp += _sectiune("Achiziții din SICAP cu titlu asemănător", "<ul>" + "".join(f"<li>{ESC(zi(q['data']))}: {ESC(q['obiect'])} ({ESC(q['inst'])}){', ' + lei(q['lei']) if q.get('lei') else ''}</li>" for q in x["sicap"]) + "</ul>")
        scrie(f"p/investitie/{sl}.html", pagina(f"Investiția „{x['nume'][:90]}”, Rădăuți", f"Hotărârile consiliului local despre obiectivul de investiții „{x['nume']}”" +
                                               (f", valoare aprobată {lei(x['valoare'])}" if x.get("valoare") else "") + ".", corp, "#primarie/investitii", f"p/investitie/{sl}.html"))

    # ---- străzi (din registrele de urbanism și hotărârile despre terenuri și clădiri)
    strazi = {}
    for t in ("ac", "cu"):
        for a in U.get(t) or []:
            if a.get("strada"):
                strazi.setdefault(slug(a["strada"]), {"nume": a["strada"], "acte": [], "pat": []})["acte"].append((t, a))
    for x in T.get("patrimoniu") or []:
        if x.get("strada") and slug(x["strada"]) in strazi:
            strazi[slug(x["strada"])]["pat"].append(x)
    for sl, s in strazi.items():
        if len(s["acte"]) < 2 and not s["pat"]:
            continue
        acte = sorted(s["acte"], key=lambda z: z[1].get("data") or "", reverse=True)
        corp = _sectiune("Autorizații de construire și certificate de urbanism", f'<p>{len([1 for t, _ in acte if t == "ac"])} autorizații și {len([1 for t, _ in acte if t == "cu"])} certificate în registrele publicate de primărie.</p><ul>' +
                         "".join(f"<li>{'AC' if t == 'ac' else 'CU'} {ESC(a.get('nr') or '')}, {ESC(zi(a.get('data')))}: {ESC((a.get('scop') or a.get('categorie') or '')[:200])}</li>" for t, a in acte[:40]) + "</ul>")
        corp += _sectiune("Hotărâri despre terenuri și clădiri", "<ul>" + "".join(f'<li><a href="../hcl/{x["an"]}-{x["nr"]}.html">HCL {x["nr"]}/{x["an"]}</a>: {ESC(x["titlu"][:240])}</li>' for x in s["pat"]) + "</ul>" if s["pat"] else "")
        scrie(f"p/strada/{sl}.html", pagina(f"Strada {s['nume']}, Rădăuți: ce se construiește și ce s-a hotărât", f"Autorizațiile de construire, certificatele de urbanism și hotărârile despre strada {s['nume']} din Rădăuți.",
                                            corp, f"#strada?s={s['nume']}", f"p/strada/{sl}.html"))

    # ---- firme (furnizorii din SICAP cu CUI)
    if SX:
        inst, furn = SX["inst"], SX["furn"]
        pe_f = {}
        for r in SX.get("da") or []:
            if r[11] and r[9] < 2 and r[3] >= 0:
                pe_f.setdefault(r[3], []).append((r[2], r[7], r[5], inst[r[1]][1], "achiziție directă"))
        for r in SX.get("can") or []:
            if r[10] >= 0 and r[12] != 2:
                pe_f.setdefault(r[10], []).append((r[2], r[6], r[4], inst[r[1]][1], "contract atribuit"))
        for fi, rows in pe_f.items():
            cui, nume = furn[fi]
            if not cui or not nume:
                continue
            rows.sort(key=lambda z: z[0] or "", reverse=True)
            tot = sum(z[2] or 0 for z in rows)
            corp = _sectiune("Pe scurt", _tabel([("CUI", ESC(cui)), ("Total", ESC(lei(tot))), ("Achiziții și contracte", ESC(len(rows))),
                                                 ("Instituții", ESC(", ".join(sorted({z[3] for z in rows}))[:400]))]))
            corp += _sectiune("Cele mai recente", "<ul>" + "".join(f"<li>{ESC(zi(z[0]))}: {ESC(z[1][:200])} ({ESC(z[3])}, {ESC(z[4])}){', ' + lei(z[2]) if z[2] else ''}</li>" for z in rows[:40]) + "</ul>")
            scrie(f"p/firma/{cui}.html", pagina(f"{nume} (CUI {cui}): achiziții de la instituțiile din Rădăuți", f"Tot ce a vândut {nume} primăriei și instituțiilor din Rădăuți prin SICAP: {len(rows)} achiziții și contracte, {lei(tot)}.",
                                                corp, f"#achizitii/sicap/furnizor/{cui}", f"p/firma/{cui}.html"))
    return pagini


def scrie(store, data_dir, azi=None):
    out = os.path.join(data_dir, "static")
    pagini = construieste(store.db if store else None, data_dir, out)
    # paginile care nu mai există (ex. o firmă fără achiziții încheiate) ies din folder
    pastrate = set(pagini)
    for dp, _, fs in os.walk(os.path.join(out, "p")):
        for f in fs:
            rel = os.path.relpath(os.path.join(dp, f), out).replace(os.sep, "/")
            if rel not in pastrate:
                os.remove(os.path.join(dp, f))
    azi = (azi or date.today()).isoformat()
    harta = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
             f"<url><loc>{SITE}/</loc><lastmod>{azi}</lastmod><priority>1.0</priority></url>"]
    harta += [f"<url><loc>{SITE}/{p}</loc></url>" for p in sorted(pagini)]
    harta.append("</urlset>")
    with open(os.path.join(out, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(harta) + "\n")
    with open(os.path.join(out, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(f"User-agent: *\nAllow: /\nDisallow: /intern/\n\nSitemap: {SITE}/sitemap.xml\n")
    tipuri = {}
    for p in pagini:
        tipuri[p.split("/")[1]] = tipuri.get(p.split("/")[1], 0) + 1
    return tipuri
