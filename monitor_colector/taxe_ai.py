"""Lista taxelor și impozitelor locale din hotărârile anuale, extrasă cu un model de limbaj (API Anthropic).

Hotărârea anuală are anexe lungi, cu tabele scanate; expresiile regulate nu le pot citi sigur. Pentru fiecare hotărâre
anuală, modelul primește textul și întoarce: (1) un set fix de niveluri, aceleași în fiecare an, ca să se poată face
grafice de evoluție; (2) lista taxelor găsite în anexe. Rezultatul se salvează în data/taxe-ai/<an>-<nr>.json, cu
amprenta textului, deci fiecare hotărâre e trimisă o singură dată (din nou doar dacă textul s-a schimbat).

Valorile sunt extrase automat și se verifică în hotărâre; pagina o spune.
"""
import hashlib
import json
import os

import requests

from .parse import norm
from .rezumat import API, MODEL, _json

MAX_PE_RULARE = int(os.environ.get("MC_TAXE_AI_MAX", "15"))   # prima dată toate; apoi doar hotărârile noi
MAX_CARACTERE = 160000

# nivelurile comparate de la an la an: cheie -> (denumire, unitate)
INDICATORI = {
    "indexare": ("Indexarea față de anul anterior", "%"),
    "cladiri_rezidentiale_pf": ("Clădiri rezidențiale ale persoanelor fizice: cota de impozit", "%"),
    "cladiri_nerezidentiale_pf": ("Clădiri nerezidențiale ale persoanelor fizice: cota de impozit", "%"),
    "cladiri_rezidentiale_pj": ("Clădiri rezidențiale ale firmelor: cota de impozit", "%"),
    "cladiri_nerezidentiale_pj": ("Clădiri nerezidențiale ale firmelor: cota de impozit", "%"),
    "valoare_cladire_beton": ("Valoarea impozabilă a clădirii cu cadre de beton armat, cu instalații (art. 457)", "lei/mp"),
    "teren_intravilan_zona_a": ("Teren intravilan cu construcții, zona A", "lei/ha"),
    "teren_intravilan_zona_b": ("Teren intravilan cu construcții, zona B", "lei/ha"),
    "auto_pana_1600": ("Autoturisme până la 1.600 cm³", "lei/200 cm³"),
    "auto_1601_2000": ("Autoturisme între 1.601 și 2.000 cm³", "lei/200 cm³"),
    "auto_2001_2600": ("Autoturisme între 2.001 și 2.600 cm³", "lei/200 cm³"),
    "auto_2601_3000": ("Autoturisme între 2.601 și 3.000 cm³", "lei/200 cm³"),
    "auto_peste_3000": ("Autoturisme peste 3.001 cm³", "lei/200 cm³"),
    "motociclete_pana_1600": ("Motociclete, tricicluri, cvadricicluri până la 1.600 cm³", "lei/200 cm³"),
    "autorizatie_construire_locuinta": ("Taxa pentru autorizația de construire a unei locuințe", "% din valoare"),
    "certificat_urbanism_150mp": ("Taxa pentru certificatul de urbanism, suprafață până la 150 mp", "lei"),
    "reclama_firma": ("Taxa pentru afișaj, firmă la locul activității", "lei/mp"),
    "spectacole": ("Impozitul pe spectacole (concerte, teatru)", "%"),
    "taxa_hoteliera": ("Taxa hotelieră / taxa de promovare turistică", "%"),
    "salubrizare_pf": ("Taxa de salubrizare, persoane fizice", "lei/persoană/lună"),
    "salubrizare_pj": ("Taxa de salubrizare, persoane juridice (cel mai des nivel)", "lei"),
    "majorare_teren_neingrijit": ("Majorarea impozitului pentru clădirile/terenurile neîngrijite", "%"),
    "bonificatie": ("Bonificația pentru plata integrală până la 31 martie", "%"),
}

INSTRUCTIUNI = (
    "Ești un asistent care citește hotărâri ale consiliilor locale din România despre impozitele și taxele locale. "
    "Textul vine din documente scanate (OCR) și poate avea greșeli; tabelele pot fi destrămate pe rânduri. "
    "Extragi doar ce scrie în text, fără să completezi din cunoștințele tale sau din Codul fiscal. "
    "Dacă un nivel nu apare clar în text, pui null. Numerele le dai ca numere JSON (punct zecimal), fără unități. "
    "Răspunzi doar cu un obiect JSON valid, fără alt text."
)


def _mesaj(an, text):
    ind = "\n".join(f'- "{k}": {d} [{u}]' for k, (d, u) in INDICATORI.items())
    return (
        f"Mai jos e textul hotărârii privind impozitele și taxele locale pentru anul {an} în municipiul Rădăuți, cu anexele.\n\n"
        "Întoarce un JSON de forma:\n"
        '{"indicatori": {"<cheie>": {"valoare": <număr sau null>, "citat": "<cel mult 15 cuvinte din text, unde apare>"}},\n'
        ' "taxe": [{"categorie": "<clădiri | terenuri | mijloace de transport | certificate și autorizații | afișaj și reclamă | spectacole | taxe speciale | alte taxe | facilități și scutiri>",\n'
        '           "denumire": "<denumirea taxei sau a rândului din tabel, scurt>", "valoare": <număr sau null>, "unitate": "<lei, lei/mp, %, lei/an etc.>"}],\n'
        ' "observatii": "<una-două propoziții: ce e nou sau diferit în anul acesta, dacă textul o spune; altfel șir gol>"}\n\n'
        "Pentru „indicatori” folosește exact cheile acestea (unitatea dorită e între paranteze drepte; transformă dacă textul dă altă unitate, "
        "de exemplu lei/m² în lei/mp; pentru teren dă valoarea pe hectar):\n"
        f"{ind}\n\n"
        "În „taxe” pune toate taxele și nivelurile din anexe pe care le poți citi (cel mult 120 de rânduri), cu valorile pentru anul "
        f"{an}. Nu repeta aceeași taxă de două ori.\n\n=== TEXTUL HOTĂRÂRII ===\n{text[:MAX_CARACTERE]}"
    )


def _cere(an, text, cheie, sesiune):
    corp = {"model": MODEL, "max_tokens": 16000, "system": INSTRUCTIUNI,
            "messages": [{"role": "user", "content": _mesaj(an, text)}]}
    antet = {"x-api-key": cheie, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    for gandire in ({"type": "between_tools"}, {"type": "enabled", "budget_tokens": 4000}, None):
        if gandire:
            corp["thinking"] = gandire
        else:
            corp.pop("thinking", None)
        r = sesiune.post(API, timeout=600, headers=antet, json=corp)
        if not (r.status_code == 400 and "thinking" in r.text):
            break
    if r.status_code != 200:
        raise RuntimeError(f"API {r.status_code}: {r.text[:200]}")
    d = r.json()
    rez = _json("".join(b.get("text", "") for b in d.get("content", []) if b.get("type") == "text"))
    rez["_model"] = d.get("model", MODEL)
    return rez


def _curata(rez):
    ind = {}
    for k in INDICATORI:
        v = (rez.get("indicatori") or {}).get(k) or {}
        val = v.get("valoare") if isinstance(v, dict) else v
        if isinstance(val, (int, float)) and val >= 0:
            ind[k] = {"valoare": val, "citat": (v.get("citat") or "")[:160] if isinstance(v, dict) else ""}
    taxe, vazut = [], set()
    for t in rez.get("taxe") or []:
        if not isinstance(t, dict) or not t.get("denumire"):
            continue
        k = norm(str(t.get("categorie")) + "|" + str(t["denumire"]))
        if k in vazut:
            continue
        vazut.add(k)
        val = t.get("valoare")
        taxe.append({"categorie": str(t.get("categorie") or "alte taxe")[:60], "denumire": str(t["denumire"])[:220],
                     "valoare": val if isinstance(val, (int, float)) else None, "unitate": str(t.get("unitate") or "")[:40]})
    return {"indicatori": ind, "taxe": taxe[:150], "observatii": str(rez.get("observatii") or "")[:600], "model": rez.get("_model")}


def extrage(db, data_dir, anuale, cheie=None):
    """anuale: {an: {"an": an_hcl, "nr": nr, "pdf": url}}. Întoarce {an: rezultat} din cache, completând cel mult MAX_PE_RULARE."""
    from .teme import _txt
    cheie = cheie if cheie is not None else os.environ.get("ANTHROPIC_API_KEY")
    d = os.path.join(data_dir, "taxe-ai")
    os.makedirs(d, exist_ok=True)
    out, noi, erori = {}, 0, []
    s = requests.Session()
    for anul in sorted(anuale, reverse=True):   # întâi anii recenți
        h = anuale[anul]
        text = _txt(db, h.get("pdf"))
        if len(text) < 1500:
            continue
        amprenta = hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]
        cale = os.path.join(d, f"{h['an']}-{h['nr']}.json")
        try:
            with open(cale, encoding="utf-8") as f:
                c = json.load(f)
            if c.get("amprenta") == amprenta:
                out[anul] = c
                continue
        except (OSError, ValueError):
            pass
        if not cheie or noi >= MAX_PE_RULARE:
            continue
        noi += 1
        try:
            c = dict(_curata(_cere(anul, text, cheie, s)), amprenta=amprenta, hcl={"an": h["an"], "nr": h["nr"]})
        except Exception as e:   # noqa: BLE001 — o hotărâre nereușită nu oprește restul
            erori.append(f"{anul}: {str(e)[:120]}")
            continue
        with open(cale, "w", encoding="utf-8") as f:
            json.dump(c, f, ensure_ascii=False, separators=(",", ":"))
        out[anul] = c
    return out, {"extrase_acum": noi, "in_cache": len(out) - noi, "erori": erori}


def indicatori_publici():
    return {k: {"nume": n, "unitate": u} for k, (n, u) in INDICATORI.items()}


def aplica(db, data_dir, taxe_pe_ani):
    """Completează rezultatul teme.taxe(db) cu lista extrasă automat (cheia „ai” la fiecare an)."""
    anuale = {}
    for anul, a in taxe_pe_ani.items():
        if a.get("hcl") and a.get("pdf"):
            anuale[anul] = {"an": a["hcl"]["an"], "nr": a["hcl"]["nr"], "pdf": a["pdf"]}
    rez, st = extrage(db, data_dir, anuale)
    for anul, c in rez.items():
        taxe_pe_ani[anul]["ai"] = {"indicatori": c["indicatori"], "taxe": c["taxe"], "observatii": c.get("observatii", "")}
    return st

