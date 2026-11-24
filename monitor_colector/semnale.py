"""Semnalele automate și indicele de transparență, din datele publice deja colectate.

Rulează după colectare, pe fișierele din data/ (liste.json, voturi.json, sicap-explorer.json) și scrie data/semnale.json.
Un semnal nu e o acuzație: arată un fapt verificabil (o dată, o sumă, un document) care merită o întrebare. Fiecare
semnal are documentele din care a fost dedus, iar pragurile și regulile sunt scrise în fișier (metoda), ca să poată fi
verificate de oricine.

  python -m monitor_colector.semnale

Semnalele:
  consultare    proiecte de hotărâre cu caracter probabil normativ adoptate la mai puțin de 30 de zile de la anunț
                (Legea nr. 52/2003, art. 7 alin. (2)) sau fără anunț de consultare găsit pe site
  publicare     hotărâri publicate pe site la mult timp după adoptare
  urgenta       ședințe convocate de îndată și ponderea lor
  achizitii     achiziții directe repetate la același furnizor, pentru același fel de produse, care împreună depășesc
                pragul achiziției directe; achiziții chiar sub prag
"""
import json
import os
import re
from collections import defaultdict
from datetime import date

from . import config
from .cetateni import _seaman
from .parse import norm

ZILE_CONSULTARE = 30          # Legea nr. 52/2003, art. 7 alin. (2): anunțul, cu cel puțin 30 de zile înainte de adoptare
ZILE_PUBLICARE = 30           # prag de semnal (nu termen legal): hotărâre pe site la peste 30 de zile de la adoptare
PRAG_DIRECTA = {"produse_servicii": 270120, "lucrari": 900400}   # lei fără TVA, Legea nr. 98/2016, art. 7 alin. (5)
SUB_PRAG = 0.9                # „chiar sub prag”: între 90% și 100% din prag
MIN_REPETARI = 3              # achiziții directe la același furnizor, același grup CPV, același an
LEI_EROARE = 1_500_000        # achiziții directe peste această sumă: aproape sigur greșeli de introducere în SICAP
DE_LA = "2025-01-01"
PRIMARIA = re.compile(r"^(municipiul|primaria)\b")   # indicele privește primăria; semnalele de achiziții acoperă toate instituțiile orașului          # anunțurile de proiect și data publicării pe site există doar pe site-ul nou (din 2025)

# titluri de hotărâri cu caracter probabil normativ (reguli pentru toți), la care Legea nr. 52/2003 cere consultare
RX_NORMATIV = re.compile(r"\bregulament|\bimpozit|\btax(e|a|ei|elor)\b|\btarif|\bpret(ul|urile|uri)?\b|\bnorme\b|\breguli\b|"
                         r"\bnormativ|\bcaiet(ul)? de sarcini|\bcriterii(lor)?\b|\bzonelor de impozitare|\bstatut(ul)?\b")
# hotărâri individuale sau tehnice, chiar dacă titlul atinge cuvintele de mai sus
RX_NU_NORMATIV = re.compile(r"\brectificar|\bbugetul? de venituri|\bscutir|\bpresedinte(lui)? de sedinta|\bmandat|\bcomisi(a|ei|ilor)\b|"
                            r"\bdesemnar|\bmandatar|\brepartiz|\bcontul de executie|\bindicatori(lor)? tehnico|\borganigram|\bstatului de functii|"
                            r"organizare si functionare\b.{0,60}\b(aparat|directi|camin|cantin|centr|compartiment|consiliul|bibliotec|club|spital|scoli|scoala|gradinit|cres|politi)|"
                            r"\bdrept(ul)? de uz|\bservitut|\bstudiu(lui)? de oportunitate|\bplan(ului)? urbanistic (zonal|de detaliu)|\bp\.?u\.?[zd]\b")
# PUZ și PUD au consultarea lor, după legea urbanismului (Ordinul nr. 2701/2010), înainte de proiectul de hotărâre


def _zi(s):
    try:
        return date.fromisoformat((s or "")[:10])
    except ValueError:
        return None


def _ani(t):
    return set(re.findall(r"\b20\d\d\b", t or ""))


def _citeste(d, nume, implicit=None):
    try:
        with open(os.path.join(d, nume), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return implicit


def normativ(titlu):
    t = norm(titlu or "")
    return bool(RX_NORMATIV.search(t)) and not RX_NU_NORMATIV.search(t)


def tipuri_sedinte(liste, voturi):
    """data -> tipul ședinței (ordinara / extraordinara / extraordinara_de_indata), din procesele-verbale."""
    tip = {}
    for p in (liste or {}).get("pv") or []:
        if p.get("data") and p.get("tip"):
            tip.setdefault(p["data"], p["tip"])
    for s in (voturi or {}).get("sedinte") or []:
        if s.get("data") and s.get("tip"):
            tip[s["data"]] = s["tip"] if tip.get(s["data"]) != "extraordinara_de_indata" else tip[s["data"]]
    return tip


def anunt_pentru(h, proiecte):
    """Anunțul de proiect din care a ieșit hotărârea: publicat înainte, cel mult 180 de zile, titlu asemănător, același an în titlu."""
    dh = _zi(h["data"])
    best, scor = None, 0.0
    for p in proiecte:
        dp = _zi(p.get("postat"))
        if not dp or not dh or dp > dh or (dh - dp).days > 180:
            continue
        ah, ap = _ani(h["titlu"]), _ani(p["titlu"])
        if ah and ap and not (ah & ap):
            continue
        s = _seaman(p["titlu"], h["titlu"])
        if s > scor or (s == scor and best and dp > _zi(best["postat"])):
            best, scor = p, s
    return best if scor >= 0.7 else None


def semnale_consultare(liste, tip):
    hcl = [h for h in (liste or {}).get("hcl") or [] if (h.get("data") or "") >= DE_LA and normativ(h.get("titlu"))]
    proiecte = (liste or {}).get("proiecte") or []
    out = []
    for h in sorted(hcl, key=lambda x: (x["data"], x["nr"])):
        a = anunt_pentru(h, proiecte)
        urgenta = tip.get(h["data"]) == "extraordinara_de_indata"
        baza = {"hcl": {"an": h["an"], "nr": h["nr"], "data": h["data"], "titlu": h["titlu"], "pagina": h.get("pagina"), "pdf": h.get("pdf")},
                "sedinta": tip.get(h["data"])}
        if a is None:
            out.append(dict(baza, fel="fara_anunt", grav=1 if urgenta else 2,
                            text="Nu am găsit pe site anunțul de consultare publică pentru acest proiect." + (" Hotărârea a fost adoptată într-o ședință convocată de îndată." if urgenta else "")))
            continue
        zile = (_zi(h["data"]) - _zi(a["postat"])).days
        if zile < ZILE_CONSULTARE:
            out.append(dict(baza, fel="consultare_scurta", zile=zile, grav=1 if urgenta else 3,
                            anunt={"postat": a["postat"], "titlu": a["titlu"], "pagina": a.get("pagina"), "pdf": a.get("pdf")},
                            text=f"Adoptată la {zile} {'zi' if zile == 1 else 'zile'} de la anunțul proiectului; legea cere cel puțin {ZILE_CONSULTARE}." +
                                 (" Ședința a fost convocată de îndată (procedura de urgență poate fi invocată, dar trebuie motivată)." if urgenta else "")))
    return out, len(hcl)


def semnale_publicare(liste):
    out, zile_toate = [], []
    for h in (liste or {}).get("hcl") or []:
        if h.get("sursa") != "site" or (h.get("data") or "") < DE_LA:
            continue
        a, p = _zi(h.get("data")), _zi(h.get("postat"))
        if not a or not p or p < a:
            continue
        z = (p - a).days
        zile_toate.append((h["data"][:7], z))
        if z > ZILE_PUBLICARE:
            out.append({"fel": "publicare_tarzie", "zile": z, "grav": 2 if z <= 60 else 3,
                        "hcl": {"an": h["an"], "nr": h["nr"], "data": h["data"], "titlu": h["titlu"], "pagina": h.get("pagina"), "postat": h["postat"]},
                        "text": f"Publicată pe site la {z} zile după adoptare."})
    return sorted(out, key=lambda x: -x["zile"]), zile_toate


def semnale_urgenta(tip):
    pe_ani = defaultdict(lambda: {"total": 0, "de_indata": 0, "extraordinare": 0})
    for d, t in tip.items():
        a = pe_ani[d[:4]]
        a["total"] += 1
        a["de_indata"] += t == "extraordinara_de_indata"
        a["extraordinare"] += t in ("extraordinara", "extraordinara_de_indata")
    return {k: pe_ani[k] for k in sorted(pe_ani)}


def semnale_achizitii(sx):
    if not sx:
        return []
    inst, furn, cpv = sx.get("inst") or [], sx.get("furn") or [], sx.get("cpv") or []
    nume = lambda L, i, k=1: (L[i][k] if isinstance(L[i], list) else L[i]) if isinstance(i, int) and 0 <= i < len(L) else None
    grup = defaultdict(list)
    out = []
    for r in sx.get("da") or []:
        _id, i, d, f, c, lei = r[0], r[1], r[2], r[3], r[4], r[5] or 0
        if not d or d < "2018" or lei <= 0 or lei > LEI_EROARE or "ACET" in (nume(inst, i) or "").upper():
            continue   # ACET cumpără pentru tot județul: nu e o instituție a orașului
        cod = str(cpv[c]).split(" ")[0] if isinstance(c, int) and 0 <= c < len(cpv) else ""
        fel = "lucrari" if cod.startswith("45") else "produse_servicii"
        prag = PRAG_DIRECTA[fel]
        rand = {"id": _id, "data": d, "lei": round(lei, 2), "obiect": r[7], "cod": r[8]}
        grup[(i, f, cod[:3], d[:4], fel)].append(rand)
        if SUB_PRAG * prag <= lei < prag:
            out.append({"fel": "sub_prag", "grav": 2, "institutie": nume(inst, i), "furnizor": nume(furn, f), "cpv": cod, "achizitii": [rand],
                        "text": f"Achiziție directă de {lei:,.0f} lei, la {100 * lei / prag:.0f}% din pragul de {prag:,} lei.".replace(",", ".")})
    for (i, f, c3, an, fel), L in grup.items():
        if len(L) < MIN_REPETARI:
            continue
        tot, prag = sum(x["lei"] for x in L), PRAG_DIRECTA[fel]
        if tot >= prag:
            out.append({"fel": "fragmentare", "grav": 3 if tot >= 2 * prag else 2, "institutie": nume(inst, i), "furnizor": nume(furn, f),
                        "cpv": c3, "an": an,
                        "achizitii": sorted(L, key=lambda x: x["data"]), "total_lei": round(tot, 2),
                        "text": (f"{len(L)} achiziții directe în {an} la același furnizor, pentru același fel de "
                                 f"{'lucrări' if fel == 'lucrari' else 'produse sau servicii'} (grupa CPV {c3}), în total {tot:,.0f} lei, peste pragul "
                                 f"achiziției directe de {prag:,} lei.").replace(",", ".")})
    return sorted(out, key=lambda x: (-x["grav"], -(x.get("total_lei") or x["achizitii"][0]["lei"])))


def indice(cons, n_normative, publicare_zile, urgenta, achizitii, an):
    """Indicele de transparență pe un an (0-100), din patru componente egale. Fiecare componentă e un procent
    ușor de verificat; indicele e doar media lor."""
    nn = [x for x in cons if x["hcl"]["data"][:4] == an]
    norm_an = n_normative.get(an, 0)
    c1 = 100 * (1 - len(nn) / norm_an) if norm_an else None
    pz = [z for luna, z in publicare_zile if luna[:4] == an]
    c2 = 100 * sum(1 for z in pz if z <= ZILE_PUBLICARE) / len(pz) if pz else None
    u = urgenta.get(an)
    c3 = 100 * (1 - u["de_indata"] / u["total"]) if u and u["total"] else None
    fr = sum(1 for x in achizitii if x["fel"] == "fragmentare" and x.get("an") == an and PRIMARIA.search(norm(x.get("institutie") or "")))
    c4 = max(0.0, 100 - 10 * fr)
    comp = {"consultare": c1, "publicare": c2, "sedinte_planificate": c3, "achizitii": c4}
    vals = [v for v in comp.values() if v is not None]
    return {"an": an, "indice": round(sum(vals) / len(vals)) if vals else None, "componente": {k: (round(v) if v is not None else None) for k, v in comp.items()},
            "detalii": {"normative": norm_an, "cu_problema_consultare": len(nn), "hotarari_cu_data_publicarii": len(pz),
                        "sedinte": u["total"] if u else 0, "de_indata": u["de_indata"] if u else 0, "grupuri_fragmentare": fr}}


METODA = {
    "consultare": f"Hotărârile al căror titlu arată reguli pentru toți (regulamente, taxe, tarife, prețuri, norme) sunt socotite „probabil normative”. "
                  f"Legea nr. 52/2003 (art. 7 alin. (2)) cere ca anunțul proiectului să fie publicat cu cel puțin {ZILE_CONSULTARE} de zile înainte de adoptare. "
                  f"Căutăm anunțul pe site după titlu; când nu-l găsim, semnalul e mai slab (se poate să fi fost publicat altfel). Ședințele convocate de îndată "
                  f"pot folosi procedura de urgență, de aceea semnalul lor e marcat mai slab.",
    "publicare": f"Data publicării pe site față de data adoptării; semnalăm peste {ZILE_PUBLICARE} de zile. E un prag al nostru, nu un termen legal.",
    "sedinte_planificate": "Ponderea ședințelor care nu au fost convocate de îndată. Ședințele de îndată lasă cel mai puțin timp pentru informarea cetățenilor.",
    "achizitii": f"Achiziții directe repetate ({MIN_REPETARI} sau mai multe) în același an, la același furnizor, pentru aceeași grupă CPV, care împreună "
                 f"depășesc pragul achiziției directe ({PRAG_DIRECTA['produse_servicii']:,} lei pentru produse și servicii, {PRAG_DIRECTA['lucrari']:,} lei "
                 f"pentru lucrări, fără TVA). Nu înseamnă automat fragmentare ilegală: pot fi achiziții separate, nevoi neprevăzute sau contracte-cadru. "
                 f"În indice intră doar achizițiile primăriei; componenta pierde 10 puncte pentru fiecare astfel de grup.".replace(",", "."),
    "indice": "Media componentelor de mai sus, pe un an, de la 0 la 100. Arată tendința, nu dă o notă de legalitate.",
}


def calculeaza(d=config.DATA_DIR, azi=None):
    liste = _citeste(d, "liste.json", {})
    voturi = _citeste(d, "voturi.json") or _citeste(os.path.join(d, "intern-date"), "voturi.json", {})
    sx = _citeste(d, "sicap-explorer.json")
    tip = tipuri_sedinte(liste, voturi)
    cons, _ = semnale_consultare(liste, tip)
    n_normative = defaultdict(int)
    for h in liste.get("hcl") or []:
        if (h.get("data") or "") >= DE_LA and normativ(h.get("titlu")):
            n_normative[h["data"][:4]] += 1
    pub, pub_zile = semnale_publicare(liste)
    urg = semnale_urgenta(tip)
    ach = semnale_achizitii(sx)
    azi = azi or date.today()
    ani = [str(a) for a in range(int(DE_LA[:4]), azi.year + 1)]
    return {"generat_la": azi.isoformat(), "metoda": METODA, "praguri": {"zile_consultare": ZILE_CONSULTARE, "zile_publicare": ZILE_PUBLICARE, "prag_directa": PRAG_DIRECTA},
            "indice": [indice(cons, n_normative, pub_zile, urg, ach, a) for a in ani],
            "consultare": cons, "publicare": pub, "urgenta": urg, "achizitii": ach[:300],
            "numar": {"consultare": len(cons), "publicare": len(pub), "achizitii": len(ach)}}


def scrie(d=config.DATA_DIR, azi=None):
    rez = calculeaza(d, azi)
    with open(os.path.join(d, "semnale.json"), "w", encoding="utf-8") as f:
        json.dump(rez, f, ensure_ascii=False, separators=(",", ":"))
    return rez["numar"]


if __name__ == "__main__":
    print(json.dumps(scrie(), ensure_ascii=False))
