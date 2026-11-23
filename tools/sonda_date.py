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
