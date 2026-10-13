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
    "proiecte": "proiecte-hcl",                    # id 26, 141 postări
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
    # 2022: pagina nu există pe arhivă (linkul „Anul 2022” trimite la 2021)
    2023: "/monitorul-oficial-local/hotarari-cl/hotarari-adoptate-in-anul-2023/",
    2024: "/monitorul-oficial-local-hotarari-cl-hotarari-adoptate-in-anul-2024/",
    2025: "/monitorul-oficial-local/hotarari-cl/",
}

DOC_EXTENSIONS = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".odt", ".ods", ".zip")

# Verificări manuale ale problemelor semnalate automat (an/număr -> rezultat).
# "fals": semnalarea nu e o problemă reală și nu se afișează.
# "confirmat": problema e reală și se afișează public, cu nota de mai jos.
VERIFICARI_HCL = {
    "2014/188": {"stare": "fals", "nota": "Doar numele fișierului are o greșeală de tastare (1881); documentul atașat e HCL 188/2014."},
    "2023/288": {"stare": "confirmat", "nota": "La HCL 288/2023 este atașat documentul hotărârii nr. 301/2023."},
}

# Alte liste din arhiva site-ului vechi (o singură pagină fiecare, PDF-uri grupate pe ani).
ARCHIVE_PV_PAGE = "/consiliul-local/sedinte/procese-verbale-ale-sedintelor-de-cl/"
ARCHIVE_REGISTRE = {
    "cu": "/servicii-cetateni/certificate-de-urbanism/",
    "ac": "/servicii-cetateni/autorizatii-de-construire/",
}

# SICAP: instituțiile se găsesc automat după „Rădăuți” în nume; aici se adaugă CUI-uri ale
# instituțiilor care nu au orașul în denumire (ex. o școală numită doar după patron).
SICAP_CUI_EXTRA = (
    "2563140",   # SERVICII COMUNALE S.A. (societatea municipiului; în SICAP numele nu conține „Rădăuți”)
)
# Termeni de căutare suplimentari în lista autorităților SICAP: pentru CUI-urile de mai sus și pentru
# instituții din oraș care s-ar putea să nu aibă „Rădăuți” în nume (nume unice, ca să nu aducă jumătate de țară).
# Cele găsite, dar neincluse, apar pe pagina internă; de acolo li se adaugă CUI-ul în SICAP_CUI_EXTRA.
SICAP_TERMENI_EXTRA = ("SERVICII COMUNALE", "HURMUZACHI", "MOTRESCU", "FLONDOR", "IONET", "POLITIA LOCALA RADAUTI",
                       "POLITIEI LOCALE RADAUTI", "CASA MUNICIPALA DE CULTURA", "MUZEUL DE ETNOGRAFIE RADAUTI",
                       "ZOOLOGIC RADAUTI", "GALERIILE DE ARTA RADAUTI")

# Soldul datoriei publice a municipiului (cât mai are de rambursat), din documentele publice ale primăriei:
# anexa „Situația datoriei publice locale” / „Gradul de îndatorare” de la aprobarea bugetului, registrul
# datoriei publice etc. Execuția bugetară arată doar banii trași, ratele și dobânzile, nu soldul.
# Format: "AAAA-LL-ZZ": {"lei": suma, "sursa": "link sau HCL nr/an"}
DATORIE_SOLD = {
}

# Mandatele consiliului local (începutul aproximativ, după alegeri). Dacă procesele-verbale conțin ședința de
# constituire, data ei o înlocuiește automat. Se folosesc la profilurile consilierilor.
CONSILIU_MANDATE = {
    "2012-2016": "2012-06-25",
    "2016-2020": "2016-06-27",
    "2020-2024": "2020-10-26",
    "2024-2028": "2024-07-01",
}
