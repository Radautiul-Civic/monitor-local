"""Bugetele aprobate ale municipiului (formularul „Buget individual” F1103 din Transparență bugetară, MFP).

PDF-urile se pun în surse/buget/ (ex. Buget_2025.pdf), câte unul pe an. Din fiecare citim, pe secțiuni
(funcționare, dezvoltare) și pe surse de finanțare (A. integral de la buget, C. credite interne,
E. venituri proprii etc.): totalul veniturilor și al cheltuielilor, veniturile pe coduri și cheltuielile
pe capitole. Din veniturile secțiunii de dezvoltare reiese din ce trebuiau plătite investițiile:
bani mutați din funcționare, excedentul anilor trecuți, programe naționale, PNRR, fonduri europene, împrumuturi.

Bugetul aprobat e planul; execuția (ce s-a încasat și plătit efectiv) vine din transparenta.eu (buget.py).
"""
import os
import re
import subprocess

from . import config

SURSE = os.environ.get("MC_SURSE_DIR", "surse")
R_SECTIUNE = re.compile(r"02\.\s*Bugetul local:.*?-\s*([A-Z])\.\s*(.+?),\s*Sectiune\s+(Functionare|Dezvoltare)", re.I)
R_NUMAR = re.compile(r"^-?\d{1,3}(?:\.\d{3})*$|^-?\d+$")
R_AN = re.compile(r"An pentru care se depune bugetul\s+((?:\d\s*){4})")

# sursele de finanțare ale investițiilor, după codul de venit din secțiunea de dezvoltare
FINANTARE = [
    ("Împrumuturi", ("41",)),
    ("PNRR", ("4288", "4289", "4349")),
    ("Fonduri europene", ("45", "48", "56", "58")),
    ("Programe naționale (PNDL, Anghel Saligny etc.)", ("42",)),
    ("Subvenții de la alte bugete", ("43",)),
    ("Excedentul din anii trecuți", ("40",)),
    ("Bani mutați din secțiunea de funcționare", ("37",)),
    ("Vânzări de bunuri (terenuri, clădiri)", ("39",)),
]


def _suma(t):
    return int(t.replace(".", ""))


def _text(pdf):
    return subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout


def citeste(pdf=None, text=None):
    """{an, sectiuni: [{sursa, sursa_nume, sectiune, venituri, cheltuieli, vn: {cod: sumă}, ch: {capitol: sumă}}]}"""
    text = text if text is not None else _text(pdf)
    m = R_AN.search(text)
    an = int(re.sub(r"\D", "", m.group(1))) if m else None
    sectiuni, cur, parte = [], None, None
    for linie in text.splitlines():
        h = R_SECTIUNE.search(linie)
        if h:
            cur = {"sursa": h.group(1).upper(), "sursa_nume": re.sub(r"\s+", " ", h.group(2)).strip(),
                   "sectiune": h.group(3).lower().replace("functionare", "functionare"), "venituri": 0, "cheltuieli": 0, "vn": {}, "ch": {}}
            sectiuni.append(cur)
            parte = None
            continue
        if cur is None:
            continue
        t = linie.split()
        if not t:
            continue
        if t[-1] == "X":
            t = t[:-1]
        if t[0] in ("Venituri:", "Cheltuieli:"):
            parte = "vn" if t[0] == "Venituri:" else "ch"
            nums = [x for x in t[1:] if R_NUMAR.match(x)]
            if len(nums) >= 7:
                cur["venituri" if parte == "vn" else "cheltuieli"] = _suma(nums[-7])
            continue
        if parte and re.fullmatch(r"\d{2,14}", t[0]):
            nums = [x for x in t[1:] if R_NUMAR.match(x)]
            if len(nums) < 7:
                continue
            suma = _suma(nums[-7])   # „an curent”: primul din cele 7 coloane de sume
            if parte == "vn":
                cur["vn"][t[0]] = suma
            elif len(t[0]) == 2:
                cur["ch"][t[0]] = cur["ch"].get(t[0], 0) + suma
    return {"an": an, "sectiuni": sectiuni}


def finantare_dezvoltare(sectiuni):
    """Din ce trebuiau finanțate investițiile: veniturile secțiunilor de dezvoltare, pe surse."""
    out = {}
    for s in sectiuni:
        if s["sectiune"] != "dezvoltare":
            continue
        vn = s["vn"]
        luat = 0
        for nume, coduri in FINANTARE:
            v = 0
            for c in coduri:
                if len(c) == 2:
                    v += vn.get(c, 0)
                    if c in ("42", "43"):   # PNRR e socotit separat
                        v -= sum(vn.get(x, 0) for x in ("4288", "4289", "4349") if x.startswith(c))
                else:
                    v += vn.get(c, 0)
            if v:
                out[nume] = out.get(nume, 0) + v
                luat += v
        rest = s["venituri"] - luat
        if abs(rest) > 1000:
            out["Alte surse"] = out.get("Alte surse", 0) + rest
    return out


def toate(director=None):
    """{an: rezumat} pentru toate PDF-urile din surse/buget/."""
    d = director or os.path.join(SURSE, "buget")
    out = {}
    if not os.path.isdir(d):
        return out
    for n in sorted(os.listdir(d)):
        if not n.lower().endswith(".pdf"):
            continue
        try:
            b = citeste(os.path.join(d, n))
        except Exception:
            continue
        an = b["an"] or (int(re.search(r"(20\d\d)", n).group(1)) if re.search(r"(20\d\d)", n) else None)
        if not an:
            continue
        S = b["sectiuni"]
        sum_ = lambda f: sum(s["cheltuieli"] for s in S if f(s))
        cap = {}
        for s in S:
            for k, v in s["ch"].items():
                cap.setdefault(s["sectiune"], {})[k] = cap.setdefault(s["sectiune"], {}).get(k, 0) + v
        out[str(an)] = {
            "fisier": n,
            "cheltuieli": sum_(lambda s: True), "venituri": sum(s["venituri"] for s in S),
            "functionare": sum_(lambda s: s["sectiune"] == "functionare"),
            "dezvoltare": sum_(lambda s: s["sectiune"] == "dezvoltare"),
            "credite": sum_(lambda s: s["sursa"] in ("C", "D")),
            "finantare_dezvoltare": finantare_dezvoltare(S),
            "capitole": cap,
            "sectiuni": [{k: s[k] for k in ("sursa", "sursa_nume", "sectiune", "venituri", "cheltuieli")} for s in S],
        }
    return out
