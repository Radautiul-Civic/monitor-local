"""Date deschise: fișiere CSV (date/deschise/*.csv) cu datele monitorului, pentru jurnaliști, cercetători și alte organizații.

CSV cu separator „;” și codare UTF-8 cu BOM, ca să se deschidă direct, corect, în Excel cu setări românești; numerele
au punct zecimal. Fiecare fișier are pe primul rând numele coloanelor. Lista fișierelor, cu descrieri, e în index.json.
"""
import csv
import json
import os

SICAP = "https://www.e-licitatie.ro/pub/"


def _scrie(cale, coloane, randuri):
    with open(cale, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        w.writerow(coloane)
        n = 0
        for r in randuri:
            w.writerow(["" if v is None else v for v in r])
            n += 1
    return n


def scrie(data_dir):
    def citeste(nume):
        for p in (os.path.join(data_dir, nume), os.path.join(data_dir, "intern-date", nume)):
            try:
                with open(p, encoding="utf-8") as f:
                    return json.load(f)
            except (OSError, ValueError):
                continue
        return {}
    out = os.path.join(data_dir, "deschise")
    os.makedirs(out, exist_ok=True)
    L, V, U, T, K, C, SX = (citeste(n) for n in ("liste.json", "voturi.json", "urbanism.json", "teme.json", "concursuri.json", "componenta.json", "sicap-explorer.json"))
    idx = []

    def fisier(nume, descriere, coloane, randuri):
        n = _scrie(os.path.join(out, nume), coloane, randuri)
        idx.append({"fisier": nume, "descriere": descriere, "randuri": n, "coloane": coloane, "octeti": os.path.getsize(os.path.join(out, nume))})

    fisier("hotarari.csv", "Hotărârile Consiliului Local, din 2013", ["an", "nr", "data_adoptarii", "titlu", "data_publicarii", "document_pdf", "pagina", "scanat"],
           ([h.get("an"), h.get("nr"), h.get("data"), h.get("titlu"), h.get("postat"), h.get("pdf"), h.get("pagina"), h.get("scanat")] for h in L.get("hcl") or []))
    fisier("proiecte.csv", "Proiectele de hotărâre publicate pentru consultare", ["data_publicarii", "titlu", "document_pdf", "pagina"],
           ([p.get("postat"), p.get("titlu"), p.get("pdf"), p.get("pagina")] for p in L.get("proiecte") or []))
    fisier("voturi.csv", "Voturile din procesele-verbale ale ședințelor (extrase automat)",
           ["data_sedintei", "tip_sedinta", "punct", "proiect", "hcl", "prezenti", "pentru", "impotriva", "abtineri", "nu_voteaza", "rezultat", "unanimitate", "nume_impotriva", "nume_abtineri", "document_pdf"],
           ([s.get("data"), s.get("tip"), v.get("punct"), v.get("titlu"), f"{v['hcl']['nr']}/{v['hcl']['an']}" if v.get("hcl") else "", v.get("prezenti"), v.get("pentru"),
             v.get("impotriva"), v.get("abtineri"), v.get("nu_voteaza"), v.get("rezultat"), int(bool(v.get("unanimitate"))), ", ".join(v.get("nume_impotriva") or []),
             ", ".join(v.get("nume_abtineri") or []), s.get("pdf")] for s in V.get("sedinte") or [] for v in s.get("voturi") or []))
    comp = {x.get("id"): x for x in C.get("consilieri") or []}
    fisier("consilieri.csv", "Consilierii locali găsiți în procesele-verbale, cu perioadele în consiliu și partidul (pentru mandatul actual)",
           ["id", "nume", "partid", "mandate", "perioade"],
           ([c["id"], c["nume"], (comp.get(c["id"]) or {}).get("partid"), ", ".join(c.get("mandate") or []), "; ".join(f"{p[0]} - {p[1]}" for p in c.get("perioade") or [])]
            for c in V.get("consilieri") or []))
    for t, nume, desc in (("ac", "autorizatii_construire.csv", "Autorizațiile de construire și desființare, din registrele primăriei"),
                          ("cu", "certificate_urbanism.csv", "Certificatele de urbanism, din registrele primăriei")):
        fisier(nume, desc, ["nr", "data", "solicitant", "adresa", "strada", "scop", "categorie", "valoare_lei", "persoana_juridica", "lat", "lon", "registru_pdf"],
               ([a.get("nr"), a.get("data"), a.get("solicitant"), a.get("adresa"), a.get("strada"), a.get("scop"), a.get("categorie"), a.get("valoare"),
                 int(bool(a.get("pj"))), a.get("lat"), a.get("lon"), a.get("registru_pdf")] for a in U.get(t) or []))
    if SX:
        inst, furn, cpv = SX["inst"], SX["furn"], SX.get("cpv") or []
        rows = []
        for r in SX.get("da") or []:
            rows.append(["achiziție directă", r[2], inst[r[1]][1], inst[r[1]][2], furn[r[3]][1] if r[3] >= 0 else "", furn[r[3]][0] if r[3] >= 0 else "", r[7],
                         r[5], r[6], cpv[r[4]] if r[4] < len(cpv) else "", "da" if r[11] else "nu", SICAP + "direct-acquisition/view/" + str(r[0])])
        for r in SX.get("can") or []:
            rows.append(["contract atribuit" if r[12] != 2 else "acord-cadru", r[2], inst[r[1]][1], inst[r[1]][2], furn[r[10]][1] if r[10] >= 0 else "",
                         furn[r[10]][0] if r[10] >= 0 else "", r[6], r[4], r[5], cpv[r[3]] if r[3] < len(cpv) else "", "da", SICAP + "notices/ca-notices/view-c/" + str(r[0])])
        for r in SX.get("cn") or []:
            rows.append(["licitație lansată (valoare estimată)", r[2], inst[r[1]][1], inst[r[1]][2], "", "", r[6], r[4], r[5], cpv[r[3]] if r[3] < len(cpv) else "", "", SICAP + "notices/c-notice/v2/view/" + str(r[0])])
        rows.sort(key=lambda x: x[1] or "", reverse=True)
        fisier("achizitii_sicap.csv", "Achizițiile publice ale instituțiilor din Rădăuți, din SICAP, din 2018",
               ["fel", "data", "institutie", "cui_institutie", "furnizor", "cui_furnizor", "obiect", "valoare_lei", "valoare_euro", "cod_cpv", "incheiata", "link_sicap"], rows)
    fisier("investitii.csv", "Obiectivele de investiții din hotărârile consiliului local (grupate automat)",
           ["obiectiv", "stadiu", "valoare_lei", "tva", "prima_hotarare", "ultima_hotarare", "hotarari"],
           ([x["nume"], x["stare"], x.get("valoare"), x.get("tva"), x.get("prima"), x.get("ultima"), ", ".join(f"{p['nr']}/{p['an']}" for p in x["pasi"])] for x in T.get("investitii") or []))
    fisier("terenuri_cladiri.csv", "Hotărârile despre terenurile și clădirile orașului",
           ["an", "nr", "data", "fel", "strada", "suprafata_mp", "nr_cadastral", "lat", "lon", "titlu"],
           ([x["an"], x["nr"], x.get("data"), x["fel"], x.get("strada"), x.get("suprafata"), x.get("cadastral"), x.get("lat"), x.get("lon"), x["titlu"]] for x in T.get("patrimoniu") or []))
    fisier("concursuri.csv", "Concursurile și examenele de angajare ale primăriei și instituțiilor subordonate",
           ["inceput", "sfarsit", "institutie", "procedura", "functii", "categorie", "posturi", "candidati", "stare", "titlu"],
           ([c.get("inceput"), c.get("sfarsit"), c.get("institutie"), c.get("procedura_nume"), ", ".join(f if isinstance(f, str) else (f.get("nume") or "") for f in c.get("functii") or []),
             c.get("categorie"), c.get("posturi"), c.get("candidati"), c.get("stare"), c.get("titlu")] for c in K.get("concursuri") or []))
    TF = citeste("termoficare.json")
    fisier("termoficare_preturi.csv", "Prețul energiei termice (termoficare), pe perioade: cât plătește populația, cât acoperă bugetul local, prețul întreg; lei/MWh cu TVA",
           ["de_la", "pana_la", "populatie_lei_mwh", "buget_local_lei_mwh", "pret_intreg_lei_mwh", "tva_procent", "hcl", "unitate_in_hotarare", "verificat", "nota"],
           ([p.get("de_la"), p.get("pana_la"), p.get("populatie_cu_tva"), p.get("subventie_cu_tva"), p.get("total_cu_tva"), p.get("tva"),
             f"{p['hcl']['nr']}/{p['hcl']['an']}" if p.get("hcl") else None, p.get("unitate_in_hotarare"), "da" if p.get("verificat") else "nu", p.get("nota")] for p in TF.get("preturi") or []))
    fisier("termoficare_hotarari.csv", "Hotărârile consiliului local despre termoficare (tarife, pierderi acoperite din buget, contractul, investiții)",
           ["an", "nr", "data", "fel", "pierderi_lei", "pe_scurt", "titlu"],
           ([x["an"], x["nr"], x.get("data"), x["fel"], x.get("pierderi_lei"), x.get("pe_scurt"), x["titlu"]] for x in TF.get("hotarari") or []))
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, separators=(",", ":"))
    return {x["fisier"]: x["randuri"] for x in idx}
