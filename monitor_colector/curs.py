"""Cursul de schimb BNR EUR/RON, ca sumele din SICAP să poată fi afișate și în euro.

Sursa: fișierele anuale publice ale BNR (https://www.bnr.ro/files/xml/years/nbrfxrates<an>.xml),
cu cursul din fiecare zi bancară. Anii încheiați se descarcă o singură dată; anul curent
se reîmprospătează la fiecare rulare. Pentru o zi fără curs (weekend, sărbătoare) se folosește
ultimul curs publicat înainte de acea zi, ca în practica BNR.
"""
import bisect
import logging
import xml.etree.ElementTree as ET
from datetime import date

import requests

from . import config

log = logging.getLogger(__name__)

URL = "https://www.bnr.ro/files/xml/years/nbrfxrates{an}.xml"
SCHEMA = "CREATE TABLE IF NOT EXISTS curs_bnr (data TEXT PRIMARY KEY, eur REAL);"


def init(db):
    db.executescript(SCHEMA)


def parse(xml_bytes, moneda="EUR"):
    """[(„2024-01-03”, 4.9725), ...] din fișierul XML al BNR."""
    out = []
    root = ET.fromstring(xml_bytes)
    for cube in root.iter():
        if not cube.tag.endswith("Cube") or "date" not in cube.attrib:
            continue
        for rate in cube:
            if rate.tag.endswith("Rate") and rate.attrib.get("currency") == moneda:
                try:
                    v = round(float(rate.text) / float(rate.attrib.get("multiplier") or 1), 6)
                except (TypeError, ValueError):
                    continue
                out.append((cube.attrib["date"][:10], v))
    return out


def actualizeaza(db, de_la=2018, azi=None, session=None):
    """Descarcă anii lipsă și anul curent. Întoarce numărul de zile cu curs din bază."""
    init(db)
    azi = azi or date.today()
    s = session or requests.Session()
    if not session:
        s.headers.update({"User-Agent": config.USER_AGENT})
    for an in range(de_la, azi.year + 1):
        are = db.execute("SELECT COUNT(*) FROM curs_bnr WHERE data LIKE ?", (f"{an}-%",)).fetchone()[0]
        if an < azi.year and are >= 240:
            continue
        try:
            r = s.get(URL.format(an=an), timeout=60)
            r.raise_for_status()
            zile = parse(r.content)
        except Exception as e:   # BNR indisponibil: rămâne cursul deja salvat (sau rezerva din SICAP)
            log.warning("curs BNR %s: %s", an, e)
            continue
        db.executemany("INSERT OR REPLACE INTO curs_bnr VALUES (?,?)", zile)
        db.commit()
    return db.execute("SELECT COUNT(*) FROM curs_bnr").fetchone()[0]


class Curs:
    """Cursul EUR/RON dintr-o zi; fără date BNR, o rezervă pe an (dată din afară, ex. din SICAP)."""

    def __init__(self, db, rezerva_pe_an=None):
        init(db)
        rows = db.execute("SELECT data, eur FROM curs_bnr ORDER BY data").fetchall()
        self.zile = [r[0] for r in rows]
        self.val = [r[1] for r in rows]
        self.rezerva = dict(rezerva_pe_an or {})

    def rata(self, data_iso):
        if not data_iso:
            return None
        d = data_iso[:10]
        i = bisect.bisect_right(self.zile, d) - 1
        try:
            gol = (date.fromisoformat(d) - date.fromisoformat(self.zile[i])).days if i >= 0 else None
        except ValueError:
            return None
        if gol is not None and gol <= 10:      # ziua însăși sau ultima zi bancară dinainte
            return self.val[i]
        return self.rezerva.get(d[:4])

    def eur(self, lei, data_iso):
        r = self.rata(data_iso)
        return round(lei / r, 2) if (lei is not None and r) else None

    def medii_anuale(self):
        acc = {}
        for d, v in zip(self.zile, self.val):
            acc.setdefault(d[:4], []).append(v)
        out = {y: round(sum(v) / len(v), 4) for y, v in acc.items()}
        for y, v in self.rezerva.items():
            out.setdefault(y, round(v, 4))
        return dict(sorted(out.items()))

    @property
    def sursa(self):
        return "BNR" if self.zile else ("SICAP" if self.rezerva else None)
