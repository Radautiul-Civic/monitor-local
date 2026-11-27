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


SEG = int(os.environ.get("MC_LIVE_SEG", "180"))   # secunde pe bucată


def porneste_flux(url, folder="live-seg"):
    """ffmpeg citește direct manifestul transmisiunii (DASH) și îl urmărește cât timp e în direct, tăind sunetul în bucăți de SEG
    secunde (flac, mono, 16 kHz). Descărcarea obișnuită nu merge la o transmisiune în curs: manifestul arată doar ultimele
    secunde, iar descărcarea „de la minutul X” reia de fiecare dată de la început."""
    os.makedirs(folder, exist_ok=True)
    for f in os.listdir(folder):
        os.remove(os.path.join(folder, f))
    r = subprocess.run(["yt-dlp", "--skip-download", "-f", "bestaudio/best", "--print", "%(manifest_url)s", url], capture_output=True, text=True, timeout=120)
    mpd = (r.stdout.strip().splitlines() or [""])[0]
    if not mpd.startswith("http"):
        raise RuntimeError("manifestul transmisiunii nu s-a putut citi: " + (r.stderr or r.stdout)[-200:])
    # timpii din flux pornesc de la minutul transmisiunii și sar înapoi: îi refacem de la zero, altfel tăierea în bucăți nu se face
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", mpd, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
           "-af", "aresample=async=1,asetpts=N/SR/TB", "-f", "segment", "-segment_time", str(SEG), "-reset_timestamps", "1",
           "-c:a", "pcm_s16le", f"{folder}/seg%05d.wav"]
    return subprocess.Popen(cmd), folder


def ruleaza(url, zi, intern, model_nume=None):
    from faster_whisper import WhisperModel
    model = None
    for nume in ([model_nume] if model_nume else []) + ["large-v3-turbo", "medium"]:
        try:
            model = WhisperModel(nume, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
            break
        except Exception as e:   # noqa: BLE001
            print("modelul", nume, "nu s-a încărcat:", str(e)[:120], flush=True)
    cid, segmente, facute, start = f"live-{zi}-{datetime.now().strftime('%H%M')}", [], 0, time.time()
    d0, titlu = durata(url)
    proc, folder = porneste_flux(url)
    baza = None   # de unde începe sunetul primit: de la începutul transmisiunii (0) sau din momentul pornirii (d0)

    def scrie(in_curs):
        acum = datetime.now().isoformat(timespec="seconds")
        pana = round((baza or 0) + facute * SEG)
        intern.scrie(f"{TRANSCRIERI}/{cid}.json", {"data": zi, "url": url, "titlu": titlu, "live": in_curs, "actualizat": acum, "pana_la": pana, "segmente": segmente})
        intern.scrie("intern/date/live.json", {"id": cid, "data": zi, "url": url, "titlu": titlu, "in_curs": in_curs, "actualizat": acum, "pana_la": pana})

    scrie(True)   # panoul arată imediat că a pornit
    while True:
        gata = proc.poll() is not None
        fisiere = sorted(f for f in os.listdir(folder) if f.endswith(".wav"))
        complete = fisiere if gata else fisiere[:-1]   # ultima bucată e încă în scriere cât timp descărcarea merge
        if facute < len(complete):
            f = os.path.join(folder, complete[facute])
            if baza is None:   # prima bucată venită mult mai repede decât durează: ffmpeg citește de la începutul transmisiunii
                baza = 0.0 if time.time() - start < 0.7 * SEG else float(d0 or 0)
                print("sunetul începe de la secunda", int(baza), "a transmisiunii", flush=True)
            off = baza + facute * SEG
            try:
                segs, _ = model.transcribe(audio(f), language="ro", beam_size=3, vad_filter=True, condition_on_previous_text=False, initial_prompt=PROMPT)
                noi = [[round(s.start + off, 1), round(s.end + off, 1), s.text.strip()] for s in segs]
            except Exception as e:   # noqa: BLE001
                print("transcrierea bucății a eșuat:", str(e)[:200], flush=True)
                noi = []
            segmente += noi
            facute += 1
            os.remove(f)
            scrie(True)
            print(f"bucata {facute}: până la {int(off + SEG)} s; {len(noi)} fragmente; {len(complete) - facute} bucăți în așteptare; au trecut {int(time.time() - start)} s", flush=True)
            continue
        if gata or time.time() - start > LIMITA:
            break
        time.sleep(10)
    if proc.poll() is None:
        proc.terminate()
    scrie(False)
    return {"id": cid, "de_la": baza, "secunde": facute * SEG, "fragmente": len(segmente), "iesire_descarcare": proc.poll()}


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
