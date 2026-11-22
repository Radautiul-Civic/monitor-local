"""Fișierele din zona internă a hostingului (intern/, protejată cu parolă), citite și scrise prin FTPS.

Acolo stau, în afara repo-ului public: lista înregistrărilor video adăugate din panou (intern/date/video.json),
transcrierile (intern/transcrieri/), ciornele rezumatelor (intern/date/rezumate.json) și deciziile din panou
(intern/date/aprobari.json, scrise de intern/api.php).
"""
import ftplib
import io
import json
import os


class Intern:
    def __init__(self, host=None, user=None, pwd=None, base=None):
        self.host = host or os.environ.get("FTP_HOST")
        self.user = user or os.environ.get("FTP_USER")
        self.pwd = pwd or os.environ.get("FTP_PASSWORD")
        self.base = (base if base is not None else os.environ.get("FTP_DIR", "")).strip("/")
        self.ftp = None

    def __enter__(self):
        if not (self.host and self.user and self.pwd):
            raise RuntimeError("lipsesc FTP_HOST / FTP_USER / FTP_PASSWORD")
        self.ftp = ftplib.FTP_TLS()
        self.ftp.connect(self.host, int(os.environ.get("FTP_PORT", "21")), timeout=120)
        self.ftp.login(self.user, self.pwd)
        self.ftp.prot_p()
        return self

    def __exit__(self, *a):
        try:
            self.ftp.quit()
        except Exception:
            pass

    def _cale(self, p):
        return "/" + "/".join(x for x in (self.base, p.strip("/")) if x)

    def citeste(self, p):
        """Conținutul unui fișier (bytes) sau None dacă nu există."""
        buf = io.BytesIO()
        try:
            self.ftp.retrbinary("RETR " + self._cale(p), buf.write)
        except ftplib.error_perm:
            return None
        return buf.getvalue()

    def json(self, p, implicit=None):
        b = self.citeste(p)
        if b is None:
            return implicit
        try:
            return json.loads(b.decode("utf-8"))
        except ValueError:
            return implicit

    def _mkdirs(self, folder):
        self.ftp.cwd("/")
        for part in [x for x in folder.split("/") if x]:
            try:
                self.ftp.cwd(part)
            except ftplib.error_perm:
                self.ftp.mkd(part)
                self.ftp.cwd(part)

    def scrie(self, p, date_):
        cale = self._cale(p)
        self._mkdirs(os.path.dirname(cale))
        if isinstance(date_, (dict, list)):
            date_ = json.dumps(date_, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        elif isinstance(date_, str):
            date_ = date_.encode("utf-8")
        self.ftp.storbinary("STOR " + os.path.basename(cale), io.BytesIO(date_))

    def lista(self, folder):
        try:
            return [os.path.basename(x) for x in self.ftp.nlst(self._cale(folder))]
        except ftplib.error_perm:
            return []
