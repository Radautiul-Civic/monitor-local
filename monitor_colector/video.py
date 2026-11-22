"""Înregistrările ședințelor: de la linkul adăugat în panoul intern la transcriere și la ciorna rezumatului.

Pașii (fluxul GitHub „Transcriere ședințe”):
  python -m monitor_colector.video plan               alege următoarea înregistrare netranscrisă (din intern/date/video.json)
  python -m monitor_colector.video transcrie F.flac   transcrie o bucată de audio cu faster-whisper (română)
  python -m monitor_colector.video finalizeaza ...    unește bucățile, urcă transcrierea, scrie ciorna rezumatului

Înregistrările sunt ale celor care le-au publicat (ex. pagina „Jurnalist Live”): nu le copiem, doar le transcriem pentru
rezumat și trimitem la videoclipul original.
"""
import argparse
import glob
import json
import os
import re
import sys
from datetime import datetime

from . import config

VIDEO = "intern/date/video.json"          # [{data, url, adaugat_la}] - din panou (api.php)
CIORNE = "intern/date/rezumate.json"      # {id: {...ciorna...}}
TRANSCRIERI = "intern/transcrieri"        # <id>.json
BUCATA = 1200                              # secunde pe bucată (20 de minute)


def ident(v):
    """ID-ul unei înregistrări: data ședinței + ID-ul videoclipului (sau o amprentă a linkului)."""
    m = re.search(r"/videos/(\d+)|[?&]v=([\w-]{6,})|youtu\.be/([\w-]{6,})|fb\.watch/(\w+)", v.get("url") or "")
    vid = next((g for g in m.groups() if g), None) if m else None
    if not vid:
        import zlib
        vid = str(zlib.crc32((v.get("url") or "").encode("utf-8")))
    return f"{v['data']}-{vid}"


def plan(intern, fortat=None):
    """Prima înregistrare din listă fără transcriere (sau cea cerută explicit)."""
    lista = intern.json(VIDEO, []) or []
    if fortat:
        lista = [fortat] + lista
    gata = {x[:-5] for x in intern.lista(TRANSCRIERI) if x.endswith(".json")}
    for v in sorted(lista, key=lambda x: x.get("data") or ""):
        if v.get("data") and v.get("url") and ident(v) not in gata:
            return dict(v, id=ident(v))
    return None


def transcrie(fisier, model="large-v3", prag=None):
    """Segmentele [start, sfârșit, text] dintr-o bucată de audio (timpii relativi la începutul bucății)."""
    from faster_whisper import WhisperModel
    m = WhisperModel(model, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
    segs, info = m.transcribe(fisier, language="ro", beam_size=5, vad_filter=True, condition_on_previous_text=False,
                              initial_prompt="Ședința Consiliului Local al Municipiului Rădăuți. Proiect de hotărâre, consilier local, primar, viceprimar, vot.")
    return [[round(s.start, 1), round(s.end, 1), s.text.strip()] for s in segs]


def uneste(fisiere):
    """Bucățile transcrise (parte000.json, parte001.json, ...) într-o singură listă, cu timpii de la începutul ședinței."""
    out = []
    for f in sorted(fisiere):
        k = int(re.search(r"(\d+)\.json$", f).group(1))
        with open(f, encoding="utf-8") as fh:
            for a, b, t in json.load(fh):
                out.append([round(a + k * BUCATA, 1), round(b + k * BUCATA, 1), t])
    return out


APROBARI = "intern/date/aprobari.json"   # {id: {stare: aprobat|respins|refa, rezumat, la}} - scris de api.php


def de_refacut(ciorna, decizie, are_pv_acum):
    """Ciorna trebuie scrisă din nou? Da: dacă nu are rezumat, dacă echipa a cerut din panou („refa”) după ultima
    generare, sau dacă între timp a apărut procesul-verbal și nimeni nu a decis încă."""
    if not ciorna.get("rezumat"):
        return True
    if decizie and decizie.get("stare") == "refa" and (decizie.get("la") or "") > (ciorna.get("generat_la") or ciorna.get("creat_la") or ""):
        return True
    if not decizie and not ciorna.get("are_pv") and are_pv_acum:
        return True
    return False


def refa(intern, maxim=3):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return {"refacute": [], "nota": "lipsește ANTHROPIC_API_KEY"}
    from .store import Store
    from . import rezumat
    st = Store(config.DB_PATH)
    ciorne = intern.json(CIORNE, {}) or {}
    dec = intern.json(APROBARI, {}) or {}
    facute = []
    for cid, c in sorted(ciorne.items()):
        if len(facute) >= maxim:
            break
        d = dec.get(cid)
        if d and d.get("stare") in ("aprobat", "respins"):
            continue
        ctx = rezumat.context(st.db, c["data"])
        if not de_refacut(c, d, bool(ctx["pv"])):
            continue
        tr = intern.json(f"{TRANSCRIERI}/{cid}.json")
        if not tr:
            continue
        try:
            c["rezumat"] = rezumat.genereaza(ctx, tr["segmente"], c)
            c.pop("eroare", None)
            c["data_sedinta"], c["are_pv"] = ctx["data"], bool(ctx["pv"])
            c["ordinea_de_zi"] = [p["text"] for p in (ctx["convocare"] or {}).get("ordinea_de_zi") or []]
            c["generat_la"] = datetime.now().isoformat(timespec="seconds")
        except Exception as e:
            c["eroare"] = str(e)[:500]
        facute.append(cid)
    if facute:
        intern.scrie(CIORNE, ciorne)
    return {"refacute": facute}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="monitor_colector.video")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--url")
    p.add_argument("--data")
    t = sub.add_parser("transcrie")
    t.add_argument("fisier")
    t.add_argument("--model", default=os.environ.get("MC_WHISPER", "large-v3"))
    f = sub.add_parser("finalizeaza")
    f.add_argument("--id", required=True)
    f.add_argument("--url", required=True)
    f.add_argument("--data", required=True)
    f.add_argument("--titlu", default="")
    f.add_argument("--durata", default="")
    f.add_argument("--bucati", default="bucati")
    sub.add_parser("refa", help="reface rezumatele lipsă, cerute din panou sau fără procesul-verbal care între timp a apărut")
    a = ap.parse_args(argv)

    if a.cmd == "transcrie":
        segs = transcrie(a.fisier, a.model)
        out = re.sub(r"\.\w+$", ".json", a.fisier)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(segs, fh, ensure_ascii=False)
        print(f"{len(segs)} segmente -> {out}")
        return 0

    from .intern_ftp import Intern
    with Intern() as I:
        if a.cmd == "plan":
            v = plan(I, {"data": a.data, "url": a.url} if a.url and a.data else None)
            gh = os.environ.get("GITHUB_OUTPUT")
            print(json.dumps(v, ensure_ascii=False))
            if gh:
                with open(gh, "a") as fh:
                    fh.write(f"gasit={'da' if v else 'nu'}\n")
                    if v:
                        for k in ("id", "url", "data"):
                            fh.write(f"{k}={v[k]}\n")
            return 0

        if a.cmd == "refa":
            print(json.dumps(refa(I), ensure_ascii=False))
            return 0

        # finalizeaza: transcrierea întreagă, apoi ciorna rezumatului
        segs = uneste(glob.glob(os.path.join(a.bucati, "**", "parte*.json"), recursive=True))
        try:
            durata = round(float(a.durata))
        except ValueError:
            durata = None
        video = {"id": a.id, "url": a.url, "data": a.data, "titlu": a.titlu, "durata": durata}
        tr = dict(video, segmente=segs, transcris_la=datetime.now().isoformat(timespec="seconds"),
                  model=os.environ.get("MC_WHISPER", "large-v3"))
        I.scrie(f"{TRANSCRIERI}/{a.id}.json", tr)
        print(f"transcriere: {len(segs)} segmente urcate")
        ciorne = I.json(CIORNE, {}) or {}
        intrare = dict(video, transcriere=f"transcrieri/{a.id}.json", segmente=len(segs), creat_la=tr["transcris_la"],
                       generat_la=tr["transcris_la"])
        try:
            from .store import Store
            from . import rezumat
            st = Store(config.DB_PATH)
            ctx = rezumat.context(st.db, a.data)
            intrare["rezumat"] = rezumat.genereaza(ctx, segs, video)
            intrare["data_sedinta"] = ctx["data"]
            intrare["are_pv"] = bool(ctx["pv"])
            intrare["ordinea_de_zi"] = [p["text"] for p in (ctx["convocare"] or {}).get("ordinea_de_zi") or []]
        except Exception as e:   # transcrierea rămâne; rezumatul se poate reface din panou sau la rularea următoare
            intrare["eroare"] = str(e)[:500]
            print(f"rezumat: {e}", file=sys.stderr)
        ciorne[a.id] = intrare
        I.scrie(CIORNE, ciorne)
        print("ciorna urcată:", "cu rezumat" if "rezumat" in intrare else "fără rezumat")
    return 0


if __name__ == "__main__":
    sys.exit(main())
