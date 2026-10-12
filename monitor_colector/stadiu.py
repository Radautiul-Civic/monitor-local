"""Stadiul monitorului: ce acoperim, ce e parțial, ce lipsește și ce urmează.

Stările: complet / partial / lipsa / planificat. Cifrele se calculează din
indicatori; elementele planificate sunt listate aici și se actualizează odată
cu modulele noi.
"""


LUNI = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august",
        "septembrie", "octombrie", "noiembrie", "decembrie"]


def _zi(iso):
    try:
        y, m, d = str(iso)[:10].split("-")
        return f"{int(d)} {LUNI[int(m) - 1]} {y}"
    except (ValueError, IndexError):
        return iso or "-"


def _ani(pe_ani, conditie):
    return sorted(int(y) for y, v in pe_ani.items() if conditie(v))


def _interval(ani):
    """[2016, 2017, 2018, 2020] -> „2016-2018, 2020”."""
    if not ani:
        return ""
    parts, start, prev = [], ani[0], ani[0]
    for a in ani[1:] + [None]:
        if a is not None and a == prev + 1:
            prev = a
            continue
        parts.append(str(start) if start == prev else f"{start}-{prev}")
        if a is not None:
            start = prev = a
    return ", ".join(parts)


def compute(ind):
    pe_ani = ind.get("hcl_pe_ani", {})
    total_hcl = sum(v["gasite"] for v in pe_ani.values())
    ani = sorted(int(y) for y in pe_ani)
    lipsa_ani = [a for a in range(ani[0], ani[-1] + 1) if a not in ani] if ani else []
    complete = _ani(pe_ani, lambda v: (v["acoperire_pct"] or 0) >= 90)
    partiale = _ani(pe_ani, lambda v: (v["acoperire_pct"] or 0) < 90)
    S = []

    def add(sectiune, element, stare, detaliu):
        S.append({"sectiune": sectiune, "element": element, "stare": stare, "detaliu": detaliu})

    # ---- Decizii locale ----
    if pe_ani:
        add("Decizii locale", "Hotărâri de Consiliu Local", "complet" if not (partiale or lipsa_ani) else "partial",
            f"{total_hcl:,} hotărâri din {ani[0]}-{ani[-1]}".replace(",", ".")
            + (f"; complete: {_interval(complete)}" if complete else ""))
    for a in lipsa_ani:
        add("Decizii locale", f"Hotărâri {a}", "lipsa",
            "Anul nu are pagină în arhiva online a primăriei. Căutăm altă sursă publică.")
    if partiale:
        det = "; ".join(f"{a}: {pe_ani[str(a)]['gasite']} din {pe_ani[str(a)]['ultimul_nr']}" for a in partiale)
        add("Decizii locale", f"Hotărâri {_interval(partiale)}", "partial",
            f"În lista publicată apar mai puține hotărâri decât ultimul număr ({det}). "
            "Verificăm în alte surse înainte de orice concluzie.")
    pv = ind.get("pv_intarziere_publicare")
    tipuri = ind.get("sedinte_pe_tip", {})
    if tipuri:
        add("Decizii locale", "Procese-verbale de ședință", "partial",
            f"Disponibile pe site pentru {_interval(sorted(int(y) for y in tipuri))}"
            + (f" ({pv['pv']} procese-verbale)" if pv else "") + "; anii anteriori nu sunt publicați pe site.")
    pr = ind.get("proiecte_pe_ani", {})
    add("Decizii locale", "Proiecte de hotărâre", "complet" if pr else "planificat",
        f"{sum(pr.values())} proiecte publicate pe site" if pr else "Colectare pornită; apar după următoarea rulare.")
    add("Decizii locale", "Voturile consilierilor", "planificat",
        "Extrase din procesele-verbale, după verificarea calității textului recunoscut (OCR).")

    # ---- Urbanism ----
    reg = ind.get("registre_urbanism", {})
    for k, nume in (("cu", "Certificate de urbanism"), ("ac", "Autorizații de construire")):
        r = reg.get(k) or {}
        if r.get("ultima_perioada_pana_la"):
            z = r.get("zile_neacoperite") or 0
            u = (ind.get("urbanism") or {}).get(k) or {}
            add("Urbanism", nume, "complet" if z <= 90 else "partial",
                (f"{u['total']} acte extrase din registre. " if u.get("total") else "")
                + f"Registre publicate până la {_zi(r['ultima_perioada_pana_la'])}; {z} zile fără registru publicat.")
        else:
            add("Urbanism", nume, "lipsa", "Niciun registru găsit.")
    add("Urbanism", "Planuri urbanistice (PUG, PUZ)", "planificat",
        "Documentația PUG e într-un folder Google Drive care nu poate fi listat automat.")

    # ---- Achiziții publice ----
    c = ind.get("contracte_site") or {}
    add("Achiziții publice", "Contracte publicate pe site", "complet" if (c.get("zile_de_la_ultima") or 999) <= 90 else "partial",
        f"Ultimul contract postat: {_zi(c.get('ultima_postare'))}"
        + (f" ({c['zile_de_la_ultima']} zile)." if c.get("zile_de_la_ultima") is not None else "."))
    add("Achiziții publice", "Achiziții din SICAP", "planificat",
        "Proceduri, anunțuri și contracte din sistemul național de achiziții (CUI 4244148).")

    # ---- Alte surse ----
    add("Alte surse", "Litigii", "planificat", "Dosarele în care primăria e parte (portal.just.ro, ReJust).")
    add("Alte surse", "Buget și bilanțuri", "partial",
        "Documentele sunt colectate; indicatorii de buget nu sunt încă afișați.")
    add("Alte surse", "Dispoziții ale primarului", "planificat", "Registrul dispozițiilor publicat pe site.")
    return S
