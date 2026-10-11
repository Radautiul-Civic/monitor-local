"""Server WordPress simulat, construit din structura reală observată la 10.10.2026."""
import json
from urllib.parse import urlparse

BASE = "https://primariaradauti.ro"
UP = BASE + "/wp-content/uploads"


def file_block(url, label):
    """Blocul „wp-block-file” exact cum apare în conținutul postărilor reale."""
    return (f'<div data-wp-interactive="core/file" class="wp-block-file"><object data-wp-bind--hidden="!state.hasPdfPreview" '
            f'hidden class="wp-block-file__embed" data="{url}" type="application/pdf" style="width:100%;height:600px" '
            f'aria-label="Înglobare pentru {label}."></object><a id="wp-block-file--media-x" href="{url}">{label}</a>'
            f'<a href="{url}" class="wp-block-file__button wp-element-button" download aria-describedby="x">Descarcă</a></div>')


def post(pid, date, title, content, slug, cats, modified=None):
    return {"id": pid, "date": date, "date_gmt": date, "modified": modified or date, "modified_gmt": modified or date,
            "slug": slug, "link": f"{BASE}/{slug}/", "title": {"rendered": title},
            "content": {"rendered": content}, "categories": cats}


CATEGORIES = [
    {"id": 17, "slug": "hotarari-hcl", "name": "Hotărâri HCL", "count": 3},
    {"id": 27, "slug": "pv-sedinte-cl", "name": "PV Sedinte CL", "count": 3},
    {"id": 86, "slug": "certificate-de-urbanism", "name": "Certificate de urbanism", "count": 1},
    {"id": 87, "slug": "autorizatii-de-constructie-desfiintare", "name": "Autorizatii", "count": 1},
    {"id": 46, "slug": "contractele-achizitiilor-publice-cu-valoarea-de-peste-5000", "name": "Contracte", "count": 1},
    {"id": 7, "slug": "anunturi", "name": "Anunțuri", "count": 151},
]

POSTS = {
    17: [
        post(9001, "2026-08-21T09:04:32", "Hotărâre privind rectificarea bugetului de venituri și cheltuieli al Municipiului Rădăuți pentru anul 2026 și modificarea și completarea listei de investiții",
             file_block(f"{UP}/2026/08/HCL-nr.-145-din-06.08.2026.pdf", "HCL nr. 145 din 06.08.2026"), "hcl-145-2026", [17]),
        post(9002, "2026-09-15T10:00:00", "Hotărâre privind aprobarea Planului Urbanistic General (P.U.G.) al Municipiului Rădăuți și a Regulamentului Local de Urbanism (R.L.U.) aferent acestuia",
             "<p>Documentatia completa privind Planul Urbanistic General (PUG) ... "
             '<a href="https://drive.google.com/drive/folders/10nwv07fjhmNGw_PSVVkfOWURSrk5YIlV">link</a></p>'
             + file_block(f"{UP}/2026/09/HCL-nr.-156-din-26.08.2026.pdf", "HCL nr. 156 din 26.08.2026"), "hcl-156-2026", [17]),
        post(9003, "2026-10-01T08:00:00", "Hotărâre privind rectificarea bugetului de venituri și cheltuieli al Municipiului Rădăuți pentru anul 2026 și modificarea și completarea listelor de investiții",
             file_block(f"{UP}/2026/10/HCL-nr.-160-din-22.09.2026.pdf", "HCL nr. 160 din 22.09.2026"), "hcl-160-2026", [17]),
    ],
    27: [
        post(9101, "2026-09-29T09:09:11", "Proces verbal ședință ordinară din 20.08.2026",
             file_block(f"{UP}/2026/09/pv-20.08.2026.pdf", "pv 20.08.2026"), "proces-verbal-sedinta-ordinara-din-20-08-2026", [27]),
        post(9102, "2026-10-01T09:00:00", "Proces verbal afișare HCL 157 &#8211; 160 ședință ordinară din 20.08.2026",
             file_block(f"{UP}/2026/10/pv-afisare.pdf", "pv afisare"), "pv-afisare-hcl-157-160-din-2026", [27]),
        post(9103, "2026-04-20T09:00:00", "Proces verbal ședință extraordinară din data de 03.04.2026 ora 13:30",
             file_block(f"{UP}/2026/04/pv-03.04.2026.pdf", "pv 03.04.2026"), "pv-03-04-2026", [27]),
    ],
    86: [post(9201, "2026-07-08T09:21:13", "Certificate de urbanism emise în perioada 05.01.2026 &#8211; 30.06.2026",
              file_block(f"{UP}/2026/07/Registrul-CU-05-01-30-06-26.pdf", "Registrul CU 05 01 &#8211; 30 06 26"),
              "certificate-de-urbanism-emise-in-perioada-05-01-30-06-2026", [86])],
    87: [post(9301, "2026-07-08T09:30:00", "Autorizații de construire / desființare emise în perioada 05.01.2026 &#8211; 30.06.2026",
              file_block(f"{UP}/2026/07/Registrul-AC-05-01-30-06-26.pdf", "Registrul AC"),
              "autorizatii-de-construire-emise-in-perioada-05-01-30-06-2026", [87])],
    46: [post(9401, "2025-12-29T10:00:00", "Execuție lucrări privind realizarea obiectivului de investiții „Amenajare teren fotbal",
              file_block(f"{UP}/2026/01/Contract-nr.-19809.pdf", "Contract nr. 19809"), "contract-19809", [46], "2026-01-08T10:00:00")],
}


class FakeResponse:
    def __init__(self, status=200, data=None, headers=None, text=None, body=b""):
        self.status_code = status
        self._data = data
        self.headers = headers or {}
        self.text = text if text is not None else json.dumps(data or "")
        self._body = body
        self.encoding = "utf-8"

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def iter_content(self, n):
        for i in range(0, len(self._body), n):
            yield self._body[i:i + n]

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeSession:
    """Răspunde ca API-ul WordPress: paginare, X-WP-TotalPages, 400 după ultima pagină."""

    def __init__(self, posts=POSTS, categories=CATEGORIES, per_page=2, files=None, html_pages=None):
        self.posts, self.cats, self.per_page = posts, categories, per_page
        self.files = files or {}
        self.html_pages = html_pages or {}
        self.headers = {}
        self.calls = []

    def get(self, url, params=None, timeout=None, stream=False):
        params = params or {}
        self.calls.append((url, dict(params)))
        path = urlparse(url).path
        if path.endswith("/wp-json/wp/v2/categories"):
            return FakeResponse(data=self.cats, headers={"X-WP-TotalPages": "1"})
        if path.endswith("/wp-json/wp/v2/posts"):
            items = list(self.posts.get(int(params["categories"]), []))
            if params.get("modified_after"):
                items = [p for p in items if p["modified"] > params["modified_after"]]
            items.sort(key=lambda p: p["modified"])
            pages = max(1, -(-len(items) // self.per_page))
            page = int(params.get("page", 1))
            if page > pages:
                return FakeResponse(400, text='{"code":"rest_post_invalid_page_number"}')
            chunk = items[(page - 1) * self.per_page: page * self.per_page]
            return FakeResponse(data=chunk, headers={"X-WP-TotalPages": str(pages)})
        if url in self.files:
            return FakeResponse(body=self.files[url], headers={"Last-Modified": "Wed, 01 Oct 2026 08:00:00 GMT"})
        if path in self.html_pages:
            return FakeResponse(text=self.html_pages[path])
        return FakeResponse(404, text="not found")


# Fragment real din pagina arhivei 2023 (structură și linkuri păstrate, listă scurtată).
ARCHIVE_2023 = """
<ol>
<li><a href="https://arhiva.primariaradauti.ro/wp-content/uploads/2023/01/hcl-nr.-1-din-05.01.2023.pdf">Hotarare nr. 1 privind aprobarea Proiectului tehnic de execuție</a></li>
<li><a href="https://arhiva.primariaradauti.ro/wp-content/uploads/2023/02/hcl-nr.-15-din-31.01.2023.pdf">Hotarare nr. 15 de modificare a HCL nr. 268/27.11.2023 privind predarea către Ministerul Dezvoltării</a></li>
<li><a href="https://arhiva.primariaradauti.ro/wp-content/uploads/2023/05/hcl-nr.-22-din-31.01.2023-blurat.pdf">Hotarare nr. 22 pentru acordarea de facilităţi fiscale pentru contribuabili persoane fizice şi juridice-</a></li>
<li><a href="https://arhiva.primariaradauti.ro/wp-content/uploads/2023/09/hcl-208-din-30.0802023.pdf">Hotarare nr. 208 din 30.08.2023privind aprobarea indicatorilor tehnico-economici actualizaţi</a></li>
<li><a href="https://arhiva.primariaradauti.ro/wp-content/uploads/2023/12/hcl-301-din-05.12.2023.pdf"><strong><em>HCL nr. 288 din 27.11.2023 privind acordarea mandatului special Asociației Județene pentru Apă și Canalizare Suceava</em></strong></a></li>
<li><a href="https://arhiva.primariaradauti.ro/wp-content/uploads/2023/11/hcl-nr-254-din-31.10.2023.pdf">Hotarare nr 254 din 31.10.2023 privind modificarea şi completarea HCL nr. 252/27.10.2022</a></li>
</ol>
<a href="https://arhiva.primariaradauti.ro/radauti/prezentare-radauti/">Prezentare Rădăuți</a>
"""
