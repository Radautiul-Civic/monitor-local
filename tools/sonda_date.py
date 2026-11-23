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
