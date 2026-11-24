"""Teme care leagă documentele între ele (date/teme.json), din hotărâri, dispoziții, rapoarte și SICAP:

  investitii   fiecare obiectiv de investiții, cu toate hotărârile despre el (documentație, indicatori, finanțare,
               finalizare), valoarea aprobată și licitațiile/contractele din SICAP cu titlu asemănător
  patrimoniu   hotărârile despre terenurile și clădirile orașului (vânzări, concesionări, închirieri, schimburi,
               trecerea dintr-un domeniu în altul), cu strada, suprafața și, unde se poate, poziția pe hartă
  dispozitii   dispozițiile primarului publicate, pe tipuri, și câte au fost emise după numerotare
  finantari    programele anuale de finanțări nerambursabile (Legea nr. 350/2005) și sumele lor
  taxe         hotărârile anuale despre impozitele și taxele locale, cu câteva niveluri citite din text
  rapoarte     rapoartele publicate de primărie (anual, Legea nr. 52/2003, activitatea consilierilor etc.)

Totul e extras automat din titluri și din textul citit al documentelor (OCR), deci cifrele au alături documentul-sursă.
"""
import json
import os
import re
from datetime import date

from .parse import clean_title, norm

STOP = set("municipiul municipiului radauti judetul judet suceava str strada din la pe si de in cu pentru a al ale "
           "unei unui privind obiectivul obiectiv investitii investitie nr mun jud zona".split())


def _txt(db, url, maxim=None):
    r = db.execute("SELECT text_path FROM documents WHERE url=?", (url,)).fetchone() if url else None
    if not r or not r[0]:
        return ""
    try:
        with open(r[0], encoding="utf-8") as f:
            t = f.read()
        return t[:maxim] if maxim else t
    except OSError:
        return ""


def suma(s, mii=False):
    """Un număr scris românește, din OCR: „67,095,20” / „153 263.32” / „1.234.567,89” / „222 566.000” (3 zecimale) /
    „324,935” sau „1.003,067” (mii lei). Ultimul separator e zecimal când e urmat de 1-2 cifre, sau de 3 cifre dacă
    numărul e grupat cu spații, dacă partea întreagă are peste 3 cifre negrupate ori dacă suma e în mii."""
    s = re.sub(r"[^\d., ]", "", s or "").strip()
    if not re.search(r"\d", s):
        return None
    m = re.match(r"^(.*?)[.,](\d+)$", s)
    if m:
        inainte, f = m.group(1).strip(), m.group(2)
        zecimal = len(f) <= 2 or (len(f) == 3 and (" " in inainte or re.fullmatch(r"\d{4,}", inainte) or mii))
        if zecimal:
            intreg = re.sub(r"[^\d]", "", inainte) or "0"
            v = float(intreg + "." + f)
        else:
            v = float(re.sub(r"[^\d]", "", s))
    else:
        v = float(re.sub(r"[^\d]", "", s))
    return v * 1000 if mii else v


# ---------------------------------------------------------------- investiții
PASI = [("finalizat", r"finaliz|inchiderea proiect|receptie"),
        ("inventar", r"domeniul public .{0,80}(mijloace fixe|investiti)|includerea in inventar"),
        ("credite", r"credite\w* de angajament"),
        ("esalonare", r"esalonar"),
        ("modificare", r"modificar\w* .{0,60}indicator|actualizar\w* .{0,60}indicator"),
        ("finantare", r"depunerea|cerer\w* de finantare|participar\w* .{0,60}(program|apel)|cofinantar|contractului de finantare|finantar\w* (nerambursabil|prin)"),
        ("indicatori", r"indicator\w* tehnico|documentati\w* tehnico|studiu\w* de fezabilitate|\bdali\b|proiect tehnic")]
NUME_PAS = {"indicatori": "Documentație și indicatori aprobați", "modificare": "Indicatori modificați", "finantare": "Finanțare sau cofinanțare",
            "credite": "Credite de angajament", "esalonare": "Eșalonare financiară", "finalizat": "Proiect finalizat",
            "inventar": "Trecut în inventarul orașului", "alta": "Altă hotărâre"}


CATEG_INV = [("scoli", "Școli și grădinițe", r"scoal|scoli|colegi|gradinit|liceu|invatamant|cres[ae]|educati"),
             ("sanatate", "Spital și sănătate", r"spital|medical|dispensar|sanatat"),
             ("social", "Social și comunitar", r"varstnic|centr\w* comunitar|asistent\w* social|camin pentru|persoane cu dizabilit|cantina social|adapost"),
             ("cultura", "Cultură și monumente", r"monument|statu[ia]|statuar|muze|casa de cultura|teatr|bibliotec|casa casatoriilor|biseric|manastir"),
             ("apa", "Apă și canalizare", r"\bapa\b|apa potabil|canaliz|pluvial|bransament\w* (de )?apa|foraj|alimentar\w* cu apa"),
             ("mediu", "Mediu și salubrizare", r"ecologic|deseur|salubr|colectar|insule"),
             ("digital", "Digitalizare și supraveghere video", r"video|supraveghere|fibr|digital|informatic|software|dark fiber|wifi"),
             ("trotuare", "Trotuare, parcări, siguranță rutieră", r"trotuar|parcar|semnaliz|giratoriu|pist\w* (de )?biciclet|alee|pietonal|trecer\w* (de )?pietoni|esplanad|pavar|dale"),
             ("strazi", "Străzi și asfaltări", r"asfalt|covor|carosabil|pietruir|balast|bituminoas|imbracamint|modernizar\w* (str|drum|strazi)|strazi|drum\w* (local|comunal)|reabilitar\w* str|ocolitoar|largir\w* dn|\bdn ?2"),
             ("energie", "Energie, iluminat, încălzire", r"iluminat|energ|electric|\bles\b|fotovolt|solar|termic|central\w* termic|cazan|stocare|gaze? natural"),
             ("parcuri", "Parcuri, sport, agrement", r"\bparc|loc de joaca|bazin|sport|stadion|teren (de )?fotbal|patinoar|zoo|agrement|sauna"),
             ("cladiri", "Clădiri publice și renovări", r"sediu|cladir|reabilitar\w* energetic|primari|fatad|acoperis|invelitoar|anvelop|consolidar|cimitir|piata|obor|locuint"),
             ("alta", "Alte investiții", r".")]


def categorie_investitie(nume):
    t = norm(nume or "")
    return next(k for k, _, rx in CATEG_INV if re.search(rx, t))


def strazi_din(nume):
    """Străzile pomenite în numele obiectivului: „str. Putnei”, „străzile Mănejului, Pepenăriei și Eudoxiu Hurmuzachi”."""
    out = []
    nume = (nume or "").replace("ş", "ș").replace("ţ", "ț").replace("Ş", "Ș").replace("Ţ", "Ț")
    m = re.search(r"\bstr[aă]zile\s+(.+?)(?:\s+din\b|\s+municipiul|,\s*jud|$)", nume, re.I)
    if m:
        out += [x.strip(" .") for x in re.split(r",|\s+și\s+|\s+si\s+", m.group(1)) if len(x.strip()) > 2]
    for m in re.finditer(r"\b(?:str(?:ada|\.)?|calea|b-dul|bulevardul|aleea)\s*\.?\s*(?:(?:ing|dr|prof|gen|av)\.\s*)?([A-ZĂÂÎȘŞȚŢ0-9][\wăâîșşțţĂÂÎȘŞȚŢ\-\. ]{1,35}?)(?=\s*(?:nr\.?|din\b|de la\b|pana\b|până\b|tronson|intersect|,|;|\.(?:\s|$)|\(|$|\s+cu\b|\s+si\b|\s+și\b|\s+la\b|\s+in\b|\s+în\b))", nume):
        pref = re.match(r"(calea|aleea|b-dul|bulevardul)", m.group(0), re.I)
        out.append(((pref.group(1).capitalize() + " ") if pref else "") + m.group(1).strip())
    vazut, rez = set(), []
    for x in out:
        k = norm(x)
        x = re.sub(r"\s+partea\s+\w+$|\s+(și|si)\s+str$", "", x).strip(" .")
        x = re.sub(r"^(ing|dr|prof|gen|av|cpt|lt)\.\s*", "", x, flags=re.I)
        k = norm(x)
        if k not in vazut and len(k) > 3 and not re.match(r"^(nr|fn|f\.n)\b", k) and not any(v.startswith(k) or k.startswith(v) for v in vazut):
            vazut.add(k)
            rez.append(x)
    return rez[:6]


def _cheie_strada(n):
    t = re.sub(r"[^a-z0-9 ]+", " ", norm(n or ""))
    t = re.sub(r"^(strada|str|bulevardul|b dul|piata)\s+", "", t.strip())
    return re.sub(r"\s+", " ", t).strip()


def strazi_osm(data_dir, retea=True):
    """Geometria străzilor din Rădăuți (OpenStreetMap, prin Overpass), salvată o dată în data/osm-strazi.json."""
    p = os.path.join(data_dir, "osm-strazi.json")
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        pass
    if not retea:
        return {}
    import logging
    import requests
    q = '[out:json][timeout:90];way["highway"]["name"](47.805,25.855,47.885,25.985);out tags geom;'
    for url in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
                "https://maps.mail.ru/osm/tools/overpass/api/interpreter"):
        try:
            r = requests.post(url, data={"data": q}, timeout=120,
                              headers={"User-Agent": "MonitorLocal (monitor.radautiulcivic.ro)"})
            r.raise_for_status()
            out = {}
            for w in r.json().get("elements") or []:
                k = _cheie_strada((w.get("tags") or {}).get("name"))
                g = [[round(pt["lat"], 5), round(pt["lon"], 5)] for pt in w.get("geometry") or []]
                if k and len(g) >= 2:
                    out.setdefault(k, []).append(g)
            if out:
                with open(p, "w", encoding="utf-8") as f:
                    json.dump(out, f, separators=(",", ":"))
                return out
            logging.warning("Overpass %s: niciun drum în răspuns", url)
        except Exception as e:   # noqa: BLE001
            logging.warning("Overpass %s: %s", url, str(e)[:200])
    # rezervă: API-ul principal OpenStreetMap, pe bucăți mici (limita lui e de 50.000 de puncte pe cerere)
    try:
        out = _strazi_api_osm(requests)
        if out:
            with open(p, "w", encoding="utf-8") as f:
                json.dump(out, f, separators=(",", ":"))
            return out
        logging.warning("API OSM: niciun drum")
    except Exception as e:   # noqa: BLE001
        logging.warning("API OSM: %s", str(e)[:200])
    return {}


def _strazi_api_osm(requests, s=47.805, v=25.855, n=47.885, e=25.985, pasi=4):
    import time
    import xml.etree.ElementTree as ET
    noduri, drumuri = {}, {}
    for i in range(pasi):
        for j in range(pasi):
            b = (v + (e - v) * j / pasi, s + (n - s) * i / pasi, v + (e - v) * (j + 1) / pasi, s + (n - s) * (i + 1) / pasi)
            r = requests.get("https://api.openstreetmap.org/api/0.6/map", params={"bbox": ",".join(f"{x:.5f}" for x in b)},
                             timeout=120, headers={"User-Agent": "MonitorLocal (monitor.radautiulcivic.ro)"})
            r.raise_for_status()
            root = ET.fromstring(r.content)
            for nd in root.iter("node"):
                noduri[nd.get("id")] = (round(float(nd.get("lat")), 5), round(float(nd.get("lon")), 5))
            for w in root.iter("way"):
                tag = {t.get("k"): t.get("v") for t in w.iter("tag")}
                if tag.get("highway") and tag.get("name"):
                    drumuri[w.get("id")] = (tag["name"], [x.get("ref") for x in w.iter("nd")])
            time.sleep(1)
    out = {}
    for nume, refs in drumuri.values():
        k = _cheie_strada(nume)
        g = [list(noduri[x]) for x in refs if x in noduri]
        if k and len(g) >= 2:
            out.setdefault(k, []).append(g)
    return out


# orașul (fără satele și comunele vecine, care au și ele străzi cu aceleași nume): lat. și long. minime și maxime
ORAS = (47.822, 25.880, 47.870, 25.962)


def _in_oras(pt, b=ORAS):
    return b[0] <= pt[0] <= b[2] and b[1] <= pt[1] <= b[3]


def taie_in_oras(linii, b=ORAS):
    """Păstrează din fiecare linie doar bucățile din oraș."""
    out = []
    for ln in linii:
        cur = []
        for pt in ln:
            if _in_oras(pt, b):
                cur.append(pt)
            else:
                if len(cur) >= 2:
                    out.append(cur)
                cur = []
        if len(cur) >= 2:
            out.append(cur)
    return out


def lungime_km(linii):
    import math
    t = 0.0
    for ln in linii:
        for (a, b), (c, d) in zip(ln, ln[1:]):
            x = math.radians(d - b) * math.cos(math.radians((a + c) / 2))
            y = math.radians(c - a)
            t += 6371.0 * math.hypot(x, y)
    return t


def asfaltari(investitii, geo):
    """Km de străzi din obiectivele de modernizare a străzilor, pe ani: după anul aprobării (prima hotărâre cu indicatori,
    altfel prima hotărâre) și după anul finalizării. Lungimea e a întregii străzi din OpenStreetMap (în oraș), nu a
    tronsonului lucrat; o stradă se numără o dată pe an."""
    ani = {}
    for x in investitii:
        if x.get("categorie") != "strazi":
            continue
        pasi = x.get("pasi") or []
        ind = [p for p in pasi if p.get("pas") == "indicatori"]
        fin = [p for p in pasi if p.get("pas") in ("finalizat", "inventar")]
        a_apr = ((ind[0] if ind else pasi[0]).get("data") or "")[:4] if pasi else ""
        a_fin = (fin[0].get("data") or "")[:4] if fin else ""
        for fel, an in (("aprobat", a_apr), ("finalizat", a_fin)):
            if not an:
                continue
            g = ani.setdefault(an, {})
            g.setdefault(fel + "_obiective", 0)
            g[fel + "_obiective"] += 1
            st = g.setdefault(fel + "_strazi", {})
            if not x.get("chei"):
                g[fel + "_fara_strazi"] = g.get(fel + "_fara_strazi", 0) + 1
            nume = {_cheie_strada(n): n for n in x.get("strazi") or []}
            for k in x.get("chei") or []:
                if k in geo and geo[k].get("km"):
                    st[k] = (geo[k]["km"], nume.get(k, k))
    out = {}
    for an, g in sorted(ani.items()):
        o = {}
        for fel in ("aprobat", "finalizat"):
            st = g.get(fel + "_strazi") or {}
            o[fel] = {"obiective": g.get(fel + "_obiective", 0), "km": round(sum(v[0] for v in st.values()), 2), "strazi": len(st),
                      "fara_strazi": g.get(fel + "_fara_strazi", 0),
                      "lista": sorted(([v[1], v[0]] for v in st.values()), key=lambda t: -t[1])}
        out[an] = o
    return out


def nume_obiectiv(titlu):
    """Numele obiectivului din titlul hotărârii (textul dintre ghilimele de după „obiectivul de investiții” / „proiectul”)."""
    for kw in (r"obiectiv\w*(\s+de\s+investi\w+)?", r"proiect\w*", r"investi\w+"):
        m = re.search(kw, titlu, re.I)
        if not m:
            continue
        rest = titlu[m.end():]
        q = re.match(r"[^«„“\"]{0,40}?(«|,,|„|“|\")\s*", rest)
        if not q:
            continue
        rest = rest[q.end():]
        if q.group(1) == "«":
            e = rest.find("»")
            n = rest[:e] if e >= 0 else rest
        else:   # ghilimele românești, uneori imbricate: până la ultima ghilimea de închidere
            e = max(rest.rfind("”"), rest.rfind("\""), rest.rfind("“"))
            n = rest[:e] if e > 0 else rest
        n = re.sub(r"\s+", " ", n).strip(" ,.;-")
        if len(n) >= 6 and not re.match(r"^cod\s+smis", n, re.I):
            return n[:240]
    return None


def _chei(n):
    return {w for w in re.findall(r"[a-z0-9]+", norm(n or "")) if len(w) > 2 and w not in STOP}


def _asem(a, b):
    if not a or not b:
        return 0
    return len(a & b) / len(a | b)


def valoare_investitie(text):
    """Valoarea totală (cu TVA dacă apare; altfel fără TVA), din textul hotărârii."""
    t = norm(text)
    LEI = r"\s*(mii\s+)?(?:lei|lel|iei|lci|ler|ici)\b"
    NUM = r"([\d][\d .,]{2,20}\d)"
    for rx, tva in ((r"valoare\w*\s+total\w*\s*\(?\s*(?:inclusiv|cu)\s+tva\)?[^\d\n]{0,40}" + NUM + LEI, "cu TVA"),
                    (r"tota\w*\s*\(?\s*(?:inclusiv|cu)\s+tva\)?\s*:?\s*" + NUM + LEI, "cu TVA"),
                    (r"valoare\w*\s+total\w*[^\d\n]{0,60}" + NUM + LEI, ""),
                    (r"total\w*\s+general[^\d\n]{0,40}" + NUM + LEI, "")):
        m = re.search(rx, t)
        if m:
            v = suma(m.group(1), bool(m.group(2)))
            if v and 1000 <= v <= 3e8:
                return round(v, 2), tva or ("fără TVA" if "exclusiv tva" in t[max(0, m.start() - 10):m.end()] else "")
    return None, None


def investitii(db, sx=None):
    H = db.execute("SELECT year, number, adoption_date, title, pdf_url FROM hcl WHERE title IS NOT NULL ORDER BY adoption_date, number").fetchall()
    grupuri = []
    for an, nr, data, titlu, pdf in H:
        t = norm(titlu)
        if not re.search(r"obiectiv\w* de investiti|indicator\w* tehnico|documentati\w* tehnico|studiu\w* de fezabilitate|cofinantar|"
                         r"cerer\w* de finantare|finalizar\w* .{0,30}proiect", t):
            continue
        n = nume_obiectiv(titlu)
        if not n:
            continue
        pas = next((k for k, rx in PASI if re.search(rx, t)), "alta")
        k = _chei(n)
        g = max(grupuri, key=lambda g: _asem(k, g["_k"]), default=None)
        if not g or _asem(k, g["_k"]) < 0.6:
            g = {"nume": n, "_k": k, "pasi": []}
            grupuri.append(g)
        val, tva = (valoare_investitie(_txt(db, pdf, 60000)) if pas in ("indicatori", "modificare") else (None, None))
        g["pasi"].append({"an": an, "nr": nr, "data": data, "pas": pas, "titlu": clean_title(titlu)[:300],
                          **({"valoare": val, "tva": tva} if val else {})})
    out = []
    for g in grupuri:
        P = g["pasi"]
        g["categorie"] = categorie_investitie(g["nume"] + " " + " ".join(p["titlu"] for p in P[:1]))
        g["strazi"] = strazi_din(g["nume"])
        vals = [p for p in P if p.get("valoare")]
        x = {"nume": g["nume"], "categorie": g["categorie"], "strazi": g["strazi"], "pasi": P, "prima": P[0]["data"], "ultima": P[-1]["data"],
             "valoare": vals[-1]["valoare"] if vals else None, "tva": vals[-1]["tva"] if vals else None,
             "stare": "finalizat" if any(p["pas"] in ("finalizat", "inventar") for p in P) else "aprobat"}
        if sx:
            x["sicap"] = sicap_pentru(g["_k"], P[0]["data"], sx)
            if x["stare"] != "finalizat" and any(s["fel"] in ("contract", "directa") for s in x["sicap"]):
                x["stare"] = "contractat"
            elif x["stare"] != "finalizat" and x["sicap"]:
                x["stare"] = "licitat"
        out.append(x)
    out.sort(key=lambda x: x["ultima"] or "", reverse=True)
    return out


def sicap_pentru(k, de_la, sx):
    """Licitații și contracte din SICAP cu titlu asemănător, după prima hotărâre (cel mult 4)."""
    inst, rez = sx["inst"], []
    for fel, rows, io, di, oi, vi in (("licitatie", sx.get("cn") or [], 1, 2, 6, 4), ("contract", sx.get("can") or [], 1, 2, 6, 4),
                                      ("directa", [r for r in sx.get("da") or [] if r[11]], 1, 2, 7, 5)):
        for r in rows:
            if (r[di] or "") < (de_la or ""):
                continue
            a = _asem(k, _chei(r[oi]))
            comune = len(k & _chei(r[oi]))
            if a >= 0.5 and comune >= (3 if len(k) > 4 else 2):
                rez.append({"fel": fel, "id": r[0], "data": r[di], "obiect": r[oi][:200], "lei": r[vi], "inst": inst[r[io]][1], "s": round(a, 2)})
    rez.sort(key=lambda x: -x["s"])
    return rez[:4]


# ---------------------------------------------------------------- patrimoniu
FELURI_PAT = [("vanzare", "Vânzare", r"\bvanzar|\bvinzar|instrainar"),
              ("concesionare", "Concesionare", r"concesion"),
              ("inchiriere", "Închiriere", r"inchiri"),
              ("schimb", "Schimb", r"\bschimb\w* (de teren|de imobil|imobil|terenu)|schimbul (unui|de)"),
              ("folosinta", "Folosință gratuită sau administrare", r"folosint\w* gratuit|comodat|darea in administrare|dare\w* in administrare|administrar\w* (catre|a)"),
              ("uz", "Drept de uz, servitute, superficie", r"servitut|superficie|drept\w* de uz"),
              ("cumparare", "Cumpărare, donație, preluare", r"cumparar|achizitionar\w* .{0,40}(teren|imobil)|donati|preluar\w* .{0,40}(teren|imobil)|acceptar\w* .{0,30}(don|ofert)"),
              ("domeniu", "Trecere între domeniul public și privat, inventar", r"trecer\w* .{0,80}domeni|domeniul (public|privat) .{0,60}(includer|declarar|inventar)|inventar\w* bunuri|atestar\w* .{0,40}domeni|apartenent")]


def patrimoniu(db, coord=None):
    from . import geocod
    H = db.execute("SELECT year, number, adoption_date, title FROM hcl WHERE title IS NOT NULL ORDER BY adoption_date DESC, number DESC").fetchall()
    out = []
    for an, nr, data, titlu in H:
        t = norm(titlu)
        if not re.search(r"teren|imobil|cladir|spatiu|locuint|domeniul (public|privat)|parcel|lot\b", t):
            continue
        if re.search(r"locuint\w* (sociale|anl|pentru tineri)|repartiz|lista de priorit|chiria\w* .{0,30}locuint|locuinte(lor)? destinate|fondul locativ|titularului contractului|inchirier\w* a locuint", t):
            continue   # locuințele sociale/ANL: repartizări către persoane, nu patrimoniu tranzacționat
        fel = next((k for k, _, rx in FELURI_PAT if re.search(rx, t)), None)
        if not fel:
            continue
        x = {"an": an, "nr": nr, "data": data, "fel": fel, "titlu": clean_title(titlu)[:400]}
        m = re.search(r"\b(?:str(?:ada|\.)?|calea|b-dul|bulevardul|aleea|piata)\s*\.?\s*([A-ZĂÂÎȘŞȚŢ0-9][\w\-\.ăâîșşțţĂÂÎȘŞȚŢ ]{1,40}?)(?=\s*(?:nr\.?|n\s*r|fn|f\.n|,|;|\.|\(|identific|in\s|în\s|din\s|$))", titlu)
        if m:
            s = m.group(0).strip(" ,.")
            strada = re.sub(r"^(str(ada|\.)?)\s*\.?\s*", "", s, flags=re.I).strip()
            x["strada"] = strada
            if coord:
                p = geocod.pentru(coord, strada, titlu + " Rădăuți")
                if p:
                    x["lat"], x["lon"], x["precizie"] = p
        m = re.search(r"(\d[\d.]{0,9}(?:,\d+)?)\s*(mp|m\.p\.|m2|ha)\b", t)
        if m:
            v = suma(m.group(1))
            if v:
                x["suprafata"] = round(v * (10000 if m.group(2) == "ha" else 1), 2)
        m = re.search(r"cadastral\w*\s*(?:nr\.?)?\s*(\d{3,7})", t)
        if m:
            x["cadastral"] = m.group(1)
        out.append(x)
    return out


# ---------------------------------------------------------------- dispoziții
FELURI_DISP = [("convocare", "Convocarea consiliului local", r"convoc"),
               ("buget", "Buget: virări de credite, trimestrializare", r"virar|credite bugetare|trimestrial|buget"),
               ("regulament", "Regulamente și proceduri", r"regulament|procedur|metodologi"),
               ("comisie", "Comisii și echipe", r"comisi|echip\w* de|grup\w* de lucru|desemnar|nominalizar"),
               ("personal", "Personal: numiri, salarizare, delegări", r"numir|salariz|delegar|incadrar|promovar|incetar\w* .{0,30}(raport|contract)|detasar"),
               ("alegeri", "Alegeri: secții de votare", r"sectii\w* de votare|alegeri|vot\b"),
               ("social", "Ajutoare și beneficii sociale", r"ajutor|indemniza|beneficiar|alocati|voucher|tichete"),
               ("alta", "Altele", r".")]


def dispozitii(db):
    rows = db.execute("SELECT p.title, p.date, p.link, (SELECT url FROM documents d WHERE d.wp_id=p.wp_id ORDER BY rowid LIMIT 1) "
                      "FROM posts p WHERE p.source IN ('dispozitii', 'dispozitii_arhiva') AND p.title IS NOT NULL ORDER BY p.date DESC").fetchall()
    lista, pe_ani = [], {}
    for titlu, d, link, pdf in rows:
        t = norm(titlu)
        m = re.search(r"\bnr\.?\s*(\d{1,4})\b", t) or re.search(r"dispozit\w*\s+(\d{1,4})\b", t)
        an = re.search(r"\b(20[0-3]\d)\b", t)
        an = an.group(1) if an else (d or "")[:4]
        fel = next(k for k, _, rx in FELURI_DISP if re.search(rx, t))
        o = re.search(r"\b(privind|pentru)\b", titlu, re.I)
        lista.append({"nr": int(m.group(1)) if m else None, "an": an, "data": (d or "")[:10], "fel": fel,
                      "obiect": (titlu[o.start():] if o else titlu).strip()[:300], "pagina": link, "pdf": pdf})
        a = pe_ani.setdefault(an, {"publicate": 0, "numar_maxim": 0, "pe_feluri": {}})
        a["publicate"] += 1
        a["pe_feluri"][fel] = a["pe_feluri"].get(fel, 0) + 1
        if m:
            a["numar_maxim"] = max(a["numar_maxim"], int(m.group(1)))
    return {"lista": lista, "pe_ani": dict(sorted(pe_ani.items())), "feluri": {k: n for k, n, _ in FELURI_DISP}}


# ---------------------------------------------------------------- finanțări nerambursabile
DOMENII = [("sport", r"sport"), ("cultura", r"cultur"), ("culte", r"cult\w* religi|culte|unitati de cult|biseric"),
           ("social", r"social"), ("tineret", r"tineret"), ("educatie", r"educati"), ("mediu", r"mediu")]


def finantari(db):
    H = db.execute("SELECT year, number, adoption_date, title, pdf_url FROM hcl WHERE title IS NOT NULL ORDER BY adoption_date DESC").fetchall()
    out = []
    for an, nr, data, titlu, pdf in H:
        t = norm(titlu)
        if not re.search(r"finantar\w* nerambursabil|sprijin\w* financiar|ajutor\w* financiar|legea nr\.? ?350", t):
            continue
        tx = norm(_txt(db, pdf, 40000))
        x = {"an": an, "nr": nr, "data": data, "titlu": clean_title(titlu)[:300]}
        an_prog = re.search(r"in anul (20\d\d)", t)
        if an_prog:
            x["anul_programului"] = an_prog.group(1)
        m = re.search(r"suma total\w* alocat\w*[^\d]{0,60}?([\d][\d .,]*\d)\s*(mii\s+)?lei", tx)
        if m:
            x["total"] = suma(m.group(1), bool(m.group(2)))
        # tabelul „domeniul / subdomenii / suma”: „1 social asociatii si fundatii 50.000 2 culte religioase culte 150.000 total 200.000”
        i = tx.find("repartizarea bugetului")
        if i >= 0:
            bloc = tx[i:i + 700]
            j = bloc.find("total ")
            dom = {}
            for k, rx in DOMENII:
                mm = re.search(r"(?:" + rx + r")[a-z ,]{0,50}?(\d{1,3}(?:[.,]\d{3})+|\d{4,7})(?![\d.,])", bloc[:j] if j > 0 else bloc)
                if mm:
                    v = suma(mm.group(1).replace(",", ".") + ",00")
                    if v and v >= 1000:
                        dom[k] = v
            if dom:
                x["domenii"] = dom
                if not x.get("total"):
                    x["total"] = sum(dom.values())
        out.append(x)
    # un singur program pe an (dacă au fost mai multe hotărâri, ultima adoptată)
    vazut = set()
    for x in sorted(out, key=lambda x: x["data"] or "", reverse=True):
        if x.get("anul_programului") in vazut and x.get("total"):
            x["inlocuit"] = True
        if x.get("total"):
            vazut.add(x.get("anul_programului"))
    return out


# ---------------------------------------------------------------- taxe locale
def niveluri_taxe(text):
    """Câteva niveluri din hotărârea anuală, unde OCR-ul le-a citit: indexarea, cota pe clădirile rezidențiale ale
    persoanelor fizice, impozitul auto (autoturisme până la 1.600 cm3, lei/200 cm3), taxa de salubrizare pe persoană."""
    t = norm(text)
    o = {}
    m = re.search(r"indexat\w*\s+(?:pentru anul \d{4}\s+)?cu\s+(\d{1,2}[.,]\d{1,2})\s*%", t)
    if m:
        o["indexare_pct"] = float(m.group(1).replace(",", "."))
    m = re.search(r"cota impozitului pentru cladirile rezidentiale[^%]{0,200}?\d[.,]\d+\s*%\s*-\s*\d[.,]\d+\s*%\s*(\d[.,]\d+)\s*%", t)
    if m:
        o["cladiri_rezidentiale_pf_pct"] = float(m.group(1).replace(",", "."))
    m = re.search(r"autoturisme cu\s+(?:capacitatea cilindrica\s+)?(?:de\s+)?pana la 1\.?600 cm.{0,40}?(\d{1,3}[.,]\d{1,2})", t, re.S)
    if not m:
        m = re.search(r"capacitatea cilindrica de pana la 1\.?600 cm\S*\s*(?:inclusiv)?[^\d]{0,30}(\d{1,3}[.,]\d{1,2})", t)
    if m:
        o["auto_1600_lei_200cm3"] = float(m.group(1).replace(",", "."))
    m = re.search(r"taxa\w* (?:speciala )?de salubrizare[^\n]{0,160}?persoan\w* fizic\w*[^\n]{0,80}?(\d{1,3}[.,]\d{1,2})\s*lei\s*/\s*(?:persoana|pers)", t)
    if m:
        o["salubrizare_pf_lei_persoana_luna"] = float(m.group(1).replace(",", "."))
    lim = {"indexare_pct": (0, 30), "cladiri_rezidentiale_pf_pct": (0.05, 0.3), "auto_1600_lei_200cm3": (5, 60), "salubrizare_pf_lei_persoana_luna": (1, 50)}
    return {k: v for k, v in o.items() if lim[k][0] < v <= lim[k][1]}


def taxe(db):
    H = db.execute("SELECT year, number, adoption_date, title, pdf_url FROM hcl WHERE title IS NOT NULL ORDER BY adoption_date").fetchall()
    ani = {}
    for an, nr, data, titlu, pdf in H:
        t = norm(titlu)
        if not re.search(r"impozit\w*\s+si\s+tax\w*\s+local|impozitelor si taxelor|nivelul\w* impozit|taxe\w* special|facilitat\w* fiscal|scutir\w* .{0,30}impozit", t):
            continue
        m = re.search(r"pentru anul (20\d\d)", t)
        anul = m.group(1) if m else str(an)   # facilitățile fiscale etc., fără „pentru anul”: anul adoptării
        a = ani.setdefault(anul, {"hotarari": [], "niveluri": {}})
        anuala = bool(re.search(r"privind stabilirea impozitelor si taxelor locale pentru anul", t)) and "modific" not in t
        a["hotarari"].append({"an": an, "nr": nr, "data": data, "titlu": clean_title(titlu)[:300], "anuala": anuala})
        if anuala:
            txt = _txt(db, pdf)
            if len(txt) >= a.get("_lung", 0):   # mai multe „anuale” pe un an: cea cu anexele (textul cel mai lung)
                a["niveluri"] = niveluri_taxe(txt)
                a["hcl"] = {"an": an, "nr": nr}
                a["pdf"] = pdf
                a["_lung"] = len(txt)
    for a in ani.values():
        a.pop("_lung", None)
    return dict(sorted(ani.items()))


# ---------------------------------------------------------------- rapoarte
TIP_RAPORT = [("comisii", "Rapoartele comisiilor de specialitate ale consiliului local", r"\bcomisi"),
              ("viceprimar", "Rapoartele viceprimarilor", r"viceprimar"),
              ("activitate_primar", "Raportul anual al primarului", r"raport\w* anual|starea economic|activitat\w* primar|raport\w* primar"),
              ("legea52", "Transparență decizională (Legea nr. 52/2003)", r"52/2003|transparent\w* decizional|raport\w* de evaluare"),
              ("legea544", "Acces la informații publice (Legea nr. 544/2001)", r"544"),
              ("consilieri", "Rapoartele de activitate ale consilierilor", r"consilier|activitate cl|membrilor consiliului|rapoartele membrilor|rapoarte de activitate cl"),
              ("sna", "Integritate (Strategia Națională Anticorupție)", r"\bsna\b|anticorup|integritat"),
              ("buget", "Buget: etichetarea cheltuielilor, execuție", r"etichet|executi\w* bugetar"),
              ("alta", "Alte rapoarte și studii", r".")]


def an_din_text(text_path):
    """Anul raportului din primele rânduri ale documentului („pentru anul 2025”, „Perioada: anul 2024”, „perioada 28 iunie - 31
    decembrie 2012”). Textul vine din OCR, deci căutăm doar în primii 1500 de caractere și doar după aceste formule."""
    if not text_path:
        return []
    try:
        with open(text_path, encoding="utf-8", errors="replace") as f:
            t = norm(f.read(3000))[:1500]
    except OSError:
        return []
    for rx in (r"pentru\s*/?\s*anul\s*:?\s*(20[0-3]\d)", r"\banul\s*:?\s*(20[0-3]\d)", r"perioada\s*:?\s*(?:anul\s*)?(20[0-3]\d)",
               r"perioada[^.]{0,60}?(20[0-3]\d)", r"\bin\s+anul\s+(20[0-3]\d)"):
        m = re.search(rx, t)
        if m:
            return [m.group(1)]
    return []


def rapoarte(db):
    rows = db.execute("SELECT d.url, d.link_text, p.link, p.title, p.date, d.text_path FROM documents d JOIN posts p ON p.wp_id=d.wp_id "
                      "WHERE p.source='rapoarte' ORDER BY p.date DESC, d.url").fetchall()
    out = []
    for url, lt, pagina, ptitlu, d, tp in rows:
        t = norm((lt or "") + " " + (ptitlu or ""))
        fel = next(k for k, _, rx in TIP_RAPORT if re.search(rx, t))
        if fel == "alta" and re.search(r"consiliul-local|rapoartele-membrilor|rapoarte-de-activitate-cl", pagina or ""):
            fel = "consilieri"   # pe paginile consiliului local, rapoartele fără „consilier” în titlu sunt tot ale consilierilor
        # anul raportului: din titlu, altfel din numele fișierului (nu din „uploads/2025/06”, care e data publicării)
        an = re.findall(r"\b(20[0-3]\d)\b", norm(lt or "")) or re.findall(r"(?<!\d)(20[0-3]\d)(?!\d)", url.rsplit("/", 1)[-1]) or an_din_text(tp)
        out.append({"fel": fel, "titlu": (lt or ptitlu or "").strip()[:300], "url": url, "pagina": pagina, "an": max(an) if an else None})
    return {"lista": out, "feluri": {k: n for k, n, _ in TIP_RAPORT}}


def scrie(store, data_dir, azi=None):
    from . import geocod
    db = store.db
    try:
        with open(os.path.join(data_dir, "sicap-explorer.json"), encoding="utf-8") as f:
            sx = json.load(f)
    except (OSError, ValueError):
        sx = None
    rez, stats = {"generat_la": (azi or date.today()).isoformat()}, {}
    for nume, fn in (("investitii", lambda: investitii(db, sx)), ("categorii_investitii", lambda: {k: n for k, n, _ in CATEG_INV}), ("patrimoniu", lambda: patrimoniu(db, geocod.coordonate(db))),
                     ("dispozitii", lambda: dispozitii(db)), ("finantari", lambda: finantari(db)), ("taxe", lambda: taxe(db)),
                     ("rapoarte", lambda: rapoarte(db))):
        try:
            rez[nume] = fn()
            v = rez[nume]
            stats[nume] = len(v) if isinstance(v, (list, dict)) and not (isinstance(v, dict) and "lista" in v) else len(v["lista"])
        except Exception as e:   # o temă care pică nu le oprește pe celelalte
            stats[nume] = f"eroare: {e}"
    # lista completă a taxelor, extrasă cu modelul de limbaj din hotărârile anuale (cu cache; vezi taxe_ai.py)
    if isinstance(rez.get("taxe"), dict):
        try:
            from . import taxe_ai
            stats["taxe_ai"] = taxe_ai.aplica(db, data_dir, rez["taxe"])
            rez["indicatori_taxe"] = taxe_ai.indicatori_publici()
        except Exception as e:
            stats["taxe_ai"] = f"eroare: {e}"
    # salubrizarea: cât plătește populația, din hotărârile verificate de echipă (surse/salubrizare/tarife.json)
    try:
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), "surse", "salubrizare", "tarife.json"), encoding="utf-8") as f:
            rez["salubrizare"] = json.load(f)
        stats["salubrizare"] = len(rez["salubrizare"].get("casnici") or [])
    except (OSError, ValueError) as e:
        stats["salubrizare"] = f"eroare: {e}"
    try:   # apa și iluminatul: tarifele verificate de echipă (surse/servicii/date.json)
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), "surse", "servicii", "date.json"), encoding="utf-8") as f:
            rez["servicii"] = json.load(f)
        stats["servicii"] = sorted(rez["servicii"])
    except (OSError, ValueError) as e:
        stats["servicii"] = f"eroare: {e}"
    # termoficarea: hotărârile pe subiect și prețurile pe perioade (data/termoficare.json; vezi termoficare.py)
    try:
        from . import termoficare
        stats["termoficare"] = termoficare.scrie(db, data_dir)
    except Exception as e:
        stats["termoficare"] = f"eroare: {e}"
    # harta investițiilor: geometria străzilor pomenite (OpenStreetMap) și, ca rezervă, poziția străzii din registrele de urbanism
    try:
        osm, coord = strazi_osm(data_dir), geocod.coordonate(db)
        geo = {}
        for x in rez.get("investitii") or []:
            x["chei"] = []
            for st in x.get("strazi") or []:
                k = _cheie_strada(st)
                if k in geo:
                    x["chei"].append(k)
                    continue
                linii = taie_in_oras(osm.get(geocod.cheie_in_osm(k, osm)) or []) if osm else []
                if linii:
                    geo[k] = {"linii": linii, "km": round(lungime_km(linii), 2)}
                else:
                    p = geocod.pentru(coord, st, "Rădăuți")
                    if p:
                        geo[k] = {"punct": [p[0], p[1]]}
                if k in geo:
                    x["chei"].append(k)
        rez["strazi_geo"] = geo
        rez["asfaltari"] = asfaltari(rez.get("investitii") or [], geo)
        stats["strazi_geo"] = {"osm_strazi": len(osm), "linii": sum(1 for g in geo.values() if "linii" in g),
                               "puncte": sum(1 for g in geo.values() if "punct" in g)}
    except Exception as e:
        stats["strazi_geo"] = f"eroare: {e}"
    with open(os.path.join(data_dir, "teme.json"), "w", encoding="utf-8") as f:
        json.dump(rez, f, ensure_ascii=False, separators=(",", ":"))
    return stats
