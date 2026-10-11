"""Server HTTP local care imită API-ul WordPress al primăriei (pentru probe cap-coadă).

Rulare: python tests/fake_server.py 8765
Apoi:   MC_BASE_URL=http://127.0.0.1:8765 python -m monitor_colector tot
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fakes  # noqa: E402
from test_colector import make_scanned_pdf, make_text_pdf  # noqa: E402

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
BASE = f"http://127.0.0.1:{PORT}"
TMP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_srv")
os.makedirs(TMP, exist_ok=True)
TEXT_PDF = make_text_pdf(os.path.join(TMP, "t.pdf"))
make_scanned_pdf(os.path.join(TMP, "s.pdf"), "PROCES VERBAL\nSEDINTA ORDINARA 20.08.2026\nVOTURI PENTRU 17")
SCAN_PDF = open(os.path.join(TMP, "s.pdf"), "rb").read()


def rebase(obj):
    return json.loads(json.dumps(obj).replace(fakes.BASE, BASE))


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json", headers=None):
        b = body if isinstance(body, bytes) else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path.endswith("/categories"):
            return self.send(200, json.dumps(fakes.CATEGORIES), headers={"X-WP-TotalPages": "1"})
        if u.path.endswith("/posts"):
            r = fakes.FakeSession(per_page=int(q.get("per_page", 100))).get(fakes.BASE + u.path, q)
            if r.status_code != 200:
                return self.send(r.status_code, r.text)
            return self.send(200, json.dumps(rebase(r.json())), headers=r.headers)
        if u.path.endswith(".pdf"):
            return self.send(200, SCAN_PDF if "/pv" in u.path.lower() else TEXT_PDF, "application/pdf")
        return self.send(404, "{}")


if __name__ == "__main__":
    print(f"server simulat pe {BASE}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
