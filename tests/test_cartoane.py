import importlib.util
import os

_spec = importlib.util.spec_from_file_location("cartoane", os.path.join(os.path.dirname(__file__), "..", "tools", "cartoane.py"))
cartoane = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cartoane)

REZ = {"id": "2026-11-18-1", "data": "2026-11-18", "rezumat": {"rezumat": "Consiliul a adoptat două proiecte — și a amânat unul.", "puncte": [
    {"nr": 1, "titlu": "Rectificarea bugetului", "pe_scurt": "Mută bani.", "interventii": [{"cine": "Un consilier", "ce": "A întrebat <de ce>."}],
     "vot": {"rezultat": "adoptat", "detalii": "13 pentru, 2 împotrivă, 3 abțineri", "sursa": "înregistrare"}},
    {"nr": 2, "titlu": "Prețul căldurii", "pe_scurt": "Preț nou.", "interventii": [], "vot": {"rezultat": "amânat", "detalii": None}},
    {"nr": 3, "titlu": "Un teren", "interventii": [], "vot": {"rezultat": "adoptat", "detalii": "18 pentru"}}], "alte_subiecte": []}}


def test_voturi():
    assert cartoane._voturi("13 pentru, 2 împotrivă, 3 abțineri") == [[13, "pentru", "p"], [2, "împotrivă", "m"], [3, "abțineri", "ab"]]
    assert cartoane._voturi("unanimitate") == []
    assert cartoane._voturi("25 pentru") == []   # mai multe voturi decât consilieri: nu desenăm


def test_ciorna_din_rezumat():
    s = cartoane.din_rezumat(REZ)
    assert s["ciorna"] and s["antet"] == "Consiliul Local Rădăuți · 18 noiembrie 2026"
    titluri = [k["titlu"] for k in s["cartoane"]]
    assert titluri[0].startswith("Ședința Consiliului Local din 18 noiembrie 2026")
    assert titluri[1] == "Prețul căldurii"   # punctele neadoptate vin primele
    assert "Ce s-a mai hotărât" in titluri
    for t in s["postari"].values():   # fără linie lungă și fără link spre monitor, cu sursa și semnătura
        assert "—" not in t and "monitor" not in t.lower() and "Asociația Rădăuțiul Civic" in t and "primariaradauti.ro" in t


def test_pagina_scapa_textul_si_sare_imaginile_lipsa(tmp_path):
    s = cartoane.din_rezumat(REZ)
    s["cartoane"].append({"titlu": "Test", "blocuri": [{"tip": "persoana", "img": "nu-exista.jpg", "nume": "X", "rol": "y"}]})
    for i in range(len(s["cartoane"])):
        h = cartoane.pagina(s, i, str(tmp_path))
        assert "<de ce>" not in h and "<img" not in h and "—" not in h
    assert "&lt;de ce&gt;" in "".join(cartoane.pagina(s, i, str(tmp_path)) for i in range(len(s["cartoane"])))


def test_an_din_text(tmp_path):
    from monitor_colector import teme
    for text, an in (("Raport de activitate 2025 Subsemnatul", "2025"), ("am desfășurat-o pe parcursul anului 2024. Am part", "2024"),
                     ("ales în urma alegerilor locale din data de 09.06.2024, prezint", None)):
        f = tmp_path / "t.txt"
        f.write_text(text, encoding="utf-8")
        assert (teme.an_din_text(str(f)) or [None])[0] == an
