"""Datele personale ascunse din texte înainte de a fi afișate sau exportate (sonda, dosarele pe temă):
CNP-uri, seria și numărul actului de identitate, adresa de domiciliu."""
import re

_CNP = re.compile(r"(?<!\d)[1-8]\d{12}(?!\d)")
_ACT = re.compile(r"(?i)(seria?\s*[A-Z]{2}\s*(?:nr\.?|num[aă]r(?:ul)?)?\s*)\d{6}")
_DOM = re.compile(r"(?i)domiciliat\w*\s+(?:[iî]n\s+)?")
_JUD = re.compile(r"(?i)\bjud(?:e[tţț]ul)?\.?\s*\w+")
_LOC = re.compile(r"(?i)\b(?:str\.|strada)\s*[^,;\n]{1,40},?\s*nr\.?\s*\d+\w?(?:[,\s]*(?:bl|sc|et|ap)\.?\s*\w+){0,5}[,\s]*ap\.?\s*\d+")


def ascunde(t):
    t = _CNP.sub("[CNP]", t or "")
    t = _ACT.sub(r"\1[nr. act]", t)
    # adresa de domiciliu: tot ce urmează după „domiciliat”, până la județ inclusiv (altfel, următoarele 120 de caractere)
    out, poz = [], 0
    for m in _DOM.finditer(t):
        if m.start() < poz:
            continue
        rest = t[m.end():m.end() + 220]
        j = _JUD.search(rest)
        out.append(t[poz:m.start()] + m.group(0) + "[adresă]")
        poz = m.end() + (j.end() if j else min(len(rest), 120))
    t = "".join(out) + t[poz:]
    # orice altă adresă de locuință (cu apartament): „str. X, nr. 10, sc. D, et. 2, ap. 57”
    return _LOC.sub("[adresă]", t)
