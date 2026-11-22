"""„Rădăuți în <anul curent>”: câteva cifre mari pentru pagina de start (date/acasa.json), calculate din aceleași date
ca paginile monitorului, ca omul să vadă dintr-o privire ce s-a întâmplat în oraș anul acesta."""
from datetime import date

SICAP = "https://www.e-licitatie.ro/pub/"


def anul(db, ind, expl=None, concursuri=None, sed=None, azi=None):
    azi = azi or date.today()
    an = str(azi.year)
    out = {"an": an, "generat_la": azi.isoformat()}
    out["hotarari"] = db.execute("SELECT COUNT(*) FROM hcl WHERE substr(adoption_date,1,4)=?", (an,)).fetchone()[0]
    out["sedinte"] = sum((ind.get("sedinte_pe_tip") or {}).get(an, {}).values())
    u = ind.get("urbanism") or {}
    out["autorizatii"] = (u.get("ac") or {}).get("pe_ani", {}).get(an, 0)
    out["autorizatii_valoare"] = (u.get("ac") or {}).get("valoare_pe_ani", {}).get(an)
    out["certificate"] = (u.get("cu") or {}).get("pe_ani", {}).get(an, 0)
    if concursuri:
        ca = [c for c in concursuri if str(c.get("an")) == an]
        out["concursuri"] = len(ca)
        out["posturi_scoase"] = sum(c.get("posturi") or 0 for c in ca)
    if sed:
        out["proiecte_consultare"] = sum(1 for p in sed.get("consultare") or [] if (p.get("postat") or "")[:4] == an)
    if expl:
        inst, furn = expl["inst"], expl["furn"]
        rows = []
        # achiziții directe încheiate (fără valorile aberante) și contracte atribuite (fără acordurile-cadru,
        # a căror valoare e un maxim: banii se văd în contractele subsecvente), ca în paginile de achiziții
        for x in expl.get("da") or []:
            if (x[2] or "")[:4] == an and x[11] and x[9] < 2 and x[5]:
                rows.append({"lei": x[5], "obiect": x[7], "inst": inst[x[1]][1], "furnizor": furn[x[3]][1] if x[3] >= 0 else "",
                             "url": SICAP + "direct-acquisition/view/" + str(x[0]), "fel": "achiziție directă"})
        for x in expl.get("can") or []:
            if (x[2] or "")[:4] == an and x[12] != 2 and x[4]:
                rows.append({"lei": x[4], "obiect": x[6], "inst": inst[x[1]][1], "furnizor": furn[x[10]][1] if x[10] >= 0 else "",
                             "url": SICAP + "notices/ca-notices/view-c/" + str(x[0]), "fel": "contract atribuit"})
        out["achizitii_lei"] = round(sum(r["lei"] for r in rows))
        out["achizitii_nr"] = len(rows)
        if rows:
            m = max(rows, key=lambda r: r["lei"])
            out["cel_mai_mare"] = dict(m, lei=round(m["lei"]))
            pe_f = {}
            for r in rows:
                if r["furnizor"]:
                    pe_f[r["furnizor"]] = pe_f.get(r["furnizor"], 0) + r["lei"]
            if pe_f:
                f, v = max(pe_f.items(), key=lambda t: t[1])
                out["furnizor_principal"] = {"nume": f, "lei": round(v)}
    return out
