import json
import os

from monitor_colector import cautare_text
from monitor_colector.ascunde import ascunde
from monitor_colector.collect import _pseudo_post
from monitor_colector.store import Store


def test_ascunde():
    t = ascunde("legitimat cu CI seria SV nr. 123456, CNP 1700101330011, domiciliat în Rădăuți, str. Bogdan Vodă, nr. 10, sc. D, et. 2, ap. 57, jud. Suceava cu 5 luni")
    assert "123456" not in t and "1700101330011" not in t and "Bogdan" not in t and "ap. 57" not in t
    assert t.endswith("[adresă] cu 5 luni")
    assert ascunde("Sediul: Str.1 MAI Nr.4-6 SUCEAVA") == "Sediul: Str.1 MAI Nr.4-6 SUCEAVA"


def test_dosar_intern(tmp_path):
    st = Store(str(tmp_path / "m.sqlite"))
    p = tmp_path / "t.txt"
    p.write_text("Hotărârea AGA nr. 7. Domnul X, CNP 1700101330011, domiciliat în Rădăuți, str. A, nr. 1, jud. Suceava. Termoficare.", encoding="utf-8")
    for sid, url in ((-5, "https://www.serviciicomunale.ro/a.pdf"), (-6, "http://serviciicomunale.ro/a.pdf")):
        _pseudo_post(st, sid, "comunale", "https://www.serviciicomunale.ro/x/", "Hotarari AGA 2025")
        st.add_document(url, sid, "comunale", "a")
        st.db.execute("UPDATE documents SET text_path=? WHERE url=?", (str(p), url))
    st.db.commit()
    r = cautare_text.construieste_intern(st, str(tmp_path))
    assert r == {"documente": 1}   # aceeași adresă scrisă în două feluri: o singură dată
    d = json.load(open(os.path.join(tmp_path, "_intern", "dosar-intern.json"), encoding="utf-8"))["docs"][0]
    assert "1700101330011" not in d["text"] and "str. A" not in d["text"] and "Termoficare" in d["text"]
    assert d["fel"] == "comunale" and d["id"].startswith("sc-")


def test_formular_fara_cifre(tmp_path):
    from monitor_colector import documents
    eticheta = "F10 - SITUATIA ACTIVELOR, DATORIILOR SI CAPITALURILOR PROPRII Imobilizari necorporale F20 - CONTUL DE PROFIT " * 20
    assert documents.fara_cifre(eticheta)
    assert not documents.fara_cifre(eticheta + " 1.234.567 " * 300)
    assert not documents.fara_cifre("Hotărâre privind aprobarea regulamentului " * 50)
    st = Store(str(tmp_path / "m.sqlite"))
    p = tmp_path / "b.txt"; p.write_text(eticheta, encoding="utf-8")
    _pseudo_post(st, -9, "comunale", "https://x/", "Bilant")
    st.add_document("https://x/b.pdf", -9, "comunale", "b")
    st.db.execute("UPDATE documents SET text_path=?, local_path=?, text_layer=1 WHERE url=?", (str(p), str(tmp_path / "b.pdf"), "https://x/b.pdf"))
    assert documents.marcheaza_formulare(st) == 1
    assert st.db.execute("SELECT text_layer FROM documents").fetchone()[0] == 0
