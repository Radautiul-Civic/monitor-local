from monitor_colector import teme as T


def test_beneficiar():
    b = T.beneficiar
    assert b("Hotarare privind concesionarea catre SC APOLLO SRL,fara licitatie publica,a unei suprafete de 361 mp teren") == ("APOLLO SRL", "firma")
    assert b("Hotarare privind concesionarea catre SC GENERAL UZ CASNIC SRL Radauti ,fara licitatie publica") == ("GENERAL UZ CASNIC SRL", "firma")
    assert b("privind concesionarea catre numita Flutur Domnica,fara licitatie publica,a unei suprafete") == ("Flutur Domnica", "persoana")
    assert b("atribuirea in folosinta gratuita a camerelor nr.35-39,catre Asociatia Bafi,pe termen de un an") == ("Asociatia Bafi", "ong")
    assert b("in regim de inchiriere, a spatiului situat in strada Piata Unirii nr.55,catre Partidul National Liberal") == ("Partidul National Liberal", "partid")
    assert b("privind aprobarea inchirierii prin licitatie publica, a unui teren in suprafata de 12 mp") == (None, None)
    assert b("privind neexercitarea dreptului de preempțiune de către Unitatea Administrativ Teritorială Municipiul Rădăuți") == (None, None)


def test_valoare():
    v = T.valoare_pat("Art. 2. Se aprobă preţul de vânzare al terenului prevăzut la art. 1 în suprafaţa de 300 mp, în sumă totală de 14.661 lei echivalentul a 3.000 Euro (valoarea nu include TVA)", "vanzare")
    assert v["valoare"] == 14661 and v["moneda"] == "lei" and v["ce"] == "pret"
    v = T.valoare_pat("valoare de concesionare a terenului plătibilă anticipat: Ve teren anticipat = 29.270 lei (fără TVA)", "concesionare")
    assert v["valoare"] == 29270
    v = T.valoare_pat("chiria va fi de 12,5 lei/mp/lună", "inchiriere")
    assert v["valoare"] == 12.5 and v["unitate"] == "/mp/luna" and v["ce"] == "chirie"
    assert T.valoare_pat("Se aprobă închirierea terenului.", "inchiriere") is None
