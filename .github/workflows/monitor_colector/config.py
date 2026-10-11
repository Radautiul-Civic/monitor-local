"""Configurația colectorului. Valorile pot fi suprascrise prin variabile de mediu."""
import os

BASE_URL = os.environ.get("MC_BASE_URL", "https://primariaradauti.ro")
ARCHIVE_URL = os.environ.get("MC_ARCHIVE_URL", "https://arhiva.primariaradauti.ro")
DATA_DIR = os.environ.get("MC_DATA_DIR", "data")
DB_PATH = os.environ.get("MC_DB_PATH", os.path.join(DATA_DIR, "monitor.sqlite"))

USER_AGENT = os.environ.get(
    "MC_USER_AGENT",
    "MonitorLocal/0.1 (Asociatia Radautiul Civic) (+https://monitor.radautiulcivic.ro; colectare date publice)",
)
REQUEST_DELAY = float(os.environ.get("MC_DELAY", "1.0"))   # secunde între cereri
TIMEOUT = float(os.environ.get("MC_TIMEOUT", "30"))
OCR_LANG = os.environ.get("MC_OCR_LANG", "ron")
CUI_UAT = "4244148"

# Sursele colectate din API-ul WordPress: tip intern -> slug-ul categoriei.
# ID-urile observate la 10.10.2026 sunt doar informative; colectorul le rezolvă după slug.
CATEGORIES = {
    "hcl": "hotarari-hcl",                         # id 17, 461 postări
    "pv": "pv-sedinte-cl",                         # id 27, 67 postări
    "cu": "certificate-de-urbanism",               # id 86
    "ac": "autorizatii-de-constructie-desfiintare",  # id 87
    "contracte": "contractele-achizitiilor-publice-cu-valoarea-de-peste-5000",  # id 46
    "buget": "buget-pe-surse-financiare",          # id 40
    "bilanturi": "bilanturile-contabile-trimestriale",  # id 51
}

# Arhiva HCL 2013-2024 de pe site-ul vechi (din registrul HCL, 10.10.2026).
# Linkul „2022” din registru trimite greșit la 2021; aici e pagina 2022 de verificat la prima rulare.
ARCHIVE_HCL_PAGES = {
    2013: "/monitorul-oficial-local/hotarari-cl/anul-2013/",
    2014: "/monitorul-oficial-local/hotarari-cl/anul-2014/",
    2015: "/monitorul-oficial-local/hotarari-cl/anul-2015/",
    2016: "/monitorul-oficial-local/hotarari-cl/anul-2016/",
    2017: "/monitorul-oficial-local/hotarari-cl/anul-2017/",
    2018: "/monitorul-oficial-local/hotarari-cl/anul-2018/",
    2019: "/monitorul-oficial-local/hotarari-cl/hotarari-adoptate-in-anul-2019/",
    2020: "/monitorul-oficial-local/hotarari-cl/hotarari-adoptate-in-anul-2020/",
    2021: "/monitorul-oficial-local/hotarari-cl/hotarari-adoptate-in-anul-2021/",
    2022: "/monitorul-oficial-local/hotarari-cl/hotarari-adoptate-in-anul-2022/",
    2023: "/monitorul-oficial-local/hotarari-cl/hotarari-adoptate-in-anul-2023/",
    2024: "/monitorul-oficial-local-hotarari-cl-hotarari-adoptate-in-anul-2024/",
}

DOC_EXTENSIONS = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".odt", ".ods", ".zip")
