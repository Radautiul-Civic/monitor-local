"""OCR în paralel pentru recuperarea documentelor vechi (rularea „Recuperare”).

1. `coada`     - scrie data/coada-ocr.json cu documentele scanate neprocesate și
                 calculează câte loturi (mașini) sunt necesare.
2. `ocr-lot`   - pe fiecare mașină: OCR pe lotul i din N, rezultate într-un folder
                 (câte un .txt per document + index.json cu URL-urile).
3. `importa`   - la final: textele din toate loturile intră în baza de date.
"""
import hashlib
import json
import logging
import math
import os
import time

from . import config, documents

log = logging.getLogger(__name__)

QUEUE = "coada-ocr.json"


def build_queue(store, data_dir=config.DATA_DIR, per_lot=150, max_lots=20):
    rows = store.documents_to_ocr()
    items = [{"url": r["url"], "local_path": r["local_path"], "pages": r["pages"]} for r in rows]
    lots = max(1, min(max_lots, math.ceil(len(items) / per_lot))) if items else 0
    os.makedirs(data_dir, exist_ok=True)
    with open(os.path.join(data_dir, QUEUE), "w", encoding="utf-8") as f:
        json.dump({"documente": items, "loturi": lots}, f, ensure_ascii=False)
    return {"documente": len(items), "pagini_cunoscute": sum(i["pages"] or 0 for i in items), "loturi": lots}


def _key(url):
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


def ocr_lot(lot, din, out_dir, data_dir=config.DATA_DIR, minutes=None, lang=config.OCR_LANG):
    """Documentele lot, lot+din, lot+2*din... (împărțire echilibrată, PV-urile sunt primele în coadă)."""
    with open(os.path.join(data_dir, QUEUE), encoding="utf-8") as f:
        items = json.load(f)["documente"][lot::din]
    os.makedirs(out_dir, exist_ok=True)
    deadline = time.time() + minutes * 60 if minutes else None
    index, stats = {}, {"lot": lot, "din": din, "de_facut": len(items), "ocr": 0, "pagini": 0,
                        "erori": 0, "oprit_la_buget": False}
    for it in items:
        if deadline and time.time() > deadline:
            stats["oprit_la_buget"] = True
            break
        if not (it["local_path"] and os.path.exists(it["local_path"])):
            stats["erori"] += 1
            continue
        try:
            text = documents.ocr_pdf(it["local_path"], lang)
        except Exception as e:
            log.warning("eșec OCR %s: %s", it["url"], e)
            stats["erori"] += 1
            continue
        k = _key(it["url"])
        with open(os.path.join(out_dir, k + ".txt"), "w", encoding="utf-8") as f:
            f.write(text)
        index[k] = it["url"]
        stats["ocr"] += 1
        stats["pagini"] += text.count("\f") + 1
        log.info("lot %d: %d/%d %s", lot, stats["ocr"], len(items), it["url"])
        with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8") as f:
            json.dump(index, f)
    return stats


def importa(store, dirs):
    """Copiază textele din loturi lângă PDF-uri și le marchează în baza de date."""
    stats = {"importate": 0, "necunoscute": 0}
    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    for d in dirs:
        p = os.path.join(d, "index.json")
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as f:
            index = json.load(f)
        for k, url in index.items():
            row = store.db.execute("SELECT local_path FROM documents WHERE url=?", (url,)).fetchone()
            src = os.path.join(d, k + ".txt")
            if not row or not row["local_path"] or not os.path.exists(src):
                stats["necunoscute"] += 1
                continue
            tp = documents.text_path_for(row["local_path"])
            os.makedirs(os.path.dirname(tp), exist_ok=True)
            with open(src, encoding="utf-8") as fi, open(tp, "w", encoding="utf-8") as fo:
                fo.write(fi.read())
            store.update_document(url, text_path=tp, ocr_at=now)
            stats["importate"] += 1
    store.db.commit()
    return stats
