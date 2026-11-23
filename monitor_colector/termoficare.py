"""Termoficarea (energia termică livrată de S.C. Servicii Comunale S.A. Rădăuți): toate hotărârile pe subiect și prețurile pe perioade.

Hotărârile se aleg după titlu și se împart pe feluri: tarife, subvenții și pierderi acoperite din buget, gestiunea serviciului
(contract, regulament, licitație), investiții. Prețurile sunt în anexele scanate ale hotărârilor de tarife (tabele destrămate de
OCR), așa că le citim cu un model de limbaj, ca la taxe: pentru fiecare perioadă, prețul total cu TVA, cât plătește populația,
cât acoperă bugetul local (subvenția) și cota de TVA, toate în lei/MWh. Rezultatul se păstrează în data/termoficare-ai/<an>-<nr>.json,
cu amprenta textului, deci fiecare hotărâre se trimite o singură dată.
"""
import hashlib
import json
import os
import re

import requests

from .parse import clean_title, norm
from .rezumat import API, MODEL, _json

RX = r"energi\w* termic|termoficar|agent\w* termic|centrala de zona|serviciul public de alimentare cu energie termica|pierderilor induse de prestarea"
NU = r"toalete|dusuri|alee|parcare|masini de spalat"
FELURI = [("pierderi", r"pierderi|subventi|acoperirea diferentei"),
          ("tarife", r"tarif|pretul local|pretului local|prelungirii valabilitatii"),
          ("gestiune", r"dare in administrare|delegar|contract|regulament|caiet\w* de sarcini|studiu\w* de oportunitate|atribuire|licitati|gestiun"),
          ("investitii", r"indicator|investiti|reabilit|modernizar|retea|extinder|centrala")]
MAX_PE_RULARE = int(os.environ.get("MC_TERMO_AI_MAX", "40"))
VERIFICATE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "surse", "termoficare", "preturi.json")

INSTRUCTIUNI = (
    "Citești hotărâri ale Consiliului Local Rădăuți despre prețul energiei termice (termoficare). Textul vine din documente scanate (OCR), "
    "cu tabelele din anexe destrămate pe rânduri. Extragi doar ce scrie în text, fără să completezi. Răspunzi doar cu un obiect JSON valid."
)


def _mesaj(titlu, text):
    return (
        f"Hotărârea: {titlu}\n\n"
        "Pentru fiecare perioadă pentru care hotărârea stabilește prețuri (de obicei în anexe), întoarce:\n"
        '{"perioade": [{"de_la": "AAAA-LL-ZZ", "pana_la": "AAAA-LL-ZZ sau null dacă e „începând cu”", '
        '"total_cu_tva": <prețul local al serviciului (producere, transport, distribuție) pentru consumatorii casnici, cu TVA, lei/MWh>, '
        '"populatie_cu_tva": <prețul local facturat populației (consumatori casnici), cu TVA, lei/MWh>, '
        '"subventie_cu_tva": <suma necesară acoperirii diferenței, adică subvenția de la buget, cu TVA, lei/MWh>, '
        '"tva": <cota TVA în procente>, "noncasnici_cu_tva": <prețul pentru consumatorii noncasnici, cu TVA, lei/MWh>, '
        '"unitate": "<MWh sau Gcal: unitatea în care sunt date prețurile în hotărâre>"}],\n'
        ' "pierderi_lei": <dacă hotărârea aprobă acoperirea unor pierderi, suma totală în lei, altfel null>,\n'
        ' "pe_scurt": "<o propoziție simplă: ce hotărăște>"}\n'
        "Numerele ca numere JSON (punct zecimal). Dacă o valoare lipsește sau nu se poate citi sigur, pune null. "
        "Dacă hotărârea dă prețurile în lei/Gcal, păstrează valorile din text și pune unitate Gcal (le transformăm noi). "
        "Nu inventa perioade din fundamentări sau din anexele cu pierderi. Verifică: de obicei total = populație + subvenție.\n\n=== TEXTUL ===\n" + text[:60000]
    )


def _cere(titlu, text, cheie, s):
    corp = {"model": MODEL, "max_tokens": 4000, "system": INSTRUCTIUNI, "messages": [{"role": "user", "content": _mesaj(titlu, text)}]}
    antet = {"x-api-key": cheie, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    for gandire in ({"type": "between_tools"}, {"type": "enabled", "budget_tokens": 2000}, None):
        if gandire:
            corp["thinking"] = gandire
        else:
            corp.pop("thinking", None)
        r = s.post(API, timeout=300, headers=antet, json=corp)
        if not (r.status_code == 400 and "thinking" in r.text):
            break
    if r.status_code != 200:
        raise RuntimeError(f"API {r.status_code}: {r.text[:200]}")
    return _json("".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text"))


def _num(v):
    return float(v) if isinstance(v, (int, float)) and 0 < v < 100000000 else None


def _curata(r):
    per = []
    for p in r.get("perioade") or []:
        if not isinstance(p, dict) or not re.fullmatch(r"20\d\d-\d\d-\d\d", str(p.get("de_la") or "")):
            continue
        x = {"de_la": p["de_la"], "pana_la": p.get("pana_la") if re.fullmatch(r"20\d\d-\d\d-\d\d", str(p.get("pana_la") or "")) else None}
        for k in ("total_cu_tva", "populatie_cu_tva", "subventie_cu_tva", "tva", "noncasnici_cu_tva"):
            x[k] = _num(p.get(k))
        if str(p.get("unitate") or "").lower().startswith("gcal"):
            for k in ("total_cu_tva", "populatie_cu_tva", "subventie_cu_tva", "noncasnici_cu_tva"):
                if x[k]:
                    x[k] = round(x[k] / 1.163, 2)
        if x["populatie_cu_tva"] or x["total_cu_tva"]:
            per.append(x)
    return {"perioade": per, "pierderi_lei": _num(r.get("pierderi_lei")), "pe_scurt": str(r.get("pe_scurt") or "")[:300]}


def scrie(db, data_dir, cheie=None):
    from .teme import _txt
    cheie = cheie if cheie is not None else os.environ.get("ANTHROPIC_API_KEY")
    d = os.path.join(data_dir, "termoficare-ai")
    os.makedirs(d, exist_ok=True)
    s = requests.Session()
    H, noi, erori = [], 0, []
    for an, nr, data, titlu, pdf in db.execute("SELECT year, number, adoption_date, title, pdf_url FROM hcl WHERE title IS NOT NULL ORDER BY adoption_date DESC, year DESC, number DESC"):
        t = norm(titlu)
        if not re.search(RX, t) or re.search(NU, t):
            continue
        fel = next((f for f, rx in FELURI if re.search(rx, t)), "alta")
        x = {"an": an, "nr": nr, "data": data, "titlu": clean_title(titlu)[:300], "fel": fel}
        if fel in ("tarife", "pierderi"):
            text = _txt(db, pdf)
            if len(text) > 800:
                amp = hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]
                cale = os.path.join(d, f"{an}-{nr}.json")
                c = None
                try:
                    with open(cale, encoding="utf-8") as f:
                        c = json.load(f)
                    if c.get("amprenta") != amp:
                        c = None
                except (OSError, ValueError):
                    pass
                if c is None and cheie and noi < MAX_PE_RULARE:
                    noi += 1
                    try:
                        c = dict(_curata(_cere(x["titlu"], text, cheie, s)), amprenta=amp)
                        with open(cale, "w", encoding="utf-8") as f:
                            json.dump(c, f, ensure_ascii=False)
                    except Exception as e:   # noqa: BLE001
                        erori.append(f"{an}/{nr}: {str(e)[:100]}")
                        c = None
                if c:
                    x.update({k: c[k] for k in ("perioade", "pierderi_lei", "pe_scurt") if c.get(k)})
        H.append(x)
    # seria prețurilor: pentru fiecare perioadă, ultima hotărâre care a stabilit-o (modificările și prelungirile o înlocuiesc)
    serie = {}
    for x in sorted(H, key=lambda h: (h["data"] or "", h["an"], h["nr"])):
        for p in (x.get("perioade") or []) if x["fel"] == "tarife" else []:
            serie[p["de_la"]] = dict(p, hcl={"an": x["an"], "nr": x["nr"]})
    # prețurile verificate de echipă (surse/termoficare/preturi.json) au prioritate; cele citite automat rămân în „preturi_automat”
    verif = []
    try:
        with open(VERIFICATE, encoding="utf-8") as f:
            verif = json.load(f).get("preturi") or []
    except (OSError, ValueError):
        pass
    auto = [dict(serie[k], verificat=False) for k in sorted(serie)]
    if verif:
        ultima = max(p["de_la"] for p in verif)
        preturi = [dict(p, verificat=True) for p in verif] + [p for p in auto if p["de_la"] > ultima]
    else:
        preturi = auto
    rez = {"hotarari": H, "preturi": sorted(preturi, key=lambda p: p["de_la"]), "preturi_automat": auto}
    with open(os.path.join(data_dir, "termoficare.json"), "w", encoding="utf-8") as f:
        json.dump(rez, f, ensure_ascii=False, separators=(",", ":"))
    return {"hotarari": len(H), "cu_preturi": sum(1 for x in H if x.get("perioade")), "perioade": len(serie), "ai_acum": noi, "erori": erori}
