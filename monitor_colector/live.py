"""Transcrierea unei ședințe transmise în direct, aproape în timp real (strict intern).

Cât timp transmisiunea e în curs, la câteva minute se ia bucata nouă de sunet, se transcrie (Whisper, model rapid) și se
adaugă în intern/transcrieri/live-<data>.json; intern/date/live.json spune panoului că există o transmisiune în curs.
E o transcriere de lucru: după ședință, înregistrarea se adaugă în panou ca de obicei și se transcrie complet, cu
modelul mare. Voturile și citatele se verifică pe înregistrare.

  python -m monitor_colector.live <url> <AAAA-LL-ZZ>
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime

from .video import TRANSCRIERI, audio

PAS = int(os.environ.get("MC_LIVE_PAS", "300"))          # cel mult atâtea secunde de sunet pe bucată
MINIM = int(os.environ.get("MC_LIVE_MINIM", "75"))       # nu luăm bucăți mai scurte (în afară de ultima)
LIMITA = float(os.environ.get("MC_LIVE_ORE", "5.4")) * 3600
PROMPT = "Ședința Consiliului Local al Municipiului Rădăuți. Proiect de hotărâre, consilier local, primar, viceprimar, vot."


def durata(url):
    r = subprocess.run(["yt-dlp", "--skip-download", "--print", "%(duration)s|%(title)s", url], capture_output=True, text=True, timeout=120)
    try:
        d, _, t = r.stdout.strip().splitlines()[0].partition("|")
        return float(d), t[:200]
    except (IndexError, ValueError):
        return None, None


def bucata(url, a, b, fisier="live-bucata"):
    for f in os.listdir("."):
        if f.startswith(fisier + "."):
            os.remove(f)
    subprocess.run(["yt-dlp", "-q", "-f", "bestaudio/best", "--download-sections", f"*{int(a)}-{int(b)}", "--force-overwrites", "-o", fisier + ".%(ext)s", url],
                   capture_output=True, text=True, timeout=600)
    f = next((x for x in os.listdir(".") if x.startswith(fisier + ".")), None)
    return f


def ruleaza(url, zi, intern, model_nume=None):
    from faster_whisper import WhisperModel
    model = None
    for nume in ([model_nume] if model_nume else []) + ["large-v3-turbo", "medium"]:
        try:
            model = WhisperModel(nume, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
            break
        except Exception as e:   # noqa: BLE001
            print("modelul", nume, "nu s-a încărcat:", str(e)[:120], flush=True)
    cid, segmente, off, start, titlu = f"live-{zi}", [], 0.0, time.time(), None
    ultima, neschimbat_din, erori = None, time.time(), 0

    def scrie(in_curs):
        acum = datetime.now().isoformat(timespec="seconds")
        intern.scrie(f"{TRANSCRIERI}/{cid}.json", {"data": zi, "url": url, "titlu": titlu, "live": in_curs, "actualizat": acum, "pana_la": round(off), "segmente": segmente})
        intern.scrie("intern/date/live.json", {"id": cid, "data": zi, "url": url, "titlu": titlu, "in_curs": in_curs, "actualizat": acum, "pana_la": round(off)})

    while time.time() - start < LIMITA:
        d, t = durata(url)
        if d is None:
            erori += 1
            if erori >= 6:
                break
            time.sleep(40)
            continue
        erori, titlu = 0, t or titlu
        if ultima is None or d > ultima + 1:
            ultima, neschimbat_din = d, time.time()
        terminat = time.time() - neschimbat_din > 420   # durata nu mai crește de 7 minute: transmisiunea s-a încheiat
        disponibil = d - 8 - off
        if disponibil < (5 if terminat else MINIM):
            if terminat:
                break
            time.sleep(30)
            continue
        b = off + min(disponibil, PAS)
        f = bucata(url, off, b)
        if not f:
            print("bucata", int(off), "-", int(b), "nu s-a putut lua", flush=True)
            time.sleep(40)
            continue
        try:
            segs, _ = model.transcribe(audio(f), language="ro", beam_size=3, vad_filter=True, condition_on_previous_text=False, initial_prompt=PROMPT)
            noi = [[round(s.start + off, 1), round(s.end + off, 1), s.text.strip()] for s in segs]
        except Exception as e:   # noqa: BLE001
            print("transcrierea bucății a eșuat:", str(e)[:200], flush=True)
            noi = []
        segmente += noi
        off = b
        scrie(True)
        print(f"până la {int(off)} s din {int(d)} s; {len(noi)} fragmente noi; întârziere {int(d - off)} s", flush=True)
    scrie(False)
    return {"id": cid, "secunde": round(off), "fragmente": len(segmente)}


def main(argv=None):
    a = argv or sys.argv[1:]
    from .intern_ftp import Intern

    class Scriitor:   # o conexiune nouă la fiecare scriere: între bucăți trec minute, iar conexiunea FTP ar expira
        def scrie(self, p, d):
            for _ in range(3):
                try:
                    with Intern() as I:
                        I.scrie(p, d)
                    return
                except Exception as e:   # noqa: BLE001
                    print("scrierea în zona internă a eșuat, reîncerc:", str(e)[:120], flush=True)
                    time.sleep(10)

    print(json.dumps(ruleaza(a[0], a[1], Scriitor(), os.environ.get("MC_LIVE_MODEL") or None), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
