"""Colectarea de pe site-urile primăriilor care nu folosesc același șablon WordPress ca Rădăuțiul și Fălticeniul.

Fiecare oraș are o funcție care citește paginile lui și întoarce documentele găsite: hotărâri (cu număr, an și, când
se poate, data adoptării), procese-verbale, proiecte, convocări. Documentele intră în aceeași bază de date ca la
Rădăuți (o „postare” pe document, legată de pagina din care vine), ca descărcarea și extragerea textului să meargă
la fel.

  python -m monitor_colector.alte_orase vatradornei | campulung
"""
import argparse
import json
import logging
import re
import sys
import time
from html.parser import HTMLParser
from urllib.parse import urljoin, unquote

import requests

from . import config
from .collect import _pseudo_post, _sid
from .parse import norm

log = logging.getLogger("alte_orase")
DOC = re.compile(r"\.(pdf|docx?|odt)(?:$|\?)", re.I)
LUNI = {"ianuarie": 1, "februarie": 2, "martie": 3, "aprilie": 4, "mai": 5, "iunie": 6, "iulie": 7, "august": 8,
        "septembrie": 9, "octombrie": 10, "noiembrie": 11, "decembrie": 12}


class Linkuri(HTMLParser):
    """Linkurile unei pagini, fiecare cu textul lui și cu ultimul titlu de secțiune (h1-h6, summary, buton de tab) dinainte."""
    TITLURI = {"h1", "h2", "h3", "h4", "h5", "h6", "summary", "button"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.linkuri, self.titlu, self._t, self._a = [], "", None, None

    def handle_starttag(self, tag, attrs):
        if tag in self.TITLURI:
            self._t = []
        if tag == "a":
            self._a = [dict(attrs).get("href") or "", []]

    def handle_data(self, data):
        if self._t is not None:
            self._t.append(data)
        if self._a is not None:
            self._a[1].append(data)

    def handle_endtag(self, tag):
        if tag in self.TITLURI and self._t is not None:
            t = " ".join("".join(self._t).split())
            if t:
                self.titlu = t
            self._t = None
        if tag == "a" and self._a is not None:
            self.linkuri.append((self._a[0], " ".join("".join(self._a[1]).split()), self.titlu))
            self._a = None


def linkuri(html, baza):
    p = Linkuri()
    p.feed(html or "")
    return [(urljoin(baza, h), t, s) for h, t, s in p.linkuri if h and not h.startswith(("mailto:", "tel:", "javascript:"))]


def data_din(text):
    """Prima dată dintr-un text: 25.02.2026, 25-02-2026, „25 februarie 2026”."""
    t = norm(unquote(text or ""))
    m = re.search(r"(\d{1,2})[.\-/_](\d{1,2})[.\-/_](20\d\d)", t)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.search(r"(\d{1,2})[\s\-_]+(" + "|".join(LUNI) + r")[\s\-_]+(20\d\d)", t)
    if m:
        return f"{m.group(3)}-{LUNI[m.group(2)]:02d}-{int(m.group(1)):02d}"
    return None


class Sesiune:
    def __init__(self, delay=config.REQUEST_DELAY):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = config.USER_AGENT
        self.delay = delay

    def html(self, url):
        time.sleep(self.delay)
        r = self.s.get(url, timeout=config.TIMEOUT)
        r.raise_for_status()
        r.encoding = r.encoding if r.encoding and r.encoding.lower() != "iso-8859-1" else "utf-8"
        return r.text


# ---------------------------------------------------------------- Vatra Dornei (WordPress, pagini cu liste pe ani)

def vatradornei(ses, baza="https://primariavatradornei.ro"):
    """Pagina „Consiliu local”: hotărârile pe ani („HOTĂRÂREA NR. 28” sub titlul „2026”), procesele-verbale, ședințele."""
    pag = baza + "/consiliu-local/"
    out = []
    for url, text, sec in linkuri(ses.html(pag), pag):
        if not DOC.search(url):
            continue
        tn, sn, fn = norm(text), norm(sec), norm(unquote(url.rsplit("/", 1)[-1]))
        an = re.search(r"\b(20\d\d)\b", sec) or re.search(r"/uploads/(20\d\d)/", url)
        m = re.search(r"hotarare\w*\s*nr\.?\s*(\d{1,4})", tn) or re.search(r"\bhcl[\s_-]*0*(\d{1,4})\b", fn)
        if m and re.match(r"20\d\d$", sec.strip()):
            out.append({"sursa": "hcl", "url": url, "titlu": text, "pagina": pag, "nr": int(m.group(1)), "an": int(re.search(r"20\d\d", sec).group(0)),
                        "data": data_din(fn) or data_din(text)})
        elif "proces" in tn or "proces" in sn or re.search(r"\bpv\b", fn):
            out.append({"sursa": "pv", "url": url, "titlu": text or fn, "pagina": pag, "data": data_din(text) or data_din(fn)})
        elif "raport" in sn and "consilier" in sn:
            out.append({"sursa": "rapoarte", "url": url, "titlu": f"{text} ({sec})", "pagina": pag})
        elif "proiect" in tn or "proiect" in sn or "invitat" in tn or "sedint" in sn:
            out.append({"sursa": "proiecte", "url": url, "titlu": text or fn, "pagina": pag, "data": data_din(text) or data_din(fn)})
    return out


# ---------------------------------------------------------------- Câmpulung Moldovenesc (platformă proprie, ședințe pe ani)

def campulung(ses, baza="https://campulungmoldovenesc.ro", ani=None, pagini_max=400):
    """Arhiva ședințelor (?an=AAAA) și pagina fiecărei ședințe: ordinea de zi, procesul-verbal, minuta, hotărârile (hcl_145.doc)
    cu anexele. Data ședinței vine din adresa paginii („...-din-data-de-29-10-2026”)."""
    from datetime import date
    ani = ani or list(range(date.today().year, 2014, -1))
    out, vazute, n = [], set(), 0
    for an in ani:
        idx = f"{baza}/consiliul-local/sedinte?an={an}"
        try:
            L = linkuri(ses.html(idx), idx)
        except requests.RequestException as e:
            log.info("%s: %s", idx, e)
            continue
        for url, text, sec in L:
            if "/consiliul-local/sedinte/" not in url or url in vazute or "?an=" in url:
                continue
            vazute.add(url)
            zi = data_din(unquote(url))
            if not zi:
                continue
            n += 1
            if n > pagini_max:
                return out
            try:
                D = linkuri(ses.html(url), url)
            except requests.RequestException as e:
                log.info("%s: %s", url, e)
                continue
            for du, dt, ds in D:
                if not DOC.search(du):
                    continue
                tn, fn = norm(dt), norm(unquote(du.rsplit("/", 1)[-1]))
                titlu = f"{dt or fn} - ședința din {zi}"
                if "ordinea de zi" in tn or "/infodispprimar/" in du.lower():
                    out.append({"sursa": "dispozitii", "url": du, "titlu": "Convocare / ordinea de zi " + titlu, "pagina": url, "data": zi})
                elif "proces" in tn or "minuta" in tn or "/infosedinte/" in du.lower():
                    out.append({"sursa": "pv", "url": du, "titlu": titlu, "pagina": url, "data": zi})
                elif "/infohcl/" in du.lower():
                    m = re.search(r"\bhcl[\s_-]*(\d{1,4})", fn)
                    if m and "anexa" not in tn:
                        out.append({"sursa": "hcl", "url": du, "titlu": f"Hotărârea nr. {m.group(1)} din {zi}", "pagina": url, "nr": int(m.group(1)), "an": int(zi[:4]), "data": zi})
                    else:
                        out.append({"sursa": "hcl_anexe", "url": du, "titlu": titlu, "pagina": url, "data": zi})
                elif "/infophcl/" in du.lower():
                    out.append({"sursa": "proiecte", "url": du, "titlu": titlu, "pagina": url, "data": zi})
    return out


ORASE = {"vatradornei": vatradornei, "campulung": campulung}


def colecteaza(store, oras):
    ses = Sesiune()
    docs = ORASE[oras](ses)
    stats = {}
    for d in docs:
        sid = _sid(d["url"])
        _pseudo_post(store, sid, d["sursa"], d["pagina"], d["titlu"])
        if d.get("data"):
            store.db.execute("UPDATE posts SET date=COALESCE(date, ?) WHERE wp_id=?", (d["data"] + "T00:00:00", sid))
        store.add_document(d["url"], sid, "site", d["titlu"])
        if d["sursa"] == "hcl" and d.get("nr") and d.get("an"):
            from datetime import date as _date
            store.upsert_hcl({"year": d["an"], "number": d["nr"], "date": _date.fromisoformat(d["data"]) if d.get("data") else None, "title": d["titlu"], "origin": "site",
                              "wp_id": sid, "pdf_url": d["url"], "issues": []})
        stats[d["sursa"]] = stats.get(d["sursa"], 0) + 1
    store.db.commit()
    return stats


def main(argv=None):
    ap = argparse.ArgumentParser(prog="monitor_colector.alte_orase")
    ap.add_argument("oras", choices=sorted(ORASE))
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    from .store import Store
    print(json.dumps(colecteaza(Store(config.DB_PATH), a.oras), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
