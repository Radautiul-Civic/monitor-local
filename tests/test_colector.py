import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from monitor_colector import collect, documents, indicators, parse  # noqa: E402
from monitor_colector.store import Store  # noqa: E402
from monitor_colector.wp import WPClient  # noqa: E402
import fakes  # noqa: E402


class TestParse(unittest.TestCase):
    def test_hcl_ref_variants(self):
        cases = {
            "HCL nr. 160 din 22.09.2026": (160, date(2026, 9, 22)),
            "HCL-nr.-160-din-22.09.2026.pdf": (160, date(2026, 9, 22)),
            "hcl-nr.-1-din-05.01.2023.pdf": (1, date(2023, 1, 5)),
            "hcl-201-din-16.08.2023.pdf": (201, date(2023, 8, 16)),
            "HCL-nr.-53-din-27.02.2023.pdf": (53, date(2023, 2, 27)),
            "hcl-nr-254-din-31.10.2023.pdf": (254, date(2023, 10, 31)),
            "Hotărâre nr. 222 din 08.09.2023 e privind aprobarea": (222, date(2023, 9, 8)),
            "Hotarare nr. 15 de modificare a HCL nr. 268/27.11.2023": (15, None),
        }
        for text, (n, d) in cases.items():
            ref = parse.parse_hcl_ref(text)
            self.assertEqual((ref["number"], ref["date"]), (n, d), text)

    def test_hcl_ref_typo_in_filename(self):
        ref = parse.parse_hcl_ref("hcl-208-din-30.0802023.pdf")
        self.assertEqual((ref["number"], ref["year"]), (208, 2023))

    def test_extract_documents_wp_block(self):
        url = fakes.UP + "/2026/08/HCL-nr.-145-din-06.08.2026.pdf"
        docs = parse.extract_documents(fakes.file_block(url, "HCL nr. 145 din 06.08.2026"), fakes.BASE)
        self.assertEqual(docs, [{"url": url, "text": "HCL nr. 145 din 06.08.2026"}])

    def test_extract_documents_ignores_non_documents(self):
        html = '<a href="https://drive.google.com/drive/folders/x">link</a><a href="/wp-content/uploads/a.xlsx">Registru</a>'
        docs = parse.extract_documents(html, fakes.BASE)
        self.assertEqual(docs, [{"url": fakes.BASE + "/wp-content/uploads/a.xlsx", "text": "Registru"}])

    def test_hcl_post(self):
        docs = [{"url": fakes.UP + "/2026/10/HCL-nr.-160-din-22.09.2026.pdf", "text": "HCL nr. 160 din 22.09.2026"}]
        h = parse.parse_hcl_post("Hotărâre privind rectificarea bugetului", "hcl-160-2026", docs)
        self.assertEqual((h["number"], h["date"], h["year"], h["issues"]), (160, date(2026, 9, 22), 2026, []))

    def test_hcl_post_number_mismatch(self):
        docs = [{"url": fakes.UP + "/x/HCL-nr.-160-din-22.09.2026.pdf", "text": "HCL nr. 160 din 22.09.2026"}]
        h = parse.parse_hcl_post("t", "hcl-159-2026", docs)
        self.assertTrue(any(i.startswith("numere_diferite") for i in h["issues"]))

    def test_pv(self):
        p = parse.parse_pv("Proces verbal ședință ordinară din 20.08.2026")
        self.assertEqual((p["kind"], p["session_type"], p["session_date"]), ("pv_sedinta", "ordinara", date(2026, 8, 20)))
        p = parse.parse_pv("Proces verbal afișare HCL 157 &#8211; 160 ședință ordinară din 20.08.2026")
        self.assertEqual((p["kind"], p["hcl_from"], p["hcl_to"]), ("pv_afisare", 157, 160))
        p = parse.parse_pv("Proces verbal ședință extraordinară din data de 03.04.2026 ora 13:30")
        self.assertEqual((p["session_type"], p["session_date"], p["hour"]), ("extraordinara", date(2026, 4, 3), "13:30"))
        p = parse.parse_pv("Şedinţa extraordinara, convocata de indata din 16.01.2025")
        self.assertEqual(p["session_type"], "extraordinara_de_indata")

    def test_registry_period(self):
        r = parse.parse_registry_period("Certificate de urbanism emise în perioada 05.01.2026 &#8211; 30.06.2026")
        self.assertEqual((r["start"], r["end"]), (date(2026, 1, 5), date(2026, 6, 30)))
        r = parse.parse_registry_period("Certificate de urbanism emise în 2025")
        self.assertEqual(r["end"], date(2025, 12, 31))

    def test_dispozitie(self):
        cases = {
            "Dispozitia nr. 660 din 21.09.2026 privind aprobarea virarilor": (660, date(2026, 9, 21)),
            "Dispoziție nr. 625/03.09.2026 privind aprobarea virărilor": (625, date(2026, 9, 3)),
            "Dispoziție 555 / 03.08.2026 privind actualizarea delimitărilor": (555, date(2026, 8, 3)),
            "Dispozitia de convocare nr. 337/20.05.2026 privind convocarea": (337, date(2026, 5, 20)),
        }
        for t, (n, d) in cases.items():
            r = parse.parse_dispozitie(t)
            self.assertEqual((r["number"], r["date"]), (n, d), t)

    def test_archive_list(self):
        items = parse.parse_archive_list(fakes.ARCHIVE_2023, "https://arhiva.primariaradauti.ro", 2023)
        by_nr = {i["number"]: i for i in items}
        self.assertEqual(sorted(by_nr), [1, 15, 22, 208, 254, 288])
        self.assertIn("fisier_alt_numar:301", by_nr[288]["issues"])     # eroarea reală din arhiva 2023
        self.assertTrue(by_nr[22]["redacted"])
        self.assertEqual(by_nr[15]["issues"], [])                        # nu confundă cu HCL 268
        self.assertEqual(by_nr[208]["date"], date(2023, 8, 30))

    def test_archive_2014_numar_la_inceput(self):
        items = parse.parse_archive_list(fakes.ARCHIVE_2014, "https://arhiva.primariaradauti.ro", 2014)
        self.assertEqual(sorted(i["number"] for i in items), [203, 204])
        self.assertTrue(all(i["issues"] == [] for i in items))

    def test_archive_2016_fisier_scanat_nu_e_problema(self):
        items = parse.parse_archive_list(fakes.ARCHIVE_2016, "https://arhiva.primariaradauti.ro", 2016)
        by_nr = {i["number"]: i for i in items}
        self.assertEqual(sorted(by_nr), [1, 8])        # nu ia HCL 111 din text
        self.assertEqual(by_nr[1]["issues"], [])        # SKM_*.pdf nu e o eroare de publicare

    def test_archive_2024_numar_din_fisier_si_anexe(self):
        items = parse.parse_archive_list(fakes.ARCHIVE_2024, "https://arhiva.primariaradauti.ro", 2024)
        by_nr = {i["number"]: i for i in items}
        self.assertEqual(sorted(by_nr), [1, 3, 8])      # nu ia HCL 123 din titlu
        self.assertEqual(by_nr[1]["date"], date(2024, 1, 25))
        self.assertEqual(len(by_nr[3]["extra_urls"]), 1)  # anexa nu înlocuiește linkul principal
        self.assertTrue(by_nr[8]["redacted"])


class TestPipeline(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.tmp, "t.sqlite"))
        self.session = fakes.FakeSession()
        self.client = WPClient(base_url=fakes.BASE, session=self.session, delay=0)

    def tearDown(self):
        self.store.close()
        shutil.rmtree(self.tmp)

    def test_full_then_incremental(self):
        stats = collect.collect_api(self.store, self.client, sources=["hcl", "pv", "cu", "ac", "contracte"])
        self.assertEqual(stats["hcl"]["new"], 3)
        self.assertEqual(stats["pv"]["new"], 3)
        # paginarea a mers pe 2 pagini pentru HCL (per_page=2 în serverul simulat)
        pages = [c[1].get("page") for c in self.session.calls if c[1].get("categories") == 17]
        self.assertEqual(pages, [1, 2])
        db = self.store.db
        self.assertEqual(db.execute("SELECT COUNT(*) FROM hcl").fetchone()[0], 3)
        r = db.execute("SELECT adoption_date, posted FROM hcl WHERE number=160").fetchone()
        self.assertEqual((r[0], r[1]), ("2026-09-22", "2026-10-01"))
        # linkul Google Drive din HCL 156 nu e tratat ca document
        self.assertEqual(db.execute("SELECT COUNT(*) FROM documents WHERE url LIKE '%drive.google%'").fetchone()[0], 0)

        # a doua rulare: incrementală, nimic nou; o postare modificată e detectată
        original = dict(fakes.POSTS[17][0])
        fakes.POSTS[17][0]["modified"] = "2026-10-09T10:00:00"
        fakes.POSTS[17][0]["title"] = {"rendered": "Hotărâre (titlu corectat)"}
        try:
            stats2 = collect.collect_api(self.store, self.client, sources=["hcl"])
            self.assertEqual(stats2["hcl"]["changed"], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM post_versions WHERE wp_id=9001").fetchone()[0], 2)
            last_call = [c for c in self.session.calls if c[1].get("categories") == 17][-1]
            self.assertTrue(last_call[1]["modified_after"].startswith("2026-10-01"))
        finally:
            fakes.POSTS[17][0].update(original)

    def test_missing_category_is_reported(self):
        self.session.cats = [c for c in fakes.CATEGORIES if c["slug"] != "pv-sedinte-cl"]
        stats = collect.collect_api(self.store, self.client, sources=["pv"])
        self.assertEqual(stats["pv"], "categorie_lipsa")

    def test_archive_and_priority(self):
        collect.collect_api(self.store, self.client, sources=["hcl"])
        arch = WPClient(base_url="https://arhiva.primariaradauti.ro", delay=0,
                        session=fakes.FakeSession(html_pages={"/a2023/": fakes.ARCHIVE_2023}))
        from monitor_colector import config
        old = config.ARCHIVE_HCL_PAGES
        config.ARCHIVE_HCL_PAGES = {2023: "/a2023/"}
        try:
            stats = collect.collect_archive(self.store, arch)
        finally:
            config.ARCHIVE_HCL_PAGES = old
        self.assertEqual(stats[2023]["hcl"], 6)
        self.assertEqual(stats[2023]["probleme"], 1)   # HCL 288 -> fișierul HCL 301

    def test_indicators(self):
        collect.collect_api(self.store, self.client, sources=["hcl", "pv", "cu", "ac", "contracte"])
        ind = indicators.compute(self.store, today=date(2026, 10, 10))
        self.assertEqual(ind["hcl_intarziere_publicare"]["2026"]["max_zile"], 20)   # HCL 156: 26.08 -> 15.09
        self.assertEqual(ind["hcl_cele_mai_intarziate"][0], {"an": 2026, "nr": 156, "zile": 20})
        self.assertEqual(ind["registre_urbanism"]["cu"]["zile_neacoperite"], 102)
        self.assertEqual(ind["contracte_site"]["zile_de_la_ultima"], 285)
        self.assertEqual(ind["pv_intarziere_publicare"]["max_zile"], 40)            # 20.08 -> 29.09
        self.assertEqual(ind["hcl_numere_lipsa"]["2026"]["lipsa_total"], 157)       # doar 3 HCL în setul de test
        self.assertFalse(ind["hcl_numere_lipsa"]["2026"]["acoperire_completa"])
        self.assertTrue(ind["hcl_intarziere_publicare"]["2026"]["fiabil"])
        self.assertIn("de_ocr", ind["documente"])
        md = indicators.to_markdown(ind)
        self.assertIn("HCL - întârzierea publicării", md)
        self.assertIn("acoperire incompletă", md)
        self.assertNotIn("—", md)

    def test_download_and_text_detection(self):
        collect.collect_api(self.store, self.client, sources=["hcl"])
        url = fakes.UP + "/2026/10/HCL-nr.-160-din-22.09.2026.pdf"
        self.session.files[url] = make_text_pdf(os.path.join(self.tmp, "src.pdf"))
        for row in self.store.documents_to_fetch():
            if row["url"] != url:
                self.store.update_document(row["url"], fetched_at="sarit")
        stats = documents.process_downloads(self.store, self.session, data_dir=self.tmp, delay=0)
        self.assertEqual(stats["descarcate"], 1)
        r = self.store.db.execute("SELECT text_layer, sha256, local_path FROM documents WHERE url=?", (url,)).fetchone()
        self.assertEqual(r["text_layer"], 1)
        self.assertEqual(len(r["sha256"]), 64)
        self.assertTrue(os.path.exists(r["local_path"] + ".txt"))


def make_text_pdf(path):
    """PDF cu strat de text (generat cu pypdf, fără dependențe în plus)."""
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
    w = PdfWriter()
    page = w.add_blank_page(595, 842)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
    lines = " ".join(f"(Consiliul Local al Municipiului Radauti adopta prezenta hotarare art {i}) Tj T*" for i in range(6))
    s = DecodedStreamObject()
    s.set_data(f"BT /F1 11 Tf 14 TL 50 800 Td {lines} ET".encode())
    page[NameObject("/Contents")] = w._add_object(s)
    with open(path, "wb") as f:
        w.write(f)
    with open(path, "rb") as f:
        return f.read()


def make_scanned_pdf(path, text):
    """PDF „scanat”: doar o imagine, fără strat de text, ca PV-urile primăriei."""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("L", (1700, 600), 255)
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 56)
    except OSError:
        font = ImageFont.load_default(size=56)
    for i, line in enumerate(text.split("\n")):
        d.text((80, 80 + i * 110), line, fill=0, font=font)
    img.save(path, "PDF", resolution=200)


@unittest.skipUnless(documents.ocr_available("eng"), "lipsește tesseract/pdftoppm")
class TestOCR(unittest.TestCase):
    def test_scanned_pdf_detected_and_ocred(self):
        tmp = tempfile.mkdtemp()
        try:
            pdf = os.path.join(tmp, "pv.pdf")
            make_scanned_pdf(pdf, "PROCES VERBAL\nVOTURI PENTRU 17\nIMPOTRIVA 2 ABTINERI 0")
            pages, has_text = documents.text_layer(pdf)
            self.assertEqual((pages, has_text), (1, 0))
            text = documents.ocr_pdf(pdf, lang="eng")
            self.assertIn("PROCES VERBAL", text.upper())
            self.assertIn("17", text)
        finally:
            shutil.rmtree(tmp)


if __name__ == "__main__":
    unittest.main()


class TestIndicatoriFiltre(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.tmp, "t.db"))

    def tearDown(self):
        self.store.close()

    def test_retrodated_year_and_technical_issues_not_public(self):
        db = self.store.db
        for n in range(1, 11):   # 2025: 8 din 10 postate în ziua adoptării -> nefiabil
            posted = "2025-03-01" if n <= 8 else "2025-03-11"
            issues = '["nume_fisier_neparsabil"]' if n == 1 else ('["fisier_alt_numar:301"]' if n == 2 else "[]")
            db.execute("INSERT INTO hcl (year, number, adoption_date, origin, posted, issues, redacted) "
                       "VALUES (2025, ?, '2025-03-01', 'site', ?, ?, 0)", (n, posted, issues))
        db.commit()
        ind = indicators.compute(self.store, today=date(2026, 10, 10))
        self.assertFalse(ind["hcl_intarziere_publicare"]["2025"]["fiabil"])
        self.assertTrue(ind["hcl_numere_lipsa"]["2025"]["acoperire_completa"])
        self.assertEqual([p["nr"] for p in ind["hcl_probleme"]], [2])
        self.assertEqual(ind["hcl_diagnostic_nume_fisier"], 1)
        self.assertIn("NEFIABIL", indicators.to_markdown(ind))


class TestListeSiWord(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.tmp, "t.db"))
        self.client = WPClient(delay=0, session=fakes.FakeSession())

    def tearDown(self):
        self.store.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_liste_have_links(self):
        from monitor_colector import liste
        collect.collect_api(self.store, self.client, sources=["hcl", "pv", "cu", "ac"])
        L = liste.export(self.store)
        self.assertTrue(L["hcl"] and L["pv"] and L["registre"])
        h = L["hcl"][0]
        self.assertEqual((h["an"], h["nr"]), (2026, 160))
        self.assertTrue(h["pdf"].endswith(".pdf"))
        self.assertTrue(h["pagina"].startswith("https://"))
        self.assertNotIn("text", json.dumps(L).lower().replace("text_", ""))

    def test_word_document(self):
        from docx import Document
        from monitor_colector import word
        txt = os.path.join(self.tmp, "a.txt")
        with open(txt, "w", encoding="utf-8") as f:
            f.write("HOTĂRÂRE\nprivind aproba-\nrea bugetului\n\nArt. 1 Se aprobă.\f Pagina doi")
        self.store.add_document("https://x.ro/HCL-1.pdf", None, "arhiva", "HCL 1")
        self.store.update_document("https://x.ro/HCL-1.pdf", text_path=txt, text_layer=0,
                                   fetched_at="2026-10-11", local_path=txt)
        self.store.db.execute("INSERT INTO hcl (year, number, origin, pdf_url, issues, redacted) "
                              "VALUES (2015, 1, 'arhiva', 'https://x.ro/HCL-1.pdf', '[]', 0)")
        self.store.db.commit()
        st = word.export_all(self.store, data_dir=self.tmp)
        self.assertEqual(st["word"], 1)
        dest = os.path.join(self.tmp, "texte", "hcl", "HCL 1 din 2015.docx")
        body = "\n".join(p.text for p in Document(dest).paragraphs)
        self.assertIn("privind aprobarea bugetului", body)
        self.assertIn("OCR", body)
        self.assertNotIn("—", body)
        self.assertEqual(word.export_all(self.store, data_dir=self.tmp)["existente"], 1)
        self.assertEqual(word.safe_name('a_b: c/d?'), "a b c d")
