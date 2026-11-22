"""Pentru cetățeni: ședința următoare a consiliului (convocarea, ordinea de zi), proiectele aflate în consultare
publică (cu termenul pentru propuneri) și fluxul de noutăți din toate sursele monitorului, cu RSS.

Surse:
  - dispozițiile de convocare a consiliului (registrul dispozițiilor de pe site, sursa „dispozitii”); ordinea de zi
    se citește din documentul dispoziției (text sau OCR), deci e orientativă și are mereu linkul spre document;
  - anunțurile de consultare publică ale proiectelor de hotărâre (sursa „proiecte”, Legea nr. 52/2003);
  - hotărârile, procesele-verbale, registrele de urbanism, contractele, documentele de buget, SICAP, concursurile.

Scrie data/sedinte.json, data/noutati.json și data/noutati.xml (RSS).
"""
import json
import os
import re
import zlib
from datetime import date, datetime, timedelta
from email.utils import format_datetime
from xml.sax.saxutils import escape

from . import config
from .parse import clean_title, norm

SITE = "https://monitor.radautiulcivic.ro/"
# adresa generală a primăriei (pagina „Datele de contact ale autorității”); se folosește când anunțul proiectului
# nu dă altă adresă pentru propuneri
EMAIL_PROPUNERI = "secretariat@primariaradauti.ro"
SECRETAR_GENERAL = "Secretarul general al Municipiului Rădăuți"
FORMULAR_52 = "https://primariaradauti.ro/formular-pentru-colectarea-de-propuneri-opinii-recomandari-cf-legii-nr-52-2003/"
R_DATA = r"(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{4})"


def _d(m):
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
    except ValueError:
        return None


def _text(db, wp_id):
    parts = []
    for r in db.execute("SELECT text_path FROM documents WHERE wp_id=? AND text_path IS NOT NULL ORDER BY rowid", (wp_id,)):
        try:
            with open(r["text_path"], encoding="utf-8") as f:
                parts.append(f.read())
        except OSError:
            pass
    return "\n".join(parts)


def _pdf(db, wp_id):
    r = db.execute("SELECT url FROM documents WHERE wp_id=? ORDER BY rowid LIMIT 1", (wp_id,)).fetchone()
    return r["url"] if r else None


def _cuvinte(t):
    return set(w for w in re.findall(r"[a-z]{4,}", norm(t)) if w not in _COMUNE)


_COMUNE = set("""privind pentru aprobarea aprobare hotarare hotararii proiect proiectul municipiului radauti local consiliului
consiliul modificarea completarea domeniul privat public anunt inregistrat data""".split())


def _seaman(a, b):
    A, B = _cuvinte(a), _cuvinte(b)
    return len(A & B) / max(1, min(len(A), len(B))) if A and B else 0.0


# ---------- convocările ----------

def parse_convocare(titlu):
    """Din titlul dispoziției de convocare: numărul, data ședinței, ora, felul ședinței. None dacă nu e o convocare."""
    t = norm(titlu)
    if "convoc" not in t:
        return None
    m = re.search(r"(?:in|din)\s+(?:data|ziua)\s+de\s+" + R_DATA, t) or re.search(r"sedint\w*\s+\w+\s+(?:\w+\s+){0,3}din\s+" + R_DATA, t)
    zi = _d(m) if m else None
    if not zi:
        toate = [_d(x) for x in re.finditer(R_DATA, t)]
        toate = [x for x in toate if x]
        zi = max(toate) if toate else None
    o = re.search(r"\bora\s+(\d{1,2})\s*[:.,]\s*(\d{2})", t) or re.search(r"\bora\s+(\d{1,2})\b", t)
    ora = (f"{int(o.group(1)):02d}:{o.group(2) if o.lastindex > 1 else '00'}") if o else None
    tip = "extraordinara_de_indata" if "de indata" in t else "extraordinara" if "extraordinar" in t else "ordinara" if "ordinar" in t else None
    n = re.search(r"dispozit\w*\s+(?:nr\.?\s*)?(\d{1,4})", t)
    return {"data": zi, "ora": ora, "tip": tip, "nr_dispozitie": n.group(1) if n else None}


R_PUNCT = re.compile(r"(?:^|\n)\s*(\d{1,2})\s*[.)]\s+(?=\S)")


def ordinea_de_zi(text):
    """Punctele ordinii de zi din textul dispoziției (orientativ: textul e adesea recunoscut prin OCR)."""
    if not text:
        return []
    tn = norm(text)
    i = max(tn.rfind("ordinea de zi"), tn.rfind("ordinii de zi"))
    if i < 0:
        return []
    bucata = text[i:]
    puncte, poz = [], [(m.start(), m.end(), int(m.group(1))) for m in R_PUNCT.finditer(bucata)]
    asteptat = 1
    for k, (s, e, n) in enumerate(poz):
        if n != asteptat:
            continue
        sf = next((p[0] for p in poz[k + 1:] if p[2] == n + 1), len(bucata))
        t = re.sub(r"\s+", " ", bucata[e:sf]).strip()
        t = re.split(r"\b(?:I|l)ni[tț]iator\w*\s*:|\bAvizat\b|\bComisi[ai]\s+de\s+specialitate\s*:|\bPRIMAR\b|\bSECRETAR\b", t)[0].strip(" ;,-")
        if len(t) >= 4:
            puncte.append({"nr": n, "text": t[:500]})
            asteptat += 1
    return puncte


def convocari(db, azi):
    out = []
    for r in db.execute("SELECT wp_id, title, date, link FROM posts WHERE source='dispozitii' ORDER BY date DESC"):
        c = parse_convocare(clean_title(r["title"]))
        if not c or not c["data"]:
            continue
        c.update({"titlu": clean_title(r["title"]), "postat": (r["date"] or "")[:10], "pagina": r["link"], "pdf": _pdf(db, r["wp_id"]),
                  "ordinea_de_zi": ordinea_de_zi(_text(db, r["wp_id"])), "viitoare": c["data"] >= azi.isoformat()})
        out.append(c)
    return out


# ---------- proiectele în consultare publică ----------

def parse_proiect(titlu):
    t = norm(titlu)
    nr = re.search(r"\bnr\.?\s*(\d{3,6})", t)
    m = re.search(r"\b(privind|pentru)\b", t)
    obiect = clean_title(titlu)[m.start():] if m else clean_title(titlu)
    return {"nr": nr.group(1) if nr else None, "obiect": obiect[:1].upper() + obiect[1:]}


def termen_propuneri(text, postat):
    """Termenul până la care se pot trimite propuneri: din anunț, altfel 10 zile de la publicare (Legea 52/2003)."""
    t = norm(text or "")
    m = re.search(r"(?:pana\s+(?:la\s+)?(?:data\s+de\s+)?|termen\w*\s+(?:limita\s+)?(?:de\s+)?(?:pana\s+la\s+)?)" + R_DATA, t)
    if m and _d(m) and _d(m) >= (postat or "0"):
        return _d(m), "din anunț"
    z = re.search(r"termen\w*\s+de\s+(\d{1,2})\s+zile", t)
    zile = int(z.group(1)) if z else 10
    try:
        return (date.fromisoformat(postat) + timedelta(days=zile)).isoformat(), f"{zile} zile de la publicare"
    except (TypeError, ValueError):
        return None, None


def email_propuneri(text):
    """Adresa la care se trimit propunerile, din textul anunțului (prima adresă a primăriei), altfel cea generală."""
    adrese = re.findall(r"[\w.+-]+@primariaradauti\.ro", text or "", re.I)
    adrese = [a.lower() for a in adrese if not a.lower().startswith(("admin@", "webmaster@"))]
    return (adrese[0], "din anunț") if adrese else (EMAIL_PROPUNERI, "adresa generală a primăriei")


def consultari(db, azi, hcl, zile=60):
    out = []
    lim = (azi - timedelta(days=zile)).isoformat()
    for r in db.execute("SELECT wp_id, title, date, link FROM posts WHERE source='proiecte' AND date >= ? ORDER BY date DESC", (lim,)):
        titlu = clean_title(r["title"])
        p = parse_proiect(titlu)
        postat = (r["date"] or "")[:10]
        text = _text(db, r["wp_id"])
        termen, cum = termen_propuneri(text, postat)
        email, email_din = email_propuneri(text)
        adoptat = None
        for h in hcl:   # hotărârea adoptată din proiect: după publicare, titlu asemănător
            if (h["data"] or "") >= postat and _seaman(p["obiect"], h["titlu"]) >= 0.7:
                adoptat = {"an": h["an"], "nr": h["nr"], "data": h["data"]}
                break
        out.append({"titlu": titlu, "obiect": p["obiect"], "nr": p["nr"], "postat": postat, "pagina": r["link"], "pdf": _pdf(db, r["wp_id"]),
                    "termen": termen, "termen_din": cum, "email": email, "email_din": email_din, "deschis": bool(termen and termen >= azi.isoformat()) and not adoptat, "adoptat": adoptat})
    return out


def leaga_ordinea(conv, proiecte, hcl):
    """Leagă punctele ordinii de zi de anunțul proiectului și, după ședință, de hotărârea adoptată."""
    for c in conv:
        for p in c["ordinea_de_zi"]:
            tn = norm(p["text"])
            pr = next((x for x in proiecte if x["nr"] and x["nr"] in tn), None)
            if not pr:
                best = max(proiecte, key=lambda x: _seaman(x["obiect"], p["text"]), default=None)
                pr = best if best and _seaman(best["obiect"], p["text"]) >= 0.6 else None
            if pr:
                p["proiect"] = {"pagina": pr["pagina"], "nr": pr["nr"], "postat": pr["postat"]}
            if not c["viitoare"]:
                h = max((x for x in hcl if x["data"] == c["data"]), key=lambda x: _seaman(x["titlu"], p["text"]), default=None)
                if h and _seaman(h["titlu"], p["text"]) >= 0.6:
                    p["hcl"] = {"an": h["an"], "nr": h["nr"]}
    return conv


# ---------- fluxul de noutăți ----------

def _ev(zi, tip, titlu, text="", link=None, sursa=None, ident=None):
    return {"data": zi, "tip": tip, "titlu": titlu, "text": text, "link": link, "sursa": sursa, "id": ident or f"{tip}-{zi}-{zlib.crc32(titlu.encode('utf-8'))}"}


NUME_TIP = {"sedinta": "Ședință convocată", "consultare": "Proiect în consultare", "hcl": "Hotărâri noi", "pv": "Proces-verbal",
            "urbanism": "Registru de urbanism", "achizitie": "Achiziție directă", "licitatie": "Licitație", "atribuire": "Contract atribuit",
            "concurs": "Concurs", "contract": "Contract publicat", "buget": "Buget"}


LUNI = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"]


def _zi(s):
    """„2026-11-26” -> „26 noiembrie 2026” (cum se citește în flux și în RSS)."""
    try:
        d = date.fromisoformat((s or "")[:10])
        return f"{d.day} {LUNI[d.month - 1]} {d.year}"
    except ValueError:
        return s or "?"


def _lei(v):
    return f"{v:,.0f}".replace(",", ".") + " lei"


def noutati(db, azi, conv, cons, concursuri=None, zile=120, prag_directe=50000):
    lim = (azi - timedelta(days=zile)).isoformat()
    ev = []
    for c in conv:
        if c["postat"] >= lim:
            tip = {"ordinara": "ordinară", "extraordinara": "extraordinară", "extraordinara_de_indata": "convocată de îndată"}.get(c["tip"], "")
            ev.append(_ev(c["postat"], "sedinta", f"Consiliul local se reunește în ședință {tip} pe {_zi(c['data'])}" + (f", ora {c['ora']}" if c["ora"] else ""),
                          f"{len(c['ordinea_de_zi'])} puncte pe ordinea de zi" if c["ordinea_de_zi"] else "Ordinea de zi e în dispoziția de convocare.",
                          "#consiliu/urmatoare", c["pagina"], f"conv-{c['data']}-{c['nr_dispozitie']}"))
    for p in cons:
        ev.append(_ev(p["postat"], "consultare", p["obiect"][:200], (f"Propuneri până pe {_zi(p['termen'])}." if p["termen"] else ""),
                      "#consiliu/urmatoare", p["pagina"], f"proiect-{p['nr'] or p['postat']}"))
    # hotărârile, grupate pe ziua publicării
    pe_zi = {}
    for r in db.execute("SELECT year, number, title, posted, adoption_date FROM hcl WHERE posted >= ? ORDER BY number", (lim,)):
        pe_zi.setdefault(r["posted"], []).append(r)
    for zi_, L in pe_zi.items():
        n = len(L)
        ev.append(_ev(zi_, "hcl", f"{n} hotărâri noi publicate" if n > 1 else f"HCL {L[0]['number']}/{L[0]['year']} publicată",
                      "; ".join(clean_title(x["title"])[:110] for x in L[:3]) + ("..." if n > 3 else ""),
                      f"#consiliu/hcl/{L[0]['year']}/{L[0]['number']}" if n == 1 else "#consiliu/hcl", None, f"hcl-{zi_}"))
    for r in db.execute("SELECT session_date, session_type, posted, title FROM pv WHERE posted >= ?", (lim,)):
        ev.append(_ev(r["posted"], "pv", f"Procesul-verbal al ședinței din {_zi(r['session_date'])}", "Ce s-a discutat și cum s-a votat.",
                      f"#consiliu/sedinte/{r['session_date']}" if r["session_date"] else "#consiliu/sedinte", None, f"pv-{r['session_date']}"))
    for r in db.execute("SELECT kind, period_start, period_end, posted, title FROM registries WHERE posted >= ?", (lim,)):
        k = "autorizațiilor de construire" if r["kind"] == "ac" else "certificatelor de urbanism"
        ev.append(_ev(r["posted"], "urbanism", f"Registrul {k} publicat", f"Perioada {_zi(r['period_start'])} - {_zi(r['period_end'])}.",
                      f"#primarie/urbanism/{r['kind']}", None, f"reg-{r['kind']}-{r['period_end']}"))
    for src, tip, titlu in (("contracte", "contract", "Contract publicat pe site"), ("buget", "buget", "Document de buget publicat"),
                            ("bilanturi", "buget", "Bilanț contabil publicat")):
        for r in db.execute("SELECT wp_id, title, date, link FROM posts WHERE source=? AND date >= ?", (src, lim)):
            ev.append(_ev(r["date"][:10], tip, titlu, clean_title(r["title"])[:220], "#achizitii/contracte" if tip == "contract" else "#primarie/buget",
                          r["link"], f"{src}-{r['wp_id']}"))
    try:   # SICAP: achizițiile directe mari, licitațiile lansate, contractele atribuite
        inst = {r["id"]: r["text"] for r in db.execute("SELECT id, text FROM sicap_ca")}
        for r in db.execute("SELECT id, ca_id, nume, valoare, furnizor, data_finalizare FROM sicap_da WHERE data_finalizare >= ? AND valoare >= ?",
                            (lim, prag_directe)):
            ev.append(_ev(r["data_finalizare"][:10], "achizitie", f"{_lei(r['valoare'])}: {clean_title(r['nume'])[:150]}",
                          f"{inst.get(r['ca_id'], '')}; furnizor {r['furnizor'] or '-'}", "#achizitii/sicap", None, f"da-{r['id']}"))
        for r in db.execute("SELECT id, ca_id, titlu, valoare_estimata, data FROM sicap_cn WHERE data >= ?", (lim,)):
            ev.append(_ev(r["data"][:10], "licitatie", f"Licitație lansată: {clean_title(r['titlu'])[:160]}",
                          f"{inst.get(r['ca_id'], '')}" + (f"; valoare estimată {_lei(r['valoare_estimata'])}" if r["valoare_estimata"] else ""),
                          "#achizitii/sicap", None, f"cn-{r['id']}"))
        for r in db.execute("SELECT id, ca_id, titlu, valoare, data FROM sicap_can WHERE data >= ?", (lim,)):
            ev.append(_ev(r["data"][:10], "atribuire", f"Contract atribuit: {clean_title(r['titlu'])[:160]}",
                          f"{inst.get(r['ca_id'], '')}" + (f"; {_lei(r['valoare'])}" if r["valoare"] else ""), "#achizitii/sicap", None, f"can-{r['id']}"))
    except Exception:
        pass   # tabelele SICAP există doar după prima colectare
    for c in concursuri or []:
        for e in c["etape"]:
            if (e["data"] or "") >= lim and e["etapa"] in ("anunt", "final"):
                ce = ", ".join(c["functii"])
                t = (("Anunț: " if e["etapa"] == "anunt" else "Rezultate finale: ") + c["procedura_nume"].lower() + (f" ({ce})" if ce else ""))
                ev.append(_ev(e["data"], "concurs", t[:1].upper() + t[1:], c["institutie"], "#angajari/concursuri", e["link"],
                              f"conc-{c['id']}-{e['etapa']}"))
    ev = [e for e in ev if e["data"] and e["data"] <= azi.isoformat()]
    ev.sort(key=lambda e: (e["data"], e["tip"]), reverse=True)
    return ev[:400]


def rss(ev, azi, n=60):
    items = []
    for e in ev[:n]:
        link = SITE + e["link"] if e["link"] and e["link"].startswith("#") else (e["sursa"] or SITE)
        try:
            pub = format_datetime(datetime.fromisoformat(e["data"] + "T12:00:00+02:00"))
        except ValueError:
            continue
        items.append(f"<item><title>{escape(NUME_TIP.get(e['tip'], '') + ': ' + e['titlu'])}</title><link>{escape(link)}</link>"
                     f"<guid isPermaLink=\"false\">{escape(e['id'])}</guid><pubDate>{pub}</pubDate>"
                     f"<category>{escape(NUME_TIP.get(e['tip'], e['tip']))}</category><description>{escape(e['text'] or '')}</description></item>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Monitor local Rădăuți - noutăți</title>'
            f"<link>{SITE}</link><description>Ce publică primăria și consiliul local din Rădăuți: ședințe, proiecte în consultare, hotărâri, "
            f"achiziții, concursuri, urbanism.</description><language>ro</language><lastBuildDate>{format_datetime(datetime.now().astimezone())}</lastBuildDate>"
            + "".join(items) + "</channel></rss>\n")


def export(store, azi=None, concursuri=None):
    azi = azi or date.today()
    db = store.db
    hcl = [{"an": r["year"], "nr": r["number"], "data": r["adoption_date"], "titlu": clean_title(r["title"] or "")}
           for r in db.execute("SELECT year, number, adoption_date, title FROM hcl WHERE adoption_date >= ?",
                               ((azi - timedelta(days=400)).isoformat(),))]
    conv = convocari(db, azi)
    cons = consultari(db, azi, hcl)
    toate_pr = consultari(db, azi, hcl, zile=400)
    leaga_ordinea(conv, toate_pr, hcl)
    viit = sorted([c for c in conv if c["viitoare"]], key=lambda c: (c["data"], c["ora"] or ""))
    trecute = [c for c in conv if not c["viitoare"]][:6]
    sed = {"generat_la": azi.isoformat(), "urmatoare": viit, "recente": trecute, "consultare": cons, "formular": FORMULAR_52,
           "destinatar": SECRETAR_GENERAL, "email": EMAIL_PROPUNERI}
    ev = noutati(db, azi, conv, cons, concursuri)
    return sed, ev


def scrie(store, data_dir=config.DATA_DIR, concursuri=None):
    azi = date.today()
    sed, ev = export(store, azi, concursuri)
    os.makedirs(data_dir, exist_ok=True)
    with open(os.path.join(data_dir, "sedinte.json"), "w", encoding="utf-8") as f:
        json.dump(sed, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(data_dir, "noutati.json"), "w", encoding="utf-8") as f:
        json.dump({"generat_la": azi.isoformat(), "tipuri": NUME_TIP, "evenimente": ev}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(data_dir, "noutati.xml"), "w", encoding="utf-8") as f:
        f.write(rss(ev, azi))
    return {"convocari_viitoare": len(sed["urmatoare"]), "consultare": len(sed["consultare"]), "noutati": len(ev)}
