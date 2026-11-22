"""Rezumatul unei ședințe a consiliului local, scris de un model AI din transcrierea înregistrării, ordinea de zi,
proiectele de hotărâre, hotărârile adoptate și procesul-verbal (când există).

Rezumatul e o ciornă: apare doar în zona internă, unde cineva din echipă îl citește, îl corectează și îl aprobă.
Abia atunci se publică (intern/api.php). Modelul are reguli stricte: atribuie o afirmație unei persoane doar
când transcrierea o numește explicit, nu evaluează și nu adaugă nimic din afara surselor primite.
"""
import json
import os
import re
from datetime import date, timedelta

import requests

from .parse import clean_title, norm

MODEL = os.environ.get("MC_MODEL_REZUMAT", "claude-sonnet-5-5")
API = "https://api.anthropic.com/v1/messages"


def hms(s):
    s = int(s or 0)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


def transcriere_text(segmente, bloc=25):
    """Segmentele Whisper strânse în rânduri de ~25 de secunde: „[0:12:30] text”."""
    linii, cur, t0 = [], [], None
    for s in segmente:
        start, text = s[0], s[2].strip()
        if not text:
            continue
        if t0 is None:
            t0 = start
        cur.append(text)
        if start - t0 >= bloc:
            linii.append(f"[{hms(t0)}] " + " ".join(cur))
            cur, t0 = [], None
    if cur:
        linii.append(f"[{hms(t0)}] " + " ".join(cur))
    return "\n".join(linii)


def _text(db, wp_id, maxim=None):
    parts = []
    for r in db.execute("SELECT text_path FROM documents WHERE wp_id=? AND text_path IS NOT NULL ORDER BY rowid", (wp_id,)):
        try:
            with open(r["text_path"], encoding="utf-8") as f:
                parts.append(f.read())
        except OSError:
            pass
    t = re.sub(r"[ \t]+", " ", "\n".join(parts))
    return t[:maxim] if maxim else t


def context(db, zi):
    """Tot ce știm despre ședința din ziua `zi` (sau la o zi-două distanță): convocarea și ordinea de zi,
    proiectele, hotărârile adoptate, procesul-verbal."""
    from . import cetateni
    d = date.fromisoformat(zi)
    zile = [(d + timedelta(days=k)).isoformat() for k in (0, -1, 1, -2, 2)]
    conv = cetateni.convocari(db, date(2000, 1, 1))
    c = next((x for z in zile for x in conv if x["data"] == z), None)
    data_sed = c["data"] if c else zi
    hcl = [{"an": r["year"], "nr": r["number"], "titlu": clean_title(r["title"] or "")}
           for r in db.execute("SELECT year, number, title FROM hcl WHERE adoption_date=? ORDER BY number", (data_sed,))]
    pv = db.execute("SELECT wp_id, title FROM pv WHERE session_date=?", (data_sed,)).fetchone()
    proiecte = []
    if c:
        toate = cetateni.consultari(db, d, [], zile=200)
        for p in c["ordinea_de_zi"]:
            pr = next((x for x in toate if x["nr"] and x["nr"] in norm(p["text"])), None)
            if pr:
                r = db.execute("SELECT wp_id FROM posts WHERE link=?", (pr["pagina"],)).fetchone()
                proiecte.append({"punct": p["nr"], "obiect": pr["obiect"], "text": _text(db, r["wp_id"], 2500) if r else ""})
    return {"data": data_sed, "convocare": c, "hcl": hcl, "pv": _text(db, pv["wp_id"], 30000) if pv else None, "proiecte": proiecte}


INSTRUCTIUNI = """Ești redactorul platformei civice „Monitor local” din Rădăuți. Scrii, în limba română, rezumatul unei ședințe a
Consiliului Local al Municipiului Rădăuți, pentru cetățeni: clar, neutru, fără jargon inutil.

Reguli obligatorii:
1. Folosește DOAR informațiile din sursele primite (transcrierea înregistrării, ordinea de zi, proiectele, hotărârile, procesul-verbal).
   Nu adăuga context din afara lor și nu face evaluări, aprecieri sau speculații despre intenții.
2. Transcrierea e automată (Whisper) și are greșeli: nume stâlcite, cuvinte auzite greșit, fără indicarea vorbitorilor.
   Atribuie o afirmație unei persoane NUMAI când transcrierea arată explicit cine vorbește (ex. „Dau cuvântul domnului consilier X”,
   „Sunt X și...”) sau când procesul-verbal o confirmă. Altfel scrie „un consilier”, „un participant”, „reprezentantul aparatului de
   specialitate”. Nu ghici niciodată un nume. Corectează un nume stâlcit doar dacă apare scris corect în procesul-verbal sau în sursele scrise.
3. Rezultatul votului: dacă procesul-verbal sau lista hotărârilor îl dau, folosește-l și scrie sursa „proces-verbal”. Dacă îl știi doar
   din înregistrare, scrie sursa „înregistrare”. Dacă nu se înțelege, scrie null.
4. Pentru fiecare punct, dă minutul (formatul H:MM:SS din transcriere) de la care începe discutarea lui, și minutul fiecărei intervenții citate.
5. Nu reproduce injurii, date personale ale cetățenilor (adrese, CNP, sănătate) sau atacuri la persoană; rezumă neutru („a criticat ...”).
6. Dacă ceva din înregistrare nu se potrivește cu sursele scrise, notează la „observatii”.

Răspunde DOAR cu un obiect JSON valid, fără alt text, cu forma:
{
  "rezumat": "4-6 propoziții despre ședință: ce s-a decis important, ce a generat dezbatere",
  "puncte": [
    {"nr": 1, "titlu": "titlul scurt al punctului de pe ordinea de zi",
     "minut": "H:MM:SS sau null",
     "pe_scurt": "1-2 propoziții: ce propunea proiectul",
     "discutie": "ce s-a discutat (sau „Fără discuții.”)",
     "interventii": [{"cine": "nume sau descriere neutră", "minut": "H:MM:SS", "ce": "ideea principală, 1-2 propoziții"}],
     "vot": {"rezultat": "adoptat / respins / amânat / retras / null", "detalii": "ex. 15 pentru, 2 împotrivă, 1 abținere", "sursa": "proces-verbal / înregistrare / null"},
     "hcl": "nr/an sau null"}
  ],
  "alte_subiecte": [{"minut": "H:MM:SS", "ce": "subiecte din afara ordinii de zi (întrebări, interpelări, informări)"}],
  "observatii": ["nepotriviri între surse, porțiuni neclare din înregistrare"]
}"""


def mesaj(ctx, transcriere, video):
    c = ctx["convocare"] or {}
    od = "\n".join(f"{p['nr']}. {p['text']}" for p in c.get("ordinea_de_zi") or []) or "(ordinea de zi nu a putut fi citită din dispoziția de convocare)"
    pr = "\n\n".join(f"[Punctul {p['punct']}] {p['obiect']}\n{p['text']}" for p in ctx["proiecte"]) or "(fără textele proiectelor)"
    hcl = "\n".join(f"HCL {h['nr']}/{h['an']}: {h['titlu']}" for h in ctx["hcl"]) or "(hotărârile ședinței nu sunt încă publicate)"
    return (f"ȘEDINȚA din {ctx['data']} ({c.get('tip') or 'tip necunoscut'}), înregistrarea: {video.get('titlu') or ''} {video.get('url') or ''}\n\n"
            f"=== ORDINEA DE ZI (din dispoziția de convocare, citită automat) ===\n{od}\n\n"
            f"=== PROIECTE DE HOTĂRÂRE (fragmente) ===\n{pr}\n\n"
            f"=== HOTĂRÂRI ADOPTATE ÎN ACEASTĂ ZI ===\n{hcl}\n\n"
            f"=== PROCES-VERBAL (citit automat) ===\n{ctx['pv'] or '(procesul-verbal nu e încă publicat)'}\n\n"
            f"=== TRANSCRIEREA AUTOMATĂ A ÎNREGISTRĂRII ===\n{transcriere}")


def _json(text):
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    i, j = t.find("{"), t.rfind("}")
    return json.loads(t[i:j + 1])


def genereaza(ctx, segmente, video, cheie=None, model=MODEL, sesiune=None):
    cheie = cheie or os.environ.get("ANTHROPIC_API_KEY")
    if not cheie:
        raise RuntimeError("lipsește ANTHROPIC_API_KEY")
    s = sesiune or requests.Session()
    r = s.post(API, timeout=600, headers={"x-api-key": cheie, "anthropic-version": "2023-06-01", "content-type": "application/json"},
               json={"model": model, "max_tokens": 12000, "system": INSTRUCTIUNI,
                     "messages": [{"role": "user", "content": mesaj(ctx, transcriere_text(segmente), video)}]})
    if r.status_code != 200:
        raise RuntimeError(f"API {r.status_code}: {r.text[:300]}")
    d = r.json()
    text = "".join(b.get("text", "") for b in d.get("content", []) if b.get("type") == "text")
    try:
        rez = _json(text)
    except ValueError:
        # diagnostic pentru jurnal, fără conținut (jurnalele GitHub sunt publice)
        raise RuntimeError(f"răspuns necitibil: stop_reason={d.get('stop_reason')}, blocuri={[b.get('type') for b in d.get('content', [])]}, "
                           f"lungime={len(text)}, începe_cu_acoladă={text.lstrip()[:1] == '{'}, usage={d.get('usage')}, model={d.get('model')}")
    rez["_model"] = d.get("model", model)
    rez["_tokeni"] = d.get("usage")
    return rez
