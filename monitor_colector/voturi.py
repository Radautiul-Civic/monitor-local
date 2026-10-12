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


def extrage(text):
    """Voturile dintr-un proces-verbal: (prezenți, [vot]). Fiecare vot are numărătoarea, punctul,
    titlul proiectului (când apare înainte), numele celor împotrivă / abținuți și fragmentul-sursă."""
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


# ---------- legarea de hotărâri ----------

def _cuv(t):
    return {w for w in re.findall(r"[a-z]{4,}", normalizeaza(t or "")) if w not in
            {"privind", "pentru", "aprobarea", "hotarare", "proiect", "proiectul", "municipiului", "radauti", "local",
             "consiliul", "anul", "nr"}}


def leaga_hcl(voturi, hcl):
    """hcl: [(an, nr, titlu)] adoptate în ședință. Fiecare vot primește hotărârea cu titlul cel mai apropiat."""
    folosite = set()
    for v in voturi:
        if not v.get("titlu"):
            continue
        a = _cuv(v["titlu"])
        best, scor = None, 0.0
        for an, nr, t in hcl:
            if (an, nr) in folosite:
                continue
            b = _cuv(t)
            j = len(a & b) / max(1, len(a | b))
            if j > scor:
                best, scor = (an, nr), j
        if best and scor >= 0.3:
            v["hcl"] = {"an": best[0], "nr": best[1], "potrivire": round(scor, 2)}
            folosite.add(best)
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


def export(store):
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
        hcl = [(x["year"], x["number"], x["title"]) for x in db.execute(
            "SELECT year, number, title FROM hcl WHERE adoption_date=?", (r["session_date"],))]
        pdf = db.execute("SELECT url FROM documents WHERE wp_id=? ORDER BY rowid LIMIT 1", (r["wp_id"],)).fetchone()
        sedinte[k] = {"data": r["session_date"], "tip": r["session_type"], "titlu": r["title"],
                      "pdf": pdf["url"] if pdf else None, "prezenti": pr, "hcl_in_sedinta": len(hcl),
                      "voturi": leaga_hcl(vot, hcl)}
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
        out += ["", "=" * 80, f"{x['data']} {x['tip']} | prezenți: {x['prezenti']} | HCL în ședință: {x['hcl_in_sedinta']} | "
                f"voturi găsite: {len(x['voturi'])} | {x['pdf']}"]
        for v in x["voturi"]:
            out.append(f"- punct {v['punct']} | pentru {v['pentru']}, împotrivă {v['impotriva']}, abțineri {v['abtineri']}, "
                       f"nu votează {v['nu_voteaza']}{' | unanimitate' if v['unanimitate'] else ''} | {v['rezultat']} | "
                       f"HCL {v.get('hcl', {}).get('nr', '-')}")
            if v["titlu"]:
                out.append(f"    proiect: {v['titlu'][:160]}")
            if v["nume_impotriva"] or v["nume_abtineri"]:
                out.append(f"    împotrivă: {', '.join(v['nume_impotriva'])} | abțineri: {', '.join(v['nume_abtineri'])}")
            out.append(f"    text: {v['fragment'][:300]}")
    return "\n".join(out) + "\n"


def scrie(store, data_dir):
    ex = export(store)
    d = os.path.join(data_dir, "intern-date")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "voturi.json"), "w", encoding="utf-8") as f:
        json.dump(ex, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(data_dir, "voturi-proba.txt"), "w", encoding="utf-8") as f:
        f.write(raport(ex))
    return {"sedinte": len(ex["sedinte"]), "voturi": sum(len(x["voturi"]) for x in ex["sedinte"])}
