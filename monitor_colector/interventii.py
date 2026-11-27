"""Cine ce a spus în ședințele consiliului local, după procesele-verbale (registru STRICT INTERN).

Din fiecare proces-verbal se scot intervențiile consemnate („Dl X intervine și precizează că...”), fiecare cu:
data ședinței, punctul de pe ordinea de zi, vorbitorul (consilier, primar, viceprimar, secretar, director...),
textul consemnat, temele și felul intervenției (întrebare, angajament, cifre, propunere, conflict de interese).

Regulă (Luca, 27.11.2026): analiza pe politicieni rămâne o funcție strict internă. Fișierele se scriu doar în
data/_intern/ și se urcă numai în intern/date/ (tools/publica.py: intern_date). Nu intră în indexul public de
căutare, în datele deschise sau în paginile statice.

Limite: procesul-verbal e un rezumat făcut de secretariat, nu o stenogramă; textul e citit prin OCR; numele sunt
de obicei doar numele de familie. Înainte de a cita pe cineva, se verifică pe PDF și, unde există, pe înregistrare.
"""
import json
import os
import re
from collections import Counter
from datetime import datetime

from . import config
from .ascunde import ascunde
from .voturi import _lev, normalizeaza

MAJ = "A-ZĂÂÎȘŞȚŢ"
MIN = "a-zăâîșşțţ"
# formele (și greșelile de OCR) ale lui „Dl”, „D-ul”, „Dna”: DI, D!, Di, DL, D-ui, D-uj, D-ul_, Dna_, ID-ul...
TITLU = r"(?:I?[DdP][-_]?(?:[lI1!iLj]{1,2}|u[lijtn]|ual|nul|n[aâă]|nei|lui|ra|s?oara|omnul|oamna|omnisoara)\.?)"
NUME = rf"[{MAJ}][\w\-{MIN}]+(?:[ \t]*-[ \t]*[{MAJ}][\w\-{MIN}]+|[ \t]+[{MAJ}][\w\-{MIN}]+){{0,2}}"
FUNCTIE = r"(?:[Pp]rimar\w*|[Vv]iceprimar\w*|[Ss]ecretar\w*(?:[ \t]+[Gg]eneral\w*)?|[Pp]re[sșş]edinte\w*(?:[ \t]+de[ \t]+[sșş]edin[tțţ][aă])?)"
# „Dl Jecalo intervine...”, „D-ul Primar spune...”, „Dna consilier Blanaru precizează...”, „Intervine dl Primar și spune...”
R_VORB = re.compile(
    rf"^[ \t_|]*(?:(?:Apoi|Totodat[aă]|[IÎ]n continuare),?[ \t]+)?(?:(?P<inv>Intervine|Ia[ \t]+cuv[aâ]ntul)[ \t]+)?(?:(?P<tit>{TITLU})[ \t_-]+)?(?:[Cc]onsilier\w*[ \t]+(?:[Ll]ocal[ \t]+)?)?_?"
    rf"(?P<cine>{FUNCTIE}|{NUME})(?:[ \t]*\((?P<par>[^)\n]{{3,80}})\))?[ \t,]+(?P<verb>[{MIN}]+)")
# început de paragraf care nu e intervenție: votul, trecerea la alt punct, formule ale secretariatului
R_ALT = re.compile(r"^(?:se trece la|intrucat nu|din totalul|in urma desfasurarii|comisia|se supune|a (?:iesit|revenit|intrat)|lipse)")
R_PUNCT = re.compile(r"se\s+trece\s+la\s+punctul\s+(?:nr\.?\s*)?(\d{1,3}|diverse)\b(?:\s+de\s+pe\s+ordinea\s+de\s+zi)?(?:\s*,?\s*(?:si|şi|și)\s+anume)?[\s:,-]*", re.I)
R_DIVERSE = re.compile(r"^\s*(?:se\s+trece\s+la\s+(?:punctul\s+)?)?diverse\s*:?\s*$", re.I)
R_CONFLICT = re.compile(r"nu\s+(?:va\s+)?particip\w*\s+(?:la\s+discuti|la\s+vot|nici)|conflict\s+de\s+interese")
R_PROCEDURA = re.compile(r"supune\s+la\s+vot|declara\s+(?:inchis|deschis)|da\s+citire|constata\s+ca\s+sunt\s+prezent|citeste\s+(?:ordinea|suplimentarea|proiectul)|"
                         r"face\s+prezenta|anunta\s+ca\s+(?:se\s+ia|urmeaza)\s+o\s+pauza")
R_INIT_PRIMAR = re.compile(rf"ini[tţț]iator\w*\s*[,:\-]?\s*primar\w*\s*[,:\-]?\s*((?:[{MAJ}][\w{MIN}{MAJ}]+[\s\-]*){{2,4}})")
VERBE = {"intervine", "precizeaza", "spune", "intreaba", "afirma", "mentioneaza", "propune", "sustine", "raspunde", "explica", "solicita",
         "considera", "arata", "prezinta", "adauga", "cere", "anunta", "doreste", "aduce", "ia", "face", "da", "revine", "atrage", "isi",
         "multumeste", "informeaza", "expune", "citeste", "subliniaza", "completeaza", "roaga", "declara", "retrage", "este", "a", "nu", "se",
         "vrea", "crede", "reaminteste", "confirma", "reitereaza", "invita", "felicita", "semnaleaza", "sesizeaza", "comunica", "mai"}

TEME = [   # (cheie, etichetă, expresie pe textul fără diacritice)
    ("termoficare", "Termoficare", r"termofic|energi\w*\s+termic|agent\w*\s+termic|caldur|cogenerar|\bgcal|turbin|cazan|certificat\w*\s+(?:verz|co2|de\s+emisi)"),
    ("comunale", "Servicii Comunale", r"servici\w*\s+comunale|\bcomunale\b"),
    ("salubrizare", "Salubrizare", r"salubr|gunoi|deseu|groap\w*\s+de\s+gunoi|colectar\w*\s+selectiv"),
    ("apa", "Apă și canalizare", r"\bacet\b|canaliz|apa\s+(?:potabil|rece|calda)|\bajac\b|retea\w*\s+de\s+apa"),
    ("buget", "Buget", r"\bbuget|rectificar|imprumut|credit\w*\s+bancar|executi\w*\s+bugetar|excedent"),
    ("taxe", "Taxe și impozite", r"\btax[ae]|impozit"),
    ("strazi", "Străzi și parcări", r"\bstra[dz]|asfalt|trotuar|parcar|\bdrum|balast|sens\w*\s+giratori|semafor"),
    ("investitii", "Investiții și fonduri", r"investit|fonduri\s+europene|pnrr|saligny|finantar\w*\s+nerambursabil|studiu\w*\s+de\s+fezabilitate|indicatori\w*\s+tehnico"),
    ("urbanism", "Urbanism", r"\bpug\b|\bpuz\b|\bpud\b|urbanism|autorizati\w*\s+de\s+constru"),
    ("patrimoniu", "Terenuri și clădiri", r"vanzar|concesion|inchirier|domeniul\s+(?:public|privat)|licitati\w*\s+public|\banl\b"),
    ("spital", "Spital și sănătate", r"spital|ambulat"),
    ("scoli", "Școli", r"\bscoal|\bscoli|gradinit|liceu|colegiu|invatamant|burse"),
    ("iluminat", "Iluminat", r"iluminat"),
    ("personal", "Personal și organigramă", r"organigram|stat\w*\s+de\s+functii|angajar|concurs\w*\s+pentru|salari"),
    ("curte", "Curtea de Conturi și controale", r"curt\w*\s+de\s+conturi|camer\w*\s+de\s+conturi|\banaf\b|audit|corp\w*\s+de\s+control"),
    ("transparenta", "Transparență", r"transparen|544|dezbater\w*\s+public|proces\w*[\s-]+verbal\w*\s+(?:nu|sa)|inregistrar\w*\s+sedint"),
    ("litigii", "Litigii", r"instant|tribunal|proces\w*\s+(?:cu|in\s+instanta)|sentint|dosar\w*\s+nr|executar\w*\s+silit|judecat"),
]
TEME_RX = [(k, e, re.compile(rx)) for k, e, rx in TEME]
# angajamente: cei cu funcții executive (primar, viceprimar, conducerea societăților) când spun ce „se va” face; ceilalți doar la persoana întâi
R_ANGAJ_EXEC = re.compile(r"\b(?:vom|voi|o\s+sa|se\s+va|se\s+vor|va\s+(?:fi|face|veni|prezenta|trimite|aduce|urma|incepe|rezolva|analiza|verifica)|urmeaza\s+sa|promite|se\s+angajeaza|isi\s+asuma)\b")
R_ANGAJ = re.compile(r"\b(?:vom|promite|se\s+angajeaza|isi\s+asuma)\b")
FUNCTII_NENUMITE = {"director": "Director (nenumit în procesul-verbal)", "directorul": "Director (nenumit în procesul-verbal)",
                    "administrator": "Administrator (nenumit în procesul-verbal)", "administratorul": "Administrator (nenumit în procesul-verbal)",
                    "arhitect": "Arhitectul-șef", "contabil": "Contabil (nenumit în procesul-verbal)"}
TIPURI = [
    ("intrebare", re.compile(r"\bintreaba\b|\bsolicita\s+(?:lamuriri|explicatii|informatii|raspuns)|\bcere\s+(?:lamuriri|explicatii|sa\s+i\s+se)|\bdoreste\s+sa\s+stie|\?")),
    ("propunere", re.compile(r"\bpropune\b|amendament|\bsugereaza\b")),
    ("cifre", re.compile(r"\d[\d.\s]{2,}\d|\b\d+\s*(?:lei|euro|ron|%|la\s+suta|mii|milioane|miliard)")),
]


def _cheie(nume):
    return " ".join(sorted(w for w in re.findall(r"[a-z]+", normalizeaza(nume).replace("-", " ")) if len(w) > 1))


def _paragrafe(text):
    """[(text pe un rând, textul original)] ale paragrafelor: bucăți despărțite de un rând gol sau de un rând care
    începe o intervenție nouă (unele procese-verbale nu lasă rânduri goale)."""
    out, cur = [], []
    for rand in (text or "").replace("\f", "\n\n").split("\n"):
        r = rand.strip()
        if not r or re.fullmatch(r"\d{1,3}", r):   # rând gol sau număr de pagină
            if cur:
                out.append(" ".join(cur))
                cur = []
            continue
        if cur and (R_VORB.match(r) and _verb_ok(R_VORB.match(r)) or R_PUNCT.match(r)):
            out.append(" ".join(cur))
            cur = []
        cur.append(r)
    if cur:
        out.append(" ".join(cur))
    return [re.sub(r"\s+", " ", p) for p in out]


def _functie(cn):
    """primar / viceprimar / secretar / presedinte, și cu greșeli de OCR („Prirbar”, „Segretar”)."""
    w = cn.split()[0] if cn else ""
    for f, tol in (("viceprimar", 2), ("primar", 1), ("primarul", 1), ("secretar", 2), ("secretarul", 2), ("presedinte", 2), ("presedintele", 2)):
        if w.startswith(f) or (abs(len(w) - len(f)) <= tol and _lev(w, f, tol) <= tol):
            return f.replace("primarul", "primar").replace("secretarul", "secretar").replace("presedintele", "presedinte")
    return None


def _verb_ok(m):
    # un nume fără „Dl/Dna” în față nu e un vorbitor („Astfel spune...”, „ACET precizează...”); funcțiile pot apărea și fără
    if not m.group("tit") and not _functie(normalizeaza(m.group("cine"))):
        return False
    return normalizeaza(m.group("verb")) in VERBE or bool(m.group("inv"))


def primar_la(text):
    """Numele primarului, din ordinea de zi a aceluiași proces-verbal („inițiator, primar LOGHIN Bogdan-Andrei”)."""
    c = Counter()
    for m in R_INIT_PRIMAR.finditer(text or ""):
        n = re.sub(r"\s+", " ", re.sub(r"\s*-\s*", "-", m.group(1))).strip(" -")
        n = " ".join(w if "-" in w and not w.isupper() else w.title() if w.isupper() else w for w in n.split())
        n = re.sub(r"\b(Se|Exista|Există)\b.*$", "", n).strip(" -")
        if len(n.split()) >= 2:
            c[_cheie(n)] += 1
            c["#" + _cheie(n)] = 0
            primar_la.forme[_cheie(n)] = n
    c = Counter({k: v for k, v in c.items() if not k.startswith("#")})
    return primar_la.forme[c.most_common(1)[0][0]] if c else None


primar_la.forme = {}


def extrage(text):
    """Intervențiile dintr-un proces-verbal: [{punct, titlu, cine, rol, text, teme, tipuri}]."""
    out, punct, titlu = [], None, ""
    primar = primar_la(text)
    for p in _paragrafe(text):
        s = normalizeaza(p)
        mp = R_PUNCT.match(s)
        if mp or R_DIVERSE.match(s):
            punct = "diverse" if not mp or mp.group(1).lower() == "diverse" else int(mp.group(1))
            titlu = re.sub(r"\s+", " ", p[mp.end():] if mp else "").strip(" .:-")
            titlu = re.sub(r"(?i)^proiect\w*\s+de\s+hot[aă]r[aâ]re\s+(?:[iî]nregistrat\s+cu\s+)?(?:nr\.?\s*[\d/. ()]+\s*)?(?:privind\s+)?", "", titlu)[:220]
            continue
        if punct is None:   # ordinea de zi și deschiderea ședinței
            if not R_CONFLICT.search(s):
                continue
        m = R_VORB.match(p)
        if not m or not _verb_ok(m) or R_ALT.match(s):
            if out and out[-1]["_deschis"] and not R_ALT.match(s) and not R_PUNCT.search(s) and p[:1].islower() and len(out[-1]["text"]) < 1500:
                out[-1]["text"] += " " + p   # continuarea aceleiași intervenții
            elif out:
                out[-1]["_deschis"] = False
            continue
        cine = re.sub(r"\s+", " ", re.sub(r"\s*-\s*", "-", m.group("cine"))).strip()
        cn = normalizeaza(cine)
        rol, nume, fct = None, cine, _functie(cn)
        if fct == "primar":
            rol, nume = "primar", primar or "Primarul"
        elif fct == "viceprimar":
            rol, nume = "viceprimar", "Viceprimarul"
        elif fct == "secretar":
            rol, nume = "secretar", "Secretarul general"
        elif fct == "presedinte":
            rol, nume = "presedinte", "Președintele de ședință"
        elif cn.split()[0] in FUNCTII_NENUMITE:
            rol, nume = "functie", FUNCTII_NENUMITE[cn.split()[0]]
        elif len(cn) < 3 or cn.split()[0] in {"consiliul", "comisia", "proiectul", "punctul", "directia", "serviciul", "primaria"}:
            continue
        if m.group("par") and not rol:
            rol = "invitat: " + m.group("par").strip()[:70]
        tipuri = [k for k, rx in TIPURI if rx.search(s)]
        if (R_ANGAJ_EXEC if rol in ("primar", "viceprimar", "functie") or (rol or "").startswith("invitat") else R_ANGAJ).search(s):
            tipuri.append("angajament")
        if R_CONFLICT.search(s):
            tipuri = ["conflict"]
        elif R_PROCEDURA.search(s) and len(s) < 260:
            continue   # conducerea ședinței, nu o declarație
        ctx = normalizeaza(titlu) + " " + s
        out.append({"punct": punct, "titlu": titlu, "cine": nume, "rol": rol, "text": p, "tipuri": tipuri,
                    "teme": [k for k, _, rx in TEME_RX if rx.search(ctx)], "_deschis": True})
    for x in out:
        x.pop("_deschis", None)
        x["text"] = ascunde(x["text"])[:1800].replace("—", "-")
    return out


def _consilieri(data_dir):
    try:
        with open(os.path.join(data_dir, "intern-date", "voturi.json"), encoding="utf-8") as f:
            return json.load(f).get("consilieri") or []
    except (OSError, ValueError):
        return []


def _potriveste(nume, zi, consilieri):
    """Consilierul (profilul din voturi.json) cu numele din procesul-verbal, în consiliu la data ședinței."""
    tok = set(_cheie(nume).split())
    if not tok:
        return None
    cand = [c for c in consilieri if tok <= set(_cheie(c["nume"]).split()) or any(tok <= set(_cheie(v).split()) for v in c.get("variante") or [])]
    if len(cand) > 1:
        in_per = [c for c in cand if any(a <= zi <= b for a, b in c.get("perioade") or [])]
        cand = in_per or cand
    if len(cand) == 1:
        return cand[0]
    if cand or len(tok) != 1:
        return None
    # un singur cuvânt (numele de familie), cu greșeli de OCR: „Jecaio”, „Grjincu”, „Oiarean”
    w = next(iter(tok))
    if len(w) < 5:
        return None
    tol = 1 if len(w) < 7 else 2
    apr = [c for c in consilieri if any(abs(len(w) - len(x)) <= tol and _lev(w, x, tol) <= tol for x in _cheie(c["nume"]).split() if len(x) >= 5)]
    if len(apr) > 1:
        apr = [c for c in apr if any(a <= zi <= b for a, b in c.get("perioade") or [])]
    return apr[0] if len(apr) == 1 else None


def _unifica(persoane):
    """Variantele de OCR ale aceluiași nume, la cei care nu sunt consilieri („Cerneţchi”/„Cernetcehi”, „Koffler”/„Kofiler”):
    {cheia variantei: cheia formei celei mai frecvente}."""
    simple = sorted((p for p in persoane.values() if not p["id"] and ":" not in p["k"] and len(p["k"].split()) == 1 and len(p["k"]) >= 5), key=lambda p: -p["n"])
    spre, capete = {}, []
    for p in simple:
        w = p["k"]
        tol = 1 if len(w) < 7 else 2
        g = next((c for c in capete if abs(len(c) - len(w)) <= tol and _lev(w, c, tol) <= tol), None)
        if g:
            spre[w] = g
        else:
            capete.append(w)
    return spre


def construieste(store, data_dir=config.DATA_DIR):
    """Scrie data/_intern/interventii-index.json și interventii-<an>.json (doar pentru zona internă)."""
    db = store.db
    consilieri = _consilieri(data_dir)
    pe_an, persoane = {}, {}
    vazute = set()
    for r in db.execute("SELECT t.session_date, d.url, d.text_path FROM documents d JOIN pv t ON t.wp_id=d.wp_id "
                        "WHERE d.text_path IS NOT NULL AND t.session_date IS NOT NULL ORDER BY t.session_date"):
        try:
            with open(r["text_path"], encoding="utf-8") as f:
                text = f.read()
        except OSError:
            continue
        if len(text) < 3000 or (r["session_date"], len(text)) in vazute:   # afișările scurte și dublurile
            continue
        vazute.add((r["session_date"], len(text)))
        zi, fisier = r["session_date"], r["url"].rsplit("/", 1)[-1]
        for x in extrage(text):
            c = None if x["rol"] in ("secretar", "viceprimar", "presedinte", "functie") or (x["rol"] or "").startswith("invitat") else _potriveste(x["cine"], zi, consilieri)
            nume = c["nume"] if c else x["cine"]
            k = (x["rol"] + ":" if x["rol"] in ("secretar", "viceprimar", "presedinte", "functie") else "") + _cheie(nume)
            p = persoane.setdefault(k, {"k": k, "nume": nume, "id": c["id"] if c else None, "roluri": Counter(), "n": 0, "teme": Counter(), "ani": Counter()})
            p["n"] += 1
            p["roluri"][x["rol"] or ("consilier" if c else "altul")] += 1
            p["ani"][zi[:4]] += 1
            for t in x["teme"]:
                p["teme"][t] += 1
            pe_an.setdefault(zi[:4], []).append([zi, x["punct"], x["titlu"], k, x["rol"], x["text"], x["teme"], x["tipuri"], fisier, r["url"]])
    spre = _unifica(persoane)
    for k, g in spre.items():
        a, b = persoane.pop(k), persoane[g]
        b["n"] += a["n"]
        for c in ("roluri", "teme", "ani"):
            b[c].update(a[c])
    if spre:
        for L in pe_an.values():
            for x in L:
                x[3] = spre.get(x[3], x[3])
    d = os.path.join(data_dir, "_intern")
    os.makedirs(d, exist_ok=True)
    for n in os.listdir(d):
        if re.fullmatch(r"interventii-\d{4}\.json", n):
            os.remove(os.path.join(d, n))
    for an, L in pe_an.items():
        with open(os.path.join(d, f"interventii-{an}.json"), "w", encoding="utf-8") as f:
            json.dump(L, f, ensure_ascii=False, separators=(",", ":"))
    P = sorted(({"k": p["k"], "nume": p["nume"], "id": p["id"], "rol": p["roluri"].most_common(1)[0][0], "n": p["n"],
                 "teme": dict(p["teme"]), "ani": dict(p["ani"])} for p in persoane.values()), key=lambda p: -p["n"])
    with open(os.path.join(d, "interventii-index.json"), "w", encoding="utf-8") as f:
        json.dump({"generat_la": datetime.now().isoformat(timespec="seconds"), "ani": {a: len(L) for a, L in sorted(pe_an.items())},
                   "teme": [[k, e] for k, e, _ in TEME], "persoane": P,
                   "campuri": ["data", "punct", "titlu", "persoana", "rol", "text", "teme", "tipuri", "fisier", "url"]}, f, ensure_ascii=False, separators=(",", ":"))
    return {"interventii": sum(len(L) for L in pe_an.values()), "persoane": len(P), "ani": len(pe_an)}
