"""Descărcarea documentelor, detectarea stratului de text și OCR.

OCR-ul folosește pdftoppm (poppler-utils) + tesseract cu limba română (tesseract-ocr-ron).
"""
import hashlib
import logging
import os
import shutil
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse, unquote

from pypdf import PdfReader

from . import config

log = logging.getLogger(__name__)

MIN_CHARS_PER_PAGE = 80   # sub acest prag considerăm pagina scanată


def local_path_for(url, data_dir=config.DATA_DIR):
    p = urlparse(url)
    path = unquote(p.path).lstrip("/")
    return os.path.join(data_dir, "docs", p.netloc, path)


def download(session, url, data_dir=config.DATA_DIR, timeout=config.TIMEOUT):
    """Descarcă un document; întoarce dict cu sha256, size, last_modified, local_path."""
    dest = local_path_for(url, data_dir)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    h = hashlib.sha256()
    size = 0
    with session.get(url, timeout=timeout, stream=True) as r:
        r.raise_for_status()
        tmp = dest + ".part"
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(65536):
                f.write(chunk)
                h.update(chunk)
                size += len(chunk)
        os.replace(tmp, dest)
        lm = r.headers.get("Last-Modified")
    return {"sha256": h.hexdigest(), "size": size, "last_modified": lm, "local_path": dest}


def text_layer(pdf_path):
    """(pagini, are_text). Un PDF fără text extractibil trebuie trecut prin OCR."""
    try:
        reader = PdfReader(pdf_path)
        pages = len(reader.pages)
        sample = reader.pages[: min(pages, 5)]
        chars = sum(len((p.extract_text() or "").strip()) for p in sample)
        return pages, int(pages > 0 and chars / max(len(sample), 1) >= MIN_CHARS_PER_PAGE)
    except Exception as e:  # PDF corupt sau protejat
        log.warning("nu pot citi %s: %s", pdf_path, e)
        return None, None


def extract_text(pdf_path):
    reader = PdfReader(pdf_path)
    return "\n\f".join((p.extract_text() or "") for p in reader.pages)


def ocr_available(lang=config.OCR_LANG):
    if not (shutil.which("pdftoppm") and shutil.which("tesseract")):
        return False
    out = subprocess.run(["tesseract", "--list-langs"], capture_output=True, text=True)
    return lang in (out.stdout + out.stderr).split()


def ocr_pdf(pdf_path, lang=config.OCR_LANG, dpi=300):
    """OCR pagină cu pagină; întoarce textul, paginile separate prin form feed."""
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", str(dpi), "-png", pdf_path, os.path.join(tmp, "p")],
                       check=True, capture_output=True)
        pages = sorted(f for f in os.listdir(tmp) if f.endswith(".png"))
        # Un proces tesseract pe nucleu, fiecare cu un singur fir (OMP_THREAD_LIMIT=1):
        # mai rapid decât un singur tesseract multi-fir.
        env = dict(os.environ, OMP_THREAD_LIMIT="1")

        def one(png):
            return subprocess.run(["tesseract", os.path.join(tmp, png), "stdout", "-l", lang, "--psm", "1"],
                                  check=True, capture_output=True, text=True, env=env).stdout

        with ThreadPoolExecutor(max_workers=max(1, os.cpu_count() or 1)) as ex:
            texts = list(ex.map(one, pages))
    return "\n\f".join(texts)


def text_path_for(local_path):
    return local_path + ".txt"


def process_downloads(store, session, data_dir=config.DATA_DIR, limit=None, delay=config.REQUEST_DELAY):
    """Descarcă documentele noi și le clasifică (text / scanat). Întoarce statistici."""
    stats = {"descarcate": 0, "cu_text": 0, "scanate": 0, "erori": 0}
    for row in store.documents_to_fetch(limit):
        url = row["url"]
        try:
            info = download(session, url, data_dir)
        except Exception as e:
            log.warning("eșec descărcare %s: %s", url, e)
            stats["erori"] += 1
            continue
        fields = dict(info, fetched_at=time.strftime("%Y-%m-%dT%H:%M:%S"))
        if info["local_path"].lower().endswith(".pdf"):
            pages, has_text = text_layer(info["local_path"])
            fields.update(pages=pages, text_layer=has_text)
            if has_text:
                tp = text_path_for(info["local_path"])
                with open(tp, "w", encoding="utf-8") as f:
                    f.write(extract_text(info["local_path"]))
                fields["text_path"] = tp
                stats["cu_text"] += 1
            elif has_text == 0:
                stats["scanate"] += 1
        store.update_document(url, **fields)
        store.db.commit()
        stats["descarcate"] += 1
        time.sleep(delay)
    return stats


def process_ocr(store, lang=config.OCR_LANG, limit=None, minutes=None):
    """OCR pe documentele scanate. `minutes` = buget de timp: după expirare nu mai
    începe documente noi, iar ce s-a terminat rămâne salvat."""
    stats = {"ocr": 0, "pagini": 0, "erori": 0, "oprit_la_buget": False}
    deadline = time.time() + minutes * 60 if minutes else None
    if not ocr_available(lang):
        raise RuntimeError(f"Lipsește pdftoppm, tesseract sau limba „{lang}” (apt install tesseract-ocr-{lang})")
    for row in store.documents_to_ocr(limit):
        if deadline and time.time() > deadline:
            stats["oprit_la_buget"] = True
            break
        try:
            text = ocr_pdf(row["local_path"], lang)
        except Exception as e:
            log.warning("eșec OCR %s: %s", row["url"], e)
            stats["erori"] += 1
            continue
        tp = text_path_for(row["local_path"])
        with open(tp, "w", encoding="utf-8") as f:
            f.write(text)
        store.update_document(row["url"], text_path=tp, ocr_at=time.strftime("%Y-%m-%dT%H:%M:%S"))
        store.db.commit()
        stats["ocr"] += 1
        stats["pagini"] += text.count("\f") + 1
        log.info("OCR %s (%d/%s)", row["url"], stats["ocr"], limit or "-")
    return stats
