"""Linia de comandă: python -m monitor_colector <comandă>

  categorii            listează categoriile site-ului (id, slug, număr de postări)
  colecteaza [--tot]   postările din API (incremental; --tot = de la zero)
  arhiva [ani...]      HCL 2013-2024 de pe site-ul vechi
  descarca [--max N]   descarcă documentele noi și detectează PDF-urile scanate
  ocr [--max N] [--minute M]  OCR pe PDF-urile scanate (tesseract, limba română)
  word                 textele extrase ca documente Word -> data/texte/<sursa>/*.docx
  indicatori           indicatorii și listele -> data/indicatori.json, .md, data/liste.json
  tot                  colecteaza + descarca + ocr + indicatori (pentru cron)
"""
import argparse
import json
import logging
import os
import sys

from . import collect, config, documents, indicators, liste
from .store import Store
from .wp import WPClient


def main(argv=None):
    ap = argparse.ArgumentParser(prog="monitor_colector", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("comanda", choices=["categorii", "colecteaza", "arhiva", "descarca", "ocr", "word", "indicatori", "tot"])
    ap.add_argument("ani", nargs="*", type=int)
    ap.add_argument("--tot", action="store_true", help="colectare completă, nu incrementală")
    ap.add_argument("--max", type=int, default=None, help="limită de documente")
    ap.add_argument("--minute", type=int, default=None, help="buget de timp pentru OCR")
    ap.add_argument("--surse", default=None, help="ex. hcl,pv (implicit toate din config)")
    ap.add_argument("-v", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if a.v else logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if a.comanda == "categorii":
        for c in collect.discover():
            print(f"{c['id']:>5}  {c.get('count', 0):>5}  {c['slug']}")
        return 0

    store = Store(config.DB_PATH)
    t0 = collect.started()
    stats = {}
    try:
        if a.comanda in ("colecteaza", "tot"):
            stats["api"] = collect.collect_api(store, sources=a.surse.split(",") if a.surse else None, full=a.tot)
        if a.comanda == "arhiva":
            stats["arhiva"] = collect.collect_archive(store, years=set(a.ani) or None)
        if a.comanda in ("descarca", "tot"):
            stats["descarca"] = documents.process_downloads(store, WPClient().s, limit=a.max)
        if a.comanda == "ocr" or (a.comanda == "tot" and documents.ocr_available()):
            stats["ocr"] = documents.process_ocr(store, limit=a.max, minutes=a.minute)
        if a.comanda == "word":
            from . import word
            stats["word"] = word.export_all(store)
        if a.comanda in ("indicatori", "tot"):
            ind = indicators.compute(store)
            os.makedirs(config.DATA_DIR, exist_ok=True)
            with open(os.path.join(config.DATA_DIR, "indicatori.json"), "w", encoding="utf-8") as f:
                json.dump(ind, f, ensure_ascii=False, indent=2)
            with open(os.path.join(config.DATA_DIR, "indicatori.md"), "w", encoding="utf-8") as f:
                f.write(indicators.to_markdown(ind))
            with open(os.path.join(config.DATA_DIR, "liste.json"), "w", encoding="utf-8") as f:
                json.dump(liste.export(store), f, ensure_ascii=False, separators=(",", ":"))
            stats["indicatori"] = "data/indicatori.json, data/liste.json"
        store.log_run(t0, a.comanda, stats)
    finally:
        store.close()
    print(json.dumps(stats, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
