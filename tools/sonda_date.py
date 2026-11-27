"""Fragmente din textele publice colectate (procese-verbale, hotărâri), pentru dezvoltare. Vezi sonda-date.yml."""
import os
import re
import sqlite3
import sys

c = sqlite3.connect("data/monitor.sqlite")
fel, _, arg = sys.argv[1].partition(" ")


# jurnalele fluxurilor sunt vizibile: CNP-urile, seriile de buletin și adresele personale se ascund la afișare
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from monitor_colector.ascunde import ascunde  # noqa: E402


def texte(tabel, data_col):
    for d, tp in c.execute(f"SELECT t.{data_col}, d.text_path FROM documents d JOIN {tabel} t ON t.wp_id=d.wp_id "
                           f"WHERE d.text_path IS NOT NULL ORDER BY t.{data_col}"):
        if tp and os.path.exists(tp):
            with open(tp, encoding="utf-8", errors="replace") as f:
                yield d, tp, f.read()


if fel == "pv-text":
    zi, _, lung = arg.partition(" ")
    for d, tp, t in texte("pv", "session_date"):
        if d == zi:
            print("=====", tp, len(t))
            print(ascunde(t[: int(lung or 30000)]))
elif fel in ("pv-grep", "hcl-grep"):
    rx, n = re.compile(arg, re.I), 0
    src = texte("pv", "session_date") if fel == "pv-grep" else texte("hcl", "adoption_date")
    for d, tp, t in src:
        for m in rx.finditer(t):
            print(d, "|", ascunde(re.sub(r"\s+", " ", t[max(0, m.start() - 100): m.end() + 200])))
            n += 1
            if n >= 400:
                raise SystemExit
elif fel == "vorbitori":   # câte intervenții și inițiative găsește extragerea, pe ani, și câteva exemple
    from collections import Counter
    sys.path.insert(0, ".")
    from monitor_colector import voturi as V
    pe_an, init_an, ex = Counter(), Counter(), []
    for d, tp, t in texte("pv", "session_date"):
        v, i = V.vorbitori(t), V.initiatori(t)
        pe_an[d[:4]] += sum(v.values())
        init_an[d[:4]] += len(i)
        if d[:4] == (arg or "2023"):
            ex.append((d, v, i))
    print("interventii pe ani:", dict(sorted(pe_an.items())))
    print("proiecte cu initiatori consilieri pe ani:", dict(sorted(init_an.items())))
    for d, v, i in ex[:40]:
        print(d, v, i)
elif fel == "doc-text":   # textul documentelor publice care conțin expresia (ex. numărul unui proiect), primele N caractere din fiecare
    rx, _, lung = arg.partition(" ")
    rx = re.compile(rx, re.I)
    n = 0
    for url, tp in c.execute("SELECT url, text_path FROM documents WHERE text_path IS NOT NULL ORDER BY rowid DESC"):
        if not tp or not os.path.exists(tp):
            continue
        with open(tp, encoding="utf-8", errors="replace") as f:
            t = f.read()
        if rx.search(t) or rx.search(url):
            print("=====", url, len(t))
            print(ascunde(t[: int(lung or 20000)]))
            n += 1
            if n >= 6:
                break
elif fel == "pdf-campuri":   # câmpurile de formular dintr-un PDF (ex. bilanțurile depuse pe formularul ANAF)
    from pypdf import PdfReader
    rx = re.compile(arg, re.I)
    for url, lp in c.execute("SELECT url, local_path FROM documents WHERE local_path IS NOT NULL"):
        if not rx.search(url) or not lp or not os.path.exists(lp):
            continue
        r = PdfReader(lp)
        f = r.get_fields() or {}
        print("=====", url, "câmpuri:", len(f), "| xfa:", bool(r.xfa))
        n = 0
        for k, v in f.items():
            val = v.get("/V")
            if val not in (None, "", "/Off"):
                print(k, "=", ascunde(str(val))[:120], "|", str(v.get("/TU") or "")[:80])
                n += 1
                if n >= 400:
                    break
        break
elif fel == "spus-stare":   # registrul intern „Cine ce a spus”: doar totaluri și numele nepotrivite (jurnalul e public, analiza nu)
    import json
    d = json.load(open("data/_intern/interventii-index.json", encoding="utf-8"))
    P = d["persoane"]
    print("generat:", d["generat_la"], "| pe ani:", d["ani"], "| persoane:", len(P))
    print("legate de un consilier:", sum(1 for p in P if p["id"]), "| pe roluri:", {r: sum(1 for p in P if p["rol"] == r) for r in sorted({p["rol"] for p in P})})
    print("ponderea intervențiilor legate de un consilier sau de o funcție:", round(100 * sum(p["n"] for p in P if p["id"] or p["rol"] != "altul") / max(1, sum(p["n"] for p in P))), "%")
    print("nume nepotrivite cu un consilier (în ordine alfabetică):")
    print("; ".join(sorted(p["nume"] for p in P if not p["id"] and p["rol"] == "altul")))
    print("consilieri din fișe:", "; ".join(sorted(c["nume"] for c in json.load(open("data/intern-date/voturi.json", encoding="utf-8")).get("consilieri", []))))
elif fel == "pat-stare":   # terenuri și clădiri: totaluri pe ani și lista hotărârilor de licitație (date publice, din teme.json)
    import json
    from collections import Counter
    P = json.load(open("data/teme.json", encoding="utf-8")).get("patrimoniu") or []
    print("total:", len(P), "| pe ani:", dict(sorted(Counter(str(x["an"]) for x in P).items())))
    print("fel:", dict(Counter(x["fel"] for x in P)), "| mod:", dict(Counter(x.get("mod") for x in P)), "| beneficiar:", dict(Counter(x.get("benef_tip") for x in P)))
    print("cu valoare:", sum(1 for x in P if x.get("valoare")), "| stare:", dict(Counter(x.get("stare") for x in P)))
    print("--- licitații (vânzare, concesionare, închiriere), fără modificări și respingeri:")
    for x in sorted(P, key=lambda x: (x["an"], x["nr"])):
        if x.get("mod") == "licitatie" and x["fel"] in ("vanzare", "concesionare", "inchiriere") and not x.get("stare"):
            print(f"{x['nr']}/{x['an']} | {x.get('data') or ''} | {x['fel']} | {x.get('valoare') or ''} {x.get('moneda') or ''}{x.get('val_unitate') or ''} | {x['titlu'][:230]}")
elif fel == "pv-lista":   # data ședinței -> fișierul procesului-verbal (pentru citări)
    for d, url in c.execute("SELECT t.session_date, d.url FROM documents d JOIN pv t ON t.wp_id=d.wp_id ORDER BY t.session_date"):
        print(d, "|", url.rsplit("/", 1)[-1])
elif fel == "doc-grep":   # toate documentele (hotărâri, proiecte, procese-verbale, anexe): expresia, cu contextul ei și documentul
    rx, n = re.compile(arg, re.I), 0
    for url, tp, src, d in c.execute("SELECT d.url, d.text_path, p.source, p.date FROM documents d LEFT JOIN posts p ON p.wp_id=d.wp_id "
                                     "WHERE d.text_path IS NOT NULL ORDER BY p.date"):
        if not tp or not os.path.exists(tp):
            continue
        with open(tp, encoding="utf-8", errors="replace") as f:
            t = f.read()
        for m in rx.finditer(t):
            print((d or "")[:10], "|", src, "|", url.rsplit("/", 1)[-1][:70], "|", ascunde(re.sub(r"\s+", " ", t[max(0, m.start() - 250): m.end() + 350])))
            n += 1
            if n >= 120:
                raise SystemExit
elif fel in ("sc-lista", "sc-grep", "sc-text"):   # documentele Servicii Comunale (serviciicomunale.ro)
    rows = c.execute("SELECT p.date, p.title, p.link, p.categories, p.content_html, d.url, d.link_text, d.text_path, d.text_layer, d.ocr_at, d.pages "
                     "FROM posts p LEFT JOIN documents d ON d.wp_id=p.wp_id WHERE p.source='comunale' ORDER BY p.date").fetchall()
    if fel == "sc-lista":
        print("articole:", len({r[2] for r in rows}), "| documente:", sum(1 for r in rows if r[5]), "| cu text:", sum(1 for r in rows if r[7]))
        for r in rows:
            stare = ("text" if r[8] else ("OCR" if r[9] else "scanat, fără OCR încă")) if r[7] or r[9] else ("nedescărcat" if r[5] else "-")
            print((r[0] or "")[:10], "|", r[3], "|", r[1][:90], "|", (r[5] or "").rsplit("/", 1)[-1][:80], "|", r[10] or "", "pag |", stare)
    else:
        rx, _, lung = arg.partition(" ") if fel == "sc-text" else (arg, "", "")
        rx, n, vazute = re.compile(rx, re.I), 0, set()
        docs_vazute = set()
        for r in rows:
            if r[5]:   # același fișier legat din două locuri (articol și biblioteca de fișiere): o singură dată
                k = re.sub(r"^https?://(www\.)?", "", r[5]).lower()
                if k in docs_vazute:
                    continue
                docs_vazute.add(k)
            t = ""
            if r[7] and os.path.exists(r[7]):
                with open(r[7], encoding="utf-8", errors="replace") as f:
                    t = f.read()
            if r[2] not in vazute:   # și textul articolului (anunțurile fără document)
                vazute.add(r[2])
                t = re.sub(r"<[^>]+>", " ", r[4] or "") + "\n" + t
            if fel == "sc-text":
                if rx.search(t) or rx.search(r[1] or "") or rx.search(r[5] or ""):
                    print("=====", (r[0] or "")[:10], "|", r[1], "|", r[5] or r[2], len(t))
                    print(ascunde(t[: int(lung or 20000)]))
                    n += 1
                    if n >= 8:
                        break
                continue
            for m in rx.finditer(t):
                print((r[0] or "")[:10], "|", (r[5] or r[2]).rsplit("/", 1)[-1][:70], "|", ascunde(re.sub(r"\s+", " ", t[max(0, m.start() - 250): m.end() + 350])))
                n += 1
                if n >= 150:
                    raise SystemExit
elif fel == "termo":   # seria prețurilor la termoficare (date publice, data/termoficare.json)
    import json
    d = json.load(open("data/termoficare.json", encoding="utf-8"))
    for p in d.get("preturi") or []:
        print(p.get("de_la"), p.get("pana_la"), "| pop", p.get("populatie_cu_tva"), "| sub", p.get("subventie_cu_tva"), "| tot", p.get("total_cu_tva"), "| tva", p.get("tva"), "| hcl", (p.get("hcl") or {}).get("nr"), "/", (p.get("hcl") or {}).get("an"))
    for h in d.get("hotarari") or []:
        if h.get("pierderi_lei"):
            print("PIERDERI", h["an"], h["nr"], h["pierderi_lei"], h.get("pe_scurt", "")[:120])
elif fel == "stare":   # verificare după colectare: ce chei au fișierele publice și câte rapoarte au rămas fără an
    import json
    t = json.load(open("data/teme.json", encoding="utf-8"))
    print("teme.json", t.get("generat_la"), sorted(t))
    print("salubrizare:", json.dumps(t.get("salubrizare"), ensure_ascii=False)[:400])
    print("servicii:", sorted(t.get("servicii") or {}))
    tf = json.load(open("data/termoficare.json", encoding="utf-8"))
    print("termoficare.json", sorted(tf), "| pierderi:", json.dumps(tf.get("pierderi"), ensure_ascii=False)[:200])
    L = (t.get("rapoarte") or {}).get("lista") or []
    for f in sorted({x.get("fel") for x in L}, key=str):
        g = [x for x in L if x.get("fel") == f]
        print("rapoarte", f, len(g), "fără an:", sum(1 for x in g if not x.get("an")))
    for x in [x for x in L if x.get("fel") == "consilieri" and not x.get("an")][:12]:
        print("  fără an:", (x.get("titlu") or "")[:110])
elif fel == "rapoarte":   # titlurile rapoartelor publice (pagina „Rapoarte” a primăriei) și felul dat de monitor
    import json
    d = json.load(open("data/teme.json", encoding="utf-8")).get("rapoarte") or {}
    for x in d.get("lista") or []:
        print(x.get("fel"), "|", x.get("an"), "|", (x.get("titlu") or "")[:150], "|", (x.get("pagina") or "")[-80:])
elif fel == "rapoarte-text":   # rapoartele fără an în titlu: are text? ce scrie la început?
    rows = c.execute("SELECT d.url, d.link_text, d.text_path, d.pages FROM documents d JOIN posts p ON p.wp_id=d.wp_id WHERE p.source='rapoarte'").fetchall()
    fara, cu_text = 0, 0
    for url, lt, tp, pg in rows:
        if re.search(r"\b20[0-3]\d\b", lt or ""):
            continue
        fara += 1
        t = open(tp, encoding="utf-8", errors="replace").read() if tp and os.path.exists(tp) else ""
        cu_text += bool(t.strip())
        print("#####", (lt or "")[:90], "|", url.rsplit("/", 1)[-1][:60], "| pagini", pg, "| text", len(t))
        print("   ", re.sub(r"\s+", " ", t[:500]))
    print("fara an in titlu:", fara, "cu text:", cu_text, "din", len(rows))
elif fel == "componenta":   # consilierii de pe pagina primăriei: partid, poză
    import json
    for x in json.load(open("data/componenta.json", encoding="utf-8")).get("consilieri") or []:
        print(x.get("nume"), "|", x.get("id"), "|", x.get("partid"), "|", "foto" if x.get("foto") else "FARA FOTO", "|", "iesit" if x.get("iesit") else "")
elif fel == "salub":   # salubrizarea: fragmentele din hotărârile de taxe și textul hotărârilor despre tarife
    import json as _j
    try:
        T = _j.load(open("data/teme.json", encoding="utf-8")).get("taxe") or {}
        for an in sorted(T):
            print("TEME", an, (T[an].get("indicatori") or {}).get("salubrizare_pf_lei_persoana_luna"), ((T[an].get("ai") or {}).get("indicatori") or {}).get("salubrizare_pf"))
    except Exception as e:   # noqa: BLE001
        print("teme.json:", e)
    for an, nr, d, titlu, tp in c.execute("SELECT h.year, h.number, h.adoption_date, h.title, d.text_path FROM hcl h JOIN documents d ON d.url=h.pdf_url "
                                          "WHERE d.text_path IS NOT NULL ORDER BY h.adoption_date"):
        tl = (titlu or "").lower()
        if not tp or not os.path.exists(tp):
            continue
        t = open(tp, encoding="utf-8", errors="replace").read()
        if re.search(r"impozit|taxe(lor)? local", tl):
            for m in re.finditer(r"salubriz", t, re.I):
                print("TAXE", an, nr, d, "|", re.sub(r"\s+", " ", t[max(0, m.start() - 250): m.end() + 450]))
        elif re.search(r"salubriz|deseur|deșeur|colectare", tl) and re.search(r"tarif|tax|cantit|pret|preț|act\w* adi", tl):
            print("=====", an, nr, d, titlu)
            print(re.sub(r"[ \t]+", " ", t[: int(arg or 6000)]))
elif fel == "hcl-titlu":   # textul hotărârilor al căror titlu se potrivește (regex), primele N caractere din fiecare
    rx, _, lung = arg.partition(" ")
    rx = re.compile(rx, re.I)
    for an, nr, d, titlu, tp in c.execute("SELECT h.year, h.number, h.adoption_date, h.title, d.text_path FROM hcl h JOIN documents d ON d.url=h.pdf_url "
                                          "WHERE d.text_path IS NOT NULL ORDER BY h.year, h.number"):
        if titlu and rx.search(titlu) and tp and os.path.exists(tp):
            t = open(tp, encoding="utf-8", errors="replace").read()
            print("=====", an, nr, d, re.sub(r"\s+", " ", titlu)[:250], len(t))
            print(re.sub(r"[ \t]+", " ", t[: int(lung or 8000)]))
