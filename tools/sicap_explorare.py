"""Explorarea API-ului public SICAP (e-licitatie.ro), înainte de a scrie colectorul.

Ce face (doar citire, date publice, o cerere la ~1,5 secunde):
  1. descarcă pagina publică și scripturile ei și extrage toate căile /api-pub/...,
     cu câte un fragment de cod în jurul fiecăreia (ca să vedem câmpurile cererilor);
  2. încearcă cererile de bază: achiziții directe, anunțuri de participare, de atribuire;
  3. caută autoritățile contractante care conțin „RADAUTI” în nume.

Rezultatele (JSON brut + rezumat.md) merg în folderul sicap-explorare/, pus ca artefact.
"""
import json
import os
import re
import sys
import time

import requests

BASE = "https://www.e-licitatie.ro"
OUT = "sicap-explorare"
UA = "MonitorLocal/0.1 (Asociatia Radautiul Civic) (+https://monitor.radautiulcivic.ro; colectare date publice)"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept": "application/json, text/plain, */*",
                  "Origin": BASE, "Referer": BASE + "/pub/direct-acquisitions/list/1",
                  "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json;charset=UTF-8"})
REZ = []


def save(name, data):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        if isinstance(data, (dict, list)):
            json.dump(data, f, ensure_ascii=False, indent=1)
        else:
            f.write(data)


def call(name, method, path, body=None, params=None):
    time.sleep(1.5)
    url = path if path.startswith("http") else BASE + path
    try:
        r = S.request(method, url, json=body, params=params, timeout=60)
        try:
            data = r.json()
        except ValueError:
            data = r.text[:20000]
        save(f"{name}.json", {"url": url, "method": method, "body": body, "params": params,
                              "status": r.status_code, "raspuns": data})
        n = None
        if isinstance(data, dict):
            n = data.get("total") or data.get("totalCount") or (len(data["items"]) if isinstance(data.get("items"), list) else None)
        elif isinstance(data, list):
            n = len(data)
        REZ.append(f"- {name}: HTTP {r.status_code}, {method} {path}" + (f", rezultate: {n}" if n is not None else ""))
        return data if r.ok else None
    except Exception as e:
        REZ.append(f"- {name}: EROARE {e}")
        return None


def main():
    os.makedirs(OUT, exist_ok=True)
    # 1. căile API din codul paginii
    paths, snippets = set(), {}
    try:
        html = S.get(BASE + "/pub", timeout=60, headers={"Accept": "text/html"}).text
        save("pagina.html", html)
        scripts = re.findall(r'<script[^>]+src="([^"]+\.js[^"]*)"', html)
        REZ.append(f"- pagina /pub: {len(html)} caractere, {len(scripts)} scripturi")
        for src in scripts[:25]:
            time.sleep(1)
            u = src if src.startswith("http") else BASE + "/" + src.lstrip("/")
            js = S.get(u, timeout=120, headers={"Accept": "*/*"}).text
            for m in re.finditer(r"api-pub/[A-Za-z0-9_/\-]+", js):
                p = m.group(0)
                paths.add(p)
                snippets.setdefault(p, []).append(js[max(0, m.start() - 400): m.end() + 600])
    except Exception as e:
        REZ.append(f"- eroare la citirea paginii: {e}")
    save("cai-api.json", sorted(paths))
    save("fragmente-cod.json", {p: v[:3] for p, v in snippets.items()})
    REZ.append(f"- căi /api-pub găsite în cod: {len(paths)}")

    # 2. cererile de bază, pe o fereastră scurtă
    d0, d1 = "2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z"
    call("achizitii-directe", "POST", "/api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/",
         {"pageSize": 5, "pageIndex": 0, "showOngoingDa": False, "cookieContext": None,
          "sysDirectAcquisitionStateId": None, "publicationDateStart": d0, "publicationDateEnd": d1})
    call("anunturi-participare", "POST", "/api-pub/NoticeCommon/GetCNoticeList/",
         {"sysNoticeTypeIds": [2, 6, 7, 17], "sortProperties": [], "pageSize": 5, "pageIndex": 0,
          "hasUnansweredQuestions": False, "startPublicationDate": d0, "endPublicationDate": "2026-09-10T00:00:00.000Z"})
    call("anunturi-atribuire", "POST", "/api-pub/NoticeCommon/GetCANoticeList/",
         {"sysNoticeTypeIds": [3, 13, 18], "sortProperties": [], "pageSize": 5, "pageIndex": 0,
          "startPublicationDate": d0, "endPublicationDate": "2026-09-10T00:00:00.000Z"})

    # 3. autoritățile contractante din Rădăuți: încercăm căile de tip listă/combo găsite în cod
    cand = [p for p in paths if re.search(r"(?i)(combo|authorit|entity|\bca)", p)]
    REZ.append(f"- căi candidate pentru autorități: {len(cand)}")
    for i, p in enumerate(sorted(cand)[:20]):
        call(f"autoritati-{i:02d}-get", "GET", "/" + p.strip("/") + "/", params={"filter": "RADAUTI", "pageSize": 100})
        call(f"autoritati-{i:02d}-post", "POST", "/" + p.strip("/") + "/", {"filter": "RADAUTI", "pageSize": 100, "pageIndex": 0})

    save("rezumat.md", "# Explorare SICAP\n\n" + "\n".join(REZ) + "\n")
    print("\n".join(REZ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
