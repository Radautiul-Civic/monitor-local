"""Căutare în textul documentelor (text extras sau recunoscut prin OCR), pentru pagina internă.

Se construiește în data/cautare/:
  docs.json        lista documentelor cu text: [id, fel, titlu, data, an, nr, link intern, pdf]
  idx/<xy>.json    indexul cuvintelor care încep cu „xy”: {cuvânt: [pozițiile documentelor în docs.json]},
                   pozițiile scrise ca diferențe față de precedenta (liste mai scurte)
  txt/<id>.txt     textul fiecărui document, pentru fragmentele afișate la rezultate
Pagina încarcă doar bucățile de index pentru cuvintele căutate, iar textul doar pentru rezultatele afișate.
Totul rămâne în zona internă (textele pot conține date personale).
"""
import hashlib
import json
import os
import re
import shutil
import unicodedata

from . import config

CUV = re.compile(r"[a-z0-9]{3,24}")
FARA_LITERE = re.compile(r"^[0-9]+$")


def _norm(text):
    t = unicodedata.normalize("NFD", text or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    return t


def cuvinte(text):
    out = set()
    for w in CUV.findall(_norm(text)):
        if FARA_LITERE.match(w) and len(w) > 6:   # numere lungi (CNP-uri, conturi): nu se indexează
            continue
        out.add(w)
    return out


def _id(url):
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:14]


def documente(db):
    """Documentele cu text, cu felul lor și legătura spre pagina lor din monitor."""
    hcl_url, hcl_wp = {}, {}
    for r in db.execute("SELECT year, number, adoption_date, title, wp_id, pdf_url FROM hcl"):
        x = {"fel": "hcl", "titlu": f"HCL {r['number']}/{r['year']}" + (f": {r['title']}" if r["title"] else ""),
             "data": r["adoption_date"], "an": r["year"], "nr": r["number"], "link": f"#consiliu/hcl/{r['year']}/{r['number']}"}
        if r["pdf_url"]:
            hcl_url[r["pdf_url"]] = x
        if r["wp_id"]:
            hcl_wp[r["wp_id"]] = x
    pv = {r["wp_id"]: {"fel": "pv", "titlu": r["title"] or f"Proces-verbal {r['session_date']}", "data": r["session_date"],
                       "link": f"#consiliu/sedinte/{r['session_date']}" if r["session_date"] else None}
          for r in db.execute("SELECT wp_id, title, session_date FROM pv")}
    posts = {r["wp_id"]: {"fel": r["source"], "titlu": r["title"], "data": (r["date"] or "")[:10] or None}
             for r in db.execute("SELECT wp_id, source, title, date FROM posts")}
    out = []
    for r in db.execute("SELECT url, wp_id, origin, link_text, text_path FROM documents WHERE text_path IS NOT NULL ORDER BY rowid"):
        x = hcl_url.get(r["url"]) or hcl_wp.get(r["wp_id"]) or pv.get(r["wp_id"]) or posts.get(r["wp_id"])
        if not x:
            x = {"fel": "arhiva" if r["origin"] == "arhiva" else "altele",
                 "titlu": r["link_text"] or os.path.basename(r["url"]), "data": None}
        x = dict(x, url=r["url"], text_path=r["text_path"])
        if x.get("titlu"):
            x["titlu"] = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", x["titlu"])).strip()[:300]
        out.append(x)
    return out


def construieste(store, data_dir=config.DATA_DIR, prag_comun=0.6, minim=20):
    """Construiește indexul. Cuvintele prezente în mai mult de `prag_comun` din documente (ex. „consiliul”)
    nu se indexează: nu ajută la căutare și ar umfla indexul; pagina le ignoră."""
    db = store.db
    out_dir = os.path.join(data_dir, "cautare")
    tmp = out_dir + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(os.path.join(tmp, "idx"))
    os.makedirs(os.path.join(out_dir, "txt"), exist_ok=True)
    docs, index = [], {}
    pastrate = set()
    for x in documente(db):
        try:
            with open(x["text_path"], encoding="utf-8") as f:
                text = f.read()
        except OSError:
            continue
        if len(text.strip()) < 40:
            continue
        i = len(docs)
        did = _id(x["url"])
        docs.append([did, x["fel"], x.get("titlu") or "", x.get("data"), x.get("an"), x.get("nr"), x.get("link"), x["url"]])
        for w in cuvinte(text + " " + (x.get("titlu") or "")):
            index.setdefault(w, []).append(i)
        # textul, pentru fragmente: se rescrie doar dacă s-a schimbat (urcarea e incrementală)
        p = os.path.join(out_dir, "txt", did + ".txt")
        pastrate.add(did + ".txt")
        try:
            with open(p, encoding="utf-8") as f:
                vechi = f.read()
        except OSError:
            vechi = None
        if vechi != text:
            with open(p, "w", encoding="utf-8") as f:
                f.write(text)
    for n in os.listdir(os.path.join(out_dir, "txt")):   # documente care nu mai au text
        if n not in pastrate:
            os.remove(os.path.join(out_dir, "txt", n))
    limita = max(minim, int(prag_comun * len(docs)))
    comune = sorted(w for w, l in index.items() if len(l) > limita)
    shards = {}
    for w, l in index.items():
        if len(l) > limita:
            continue
        d, prev = [], 0
        for v in l:
            d.append(v - prev)
            prev = v
        shards.setdefault(w[:2], {})[w] = d
    for k, v in shards.items():
        with open(os.path.join(tmp, "idx", k + ".json"), "w", encoding="utf-8") as f:
            json.dump(v, f, separators=(",", ":"), sort_keys=True)
    from datetime import datetime
    meta = {"generat_la": datetime.now().isoformat(timespec="seconds"), "docs": docs, "comune": comune,
            "bucati": sorted(shards)}
    with open(os.path.join(tmp, "docs.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    # indexul nou îl înlocuiește pe cel vechi; textele rămân pe loc
    for n in ("docs.json",):
        os.replace(os.path.join(tmp, n), os.path.join(out_dir, n))
    shutil.rmtree(os.path.join(out_dir, "idx"), ignore_errors=True)
    os.replace(os.path.join(tmp, "idx"), os.path.join(out_dir, "idx"))
    shutil.rmtree(tmp, ignore_errors=True)
    return {"documente": len(docs), "cuvinte": len(index), "comune": len(comune), "bucati": len(shards)}
