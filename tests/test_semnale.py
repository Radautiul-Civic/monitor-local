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
