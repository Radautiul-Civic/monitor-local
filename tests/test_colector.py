import hashlib
import json
import sqlite3
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
        self.assertIn("medie_zile", ind["hcl_intarziere_publicare"]["2026"])
        self.assertIn("2026", ind["hcl_pe_ani"])
        self.assertTrue(ind["stadiu"])
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
        self.assertEqual(ind["hcl_probleme"][0]["verificare"], "neverificat")
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


class TestArhiva2013(unittest.TestCase):
    def test_number_only_filename(self):
        html = ('<a href="/wp-content/uploads/2013/97.pdf">Hotarare de modificare si completare HCL nr.83 din '
                '05.07.2012 privind constituirea unui nucleu</a>'
                '<a href="/wp-content/uploads/2013/96.pdf">Hotarare privind aprobarea documentatiei</a>'
                '<a href="/wp-content/uploads/2013/anexa.pdf">Anexa fara numar</a>')
        items = parse.parse_archive_list(html, "https://arhiva.primariaradauti.ro", 2013)
        self.assertEqual(sorted(i["number"] for i in items), [96, 97])
        self.assertTrue(all(i["year"] == 2013 for i in items))


class TestUrbanism(unittest.TestCase):
    def test_tabel_nou(self):
        from monitor_colector import urbanism as u
        antet = ["Nr.\nCU", "Data CU", "Solicitant", "Adresa imobil", "Numar\nCadastral", "Carte\nFunciara",
                 "Scopul solicitarii CU", "CU poate fi / nu poate fi utilizat"]
        r1 = ["1", "05.01.2026", "POPESCU\nION", "jud. SUCEAVA, mun.\nRĂDĂUŢI, str.\nSTEFAN CEL MARE, nr. 17",
              "CF: 30471-C1-\nU42\n1730/XVII", "CF: 30471-C1-\nU42\n1730/XVII",
              "D e b r a n s a r e d e l a s i s t e m", "Debransare de la sistem"]
        r2 = ["106", "16.03.2026", "CENTRUL DE PROCEDURI PENTRU SOLICITANTI", "str. PUTNEI, nr. 1", "CF: 1", "CF: 1",
              "Schimbare destinație Nu poate fi folosit întrucât e casă", "idem"]
        r3 = ["7", "05.01.2026", "SC BEST STYLE SRL", "str. CALEA BUCOVINEI, nr. 3", "", "", "Construire spatiu comercial, bransamente", ""]
        acte = u._parse_nou([[antet, r1, r2], [r3]])
        self.assertEqual(len(acte), 3)
        a1, a2, a3 = acte
        self.assertEqual(a1["scop"], "Debransare de la sistem")
        self.assertEqual(a1["cf_cadastral"], "30471-C1-U42, 1730/XVII")
        self.assertEqual(u.strada(a1["adresa"]), "Stefan cel Mare")
        self.assertEqual(a2["solicitant"], "CENTRUL DE PROCEDURI PENTRU SOLICITANTI")   # nu e luat drept antet
        self.assertTrue(a2["utilizabil"].startswith("Nu poate fi folosit"))
        self.assertEqual(u.categorie(a3["scop"]), "Comercial și servicii")
        self.assertTrue(u.persoana_juridica(a3["solicitant"]))
        self.assertFalse(u.persoana_juridica("POPESCU ION"))

    def test_valori_si_strazi(self):
        from monitor_colector import urbanism as u
        self.assertEqual(u.valoare("368.959,14"), 368959.14)
        self.assertEqual(u.valoare("1286299,69 lei fara TVA"), 1286299.69)
        self.assertEqual(u.valoare("3740"), 3740.0)
        self.assertEqual(u.strada_centralizator("SUCEAVA, municipiul RĂDĂUŢI,RĂDĂUŢICA LARASI, Nr. 7", {}), "Calarasi")
        self.assertEqual(u.strada_centralizator("RĂDĂUŢI,RĂDĂUŢIAN DRONIC MOTRESCU, Nr. 3",
                                                {"andronicmotrescu": "Andronic Motrescu"}), "Andronic Motrescu")


class TestArhivaListe(unittest.TestCase):
    PV_HTML = ("<h3>Anul 2025</h3>"
               '<a href="/wp-content/uploads/2025/11/pv-sedinta-extraordinara-din-10.10.2025.pdf">Şedinţa extraordinară din data de 10.10.2025</a>'
               '<a href="/wp-content/uploads/2025/11/pv-sedinta-ordinara-din-25.09.2025.pdf">Şedinţa ordinară din data de 25.09.2025</a>'
               "<h3>Anul 2017</h3>"
               '<a href="/u/2017/a.pdf">Sedinta extraordinara de indata din data de 03.03.2017</a>'
               '<a href="/u/2018/b.pdf">Proces-Verbal de publicare on-line 25.01.2018</a>'
               "<h3>Anul 2015</h3>"
               '<a href="/u/2015/SKM_1.pdf">Proces verbal de sedinta din data de 17.12.2015</a>'
               '<a href="/u/2015/SKM_2.pdf">Proces verbal de sedinta din data de 17.12.2015</a>'
               '<a href="/anunturi/x/">Anunț</a>')
    AC_HTML = ('<a href="/u/2020/12/documente-necesare.pdf">Documente necesare pentru emiterea Certificatului</a>'
               '<a href="/u/2025/10/AC-1.pdf">Autorizatii de construire / desfiintare din perioada 18.08.2025 – 10.10.2025</a>'
               '<a href="/u/2012/06/certi-2.pdf">Autorizatii de Construire/Desfiintare in perioada 01.01.2015 -31.03.2015</a>')

    def test_pv_si_registre(self):
        from monitor_colector import config, liste
        tmp = tempfile.mkdtemp()
        store = Store(os.path.join(tmp, "t.db"))
        pages = {config.ARCHIVE_PV_PAGE: self.PV_HTML, config.ARCHIVE_REGISTRE["ac"]: self.AC_HTML,
                 config.ARCHIVE_REGISTRE["cu"]: ""}
        arch = WPClient(base_url="https://arhiva.primariaradauti.ro", delay=0,
                        session=fakes.FakeSession(html_pages=pages))
        st = collect.collect_archive_lists(store, arch)
        self.assertEqual(st["pv"]["pv"], 6)
        self.assertEqual(st["ac"], 2)
        tip = {r["session_date"]: (r["kind"], r["session_type"]) for r in store.db.execute("SELECT * FROM pv")}
        self.assertEqual(tip["2017-03-03"], ("pv_sedinta", "extraordinara_de_indata"))
        self.assertEqual(tip["2018-01-25"][0], "pv_afisare")
        ind = indicators.compute(store, today=date(2026, 10, 12))
        self.assertEqual(ind["sedinte_pe_tip"]["2015"], {"necunoscut": 1})   # 2 fișiere, o ședință
        L = liste.export(store)
        s15 = [x for x in L["pv"] if x["data"] == "2015-12-17"]
        self.assertEqual(len(s15), 1)
        self.assertEqual(len(s15[0]["alte_pdf"]), 1)
        self.assertTrue(s15[0]["pagina"].endswith(config.ARCHIVE_PV_PAGE))
        per = {r["title"][:20]: r["period_start"] for r in store.db.execute("SELECT * FROM registries")}
        self.assertIn("2015-01-01", per.values())
        store.close()
        shutil.rmtree(tmp)


class TestPastrare(unittest.TestCase):
    class Resp:
        def __init__(self, status=200, data=None, text="", body=b"", headers=None):
            self.status_code, self._d, self.text, self._b = status, data, text, body
            self.headers = headers or {}
            self.ok = status < 400

        def json(self):
            return self._d

        def raise_for_status(self):
            if self.status_code >= 400:
                raise RuntimeError(self.status_code)

        def iter_content(self, n):
            yield self._b

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    class Sesiune:
        def __init__(self, media):
            self.media, self.calls = media, []

        def get(self, url, params=None, timeout=None, stream=False, allow_redirects=True):
            R = TestPastrare.Resp
            self.calls.append(url)
            if url.endswith("/wp-json/wp/v2/media"):
                return R(data=self.media if params["page"] == 1 else [], headers={"X-WP-TotalPages": "1"})
            if url.endswith("/wp-json/wp/v2/posts"):
                return R(data=[{"id": 1, "link": "https://a.ro/p/1/", "date": "2020-01-01",
                                "title": {"rendered": "P"}, "content": {"rendered":
                                '<a href="https://a.ro/wp-content/uploads/2019/x.pdf">x</a>'}}] if params["page"] == 1 else [],
                         headers={"X-WP-TotalPages": "1"})
            if "/wp-json/" in url:
                return R(status=404)
            if url.endswith("wp-sitemap.xml"):
                return R(text="<loc>https://a.ro/wp-sitemap-posts-page-1.xml</loc>")
            if url.endswith("page-1.xml"):
                return R(text="<loc>https://a.ro/despre/</loc>")
            return R(body=b"%PDF-1.4 continut")

    class FTPFals:
        def __init__(self):
            self.urcate = {}

        def urca(self, local, remote):
            with open(local, "rb") as f:
                self.urcate[remote] = f.read()

        def inchide(self):
            pass

    def test_inventar_copie_disparitie(self):
        from monitor_colector import pastrare as P
        tmp = tempfile.mkdtemp()
        old = P.DIR
        P.DIR = tmp
        try:
            c = sqlite3.connect(os.path.join(tmp, "p.db"))
            c.row_factory = sqlite3.Row
            c.executescript(P.SCHEMA)
            media = [{"id": 5, "date": "2019-05-01", "mime_type": "application/pdf", "filesize": 10,
                      "source_url": "https://a.ro/wp-content/uploads/2019/hcl 5.pdf", "title": {"rendered": "HCL 5"}}]
            s = self.Sesiune(media)
            st = P.inventar(c, s=s, ritm=P.Ritm(0), sites={"arhiva": "https://a.ro"})
            self.assertEqual(st["arhiva"]["media"], 1)
            self.assertEqual(st["arhiva"]["linkuri"], 1)        # fișier legat din postare, în afara bibliotecii
            self.assertEqual(st["arhiva"]["continut"]["posts"], 1)
            urls = {r["url"]: r["sursa"] for r in c.execute("SELECT url, sursa FROM fisiere")}
            self.assertEqual(urls["https://a.ro/despre/"], "pagina")
            ftp = self.FTPFals()
            cs = P.copiaza(c, s=s, ritm=P.Ritm(0), ftp=ftp)
            self.assertEqual(cs["copiate"], len(urls))
            self.assertIn("intern/arhiva-copie/arhiva/wp-content/uploads/2019/hcl 5.pdf", ftp.urcate)
            self.assertIn("intern/arhiva-copie/arhiva/despre/index.html", ftp.urcate)
            h = c.execute("SELECT sha256 FROM fisiere WHERE media_id=5").fetchone()[0]
            self.assertEqual(h, hashlib.sha256(b"%PDF-1.4 continut").hexdigest())
            # a doua zi fișierul lipsește din bibliotecă -> marcat dispărut (copia rămâne)
            st2 = P.inventar(c, s=self.Sesiune(media + [dict(media[0], id=6, source_url="https://a.ro/wp-content/uploads/y.pdf")]),
                             ritm=P.Ritm(0), sites={"arhiva": "https://a.ro"})
            st3 = P.inventar(c, s=self.Sesiune([dict(media[0], id=6, source_url="https://a.ro/wp-content/uploads/y.pdf")]),
                             ritm=P.Ritm(0), sites={"arhiva": "https://a.ro"})
            self.assertEqual(st3["arhiva"]["disparute_acum"], "nu se evaluează (inventar incomplet)")
            stare = P.manifest(c)
            self.assertEqual(stare["site_uri"]["arhiva"]["copiate"], len(urls))
            with open(os.path.join(tmp, "manifest.csv"), encoding="utf-8") as f:
                self.assertIn("sha256", f.readline())
            c.close()
        finally:
            P.DIR = old
            shutil.rmtree(tmp)


class TestWayback(unittest.TestCase):
    def test_existent_si_trimis(self):
        from monitor_colector import pastrare as P
        R = TestPastrare.Resp

        class S:
            def __init__(self):
                self.salvate = []

            def get(self, url, params=None, timeout=None, allow_redirects=True):
                if "wayback/available" in url:
                    snap = {"closest": {"available": True, "url": "https://web.archive.org/web/2019/x"}} if params["url"].endswith("vechi.pdf") else {}
                    return R(data={"archived_snapshots": snap})
                self.salvate.append(url)
                return R(status=302)

            def post(self, *a, **k):
                raise AssertionError("fără cont nu se folosește POST")

        c = sqlite3.connect(":memory:")
        c.row_factory = sqlite3.Row
        c.executescript(P.SCHEMA)
        for u in ("https://a.ro/vechi.pdf", "https://a.ro/nou.pdf"):
            c.execute("INSERT INTO fisiere (url, site, sursa) VALUES (?, 'arhiva', 'media')", (u,))
        old = P.Ritm.__init__
        P.Ritm.__init__ = lambda self, delay=0: (setattr(self, "delay", 0), setattr(self, "t", 0.0))[0]
        try:
            s = S()
            st = P.wayback(c, s=s)
        finally:
            P.Ritm.__init__ = old
        self.assertEqual((st["deja_in_arhiva"], st["trimise"]), (1, 1))
        self.assertEqual(s.salvate, ["https://web.archive.org/save/https://a.ro/nou.pdf"])
        self.assertEqual(c.execute("SELECT COUNT(*) FROM fisiere WHERE wayback_url IS NULL").fetchone()[0], 0)


class TestVerificari(unittest.TestCase):
    def test_false_positive_hidden_confirmed_kept(self):
        tmp = tempfile.mkdtemp()
        store = Store(os.path.join(tmp, "t.db"))
        for y, n, iss in ((2014, 188, '["fisier_alt_numar:1881"]'), (2023, 288, '["fisier_alt_numar:301"]')):
            store.db.execute("INSERT INTO hcl (year, number, origin, pdf_url, issues, redacted) VALUES (?,?,?,?,?,0)",
                             (y, n, "arhiva", f"https://x.ro/{n}.pdf", iss))
        store.db.commit()
        pr = indicators.compute(store, today=date(2026, 10, 11))["hcl_probleme"]
        self.assertEqual([(p["an"], p["nr"], p["verificare"]) for p in pr], [(2023, 288, "confirmat")])
        store.close()
        shutil.rmtree(tmp)


class TestStadiu(unittest.TestCase):
    def test_years_and_states(self):
        from monitor_colector import stadiu
        ind = {"hcl_pe_ani": {"2020": {"gasite": 150, "ultimul_nr": 267, "acoperire_pct": 56},
                              "2021": {"gasite": 200, "ultimul_nr": 290, "acoperire_pct": 69},
                              "2023": {"gasite": 321, "ultimul_nr": 322, "acoperire_pct": 100}},
               "registre_urbanism": {"cu": {"ultima_perioada_pana_la": "2026-06-30", "zile_neacoperite": 103}},
               "contracte_site": {"ultima_postare": "2025-12-29", "zile_de_la_ultima": 286}}
        st = stadiu.compute(ind)
        el = {x["element"]: x for x in st}
        self.assertEqual(el["Hotărâri 2022"]["stare"], "lipsa")
        self.assertEqual(el["Hotărâri 2020-2021"]["stare"], "partial")
        self.assertIn("30 iunie 2026", el["Certificate de urbanism"]["detaliu"])
        self.assertEqual(el["Autorizații de construire"]["stare"], "lipsa")
        self.assertEqual(stadiu._interval([2013, 2014, 2015, 2018]), "2013-2015, 2018")
        self.assertTrue(all("—" not in x["detaliu"] for x in st))


class TestTitluri(unittest.TestCase):
    def test_double_encoded_entities(self):
        self.assertEqual(parse.clean_title("emise &amp;#8211; 30.11.2025"), "emise \u2013 30.11.2025")
        self.assertEqual(parse.clean_title("A &amp;amp; B"), "A & B")
        self.assertEqual(parse.clean_title("  simplu   titlu "), "simplu titlu")


class TestRecuperare(unittest.TestCase):
    @unittest.skipUnless(documents.ocr_available("eng"), "lipsește tesseract/pdftoppm")
    def test_queue_lots_and_import(self):
        from monitor_colector import recuperare
        tmp = tempfile.mkdtemp()
        try:
            store = Store(os.path.join(tmp, "t.db"))
            for i in range(3):
                pdf = os.path.join(tmp, f"d{i}.pdf")
                make_scanned_pdf(pdf, f"HOTARARE NUMARUL {i + 1}")
                url = f"https://x.ro/d{i}.pdf"
                store.add_document(url, None, "arhiva", f"d{i}")
                store.update_document(url, local_path=pdf, text_layer=0, pages=1, fetched_at="2026-10-11")
            store.db.commit()
            q = recuperare.build_queue(store, data_dir=tmp, per_lot=2)
            self.assertEqual((q["documente"], q["loturi"]), (3, 2))
            outs = []
            for lot in range(2):
                out = os.path.join(tmp, f"lot{lot}")
                st = recuperare.ocr_lot(lot, 2, out, data_dir=tmp, lang="eng")
                self.assertEqual(st["erori"], 0)
                outs.append(out)
            self.assertEqual(recuperare.importa(store, outs)["importate"], 3)
            self.assertEqual(store.documents_to_ocr(), [])
            row = store.db.execute("SELECT text_path FROM documents WHERE url='https://x.ro/d2.pdf'").fetchone()
            with open(row["text_path"], encoding="utf-8") as f:
                self.assertIn("3", f.read())
            store.close()
        finally:
            shutil.rmtree(tmp)

    def test_budget_stops_before_starting(self):
        from monitor_colector import recuperare
        tmp = tempfile.mkdtemp()
        try:
            with open(os.path.join(tmp, recuperare.QUEUE), "w") as f:
                json.dump({"documente": [{"url": "u", "local_path": "/nu", "pages": 1}], "loturi": 1}, f)
            st = recuperare.ocr_lot(0, 1, os.path.join(tmp, "o"), data_dir=tmp, minutes=-1)
            self.assertTrue(st["oprit_la_buget"])
            self.assertEqual(st["ocr"], 0)
        finally:
            shutil.rmtree(tmp)


if __name__ == "__main__":
    unittest.main()
