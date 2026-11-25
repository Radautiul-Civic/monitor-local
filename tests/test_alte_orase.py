from monitor_colector import alte_orase as A


def test_linkuri_si_date():
    html = ('<h3>2026</h3><a href="/wp-content/uploads/2026/04/HCL-28-din-25-februarie-2026.pdf">HOTĂRÂREA NR. 28</a>'
            '<h3>Procese Verbale Ședințe de Consiliu Local</h3><a href="/wp-content/uploads/2026/03/PV-25.02.2026.pdf">PV 25.02.2026</a>')
    L = A.linkuri(html, "https://primariavatradornei.ro/consiliu-local/")
    assert L[0] == ("https://primariavatradornei.ro/wp-content/uploads/2026/04/HCL-28-din-25-februarie-2026.pdf", "HOTĂRÂREA NR. 28", "2026")
    assert A.data_din("HCL-28-din-25-februarie-2026.pdf") == "2026-02-25"
    assert A.data_din("ședința-consiliului-local-din-data-de-29-10-2026") == "2026-10-29"


def test_vatradornei(monkeypatch):
    html = ('<h3>2026</h3><a href="/wp-content/uploads/2026/04/HCL-28-din-25-februarie-2026.pdf">HOTĂRÂREA NR. 28</a>'
            '<h3>Procese Verbale Ședințe de Consiliu Local</h3><a href="/wp-content/uploads/2026/03/PV-25.02.2026.pdf">Proces verbal 25.02.2026</a>')

    class S:
        def html(self, url):
            return html
    D = A.vatradornei(S())
    assert D[0]["sursa"] == "hcl" and D[0]["nr"] == 28 and D[0]["an"] == 2026 and D[0]["data"] == "2026-02-25"
    assert D[1]["sursa"] == "pv" and D[1]["data"] == "2026-02-25"


def test_campulung():
    idx = '<a href="/consiliul-local/sedinte/ședința-consiliului-local-din-data-de-29-10-2026">Mai mult</a>'
    sed = ('<h3>Documente asociate</h3><a href="/files/infoDispPrimar/disp_ordinara-554_-oct-2026.doc">Ordinea de zi a ședinței</a>'
           '<a href="/files/infoSedinte/pv_29_10_ORD.docx">Procesul verbal al ședinței</a><a href="/files/infoHCL/hcl_146.doc">DESCARCĂ</a>'
           '<a href="/files/infoHCL/Anexa_2026.doc">Anexa</a>')

    class S:
        def html(self, url):
            return idx if "?an=" in url else sed
    D = A.campulung(S(), ani=[2026])
    f = {d["sursa"]: d for d in D}
    assert f["hcl"]["nr"] == 146 and f["hcl"]["data"] == "2026-10-29" and f["pv"]["data"] == "2026-10-29"
    assert "dispozitii" in f and "hcl_anexe" in f
