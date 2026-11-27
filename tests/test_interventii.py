import json
import os

from monitor_colector import interventii as I
from monitor_colector.collect import _pseudo_post
from monitor_colector.store import Store

PV = """PROCES VERBAL
1. Proiect de hotărâre privind prețul energiei termice — iniţiator, primar LOGHIN Bogdan-Andrei;
2. Proiect de hotărâre privind bugetul — iniţiator, primar LOGHIN Bogdan-Andrei;

DI Jecalo intervine şi precizează că nu participă la discuţii și nici la vot la proiectul de la
punctul 1 întrucât a fost administrator.

Se trece la punctul 1 de pe ordinea de zi si anume proiect de hotărâre înregistrat cu nr.
99446/16.09.2026 privind prețul energiei termice.

Dna Blanaru intervine şi întreabă câți bani s-au dat la Comunale, respectiv 3 672 304 lei.

DI Primar intervine și precizează că în perioada viitoare vom efectua un audit extern.

Întrucât nu mai sunt discuţii, preşedintele de şedinţă supune la vot proiectul.
Din totalul de 12 consilieri prezenți, 7 au votat pentru.

Se trece la punctul 2 de pe ordinea de zi si anume proiectul de hotărâre privind bugetul.
D-ul Director răspunde că nu este un studiu făcut.
Dl Mutrescu afirmă că locuiește pe str. A, nr. 1, bl. 2, ap. 3 și că nu e de acord.
""" + "x" * 3000


def test_extrage():
    X = I.extrage(PV)
    cine = [(x["punct"], x["cine"], x["rol"]) for x in X]
    assert cine == [(None, "Jecalo", None), (1, "Blanaru", None), (1, "Loghin Bogdan-Andrei", "primar"),
                    (2, "Director (nenumit în procesul-verbal)", "functie"), (2, "Mutrescu", None)]
    assert X[0]["tipuri"] == ["conflict"]
    assert "intrebare" in X[1]["tipuri"] and "cifre" in X[1]["tipuri"] and "termoficare" in X[1]["teme"] and "comunale" in X[1]["teme"]
    assert "angajament" in X[2]["tipuri"] and "curte" in X[2]["teme"]
    assert "ap. 3" not in X[4]["text"]


def test_construieste(tmp_path):
    st = Store(str(tmp_path / "m.sqlite"))
    p = tmp_path / "pv.txt"
    p.write_text(PV, encoding="utf-8")
    _pseudo_post(st, -3, "pv", "https://x/", "PV")
    st.add_document("https://x/pv-sed-24.09.2026.pdf", -3, "site", "pv")
    st.db.execute("UPDATE documents SET text_path=? WHERE wp_id=-3", (str(p),))
    st.db.execute("INSERT INTO pv (wp_id, session_date) VALUES (-3, '2026-09-24')")
    st.db.commit()
    os.makedirs(tmp_path / "intern-date")
    json.dump({"consilieri": [{"id": "blanaru-daniela-persida", "nume": "Blanaru Persida-Daniela", "variante": [], "perioade": [["2024-10-01", "9999-12-31"]]}]},
              open(tmp_path / "intern-date" / "voturi.json", "w"))
    r = I.construieste(st, str(tmp_path))
    assert r == {"interventii": 5, "persoane": 5, "ani": 1}
    idx = json.load(open(tmp_path / "_intern" / "interventii-index.json", encoding="utf-8"))
    b = [p for p in idx["persoane"] if p["id"] == "blanaru-daniela-persida"][0]
    assert b["nume"] == "Blanaru Persida-Daniela" and b["rol"] == "consilier" and b["teme"]["termoficare"] == 1
    L = json.load(open(tmp_path / "_intern" / "interventii-2026.json", encoding="utf-8"))
    assert L[0][0] == "2026-09-24" and L[0][8] == "pv-sed-24.09.2026.pdf"
    # nimic în afara folderului intern
    assert not os.path.exists(tmp_path / "intern-date" / "interventii-index.json")
