"""Cititorul site-ului Servicii Comunale: articole, pagini și fișierele nelegate din articole, fără dubluri."""
import json
import os

from monitor_colector import comunale
from monitor_colector.store import Store


class _R:
    def __init__(self, j):
        self._j, self.headers = j, {"X-WP-TotalPages": "1"}

    def json(self):
        return self._j


class _Client:
    def categories(self):
        return [{"id": 11, "name": "Rapoarte"}]

    def _get(self, cale, params):
        if params["page"] > 1:
            return None
        if cale.endswith("posts"):
            return _R([{"id": 5, "date": "2026-06-22T10:00:00", "link": "https://www.serviciicomunale.ro/2026/06/22/bilant-2025/",
                        "title": {"rendered": "Bilant 2025"}, "categories": [11],
                        "content": {"rendered": '<p>Bilanțul</p><a href="/wp-content/uploads/2026/06/Bilant-2025.pdf">Bilant 2025</a>'}}])
        if cale.endswith("pages"):
            return _R([{"id": 5, "date": "2020-01-01T00:00:00", "link": "https://www.serviciicomunale.ro/termoficare/",
                        "title": {"rendered": "Termoficare"}, "content": {"rendered": "<p>Tarife</p>"}}])
        return _R([{"id": 9, "date": "2025-01-01T00:00:00", "title": {"rendered": "Situatiile de risc"},
                    "source_url": "https://www.serviciicomunale.ro/wp-content/uploads/2025/01/risc.pdf"},
                   {"id": 10, "source_url": "https://www.serviciicomunale.ro/wp-content/uploads/2026/06/Bilant-2025.pdf"},
                   {"id": 11, "source_url": "https://www.serviciicomunale.ro/wp-content/uploads/poza.jpg"}])


def test_colecteaza(tmp_path):
    st = Store(str(tmp_path / "m.sqlite"))
    s1 = comunale.colecteaza(st, client=_Client())
    s2 = comunale.colecteaza(st, client=_Client())
    assert s1 == {"articole": 1, "pagini": 1, "documente": 1, "media": 2, "media_noi": 1}
    assert s2["media_noi"] == 0
    urls = sorted(r[0] for r in st.db.execute("SELECT url FROM documents"))
    assert urls == ["https://www.serviciicomunale.ro/wp-content/uploads/2025/01/risc.pdf",
                    "https://www.serviciicomunale.ro/wp-content/uploads/2026/06/Bilant-2025.pdf"]
    # ID-urile WordPress ale societății nu intră peste ale primăriei
    assert all(r[0] < 0 for r in st.db.execute("SELECT wp_id FROM posts WHERE source='comunale'"))
    comunale.scrie_lista(st, str(tmp_path))
    L = json.load(open(os.path.join(tmp_path, "intern-date", "comunale-documente.json"), encoding="utf-8"))["articole"]
    assert [a["titlu"] for a in L] == ["Bilant 2025", "Situatiile de risc", "Termoficare"]
