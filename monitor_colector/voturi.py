"""Voturile din procesele-verbale ale ședințelor de consiliu local.

Din textul fiecărui proces-verbal (extras prin OCR, deci cu erori) căutăm rezultatele votului:
câte voturi „pentru”, „împotrivă”, abțineri, „nu votează” sau „în unanimitate”, punctul de pe
ordinea de zi la care se referă și, când textul le numește, persoanele care au votat împotrivă
sau s-au abținut. Fiecare vot găsit păstrează fragmentul de text din care a fost extras, ca să
poată fi verificat de un om.

Rezultatele sunt deocamdată doar pentru pagina internă (data/intern-date/voturi.json): formularea
proceselor-verbale variază de la an la an și extragerea trebuie verificată pe documente reale
înainte de publicare.
"""
import json
import os
import re
import unicodedata
from datetime import date, timedelta

from . import config

# ---------- text normalizat, cu aceleași poziții ca originalul ----------

GHILIMELE = "„”“\"«»‚‘’`'"


def _baza(c):
    if c in GHILIMELE:
        return "'"
    if c in "–—−":
        return "-"
    if c.isspace():
        return " "
    d = unicodedata.normalize("NFD", c)
    d = "".join(x for x in d if unicodedata.category(x) != "Mn")
    return (d[:1] or " ").lower()


def normalizeaza(text):
    """Litere mici, fără diacritice, ghilimele unificate; fiecare caracter rămâne pe poziția lui."""
    return "".join(_baza(c) for c in text)


NUMERE = {"unu": 1, "una": 1, "doi": 2, "doua": 2, "trei": 3, "patru": 4, "cinci": 5, "sase": 6, "sapte": 7, "opt": 8,
          "noua": 9, "zece": 10, "unsprezece": 11, "doisprezece": 12, "douasprezece": 12, "treisprezece": 13,
          "paisprezece": 14, "cincisprezece": 15, "saisprezece": 16, "saptesprezece": 17, "optsprezece": 18,
          "nouasprezece": 19, "douazeci": 20}
NR = r"(\d{1,2}|" + "|".join(sorted(NUMERE, key=len, reverse=True)) + r"|un|o)"


def _int(s):
    s = (s or "").strip()
    if s.isdigit():
        return int(s)
    return 1 if s in ("un", "o") else NUMERE.get(s)


SEP = r"\s*'?\s*[-:=]?\s*'?\s*"
PENTRU = [re.compile(r"\b" + NR + r"\s+(?:de\s+)?voturi?\s*'?\s*pentru\b"),
          re.compile(r"\b" + NR + r"\s*'pentru'"),
          re.compile(r"'?pentru'?\s*[-:=]\s*" + NR + r"\b"),
          re.compile(r"\bcu\s+" + NR + r"\s+(?:de\s+)?voturi\b(?!\s*'?\s*(?:impotriva|contra))")]
IMPOTRIVA = [re.compile(r"\b" + NR + r"\s+(?:de\s+)?(?:voturi?\s*)?'?\s*(?:impotriva|contra)\b"),
             re.compile(r"'?(?:impotriva|contra)'?\s*[-:=]\s*" + NR + r"\b")]
ABTINERI = [re.compile(r"\b" + NR + r"\s+(?:de\s+)?(?:voturi?\s+)?'?abtiner[ei]\w*"),
            re.compile(r"\babtiner[ei]\w*'?\s*[-:=]\s*" + NR + r"\b")]
NU_VOTEAZA = [re.compile(r"\b" + NR + r"\s+(?:consilieri?\s+)?(?:(?:locali?|prezenti)\s+)?(?:nu\s+(?:au\s+|a\s+)?vot(?:eaza|at|ez)|nevot)"),
              re.compile(r"\bnu\s+(?:au\s+)?vot(?:eaza|at)'?\s*[-:=]\s*" + NR + r"\b")]
UNANIM = re.compile(r"\b(?:in\s+)?unanimitate\b|\bvot\s+unanim\b|\bunanim\b")
PREZENTI = re.compile(r"\b(?:sunt|sint|fiind|au\s+fost)\s+prezen[tţ]i\s+" + NR + r"\b|\bprezen[tţ]i\s*[-:]\s*" + NR + r"\b|\b"
                      + NR + r"\s+consilieri\s+(?:locali\s+)?(?:prezen|din\s+totalul)")
ADOPTAT = re.compile(r"\b(adoptat|aprobat|adopta|aproba|trece|a\s+trecut)\b")
RESPINS = re.compile(r"\b(respins|nu\s+(?:a\s+)?(?:fost\s+)?(?:adoptat|aprobat|trecut)|nu\s+intruneste)\b")
PROIECT = re.compile(r"proiect(?:ul|ului)?\s+de\s+hotarare\s+(?:nr\.?\s*\d+\s+)?(?:privind|pentru|referitor|cu\s+privire|"
                     r"de\s+aprobare|prin\s+care)[^.;]{10,260}")
PUNCT = re.compile(r"\bpunct(?:ul|ului)?\s+(?:nr\.?\s*)?(\d{1,2})\b")
NUME = re.compile(r"(?:\b(?:dl|dna|d-l|d-na|domnul|doamna|domnii|doamnele|consilier(?:ul|ii|a)?(?:\s+local)?)\.?\s+)?"
                  r"([A-ZĂÂÎȘŞȚŢ][a-zăâîșşțţ\-]{2,}(?:\s+[A-ZĂÂÎȘŞȚŢ][a-zăâîșşțţA-ZĂÂÎȘŞȚŢ\-]{2,}){1,2})")
CUVINTE_NU_NUME = {"Consiliul", "Local", "Municipiului", "Rădăuți", "Rădăuţi", "Proiectul", "Hotărâre", "Primar",
                   "Primarul", "Domnul", "Doamna", "Președintele", "Preşedintele", "Secretarul", "Comisia", "Punctul"}


def _gaseste(tiparuri, s):
    for t in tiparuri:
        m = t.search(s)
        if m:
            v = _int(next((g for g in m.groups() if g), None))
            if v is not None:
                return v, m
    return None, None


def _nume_dupa(orig, start, sfarsit):
    """Numele de persoane din fragmentul original [start, sfarsit), dintr-o paranteză sau o enumerare."""
    frag = orig[start:sfarsit]
    p = re.search(r"\(([^)]{3,250})\)", frag[:60] + frag[60:220])
    zona = p.group(1) if p else frag[:200]
    out = []
    for m in NUME.finditer(zona):
        n = re.sub(r"\s+", " ", m.group(1)).strip()
        if not any(w in CUVINTE_NU_NUME for w in n.split()) and n not in out:
            out.append(n)
    return out[:10]


def _extrage_general(text):
    """Formulări diverse („cu 15 voturi pentru”, „pentru - 9”, „în unanimitate”): pentru procesele-verbale
    care nu folosesc formula Rădăuțiului (vezi extrage_radauti)."""
    if not text:
        return None, []
    orig = text
    s = normalizeaza(text)
    pr, _ = _gaseste([PREZENTI], s[:6000])
    # centrele voturilor: numărătorile „pentru” și mențiunile „unanimitate”
    centre = []
    for t in PENTRU:
        centre += [(m.start(), m.end(), "pentru") for m in t.finditer(s)]
    centre += [(m.start(), m.end(), "unanim") for m in UNANIM.finditer(s)]
    centre.sort()
    # o singură numărătoare pe vot: centrele lipite (sub 40 de caractere) se unesc
    unite = []
    for c in centre:
        if unite and c[0] - unite[-1][1] < 40:
            unite[-1] = (unite[-1][0], max(unite[-1][1], c[1]), unite[-1][2] if unite[-1][2] == "pentru" else c[2])
        else:
            unite.append(c)
    voturi, prev_end, prev_b = [], 0, 0
    for k, (a, b, fel) in enumerate(unite):
        # fereastra votului: de puțin înaintea lui până puțin înaintea votului următor
        urm = unite[k + 1][0] - 40 if k + 1 < len(unite) else len(s)
        w0, w1 = max(prev_end, a - 40), max(b, min(urm, b + 260))
        fer = s[w0:w1]
        pentru, _ = _gaseste(PENTRU, fer)
        imp, mi = _gaseste(IMPOTRIVA, fer)
        abt, ma = _gaseste(ABTINERI, fer)
        nv, _ = _gaseste(NU_VOTEAZA, fer)
        unanim = bool(UNANIM.search(fer))
        if unanim and pentru is None and pr:
            pentru = pr
        if pentru is None and not unanim:
            prev_end, prev_b = w1, b
            continue
        # proiectul votat: ultimul titlu de proiect dinaintea votului (cel mult 2.500 de caractere înapoi)
        i0 = max(prev_b, a - 2500, 0)
        inapoi = s[i0:a]
        mp = list(PROIECT.finditer(inapoi))
        titlu = None
        if mp:
            st0 = i0 + mp[-1].start()
            titlu = re.sub(r"\s+", " ", orig[st0: st0 + len(mp[-1].group(0))]).strip()
        mpn = list(PUNCT.finditer(inapoi))
        rez = "respins" if RESPINS.search(fer) else ("adoptat" if ADOPTAT.search(fer) else None)
        if rez is None and pentru is not None and pr:
            rez = "adoptat" if pentru > pr / 2 else None
        voturi.append({
            "punct": int(mpn[-1].group(1)) if mpn else None, "titlu": titlu,
            "pentru": pentru, "impotriva": imp or 0, "abtineri": abt or 0, "nu_voteaza": nv or 0,
            "unanimitate": unanim and not imp and not abt, "rezultat": rez,
            "nume_impotriva": _nume_dupa(orig, w0 + mi.end(), w1) if mi and imp else [],
            "nume_abtineri": _nume_dupa(orig, w0 + ma.end(), w1) if ma and abt else [],
            "fragment": re.sub(r"\s+", " ", orig[max(w0 - 80, 0): min(w1, b + 200)]).strip()})
        prev_end, prev_b = w1, b
    return pr, voturi


# ---------- formula proceselor-verbale de la Rădăuți ----------
# „Din totalul de 15 consilieri prezenţi, 13 au participat la vot (nu au participat domnul Jecalo și
#  domnul Țarevici), 13 au votat pentru, 0 împotrivă, O abţineri, proiectul de hotărâre fiind aprobat.”
N0 = r"(\d{1,2}|o|zero)"   # OCR citește des „0” ca „O”
# numere de consilieri citite greșit de OCR: „î8” sau „1&” în loc de 18, „1l” în loc de 11
NO = r"(?<![a-z\d])(\d[\d&il]?|[il|!]\d)"
ANCORA = re.compile(r"din\s+totalul\s+de\s+" + NO + r"\s+consilieri(?:\s+locali)?\s+prezen\w*")
R_PART = re.compile(NO + r"\s+(?:consilieri\s+)?au\s+participat\s+la\s+vot(?:\s*\(([^)]{3,300})\))?")
R_PENTRU = re.compile(NO + r"\s+(?:consilieri\s+)?au\s+votat\s*'?\s*pentru")
R_IMP = re.compile(N0 + r"\W{0,4}(?:voturi\s+)?'?\s*(?:impotriva|contra)(?:\s*\(([^)]{3,300})\))?")
R_ABT = re.compile(N0 + r"\W{0,4}'?\s*abtiner\w*(?:\s*\(([^)]{3,300})\))?")
R_FIIND = re.compile(r"(proiectul\s+de\s+hotarare|ordinea\s+de\s+zi|procesul[\s-]+verbal|amendamentul|propunerea)?[^.]{0,40}?"
                     r"\bfiind\s+(aprobat\w*|adoptat\w*|respins\w*|neaprobat\w*|neadoptat\w*)")
R_TRECE = re.compile(r"se\s+trece\s+la\s+punctul\s+" + NO + r"[^\n]{0,80}?(proiect\w*\s+de\s+hotarare[^\n]*)")
R_FUNCTIE = re.compile(r"din\s+(?:cei\s+|totalul\s+de\s+)?" + NO + r"\s+consilieri(?:\s+locali)?\s+in\s+functie")
R_PREZ = re.compile(r"in\s+functie[^.]{0,30}?(?:sunt|fiind)\s+prezen\w*(?:\s+la\s+sedinta)?\s+(?:toti\s+(?:cei\s+)?)?" + NO)
R_ABSENT = re.compile(r"absenteaza[^.]{0,80}?(?:respectiv|:)\s*:?\s*([^.]{3,400})\.")
# „Lipsesc nemotivat de la şedinţă consilierii locali Airinei Cristina, Ihnatiuc Maria şi Lorin Iosif.”
R_LIPSESC = re.compile(r"\blipse(?:sc|ste)\s+(?:ne)?(?:motivat\s+)?(?:de\s+la\s+sedinta\s+)?(?:consilier\w*\s+)?(?:local\w*\s+)?"
                       r"(?:respectiv\s*:?\s*)?([^.]{3,300})\.")
R_CONFLICT = re.compile(r"\b(?:dl|dna|domnul|doamna)\.?\s+(\w[\w\- ]{2,40}?)\s+intervine\s+si\s+precizeaza\s+ca\s+nu\s+participa"
                        r"[^.]{0,60}?punctul\s+(\d{1,2})")


def _n0(x):
    return 0 if x in ("o", "zero") else int(x)


def _no(x):
    """Număr de consilieri din OCR: „i8” -> 18, „1&” -> 18, „1l” -> 11."""
    return int(x.translate(str.maketrans("il|!&", "11118")))


_MARE = "A-ZĂÂÎȘŞȚŢ"


def _nume_simple(orig):
    """„Airinei Cristina, Ihnatiuc Maria şi Lorin Iosif” (fără domnul/doamna) -> nume."""
    out = []
    for b in re.split(r",|;|\s+(?:și|şi|si)\s+", orig):
        b = re.sub(r"\s+", " ", b).strip()
        if re.fullmatch(rf"[{_MARE}][\w\-]+(?: [{_MARE}][\w\-]+){{1,2}}", b) and b not in out:
            out.append(b)
    return out


def _nume_lista(orig):
    """„domnul Lorin Iosif, domnul Mutrescu Dan, doamna Ihnatiuc Maria” -> nume, din textul original."""
    out = []
    for m in re.finditer(r"(?i:domnul|doamna|dl\.?|dna\.?|d-l|d-na)\s+([A-ZĂÂÎȘŞȚŢ][a-zăâîșşțţA-ZĂÂÎȘŞȚŢ\-]+(?:\s+[A-ZĂÂÎȘŞȚŢ][a-zăâîșşțţA-ZĂÂÎȘŞȚŢ\-]+){0,2})", orig):
        n = m.group(1).strip()
        if n not in out and n.split()[0].lower() not in ("primar", "viceprimar", "secretar"):
            out.append(n)
    return out


def prezenta(text):
    """Prezența la ședință: {in_functie, prezenti, absenti: [nume], nu_participa: {punct: [nume]}}."""
    s = normalizeaza(text or "")
    out = {"in_functie": None, "prezenti": None, "absenti": [], "nu_participa": {}}
    m = R_FUNCTIE.search(s)
    if m:
        out["in_functie"] = _no(m.group(1))
    m = R_PREZ.search(s)
    if m:
        out["prezenti"] = _no(m.group(1))
    elif out["in_functie"] and re.search(r"in\s+functie[^.]{0,30}?prezen\w*(?:\s+la\s+sedinta)?\s+toti\b", s):
        out["prezenti"] = out["in_functie"]
    for r in (R_ABSENT, R_LIPSESC):
        m = r.search(s)
        if m:
            seg = text[m.start(1):m.end(1)]
            out["absenti"] = _nume_lista(seg) or _nume_simple(seg)
            if out["absenti"]:
                break
    for m in R_CONFLICT.finditer(s):
        nume = re.sub(r"\s+", " ", text[m.start(1):m.end(1)]).strip()
        out["nu_participa"].setdefault(int(m.group(2)), []).append(nume)
    return out


def extrage_radauti(text):
    s, orig = normalizeaza(text), text
    ancore = list(ANCORA.finditer(s))
    voturi, prev = [], 0
    for k, a in enumerate(ancore):
        urm = ancore[k + 1].start() if k + 1 < len(ancore) else len(s)
        fer = s[a.start(): min(urm, a.start() + 600)]
        cap = re.search(r"\bfiind\s+\w+|se\s+trece\s+la\s+punctul", fer)   # votul se termină aici
        if cap:
            fer = fer[: cap.end() if cap.group(0).startswith("fiind") else cap.start()]
        mp, mpe, mi, ma = R_PART.search(fer), R_PENTRU.search(fer), R_IMP.search(fer), R_ABT.search(fer)
        mf = R_FIIND.search(fer)
        obiect = (mf.group(1) or "") if mf else ""
        # votul pe ordinea de zi sau pe procesul-verbal anterior nu e un vot pe o hotărâre
        procedural = bool(re.search(r"ordinea\s+de\s+zi|procesul[\s-]+verbal", obiect)) or \
            bool(re.search(r"(ordinea|ordinii)\s+de\s+zi|procesul\w*[\s-]+verbal", fer[-90:])) or \
            bool(re.search(r"supune\s+la\s+vot\s+(ordinea\s+de\s+zi|procesul)", s[max(prev, a.start() - 300):a.start()]))
        inapoi = s[prev:a.start()]
        mt = list(R_TRECE.finditer(inapoi))
        titlu, punct = None, None
        if mt:
            punct = _no(mt[-1].group(1))
            st0 = prev + mt[-1].start(2)
            titlu = re.sub(r"\s+", " ", orig[st0: prev + mt[-1].end(2)]).strip().rstrip(".")
        nep = _nume_lista(orig[a.start() + mp.start(2): a.start() + mp.end(2)]) if mp and mp.group(2) else []
        v = {"punct": punct, "titlu": titlu, "prezenti": _no(a.group(1)),
             "participanti": _no(mp.group(1)) if mp else None,
             "pentru": _no(mpe.group(1)) if mpe else None,
             "impotriva": _n0(mi.group(1)) if mi else 0, "abtineri": _n0(ma.group(1)) if ma else 0,
             "nu_voteaza": (_no(a.group(1)) - _no(mp.group(1))) if mp else 0, "nume_nu_voteaza": nep,
             "nume_impotriva": _nume_lista(orig[a.start() + mi.start(2): a.start() + mi.end(2)]) if mi and mi.group(2) else [],
             "nume_abtineri": _nume_lista(orig[a.start() + ma.start(2): a.start() + ma.end(2)]) if ma and ma.group(2) else [],
             "rezultat": ("respins" if re.match(r"(respins|neaprob|neadopt)", mf.group(2)) else "adoptat") if mf else None,
             "procedural": procedural,
             "fragment": re.sub(r"\s+", " ", orig[a.start(): a.start() + len(fer)][:400]).strip()}
        # verificare aritmetică: pentru + împotrivă + abțineri = câți au participat la vot
        v["consistent"] = bool(v["participanti"] and v["pentru"] is not None and
                               v["pentru"] + v["impotriva"] + v["abtineri"] == v["participanti"])
        v["unanimitate"] = bool(v["pentru"] is not None and v["participanti"] and v["pentru"] == v["participanti"]
                                and not v["impotriva"] and not v["abtineri"])
        if v["rezultat"] is None and v["pentru"] is not None and v["participanti"]:
            v["rezultat"] = "adoptat" if v["pentru"] > v["prezenti"] / 2 else None
        voturi.append(v)
        prev = a.start() + len(fer)
    return voturi


def extrage(text):
    """Voturile dintr-un proces-verbal: (prezenți, [vot]). Întâi formula de la Rădăuți („Din totalul de...
    au votat pentru...”); dacă nu apare, formulările generale. Voturile pe ordinea de zi nu se întorc."""
    if not text:
        return None, []
    v = [x for x in extrage_radauti(text) if not x["procedural"]]
    if v:
        p = prezenta(text)["prezenti"] or max((x["prezenti"] for x in v), default=None)
        return p, v
    return _extrage_general(text)


# ---------- legarea de hotărâri ----------

def _cuv(t):
    return {w for w in re.findall(r"[a-z]{4,}", normalizeaza(t or "")) if w not in
            {"privind", "pentru", "aprobarea", "hotarare", "proiect", "proiectul", "municipiului", "radauti", "local",
             "consiliul", "anul", "nr"}}


def _scor(titlu, h):
    """Cât de bine se potrivește titlul proiectului votat cu o hotărâre: după titlul de pe site sau după
    începutul textului hotărârii (pe site titlul e adesea doar „HCL nr. ...”)."""
    a = _cuv(titlu)
    if not a:
        return 0.0
    b = _cuv(h[2])
    j = len(a & b) / max(1, len(a | b))
    if len(h) > 3 and h[3]:
        c = _cuv(h[3])
        j = max(j, len(a & c) / len(a) * 0.9)
    return j


def leaga_hcl(voturi, hcl):
    """hcl: [(an, nr, titlu[, început de text])] adoptate în ședință. Fiecare vot primește hotărârea cea mai
    apropiată (potrivirile cele mai sigure întâi). Dacă rămân la fel de multe voturi adoptate cât hotărâri
    nelegate, se leagă în ordine (hotărârile se numerotează în ordinea de pe ordinea de zi)."""
    perechi = []
    for i, v in enumerate(voturi):
        if v.get("titlu"):
            for h in hcl:
                sc = _scor(v["titlu"], h)
                if sc >= 0.3:
                    perechi.append((sc, i, (h[0], h[1])))
    folosite, legate = set(), set()
    for sc, i, k in sorted(perechi, key=lambda x: -x[0]):
        if i in legate or k in folosite:
            continue
        voturi[i]["hcl"] = {"an": k[0], "nr": k[1], "potrivire": round(sc, 2)}
        legate.add(i)
        folosite.add(k)
    # voturile fără punct pe ordinea de zi (amendamente, suplimentări) nu produc o hotărâre proprie
    rest_v = [i for i, v in enumerate(voturi) if i not in legate and v.get("rezultat") == "adoptat"
              and (v.get("punct") is not None or all(x.get("punct") is None for x in voturi))]
    rest_h = sorted((h[0], h[1]) for h in hcl if (h[0], h[1]) not in folosite)
    if rest_v and len(rest_v) == len(rest_h):
        # ordinea trebuie să fie compatibilă cu legăturile deja făcute
        for i, k in zip(rest_v, rest_h):
            inainte = [voturi[j]["hcl"]["nr"] for j in legate if j < i]
            dupa = [voturi[j]["hcl"]["nr"] for j in legate if j > i]
            if (inainte and max(inainte) > k[1]) or (dupa and min(dupa) < k[1]):
                break
        else:
            for i, k in zip(rest_v, rest_h):
                voturi[i]["hcl"] = {"an": k[0], "nr": k[1], "potrivire": "ordine"}
    return voturi


# ---------- pe toate procesele-verbale ----------

def _text(db, wp_id):
    parts = []
    for r in db.execute("SELECT text_path FROM documents WHERE wp_id=? AND text_path IS NOT NULL ORDER BY rowid", (wp_id,)):
        try:
            with open(r["text_path"], encoding="utf-8") as f:
                parts.append(f.read())
        except OSError:
            continue
    return "\n".join(parts)


def _text_hcl(db, wp_id, pdf_url, maxim=2500):
    """Începutul textului hotărârii (titlul complet e acolo), după postarea de pe site sau după PDF (arhiva)."""
    if wp_id:
        t = _text(db, wp_id)
        if t:
            return t[:maxim]
    if pdf_url:
        r = db.execute("SELECT text_path FROM documents WHERE url=? AND text_path IS NOT NULL", (pdf_url,)).fetchone()
        if r:
            try:
                with open(r["text_path"], encoding="utf-8") as f:
                    return f.read(maxim)
            except OSError:
                pass
    return ""


CHEI_MOSTRA = re.compile(r"vot|pentru|impotriv|abtin|unanim|prezen|adopt|aprob|respins|consilier")


def mostra(text, maxim=3500):
    """Rândurile despre vot (cu câte un rând înainte și după), pentru reglarea extragerii pe texte reale."""
    linii = [l.rstrip() for l in (text or "").splitlines()]
    norm = [normalizeaza(l) for l in linii]
    alese = set()
    for i, l in enumerate(norm):
        if CHEI_MOSTRA.search(l):
            alese.update((i - 1, i, i + 1))
    out, n = [], 0
    for i in sorted(x for x in alese if 0 <= x < len(linii)):
        if not linii[i].strip():
            continue
        out.append(linii[i])
        n += len(linii[i]) + 1
        if n > maxim:
            break
    return (text or "")[:600].strip() + "\n[...]\n" + "\n".join(out)


def export(store, mostre=8):
    db = store.db
    sedinte = {}
    for r in db.execute("SELECT wp_id, session_type, session_date, title FROM pv WHERE kind='pv_sedinta' "
                        "AND session_date IS NOT NULL ORDER BY session_date DESC, wp_id DESC"):
        text = _text(db, r["wp_id"])
        if not text:
            continue
        pr, vot = extrage(text)
        k = (r["session_date"], r["session_type"])
        if k in sedinte and len(sedinte[k]["voturi"]) >= len(vot):
            continue
        hcl = [(x["year"], x["number"], x["title"], _text_hcl(db, x["wp_id"], x["pdf_url"])) for x in db.execute(
            "SELECT year, number, title, wp_id, pdf_url FROM hcl WHERE adoption_date=?", (r["session_date"],))]
        pdf = db.execute("SELECT url FROM documents WHERE wp_id=? ORDER BY rowid LIMIT 1", (r["wp_id"],)).fetchone()
        prz = prezenta(text)
        prz.update(extra_sedinta(text))
        for v in vot:   # cei care au anunțat că nu participă la vot (conflict de interese)
            if v.get("punct") in prz["nu_participa"] and not v.get("nume_nu_voteaza"):
                v["nume_nu_voteaza"] = prz["nu_participa"][v["punct"]]
        sedinte[k] = {"data": r["session_date"], "tip": r["session_type"], "titlu": r["title"],
                      "pdf": pdf["url"] if pdf else None, "prezenti": pr, "in_functie": prz["in_functie"],
                      "absenti": prz["absenti"], "presedinte": prz["presedinte"], "online": prz["online"],
                      "constituire": prz["constituire"], "hcl_in_sedinta": len(hcl), "voturi": leaga_hcl(vot, hcl)}
        if len(sedinte) <= mostre:
            sedinte[k]["mostra"] = mostra(text)
    S = sorted(sedinte.values(), key=lambda x: x["data"], reverse=True)
    pe_ani = {}
    for x in S:
        p = pe_ani.setdefault(x["data"][:4], {"sedinte": 0, "cu_voturi": 0, "voturi": 0, "unanime": 0, "cu_impotriva": 0,
                                              "cu_abtineri": 0, "respinse": 0})
        p["sedinte"] += 1
        p["cu_voturi"] += int(bool(x["voturi"]))
        for v in x["voturi"]:
            p["voturi"] += 1
            p["unanime"] += int(v["unanimitate"])
            p["cu_impotriva"] += int(v["impotriva"] > 0)
            p["cu_abtineri"] += int(v["abtineri"] > 0)
            p["respinse"] += int(v["rezultat"] == "respins")
    return {"sedinte": S, "pe_ani": dict(sorted(pe_ani.items()))}


def raport(ex, n=6):
    """Text pentru verificare: primele n ședințe, cu fiecare vot găsit și fragmentul lui."""
    out = ["Voturi extrase din procesele-verbale (de verificat pe documente)", ""]
    for y, p in ex["pe_ani"].items():
        out.append(f"{y}: {p['sedinte']} ședințe, {p['cu_voturi']} cu voturi găsite, {p['voturi']} voturi, "
                   f"{p['unanime']} unanime, {p['cu_impotriva']} cu voturi împotrivă, {p['cu_abtineri']} cu abțineri")
    for x in ex["sedinte"][:n]:
        out += ["", "=" * 80, f"{x['data']} {x['tip']} | prezenți: {x['prezenti']} din {x.get('in_functie')} | absenți: "
                f"{', '.join(x.get('absenti') or []) or '-'} | HCL în ședință: {x['hcl_in_sedinta']} | "
                f"voturi găsite: {len(x['voturi'])} | {x['pdf']}"]
        for v in x["voturi"]:
            out.append(f"- punct {v['punct']} | pentru {v['pentru']}, împotrivă {v['impotriva']}, abțineri {v['abtineri']}, "
                       f"nu votează {v['nu_voteaza']}{' | unanimitate' if v['unanimitate'] else ''} | {v['rezultat']} | "
                       f"{'verificat aritmetic' if v.get('consistent') else 'neverificat'} | "
                       f"HCL {v.get('hcl', {}).get('nr', '-')}")
            if v["titlu"]:
                out.append(f"    proiect: {v['titlu'][:160]}")
            if v["nume_impotriva"] or v["nume_abtineri"]:
                out.append(f"    împotrivă: {', '.join(v['nume_impotriva'])} | abțineri: {', '.join(v['nume_abtineri'])}")
            out.append(f"    text: {v['fragment'][:300]}")
        if x.get("mostra"):
            out += ["", "--- text recunoscut (rândurile despre vot) ---", x["mostra"]]
    return "\n".join(out) + "\n"


def scrie(store, data_dir):
    ex = export(store)
    ev = evenimente_mandat(store.db)
    ex["consilieri"], ex["legislaturi"] = consilieri(ex["sedinte"], evenimente=ev)
    ex["mandate"] = {l["eticheta"]: l["start"] for l in ex["legislaturi"]}
    ex["evenimente_mandat"] = ev
    d = os.path.join(data_dir, "intern-date")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(data_dir, "voturi-proba.txt"), "w", encoding="utf-8") as f:
        f.write(raport_consilieri(ex) + "\n" + raport(ex))
    for x in ex["sedinte"]:
        x.pop("mostra", None)
    with open(os.path.join(d, "voturi.json"), "w", encoding="utf-8") as f:
        json.dump(ex, f, ensure_ascii=False, separators=(",", ":"))
    return {"sedinte": len(ex["sedinte"]), "voturi": sum(len(x["voturi"]) for x in ex["sedinte"])}


# ---------- consilierii: cine e în consiliu, prezența și cum a votat fiecare ----------
# Lista consilierilor nu e publicată ca date; o reconstruim din procesele-verbale: președinții de ședință
# (se schimbă la câteva luni), absenții, cei prezenți online, cei care au votat împotrivă, s-au abținut sau
# nu au votat. Un consilier e socotit „în consiliu” între prima și ultima lui mențiune (cu pauze de peste
# un an, perioade separate), extinsă până la începutul sau sfârșitul mandatului dacă e aproape de ele.
# Votul „pentru” al unui consilier nu e scris în procesul-verbal: îl deducem doar când știm sigur cine a fost
# prezent (lista consilierilor din perioada ședinței are atâția membri câți „în funcție” scrie în PV, iar toți
# absenții sunt numiți) și când toți cei care au votat altfel sunt numiți. Altfel votul rămâne „necunoscut”.
R_PRESEDINTE = re.compile(r"presedinte\w*\s+de\s+sedinta\s+(?:este|a\s+fost\s+\w+|va\s+fi)\s+(?:ales\w*\s+)?(?:domnul|doamna|dl\.?|dna\.?)\s+"
                          r"(?:consilier\w*\s+(?:local\s+)?)?")
R_ONLINE = re.compile(r"prezen\w*\s+online[^.]{0,120}?respectiv\s*:?\s*([^.]{3,300})\.")
R_CONSTITUIRE = re.compile(r"constituir\w*\s+(?:a\s+)?consiliului\s+local|depunerea\s+juramantului|ceremoni\w*\s+de\s+constituire")
GAP_ZILE = 400
LIPIRE_ZILE = 400
# cuvinte care arată că „numele” prins nu e al unui consilier (funcții, text din jur)
NU_NUME = {"secretar", "secretarul", "primar", "primarul", "viceprimar", "consiliului", "consiliul", "municipiu", "municipiului",
           "local", "locali", "domnul", "doamna", "presedinte", "presedintele", "sedinta", "general", "arhitect", "sef"}


def _lev(a, b, maxim=2):
    if abs(len(a) - len(b)) > maxim:
        return maxim + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _seaman(a, b):
    """Același cuvânt dintr-un nume, cu erorile obișnuite de OCR („Peru”/„Petru”, „Cosma”/„Cozma”)."""
    if a == b:
        return True
    if min(len(a), len(b)) < 4:
        return False
    return _lev(a, b) <= (2 if min(len(a), len(b)) >= 8 else 1)


def _inclus(a, b):
    """Toate cuvintele numelui a se regăsesc (aproximativ, fiecare o dată) în numele b."""
    rest = list(b)
    for w in a:
        m = next((x for x in rest if _seaman(w, x)), None)
        if m is None:
            return False
        rest.remove(m)
    return True


def unifica_nume(frecventa):
    """{cheie: aparitii} -> {cheie: cheia canonică}: numele scrise diferit sau cu greșeli de OCR („Galan Romeo”,
    „Galan Romeo-Gheorghe”; „Carcalete Peru”, „Carcalete Petru”) devin aceeași persoană. Forma canonică e cea
    mai des întâlnită dintre cele cu cele mai multe cuvinte."""
    chei = sorted(frecventa, key=lambda k: (-len(k.split()), -frecventa[k], k))
    canon, grupe = {}, []
    for k in chei:
        t = k.split()
        cand = [g for g in grupe if _inclus(t, g.split()) or _inclus(g.split(), t)]
        if cand:
            g = max(cand, key=lambda g: frecventa.get(g, 0))
            canon[k] = g
        else:
            grupe.append(k)
            canon[k] = k
    # forma cu cele mai multe apariții devine numele grupului (dacă are tot atâtea cuvinte)
    tot = {}
    for k, g in canon.items():
        tot.setdefault(g, []).append(k)
    final = {}
    for g, membri in tot.items():
        best = max((m for m in membri if len(m.split()) == len(g.split())), key=lambda m: frecventa[m])
        for m in membri:
            final[m] = best
    return final


def _nume_presedinte(orig, start):
    m = re.match(r"\s*([A-ZĂÂÎȘŞȚŢ][\w\-ăâîșşțţ]+(?:\s+[A-ZĂÂÎȘŞȚŢ][\w\-ăâîșşțţ]+){1,2})", orig[start:start + 80])
    return m.group(1) if m else None


def extra_sedinta(text):
    """Președintele de ședință și consilierii prezenți online (nume din textul original)."""
    s = normalizeaza(text or "")
    out = {"presedinte": None, "online": [], "constituire": bool(R_CONSTITUIRE.search(s[:4000]))}
    m = R_PRESEDINTE.search(s)
    if m:
        out["presedinte"] = _nume_presedinte(text, m.end())
    m = R_ONLINE.search(s)
    if m:
        out["online"] = _nume_lista(text[m.start(1):m.end(1)])
    return out


def _tok(nume):
    n = normalizeaza(re.sub(r"\s*-\s*", "-", nume or "")).replace("-", " ")
    return [w for w in re.findall(r"[a-z]+", n) if len(w) > 1]


def cheie_nume(nume):
    return " ".join(sorted(_tok(nume)))


def _mandat(data, starturi):
    ok = [s for s in starturi if s <= data]
    return max(ok) if ok else None


# ---- legislaturile: din hotărârile despre mandate (validare, încetare, organizarea consiliului) ----
R_PREFIX_NUME = re.compile(r"\b(?:domnului|doamnei|dlui|dnei|d-lui|d-nei|dl\.?|dna\.?)\s+(?:consilier\w*\s+(?:local\s+)?)?")
R_VALIDARE = re.compile(r"validar\w*\s+(?:a\s+)?mandat\w*")
R_INCETARE = re.compile(r"incetar\w*\s+(?:de\s+drept\s+|inainte\s+de\s+termen\s+)*(?:a\s+)?(?:unui\s+)?mandat\w*|demisi\w*\s+(?:din\s+)?(?:functia|mandatul)")
R_CONSILIER = re.compile(r"consilier\w*\s+local")
R_ORGANIZARE = re.compile(r"legal\s+constituit|constituir\w*\s+(?:a\s+)?consiliului\s+local|comisiilor\s+de\s+specialitate|alegerea\s+viceprimarului|"
                          r"organizarea\s+si\s+functionarea\s+consiliului|validar\w*\s+(?:a\s+)?mandat")


def _nume_majuscule(orig, start):
    m = re.match(r"\s*([A-ZĂÂÎȘŞȚŢ][\wăâîșşțţĂÂÎȘŞȚŢ]+(?:\s*-\s*[A-ZĂÂÎȘŞȚŢ][\wăâîșşțţĂÂÎȘŞȚŢ]+)?"
                 r"(?:\s+[A-ZĂÂÎȘŞȚŢ][\wăâîșşțţĂÂÎȘŞȚŢ]+(?:\s*-\s*[A-ZĂÂÎȘŞȚŢ][\wăâîșşțţĂÂÎȘŞȚŢ]+)?){1,2})", orig[start:start + 90])
    if not m:
        return None
    n = re.sub(r"\s+", " ", re.sub(r"\s*-\s*", "-", m.group(1))).strip()
    return None if NU_NUME & set(_tok(n)) else n


def evenimente_mandat(db):
    """Din hotărârile consiliului: validările și încetările de mandat (cu numele consilierului) și hotărârile de
    organizare de la începutul unui mandat (comisii de specialitate, viceprimar, constituire)."""
    out = {"validari": [], "incetari": [], "organizare": []}
    for r in db.execute("SELECT year, number, adoption_date, title, wp_id, pdf_url FROM hcl WHERE adoption_date IS NOT NULL"):
        titlu = r["title"] or ""
        text = _text_hcl(db, r["wp_id"], r["pdf_url"], 2500)
        for orig in (titlu, text):
            s = normalizeaza(orig)
            if not R_CONSILIER.search(s) and not R_ORGANIZARE.search(s):
                continue
            ref = {"an": r["year"], "nr": r["number"], "data": r["adoption_date"]}
            gasit = False
            for rx, fel in ((R_VALIDARE, "validari"), (R_INCETARE, "incetari")):
                for m in rx.finditer(s):
                    zona = s[m.end(): m.end() + 260]
                    if not R_CONSILIER.search(zona[:80]):
                        continue
                    for p in R_PREFIX_NUME.finditer(zona):
                        n = _nume_majuscule(orig, m.end() + p.end())
                        if n and not any(e["nume"] == n and e["data"] == ref["data"] for e in out[fel]):
                            out[fel].append(dict(ref, nume=n))
                            gasit = True
            if R_ORGANIZARE.search(s[:600]):
                out["organizare"].append(ref)
            if gasit or orig is text:
                break
    return out


def legislaturi(sedinte, evenimente=None, mandate=None):
    """[(eticheta, început, sfârșit)]: începutul fiecărui mandat e prima hotărâre de organizare (comisii, viceprimar,
    validări) din cele 200 de zile de după alegeri; dacă nu o găsim, data din config."""
    mandate = dict(mandate or getattr(config, "CONSILIU_MANDATE", {}))
    alegeri = sorted(getattr(config, "ALEGERI_LOCALE", ()))
    org = sorted({e["data"] for e in (evenimente or {}).get("organizare", []) + (evenimente or {}).get("validari", [])})
    starturi = []
    for a in alegeri:
        d = [x for x in org if 0 <= (date.fromisoformat(x) - date.fromisoformat(a)).days <= 200]
        din_pv = [x["data"] for x in sedinte if x.get("constituire") and 0 <= (date.fromisoformat(x["data"]) - date.fromisoformat(a)).days <= 200]
        cfg = [v for v in mandate.values() if 0 <= (date.fromisoformat(v) - date.fromisoformat(a)).days <= 200]
        st = min(d + din_pv) if d or din_pv else (cfg[0] if cfg else None)
        if st:
            starturi.append(st)
    for v in mandate.values():   # mandatele din config fără alegeri cunoscute
        if not any(abs((date.fromisoformat(v) - date.fromisoformat(x)).days) < 200 for x in starturi):
            starturi.append(v)
    starturi.sort()
    out = []
    for i, st in enumerate(starturi):
        sf = (date.fromisoformat(starturi[i + 1]) - timedelta(days=1)).isoformat() if i + 1 < len(starturi) else "9999-12-31"
        out.append((f"{st[:4]}-{int(st[:4]) + 4}", st, sf))
    return out


def consilieri(sedinte, mandate=None, azi=None, evenimente=None, min_mentiuni=2):
    """Profilurile consilierilor, pe legislaturi. Membrii unei legislaturi: cei menționați de cel puțin
    `min_mentiuni` ori în procesele-verbale ei, plus cei validați prin hotărâre; fiecare e în consiliu de la
    începutul legislaturii (sau de la validare) până la sfârșit (sau la încetarea mandatului)."""
    S = sorted(sedinte, key=lambda x: x["data"])
    ev = evenimente or {"validari": [], "incetari": [], "organizare": []}
    LEG = legislaturi(S, ev, mandate)
    ultima = S[-1]["data"] if S else None
    # 1. numele și în ce ședințe apar
    forme, aparitii = {}, {}

    def adauga(n, d, ponderare=1):
        k = cheie_nume(n)
        if len(k.split()) < 2 or NU_NUME & set(k.split()):
            return None
        n = re.sub(r"\s+", " ", re.sub(r"\s*-\s*", "-", n)).strip()
        forme.setdefault(k, {}).setdefault(n, 0)
        forme[k][n] += ponderare
        aparitii.setdefault(k, []).append(d)
        return k

    for x in S:
        for n in (x.get("absenti") or []) + (x.get("online") or []) + ([x["presedinte"]] if x.get("presedinte") else []):
            adauga(n, x["data"])
        for v in x.get("voturi") or []:
            for n in (v.get("nume_impotriva") or []) + (v.get("nume_abtineri") or []) + (v.get("nume_nu_voteaza") or []):
                if len(_tok(n)) >= 2:
                    adauga(n, x["data"])
    for fel in ("validari", "incetari"):
        for e in ev.get(fel, []):
            adauga(e["nume"], e["data"], 0)
    uni = unifica_nume({k: max(1, sum(v.values())) for k, v in forme.items()})
    f2, a2 = {}, {}
    for k, g in uni.items():
        for n, c in forme[k].items():
            f2.setdefault(g, {})[n] = f2.setdefault(g, {}).get(n, 0) + c
        a2.setdefault(g, []).extend(aparitii[k])
    forme, aparitii = f2, a2
    canon = lambda n: uni.get(cheie_nume(n))
    # 2. membrii fiecărei legislaturi și perioadele lor
    perioade, evc, legc = {}, {}, {}
    for eticheta, st, sf in LEG:
        val = {canon(e["nume"]): e for e in ev.get("validari", []) if st <= e["data"] <= sf and canon(e["nume"])}
        inc = {canon(e["nume"]): e for e in ev.get("incetari", []) if st <= e["data"] <= sf and canon(e["nume"])}
        for k, ds in aparitii.items():
            n_l = sum(1 for d in ds if st <= d <= sf)
            if n_l < min_mentiuni and k not in val:
                continue
            a = val[k]["data"] if k in val and (date.fromisoformat(val[k]["data"]) - date.fromisoformat(st)).days > 60 else st
            b = inc[k]["data"] if k in inc else min(sf, ultima or sf)
            if b < a:
                continue
            perioade.setdefault(k, []).append([a, b])
            legc.setdefault(k, []).append(eticheta)
            for fel, dct in (("validare", val), ("încetare", inc)):
                if k in dct:
                    evc.setdefault(k, []).append({"fel": fel, "data": dct[k]["data"], "hcl": {"an": dct[k]["an"], "nr": dct[k]["nr"]}})

    def activi(d):
        return [k for k, seg in perioade.items() if any(a <= d <= b for a, b in seg)]

    def rezolva(n, d, ros):
        t = _tok(n)
        if len(t) >= 2:
            k = uni.get(" ".join(sorted(t)))
            if k in ros:
                return k
            c = [r for r in ros if _inclus(t, r.split()) or _inclus(r.split(), t)]
            return c[0] if len(c) == 1 else None
        if not t:
            return None
        c = [k for k in ros if any(_seaman(t[0], w) for w in k.split())]
        return c[0] if len(c) == 1 else None

    # 3. pe fiecare ședință: cine era în consiliu, cine a lipsit, cum a votat fiecare
    cod = {k: {} for k in perioade}
    for x in S:
        ros = activi(x["data"])
        abs_ = {rezolva(n, x["data"], ros) for n in x.get("absenti") or []} - {None}
        nf, pr = x.get("in_functie"), x.get("prezenti")
        complet = bool(nf and pr is not None and len(abs_) == nf - pr)
        x["roster_ok"] = bool(nf and len(ros) == nf and complet)
        x["in_consiliu"] = len(ros)
        for k in ros:
            sir = []
            for v in x.get("voturi") or []:
                if k in abs_:
                    sir.append("X")
                    continue
                expl = None
                for lista, c in (("nume_impotriva", "I"), ("nume_abtineri", "A"), ("nume_nu_voteaza", "N")):
                    if any(rezolva(n, x["data"], ros) == k for n in v.get(lista) or []):
                        expl = c
                if expl:
                    sir.append(expl)
                elif (x["roster_ok"] and v.get("consistent") and len(v.get("nume_impotriva") or []) == (v.get("impotriva") or 0)
                      and len(v.get("nume_abtineri") or []) == (v.get("abtineri") or 0)
                      and len(v.get("nume_nu_voteaza") or []) == (v.get("nu_voteaza") or 0)):
                    sir.append("P")
                else:
                    sir.append("?")
            prez = "X" if k in abs_ else ("p" if complet and len(ros) == nf else "?")
            cod[k][x["data"]] = prez + "".join(sir)
    out = []
    for k, seg in perioade.items():
        nume = max(forme[k].items(), key=lambda t: (t[1], any(ord(ch) > 127 for ch in t[0]), len(t[0])))[0]
        st = {"sedinte": 0, "prezent": 0, "absent": 0, "prezenta_necunoscuta": 0, "P": 0, "I": 0, "A": 0, "N": 0, "?": 0, "X": 0}
        for d, c in cod[k].items():
            st["sedinte"] += 1
            st[{"p": "prezent", "X": "absent"}.get(c[0], "prezenta_necunoscuta")] += 1
            for ch in c[1:]:
                st[ch] += 1
        out.append({"id": re.sub(r"\s+", "-", k), "nume": nume, "variante": sorted(forme[k]), "perioade": seg,
                    "mandate": legc.get(k, []), "evenimente": evc.get(k, []), "stat": st, "cod": cod[k]})
    out.sort(key=lambda c: (-int(c["perioade"][-1][1] >= (ultima or "")), c["nume"]))
    return out, [{"eticheta": e, "start": a, "sfarsit": b,
                  "membri": sum(1 for c in out if e in c["mandate"])} for e, a, b in LEG]


def raport_consilieri(ex):
    out = ["Consilieri reconstruiți din procesele-verbale (de verificat)", ""]
    ok = sum(1 for x in ex["sedinte"] if x.get("roster_ok"))
    out.append(f"Ședințe în care știm sigur cine a fost în sală (vot „pentru” dedus): {ok} din {len(ex['sedinte'])}")
    for l in ex.get("legislaturi", []):
        S = [x for x in ex["sedinte"] if l["start"] <= x["data"] <= l["sfarsit"]]
        nf = sorted({x.get("in_functie") for x in S if x.get("in_functie")})
        out.append(f"Legislatura {l['eticheta']}: de la {l['start']}, {l['membri']} consilieri găsiți; „în funcție” în PV-uri: {nf}; "
                   f"ședințe cu lista completă: {sum(1 for x in S if x.get('roster_ok'))} din {len(S)}")
    ev = ex.get("evenimente_mandat") or {}
    for fel in ("validari", "incetari"):
        for e in ev.get(fel, []):
            out.append(f"  {fel[:-1]}: {e['nume']} - HCL {e['nr']}/{e['an']} din {e['data']}")
    out.append("  hotărâri de organizare (început de mandat): " + ", ".join(f"{e['nr']}/{e['an']} ({e['data']})" for e in ev.get("organizare", [])[:40]))
    out.append("")
    for c in ex.get("consilieri", []):
        s = c["stat"]
        out.append(f"- {c['nume']} | {', '.join(c['mandate'])} | perioade: " + "; ".join(f"{a} - {b}" for a, b in c["perioade"]) +
                   f" | ședințe {s['sedinte']}, prezent {s['prezent']}, absent {s['absent']}, necunoscut {s['prezenta_necunoscuta']}"
                   f" | pentru {s['P']}, împotrivă {s['I']}, abțineri {s['A']}, nu a votat {s['N']}, necunoscut {s['?']}"
                   + (f" | forme: {' / '.join(c['variante'])}" if len(c["variante"]) > 1 else ""))
    return "\n".join(out) + "\n"
