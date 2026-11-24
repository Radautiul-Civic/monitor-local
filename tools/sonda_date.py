"""Fragmente din textele publice colectate (procese-verbale, hotărâri), pentru dezvoltare. Vezi sonda-date.yml."""
import os
import re
import sqlite3
import sys

c = sqlite3.connect("data/monitor.sqlite")
fel, _, arg = sys.argv[1].partition(" ")


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
            print(t[: int(lung or 30000)])
elif fel in ("pv-grep", "hcl-grep"):
    rx, n = re.compile(arg, re.I), 0
    src = texte("pv", "session_date") if fel == "pv-grep" else texte("hcl", "adoption_date")
    for d, tp, t in src:
        for m in rx.finditer(t):
            print(d, "|", re.sub(r"\s+", " ", t[max(0, m.start() - 100): m.end() + 200]))
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
            print(t[: int(lung or 20000)])
            n += 1
            if n >= 6:
                break
elif fel == "termo":   # seria prețurilor la termoficare (date publice, data/termoficare.json)
    import json
    d = json.load(open("data/termoficare.json", encoding="utf-8"))
    for p in d.get("preturi") or []:
        print(p.get("de_la"), p.get("pana_la"), "| pop", p.get("populatie_cu_tva"), "| sub", p.get("subventie_cu_tva"), "| tot", p.get("total_cu_tva"), "| tva", p.get("tva"), "| hcl", (p.get("hcl") or {}).get("nr"), "/", (p.get("hcl") or {}).get("an"))
    for h in d.get("hotarari") or []:
        if h.get("pierderi_lei"):
            print("PIERDERI", h["an"], h["nr"], h["pierderi_lei"], h.get("pe_scurt", "")[:120])
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
