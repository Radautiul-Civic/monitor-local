# Monitor local - colectorul de date

Colectează din surse publice actele și documentele Primăriei Municipiului Rădăuți (CUI 4244148) pentru Monitor local (monitor.radautiulcivic.ro) și calculează indicatorii de transparență.

Ce face acum:

- **HCL, procese-verbale, registre CU/AC, contracte, buget** - din API-ul public WordPress al site-ului primăriei (`/wp-json/wp/v2`), incremental, după data modificării.
- **HCL 2013-2024** - din paginile anuale ale arhivei (arhiva.primariaradauti.ro).
- **Documente** - descarcă PDF-urile, calculează amprenta SHA-256, detectează dacă sunt scanate și face OCR în limba română.
- **Istoric** - dacă primăria modifică o postare, versiunea veche rămâne în baza de date (`post_versions`).
- **Indicatori** - întârzierea publicării HCL și a PV-urilor, numere de HCL lipsă, erori de publicare (fișier greșit atașat), ședințe pe tipuri, vechimea registrelor de urbanism, zile de la ultimul contract publicat.

Ce nu face încă: SICAP, portal.just.ro, extragerea voturilor din textul PV-urilor (după ce vedem OCR-ul pe PV-uri reale).

## Instalare pe server (Debian / Ubuntu)

```bash
sudo apt install python3 python3-venv poppler-utils tesseract-ocr tesseract-ocr-ron
git clone <repo> monitor-local && cd monitor-local
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
```

## Utilizare

```bash
python -m monitor_colector categorii        # ce categorii are site-ul (id, nr. postări, slug)
python -m monitor_colector colecteaza       # postările noi/modificate din API
python -m monitor_colector colecteaza --tot # colectare completă, de la zero
python -m monitor_colector arhiva           # HCL 2013-2024 (sau: arhiva 2023 2024)
python -m monitor_colector descarca         # PDF-urile noi (--max 50 pentru o probă)
python -m monitor_colector ocr              # OCR pe PDF-urile scanate
python -m monitor_colector indicatori       # -> data/indicatori.json și data/indicatori.md
python -m monitor_colector tot              # colecteaza + descarca + ocr + indicatori
```

Prima rulare recomandată: `colecteaza --tot`, apoi `arhiva`, apoi `descarca --max 30` și `ocr --max 3` (proba de OCR pe PV-uri), apoi `indicatori`.

Rulare zilnică (cron, 06:15):

```
15 6 * * * cd /opt/monitor-local && .venv/bin/python -m monitor_colector tot >> data/cron.log 2>&1
```

## Rulare pe GitHub Actions și publicare pe hosting

Fluxul `.github/workflows/colectare.yml` rulează zilnic (și la cerere): colectează postările noi, descarcă documente în tranșe (400/zi), face OCR în tranșe (60/zi, limba română), calculează indicatorii și urcă prin FTPS pagina din `site/` și `data/indicatori.json` pe hosting. Baza de date și documentele nu se urcă pe hosting; se păstrează între rulări în cache-ul GitHub.

Secrete necesare (Settings > Secrets and variables > Actions): `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD`. Opțional `FTP_PORT` (21) și `FTP_DIR`.

Prima rulare: Actions > Colectare zilnică > Run workflow, cu „Colectare completă" bifat.

## Configurare

Prin variabile de mediu (vezi `monitor_colector/config.py`):

| Variabilă | Implicit | Rol |
|---|---|---|
| `MC_BASE_URL` | https://primariaradauti.ro | site-ul primăriei |
| `MC_ARCHIVE_URL` | https://arhiva.primariaradauti.ro | site-ul vechi |
| `MC_DATA_DIR` | data | unde se salvează baza și documentele |
| `MC_DELAY` | 1.0 | secunde între cereri (politețe față de server) |
| `MC_OCR_LANG` | ron | limba Tesseract |

Sursele colectate sunt în `CATEGORIES` (tip intern -> slug de categorie). O sursă nouă se adaugă după ce `categorii` arată slug-ul ei.

## Date

Baza SQLite `data/monitor.sqlite`:

- `posts`, `post_versions` - postările brute și istoricul modificărilor
- `documents` - fiecare fișier: URL, SHA-256, dată descărcare, scanat sau nu, calea textului
- `hcl` - (an, număr, data adoptării, data postării, PDF, anonimizat, probleme)
- `pv`, `registries` - procese-verbale și registre CU/AC
- `runs` - jurnalul rulărilor

Documentele: `data/docs/<domeniu>/<cale>`, textul alături, cu extensia `.txt`.

## Ce am observat la construire (10.10.2026)

- Categoria HCL are id 17 și 461 de postări; categoria PV are id 27 și 67 de postări.
- Registrul HCL de pe site e în urmă față de categorie (până la HCL 145, deși există HCL 160). Colectorul folosește categoria.
- PV-urile de ședință sunt PDF-uri scanate, fără text: OCR-ul e obligatoriu.
- Linkul „Anul 2022” din arhivă trimite la pagina 2021: pagina HCL 2022 nu există pe arhivă, deci 2022 se completează din alte surse (registrul HCL, procese-verbale de publicare).
- Arhiva are trei formate de listă (2013-2015: „204. Hotarare ...”, 2016-2018: fișiere scanate SKM_*.pdf, 2024: numărul doar în numele fișierului); parserul le tratează pe toate.
- În arhiva 2023, HCL 288 deschide fișierul HCL 301. Colectorul semnalează automat astfel de cazuri (`fisier_alt_numar`).

## Teste

```bash
python -m unittest discover -s tests -v
```

Testele folosesc structuri reale observate pe site (titluri, nume de fișiere, HTML-ul arhivei) și un server WordPress simulat. Pentru o probă cap-coadă fără acces la site:

```bash
python tests/fake_server.py 8765 &
MC_BASE_URL=http://127.0.0.1:8765 MC_DATA_DIR=/tmp/proba MC_DELAY=0 MC_OCR_LANG=eng python -m monitor_colector tot
```

## Reguli

- Colectăm doar date publicate de autoritate, cu pauză între cereri și un User-Agent care identifică proiectul.
- Indicatorii sunt observații datate, nu acuzații: fiecare duce la documentul-sursă.
- Datele cu caracter personal din documente (nume de persoane fizice din HCL individuale sau registre de urbanism) nu se republică în platformă.
