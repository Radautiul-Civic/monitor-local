import json
from datetime import date

from monitor_colector import semnale


def _scrie(d, nume, obj):
    (d / nume).write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


def test_normativ():
    assert semnale.normativ("Hotărâre privind stabilirea impozitelor și taxelor locale pentru anul 2027")
    assert semnale.normativ("Hotărâre privind aprobarea Regulamentului de organizare și funcționare a parcărilor de reședință")
    assert not semnale.normativ("Hotărâre privind aprobarea regulamentelor de organizare şi funcţionare pentru: Căminul pentru persoane vârstnice")
    assert not semnale.normativ("Hotărâre privind rectificarea bugetului local")
    assert not semnale.normativ("Hotărâre privind aprobarea Planului Urbanistic Zonal (P.U.Z) şi a Regulamentului Local de Urbanism")


def test_semnale(tmp_path):
    _scrie(tmp_path, "liste.json", {
        "hcl": [
            {"an": 2026, "nr": 10, "data": "2026-03-20", "titlu": "Hotărâre privind stabilirea taxelor locale pentru anul 2027", "postat": "2026-03-25", "sursa": "site"},
            {"an": 2026, "nr": 11, "data": "2026-03-20", "titlu": "Hotărâre privind aprobarea tarifelor la apă", "postat": "2026-05-25", "sursa": "site"},
            {"an": 2026, "nr": 12, "data": "2026-03-20", "titlu": "Hotărâre privind aprobarea regulamentului cimitirului", "postat": "2026-03-21", "sursa": "site"}],
        "proiecte": [{"titlu": "Anunț - Proiect de hotărâre privind stabilirea taxelor locale pentru anul 2027", "postat": "2026-03-10"},
                     {"titlu": "Anunț - Proiect privind aprobarea regulamentului cimitirului", "postat": "2026-01-10"},
                     {"titlu": "Anunț - Proiect privind stabilirea taxelor locale pentru anul 2026", "postat": "2026-01-02"}],
        "pv": [{"data": "2026-03-20", "tip": "ordinara"}]})
    _scrie(tmp_path, "sicap-explorer.json", {"inst": [[1, "Municipiul Radauti", "4244148", "x"]], "furn": [["1", "FIRMA SRL"]], "cpv": ["30197644-2 - Hartie"],
                                             "da": [[i, 0, f"2026-0{i}-01", 0, 0, 100000.0, 20000, "hartie", f"DA{i}", 0, 0, 1] for i in range(1, 4)] +
                                                   [[9, 0, "2026-05-01", 0, 0, 260000.0, 52000, "hartie", "DA9", 0, 0, 1]]})
    r = semnale.calculeaza(str(tmp_path), date(2026, 11, 24))
    c = {x["hcl"]["nr"]: x for x in r["consultare"]}
    assert c[10]["fel"] == "consultare_scurta" and c[10]["zile"] == 10   # anunțul din același an, nu cel pentru 2026
    assert c[11]["fel"] == "fara_anunt"
    assert 12 not in c   # anunț la peste 30 de zile
    assert [x["hcl"]["nr"] for x in r["publicare"]] == [11]
    fel = sorted(x["fel"] for x in r["achizitii"])
    assert fel == ["fragmentare", "sub_prag"]
    i26 = [x for x in r["indice"] if x["an"] == "2026"][0]
    assert i26["componente"]["achizitii"] == 90 and i26["detalii"]["normative"] == 3


def test_calendar_ics():
    from monitor_colector import cetateni
    sed = {"urmatoare": [{"data": "2026-11-27", "ora": "10:00", "tip": "ordinara", "pagina": "https://primariaradauti.ro/x/",
                          "ordinea_de_zi": [{"nr": 1, "text": "Proiect privind taxele, impozitele; și altele " * 5}]}],
           "recente": [{"data": "2026-11-24", "ora": None, "tip": "extraordinara_de_indata", "ordinea_de_zi": []}],
           "consultare": [{"titlu": "Anunț", "obiect": "Taxe 2027", "nr": "99582", "termen": "2026-11-30", "pagina": "https://primariaradauti.ro/a/", "email": "x@primariaradauti.ro"}]}
    t = cetateni.ics(sed, date(2026, 11, 24))
    linii = t.split("\r\n")
    assert t.startswith("BEGIN:VCALENDAR") and t.endswith("END:VCALENDAR\r\n")
    assert all(len(l.encode("utf-8")) <= 75 for l in linii)
    assert t.count("BEGIN:VEVENT") == 3
    assert "DTSTART;TZID=Europe/Bucharest:20261127T100000" in t and "DTSTART;VALUE=DATE:20261124" in t
    assert "taxele\\, impozitele\;" in t.replace("\r\n ", "")


def test_diferente_si_modificate(tmp_path):
    from monitor_colector.store import Store
    st = Store(str(tmp_path / "m.sqlite"))
    db = st.db
    (tmp_path / "p.txt").write_text("Proiect de hotărâre ... HOTĂRĂȘTE: Art. 1 Se aprobă suma de 1.000.000 lei pentru drumuri. Inițiator, primar", encoding="utf-8")
    (tmp_path / "h.txt").write_text("Hotărâre ... HOTĂRĂȘTE: Art. 1 Se aprobă suma de 1.250.000 lei pentru drumuri. Președinte de ședință", encoding="utf-8")
    db.execute("INSERT INTO posts (wp_id, source, title, date, link) VALUES (1, 'proiecte', 'Anunț - Proiect privind aprobarea sumei pentru drumurile municipale', '2026-03-01', 'p')")
    db.execute("INSERT INTO posts (wp_id, source, title, date, link) VALUES (2, 'hcl', 'HCL 5', '2026-03-25', 'h')")
    db.execute("INSERT INTO documents (url, wp_id, text_path) VALUES ('p.pdf', 1, ?)", (str(tmp_path / "p.txt"),))
    db.execute("INSERT INTO documents (url, wp_id, text_path) VALUES ('h.pdf', 2, ?)", (str(tmp_path / "h.txt"),))
    db.execute("INSERT INTO hcl (year, number, adoption_date, title, wp_id, pdf_url) VALUES (2026, 5, '2026-03-20', 'Hotărâre privind aprobarea sumei pentru drumurile municipale', 2, 'h.pdf')")
    for h, z in (("a", "2026-03-25"), ("b", "2026-04-02")):
        db.execute("INSERT INTO post_versions (wp_id, modified, content_hash, title, seen_at) VALUES (2, ?, ?, 'HCL 5', ?)", (z, h, z))
    d = semnale.diferente_proiect_hotarare(db)
    assert len(d) == 1 and d[0]["noi"] == [(1250000, "lei")] and d[0]["scoase"] == [(1000000, "lei")]
    m = semnale.postari_modificate(db)
    assert len(m) == 1 and m[0]["versiuni"] == 2 and m[0]["ultima"] == "2026-04-02"
