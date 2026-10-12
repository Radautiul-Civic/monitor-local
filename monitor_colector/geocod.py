"""Coordonatele adreselor din registrele de urbanism, pentru harta certificatelor și autorizațiilor.

Sursa: Nominatim (OpenStreetMap), cu regulile lui de folosire: cel mult o cerere pe secundă, un
User-Agent care ne identifică, rezultatele păstrate (fiecare adresă se caută o singură dată).
Căutăm întâi strada cu numărul; dacă numărul nu e găsit, pinul se pune pe stradă (precizie „stradă”).
Rezultatele din afara Rădăuțiului sunt ignorate.
"""
import logging
import re
import time
import unicodedata
from datetime import date

import requests

from . import config

log = logging.getLogger(__name__)

URL = "https://nominatim.openstreetmap.org/search"
# Rădăuți: lon_min, lat_max, lon_max, lat_min (formatul viewbox al Nominatim)
VIEWBOX = "25.86,47.89,25.99,47.80"
LAT, LON = (47.80, 47.89), (25.86, 25.99)
SCHEMA = """
CREATE TABLE IF NOT EXISTS geocod (cheie TEXT PRIMARY KEY, lat REAL, lon REAL, la TEXT);
"""


def init(db):
    db.executescript(SCHEMA)


def _n(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9 ]+", " ", s)).strip().upper()


def numar(adresa):
    """Numărul poștal din adresă („nr. 130 B” -> „130B”); None pentru FN sau lipsă."""
    m = re.search(r"\bnr\.?\s*:?\s*(\d{1,4})\s*([A-Za-z](?![a-z]))?", adresa or "", re.I)
    if not m:
        return None
    return m.group(1) + (m.group(2) or "").upper()


def in_radauti(adresa):
    a = _n(adresa)
    return not a or "RADAUTI" in a


def cheie(strada, nr=None):
    return _n(strada) + ("|" + nr if nr else "")


class Client:
    def __init__(self, session=None, delay=1.1):
        self.s = session or requests.Session()
        if not session:
            self.s.headers.update({"User-Agent": config.USER_AGENT, "Accept-Language": "ro"})
        self.delay, self._t, self.cereri = delay, 0.0, 0

    def cauta(self, strada, nr=None):
        w = self.delay - (time.monotonic() - self._t)
        if w > 0:
            time.sleep(w)
        self._t = time.monotonic()
        self.cereri += 1
        params = {"street": f"{nr} {strada}" if nr else strada, "city": "Rădăuți", "county": "Suceava",
                  "country": "Romania", "format": "jsonv2", "limit": 1, "viewbox": VIEWBOX, "bounded": 1}
        r = self.s.get(URL, params=params, timeout=60)
        r.raise_for_status()
        for x in r.json() or []:
            lat, lon = float(x["lat"]), float(x["lon"])
            if LAT[0] <= lat <= LAT[1] and LON[0] <= lon <= LON[1]:
                return lat, lon
        return None


def adrese(db):
    """(strada, număr) pentru actele de urbanism din Rădăuți, cele mai noi întâi."""
    import json
    out, vazute = [], set()
    for r in db.execute("SELECT date_json FROM urbanism_acte ORDER BY data DESC"):
        a = json.loads(r[0])
        st = a.get("strada")
        if not st or not in_radauti(a.get("adresa")):
            continue
        k = (st, numar(a.get("adresa")))
        if k not in vazute:
            vazute.add(k)
            out.append(k)
    return out


def geocodeaza(store, cl=None, minute=20, maxim=None):
    db = store.db
    init(db)
    cl = cl or Client()
    gata = {r[0] for r in db.execute("SELECT cheie FROM geocod")}
    st = {"adrese": 0, "noi": 0, "gasite": 0, "pe_strada": 0, "negasite": 0}
    t_end = time.monotonic() + minute * 60
    gasit = {}
    for strada, nr in adrese(db):
        st["adrese"] += 1
        if time.monotonic() > t_end or (maxim and cl.cereri >= maxim):
            st["oprit_la_limita"] = True
            break
        kn, ks = (cheie(strada, nr) if nr else None), cheie(strada)
        try:
            if kn:
                if kn not in gata:
                    p = cl.cauta(strada, nr)
                    _salveaza(db, kn, p)
                    gata.add(kn)
                    st["noi"] += 1
                    st["gasite"] += int(bool(p))
                if gasit.get(kn) or db.execute("SELECT lat FROM geocod WHERE cheie=?", (kn,)).fetchone()[0] is not None:
                    gasit[kn] = True
                    continue
            if ks not in gata:   # numărul nu e pe hartă: punem pinul pe stradă
                p = cl.cauta(strada)
                _salveaza(db, ks, p)
                gata.add(ks)
                st["noi"] += 1
                st["pe_strada" if p else "negasite"] += 1
        except Exception as e:
            log.warning("geocodare %s: %s", kn or ks, e)
            st["eroare"] = str(e)[:200]
            db.commit()
            break
        db.commit()
    st["cereri"] = cl.cereri
    return st


def _salveaza(db, k, p):
    db.execute("INSERT OR REPLACE INTO geocod VALUES (?,?,?,?)",
               (k, p[0] if p else None, p[1] if p else None, date.today().isoformat()))


def coordonate(db):
    """{cheie: (lat, lon)} pentru exportul registrelor."""
    init(db)
    return {r[0]: (r[1], r[2]) for r in db.execute("SELECT cheie, lat, lon FROM geocod WHERE lat IS NOT NULL")}


def pentru(coord, strada, adresa):
    """(lat, lon, precizie) pentru un act, din coordonatele deja găsite."""
    if not strada or not in_radauti(adresa):
        return None
    nr = numar(adresa)
    if nr and cheie(strada, nr) in coord:
        la, lo = coord[cheie(strada, nr)]
        return round(la, 5), round(lo, 5), "adresă"
    if cheie(strada) in coord:
        la, lo = coord[cheie(strada)]
        return round(la, 5), round(lo, 5), "stradă"
    return None
