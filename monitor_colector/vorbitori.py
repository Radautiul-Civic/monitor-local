"""Cine a vorbit în ședință: fragmentele transcrierii automate puse în dreptul vorbitorilor, cu ajutorul procesului-verbal.

Transcrierea (Whisper) are cuvintele exacte, dar nu spune cine vorbește. Procesul-verbal spune, în ordine, cine a luat
cuvântul și ce a spus, rezumat („Dl Tatar intervine și precizează că...”). Un model AI le potrivește: fiecare
intervenție din transcriere primește vorbitorul, cu „sigur” (se prezintă, e numit de președinte sau se potrivește
clar cu PV) sau „probabil”, plus dovada. Rezultatul stă doar în zona internă și servește la verificarea citatelor:
înainte de orice citat public, pasajul se ascultă pe înregistrare.

  intern/transcrieri/<id>-vorbitori.json   {"interventii": [...], "nepotriviri": [...], "generat_la", "_model", "_tokeni"}
"""
import re
from datetime import datetime

from . import rezumat

INSTRUCTIUNI = """Primești transcrierea automată (Whisper, cu greșeli, fără vorbitori) a unei ședințe a Consiliului Local al
Municipiului Rădăuți, procesul-verbal oficial al aceleiași ședințe și lista consilierilor. Sarcina ta: împarte transcrierea în
intervenții și spune cine vorbește în fiecare.

Reguli:
1. Folosește doar sursele primite. Procesul-verbal dă ordinea vorbitorilor și ideile lor; transcrierea dă momentul și cuvintele.
2. „sigur” doar când: vorbitorul se prezintă, președintele de ședință îi dă cuvântul pe nume chiar înainte, cineva i se adresează
   pe nume și el răspunde imediat, sau intervenția se potrivește fără dubiu cu una din procesul-verbal (aceeași idee, în aceeași ordine).
   „probabil” când potrivirea e plauzibilă, dar nu sigură. Când nu știi, scrie cine: null. Nu ghici.
3. Numele le scrii ca în lista consilierilor sau ca în procesul-verbal (ex. „Blănaru Daniela Persida”, „primarul Loghin Bogdan-Andrei”,
   „directorul economic Ursescu”). Pentru cei din afara consiliului folosește funcția din procesul-verbal.
4. Președintele de ședință care doar conduce (dă cuvântul, supune la vot, anunță rezultatul) e o intervenție separată, scurtă.
5. „pv” e fragmentul din procesul-verbal care corespunde intervenției (cel mult 200 de caractere, copiat exact), sau null.
6. La „nepotriviri” notezi ce spune procesul-verbal și nu apare în înregistrare (sau invers), mai ales la voturi și la cine a ce a spus.
7. Acoperă toată transcrierea, în ordine, fără suprapuneri. Minutele le iei din etichetele [H:MM:SS] ale transcrierii.

Răspunde DOAR cu un obiect JSON valid:
{"interventii": [{"de_la": "H:MM:SS", "pana_la": "H:MM:SS", "cine": "nume sau null", "rol": "consilier / primar / președinte de ședință /
  secretar / funcționar / invitat / null", "sigur": "sigur | probabil", "dovada": "de ce crezi asta, o propoziție", "pv": "fragment sau null"}],
 "nepotriviri": [{"minut": "H:MM:SS", "ce": "o propoziție"}]}"""


def _sec(hms):
    try:
        h, m, s = (int(x) for x in str(hms).split(":"))
        return h * 3600 + m * 60 + s
    except (ValueError, AttributeError):
        return None


def mesaj(pv, segmente, consilieri, data):
    return (f"ȘEDINȚA din {data}\n\n=== CONSILIERII LOCALI ===\n" + ("\n".join(consilieri) or "(lista nu e disponibilă)") +
            f"\n\n=== PROCESUL-VERBAL (citit automat, poate avea greșeli de OCR) ===\n{pv}\n\n"
            f"=== TRANSCRIEREA AUTOMATĂ ===\n{rezumat.transcriere_text(segmente, bloc=15)}")


def curata(rez, durata=None):
    """Intervențiile în ordine, cu secunde, fără suprapuneri și fără intervale imposibile."""
    out = []
    for x in rez.get("interventii") or []:
        a, b = _sec(x.get("de_la")), _sec(x.get("pana_la"))
        if a is None:
            continue
        if b is None or b < a:
            b = a
        if durata and a > durata + 60:
            continue
        cine = (x.get("cine") or "").strip() or None
        if cine and cine.lower() in ("null", "necunoscut", "neidentificat"):
            cine = None
        out.append({"a": a, "b": b, "cine": cine, "rol": x.get("rol") or None,
                    "sigur": "sigur" if x.get("sigur") == "sigur" and cine else "probabil",
                    "dovada": (x.get("dovada") or "")[:300], "pv": (x.get("pv") or None) and x["pv"][:300]})
    out.sort(key=lambda x: x["a"])
    for i in range(len(out) - 1):
        if out[i]["b"] >= out[i + 1]["a"]:
            out[i]["b"] = max(out[i]["a"], out[i + 1]["a"] - 1)
    return out


def genereaza(pv, segmente, consilieri, data, **kw):
    rez = rezumat.apel(INSTRUCTIUNI, mesaj(pv, segmente, consilieri, data), max_tokens=32000, **kw)
    durata = segmente[-1][1] if segmente else None
    return {"interventii": curata(rez, durata), "nepotriviri": rez.get("nepotriviri") or [], "generat_la": datetime.now().isoformat(timespec="seconds"),
            "_model": rez.get("_model"), "_tokeni": rez.get("_tokeni")}


def vorbitor_la(interventii, t):
    """Intervenția în care cade secunda t (sau None)."""
    for x in interventii:
        if x["a"] <= t <= x["b"] + 1:
            return x
    return None


def nume_consilieri(db):
    try:
        import json
        import os
        from . import config
        with open(os.path.join(config.DATA_DIR, "componenta.json"), encoding="utf-8") as f:
            return [f"{x['nume']} ({x.get('partid') or 'partid necunoscut'})" for x in json.load(f).get("consilieri") or []]
    except (OSError, ValueError):
        return []


def de_facut(intern, maxim=2):
    """Transcrierile fără vorbitori, pentru ședințele care au proces-verbal. Întoarce o listă de rapoarte (fără conținut)."""
    from . import config
    from .store import Store
    st = Store(config.DB_PATH)
    fisiere = set(intern.lista(rezumat_transcrieri()))
    facute = []
    for f in sorted(fisiere, reverse=True):
        if not re.match(r"^\d{4}-\d{2}-\d{2}-[\w-]+\.json$", f) or f.endswith("-vorbitori.json"):
            continue
        cid = f[:-5]
        if f"{cid}-vorbitori.json" in fisiere:
            continue
        tr = intern.json(f"{rezumat_transcrieri()}/{f}")
        if not tr or not tr.get("segmente"):
            continue
        ctx = rezumat.context(st.db, tr["data"])
        if not ctx["pv"]:
            continue   # fără procesul-verbal, atribuirea ar fi doar ghicită; revenim când apare
        try:
            v = genereaza(ctx["pv"], tr["segmente"], nume_consilieri(st.db), ctx["data"])
            intern.scrie(f"{rezumat_transcrieri()}/{cid}-vorbitori.json", v)
            facute.append({"id": cid, "interventii": len(v["interventii"]), "sigure": sum(1 for x in v["interventii"] if x["sigur"] == "sigur"), "tokeni": v["_tokeni"]})
        except Exception as e:
            facute.append({"id": cid, "eroare": str(e)[:300]})
        if len(facute) >= maxim:
            break
    return facute


def rezumat_transcrieri():
    from .video import TRANSCRIERI
    return TRANSCRIERI
