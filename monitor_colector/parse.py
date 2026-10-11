"""Parsarea titlurilor, numelor de fișiere și HTML-ului publicat de primărie.

Toate funcțiile sunt pure (fără rețea), ca să poată fi testate pe exemple reale.
"""
import html
import re
import unicodedata
from datetime import date
from html.parser import HTMLParser
from urllib.parse import urljoin, unquote

from .config import DOC_EXTENSIONS


def norm(text):
    """Text fără diacritice, cu litere mici și spații simple (pentru potrivire)."""
    if text is None:
        return ""
    text = html.unescape(text)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", text).strip().lower()


def clean_title(text):
    return re.sub(r"\s+", " ", html.unescape(text or "")).strip()


def _date(d, m, y):
    try:
        return date(int(y), int(m), int(d))
    except ValueError:
        return None


DATE_RE = r"(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})"


# ---------- linkuri spre documente ----------

class _LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self._href = None
        self._text = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a" and a.get("href"):
            self._href = a["href"]
            self._text = []
        elif tag == "object" and a.get("data"):
            self.links.append((a["data"], ""))

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self.links.append((self._href, "".join(self._text)))
            self._href = None


def extract_documents(content_html, base_url=""):
    """Lista de documente (url, text) din HTML-ul unei postări, fără duplicate.

    Pentru același URL păstrează cel mai informativ text de link (nu „Descarcă”).
    """
    p = _LinkParser()
    p.feed(content_html or "")
    out = {}
    for href, text in p.links:
        url = urljoin(base_url, href.strip())
        path = unquote(url.split("?")[0]).lower()
        if not path.endswith(DOC_EXTENSIONS):
            continue
        text = clean_title(text)
        if norm(text) in ("descarca", "download", ""):
            text = out.get(url, "")
        if url not in out or (text and not out[url]):
            out[url] = text
    return [{"url": u, "text": t} for u, t in out.items()]


# ---------- HCL ----------

_HCL_RE = re.compile(
    r"(?:hcl|hotarare|hotararea)\W*(?:nr\W*)?(\d{1,4})\W*(?:din\W*(?:data\W*(?:de\W*)?)?)?" + DATE_RE)
_HCL_NUM_ONLY = re.compile(r"(?:hcl|hotarare|hotararea)\W*(?:nr\W*)?(\d{1,4})\b")
_SLUG_RE = re.compile(r"^hcl-(\d{1,4})-(?:din-)?(\d{4})$")


def parse_hcl_ref(text):
    """Extrage (număr, dată) dintr-un text sau nume de fișier.

    Exemple acceptate: „HCL nr. 160 din 22.09.2026”, „HCL-nr.-160-din-22.09.2026.pdf”,
    „hcl-201-din-16.08.2023.pdf”, „Hotarare nr. 108 din 27.04.2023 ...”.
    Întoarce dict cu number, date (sau None), year (sau None).
    """
    t = norm(unquote(text or ""))
    # Doar prima mențiune contează: „Hotarare nr. 15 de modificare a HCL nr. 268/27.11.2023”
    # se referă la HCL 15, nu la 268.
    first = re.search(r"(hcl|hotararea|hotarare)", t)
    if not first:
        return None
    m = _HCL_RE.match(t, first.start())
    if m:
        n, d, mo, y = m.groups()
        dt = _date(d, mo, y)
        return {"number": int(n), "date": dt, "year": dt.year if dt else int(y)}
    m = _HCL_NUM_ONLY.match(t, first.start())
    if m:
        years = re.findall(r"(20\d{2})", t[m.end():m.end() + 25])
        return {"number": int(m.group(1)), "date": None, "year": int(years[0]) if years else None}
    return None


def parse_hcl_post(post_title, slug, documents):
    """Combină titlul, slug-ul și documentele unei postări HCL de pe site-ul nou.

    Semnalează nepotriviri între numărul din textul linkului și cel din numele fișierului.
    """
    result = {"number": None, "date": None, "year": None, "issues": []}
    candidates = []
    for d in documents:
        for src in (d["text"], d["url"].rsplit("/", 1)[-1]):
            ref = parse_hcl_ref(src)
            if ref:
                candidates.append(ref)
    m = _SLUG_RE.match(slug or "")
    if m:
        candidates.append({"number": int(m.group(1)), "date": None, "year": int(m.group(2))})
    if not candidates:
        result["issues"].append("numar_nedeterminat")
        return result
    best = next((c for c in candidates if c["date"]), candidates[0])
    result.update(number=best["number"], date=best["date"], year=best["year"])
    if len({c["number"] for c in candidates}) > 1:
        result["issues"].append("numere_diferite:" + ",".join(str(c["number"]) for c in candidates))
    result["redacted"] = any("blurat" in d["url"].lower() for d in documents)
    return result


# ---------- procese-verbale ----------

def parse_pv(title):
    """Tipul PV-ului, tipul ședinței, data și (pentru PV de afișare) intervalul de HCL."""
    t = norm(title)
    kind = "pv_afisare" if "afisare" in t else "pv_sedinta"
    if "de indata" in t:
        stype = "extraordinara_de_indata"
    elif "extraordinar" in t:
        stype = "extraordinara"
    elif "ordinar" in t:
        stype = "ordinara"
    else:
        stype = None
    dates = re.findall(DATE_RE, t)
    sdate = _date(*dates[-1]) if dates else None
    hcl_from = hcl_to = None
    m = re.search(r"hcl(?:-uri)?\s*(\d{1,4})\s*(?:-\s*(\d{1,4}))?", t)
    if m:
        hcl_from = int(m.group(1))
        hcl_to = int(m.group(2) or m.group(1))
    hour = re.search(r"ora\s*(\d{1,2}[:.]\d{2})", t)
    return {"kind": kind, "session_type": stype, "session_date": sdate,
            "hcl_from": hcl_from, "hcl_to": hcl_to, "hour": hour.group(1) if hour else None}


# ---------- registre CU / AC ----------

def parse_registry_period(title):
    """Perioada acoperită de un registru CU/AC: „emise în perioada 05.01.2026 - 30.06.2026”."""
    t = norm(title)
    full = re.findall(DATE_RE, t)
    if len(full) >= 2:
        return {"start": _date(*full[0]), "end": _date(*full[1])}
    m = re.search(r"(\d{1,2})[.\-](\d{1,2})\s*-\s*" + DATE_RE, t)
    if m:
        d1, m1, d2, m2, y = m.groups()
        return {"start": _date(d1, m1, y), "end": _date(d2, m2, y)}
    m = re.search(r"emise in (\d{4})", t)
    if m:
        y = int(m.group(1))
        return {"start": date(y, 1, 1), "end": date(y, 12, 31)}
    return {"start": None, "end": None}


# ---------- dispoziții ----------

_DISP_RE = re.compile(r"dispozit\w*\s*(?:de convocare\s*)?(?:nr\.?\s*)?(\d{1,4})\s*(?:/|din)\s*" + DATE_RE)


def parse_dispozitie(title):
    m = _DISP_RE.search(norm(title))
    if not m:
        return None
    n, d, mo, y = m.groups()
    dt = _date(d, mo, y)
    return {"number": int(n), "date": dt, "year": dt.year if dt else int(y)}


# ---------- arhiva veche ----------

_LEADING_NUM = re.compile(r"^\s*(\d{1,4})\s*[.)]\s*(?:hotarar)")


def _ref_from_text(text):
    """Număr din textul linkului: „Hotarare nr. 5 ...” sau „204. Hotarare privind ...”."""
    ref = parse_hcl_ref(text)
    if ref:
        return ref
    m = _LEADING_NUM.match(norm(text))
    if m:
        return {"number": int(m.group(1)), "date": None, "year": None}
    return None


def parse_archive_list(page_html, base_url, year=None):
    """Lista de HCL dintr-o pagină anuală a arhivei: un link PDF per hotărâre.

    Formate întâlnite pe arhivă:
      2013-2015  „204. Hotarare privind ...”, fișier hcl204.pdf
      2016-2018  „Hotarare nr.1 privind ...”, fișier scanat (SKM_....pdf)
      2019-2023  „Hotarare nr. 108 din 27.04.2023 ...”, fișier hcl-nr.-108-din-....pdf
      2024       „Hotărâre privind ...” (fără număr), numărul doar în numele fișierului

    Numărul se ia din text, iar când textul nu-l are, din numele fișierului. Când
    ambele există și diferă, se semnalează (în 2023, HCL 288 trimite la fișierul 301).
    Mai multe linkuri pentru aceeași hotărâre (anexe) se păstrează în extra_urls.
    """
    p = _LinkParser()
    p.feed(page_html or "")
    items = []
    by_number = {}
    seen = set()
    for href, text in p.links:
        url = urljoin(base_url, href.strip())
        if not unquote(url).lower().endswith(".pdf") or url in seen:
            continue
        seen.add(url)
        text = clean_title(text)
        ref_text = _ref_from_text(text)
        ref_file = parse_hcl_ref(url.rsplit("/", 1)[-1])
        ref = ref_text or ref_file
        if not ref:
            continue
        # un fișier-anexă (același număr) nu înlocuiește linkul principal
        if ref["number"] in by_number:
            by_number[ref["number"]]["extra_urls"].append(url)
            continue
        issues = []
        if ref_text and ref_file and ref_file["number"] != ref_text["number"]:
            issues.append(f"fisier_alt_numar:{ref_file['number']}")
        dt = ref["date"] or (ref_file or {}).get("date") or (ref_text or {}).get("date")
        item = {
            "number": ref["number"],
            "date": dt,
            "year": year or (dt.year if dt else ref["year"]),
            "title": text,
            "url": url,
            "extra_urls": [],
            "redacted": "blurat" in url.lower(),
            "issues": issues,
        }
        by_number[ref["number"]] = item
        items.append(item)
    return items
