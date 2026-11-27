"""Linia de comandă: python -m monitor_colector <comandă>

  categorii            listează categoriile site-ului (id, slug, număr de postări)
  colecteaza [--tot]   postările din API (incremental; --tot = de la zero)
  arhiva [ani...]      HCL 2013-2024 de pe site-ul vechi
  descarca [--max N]   descarcă documentele noi și detectează PDF-urile scanate
  ocr [--max N] [--minute M]  OCR pe PDF-urile scanate (tesseract, limba română)
  urbanism             tabelele din registrele CU/AC -> baza de date
  sicap [--tot]        achizițiile din SICAP ale instituțiilor din Rădăuți (--tot = din 2018) și câștigătorii licitațiilor
  geocodare [--minute M]  coordonatele adreselor din registrele de urbanism (OpenStreetMap), pentru hartă
  buget                execuția bugetară a municipiului și a instituțiilor din oraș (transparenta.eu)
  litigii [--tot]      dosarele autorităților din Rădăuți (municipiul și instituțiile din SICAP), din portalquery.just.ro (--tot = din 2010)
  word                 textele extrase ca documente Word -> data/texte/<sursa>/*.docx
  indicatori           indicatorii și listele -> data/indicatori.json, .md, data/liste.json
  coada                coada OCR pentru recuperare -> data/coada-ocr.json
  ocr-lot --lot I --din N --iesire DIR   OCR pe un lot (rulare paralelă)
  importa --foldere DIR...              textele din loturi intră în baza de date
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
    ap.add_argument("comanda", choices=["categorii", "colecteaza", "arhiva", "descarca", "ocr", "word", "urbanism", "geocodare", "sicap", "litigii", "buget", "indicatori", "tot", "coada", "ocr-lot", "importa"])
    ap.add_argument("ani", nargs="*", type=int)
    ap.add_argument("--tot", action="store_true", help="colectare completă, nu incrementală")
    ap.add_argument("--max", type=int, default=None, help="limită de documente")
    ap.add_argument("--minute", type=int, default=None, help="buget de timp pentru OCR")
    ap.add_argument("--lot", type=int, default=0, help="ocr-lot: numărul lotului (de la 0)")
    ap.add_argument("--din", type=int, default=1, help="ocr-lot: numărul total de loturi")
    ap.add_argument("--iesire", default="lot-ocr", help="ocr-lot: folderul rezultatelor")
    ap.add_argument("--foldere", nargs="*", default=[], help="importa: folderele loturilor")
    ap.add_argument("--surse", default=None, help="ex. hcl,pv (implicit toate din config)")
    ap.add_argument("-v", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if a.v else logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if a.comanda == "categorii":
        for c in collect.discover():
            print(f"{c['id']:>5}  {c.get('count', 0):>5}  {c['slug']}")
        return 0

    if a.comanda == "ocr-lot":   # nu scrie în baza de date (rulează pe mai multe mașini)
        from . import recuperare
        print(json.dumps(recuperare.ocr_lot(a.lot, a.din, a.iesire, minutes=a.minute), indent=2))
        return 0

    store = Store(config.DB_PATH)
    t0 = collect.started()
    stats = {}
    try:
        if a.comanda in ("colecteaza", "tot"):
            stats["api"] = collect.collect_api(store, sources=a.surse.split(",") if a.surse else None, full=a.tot)
            if not a.surse:
                try:   # anunțurile de angajare din arhiva site-ului vechi; o cădere a arhivei nu oprește colectarea
                    stats["api_arhiva"] = collect.collect_archive_api(store, full=a.tot)
                except Exception as e:
                    stats["api_arhiva"] = f"eroare: {e}"
                try:   # rapoartele primăriei și dispozițiile din arhivă (pagini cu liste de PDF-uri)
                    stats["pagini"] = collect.collect_pagini(store)
                except Exception as e:
                    stats["pagini"] = f"eroare: {e}"
        if a.comanda == "arhiva":
            stats["arhiva"] = collect.collect_archive(store, years=set(a.ani) or None)
            if not a.ani:
                stats["arhiva_liste"] = collect.collect_archive_lists(store)
        if a.comanda in ("descarca", "tot"):
            stats["descarca"] = documents.process_downloads(store, WPClient().s, limit=a.max)
        if a.comanda == "ocr" or (a.comanda == "tot" and documents.ocr_available()):
            stats["ocr"] = documents.process_ocr(store, limit=a.max, minutes=a.minute)
        if a.comanda in ("coada", "importa"):
            from . import recuperare
            if a.comanda == "coada":
                stats["coada"] = recuperare.build_queue(store)
                gh = os.environ.get("GITHUB_OUTPUT")
                if gh:   # matricea de loturi pentru GitHub Actions
                    with open(gh, "a") as f:
                        f.write(f"loturi={json.dumps(list(range(stats['coada']['loturi'])))}\n")
                        f.write(f"din={stats['coada']['loturi']}\n")
            else:
                stats["importa"] = recuperare.importa(store, a.foldere)
        if a.comanda in ("urbanism", "tot"):
            from . import urbanism
            stats["urbanism"] = urbanism.colecteaza(store, fortat=a.tot)
            os.makedirs(config.DATA_DIR, exist_ok=True)
            with open(os.path.join(config.DATA_DIR, "urbanism-registre.txt"), "w", encoding="utf-8") as f:
                f.write("\n".join(stats["urbanism"].pop("pe_registru", [])) + "\n")
        if a.comanda == "sicap":
            from . import sicap
            stats["sicap"] = sicap.colecteaza(store, tot=a.tot, cui_extra=config.SICAP_CUI_EXTRA,
                                              termeni_extra=config.SICAP_TERMENI_EXTRA)
            from . import curs
            stats["curs_bnr_zile"] = curs.actualizeaza(store.db)
            proba = []
            stats["sicap_castigatori"] = sicap.castigatori(store, maxim=3000 if a.tot else 800, proba=proba)
            if proba:
                os.makedirs(config.DATA_DIR, exist_ok=True)
                with open(os.path.join(config.DATA_DIR, "sicap-castigatori-proba.json"), "w", encoding="utf-8") as f:
                    json.dump(proba, f, ensure_ascii=False, indent=1)
        if a.comanda == "geocodare":
            from . import geocod
            stats["geocodare"] = geocod.geocodeaza(store, minute=a.minute or 20)
        if a.comanda == "buget":
            from . import buget
            stats["buget"] = buget.colecteaza(store)
        if a.comanda == "litigii":
            from . import litigii
            stats["litigii"] = litigii.colecteaza(store, tot=a.tot)
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
            from . import urbanism
            with open(os.path.join(config.DATA_DIR, "urbanism.json"), "w", encoding="utf-8") as f:
                json.dump(urbanism.export(store), f, ensure_ascii=False, separators=(",", ":"))
            from . import sicap
            rez, expl = sicap.export(store)
            if rez["autoritati"]:
                with open(os.path.join(config.DATA_DIR, "sicap.json"), "w", encoding="utf-8") as f:
                    json.dump(rez, f, ensure_ascii=False, separators=(",", ":"))
                with open(os.path.join(config.DATA_DIR, "sicap-explorer.json"), "w", encoding="utf-8") as f:
                    json.dump(expl, f, ensure_ascii=False, separators=(",", ":"))
                # raport text cu valorile neobișnuite, pentru verificare (în artefactul „rapoarte”)
                with open(os.path.join(config.DATA_DIR, "sicap-de-verificat.txt"), "w", encoding="utf-8") as f:
                    f.write(sicap.raport_de_verificat(expl))
            from . import litigii, voturi
            os.makedirs(os.path.join(config.DATA_DIR, "intern-date"), exist_ok=True)
            lp = litigii.export(store, public=True)
            if lp["dosare"]:
                lp["indicatori"] = litigii.indicatori(lp)
                with open(os.path.join(config.DATA_DIR, "litigii.json"), "w", encoding="utf-8") as f:
                    json.dump(lp, f, ensure_ascii=False, separators=(",", ":"))
                with open(os.path.join(config.DATA_DIR, "intern-date", "litigii.json"), "w", encoding="utf-8") as f:
                    json.dump(litigii.export(store, public=False), f, ensure_ascii=False, separators=(",", ":"))
            stats["voturi"] = voturi.scrie(store, config.DATA_DIR)
            try:   # concursuri și angajări, organigrama
                from . import concursuri
                stats["concursuri"] = concursuri.scrie(store, config.DATA_DIR)
            except Exception as e:
                stats["concursuri"] = f"eroare: {e}"
            try:   # ședința următoare, proiectele în consultare, fluxul de noutăți (și RSS)
                from . import cetateni
                try:
                    with open(os.path.join(config.DATA_DIR, "concursuri.json"), encoding="utf-8") as f:
                        cc = json.load(f)["concursuri"]
                except (OSError, ValueError, KeyError):
                    cc = []
                stats["cetateni"] = cetateni.scrie(store, config.DATA_DIR, concursuri=cc)
            except Exception as e:
                stats["cetateni"] = f"eroare: {e}"
            try:   # componența consiliului: fotografiile, partidele și declarațiile consilierilor (pagina primăriei)
                from . import componenta
                stats["componenta"] = componenta.scrie(config.DATA_DIR)
            except Exception as e:
                stats["componenta"] = f"eroare: {e}"
            try:   # declarațiile consilierilor lângă SICAP și urbanism (doar intern)
                from . import declaratii
                stats["declaratii"] = declaratii.scrie(store, config.DATA_DIR)
            except Exception as e:
                stats["declaratii"] = f"eroare: {e}"
            try:   # teme: investiții, patrimoniu, dispoziții, finanțări, taxe locale, rapoarte
                from . import teme
                stats["teme"] = teme.scrie(store, config.DATA_DIR)
            except Exception as e:
                stats["teme"] = f"eroare: {e}"
            try:   # pagina de start: „Rădăuți în <anul curent>”
                from . import poveste
                def _cit(n, implicit=None):
                    try:
                        with open(os.path.join(config.DATA_DIR, n), encoding="utf-8") as f:
                            return json.load(f)
                    except (OSError, ValueError):
                        return implicit
                acasa = poveste.anul(store.db, ind, expl if rez["autoritati"] else None,
                                     (_cit("concursuri.json") or {}).get("concursuri"), _cit("sedinte.json"))
                with open(os.path.join(config.DATA_DIR, "acasa.json"), "w", encoding="utf-8") as f:
                    json.dump(acasa, f, ensure_ascii=False, separators=(",", ":"))
                stats["acasa"] = "data/acasa.json"
            except Exception as e:
                stats["acasa"] = f"eroare: {e}"
            try:   # paginile și imaginile de distribuit pe rețelele sociale (s/)
                from . import distribuie
                stats["distribuie"] = distribuie.scrie(store, config.DATA_DIR)
            except Exception as e:
                stats["distribuie"] = f"eroare: {e}"
            try:   # semnalele automate și indicele de transparență (deocamdată doar pe intern)
                from . import semnale
                stats["semnale"] = semnale.scrie(config.DATA_DIR, db=store.db)
            except Exception as e:
                stats["semnale"] = f"eroare: {e}"
            try:   # date deschise: CSV-uri pentru descărcare
                from . import date_deschise
                stats["date_deschise"] = date_deschise.scrie(config.DATA_DIR)
            except Exception as e:
                stats["date_deschise"] = f"eroare: {e}"
            try:   # pagini statice pentru motoarele de căutare (p/...), sitemap.xml, robots.txt
                from . import pagini_statice
                stats["pagini_statice"] = pagini_statice.scrie(store, config.DATA_DIR)
            except Exception as e:
                stats["pagini_statice"] = f"eroare: {e}"
            try:   # indexul pentru căutarea în textul documentelor (pagina internă)
                from . import cautare_text
                stats["cautare_text"] = cautare_text.construieste(store, config.DATA_DIR)
            except Exception as e:
                stats["cautare_text"] = f"eroare: {e}"
            try:   # cine ce a spus în ședințe, după procesele-verbale (strict intern)
                from . import interventii
                stats["interventii"] = interventii.construieste(store, config.DATA_DIR)
            except Exception as e:
                stats["interventii"] = f"eroare: {e}"
            try:   # textele documentelor doar interne (Servicii Comunale), pentru dosarele pe temă
                from . import cautare_text
                stats["dosar_intern"] = cautare_text.construieste_intern(store, config.DATA_DIR)
            except Exception as e:
                stats["dosar_intern"] = f"eroare: {e}"
            from . import buget
            bx = buget.export(store)
            if bx["entitati"]:
                with open(os.path.join(config.DATA_DIR, "buget.json"), "w", encoding="utf-8") as f:
                    json.dump(bx, f, ensure_ascii=False, separators=(",", ":"))
            import shutil   # fișierele vechi pe instituții, înlocuite de exploratorul unic
            shutil.rmtree(os.path.join(config.DATA_DIR, "sicap"), ignore_errors=True)
            stats["indicatori"] = "data/indicatori.json, data/liste.json, data/urbanism.json, data/sicap*.json"
        if a.comanda in ("geocodare", "buget", "litigii", "sicap"):   # jurnal pentru rapoarte.zip (zona internă)
            _jurnal(store, a.comanda, stats)
        store.log_run(t0, a.comanda, stats)
    finally:
        store.close()
    print(json.dumps(stats, ensure_ascii=False, indent=2, default=str))
    return 0


def _jurnal(store, comanda, stats):
    """data/rulare-<comanda>.txt: ce a făcut pasul la ultima rulare (cu erorile), pentru verificare."""
    from datetime import datetime
    linii = [f"{comanda} - {datetime.now().isoformat(timespec='seconds')}",
             json.dumps(stats, ensure_ascii=False, indent=2, default=str)]
    try:
        if comanda == "geocodare":
            r = store.db.execute("SELECT COUNT(*), SUM(lat IS NOT NULL), SUM(lat IS NOT NULL AND cheie LIKE '%|%') "
                                 "FROM geocod").fetchone()
            linii.append(f"total căutate: {r[0]}, găsite: {r[1] or 0} (din care cu număr: {r[2] or 0})")
        if comanda == "buget":
            for t in ("buget_entitate", "buget_an", "buget_rand"):
                linii.append(f"{t}: {store.db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]} rânduri")
            from . import buget_aprobat
            ap = buget_aprobat.toate()
            linii.append(f"bugete aprobate (surse/buget/): {len(ap)} ani")
            for an, b in sorted(ap.items()):
                linii.append(f"  {an} | {b['fisier']} | total {b['cheltuieli']:,} | dezvoltare {b['dezvoltare']:,} | credite {b['credite']:,}")
            for r in store.db.execute("SELECT * FROM buget_an ORDER BY 1, 2 LIMIT 60"):
                linii.append("  " + " | ".join(str(x) for x in tuple(r)))
    except Exception as e:   # tabelele pot lipsi dacă pasul a picat înainte să le creeze
        linii.append(f"(rezumat indisponibil: {e})")
    os.makedirs(config.DATA_DIR, exist_ok=True)
    with open(os.path.join(config.DATA_DIR, f"rulare-{comanda}.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(linii) + "\n")


if __name__ == "__main__":
    sys.exit(main())
