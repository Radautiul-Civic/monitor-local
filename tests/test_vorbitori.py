from monitor_colector import vorbitori


def test_curata():
    rez = {"interventii": [
        {"de_la": "0:01:00", "pana_la": "0:02:30", "cine": "Tătar Nistor", "sigur": "sigur", "dovada": "se prezintă"},
        {"de_la": "0:00:00", "pana_la": "0:01:10", "cine": "null", "sigur": "sigur"},           # se suprapune cu următoarea; fără nume => probabil
        {"de_la": "0:02:20", "pana_la": "0:02:00", "cine": "Blănaru Daniela Persida", "sigur": "probabil"},
        {"de_la": "x", "pana_la": "0:03:00", "cine": "Cineva"},
        {"de_la": "5:00:00", "pana_la": "5:01:00", "cine": "Dincolo de înregistrare"}]}
    I = vorbitori.curata(rez, durata=600)
    assert [x["cine"] for x in I] == [None, "Tătar Nistor", "Blănaru Daniela Persida"]
    assert I[0]["sigur"] == "probabil" and I[1]["sigur"] == "sigur"
    assert all(I[i]["b"] < I[i + 1]["a"] for i in range(len(I) - 1))
    assert vorbitori.vorbitor_la(I, 90)["cine"] == "Tătar Nistor"
