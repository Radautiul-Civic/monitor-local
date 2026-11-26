/* Monitor local - aplicația paginii (publică și internă).
   <body data-base="" data-mode="public">  sau  <body data-base="../" data-mode="intern"> */
(function () {
  "use strict";
  var B = document.body.dataset, BASE = B.base || "", INTERN = B.mode === "intern";
  // Versiunea publică are tot ce are cea internă, mai puțin litigiile (și rapoartele de verificare).
  // Pagina internă își ia datele din intern/date/; indexul de căutare în text e unul singur, în zona publică.
  var DATA = INTERN ? "date/" : BASE + "date/", FTDATA = BASE + "date/";
  var IND = null, L = null, WORD = {};
  var $ = function (id) { return document.getElementById(id); };

  // ---------- utilitare ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//.test(u || "") ? u : null; }
  var LUNI = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
  function zi(s) { if (!s) return "-"; var p = String(s).slice(0, 10).split("-"); return p.length < 3 ? s : (+p[2]) + " " + LUNI[+p[1] - 1] + " " + p[0]; }
  function nr(n) { return n == null ? "-" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function dec(n) { return n == null ? "-" : String(n).replace(".", ","); }
  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function zile(n) { return n === 1 ? "zi" : "zile"; }
  var TIP = { ordinara: "ordinară", extraordinara: "extraordinară", extraordinara_de_indata: "de îndată" };
  var STARI = { complet: "Complet", partial: "Parțial", lipsa: "Lipsește", planificat: "Planificat" };

  // ---------- structura site-ului ----------
  var SECTIUNI = [
    { id: "acasa", nume: "Acasă" },
    { id: "strada", nume: "Strada mea" },
    { id: "consiliu", nume: "Consiliul Local", def: "sedinte", sub: [["sedinte", "Ședințe"], ["consilieri", "Consilieri"], ["proiecte", "Proiecte de hotărâre"], ["hcl", "Hotărâri adoptate"], ["rapoarte", "Rapoarte"]] },
    { id: "primarie", nume: "Primarul și primăria", def: "urbanism", sub: [["urbanism", "Urbanism și construcții", "Certificatele de urbanism și autorizațiile de construire emise de primar, pe hartă"],
      ["dispozitii", "Dispozițiile primarului", "Actele emise de primar, pe teme"], ["angajari", "Concursuri și angajări", "Concursurile pentru posturile din aparatul de specialitate al primarului și din instituțiile subordonate"],
      ["rapoarte", "Rapoarte", "Raportul anual al primarului, transparență, acces la informații, integritate"]] },
    { id: "bani", nume: "Banii orașului", def: "investitii", sub: [["investitii", "Investiții", "Ce construiește și repară orașul: străzi, școli, rețele, pe hartă și pe ani"],
      ["buget", "Buget", "De unde vin banii orașului și pe ce se cheltuiesc; bugetul îl aprobă consiliul local și îl execută primarul"], ["taxe", "Taxe și impozite", "Cât plătești: taxele locale stabilite de consiliu, evoluția lor și calculatorul"],
      ["achizitii", "Achiziții publice", "Ce cumpără instituțiile din oraș și de la cine (SICAP)"], ["patrimoniu", "Terenuri și clădiri", "Ce vinde, concesionează sau închiriază orașul"],
      ["finantari", "Finanțări nerambursabile", "Banii dați din bugetul local asociațiilor, cluburilor sportive și cultelor"]] },
    { id: "servicii", nume: "Servicii publice", def: "pe-scurt", sub: [["pe-scurt", "Pe scurt", "Cine face fiecare serviciu, cum îl plătești și cât costă"], ["termoficare", "Căldura (termoficare)", "Prețul căldurii, cât plătesc cei racordați și cât subvenția din bugetul local"],
      ["salubrizare", "Salubrizare", "Cine ridică gunoiul și cât e taxa de salubrizare"], ["apa", "Apa rece și canalizarea", "ACET S.A. Suceava: apa rece de la robinet și canalizarea"], ["strazi", "Curățenia străzilor și deszăpezirea"], ["iluminat", "Iluminatul public"],
      ["alte", "Piețe, cimitir, câini"], ["societate", "Servicii Comunale S.A.", "Societatea orașului: ce face, cine o conduce, ce bani primește"]] },
    { id: "comunale", nume: "Servicii Comunale", def: "pe-scurt", logo: "servicii-comunale", sub: [["pe-scurt", "Pe scurt", "Societatea orașului: ce face, cine o conduce, ce bani primește"],
      ["termoficare", "Căldura (termoficare)", "Prețul căldurii, subvenția și pierderile acoperite din buget"], ["hotarari", "Hotărâri", "Toate hotărârile consiliului local despre societate, pe teme"]].concat(INTERN ? [["documente", "Documentele societății", "Ce publică Servicii Comunale pe site-ul ei: bilanțuri, audit, hotărâri AGA, achiziții, regulamente"]] : []) },
    { id: "acet", nume: "ACET (apa)", def: "apa", logo: "acet", sub: [["apa", "Apa rece și canalizarea", "ACET S.A. Suceava, operatorul regional de apă și canalizare"]] },
    { id: "teme", nume: "Pe teme", def: "drumuri", sub: [["drumuri", "Străzi și trotuare"], ["parcari", "Parcări"], ["scoli", "Școli și grădinițe"], ["parcuri", "Parcuri și spații verzi"], ["pug", "PUG și urbanism"]] }
  ].concat(INTERN ? [{ id: "litigii", nume: "Litigii", def: "noutati", sub: [["noutati", "Noutăți"], ["dosare", "Dosare"], ["statistici", "Statistici"]] }] : [])
   .concat([{ id: "cauta", nume: "Caută", def: "cauta", sub: [["cauta", "Caută în monitor"], ["texte", "Textele documentelor"]] }]);
  var URB_TABS = [["harta", "Harta"], ["ac", "Autorizații de construire"], ["cu", "Certificate de urbanism"]];
  var TAB3 = { "primarie/urbanism": [URB_TABS, "harta"], "primarie/angajari": [[["statistici", "Statistici"], ["concursuri", "Concursuri"], ["posturi", "Organigramă și posturi"]], "statistici"],
    "bani/achizitii": [[["sicap", "Achiziții din SICAP"], ["contracte", "Contracte publicate pe site"]], "sicap"] };
  // adresele vechi (linkuri deja trimise) duc în noua structură
  var LA_BANI = { investitii: 1, buget: 1, taxe: 1, patrimoniu: 1, finantari: 1 };
  var ALIAS = { decizii: function (h) { return ["consiliu"].concat(h.slice(1)); },
    urbanism: function (h) { return ["primarie", "urbanism"].concat(h.slice(1)); },
    primarie: function (h) { return LA_BANI[h[1]] ? ["bani"].concat(h.slice(1)) : h[1] === "termoficare" ? ["servicii"].concat(h.slice(1)) : h; },
    achizitii: function (h) { return ["bani", "achizitii"].concat(h[1] === "contracte" ? ["contracte"] : h.slice(2)); },
    angajari: function (h) { return ["primarie", "angajari"].concat(h.slice(1)); },
    texte: function () { return ["cauta", "texte"]; },
    salubrizare: function () { return ["servicii", "salubrizare"]; },
    servicii: function (h) {
      if (h[1] === "hotarari" || (h[1] === "societate" && h[2] === "hotarari")) return ["comunale", "hotarari"];
      if (h[1] === "societate") return ["comunale", "pe-scurt"];
      if (h[1] === "apa") return ["acet", "apa"];
      return h;
    } };
  // panoul de control (doar intern): în bara lui, separată de meniul platformei
  if (INTERN) [["sarcini", "De făcut"], ["dosar", "Dosar pe temă"], ["rezumate", "Rezumate"], ["analize", "Analize"], ["semnale", "Semnale"], ["mesaje", "Mesaje"], ["declaratii", "Declarații"], ["arhiva", "Arhiva"]]
    .forEach(function (x) { SECTIUNI.push({ id: x[0], nume: x[1], admin: true }); });
  SECTIUNI.push({ id: "despre", nume: "Despre", def: "despre", sub: [["despre", "Despre monitor"], ["glosar", "Glosar"]] });

  function route() {
    var full = (location.hash || "#acasa").slice(1), qi = full.indexOf("?");
    var h = (qi >= 0 ? full.slice(0, qi) : full).split("/"), q = {};
    if (ALIAS[h[0]]) h = ALIAS[h[0]](h);
    (qi >= 0 ? full.slice(qi + 1) : "").split("&").forEach(function (p) {
      if (!p) return; var kv = p.split("=");
      try { q[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || "").replace(/\+/g, " ")); } catch (e) {}
    });
    if (h[0] === "primarie" && h[1] === "litigii") {   // adresa veche a litigiilor
      h = ["litigii", q.v === "noutati" ? "noutati" : q.v === "tabel" || q.q ? "dosare" : "statistici"];
      if (q.v === "noutati" || q.v === "tabel") delete q.v; else if (q.q) q.v = "fise";
    }
    var s = SECTIUNI.filter(function (x) { return x.id === h[0]; })[0] || SECTIUNI[0];
    var sub = s.sub ? ((s.sub.filter(function (x) { return x[0] === h[1]; })[0] || [s.def || s.sub[0][0]])[0]) : null;
    return { s: s, sub: sub, rest: h.slice(2), q: q, path: h.join("/") };
  }

  function nav(r) {
    var a = function (s) { return '<a href="#' + s.id + '"' + (s.id === r.s.id ? ' aria-current="page"' : "") + ">" + esc(s.nume) + "</a>"; };
    $("nav").innerHTML = SECTIUNI.filter(function (s) { return !s.admin; }).map(a).join("");
    if (!INTERN) return;
    var bara = $("admin-bar");
    if (!bara) { bara = document.createElement("div"); bara.id = "admin-bar"; bara.className = "admin-bar"; document.querySelector("header.top").insertAdjacentElement("beforebegin", bara); }
    var ascuns = false; try { ascuns = localStorage.getItem("panou-ascuns") === "1"; } catch (e) {}
    var inPanou = r.s.admin;
    bara.className = "admin-bar" + (ascuns && !inPanou ? " ascuns" : "");
    bara.innerHTML = '<div class="wrap"><b class="ab-t">Panou de control</b><nav aria-label="Panou de control">' + SECTIUNI.filter(function (s) { return s.admin; }).map(a).join("") + "</nav>" +
      '<button type="button" class="ab-x" aria-expanded="' + !(ascuns && !inPanou) + '">' + (ascuns && !inPanou ? "Arată panoul" : "Ascunde panoul") + "</button></div>";
    bara.querySelector(".ab-x").addEventListener("click", function () {
      var nou = !bara.classList.contains("ascuns");
      try { localStorage.setItem("panou-ascuns", nou ? "1" : "0"); } catch (e) {}
      if (nou && inPanou) location.hash = "#acasa"; else nav(r);
    });
  }

  // descrierea paginii: prima propoziție la vedere, restul la „mai mult” (paginile aveau prea mult text deasupra datelor)
  function scurtText(text) {
    if (!text || text.length <= 140) return text ? "<p>" + text + "</p>" : "";
    var i = text.search(/[.:;] /), tag = text.indexOf("<");
    if (i < 40 || i > text.length - 30 || (tag >= 0 && tag < i)) return "<p>" + text + "</p>";
    return "<p>" + text.slice(0, i + 1) + '</p><details class="info"><summary>Mai mult despre pagină</summary><p>' + text.slice(i + 2) + "</p></details>";
  }
  // ilustrațiile secțiunilor (assets/img/sec/*.webp), pe paginile principale ale fiecărei secțiuni și subsecțiuni
  var ILU = { acasa: "acasa", strada: "strada", "consiliu/urmatoare": "consiliu", "consiliu/proiecte": "proiecte", "consiliu/sedinte": "sedinte", "consiliu/calendar": "sedinte", "consiliu/rapoarte": "rapoarte", "consiliu/consilieri": "consilieri",
    "bani/buget": "buget", "bani/investitii": "investitii", "bani/taxe": "taxe", "servicii/termoficare": "taxe", "bani/patrimoniu": "patrimoniu", "bani/finantari": "finantari", "bani/achizitii": "achizitii", "primarie/angajari": "angajari",
    "primarie/dispozitii": "dispozitii", "primarie/rapoarte": "rapoarte", "primarie/urbanism": "urbanism", primarie: "urbanism", bani: "buget", litigii: "achizitii",
    cauta: "cauta", texte: "cauta", despre: "despre" };
  // pictogramele serviciilor publice (rândul de sub titlu și fișele de pe prima pagină)
  var SVC_IC = {
    "pe-scurt": '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    termoficare: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 6v12M11 6v12M15 6v12M19 6v12M5 21v-3M19 21v-3M9 3c0 1 1 1 1 2M13 3c0 1 1 1 1 2"/>',
    salubrizare: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    apa: '<path d="M12 3c-3 4.5-6 7.5-6 11a6 6 0 0 0 12 0c0-3.5-3-6.5-6-11z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
    strazi: '<path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11M9 3l3 3 3-3M9 21l3-3 3 3"/>',
    iluminat: '<path d="M8 21h8M12 21V9M12 9c0-3 2-5 6-5"/><path d="M15 4h6v3a3 3 0 0 1-6 0z"/>',
    alte: '<path d="M3 9l2-5h14l2 5M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8M10 21v-5h4v5"/>',
    societate: '<path d="M4 21V7l8-4 8 4v14M9 21v-5h6v5M8 10h2M14 10h2M8 13h2M14 13h2"/>'
  };
  function svcIc(k) { return '<svg class="svc-ic" viewBox="0 0 24 24" aria-hidden="true">' + (SVC_IC[k] || "") + "</svg>"; }
  function svcNav(activ, faraScurt) {
    var S = SECTIUNI.filter(function (x) { return x.id === "servicii"; })[0];
    return '<nav class="svc-nav" aria-label="Servicii publice">' + S.sub.filter(function (x) { return !faraScurt || x[0] !== "pe-scurt"; }).map(function (x) {
      return '<a href="#servicii/' + x[0] + '"' + (x[0] === activ ? ' aria-current="page"' : "") + (x[2] ? ' title="' + esc(x[2]) + '"' : "") + ">" + svcIc(x[0]) + "<span>" + esc(x[1]) + "</span></a>";
    }).join("") + "</nav>";
  }
  function head(title, text, r, share) {
    var rr = r || route(), sid = (rr.s || {}).id, icn = SEC_IC[sid];
    var ilu = !share && (!rr.rest.length || rr.sub === "urbanism") ? (ILU[sid + "/" + rr.sub] || ILU[sid]) : null;
    if (sid === "consiliu" && rr.sub === "hcl") ilu = null;   // la hotărâri rămâne fotografia reală a consiliului
    var foto = sid === "consiliu" && rr.sub === "hcl" && r && !r.rest.length && !share ? '<figure class="ph-foto"><picture><source type="image/webp" srcset="' + BASE + 'assets/img/consiliu.webp">' +
      '<img src="' + BASE + 'assets/img/consiliu.jpg" alt="Ședință a Consiliului Local al Municipiului Rădăuți" width="1024" height="541" loading="lazy"></picture></figure>' : "";
    var h = foto + '<div class="page-head' + (foto ? " cu-foto" : "") + (ilu ? " cu-ilu" : "") + '">' + (ilu ? '<div class="ph-top"><div class="ph-main">' : "") +
      '<div class="ph-t">' + (rr.s && rr.s.logo ? '<img class="ph-logo" src="' + BASE + "assets/img/sigle/" + rr.s.logo + '.png" alt="" width="56" height="56">' : icn ? '<span class="ph-ic">' + ic(icn) + "</span>" : "") + "<h1>" + esc(title) + "</h1>" + (share ? shareBtn(share[0], share[1]) : "") + "</div>" + scurtText(text) +
      (ilu ? '</div><figure class="ph-ilu"><img src="' + BASE + "assets/img/sec/" + ilu + '.webp" alt="" width="720" height="480" decoding="async"></figure></div>' : "");
    if (r && r.s.id === "servicii") h += svcNav(r.sub);
    else if (r && r.s.sub && r.s.sub.length > 1) h += '<div class="subnav">' + r.s.sub.map(function (x) {
      return '<a href="#' + r.s.id + "/" + x[0] + '"' + (x[0] === r.sub ? ' aria-current="page"' : "") + (x[2] ? ' title="' + esc(x[2]) + '"' : "") + ">" + esc(x[1]) + "</a>";
    }).join("") + "</div>";
    var t3 = r && TAB3[r.s.id + "/" + r.sub];
    if (t3) {
      var t2 = r.rest[0] && t3[0].some(function (x) { return x[0] === r.rest[0]; }) ? r.rest[0] : t3[1];
      h += '<div class="subnav sub2">' + t3[0].map(function (x) {
        return '<a href="#' + r.s.id + "/" + r.sub + "/" + x[0] + '"' + (x[0] === t2 ? ' aria-current="page"' : "") + ">" + esc(x[1]) + "</a>";
      }).join("") + "</div>";
    }
    return h + "</div>";
  }

  // ---------- distribuie ----------
  // Paginile s/<cheie>.html au imaginea și titlul lor pentru Facebook și WhatsApp (care nu citesc partea de după „#”);
  // când una nu există (hotărâri mai vechi de un an), distribuim adresa paginii, cu imaginea generală a monitorului.
  var SITE = "https://monitor.radautiulcivic.ro/", SHARE = null;
  function shareBtn(k, t) {
    return '<button type="button" class="share" data-k="' + esc(k || "") + '" data-t="' + esc(t || "") + '" aria-haspopup="true">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>Distribuie</button>';
  }
  function shareUrl(k) {
    var p = SHARE ? Promise.resolve(SHARE) : fetch(BASE + "s/index.json", { cache: "no-store" }).then(function (x) { return x.ok ? x.json() : []; }).catch(function () { return []; })
      .then(function (l) { SHARE = {}; (l || []).forEach(function (c) { SHARE[c] = 1; }); return SHARE; });
    return p.then(function (S) { return k && S[k] ? SITE + "s/" + k + ".html" : SITE + location.hash; });
  }
  function shareMeniu(b, u, t) {
    var m = document.querySelector(".share-m"); if (m) m.remove();
    m = document.createElement("div"); m.className = "share-m"; m.setAttribute("role", "menu");
    m.innerHTML = '<a role="menuitem" href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(u) + '" target="_blank" rel="noopener">Facebook</a>' +
      '<a role="menuitem" href="https://wa.me/?text=' + encodeURIComponent(t + " " + u) + '" target="_blank" rel="noopener">WhatsApp</a>' +
      '<a role="menuitem" href="mailto:?subject=' + encodeURIComponent(t) + "&body=" + encodeURIComponent(u) + '">E-mail</a>' +
      '<button type="button" role="menuitem">Copiază linkul</button>';
    var r = b.getBoundingClientRect();
    m.style.top = (window.scrollY + r.bottom + 6) + "px"; m.style.left = Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - 200)) + "px";
    document.body.appendChild(m);
    m.querySelector("button").addEventListener("click", function () {
      var bt = this;
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { bt.textContent = "Copiat ✓"; }, function () { window.prompt("Linkul:", u); });
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button.share");
    var m = document.querySelector(".share-m");
    if (m && !(e.target.closest && e.target.closest(".share-m"))) m.remove();
    if (!b) return;
    e.preventDefault();
    var t = b.dataset.t || document.title;
    shareUrl(b.dataset.k).then(function (u) {
      if (navigator.share && matchMedia("(pointer:coarse)").matches) navigator.share({ title: t, url: u }).catch(function () {});
      else shareMeniu(b, u, t);
    });
  });

  // explicații scurte la termenii tehnici: prima apariție de pe pagină e subliniată punctat; la atingere apare explicația
  var GLOSAR = [
    ["Consiliul Local", "consiliu(l)? local", "Autoritatea deliberativă a orașului: consilierii aleși, care adoptă hotărâri (bugetul, taxele, investițiile, regulamentele). E o instituție diferită de primar și de primărie."],
    ["Primarul", "primarul", "Autoritatea executivă a orașului: pune în aplicare hotărârile consiliului, execută bugetul, conduce aparatul de specialitate și emite dispoziții."],
    ["Primăria", "primări(a|ei)", "Structura care duce la îndeplinire hotărârile consiliului și dispozițiile primarului: primarul, viceprimarul, secretarul general și aparatul de specialitate. Nu are personalitate juridică; persoana juridică e Municipiul Rădăuți."],
    ["Aparatul de specialitate", "aparatul(ui)? de specialitate", "Funcționarii și angajații primarului, organizați în direcții și compartimente după organigrama aprobată de consiliul local."],
    ["Secretarul general", "secretar(ul)? general", "Funcționar public de conducere al municipiului: avizează legalitatea proiectelor, contrasemnează hotărârile și dispozițiile și ține evidența lor."],
    ["Viceprimar", "viceprimar(ul)?", "Consilier local ales de consiliu, care îl înlocuiește pe primar și exercită atribuțiile pe care primarul i le deleagă."],
    ["HCL (hotărâre a consiliului local)", "HCL|[Hh]otărâri(le)? (ale )?[Cc]onsiliului", "u", "Actul prin care consiliul local decide. Hotărârile cu caracter normativ produc efecte de la aducerea la cunoștință publică, cele individuale de la comunicare. Prefectul le verifică legalitatea."],
    ["Proiect de hotărâre", "proiect(ul|e|ele)? de hotărâre", "Textul propus spre vot. Îl pot propune primarul, viceprimarul, consilierii locali sau cetățenii, prin inițiativă cetățenească. Înainte de vot primește avizul comisiilor de specialitate."],
    ["Referat de aprobare", "referat(ul)? de aprobare", "Documentul în care inițiatorul explică de ce propune hotărârea."],
    ["Raport de specialitate", "raport(ul)? de specialitate", "Analiza compartimentului de specialitate din primărie asupra unui proiect de hotărâre."],
    ["Comisie de specialitate", "comisi(e|a|ile|ilor) de specialitate", "Grup de consilieri care analizează proiectele pe domenii (buget, urbanism, juridic etc.) și dă aviz înainte de vot. Avizul e consultativ."],
    ["Ședință ordinară", "ședinț(a|ă|e) ordinar(ă|e)", "Ședința lunară a consiliului local, convocată de primar cu cel puțin 5 zile înainte."],
    ["Ședință extraordinară", "ședinț(a|ă|e) extraordinar(ă|e)", "Ședință pentru probleme care nu pot aștepta ședința lunară, convocată cu cel puțin 3 zile înainte."],
    ["Ședință de îndată", "de îndată", "Ședință convocată fără termenul obișnuit, numai în caz de forță majoră sau de maximă urgență."],
    ["Ordinea de zi", "ordine(a)? de zi", "Lista proiectelor și a celorlalte puncte discutate într-o ședință. Se face publică odată cu convocarea."],
    ["Cvorum", "cvorum(ul)?", "Ședința e legală doar dacă e prezentă majoritatea consilierilor în funcție."],
    ["Majoritate simplă", "majoritat(e|ea) simplă", "Mai mult de jumătate din consilierii prezenți la ședință."],
    ["Majoritate absolută", "majoritat(e|ea) absolută", "Mai mult de jumătate din consilierii în funcție, oricâți ar fi prezenți. E cerută, de exemplu, pentru buget și pentru împrumuturi."],
    ["Majoritate calificată", "majoritat(e|ea) calificată", "Cel puțin două treimi din consilierii în funcție, cerute de lege pentru câteva tipuri de hotărâri."],
    ["Abținere", "abțin(ere|eri|erile|ut)", "Consilierul e prezent, dar nu votează nici pentru, nici împotrivă. Regulamentul consiliului prevede că abținerile se numără la voturile împotrivă."],
    ["Proces-verbal", "proces(e)?-verbal(e)?", "Documentul care consemnează ce s-a discutat și cum s-a votat într-o ședință. Se aprobă în ședința următoare și se publică."],
    ["Dispoziție", "dispoziți(a|e|ile|ilor) primarului", "Actul prin care decide primarul: convocări, numiri, ajutoare sociale, comisii. Secretarul general îi contrasemnează legalitatea."],
    ["Buget local", "buget(ul)? local", "Planul anual al veniturilor și cheltuielilor orașului. Îl aprobă consiliul local și îl execută primarul. Proiectul se publică, iar locuitorii pot depune contestații în 15 zile."],
    ["Rectificare bugetară", "rectific(are|ări|area)( bugetar(ă|e))?", "Modificarea bugetului în timpul anului, aprobată tot prin hotărâre a consiliului local."],
    ["Execuție bugetară", "execuți(a|e) bugetar(ă|e)|execuți(a|ei) bugetului", "Ce s-a încasat și ce s-a plătit efectiv, față de ce s-a planificat în buget."],
    ["Excedent", "excedent(ul)?", "Bani rămași la sfârșitul anului (veniturile au fost mai mari decât cheltuielile). Se pot folosi în anii următori, mai ales pentru investiții."],
    ["Indicatori tehnico-economici", "indicator(ii|ilor) tehnico-economici", "Datele de bază ale unei investiții, aprobate de consiliu: valoarea totală, durata lucrărilor și ce se construiește (de exemplu metri de stradă)."],
    ["SF și DALI", "SF|DALI|[Ss]tudiu(l)? de fezabilitate", "u", "Documentațiile pe baza cărora se aprobă o investiție: studiul de fezabilitate (SF), pentru o construcție nouă, sau documentația de avizare a lucrărilor de intervenție (DALI), pentru reparații și modernizări."],
    ["Achiziție directă", "achiziți(e|a|i|ile) direct(ă|e)", "Cumpărare fără licitație, permisă de Legea nr. 98/2016 doar sub anumite praguri de valoare."],
    ["Licitație", "licitați(e|a|i|ile)( deschis(ă|e))?|procedur(ă|a) simplificat(ă|e)", "Procedură prin care orice firmă interesată poate face o ofertă; contractul se dă ofertei care îndeplinește condițiile și e cea mai avantajoasă."],
    ["SICAP", "SICAP|SEAP", "u", "Sistemul electronic de achiziții publice (e-licitatie.ro), unde instituțiile publică licitațiile, achizițiile directe și contractele."],
    ["Consultare publică", "consultar(e|ea) public(ă|e)|transparenț(a|ă) decizional(ă|e)", "Proiectele de acte normative se publică cu cel puțin 30 de zile înainte de vot, iar oricine poate trimite propuneri în termenul din anunț, de cel puțin 10 zile (Legea nr. 52/2003)."],
    ["Dezbatere publică", "dezbater(e|ea|i) public(ă|e)", "Întâlnire în care proiectul se discută cu cetățenii. Se organizează obligatoriu dacă o cere în scris o asociație legal constituită sau o altă autoritate publică."],
    ["Informații de interes public", "informați(i|ile) de interes public|544/2001", "Oricine poate cere informații de interes public, fără să explice de ce. Răspunsul vine în 10 zile, cel mult 30 de zile când informația e greu de găsit (Legea nr. 544/2001)."],
    ["Certificat de urbanism", "certificat(e|ul|ele)? de urbanism", "Act de informare: spune ce se poate construi pe un teren și ce avize trebuie. Nu dă dreptul de a construi."],
    ["Autorizație de construire", "autorizați(e|a|i|ile) de construire", "Actul emis de primar pe baza căruia se pot face lucrările de construire. Lucrările trebuie începute în termenul de valabilitate."],
    ["PUG", "PUG|[Pp]lan(ul)? [Uu]rbanistic [Gg]eneral", "u", "Planul urbanistic general: regulile pentru tot orașul, adică ce se poate construi, unde și cât de înalt, ce rămâne spațiu verde, pe unde trec străzile."],
    ["PUZ", "PUZ|[Pp]lan(ul)? [Uu]rbanistic [Zz]onal", "u", "Plan urbanistic pentru o zonă anume, care poate schimba regulile din PUG pentru acea zonă. Se aprobă de consiliul local."],
    ["PUD", "PUD|[Pp]lan(ul)? [Uu]rbanistic de [Dd]etaliu", "u", "Plan pentru o parcelă, care stabilește cum se amplasează construcția față de vecini și de stradă."],
    ["Domeniul public", "domeniul(ui)? public", "Bunurile de uz sau de interes public (străzi, parcuri, școli). Nu pot fi vândute; pot fi concesionate, închiriate sau date în administrare ori în folosință gratuită."],
    ["Domeniul privat", "domeniul(ui)? privat", "Bunurile orașului care pot fi vândute, concesionate sau închiriate, ca orice proprietate."],
    ["Concesionare", "concesion(are|area|ări|at)", "Dreptul dat cuiva de a folosi un bun al orașului pe o perioadă determinată, în schimbul unei plăți anuale (redevența)."],
    ["Dare în administrare", "da(re|rea|rii) în administrare", "Bunul rămâne al orașului, dar îl gestionează o instituție publică (o școală, spitalul) sau, la servicii publice, operatorul."],
    ["Delegarea gestiunii", "delegar(e|ea)( a)? gestiunii", "Orașul încredințează unui operator un serviciu public (termoficare, iluminat, salubrizare), prin contract."],
    ["AGA", "AGA|[Aa]dunar(ea|ii) general(ă|e) a acționarilor", "u", "Adunarea generală a acționarilor unei societăți a orașului. Orașul votează acolo prin reprezentanții desemnați de consiliul local."],
    ["Consiliu de administrație", "consiliu(l|lui)? de administrație", "Conduce societatea între ședințele AGA. Membrii se aleg printr-o procedură de selecție (OUG nr. 109/2011 privind guvernanța corporativă)."],
    ["Subvenție", "subvenți(e|a|ii|ia)", "Partea din preț plătită din bugetul local, adică din banii tuturor locuitorilor, ca utilizatorii serviciului să plătească mai puțin. La termoficare: diferența dintre prețul întreg și prețul plătit de cei racordați."],
    ["Gcal și MWh", "Gcal|MWh", "u", "Unități pentru cantitatea de căldură. 1 Gcal = 1,163 MWh. Prețurile mai vechi erau date pe Gcal, cele noi pe MWh."],
    ["ADI", "ADI|[Aa]sociați(e|a|ei) de dezvoltare intercomunitară", "u", "Asociație de dezvoltare intercomunitară: orașe și comune care se asociază pentru un serviciu comun, cum e gestionarea deșeurilor la nivelul județului."],
    ["Impozit și taxă", "impozit(e|ul|ele)? și tax(e|ele)", "Impozitul (de exemplu pe clădiri) se plătește fără un serviciu anume în schimb; taxa se plătește pentru un serviciu sau o activitate (de exemplu taxa de salubrizare). Le stabilește consiliul local, în limitele Codului fiscal."],
    ["Finanțare nerambursabilă", "finanțăr(i|ile) nerambursabile|finanțare nerambursabilă", "Bani din bugetul local dați prin concurs de proiecte asociațiilor, fundațiilor și cluburilor sportive, pentru activități de interes public local (Legea nr. 350/2005)."],
    ["Fonduri europene și PNRR", "PNRR|[Ff]onduri europene|[Cc]ofinanțare", "u", "Bani primiți pentru proiecte, care nu trebuie dați înapoi dacă proiectul se face cum s-a promis. Orașul pune de obicei și o parte proprie (cofinanțarea)."],
    ["Acord-cadru", "acord(uri|ul)?(-| )cadru", "Înțelegere pe mai mulți ani, cu o valoare maximă; banii se cheltuie prin comenzi concrete (contracte subsecvente)."],
    ["Contract subsecvent", "contract(e|ul)? subsecvent(e)?", "O comandă concretă făcută în baza unui acord-cadru."],
    ["CPV", "CPV", "Codul care arată ce anume se cumpără (din vocabularul comun al achizițiilor publice).", "u"],
    ["Organigramă", "organigram(a|ă)", "Structura instituției: direcții, servicii, compartimente și numărul de posturi. O aprobă consiliul local."],
    ["Funcție publică", "funcți(e|i) public(ă|e)", "Post ocupat de un funcționar public, cu statutul prevăzut de Codul administrativ."],
    ["Personal contractual", "personal contractual", "Angajați cu contract individual de muncă, nu funcționari publici."],
    ["Examen de promovare", "examen(ul)? de promovare", "Concursul prin care un angajat trece într-un grad sau o treaptă profesională mai mare."],
    ["OCR", "OCR", "Citirea automată a textului din documentele scanate. Poate avea greșeli.", "u"]
  ];
  var GLOSAR_RX = GLOSAR.map(function (g) {   // termenii scriși cu litere mari (HCL, PUZ) se potrivesc exact; ceilalți și cu articol sau terminație („rectificarea”)
    try { return [new RegExp("(^|[^\\p{L}])(" + g[1] + (g[3] ? "" : "\\p{L}{0,4}") + ")(?![\\p{L}])", g[3] || "iu"), g[2]]; } catch (e) { return [/(?!)/, g[2]]; }
  });
  function glosar(root) {
    var GL_FACUTE = {};   // un termen e explicat o singură dată pe pagină
    Array.prototype.forEach.call(root.querySelectorAll("abbr.gl"), function (a) { GL_FACUTE[a.dataset.gi] = 1; });
    var cand = root.querySelectorAll(".page-head>p, .page-head details p, .section>h2, .section>.note, .section>p, .tile .lbl, .tile .sub, th, .doc .t, .lc-t, .an-i span, .cf p, .cf li, .sc-c p");
    Array.prototype.forEach.call(cand, function (c) {
      if (c.dataset.gl) return; c.dataset.gl = "1";
      GLOSAR_RX.forEach(function (g, gi) {
        if (GL_FACUTE[gi]) return;
        var w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { return n.parentNode.closest("a,button,abbr,summary,select,option,.gl") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } }), n;
        while ((n = w.nextNode())) {
          var m = g[0].exec(n.nodeValue);
          if (!m) continue;
          var st = m.index + m[1].length, t = n.splitText(st); t.splitText(m[2].length);
          var a = document.createElement("abbr"); a.className = "gl"; a.tabIndex = 0; a.dataset.def = g[1]; a.dataset.gi = gi; a.textContent = t.nodeValue;
          t.parentNode.replaceChild(a, t); GL_FACUTE[gi] = 1; break;
        }
      });
    });
  }
  // notele lungi de sub tabele și grafice („cum citești datele”) se strâng sub un „ⓘ”: rămân la un click distanță
  function strangeNote(root) {
    Array.prototype.forEach.call(root.querySelectorAll("p.note:not([data-s])"), function (p) {
      p.dataset.s = "1";
      if (p.textContent.length < 170 || p.closest("details, .sx-feed, .share-m")) return;
      var d = document.createElement("details"); d.className = "info";
      d.innerHTML = "<summary>Cum citești datele</summary>";
      p.parentNode.insertBefore(d, p); d.appendChild(p);
    });
    // pe telefon, sub-meniul se derulează orizontal: tab-ul activ trebuie să fie la vedere
    Array.prototype.forEach.call(root.querySelectorAll(".subnav:not([data-s]), .svc-nav:not([data-s])"), function (n) {
      n.dataset.s = "1";
      var a = n.querySelector('a[aria-current="page"]');
      if (a && n.scrollWidth > n.clientWidth) n.scrollLeft = Math.max(0, a.offsetLeft - n.offsetLeft - 24);
    });
    // tabelele foarte lungi: primele 15 rânduri, restul la un click
    Array.prototype.forEach.call(root.querySelectorAll("table:not([data-s])"), function (t) {
      t.dataset.s = "1";
      var rs = t.tBodies[0] ? t.tBodies[0].rows : [];
      if (rs.length <= 25 || t.closest("details")) return;
      for (var i = 15; i < rs.length; i++) rs[i].hidden = true;
      var b = document.createElement("button"); b.type = "button"; b.className = "more"; b.textContent = "Arată toate cele " + nr(rs.length) + " rânduri";
      b.addEventListener("click", function () { for (var j = 0; j < rs.length; j++) rs[j].hidden = false; b.remove(); });
      var w = t.closest(".tw") || t; w.parentNode.insertBefore(b, w.nextSibling);
    });
    glosar(root);
  }
  if (window.MutationObserver) new MutationObserver(function () { var a = $("app"); if (a) strangeNote(a); }).observe(document.getElementById("app"), { childList: true, subtree: true });

  function tile(lbl, val, unit, sub, href) {
    var tag = href ? 'a class="card tile" href="' + href + '"' : 'div class="card tile"';
    return "<" + tag + '><div class="lbl">' + esc(lbl) + '</div><div class="val">' + val + (unit ? "<small>" + esc(unit) + "</small>" : "") +
      '</div><div class="sub">' + (sub || "") + "</div></" + (href ? "a" : "div") + ">";
  }

  // ---------- grafic cu coloane (simple, stivuite sau cu „pistă”) ----------
  // cfg: {cats:[...], series:[{name, color, values:[...]}], stacked, track:{name, values}, gaps:{cat:"text"}, unit}
  function chart(el, cfg) {
    function draw() {
      if (!cfg.cats.length) { el.innerHTML = ""; return; }
      var W = Math.max(cfg.minW || 280, el.clientWidth || 600), H = cfg.h || 220, m = { t: 18, r: 8, b: 26, l: 36 };
      var n = cfg.cats.length, iw = W - m.l - m.r, ih = H - m.t - m.b, band = iw / n;
      var bw = Math.min(cfg.bwMax || 24, band * 0.62);
      var tot = cfg.cats.map(function (_, i) {
        var v = cfg.stacked ? cfg.series.reduce(function (a, s) { return a + (s.values[i] || 0); }, 0)
          : Math.max.apply(null, cfg.series.map(function (s) { return s.values[i] || 0; }));
        return Math.max(v, cfg.track ? (cfg.track.values[i] || 0) : 0, cfg.line ? (cfg.line.values[i] || 0) : 0,
          Math.max.apply(null, (cfg.lines || []).map(function (l) { return l.values[i] || 0; }).concat([0])));
      });
      var max = Math.max.apply(null, tot.concat([1]));
      var step = Math.pow(10, Math.floor(Math.log10(max))); var nice = Math.ceil(max / step) * step;
      if (nice / step <= 2) step /= 2; if (nice / step > 6) step *= 2; nice = Math.ceil(max / step) * step;
      if (cfg.maxY) { nice = cfg.maxY; step = cfg.stepY || nice / 4; }
      var y = function (v) { return m.t + ih - (v / nice) * ih; };
      var lat = cfg.minW && W > (el.clientWidth || W);   // mai lat decât ecranul: se derulează orizontal, cu textul la mărimea lui
      el.classList.toggle("chart-lat", !!lat);
      var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(cfg.label || "") + '"' + (cfg.onClick ? ' class="clic"' : "") + (lat ? ' style="width:' + W + 'px"' : "") + ">";
      s += '<g class="grid">';
      for (var g = 0; g <= nice + 1e-9; g += step) s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(g) + '" y2="' + y(g) + '"/>';
      s += '</g><g class="axis">';
      for (g = 0; g <= nice + 1e-9; g += step) s += '<text x="' + (m.l - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + (cfg.yFmt ? cfg.yFmt(g) : step < 1 ? dec(+g.toFixed(1)) : nr(Math.round(g))) + "</text>";
      var every = band < 20 ? 3 : band < 30 ? 2 : 1;
      cfg.cats.forEach(function (c, i) { if (i % every === 0 || i === n - 1) s += '<text x="' + (m.l + band * i + band / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(c) + "</text>"; });
      s += "</g>";
      function rect(x, y0, y1, w, color, round) {
        var h = Math.max(0, y0 - y1); if (h < 0.5) return "";
        var r = round ? Math.min(4, h, w / 2) : 0;
        return '<path fill="' + color + '" d="M' + x + "," + y0 + "V" + (y1 + r) + (r ? "Q" + x + "," + y1 + " " + (x + r) + "," + y1 : "") +
          "H" + (x + w - r) + (r ? "Q" + (x + w) + "," + y1 + " " + (x + w) + "," + (y1 + r) : "") + "V" + y0 + 'Z"/>';
      }
      cfg.cats.forEach(function (c, i) {
        var x = m.l + band * i + (band - bw) / 2;
        s += '<g class="col" data-i="' + i + '">';
        if (cfg.gaps && cfg.gaps[c] != null) {
          s += '<text class="gap-lbl" x="' + (x + bw / 2) + '" y="' + (y(0) - 6) + '" text-anchor="middle">' + esc(cfg.gaps[c]) + "</text>";
        }
        if (cfg.track && cfg.track.values[i]) s += rect(x, y(0), y(cfg.track.values[i]), bw, "var(--track)", true);
        if (cfg.grouped) {   // bare alăturate (ex. venituri și cheltuieli în același an)
          var ns = cfg.series.length, gw = Math.min(16, band * 0.8 / ns), x0 = m.l + band * i + (band - gw * ns - 2 * (ns - 1)) / 2;
          cfg.series.forEach(function (sr, k) { if (sr.values[i]) s += rect(x0 + k * (gw + 2), y(0), y(sr.values[i]), gw, sr.color, true); });
          s += '<rect class="hit" x="' + (m.l + band * i) + '" y="' + m.t + '" width="' + band + '" height="' + ih + '"/></g>';
          return;
        }
        var base = 0, segs = cfg.series.filter(function (sr) { return sr.values[i]; });
        segs.forEach(function (sr, k) {
          var v = sr.values[i], top = cfg.stacked ? base + v : v;
          var y0 = y(cfg.stacked ? base : 0), y1 = y(top);
          if (cfg.stacked && k > 0) y0 -= 2;   // 2px spațiu între segmente
          s += rect(x, y0, y1, bw, sr.color, !cfg.stacked || k === segs.length - 1);
          if (cfg.segLabel && y0 - y1 >= 13) {   // cifra în interiorul segmentului, când încape
            var tl = cfg.segLabel(sr, i, v);
            if (tl != null) s += '<text class="seg-lbl" x="' + (x + bw / 2) + '" y="' + ((y0 + y1) / 2 + 3.5) + '" text-anchor="middle">' + esc(tl) + "</text>";
          }
          base = top;
        });
        var lab = cfg.labelValue ? cfg.labelValue(i) : null;
        if (lab != null) s += '<text class="lbl" x="' + (x + bw / 2) + '" y="' + (y(tot[i]) - 5) + '" text-anchor="middle">' + esc(lab) + "</text>";
        s += '<rect class="hit" x="' + (m.l + band * i) + '" y="' + m.t + '" width="' + band + '" height="' + ih + '"/></g>';
      });
      (cfg.lines || []).forEach(function (l, k) {   // mai multe linii (fără bare), cu cifra la fiecare punct când e loc
        var P = [];
        l.values.forEach(function (v, i) { if (v != null) P.push([m.l + band * i + band / 2, y(Math.max(0, v)), v, i]); });
        s += '<polyline points="' + P.map(function (p) { return p[0] + "," + p[1]; }).join(" ") + '" fill="none" stroke="' + l.color + '" stroke-width="2.5" pointer-events="none"/>' +
          P.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.2" fill="' + l.color + '" pointer-events="none"/>' +
            (cfg.lineLabel && (band >= 34 || p[3] % 2 === 0 || p[3] === n - 1) ? '<text class="ln-lbl" x="' + p[0] + '" y="' + (p[1] + (k % 2 ? 14 : -7)) + '" text-anchor="middle" fill="' + l.color + '">' + esc(cfg.lineLabel(l, p[3], p[2])) + "</text>" : ""); }).join("");
      });
      if (cfg.line) {   // o linie peste bare (ex. datoria cumulată); valorile negative se opresc la 0
        var pts = cfg.line.values.map(function (v, i) { return (m.l + band * i + band / 2) + "," + y(Math.max(0, v || 0)); });
        s += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + cfg.line.color + '" stroke-width="2" pointer-events="none"/>' +
          pts.map(function (p) { var q = p.split(","); return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="3" fill="' + cfg.line.color + '" pointer-events="none"/>'; }).join("");
      }
      s += "</svg>";
      el.innerHTML = s + '<div class="tip"></div>';
      if (lat) el.scrollLeft = el.scrollWidth;   // pe telefon, întâi perioadele cele mai noi
      var tip = el.querySelector(".tip");
      Array.prototype.forEach.call(el.querySelectorAll("g.col"), function (gEl) {
        var i = +gEl.getAttribute("data-i");
        gEl.addEventListener("mousemove", function (ev) {
          var r = el.getBoundingClientRect();
          tip.innerHTML = cfg.tooltip(i); tip.style.display = "block";
          var x = Math.min(Math.max(ev.clientX - r.left, 90), r.width - 90);
          tip.style.left = x + "px"; tip.style.top = (ev.clientY - r.top) + "px";
        });
        gEl.addEventListener("mouseleave", function () { tip.style.display = "none"; });
        if (cfg.onClick) gEl.addEventListener("click", function () { cfg.onClick(i); });
      });
    }
    draw();
    var t; window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(function () { if (document.body.contains(el)) draw(); }, 150); });
  }
  function legend(items) {
    return '<div class="legend">' + items.map(function (it) { return '<span><i style="background:' + it[1] + '"></i>' + esc(it[0]) + "</span>"; }).join("") + "</div>";
  }

  // ---------- liste filtrabile ----------
  function lista(el, items, opt) {
    var shown = 25;
    var ani = {};
    items.forEach(function (x) { var a = opt.an(x); if (a) ani[a] = 1; });
    var extra = opt.extraFilter ? opt.extraFilter.html : "";
    el.innerHTML = '<div class="filters"><input type="search" placeholder="' + esc(opt.placeholder || "Caută în titluri") + '" aria-label="Caută">' +
      (opt.faraAn ? "" : '<select aria-label="Anul"><option value="">Toți anii</option>' + Object.keys(ani).sort().reverse().map(function (a) { return "<option>" + esc(a) + "</option>"; }).join("") + "</select>") + extra +
      '</div><p class="count" aria-live="polite"></p><div class="items"></div><button class="more" hidden>Arată mai multe</button>';
    var q = el.querySelector("input"), toateSel = Array.prototype.slice.call(el.querySelectorAll("select")), sel = opt.faraAn ? null : toateSel[0], exs = opt.faraAn ? toateSel : toateSel.slice(1);
    function filt() {
      var t = norm(q.value).trim(), a = sel ? sel.value : "", vals = exs.map(function (s) { return s.value; }), e = vals.join("");
      if (exs.length === 1) e = vals[0];
      return items.filter(function (x) {
        return (!a || opt.an(x) === a) && (!e || opt.extraFilter.test(x, e, vals)) && (!opt.extern || opt.extern(x)) && (!t || norm(opt.text(x)).indexOf(t) >= 0);
      });
    }
    function draw() {
      var f = filt();
      var un = opt.unitate || ["document", "documente"];
      el.querySelector(".count").textContent = nr(f.length) + " " + (f.length === 1 ? un[0] : un[1]);
      el.querySelector(".items").innerHTML = f.slice(0, shown).map(opt.item).join("") || '<p class="empty">Niciun document găsit.</p>';
      el.querySelector(".more").hidden = f.length <= shown;
    }
    q.addEventListener("input", function () { shown = 25; draw(); });
    if (sel) sel.addEventListener("change", function () { shown = 25; draw(); });
    exs.forEach(function (ex) { ex.addEventListener("change", function () { shown = 25; draw(); }); });
    el.querySelector(".more").addEventListener("click", function () { shown += 50; draw(); });
    draw();
    return { draw: function () { shown = 25; draw(); } };
  }
  function linkuri(x) {
    var o = [], p = safeUrl(x.pagina), f = safeUrl(x.pdf);
    if (p) o.push('<a class="lk" href="' + esc(p) + '" rel="noopener">pagina</a>');
    if (f) o.push('<a class="lk" href="' + esc(f) + '" rel="noopener">PDF</a>');
    (x.alte_pdf || []).forEach(function (u, i) { if (safeUrl(u)) o.push('<a class="lk" href="' + esc(u) + '" rel="noopener">PDF ' + (i + 2) + "</a>"); });
    if (INTERN && f && WORD[f]) o.push('<a class="lk" href="texte/' + WORD[f].split("/").map(encodeURIComponent).join("/") + '">text (Word)</a>');
    if (x.scanat === 1) o.push('<span class="tag" title="Document scanat: textul nu poate fi căutat și nu e citit de cititoarele de ecran">scanat</span>');
    return o.join("");
  }
  function doc(id, title, meta, x) {
    return '<div class="doc"><div class="h"><span class="id">' + id + '</span></div><div class="t">' + esc(title || "(fără titlu)") +
      '</div><div class="m">' + (meta ? "<span>" + meta + "</span>" : "") + linkuri(x) + "</div></div>";
  }

  // ---------- Căutare în textul documentelor (OCR), doar intern ----------
  var FT = null, FT_SH = {}, FT_TXT = {};
  var FELURI = { hcl: "Hotărâre", pv: "Proces-verbal", proiecte: "Proiect de hotărâre", contracte: "Contract", buget: "Buget", bilanturi: "Bilanț",
    cu: "Registru certificate", ac: "Registru autorizații", arhiva: "Arhiva veche", altele: "Alt document" };
  function ftMeta() {
    if (FT) return Promise.resolve(FT);
    return get(FTDATA + "cautare/docs.json").then(function (m) { FT = m; FT.comuneS = {}; (m.comune || []).forEach(function (w) { FT.comuneS[w] = 1; }); FT.bucS = {}; (m.bucati || []).forEach(function (b) { FT.bucS[b] = 1; }); return FT; });
  }
  function ftBucata(k) {
    if (FT_SH[k]) return FT_SH[k];
    FT_SH[k] = FT.bucS[k] ? get(FTDATA + "cautare/idx/" + k + ".json?v=" + encodeURIComponent(FT.generat_la)).catch(function () { return {}; }) : Promise.resolve({});
    return FT_SH[k];
  }
  function ftNormPoz(t) {   // fără diacritice, litere mici, aceeași lungime (pozițiile rămân aceleași)
    var o = "";
    for (var i = 0; i < t.length; i++) { var c = t[i], b = c.normalize("NFD")[0] || c, l = b.toLowerCase(); o += l.length === 1 ? l : b; }
    return o;
  }
  function ftInterpreteaza(q) {
    var fraze = [], rest = String(q || "").replace(/"([^"]+)"|„([^”]+)”/g, function (_, a, b) { fraze.push(norm(a || b).replace(/\s+/g, " ").trim()); return " " + (a || b) + " "; });
    var tok = (norm(rest).match(/[a-z0-9]+/g) || []).filter(function (w) { return w.length >= 3; });
    return { tok: tok.filter(function (w, i) { return tok.indexOf(w) === i; }), fraze: fraze.filter(Boolean) };
  }
  function ftCauta(q, feluri) {
    var Q = ftInterpreteaza(q);
    return ftMeta().then(function (M) {
      var tok = Q.tok.filter(function (w) { return !M.comuneS[w]; }), ignorate = Q.tok.filter(function (w) { return M.comuneS[w]; });
      if (!tok.length) return { ids: [], tok: Q.tok, fraze: Q.fraze, ignorate: ignorate, gol: true };
      return Promise.all(tok.map(function (w) {
        return ftBucata(w.slice(0, 2)).then(function (sh) {
          var set = {}, n = 0;
          Object.keys(sh).forEach(function (k) {
            if (k.indexOf(w) !== 0 || n > 400) return; n++;
            var p = 0; sh[k].forEach(function (d) { p += d; set[p] = 1; });
          });
          return set;
        });
      })).then(function (sets) {
        var ids = Object.keys(sets[0]).map(Number).filter(function (i) { return sets.every(function (s) { return s[i]; }); });
        if (feluri) ids = ids.filter(function (i) { return feluri.indexOf(M.docs[i][1]) >= 0; });
        ids.sort(function (a, b) { return (M.docs[b][3] || "").localeCompare(M.docs[a][3] || ""); });
        return { ids: ids, tok: Q.tok, fraze: Q.fraze, ignorate: ignorate };
      });
    });
  }
  function ftText(id) {
    if (!FT_TXT[id]) FT_TXT[id] = fetch(FTDATA + "cautare/txt/" + id + ".txt", { cache: "force-cache" }).then(function (x) { return x.ok ? x.text() : ""; }).catch(function () { return ""; });
    return FT_TXT[id];
  }
  function ftFragment(text, R) {
    var n = ftNormPoz(text), cuv = R.fraze.concat(R.tok), poz = -1, i;
    for (i = 0; i < cuv.length && poz < 0; i++) poz = n.indexOf(cuv[i]);
    if (poz < 0) return "";
    var a = Math.max(0, poz - 140), b = Math.min(text.length, poz + 220);
    var bucata = text.slice(a, b).replace(/\s+/g, " "), nb = ftNormPoz(bucata), marc = [];
    cuv.forEach(function (w) { var j = 0; while ((j = nb.indexOf(w, j)) >= 0) { var k = j + w.length; while (k < nb.length && /[a-z0-9]/.test(nb[k])) k++; marc.push([j, k]); j = k; } });
    marc.sort(function (x, y) { return x[0] - y[0]; });
    var h = "", p = 0;
    marc.forEach(function (m) { if (m[0] < p) return; h += esc(bucata.slice(p, m[0])) + "<mark>" + esc(bucata.slice(m[0], m[1])) + "</mark>"; p = m[1]; });
    return (a > 0 ? "… " : "") + h + esc(bucata.slice(p)) + (b < text.length ? " …" : "");
  }
  function ftItem(d) {
    var f = safeUrl(d[7]), w = f && WORD[f];
    var titlu = d[6] ? '<a href="' + esc(d[6]) + '">' + esc(d[2] || "(fără titlu)") + "</a>" : esc(d[2] || "(fără titlu)");
    return '<div class="doc ft" data-id="' + esc(d[0]) + '"><div class="h"><span class="tag">' + esc(FELURI[d[1]] || d[1]) + "</span>" + (d[3] ? '<span class="muted">' + esc(zi(d[3])) + "</span>" : "") + "</div>" +
      '<div class="t">' + titlu + '</div><div class="fr muted">se încarcă fragmentul...</div><div class="m">' +
      (f ? '<a href="' + esc(f) + '" rel="noopener">PDF</a>' : "") + (w ? '<a href="texte/' + w.split("/").map(encodeURIComponent).join("/") + '">text (Word)</a>' : "") + "</div></div>";
  }
  function ftBox(el, opt) {
    opt = opt || {};
    var fel = opt.feluri ? null : (opt.fel || "");
    el.innerHTML = '<div class="filters"' + (opt.ascuns ? " hidden" : "") + '><input type="search" class="ft-q" value="' + esc(opt.q || "") + '" placeholder="' + esc(opt.placeholder || "Cuvinte din text (ex. Putnei iluminat); „expresie exactă” între ghilimele") + '" aria-label="Caută în text">' +
      (opt.feluri ? "" : '<select class="ft-f" aria-label="Felul documentului"><option value="">Toate documentele</option>' + Object.keys(FELURI).map(function (k) { return '<option value="' + k + '"' + (k === fel ? " selected" : "") + ">" + FELURI[k] + "</option>"; }).join("") + "</select>") +
      "</div>" + (opt.ascuns ? "" : '<p class="note">Caută în textul complet al documentelor, inclusiv al celor scanate (text recunoscut automat, poate avea greșeli). Găsește documentele care conțin toate cuvintele; poți scrie doar începutul unui cuvânt.</p>') + '<div class="ft-out"></div>';
    var inp = el.querySelector(".ft-q"), sel = el.querySelector(".ft-f"), out = el.querySelector(".ft-out"), t, nrCerere = 0;
    function porneste() {
      var q = inp.value.trim(), cerere = ++nrCerere;
      if (opt.onQuery) opt.onQuery(q);
      if (norm(q).replace(/[^a-z0-9]/g, "").length < 3) { out.innerHTML = ""; return; }
      out.innerHTML = '<p class="updated">Se caută...</p>';
      var fel2 = opt.feluri || (sel && sel.value ? [sel.value] : null);
      ftCauta(q, fel2).then(function (R) {
        if (cerere !== nrCerere) return;
        if (R.gol) { out.innerHTML = '<p class="empty">' + (R.ignorate.length ? "Cuvintele „" + esc(R.ignorate.join(", ")) + "” apar în aproape toate documentele; adaugă un cuvânt mai specific." : "Scrie cuvinte de cel puțin trei litere.") + "</p>"; return; }
        var shown = 0, vizibile = 0, verificate = 0;
        out.innerHTML = '<p class="count"></p><div class="ft-l"></div><button class="more" hidden>Arată mai multe</button>';
        var cnt = out.querySelector(".count"), lst = out.querySelector(".ft-l"), more = out.querySelector(".more");
        function eticheta() {
          cnt.textContent = R.fraze.length ? nr(vizibile) + " cu expresia exactă, din " + nr(verificate) + " verificate (" + nr(R.ids.length) + " documente au toate cuvintele)" :
            nr(R.ids.length) + (R.ids.length === 1 ? " document" : " documente") + (R.ignorate.length ? " (ignorat, prea comun: " + R.ignorate.join(", ") + ")" : "");
        }
        function arata(n) {
          var bucata = R.ids.slice(shown, shown + n); shown += bucata.length;
          lst.insertAdjacentHTML("beforeend", bucata.map(function (i) { return ftItem(FT.docs[i]); }).join(""));
          more.hidden = shown >= R.ids.length;
          bucata.forEach(function (i) {
            var d = FT.docs[i];
            ftText(d[0]).then(function (text) {
              if (cerere !== nrCerere) return;
              var it = lst.querySelector('.ft[data-id="' + d[0] + '"]'); if (!it) return;
              verificate++;
              var ok = R.fraze.every(function (f) { return ftNormPoz(text).replace(/\s+/g, " ").indexOf(f) >= 0; });
              if (!ok) { it.remove(); eticheta(); return; }
              vizibile++;
              it.querySelector(".fr").innerHTML = ftFragment(text, R) || "";
              eticheta();
            });
          });
          eticheta();
        }
        more.addEventListener("click", function () { arata(30); });
        if (!R.ids.length) { out.innerHTML = '<p class="empty">Niciun document nu conține toate cuvintele.</p>'; return; }
        arata(opt.cate || 20);
      }).catch(function () { out.innerHTML = '<p class="note">Căutarea în text devine disponibilă după următoarea colectare.</p>'; });
    }
    inp.addEventListener("input", function () { clearTimeout(t); t = setTimeout(porneste, 400); });
    if (sel) sel.addEventListener("change", porneste);
    if (opt.q) porneste();
  }
  function ftSectiune(titlu, feluri, ph) {
    return '<section class="card section"><h2>' + esc(titlu) + '</h2><div class="ft-box" data-f="' + esc(feluri.join(",")) + '" data-p="' + esc(ph || "") + '"></div></section>';
  }
  function ftLeaga(el) {
    Array.prototype.forEach.call(el.querySelectorAll(".ft-box"), function (b) { ftBox(b, { feluri: b.dataset.f.split(","), placeholder: b.dataset.p || null }); });
  }

  // ---------- pagini ----------
  function acasa() {
    var I = BASE + "assets/img/";
    var hero = '<figure class="hero"><picture>' +
      '<source media="(max-width:640px)" type="image/webp" srcset="' + I + 'banner-mobil.webp">' +
      '<source media="(max-width:640px)" srcset="' + I + 'banner-mobil.jpg">' +
      '<source type="image/webp" srcset="' + I + 'banner-1200.webp 1200w, ' + I + 'banner-1975.webp 1975w" sizes="(max-width:1080px) 100vw, 1048px">' +
      '<img src="' + I + 'banner-1200.jpg" srcset="' + I + 'banner-1200.jpg 1200w, ' + I + 'banner-1975.jpg 1975w" sizes="(max-width:1080px) 100vw, 1048px" width="1975" height="472" ' +
      'alt="Monitor local, un proiect Rădăuțiul Civic: informații publice, pentru o comunitate mai transparentă și mai implicată." fetchpriority="high">' +
      "</picture></figure>";
    var h = hero + head(INTERN ? "Ce publică Primăria Municipiului Rădăuți" : "Ce se întâmplă în Rădăuți",
      INTERN ? "Monitorul verifică zilnic actele publicate de primărie și consiliul local, din surse publice." : "Din documentele publice ale primăriei, verificate zilnic. Fiecare cifră duce la documentul-sursă.");
    var pe = IND.hcl_pe_ani || {}, ani = Object.keys(pe).sort();
    var total = ani.reduce(function (a, y) { return a + pe[y].gasite; }, 0);
    var lag = IND.hcl_intarziere_publicare || {}, ultim = Object.keys(lag).filter(function (y) { return lag[y].fiabil !== false; }).sort().pop();
    var sed = IND.sedinte_pe_tip || {}, an = Object.keys(sed).sort().pop(), s = an ? sed[an] : {};
    var nS = Object.keys(s).reduce(function (a, k) { return a + s[k]; }, 0), nEx = (s.extraordinara || 0) + (s.extraordinara_de_indata || 0);
    var reg = IND.registre_urbanism || {}, c = IND.contracte_site || {}, d = IND.documente || {};
    var scanPct = d.descarcate ? Math.round(100 * d.scanate / d.descarcate) : null;
    var hScan = ani.reduce(function (a, y) { return a + (pe[y].scanate || 0); }, 0);
    h += '<div id="nou-card"></div>';
    if (!INTERN) return h + '<div id="an-card"></div><div id="nou-flux"></div>' + ghid() + '<section class="card section"><div class="h-row"><h2>Servicii publice</h2><a href="#servicii">cine face fiecare serviciu și cât costă</a></div>' + svcNav("", true) + "</section>" + semnale(ultim && lag[ultim], reg.cu, scanPct, d, total ? Math.round(100 * hScan / total) : null);
    h += '<div class="grid">' +
      tile("Hotărâri de consiliu în monitor", nr(total), "", ani.length ? "din " + ani[0] + " până în " + ani[ani.length - 1] : "", "#consiliu/hcl") +
      (ultim ? tile("Durata medie de publicare a unei hotărâri (" + ultim + ")", dec(lag[ultim].medie_zile), zile(lag[ultim].medie_zile), "de la adoptare la postarea pe site; maxim <strong>" + lag[ultim].max_zile + " zile</strong>", "#consiliu/hcl") : "") +
      (an ? tile("Ședințe ale consiliului în " + an, nS, "", "<strong>" + nEx + " extraordinare</strong> sau de îndată, " + (s.ordinara || 0) + " ordinare", "#consiliu/sedinte") : "") +
      (reg.cu ? tile("Zile fără registru de urbanism publicat", nr(reg.cu.zile_neacoperite), zile(reg.cu.zile_neacoperite), "ultimul registru acoperă până la " + zi(reg.cu.ultima_perioada_pana_la), "#primarie/urbanism/cu") : "") +
      (c.zile_de_la_ultima != null ? tile("Zile de la ultimul contract publicat", nr(c.zile_de_la_ultima), zile(c.zile_de_la_ultima), "ultimul: " + zi(c.ultima_postare), "#bani/achizitii/contracte") : "") +
      (IND.litigii && IND.litigii.total ? tile("Dosare în instanță", nr(IND.litigii.total), "", "în care e parte o autoritate din Rădăuți, din " + IND.litigii.primul_an + "; <strong>" + nr(IND.litigii.in_curs) + " în curs</strong>", "#litigii/statistici") : "") +
      (IND.sicap && IND.sicap.achizitii_directe ? tile("Achiziții publice în SICAP", nr(IND.sicap.achizitii_directe), "", "achiziții directe din 2018, la " + IND.sicap.institutii + " instituții din Rădăuți; vezi furnizorii și sumele", "#bani/achizitii") : "") +
      (scanPct != null ? tile("Documente publicate doar ca scanare", scanPct + "%", "", nr(d.scanate) + " din " + nr(d.descarcate) + ": textul nu poate fi căutat și nu e accesibil cititoarelor de ecran") : "") +
      (IND.concursuri && IND.concursuri.total ? tile("Concursuri și examene de angajare", nr(IND.concursuri.total), "", "anunțate de primărie și instituțiile subordonate din " + IND.concursuri.primul_an + "; <strong>" + nr(IND.concursuri.angajare) + " pentru posturi noi</strong>, restul promovări", "#primarie/angajari/statistici") : "") +
      (scanPct == null && total ? tile("Hotărâri publicate doar ca scanare", Math.round(100 * hScan / total) + "%", "", nr(hScan) + " din " + nr(total) + ": textul nu poate fi căutat și nu e accesibil cititoarelor de ecran", "#consiliu/hcl") : "") +
      "</div>";
    if (INTERN) h += '<p class="callout">Versiunea internă: aceleași date ca versiunea publică, plus litigiile și arhiva de siguranță. Rapoartele de verificare ale ultimei colectări: <a href="date/rapoarte.zip?v=' + Date.now() + '">rapoarte.zip</a>.</p>';
    h += INTERN ? '<div id="lit-news"></div><div id="arhiva-card"></div>' : "";
    // stadiul monitorului (intern: ce acoperim, ce lipsește, ce urmează)
    var st = IND.stadiu || [], grupe = {};
    st.forEach(function (x) { (grupe[x.sectiune] = grupe[x.sectiune] || []).push(x); });
    h += '<section class="card section"><h2>Stadiul monitorului</h2><p class="note">Ce acoperim deja, ce e parțial, ce lipsește din sursele publice și ce urmează.</p>' +
      '<div class="legend-st">' + Object.keys(STARI).map(function (k) { return '<span class="chip ' + k + '"><i></i>' + STARI[k] + "</span>"; }).join("") + "</div>";
    Object.keys(grupe).forEach(function (g) {
      h += '<div class="status-group"><h3>' + esc(g) + "</h3>" + grupe[g].map(function (x) {
        return '<div class="st"><span class="chip ' + esc(x.stare) + '"><i></i>' + esc(STARI[x.stare] || x.stare) + '</span><span class="el">' + esc(x.element) + '</span><span class="det">' + esc(x.detaliu) + "</span></div>";
      }).join("") + "</div>";
    });
    return h + "</section>";
  }

  // iconițe simple (linii), desenate aici; culoarea vine din CSS (currentColor)
  var IC = {
    hcl: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    oameni: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14c3 0 5 2.2 5 5"/>',
    bani: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
    casa: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    cos: '<path d="M3 4h2.5l2.2 11h10.6L21 7H6.4"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    munca: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
    cauta: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
    harta: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    vorba: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>'
  };
  var SEC_IC = { declaratii: "hcl", despre: "vorba", mesaje: "vorba", acasa: null, strada: "casa", consiliu: "hcl", primarie: "casa", bani: "bani", servicii: "casa", salubrizare: "casa", teme: "harta", litigii: "hcl", cauta: "cauta", texte: "hcl", rezumate: "vorba", arhiva: "hcl" };
  function ic(k) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (IC[k] || "") + "</svg>"; }

  function ghid() {   // pagina de start publică: ce găsește un cetățean, cu linkuri
    var G = [["#consiliu/hcl", "hcl", "Hotărâri", "Toate, din 2013, cu votul"],
      ["#consiliu/consilieri", "oameni", "Consilieri", "Prezență și voturi"],
      ["#bani/buget", "bani", "Bugetul", "Venituri, cheltuieli, datorii"],
      ["#primarie/urbanism", "harta", "Ce se construiește", "Autorizații, pe hartă"],
      ["#bani/achizitii", "cos", "Achiziții", "Ce se cumpără, de la cine"],
      ["#primarie/angajari/statistici", "munca", "Angajări", "Concursuri și rezultate"],
      ["#strada", "casa", "Strada mea", "Tot ce privește strada ta"],
      ["#cauta", "cauta", "Caută", "Stradă, firmă, număr, cuvânt"]];
    return '<section class="card section"><h2>Ce găsești aici</h2><div class="ghid">' + G.map(function (g) {
      return '<a class="ghid-i" href="' + g[0] + '">' + ic(g[1]) + "<b>" + esc(g[2]) + "</b><span>" + esc(g[3]) + "</span></a>";
    }).join("") + "</div></section>";
  }
  // „cum publică primăria”: trei observații scurte despre transparență
  function semnale(lag, cu, scanPct, d, hclScanPct) {
    var t = [];
    if (lag) t.push(tile("Zile până o hotărâre apare pe site", dec(lag.medie_zile), "", "în medie; cel mai mult: <strong>" + lag.max_zile + " zile</strong>", "#consiliu/hcl"));
    if (cu) t.push(tile("Zile fără registru de urbanism publicat", nr(cu.zile_neacoperite), "", "ultimul acoperă până la " + zi(cu.ultima_perioada_pana_la), "#primarie/urbanism/cu"));
    if (scanPct != null) t.push(tile("Documente doar ca scanare", scanPct + "%", "", "textul nu poate fi căutat sau citit de cititoarele de ecran"));
    else if (hclScanPct != null) t.push(tile("Hotărâri doar ca scanare", hclScanPct + "%", "", "textul nu poate fi căutat sau citit de cititoarele de ecran", "#consiliu/hcl"));
    return t.length ? '<section class="card section"><h2>Cum publică primăria</h2><div class="grid mic">' + t.join("") + "</div></section>" : "";
  }
  // „Rădăuți în <an>”: cifrele mari ale anului (date/acasa.json)
  var ACASA = null;
  function anCard() {
    var el = $("an-card"); if (!el) return;
    (ACASA ? Promise.resolve(ACASA) : get(DATA + "acasa.json").then(function (d) { ACASA = d; return d; })).then(function (A) {
      if (!$("an-card")) return;
      var C = [];
      if (A.achizitii_lei) C.push(["#bani/achizitii", "cos", lei(A.achizitii_lei), "plătiți prin achiziții publice de instituțiile din oraș (" + nr(A.achizitii_nr) + " contracte și achiziții directe)"]);
      if (A.hotarari) C.push(["#consiliu/hcl", "hcl", nr(A.hotarari), "hotărâri ale consiliului local" + (A.sedinte ? ", în " + A.sedinte + " ședințe" : "")]);
      if (A.autorizatii) C.push(["#primarie/urbanism", "casa", nr(A.autorizatii), "autorizații de construire" + (A.certificate ? " și " + nr(A.certificate) + " certificate de urbanism" : "")]);
      if (A.concursuri) C.push(["#primarie/angajari/concursuri", "munca", nr(A.concursuri), "concursuri de angajare sau promovare" + (A.posturi_scoase ? ", pentru " + nr(A.posturi_scoase) + " posturi" : "")]);
      if (A.proiecte_consultare) C.push(["#consiliu/urmatoare", "vorba", nr(A.proiecte_consultare), "proiecte de hotărâre puse în consultare publică"]);
      if (!C.length) return;
      var M = A.cel_mai_mare;
      el.innerHTML = '<section class="card section an"><h2>Rădăuți în ' + esc(A.an) + '</h2><div class="an-g">' + C.map(function (c) {
        return '<a class="an-i" href="' + c[0] + '">' + ic(c[1]) + "<b>" + c[2] + "</b><span>" + esc(c[3]) + "</span></a>";
      }).join("") + "</div>" +
        (M && safeUrl(M.url) ? '<p class="an-fapt"><span class="lbl">Cel mai mare contract al anului</span> <a href="' + esc(M.url) + '" rel="noopener">' + esc(M.obiect.slice(0, 140)) + "</a>: <b>" + lei(M.lei) + "</b>, " +
          esc(M.inst) + (M.furnizor ? ", cu " + esc(M.furnizor) : "") + ".</p>" : "") + "</section>";
    }).catch(function () {});
  }
  function gb(o) { return o >= 1e9 ? dec((o / 1e9).toFixed(1)) + " GB" : o >= 1e6 ? Math.round(o / 1e6) + " MB" : Math.max(1, Math.round(o / 1e3)) + " KB"; }
  function litNewsCard() {   // pagina de start internă: ultimele noutăți din instanțe
    var el = $("lit-news"); if (!el || !INTERN) return;
    var arata = function () {
      var N = (LIT && LIT.noutati) || []; if (!N.length || !$("lit-news")) return;
      $("lit-news").innerHTML = '<section class="card section"><div class="h-row"><h2>Noutăți din instanțe</h2><a href="#litigii/noutati">toate</a></div>' + N.slice(0, 4).map(stire).join("") + "</section>";
    };
    if (LIT) arata(); else get(DATA + "litigii.json").then(function (d) { LIT = LIT || d; arata(); }).catch(function () {});
  }
  function arhivaCard() {
    var el = $("arhiva-card"); if (!el) return;
    get(DATA + "arhiva-stare.json").then(function (d) {
      var t = 0, c = 0, w = 0, x = 0, o = 0, oe = 0;
      Object.keys(d.site_uri || {}).forEach(function (k) { var v = d.site_uri[k]; t += v.total; c += v.copiate; w += v.in_wayback; x += v.disparute; o += v.octeti_copiati; oe += v.octeti_estimati || 0; });
      if (!t) return;
      var U = d.ultima_copiere || {}, Dc = d.documente || {}, pct = function (a, b) { var p = 100 * a / b; return p > 0 && p < 1 ? "sub 1%" : Math.round(p) + "%"; };
      var zileR = U.fisiere_pe_ora ? Math.ceil((t - c) / (U.fisiere_pe_ora * 3.3 * 4)) : null;   // patru rulări pe zi, ~3,3 ore de copiere fiecare
      el.innerHTML = '<section class="card section"><h2>Arhiva de siguranță</h2><p class="note">Copiem toate fișierele și paginile publicate pe site-urile primăriei (inclusiv arhiva veche), ca documentele publice să nu se piardă dacă sunt șterse.</p>' +
        '<div class="grid" style="margin:8px 0 0">' +
        tile("Fișiere și pagini inventariate", nr(t), "", "pe primariaradauti.ro și arhiva.primariaradauti.ro") +
        (Dc.total ? tile("Documente copiate", pct(Dc.copiate || 0, Dc.total), "", nr(Dc.copiate || 0) + " din " + nr(Dc.total) + " (PDF, Word, Excel, arhive); se copiază primele") : "") +
        tile("Copiate de noi, în total", pct(c, t), "", nr(c) + " fișiere, " + gb(o) + (oe ? " din aproximativ " + gb(oe) : "") + ", cu amprentă SHA-256") +
        tile("În Internet Archive", pct(w, t), "", nr(w) + " adrese, verificabile public în Wayback Machine") +
        (x ? tile("Dispărute de pe site-urile primăriei", nr(x), "", "păstrate în copia noastră și în Internet Archive") : "") +
        "</div>" + (U.secunde ? '<p class="note">Ultima rulare a copiat ' + nr(U.copiate || 0) + " fișiere în " + Math.round(U.secunde / 60) + " minute (" + nr(U.fisiere_pe_ora || 0) + " pe oră" + (U.erori ? ", " + nr(U.erori) + " erori" : "") + ")" +
          (zileR ? "; la ritmul ăsta, restul se copiază în aproximativ <strong>" + nr(zileR) + (zileR === 1 ? " zi" : " zile") + "</strong>" : "") + (U.spatiu_epuizat ? '. <strong style="color:var(--bad)">Spațiul de pe hosting s-a umplut.</strong>' : "") + ".</p>" : "") +
        '<p class="note">Lista completă, cu data și amprenta fiecărui fișier: <a href="' + DATA + 'arhiva-manifest.csv">manifest (CSV)</a>. Actualizat la ' + esc(zi(d.actualizat_la)) + ".</p></section>";
    }).catch(function () {});
  }

  // ---------- Arhiva de siguranță, structurată: site, categorie, an ----------
  var ARH_CAT = [
    ["hcl", "Hotărâri ale consiliului", /hcl|hotarar|hot-?cl/],
    ["pv", "Procese-verbale de ședință", /proces.?verbal|\bpv[-_ .]|\/pv-/],
    ["proiecte", "Proiecte de hotărâre", /proiect/],
    ["dispozitii", "Dispoziții ale primarului", /dispozit/],
    ["buget", "Buget, bilanțuri, finanțe", /buget|bilant|executi|financiar|datori|impozit|taxe/],
    ["urbanism", "Urbanism și construcții", /urbanism|autoriza|certificat|\bpuz\b|\bpug\b|\bpud\b|construct/],
    ["achizitii", "Achiziții și contracte", /achizit|contract|licitat|caiet|ofert/],
    ["declaratii", "Declarații de avere și interese", /declarat|avere|interes/],
    ["anunturi", "Anunțuri, concursuri, publicații", /anunt|concurs|angaja|publicati|casatori|convocat|ordine.de.zi/],
    ["regulamente", "Regulamente, strategii, rapoarte", /regulament|strategi|raport|plan|program/]
  ];
  function arhCategorie(x) {
    if (x.t === "pagina") return "pagini";
    var u = norm(decodeURIComponent(x.u || "") + " " + (x.n || ""));
    if (/\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/.test(u)) return "imagini";
    for (var i = 0; i < ARH_CAT.length; i++) if (ARH_CAT[i][2].test(u)) return ARH_CAT[i][0];
    return "altele";
  }
  var ARH_NUME = {}; ARH_CAT.forEach(function (c) { ARH_NUME[c[0]] = c[1]; });
  ARH_NUME.imagini = "Imagini"; ARH_NUME.pagini = "Pagini ale site-ului"; ARH_NUME.altele = "Alte documente";
  function arhTip(x) { var m = (x.u || "").toLowerCase().match(/\.([a-z0-9]{2,4})(\?|$)/); return x.t === "pagina" ? "pag" : m ? m[1] : "fișier"; }
  function arhivaIntern(el, r) {
    var q0 = (r && r.q) || {};
    el.innerHTML = head("Arhiva de siguranță (intern)", "Copiile noastre ale tuturor fișierelor și paginilor de pe site-urile primăriei, pe site, categorie și an. „copie” deschide fișierul salvat de noi, „original” adresa primăriei, „Wayback” copia publică din Internet Archive.") +
      '<div id="arh"><p class="updated">Se încarcă manifestul...</p></div>';
    get(DATA + "arhiva-manifest.json").then(function (M) {
      M.forEach(function (x) { x._c = arhCategorie(x); x._a = (x.d || "").slice(0, 4) || "fără dată"; });
      var F = { s: q0.s || "", c: q0.c || "", a: q0.a || "", st: q0.st || "", q: q0.q || "" };
      function numara(lista, f) { var o = {}; lista.forEach(function (x) { var k = f(x); o[k] = (o[k] || 0) + 1; }); return o; }
      function chips(o, cheie, nume, ordine) {
        var k = Object.keys(o).sort(ordine || function (a, b) { return o[b] - o[a]; });
        return '<div class="arh-chips"><button type="button" data-k="' + cheie + '" data-v="" aria-pressed="' + !F[cheie] + '">Toate</button>' + k.map(function (v) {
          return '<button type="button" data-k="' + cheie + '" data-v="' + esc(v) + '" aria-pressed="' + (F[cheie] === v) + '">' + esc(nume ? nume(v) : v) + " <small>" + nr(o[v]) + "</small></button>";
        }).join("") + "</div>";
      }
      function trece(x, sari) {
        if (sari !== "s" && F.s && x.s !== F.s) return false;
        if (sari !== "c" && F.c && x._c !== F.c) return false;
        if (sari !== "a" && F.a && x._a !== F.a) return false;
        if (F.st === "disparut" && !x.x) return false;
        if (F.st === "necopiat" && x.c) return false;
        if (F.st === "copiat" && !x.c) return false;
        if (F.st === "wayback" && !x.w) return false;
        if (F.q) { if (x._q == null) x._q = norm((x.n || "") + " " + decodeURIComponent(x.u || "")); if (x._q.indexOf(norm(F.q)) < 0) return false; }
        return true;
      }
      var shown = 60;
      function desen() {
        var bazaS = M.filter(function (x) { return trece(x, "s"); }), bazaC = M.filter(function (x) { return trece(x, "c"); }), bazaA = M.filter(function (x) { return trece(x, "a"); });
        var rows = M.filter(function (x) { return trece(x); }).sort(function (a, b) { return (b.d || "").localeCompare(a.d || ""); });
        var h = '<section class="card section"><div class="filters"><input id="arh-q" type="search" value="' + esc(F.q) + '" placeholder="Caută în nume sau adresă (ex. hcl 2016, buget, autorizatii)" aria-label="Caută">' +
          '<select id="arh-st" aria-label="Starea copiei"><option value="">Orice stare</option>' + [["copiat", "Copiate de noi"], ["necopiat", "Încă necopiate"], ["wayback", "În Internet Archive"], ["disparut", "Dispărute de pe site-urile primăriei"]].map(function (o) { return '<option value="' + o[0] + '"' + (F.st === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div>" +
          '<h3 class="arh-h">Site</h3>' + chips(numara(bazaS, function (x) { return x.s; }), "s", function (v) { return v === "arhiva" ? "Arhiva veche (arhiva.primariaradauti.ro)" : v === "site" ? "Site-ul nou (primariaradauti.ro)" : v; }) +
          '<h3 class="arh-h">Categorie</h3>' + chips(numara(bazaC, function (x) { return x._c; }), "c", function (v) { return ARH_NUME[v] || v; }) +
          '<h3 class="arh-h">Anul încărcării</h3>' + chips(numara(bazaA, function (x) { return x._a; }), "a", null, function (a, b) { return b.localeCompare(a); }) + "</section>" +
          '<section class="card section"><p class="count">' + nr(rows.length) + (rows.length === 1 ? " element" : " elemente") + '</p><div id="arh-l"></div><button class="more" id="arh-m" hidden>Arată mai multe</button></section>';
        $("arh").innerHTML = h;
        function lista() {
          var an = null, out = "";
          rows.slice(0, shown).forEach(function (x) {
            if (x._a !== an) { an = x._a; out += '<h3 class="arh-an">' + esc(an) + "</h3>"; }
            var f = safeUrl(x.u), w = safeUrl(x.w), nume = decodeURIComponent((x.u.split("/").filter(Boolean).pop() || x.u));
            var cop = x.c ? x.c.replace(/^intern\//, "").split("/").map(encodeURIComponent).join("/") : null;
            out += '<div class="arh-r"><span class="arh-t">' + esc(arhTip(x)) + '</span><div class="arh-b"><div class="arh-n">' + esc(x.n || nume) + (x.x ? ' <span class="tag" style="border-color:var(--bad)">dispărut de pe site</span>' : "") + "</div>" +
              '<div class="muted">' + esc(ARH_NUME[x._c] || "") + (x.d ? " · " + esc(zi(x.d)) : "") + (x.m ? " · " + gb(x.m) : "") + (x.h ? " · SHA-256 " + esc(x.h.slice(0, 12)) + "…" : "") + "</div></div>" +
              '<div class="arh-l">' + (cop ? '<a href="' + cop + '">copie</a>' : '<span class="tag">necopiat încă</span>') + (f ? '<a href="' + esc(f) + '" rel="noopener">original</a>' : "") + (w ? '<a href="' + esc(w) + '" rel="noopener">Wayback</a>' : "") + "</div></div>";
          });
          $("arh-l").innerHTML = out || '<p class="empty">Nimic pentru filtrele alese.</p>';
          $("arh-m").hidden = rows.length <= shown;
        }
        lista();
        $("arh-m").addEventListener("click", function () { shown += 200; lista(); });
        Array.prototype.forEach.call($("arh").querySelectorAll(".arh-chips button"), function (b) {
          b.addEventListener("click", function () { F[b.dataset.k] = b.dataset.v; shown = 60; adresa(); desen(); });
        });
        $("arh-st").addEventListener("change", function () { F.st = this.value; shown = 60; adresa(); desen(); });
        var t; $("arh-q").addEventListener("input", function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { F.q = v; shown = 60; adresa(); desen(); var i = $("arh-q"); i.focus(); i.setSelectionRange(v.length, v.length); }, 350); });
      }
      function adresa() { var p = Object.keys(F).filter(function (k) { return F[k]; }).map(function (k) { return k + "=" + encodeURIComponent(F[k]); }); history.replaceState(null, "", "#arhiva" + (p.length ? "?" + p.join("&") : "")); }
      desen();
    }).catch(function () { $("arh").innerHTML = '<section class="card section"><p class="empty">Manifestul nu e încă disponibil: apare după prima rulare „Arhivare”.</p></section>'; });
  }

  function hcl(el, r) {
    var pe = IND.hcl_pe_ani || {}, lag = IND.hcl_intarziere_publicare || {};
    var ani = Object.keys(pe).map(Number), cats = [];
    for (var a = Math.min.apply(null, ani); a <= Math.max.apply(null, ani); a++) if (INTERN || pe[String(a)]) cats.push(String(a));
    var gaps = {}; cats.forEach(function (y) { if (!pe[y]) gaps[y] = "fără sursă"; });
    var total = ani.reduce(function (s, y) { return s + pe[y].gasite; }, 0);
    var scan = ani.reduce(function (s, y) { return s + pe[y].scanate; }, 0);
    var ultim = Object.keys(lag).filter(function (y) { return lag[y].fiabil !== false; }).sort().pop();
    var h = head("Consiliul Local", "Proiectele de hotărâre, hotărârile adoptate și ședințele Consiliului Local al Municipiului Rădăuți.", r) +
      '<div class="grid">' + tile("Hotărâri în monitor", nr(total), "", "din " + cats[0] + " până în " + cats[cats.length - 1]) +
      (ultim ? tile("Durata medie de publicare (" + ultim + ")", dec(lag[ultim].medie_zile), zile(lag[ultim].medie_zile), "de la adoptare la postarea pe site, pentru " + lag[ultim].hcl + " hotărâri") : "") +
      tile("Hotărâri publicate doar ca scanare", nr(scan), "", "din " + nr(total) + " (" + Math.round(100 * scan / Math.max(total, 1)) + "%)") + "</div>" +
      '<section class="card section"><h2>Hotărâri pe ani</h2><p class="note">' + (INTERN ? "Câte hotărâri apar în listele publicate de primărie, față de ultimul număr de hotărâre din an." : "Câte hotărâri ale consiliului local a publicat primăria, pe ani.") + "</p>" +
      (INTERN ? legend([["Hotărâri găsite", "var(--s1)"], ["Ultimul număr din an", "var(--track)"]]) : "") + '<div class="chart" id="ch-hcl"></div>' +
      '<details class="tbl"><summary>Vezi tabelul</summary><div class="tw"><table><thead><tr><th>An</th><th class="n">Hotărâri</th>' + (INTERN ? '<th class="n">Ultimul nr.</th><th class="n">Acoperire</th>' : "") + '<th class="n">Scanate</th><th class="n">Durată medie publicare</th>' + (INTERN ? "<th>Sursa</th>" : "") + "</tr></thead><tbody>" +
      cats.slice().reverse().filter(function (y) { return INTERN || pe[y]; }).map(function (y) {
        var v = pe[y];
        if (!v) return "<tr><td>" + y + '</td><td colspan="6">Nicio sursă publică găsită pentru acest an.</td></tr>';
        return "<tr><td>" + y + '</td><td class="n">' + v.gasite + "</td>" + (INTERN ? '<td class="n">' + v.ultimul_nr + '</td><td class="n">' + v.acoperire_pct + "%</td>" : "") + '<td class="n">' + v.scanate +
          '</td><td class="n">' + (v.medie_publicare_zile != null ? dec(v.medie_publicare_zile) + " zile" : "-") + "</td>" + (INTERN ? "<td>" + esc(v.sursa) + "</td>" : "") + "</tr>";
      }).join("") + "</tbody></table></div></details>" +
      '<p class="note">' + (INTERN ? "Acoperirea sub 100% înseamnă că în lista publicată lipsesc numere de hotărâre. Verificăm alte surse înainte de orice concluzie. " : "") + "Durata de publicare se calculează doar pentru anii în care data postării pe site e credibilă.</p></section>";
    if (INTERN && IND.hcl_numere_lipsa) {
      var lipsa = IND.hcl_numere_lipsa || {};
      h += '<section class="card section"><h2>Numere de hotărâre care lipsesc din lista publicată</h2><p class="note">Numerele de hotărâre care nu apar în lista publicată, pe ani. De căutat în procesele-verbale și în alte surse.</p><div class="tw"><table><thead><tr><th>An</th><th class="n">Lipsă</th><th>Numere</th></tr></thead><tbody>' +
        Object.keys(lipsa).sort().reverse().filter(function (y) { return lipsa[y].lipsa_total; }).map(function (y) {
          return "<tr><td>" + y + '</td><td class="n">' + lipsa[y].lipsa_total + '</td><td class="missing">' + lipsa[y].lipsa.join(", ") + "</td></tr>";
        }).join("") + "</tbody></table></div></section>";
    }
    var pr = (IND.hcl_probleme || []).filter(function (p) { return INTERN || p.verificare === "confirmat"; });
    if (pr.length) {
      h += '<section class="card section"><h2>Probleme de publicare' + (INTERN ? " (inclusiv neverificate)" : " verificate") + "</h2>" +
        '<p class="note">Hotărâri la care documentul publicat nu corespunde hotărârii. ' + (INTERN ? "Cele neverificate apar doar aici, până le confirmă cineva din echipă." : "Fiecare caz a fost verificat manual de echipa monitorului.") + "</p>" +
        pr.map(function (p) {
          var u = safeUrl(p.pdf);
          return '<div class="doc"><div class="h"><span class="id">HCL ' + esc(p.nr) + "/" + esc(p.an) + "</span>" + (INTERN ? ' <span class="tag">' + esc(p.verificare) + "</span>" : "") +
            '</div><div class="t">' + esc(p.nota || (p.probleme || []).join(", ")) + '</div><div class="m">' + (u ? '<a href="' + esc(u) + '" rel="noopener">documentul atașat</a>' : "") + "</div></div>";
        }).join("") + "</section>";
    }
    h += ftSectiune("Caută în textul hotărârilor", ["hcl"], "Cuvinte din textul hotărârilor (ex. Putnei, concesionare teren); „expresie exactă” între ghilimele") +
      '<section class="card section"><h2>Toate hotărârile</h2><p class="note">Căutarea de aici e în titluri; pentru textul complet, folosește căutarea de mai sus.</p><div id="lst"></div></section>';
    el.innerHTML = h;
    ftLeaga(el);
    chart($("ch-hcl"), {
      cats: cats, label: "Hotărâri găsite pe ani, față de ultimul număr de hotărâre",
      series: [{ name: "Hotărâri găsite", color: "var(--s1)", values: cats.map(function (y) { return pe[y] ? pe[y].gasite : 0; }) }],
      track: INTERN ? { values: cats.map(function (y) { return pe[y] ? pe[y].ultimul_nr : 0; }) } : null, gaps: INTERN ? gaps : null,
      tooltip: function (i) { var v = pe[cats[i]]; return !v ? "<b>" + cats[i] + "</b><br>" + (INTERN ? "nicio sursă publică" : "-") : INTERN ? "<b>" + cats[i] + "</b><br>" + v.gasite + " găsite din " + v.ultimul_nr + " (" + v.acoperire_pct + "%)<br>" + v.scanate + " scanate" : "<b>" + cats[i] + "</b><br>" + v.gasite + " hotărâri<br>" + v.scanate + " publicate doar ca scanare"; }
    });
    lista($("lst"), L.hcl || [], {
      placeholder: "Caută în titluri (ex. buget, teren, strada Ștefan cel Mare)",
      an: function (x) { return String(x.an); }, text: function (x) { return x.titlu + " " + x.nr + "/" + x.an; },
      item: function (x) { return doc(linkHcl(x), x.titlu, (x.data ? "adoptată " + zi(x.data) : "") + (x.postat ? " · postată " + zi(x.postat) : ""), x); }
    });
  }

  // ---------- Calendarul ședințelor consiliului local: convocări, procese-verbale, hotărâri, termene de consultare ----------
  var LUNI_N = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
  var CAL_TIP = { ordinara: ["Ordinară", "#2a78d6"], extraordinara: ["Extraordinară", "#7b4fd6"], extraordinara_de_indata: ["De îndată", "#e5700f"] };
  function calSedinte() {
    var S = {}, z = function (d) { return S[d] = S[d] || { data: d, hcl: [], pv: null, conv: null }; };
    (SED.recente || []).concat(SED.urmatoare || []).forEach(function (c) { if (c.data) { var x = z(c.data); x.conv = c; x.tip = c.tip; x.ora = c.ora; } });
    (L.pv || []).forEach(function (p) { if (p.data && p.fel === "pv_sedinta") { var x = z(p.data); x.pv = p; x.tip = x.tip || p.tip; } });
    (L.hcl || []).forEach(function (h) { if (h.data && h.data >= "2016") z(h.data).hcl.push(h); });
    return S;
  }
  function icsSedinta(x) {
    var d = x.data.replace(/-/g, ""), o = (x.ora || "10:00").replace(":", "").slice(0, 4), t = (CAL_TIP[x.tip] || ["Ședință"])[0];
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Asociatia Radautiul Civic//Monitor local//RO", "BEGIN:VEVENT", "UID:sedinta-" + d + "@monitor.radautiulcivic.ro", "DTSTAMP:" + d + "T000000",
      "DTSTART;TZID=Europe/Bucharest:" + d + "T" + o + "00", "DURATION:PT2H", "SUMMARY:Ședința " + t.toLowerCase() + " a Consiliului Local Rădăuți", "LOCATION:Sala de ședințe a Consiliului Local\\, Primăria Rădăuți",
      "DESCRIPTION:" + ((x.conv && x.conv.ordinea_de_zi || []).length ? x.conv.ordinea_de_zi.length + " puncte pe ordinea de zi. " : "") + "Ședințele sunt publice.", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  }
  function calendar(el, r) {   // în pagina „Ședințe” (fără antet propriu)
    var cap = "";
    var S = calSedinte(), azi = new Date().toISOString().slice(0, 10);
    var urm = (SED.urmatoare || []).map(function (c) { return c.data; }).sort();
    var q = r.q || {}, lunaSel = q.l || (urm[0] || azi).slice(0, 7), ziSel = q.z || urm[0] || null;
    var termene = (SED.consultare || []).filter(function (p) { return p.deschis && p.termen; });
    function luna(ym) {
      var a = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1, prim = new Date(Date.UTC(a, m, 1)), off = (prim.getUTCDay() + 6) % 7, zile = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
      var h = '<div class="cal-g" role="grid"><div class="cal-w">' + ["L", "Ma", "Mi", "J", "V", "S", "D"].map(function (d) { return "<span>" + d + "</span>"; }).join("") + "</div><div class=\"cal-d\">";
      for (var i = 0; i < off; i++) h += '<span class="cal-c gol"></span>';
      for (var d = 1; d <= zile; d++) {
        var ds = ym + "-" + (d < 10 ? "0" : "") + d, x = S[ds], tr = termene.filter(function (p) { return p.termen === ds; });
        h += '<button type="button" class="cal-c' + (x ? " are" : "") + (ds === azi ? " azi" : "") + (ds === ziSel ? " sel" : "") + (tr.length ? " ter" : "") + '" data-z="' + ds + '"' + (x || tr.length ? "" : " disabled") + ' aria-label="' + d + " " + LUNI_N[+ym.slice(5, 7) - 1] + (x ? ", ședință" : "") + (tr.length ? ", termen de propuneri" : "") + '"><b>' + d + "</b>" +
          (x ? '<i style="background:' + (CAL_TIP[x.tip] || [0, "#5b6b7b"])[1] + '" title="' + esc((CAL_TIP[x.tip] || ["Ședință"])[0]) + '">' + esc(x.ora || "ședință") + "</i>" : "") + (tr.length ? '<i class="t">termen</i>' : "") + "</button>";
      }
      return h + "</div></div>";
    }
    function detalii(ds) {
      var x = S[ds], tr = termene.filter(function (p) { return p.termen === ds; }), h = "";
      if (x) {
        var t = CAL_TIP[x.tip] || ["Ședință", "#5b6b7b"], viit = ds >= azi, od = (x.conv && x.conv.ordinea_de_zi) || [], rz = typeof rezPentru === "function" ? rezPentru(ds) : null;
        var l = [];
        if (viit) l.push('<a class="btn ok" href="#consiliu/urmatoare">Ordinea de zi și cum participi</a>');
        else l.push('<a class="btn" href="#consiliu/sedinte/' + ds + '">Ședința: voturi și hotărâri</a>');
        if (x.conv && safeUrl(x.conv.pdf || x.conv.pagina)) l.push('<a class="lk" href="' + esc(safeUrl(x.conv.pdf || x.conv.pagina)) + '" rel="noopener">dispoziția de convocare</a>');
        if (x.pv && safeUrl(x.pv.pdf || x.pv.pagina)) l.push('<a class="lk" href="' + esc(safeUrl(x.pv.pdf || x.pv.pagina)) + '" rel="noopener">procesul-verbal</a>');
        if (viit) l.push('<a class="lk" href="' + icsSedinta(x) + '" download="sedinta-consiliu-' + ds + '.ics">adaugă în calendarul tău</a>');
        h += '<div class="cal-x"><div class="h"><span class="tag" style="border-color:' + t[1] + ';color:' + t[1] + '">Ședință ' + esc(t[0].toLowerCase()) + "</span>" + (viit ? '<span class="rz ic">' + esc(catePana(ds)) + "</span>" : "") + "</div>" +
          "<h3>" + esc(ziSapt(ds)) + esc(zi(ds)) + (x.ora ? ", ora " + esc(x.ora) : "") + "</h3>" +
          '<p class="muted">' + [od.length ? od.length + (od.length === 1 ? " punct" : od.length < 20 ? " puncte" : " de puncte") + " pe ordinea de zi" : "", x.hcl.length ? x.hcl.length + (x.hcl.length === 1 ? " hotărâre adoptată" : " hotărâri adoptate") : "", x.pv ? "proces-verbal publicat" : (!viit ? "proces-verbal încă nepublicat" : ""), rz ? "are rezumat" : ""].filter(Boolean).join(" · ") + "</p>" +
          (od.length ? '<ol class="odz">' + od.slice(0, 8).map(function (p) { return "<li>" + esc(p.text.length > 180 ? p.text.slice(0, 180) + "…" : p.text) + "</li>"; }).join("") + "</ol>" + (od.length > 8 ? '<p class="note">și încă ' + (od.length - 8) + " puncte</p>" : "") : "") +
          '<div class="cal-l">' + l.join("") + "</div></div>";
      }
      tr.forEach(function (p) { h += '<div class="cal-x"><div class="h"><span class="tag t">termen de propuneri</span></div><h3>' + esc(p.obiect) + '</h3><div class="cal-l"><a class="btn ok" href="' + esc(mailPropuneri(p)) + '">✉ Trimite propuneri</a><a class="lk" href="#consiliu/urmatoare">toate proiectele în consultare</a></div></div>'; });
      return h || '<p class="empty">Alege o zi marcată în calendar.</p>';
    }
    var ym = lunaSel, ant = function (ym, k) { var a = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + k; a += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return a + "-" + (m < 9 ? "0" : "") + (m + 1); };
    var nAn = Object.keys(S).filter(function (d) { return d.slice(0, 4) === ym.slice(0, 4); }).length;
    el.innerHTML = cap + '<section class="card section cal" id="sp-cal"><h2 class="cal-tt">Calendarul ședințelor</h2><div class="cal-h"><button type="button" class="btn-s" id="cal-p" aria-label="Luna anterioară">‹</button><h2 id="cal-t">' + LUNI_N[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4) + '</h2><button type="button" class="btn-s" id="cal-n" aria-label="Luna următoare">›</button>' +
      '<button type="button" class="btn-s" id="cal-azi">Azi</button></div>' +
      '<div class="legend">' + Object.keys(CAL_TIP).map(function (k) { return '<span><i style="background:' + CAL_TIP[k][1] + '"></i>' + CAL_TIP[k][0] + "</span>"; }).join("") + '<span><i class="ter-l"></i>Termen de propuneri la un proiect</span></div>' +
      '<div class="cal-w2"><div id="cal-m"></div><div id="cal-x" aria-live="polite"></div></div>' +
      '<p class="note">' + nAn + " ședințe în " + ym.slice(0, 4) + ". Ședințele trecute sunt din procesele-verbale și hotărârile publicate; cele viitoare, din dispozițiile de convocare. Ședințele sunt publice: poți veni să asculți.</p></section>";
    function arata() {
      $("cal-t").textContent = LUNI_N[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4);
      $("cal-m").innerHTML = luna(ym); $("cal-x").innerHTML = ziSel && ziSel.slice(0, 7) === ym ? detalii(ziSel) : (function () { var d = Object.keys(S).filter(function (d) { return d.slice(0, 7) === ym; }).sort(); return d.length ? detalii(ziSel = d[d.length - 1]) : '<p class="empty">Nicio ședință în luna aceasta.</p>'; })();
      Array.prototype.forEach.call($("cal-m").querySelectorAll(".cal-c[data-z]"), function (b) { b.addEventListener("click", function () { ziSel = b.getAttribute("data-z"); arata(); history.replaceState(null, "", "#consiliu/sedinte?l=" + ym + "&z=" + ziSel); }); });
      Array.prototype.forEach.call($("cal-m").querySelectorAll(".cal-c.sel"), function (b) { b.setAttribute("aria-current", "date"); });
    }
    $("cal-p").addEventListener("click", function () { ym = ant(ym, -1); ziSel = null; arata(); });
    $("cal-n").addEventListener("click", function () { ym = ant(ym, 1); ziSel = null; arata(); });
    $("cal-azi").addEventListener("click", function () { ym = azi.slice(0, 7); ziSel = urm[0] && urm[0].slice(0, 7) === ym ? urm[0] : null; arata(); });
    arata();
  }
  function calendarUrl(schema) {
    var u = new URL(FTDATA + "calendar.ics", location.href).href;
    return schema === "webcal" ? u.replace(/^https?:/, "webcal:") : u;
  }
  // ---------- Consiliul Local → Ședințe: ședințele convocate, calendarul și istoricul (procese-verbale, voturi, grafice) ----------
  function sedintePagina(el, r) {
    var cap = head("Consiliul Local", "Când se întrunește consiliul, ce se votează și ce s-a hotărât: ședințele convocate, calendarul și toate ședințele de până acum.", r);
    if (!SED) { el.innerHTML = cap + '<p class="updated">Se încarcă...</p>'; incarcaSed().then(render); return; }
    var U = SED.urmatoare || [], des = (SED.consultare || []).filter(function (p) { return p.deschis; });
    el.innerHTML = cap + '<div id="sp-cal-w"></div><section class="card section" id="sp-urm"><h2>' + (U.length ? (U.length > 1 ? "Ședințele convocate" : "Ședința următoare") : "Nicio ședință convocată deocamdată") + "</h2>" +
      (U.length ? U.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; }).map(function (c) { return sedCard(c, true); }).join("") : '<p>Primăria n-a publicat încă o dispoziție de convocare pentru o ședință viitoare. Ședințele ordinare au loc de regulă o dată pe lună; convocarea apare cu câteva zile înainte.</p>') +
      '<p class="cal-ab"><a class="btn" href="' + esc(calendarUrl("webcal")) + '">📅 Adaugă ședințele în calendarul tău</a> <a class="lk" href="' + esc(calendarUrl("https")) + '" download="consiliul-local-radauti.ics">descarcă fișierul</a>' +
        '<br><small class="muted">Ședințele convocate și termenele de propuneri apar singure în calendarul telefonului (Google, Apple, Outlook) și se actualizează de câteva ori pe zi.</small></p>' +
      '<p class="note">Ședințele sunt publice: poți veni să asculți. ' + (des.length ? 'Acum sunt <a href="#consiliu/proiecte">' + des.length + (des.length === 1 ? " proiect" : " proiecte") + " în consultare publică</a>, la care poți trimite propuneri." : "") + "</p></section>" +
      '<div id="sp-ist-w"></div>';
    calendar($("sp-cal-w"), r);
    sedinte($("sp-ist-w"), r, true);
    var anc = { urmatoare: "sp-urm", calendar: "sp-cal" }[(r.path || "").split("/")[1]];
    if (anc && $(anc)) setTimeout(function () { $(anc).scrollIntoView(); }, 50);
  }
  function sedinte(el, r, faraAntet) {
    var sed = IND.sedinte_pe_tip || {}, ani = Object.keys(sed).sort(), pv = IND.pv_intarziere_publicare;
    var an = ani[ani.length - 1], s = an ? sed[an] : {};
    var nS = Object.keys(s).reduce(function (a, k) { return a + s[k]; }, 0);
    var tipuri = [["ordinara", "Ordinare", "var(--s1)"], ["extraordinara", "Extraordinare", "var(--s2)"], ["extraordinara_de_indata", "De îndată", "var(--s3)"]];
    if (ani.some(function (y) { return sed[y].necunoscut; })) tipuri.push(["necunoscut", "Tip nemenționat în titlu", "var(--plan)"]);
    var h = (faraAntet ? '<h2 class="sp-h" id="sp-ist">Ședințele de până acum</h2>' : head("Consiliul Local", "Proiectele de hotărâre, hotărârile adoptate și ședințele Consiliului Local al Municipiului Rădăuți.", r)) + '<div class="grid">' +
      (an ? tile("Ședințe în " + an, nS, "", tipuri.map(function (t) { return (s[t[0]] || 0) + " " + t[1].toLowerCase(); }).join(", ")) : "") +
      (an && nS ? tile("Ședințe convocate în regim de urgență (" + an + ")", Math.round(100 * ((s.extraordinara || 0) + (s.extraordinara_de_indata || 0)) / nS) + "%", "", "extraordinare și de îndată, din totalul ședințelor") : "") +
      (pv ? tile("Durata medie de publicare a procesului-verbal", dec(pv.medie_zile), zile(pv.medie_zile), "de la ședință la postare; maxim <strong>" + pv.max_zile + " zile</strong>, din " + pv.pv + " procese-verbale") : "") + "</div>" +
      '<section class="card section"><h2>Ședințe pe ani, după tip</h2><p class="note">Din procesele-verbale publicate de primărie, pe site și în arhivă (' + (ani[0] || "-") + "-" + (ani[ani.length - 1] || "-") + "). O ședință se numără o singură dată, chiar dacă procesul-verbal e împărțit în mai multe fișiere.</p>" +
      legend(tipuri.map(function (t) { return [t[1], t[2]]; })) + '<div class="chart" id="ch-sed"></div>' +
      '<details class="tbl"><summary>Vezi tabelul</summary><div class="tw"><table><thead><tr><th>An</th>' + tipuri.map(function (t) { return '<th class="n">' + t[1] + "</th>"; }).join("") + '<th class="n">Total</th></tr></thead><tbody>' +
      ani.slice().reverse().map(function (y) { var v = sed[y], t = 0; return "<tr><td>" + y + "</td>" + tipuri.map(function (k) { t += v[k[0]] || 0; return '<td class="n">' + (v[k[0]] || 0) + "</td>"; }).join("") + '<td class="n">' + t + "</td></tr>"; }).join("") +
      '</tbody></table></div></details></section>' + '<div id="sd-rzl"></div><div id="vt"></div>' + ftSectiune("Caută în textul proceselor-verbale", ["pv"], "Cuvinte din dezbateri (ex. nume de consilier, stradă, proiect); „expresie exactă” între ghilimele") +
      '<section class="card section"><h2>Procese-verbale</h2><div id="lst"></div></section>';
    el.innerHTML = h;
    ftLeaga(el);
    incarcaRez().then(function (L2) {
      if (!L2.length || !$("sd-rzl")) return;
      $("sd-rzl").innerHTML = '<section class="card section"><h2>Rezumatele ședințelor</h2><p class="note">Ce s-a discutat și ce s-a votat, din înregistrare și documente, verificat de echipa monitorului.</p>' +
        L2.slice(0, 8).map(function (x) { return '<div class="doc"><div class="h"><span class="id"><a href="#consiliu/sedinte/' + esc(x.data) + '">Ședința din ' + esc(zi(x.data)) + '</a></span></div><div class="t">' + esc(((x.rezumat || {}).rezumat || "").slice(0, 300)) + "</div></div>"; }).join("") + "</section>";
    });
    voturiIntern($("vt"));
    chart($("ch-sed"), {
      cats: ani, stacked: true, label: "Ședințe pe ani după tip",
      series: tipuri.map(function (t) { return { name: t[1], color: t[2], values: ani.map(function (y) { return sed[y][t[0]] || 0; }) }; }),
      labelValue: function (i) { var v = sed[ani[i]]; return Object.keys(v).reduce(function (a, k) { return a + v[k]; }, 0); },
      tooltip: function (i) { var v = sed[ani[i]]; return "<b>" + ani[i] + "</b><br>" + tipuri.map(function (t) { return t[1] + ": " + (v[t[0]] || 0); }).join("<br>"); }
    });
    lista($("lst"), L.pv || [], {
      an: function (x) { return (x.data || "").slice(0, 4); }, text: function (x) { return x.titlu; },
      extraFilter: { html: '<select aria-label="Tipul ședinței"><option value="">Toate tipurile</option><option value="ordinara">Ordinare</option><option value="extraordinara">Extraordinare</option><option value="extraordinara_de_indata">De îndată</option></select>', test: function (x, e) { return x.tip === e; } },
      item: function (x) { return doc(x.data ? linkSed(x.data, x.tip) : "Ședința", x.titlu, x.postat ? "postat " + zi(x.postat) : "", x); }
    });
  }

  function simplu(el, r, cfg) {
    var items = L[cfg.key] || [];
    var h = head(cfg.titlu, cfg.text, r) + (cfg.top || "") + (cfg.ft ? ftSectiune(cfg.ft[0], cfg.ft[1]) : "") + '<section class="card section"><h2>' + esc(cfg.h2) + "</h2>" + (cfg.note ? '<p class="note">' + cfg.note + "</p>" : "") + '<div id="lst"></div></section>';
    el.innerHTML = h;
    ftLeaga(el);
    if (cfg.after) cfg.after();
    lista($("lst"), cfg.filter ? items.filter(cfg.filter) : items, cfg.opt);
  }

  // titlul unui anunț de proiect („Anunț din ... – Proiect de hotărâre înregistrat cu nr. 99582/... privind X”) -> nr și obiect
  function titluProiect(t) {
    var n = norm(t || ""), m = n.match(/\bnr\.?\s*(\d{3,6})/), i = n.search(/\b(privind|pentru)\b/);
    var o = i >= 0 ? (t || "").slice(i) : (t || "");
    return { nr: m ? m[1] : null, obiect: o.charAt(0).toUpperCase() + o.slice(1) };
  }
  // proiectul a devenit hotărâre? (titluri asemănătoare, hotărâre adoptată după publicarea proiectului, în cel mult 6 luni)
  var PR_HCL = null;
  function hclPentruProiecte() {
    if (PR_HCL) return PR_HCL;
    PR_HCL = {};
    var H = (L.hcl || []).filter(function (h) { return h.data; });
    (L.proiecte || []).forEach(function (p, i) {
      if (!p.postat) return;
      var lim = new Date(new Date(p.postat).getTime() + 183 * 864e5).toISOString().slice(0, 10), best = null, bs = 0.5;
      H.forEach(function (h) { if (h.data >= p.postat && h.data <= lim) { var a = asemanare(p.titlu, h.titlu); if (a >= bs) { bs = a; best = h; } } });
      if (best) PR_HCL[i] = best;
    });
    return PR_HCL;
  }
  function proiecte(el, r) {
    var cap = head("Consiliul Local", "Proiectele de hotărâre: cele pe care le poți comenta acum și ce s-a întâmplat cu cele vechi.", r);
    if (!SED) { el.innerHTML = cap + '<p class="updated">Se încarcă...</p>'; incarcaSed().then(render); return; }
    var P = L.proiecte || [], M = hclPentruProiecte(), des = (SED.consultare || []).filter(function (p) { return p.deschis; });
    var desNr = {}; des.forEach(function (p) { if (p.nr) desNr[p.nr] = 1; });
    var ad = [], rest = [];
    P.forEach(function (p, i) { var t = titluProiect(p.titlu); if (t.nr && desNr[t.nr]) return; (M[i] ? ad : rest).push({ p: p, t: t, h: M[i] }); });
    var item = function (o) {
      return '<div class="doc"><div class="h"><span class="id">' + (o.t.nr ? "Proiect nr. " + esc(o.t.nr) : "Proiect de hotărâre") + "</span>" +
        (o.h ? '<span class="rz c">adoptat: ' + linkHcl(o.h) + "</span>" : "") + '<span class="muted">publicat ' + esc(zi(o.p.postat)) + (o.h ? ", adoptat după " + zileIntre(o.p.postat, o.h.data) + " " + zile(zileIntre(o.p.postat, o.h.data)) : "") + "</span></div>" +
        '<div class="t">' + esc(o.t.obiect) + '</div><div class="m">' + linkuri(o.p) + "</div></div>";
    };
    var opt = function (cuv) { return { placeholder: "Caută în " + cuv, an: function (o) { return (o.p.postat || "").slice(0, 4); }, text: function (o) { return o.p.titlu; }, item: item }; };
    el.innerHTML = cap +
      '<section class="card section pr-des"><div class="h-row"><h2>În consultare publică acum <span class="nr-b">' + des.length + "</span></h2></div>" +
      '<p class="note">Înainte de vot, primăria publică proiectele de hotărâre pentru consultare publică. Poți trimite propuneri până la termenul din anunț: butonul pregătește e-mailul către secretarul general al municipiului. După termen, proiectul ajunge pe ordinea de zi a unei <a href="#consiliu/sedinte">ședințe</a>.</p>' +
      '<details class="info"><summary>Ce spune legea</summary><p>Legea nr. 52/2003 privind transparența decizională îți dă dreptul să trimiți în scris propuneri, sugestii sau opinii la proiectele de hotărâre puse în consultare, în termenul anunțat de primărie. O asociație legal constituită sau o altă autoritate publică poate cere în scris organizarea unei dezbateri publice. Termenul e cel din anunțul primăriei; unde anunțul nu îl spune clar, arătăm 10 zile de la publicare.</p></details>' +
      (des.length ? des.map(consCard).join("") : '<p class="empty">Niciun proiect în consultare acum. Proiectele noi apar aici în ziua în care primăria le publică.</p>') + "</section>" +
      '<section class="card section"><div class="h-row"><h2>Adoptate ca hotărâri <span class="nr-b c">' + nr(ad.length) + "</span></h2></div>" +
      '<p class="note">Proiecte pentru care am găsit hotărârea adoptată (după titlu, în cel mult șase luni de la publicare).</p><div id="pr-ad"></div></section>' +
      '<section class="card section"><div class="h-row"><h2>Fără hotărâre găsită <span class="nr-b n">' + nr(rest.length) + "</span></h2></div>" +
      '<p class="note">Termenul de propuneri s-a încheiat, dar nu am găsit o hotărâre cu același titlu: proiectul poate fi încă pe drum, respins, retras sau adoptat cu alt titlu.</p><div id="pr-rest"></div></section>' +
      ftSectiune("Caută în textul proiectelor", ["proiecte"]);
    ftLeaga(el);
    lista($("pr-ad"), ad, opt("proiectele adoptate"));
    lista($("pr-rest"), rest, opt("celelalte proiecte"));
  }

  var URB = null;
  function lei(v) { return v == null ? "-" : (v >= 1e6 ? dec((v / 1e6).toFixed(1)) + " mil." : nr(Math.round(v))) + " lei"; }
  function hbars(obj, total, fmt) {
    var k = Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }), max = k.length ? obj[k[0]] : 1;
    return '<div class="hbars">' + k.map(function (c) {
      return '<div class="hb"><span class="hb-l" title="' + esc(c) + '">' + esc(c) + '</span><span class="hb-t"><i style="width:' + Math.max(2, 100 * obj[c] / max) + '%"></i></span><span class="hb-v">' +
        (fmt ? fmt(obj[c]) : obj[c]) + (total ? ' <small>' + Math.round(100 * obj[c] / total) + "%</small>" : "") + "</span></div>";
    }).join("") + "</div>";
  }

  function lung(t) {   // texte foarte lungi: primele ~240 de caractere, restul la cerere
    if (t.length <= 280) return esc(t);
    var cut = t.lastIndexOf(" ", 240);
    return esc(t.slice(0, cut > 0 ? cut : 240)) + '… <details class="more-t"><summary>mai mult</summary>' + esc(t.slice(cut > 0 ? cut : 240)) + "</details>";
  }
  function luniContinue(pe, n) {   // ultimele n luni consecutive până la ultima lună cu date
    var k = Object.keys(pe).sort(); if (!k.length) return [];
    var y = +k[k.length - 1].slice(0, 4), m = +k[k.length - 1].slice(5), out = [];
    for (var i = 0; i < n; i++) { out.unshift(y + "-" + (m < 10 ? "0" : "") + m); m--; if (!m) { m = 12; y--; } }
    return out;
  }

  function registru(el, r, kind) {
    if (!URB) {
      el.innerHTML = head("Urbanism", "", r) + '<p class="updated">Se încarcă registrele...</p>';
      get(DATA + "urbanism.json").then(function (d) { URB = d; registru(el, r, kind); })
        .catch(function () { URB = { cu: [], ac: [] }; registru(el, r, kind); });
      return;
    }
    var reg = (IND.registre_urbanism || {})[kind] || {}, U = ((IND.urbanism || {})[kind]) || null, acte = URB[kind] || [];
    var cu = kind === "cu", nume = cu ? "Certificate de urbanism" : "Autorizații de construire și desființare";
    var z = reg.zile_neacoperite, ani = U ? Object.keys(U.pe_ani).sort() : [], an = ani[ani.length - 1];
    var h = head("Urbanism", "Ce se construiește în Rădăuți: certificatele de urbanism și autorizațiile de construire emise de primărie, extrase din registrele publicate.", r) + '<div class="grid">';
    if (U && an) {
      h += tile(nume + " în " + an, nr(U.pe_ani[an]), "", "până la " + zi(reg.ultima_perioada_pana_la));
      if (!cu && U.valoare_pe_ani && U.valoare_pe_ani[an]) h += tile("Valoarea lucrărilor autorizate în " + an, lei(U.valoare_pe_ani[an]), "", "suma valorilor declarate în autorizații");
      if (cu) h += tile("Solicitate de firme și instituții", Math.round(100 * U.persoane_juridice / Math.max(U.total, 1)) + "%", "", nr(U.persoane_juridice) + " din " + nr(U.total) + " certificate");
    }
    h += tile("Zile fără registru publicat", z == null ? "-" : nr(z), z == null ? "" : zile(z), "ultimul registru acoperă până la " + zi(reg.ultima_perioada_pana_la)) + "</div>";
    if (U) {
      h += '<section class="card section"><h2>' + esc(nume) + ' pe ani</h2><p class="note">Toți anii din registrele publicate (site și arhivă). Un an cu registre lipsă apare mai mic decât a fost în realitate.</p><div class="chart" id="ch-ua"></div>' +
        (!cu && U.valoare_pe_ani ? '<h3 style="margin-top:16px">Valoarea lucrărilor autorizate, pe ani</h3><p class="note">Suma valorilor declarate în autorizații, în milioane de lei.</p><div class="chart" id="ch-uv"></div>' : "") + "</section>";
      h += '<section class="card section"><h2>' + esc(nume) + ' pe luni</h2><p class="note">După data emiterii, ultimele 18 luni până la ultimul registru publicat. Lunile fără registru publicat apar goale.</p><div class="chart" id="ch-u"></div></section>';
      var cat = U.categorii_pe_ani[an] || {};
      h += '<div class="grid two"><section class="card"><h2>Pentru ce (' + an + ')</h2><p class="note">Categorii după scopul declarat, grupate automat după cuvinte-cheie.</p>' + hbars(cat, U.pe_ani[an]) + "</section>" +
        '<section class="card"><h2>Străzile cu cele mai multe ' + (cu ? "certificate" : "autorizații") + '</h2><p class="note">Toți anii din registre.</p>' +
        hbars(U.top_strazi.slice(0, 10).reduce(function (o, x) { o[x[0]] = x[1]; return o; }, {})) + "</section></div>";
      if (!cu && U.fara_natura_constructiei) h += '<p class="callout">În ' + nr(U.fara_natura_constructiei) + " autorizații din registrele în format vechi, coloana „Natura construcției” este necompletată de primărie: din registru nu se poate afla ce se construiește.</p>";
    }
    h += '<section class="card section"><h2>Toate ' + (cu ? "certificatele" : "autorizațiile") + '</h2><p class="note">Exact cum apar în registrele primăriei. Fiecare rând trimite la registrul-sursă.</p><div id="lst"></div></section>' +
      '<section class="card section"><h2>Registrele originale</h2><div id="lst2"></div></section>';
    el.innerHTML = h;
    if (U) {
      var A = [], a0 = +ani[0], a1 = +ani[ani.length - 1];
      for (var y = a0; y <= a1; y++) A.push(String(y));
      chart($("ch-ua"), { cats: A, label: nume + " pe ani", series: [{ name: nume, color: "var(--s1)", values: A.map(function (y) { return U.pe_ani[y] || 0; }) }],
        labelValue: function (i) { return U.pe_ani[A[i]] || ""; },
        tooltip: function (i) { return "<b>" + A[i] + "</b><br>" + (U.pe_ani[A[i]] || 0) + (cu ? " certificate" : " autorizații"); } });
      if (!cu && U.valoare_pe_ani) chart($("ch-uv"), { cats: A, label: "Valoarea lucrărilor autorizate pe ani",
        series: [{ name: "Valoare", color: "var(--s1)", values: A.map(function (y) { return Math.round((U.valoare_pe_ani[y] || 0) / 1e6 * 10) / 10; }) }],
        labelValue: function (i) { var v = U.valoare_pe_ani[A[i]]; return v ? dec((v / 1e6).toFixed(1)).replace(/,0$/, "") : ""; },
        tooltip: function (i) { return "<b>" + A[i] + "</b><br>" + lei(U.valoare_pe_ani[A[i]] || 0); }, unit: "mil. lei" });
      var L2 = luniContinue(U.pe_luni, 18);
      chart($("ch-u"), { cats: L2.map(function (m) { return LUNI[+m.slice(5) - 1].slice(0, 3) + (m.slice(5) === "01" || m === L2[0] ? " " + m.slice(2, 4) : ""); }), label: nume + " pe luni",
        series: [{ name: nume, color: "var(--s1)", values: L2.map(function (m) { return U.pe_luni[m] || 0; }) }],
        tooltip: function (i) { var m = L2[i]; return "<b>" + LUNI[+m.slice(5) - 1] + " " + m.slice(0, 4) + "</b><br>" + (U.pe_luni[m] || 0) + (cu ? " certificate" : " autorizații"); } });
    }
    var cats = {}; acte.forEach(function (a) { cats[a.categorie || "Altele"] = 1; });
    lista($("lst"), acte, {
      placeholder: cu ? "Caută: stradă, solicitant, scop (ex. Putnei, locuință, SRL)" : "Caută: stradă, solicitant, lucrare, constructor",
      unitate: cu ? ["certificat", "certificate"] : ["autorizație", "autorizații"],
      an: function (a) { return (a.data || "").slice(0, 4); },
      text: function (a) { return [a.nr, a.solicitant, a.adresa, a.strada, a.scop, a.proiectant, a.executant, a.cf_cadastral].join(" "); },
      extraFilter: { html: '<select aria-label="Categoria"><option value="">Toate categoriile</option>' + Object.keys(cats).sort().map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("") + "</select>", test: function (a, e) { return (a.categorie || "Altele") === e; } },
      item: function (a) {
        var m = [];
        if (a.strada || a.adresa) m.push(esc(a.strada || a.adresa));
        if (a.valoare) m.push(lei(a.valoare));
        if (a.sup_construita) m.push("Sc " + esc(a.sup_construita) + " mp");
        if (a.sup_desfasurata) m.push("Sd " + esc(a.sup_desfasurata) + " mp");
        if (a.cf_cadastral) m.push("CF " + esc(a.cf_cadastral));
        if (a.proiectant) m.push("proiectant: " + esc(a.proiectant));
        if (a.executant) m.push("constructor: " + esc(a.executant));
        var f = safeUrl(a.registru_pdf);
        return '<div class="doc"><div class="h"><span class="id">' + (cu ? "CU " : "AC ") + esc(a.nr || "fără nr.") + " · " + esc(zi(a.data)) + '</span><span class="tag">' + esc(a.categorie || "Altele") + "</span></div>" +
          '<div class="t"><strong>' + esc(a.solicitant || "") + "</strong>" + (a.scop ? " - " + lung(a.scop) : (cu ? "" : ' - <span class="muted">natura construcției necompletată în registru</span>')) + "</div>" +
          (a.utilizabil ? '<div class="t warn-t">' + esc(a.utilizabil) + "</div>" : "") +
          '<div class="m"><span>' + m.join(" · ") + "</span>" + (f ? '<a href="' + esc(f) + '" rel="noopener">registrul (PDF)</a>' : "") + "</div></div>";
      }
    });
    lista($("lst2"), (L.registre || []).filter(function (x) { return x.tip === kind; }), {
      an: function (x) { return (x.pana_la || "").slice(0, 4); }, text: function (x) { return x.titlu; },
      item: function (x) { return doc(zi(x.de_la) + " - " + zi(x.pana_la), x.titlu, x.postat ? "postat " + zi(x.postat) : "", x); }
    });
  }

  function contracte(el, r) {
    var c = IND.contracte_site || {}, pe = IND.contracte_pe_ani || {}, ani = Object.keys(pe).sort();
    simplu(el, r, {
      key: "contracte", titlu: "Achiziții publice", ft: ["Caută în textul contractelor", ["contracte"]], text: "Contractele publicate de primărie pe site și achizițiile din sistemul național SICAP.", h2: "Contracte publicate pe site",
      top: '<div class="grid">' + tile("Zile de la ultimul contract publicat", c.zile_de_la_ultima == null ? "-" : nr(c.zile_de_la_ultima), zile(c.zile_de_la_ultima), "ultimul: " + zi(c.ultima_postare)) +
        tile("Contracte publicate", nr(ani.reduce(function (a, y) { return a + pe[y]; }, 0)), "", ani.length ? "din " + ani[0] + " până în " + ani[ani.length - 1] : "") + "</div>" +
        (ani.length > 1 ? '<section class="card section"><h2>Contracte publicate pe ani</h2><p class="note">După data postării pe site.</p><div class="chart" id="ch-c"></div></section>' : ""),
      after: function () {
        if (ani.length > 1) chart($("ch-c"), { cats: ani, label: "Contracte publicate pe ani", series: [{ name: "Contracte", color: "var(--s1)", values: ani.map(function (y) { return pe[y]; }) }], labelValue: function (i) { return pe[ani[i]]; }, tooltip: function (i) { return "<b>" + ani[i] + "</b><br>" + pe[ani[i]] + " contracte"; } });
      },
      opt: { an: function (x) { return (x.postat || "").slice(0, 4); }, text: function (x) { return x.titlu; }, item: function (x) { return doc(zi(x.postat), x.titlu, "", x); } }
    });
  }

  // ---------- SICAP: explorator (toate instituțiile, filtre, furnizori, lei/euro) ----------
  var CPV = { "03": "Produse agricole și forestiere", "09": "Combustibili, energie", "14": "Produse miniere", "15": "Alimente și băuturi",
    "16": "Utilaje agricole", "18": "Îmbrăcăminte, echipament", "19": "Piele, textile, plastic", "22": "Tipărituri", "24": "Produse chimice",
    "30": "Echipamente de birou și calculatoare", "31": "Echipamente electrice și iluminat", "32": "Echipamente de comunicații", "33": "Echipamente medicale",
    "34": "Vehicule și transport", "35": "Securitate, pompieri, poliție", "37": "Articole sportive, jocuri, instrumente", "38": "Echipamente de laborator",
    "39": "Mobilier, articole de uz casnic, curățenie", "41": "Apă", "42": "Utilaje industriale", "43": "Utilaje de construcții", "44": "Materiale de construcții",
    "45": "Lucrări de construcții", "48": "Software", "50": "Reparații și întreținere", "51": "Instalare de echipamente", "55": "Hoteluri, restaurante, catering",
    "60": "Transport", "63": "Servicii auxiliare de transport", "64": "Poștă și telecomunicații", "65": "Utilități publice", "66": "Servicii financiare și asigurări",
    "70": "Servicii imobiliare", "71": "Proiectare, inginerie, consultanță tehnică", "72": "Servicii IT", "73": "Cercetare", "75": "Administrație publică",
    "77": "Servicii agricole, silvice, spații verzi", "79": "Servicii juridice, marketing, consultanță, evenimente", "80": "Educație și formare",
    "85": "Sănătate și asistență socială", "90": "Salubrizare, deșeuri, mediu", "92": "Cultură, sport, recreere", "98": "Alte servicii" };
  var SICAP_URL = "https://www.e-licitatie.ro/pub/";
  var SX = null, SXR = null;
  var MON = (function () { try { return localStorage.getItem("mc-moneda") === "eur" ? "eur" : "lei"; } catch (e) { return "lei"; } })();
  function setMon(m) { MON = m; try { localStorage.setItem("mc-moneda", m); } catch (e) {} }
  function euro(v) { return v == null ? "-" : (v >= 1e6 ? dec((v / 1e6).toFixed(1)) + " mil." : nr(Math.round(v))) + " euro"; }
  function bani(v) { return MON === "eur" ? euro(v) : lei(v); }
  function val(x) { return (MON === "eur" ? x.eur : x.lei) || 0; }
  function unitate(max) { return max >= 2e6 ? { div: 1e6, n: "milioane de " + (MON === "eur" ? "euro" : "lei"), z: 1 } : { div: 1e3, n: "mii de " + (MON === "eur" ? "euro" : "lei"), z: 0 }; }
  function rot(v, u) { var k = Math.pow(10, u.z); return Math.round(v / u.div * k) / k; }
  function eti(v, u) { var x = rot(v, u); return u.z ? dec(x) : nr(x); }
  var TIPS = { da: "Achiziție directă", can: "Contract atribuit prin licitație", cn: "Licitație lansată", ac: "Acord-cadru (valoare maximă)" };
  function prag(d, cpv) { var w = (cpv || "").slice(0, 2) === "45"; return (d || "") >= "2022-07-14" ? (w ? 900400 : 270120) : (w ? 450200 : 135060); }

  function sxPrep(d) {
    var A = [];
    var stari = d.stari || [];
    d.da.forEach(function (r) { A.push({ t: "da", id: r[0], i: r[1], d: r[2], an: (r[2] || "").slice(0, 4), f: r[3], c: r[4], lei: r[5], eur: r[6], o: r[7], cod: r[8], niv: r[9], stare: stari[r[10]] || "", ok: r[11] !== 0 }); });
    d.can.forEach(function (r) { A.push({ t: r[12] === 2 ? "ac" : "can", sub: r[12] === 3, id: r[0], i: r[1], d: r[2], an: (r[2] || "").slice(0, 4), f: r[10] != null ? r[10] : -1, c: r[3], lei: r[4], eur: r[5], o: r[6], cod: r[7], proc: r[8], nrc: r[11] || "", niv: 0, ok: true }); });
    d.cn.forEach(function (r) { A.push({ t: "cn", id: r[0], i: r[1], d: r[2], an: (r[2] || "").slice(0, 4), f: -1, c: r[3], lei: r[4], eur: r[5], o: r[6], cod: r[7], proc: r[8], stare: r[9], cont: r[10], niv: 0, ok: true }); });
    d.castigatori = d.can.some(function (r) { return r[10] != null && r[10] >= 0; });
    d.A = A;
    d.div = d.cpv.map(function (c) { return /^\d{2}/.test(c) ? c.slice(0, 2) : "--"; });
    var ani = {}; A.forEach(function (x) { if (x.an) ani[x.an] = 1; });
    d.ani = Object.keys(ani).sort();
    d.fcui = {}; d.furn.forEach(function (f, i) { if (f[0]) d.fcui[f[0]] = i; });
    d.iid = {}; d.inst.forEach(function (x, i) { d.iid[x[0]] = i; });
    return d;
  }
  function url(x) { return SICAP_URL + (x.t === "da" ? "direct-acquisition/view/" : x.t === "cn" ? "notices/c-notice/v2/view/" : "notices/ca-notices/view-c/") + x.id; }
  function fLink(f) {
    var F = SX.furn[f]; if (!F) return "";
    return F[0] ? '<a href="#bani/achizitii/furnizor/' + encodeURIComponent(F[0]) + '">' + esc(F[1] || F[0]) + "</a>" : esc(F[1]);
  }
  function cat(c) { var k = SX.div[c]; return CPV[k] || (k === "--" ? "Fără cod CPV" : "CPV " + k); }

  // filtrele, păstrate în adresă (#bani/achizitii?i=..&t=..), ca o căutare să poată fi trimisă mai departe
  var FKEYS = ["i", "t", "a0", "a1", "c", "q", "min", "ab", "nf"];
  function sxFiltre(q) { var F = {}; FKEYS.forEach(function (k) { F[k] = q[k] || ""; }); return F; }
  function sxHash(F, baza) {
    var p = FKEYS.filter(function (k) { return F[k]; }).map(function (k) { return k + "=" + encodeURIComponent(F[k]); });
    return (baza || "#bani/achizitii") + (p.length ? "?" + p.join("&") : "");
  }
  function sxFilt(F, faraTip) {
    var q = norm(F.q).trim(), gr = /^g:/.test(F.i) ? F.i.slice(2) : null, ii = F.i !== "" && !gr ? SX.iid[F.i] : null, min = +F.min || 0;
    return SX.A.filter(function (x) {
      if (!faraTip && (F.t ? x.t !== F.t : (x.t === "cn" || x.t === "ac"))) return false;
      if (ii != null && x.i !== ii) return false;
      if (gr && SX.inst[x.i][3] !== gr) return false;
      if (F.a0 && x.an < F.a0) return false;
      if (F.a1 && x.an > F.a1) return false;
      if (F.c && SX.div[x.c] !== F.c) return false;
      if (x.niv === 2 && !F.ab) return false;
      if (!x.ok && !F.nf) return false;
      if (min && (x.lei || 0) < min) return false;
      if (q) {
        if (x._s == null) x._s = norm([x.o, x.cod, SX.cpv[x.c], x.f >= 0 ? SX.furn[x.f].join(" ") : "", SX.inst[x.i][1]].join(" "));
        if (x._s.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function suma(rows) { return rows.reduce(function (a, x) { return a + val(x); }, 0); }
  function grup(rows, key) { var o = {}; rows.forEach(function (x) { var k = key(x); if (k == null) return; var g = o[k] || (o[k] = { n: 0, v: 0, lei: 0, rows: [] }); g.n++; g.v += val(x); g.lei += x.lei || 0; g.rows.push(x); }); return o; }

  function hbl(rows, fmt, total) {   // bare orizontale; fiecare rând poate fi un link
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([0])) || 1;
    var pct = function (v) { var p = 100 * v / total; return p > 0 && p < 1 ? "<1%" : Math.round(p) + "%"; };
    return '<div class="hbars">' + rows.map(function (r) {
      var tag = r.href ? 'a class="hb hb-a" href="' + r.href + '"' : 'div class="hb"';
      return "<" + tag + '><span class="hb-l" title="' + esc(r.l) + '">' + esc(r.l) + '</span><span class="hb-t"><i style="width:' + Math.max(1.5, 100 * r.v / (max || 1)) + '%"></i></span><span class="hb-v">' +
        fmt(r.v) + (total ? " <small>" + pct(r.v) + "</small>" : "") + "</span></" + (r.href ? "a" : "div") + ">";
    }).join("") + "</div>";
  }
  function segMon() {
    return '<div class="seg" role="group" aria-label="Moneda"><button type="button" data-m="lei" aria-pressed="' + (MON === "lei") + '">lei</button><button type="button" data-m="eur" aria-pressed="' + (MON === "eur") + '">euro</button></div>';
  }
  function legaSeg(root, refa) {
    Array.prototype.forEach.call(root.querySelectorAll(".seg button"), function (b) {
      b.addEventListener("click", function () { setMon(b.dataset.m); Array.prototype.forEach.call(root.querySelectorAll(".seg button"), function (o) { o.setAttribute("aria-pressed", o.dataset.m === MON); }); refa(); });
    });
  }
  function notaCurs() {
    var c = SX.curs || {};
    return MON === "eur" ? " Sumele în euro sunt calculate la cursul " + (c.sursa === "BNR" ? "BNR din ziua fiecărei achiziții" : c.sursa === "BCE" ? "Băncii Centrale Europene din ziua fiecărei achiziții" : "din SICAP al anului respectiv") + "." : "";
  }

  function sicap(el, r) {
    var cap = head("Achiziții publice", "Ce cumpără primăria și instituțiile din Rădăuți, din Sistemul Electronic de Achiziții Publice (SICAP, e-licitatie.ro), din 2018.", r);
    if (!SX) {
      el.innerHTML = cap + '<p class="updated">Se încarcă datele SICAP...</p>';
      get(DATA + "sicap-explorer.json").then(function (d) { SX = sxPrep(d); render(); })
        .catch(function () { el.innerHTML = cap + '<section class="card section"><h2>Date din SICAP</h2><p>Datele apar după următoarea rulare a colectării.</p></section>'; });
      return;
    }
    if (r.rest[0] === "furnizor" && r.rest[1]) return sxFurnizor(el, r, decodeURIComponent(r.rest[1]));
    if (r.rest[0] === "sicap") r.rest = [];
    sxPanorama(el, r, cap);
  }

  function grupeInst() {
    var o = ["Primăria", "Instituții subordonate primăriei", "Școli și grădinițe", "Alte instituții din oraș"];
    SX.inst.forEach(function (x) { if (x[3] && o.indexOf(x[3]) < 0) o.push(x[3]); });
    return o;
  }

  function sxPanorama(el, r, cap) {
    var F = sxFiltre(r.q);
    var cnt = {}; SX.A.forEach(function (x) { if (x.t !== "cn") cnt[x.i] = (cnt[x.i] || 0) + 1; });
    var instOrd = SX.inst.map(function (x, i) { return i; }).sort(function (a, b) { return (cnt[b] || 0) - (cnt[a] || 0); });
    var divs = {}; SX.A.forEach(function (x) { divs[SX.div[x.c]] = 1; });
    var opt = function (v, t, s) { return '<option value="' + esc(v) + '"' + (String(s) === String(v) ? " selected" : "") + ">" + esc(t) + "</option>"; };
    var aniOpt = function (s, gol) { return opt("", gol, s) + SX.ani.map(function (a) { return opt(a, a, s); }).join(""); };
    el.innerHTML = cap + '<section class="card section"><div class="h-row"><h2>Ultimele achiziții, pe instituții</h2><a href="#bani/achizitii?t=can">toate contractele atribuite</a></div>' +
      '<p class="note">Cele mai recente achiziții directe, licitații și contracte ale principalelor instituții din oraș. Apasă pe un titlu pentru documentul din SICAP, pe numele instituției pentru toate achizițiile ei.</p>' +
      '<div class="sx-ff" id="sx-ff"></div><div class="sx-cols" id="sx-cols"></div></section>' +
      '<section class="card section sx-feed" id="sx-feed"></section>' +
      '<div class="sx-wrap"><div class="sx-main">' +
      '<div class="card section sx-bar"><div class="filters">' +
      '<select id="f-i" aria-label="Instituția">' + opt("", "Toate instituțiile (" + SX.inst.length + ")", F.i) + grupeInst().map(function (g) {
        var din = instOrd.filter(function (i) { return (SX.inst[i][3] || "Alte instituții din oraș") === g; });
        if (!din.length) return "";
        return '<optgroup label="' + esc(g) + '">' + (din.length > 1 ? opt("g:" + g, "Toate: " + g.toLowerCase() + " (" + din.length + ")", F.i) : "") +
          din.map(function (i) { return opt(SX.inst[i][0], SX.inst[i][1] + " (" + nr(cnt[i] || 0) + ")", F.i); }).join("") + "</optgroup>";
      }).join("") + "</select>" +
      '<select id="f-t" aria-label="Tipul">' + opt("", "Toate cumpărările", F.t) + opt("da", "Achiziții directe (fără licitație)", F.t) + opt("can", "Contracte atribuite prin licitație", F.t) + opt("cn", "Licitații lansate (valoare estimată)", F.t) + opt("ac", "Acorduri-cadru (valoare maximă)", F.t) + "</select>" +
      '<select id="f-c" aria-label="Categoria">' + opt("", "Toate categoriile", F.c) + Object.keys(divs).sort(function (a, b) { return (CPV[a] || a).localeCompare(CPV[b] || b, "ro"); }).map(function (k) { return opt(k, CPV[k] || (k === "--" ? "Fără cod CPV" : "CPV " + k), F.c); }).join("") + "</select>" +
      '</div><div class="filters">' +
      '<input id="f-q" type="search" value="' + esc(F.q) + '" placeholder="Caută: obiect, furnizor, CUI, cod CPV (ex. asfalt, 45233)" aria-label="Caută">' +
      '<label class="lbl-s">din <select id="f-a0" aria-label="De la anul">' + aniOpt(F.a0, "2018") + '</select></label><label class="lbl-s">până în <select id="f-a1" aria-label="Până în anul">' + aniOpt(F.a1, "prezent") + "</select></label>" +
      '<select id="f-min" aria-label="Valoarea minimă">' + opt("", "Orice valoare", F.min) + ["10000", "50000", "100000", "270000", "1000000"].map(function (v) { return opt(v, "peste " + nr(+v) + " lei", F.min); }).join("") + "</select>" +
      segMon() + "</div>" +
      '<div class="sx-act"><label class="chk"><input type="checkbox" id="f-ab"' + (F.ab ? " checked" : "") + "> include valorile aberante din SICAP</label>" +
      '<label class="chk"><input type="checkbox" id="f-nf"' + (F.nf ? " checked" : "") + "> include achizițiile directe neîncheiate</label>" +
      '<a href="#bani/achizitii" id="f-reset">Șterge filtrele</a></div></div><div id="sx-out"></div></div></div>';
    function citeste() {
      ["i", "t", "c", "q", "a0", "a1", "min"].forEach(function (k) { F[k] = $("f-" + k).value; });
      F.ab = $("f-ab").checked ? "1" : "";
      F.nf = $("f-nf").checked ? "1" : "";
      if (F.a0 && F.a1 && F.a0 > F.a1) { var t = F.a0; F.a0 = F.a1; F.a1 = t; }
      history.replaceState(null, "", sxHash(F));
      sxOut($("sx-out"), F);
      sxFeed($("sx-feed"), F);
    }
    ["f-i", "f-t", "f-c", "f-a0", "f-a1", "f-min", "f-ab", "f-nf"].forEach(function (id) { $(id).addEventListener("change", citeste); });
    var tq; $("f-q").addEventListener("input", function () { clearTimeout(tq); tq = setTimeout(citeste, 250); });
    legaSeg(el, function () { sxOut($("sx-out"), F); sxFeed($("sx-feed"), F); sxColoane($("sx-cols")); });
    SXR = function (patch) { Object.keys(patch).forEach(function (k) { F[k] = patch[k]; }); location.hash = sxHash(F); };
    sxOut($("sx-out"), F);
    sxFeed($("sx-feed"), F);
    sxColoane($("sx-cols"));
    sxFelFiltre($("sx-ff"), function () { sxColoane($("sx-cols")); sxFeed($("sx-feed"), F); });
    if (INTERN) {   // ce am găsit în SICAP și n-am inclus: de verificat dacă lipsește vreo instituție din oraș
      el.insertAdjacentHTML("beforeend", '<div id="sx-ex"></div>');
      get(DATA + "sicap.json").then(function (d) {
        var ex = d.excluse || []; if (!ex.length) return;
        $("sx-ex").innerHTML = '<section class="card section"><h2>Autorități găsite în SICAP, dar neincluse (intern)</h2><p class="note">Apar la căutarea după „Rădăuți” sau după termenii suplimentari, dar nu sunt din oraș sau nu au CUI-ul în listă. Dacă una e din Rădăuți, CUI-ul ei se adaugă în config.SICAP_CUI_EXTRA.</p><div class="tw"><table><tbody>' +
          ex.map(function (x) { return "<tr><td>" + esc(x.text) + '</td><td class="n">id ' + esc(x.id) + "</td></tr>"; }).join("") + "</tbody></table></div></section>";
      }).catch(function () {});
    }
  }

  function sxOut(el, F) {
    var rows = sxFilt(F), cumparari = F.t !== "cn" && F.t !== "ac";
    var da = rows.filter(function (x) { return x.t === "da"; }), can = rows.filter(function (x) { return x.t === "can"; });
    var tot = suma(rows), nAni = {}, h = "";
    rows.forEach(function (x) { if (x.an) nAni[x.an] = 1; });
    var ani = Object.keys(nAni).sort();
    if (!rows.length) { el.innerHTML = '<section class="card section"><p class="empty">Nicio achiziție nu corespunde filtrelor.</p></section>'; return; }
    var perioada = ani.length ? (ani[0] === ani[ani.length - 1] ? "în " + ani[0] : "din " + ani[0] + " până în " + ani[ani.length - 1]) : "";
    var cuF = rows.filter(function (x) { return x.f >= 0; });
    var gf = grup(cuF, function (x) { return x.f; });
    var fk = Object.keys(gf).sort(function (a, b) { return gf[b].v - gf[a].v; });
    var top5 = fk.slice(0, 5).reduce(function (a, k) { return a + gf[k].v; }, 0), vda = suma(da), vf = suma(cuF);
    var maxRow = rows.reduce(function (m, x) { return val(x) > val(m) ? x : m; }, rows[0]);
    // cifrele principale
    h += '<div class="grid">' +
      tile(cumparari ? "Total cumpărat" : F.t === "ac" ? "Valoarea maximă a acordurilor-cadru" : "Valoarea estimată a licitațiilor", bani(tot), "", nr(rows.length) + (cumparari ? " achiziții și contracte, " : F.t === "ac" ? " acorduri-cadru, " : " licitații, ") + perioada);
    if (!F.t && tot) h += tile("Cumpărat fără licitație", Math.round(100 * vda / tot) + "%", "", "din valoare: " + nr(da.length) + " achiziții directe, " + bani(vda));
    if (fk.length) h += tile("Furnizori diferiți", nr(fk.length), "", "primii 5 au primit <strong>" + Math.round(100 * top5 / (vf || 1)) + "%</strong> din banii cu furnizor cunoscut");
    h += tile("Cea mai mare valoare", bani(val(maxRow)), "", esc((maxRow.f >= 0 ? SX.furn[maxRow.f][1] + ": " : "") + (maxRow.o || "").slice(0, 70))) + "</div>";
    // pe ani
    var gA = {}; rows.forEach(function (x) { var g = gA[x.an] || (gA[x.an] = { da: 0, can: 0, cn: 0, nda: 0, ncan: 0, ncn: 0 }); g[x.t] += val(x); g["n" + x.t]++; });
    var A = []; if (ani.length) for (var y = +ani[0]; y <= +ani[ani.length - 1]; y++) A.push(String(y));
    var ser = cumparari ? [["da", "Achiziții directe", "var(--s1)"], ["can", "Contracte prin licitație", "var(--s2)"]].filter(function (s) { return !F.t || F.t === s[0]; }) : F.t === "ac" ? [["ac", "Acorduri-cadru", "var(--plan)"]] : [["cn", "Licitații lansate", "var(--s3)"]];
    var maxA = Math.max.apply(null, A.map(function (y) { var g = gA[y] || {}; return ser.reduce(function (a, s) { return a + (g[s[0]] || 0); }, 0); }).concat([1]));
    var u = unitate(maxA);
    h += '<section class="card section"><h2>' + (cumparari ? "Cât s-a cumpărat, pe ani" : F.t === "ac" ? "Acorduri-cadru, pe ani (valoare maximă)" : "Valoarea estimată a licitațiilor lansate, pe ani") + '</h2><p class="note">În ' + u.n + ". Achizițiile directe după data finalizării, contractele după data semnării. " +
      (cumparari ? "Acordurile-cadru nu intră aici: valoarea lor e doar un plafon, iar banii cheltuiți apar în contractele subsecvente. " : "") + "Apasă pe un an ca să vezi doar anul respectiv." + notaCurs() + "</p>" +
      (ser.length > 1 ? legend(ser.map(function (s) { return [s[1], s[2]]; })) : "") + '<div class="chart" id="ch-a"></div>' +
      '<details class="tbl"><summary>Vezi tabelul</summary><div class="tw"><table><thead><tr><th>An</th>' + ser.map(function (s) { return '<th class="n">' + s[1] + '</th><th class="n">Nr.</th>'; }).join("") + "</tr></thead><tbody>" +
      A.slice().reverse().map(function (y) { var g = gA[y] || {}; return "<tr><td>" + y + "</td>" + ser.map(function (s) { return '<td class="n">' + bani(g[s[0]] || 0) + '</td><td class="n">' + nr(g["n" + s[0]] || 0) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table></div></details></section>";
    // număr pe ani și sezonalitate
    var gL = {}; rows.forEach(function (x) { var m = +(x.d || "").slice(5, 7); if (m) { gL[m] = gL[m] || { v: 0, n: 0 }; gL[m].v += val(x); gL[m].n++; } });
    var LL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], maxL = Math.max.apply(null, LL.map(function (m) { return (gL[m] || {}).v || 0; }).concat([1])), uL = unitate(maxL);
    h += '<div class="grid two"><section class="card"><h2>Câte achiziții, pe ani</h2><p class="note">Numărul de achiziții și contracte, nu valoarea lor.</p><div class="chart" id="ch-n"></div></section>' +
      '<section class="card"><h2>În ce lună se cumpără</h2><p class="note">Valoarea pe luni, adunată pe toți anii selectați, în ' + uL.n + '. Un vârf în decembrie arată cheltuieli făcute la final de an.</p><div class="chart" id="ch-l"></div></section></div>';
    // furnizori și categorii
    var gc = grup(rows, function (x) { return SX.div[x.c]; }), ck = Object.keys(gc).sort(function (a, b) { return gc[b].v - gc[a].v; });
    h += '<div class="grid two">' + (fk.length ? '<section class="card"><h2>Furnizorii cu cele mai mari sume</h2><p class="note">' + (SX.castigatori ? "Achiziții directe și contracte câștigate la licitație." : "Achiziții directe.") + " Apasă pe un furnizor ca să vezi tot ce a vândut instituțiilor din Rădăuți.</p>" +
      hbl(fk.slice(0, 10).map(function (k) { var Fn = SX.furn[k]; return { l: Fn[1] || Fn[0], v: gf[k].v, href: Fn[0] ? "#bani/achizitii/furnizor/" + encodeURIComponent(Fn[0]) : null }; }), bani, vf) + "</section>" : "") +
      '<section class="card"><h2>Pe ce s-au dat banii</h2><p class="note">Pe categorii de produse și servicii (codul CPV). Apasă pe o categorie ca să o filtrezi.</p>' +
      hbl(ck.slice(0, 12).map(function (k) { return { l: CPV[k] || (k === "--" ? "Fără cod CPV" : "CPV " + k), v: gc[k].v, href: F.c ? null : sxHash(Object.assign({}, F, { c: k })) }; }), bani, tot) + "</section></div>";
    if (F.i === "" || /^g:/.test(F.i)) {
      var gi = grup(rows, function (x) { return x.i; }), ik = Object.keys(gi).sort(function (a, b) { return gi[b].v - gi[a].v; });
      h += '<section class="card section"><h2>Pe instituții</h2><p class="note">Cine cumpără: primăria și instituțiile din subordinea ei sau din oraș. Apasă pe o instituție ca să o filtrezi.</p>' +
        hbl(ik.map(function (k) { return { l: SX.inst[k][1], v: gi[k].v, href: sxHash(Object.assign({}, F, { i: String(SX.inst[k][0]) })) }; }), bani, tot) + "</section>";
    }
    // mărimea achizițiilor directe
    if (da.length) {
      var B = [["sub 5.000 lei", 0, 5000], ["5.000 - 25.000 lei", 5000, 25000], ["25.000 - 100.000 lei", 25000, 100000], ["100.000 - 270.000 lei", 100000, 270000], ["peste 270.000 lei", 270000, Infinity]];
      var bn = B.map(function (b) { return da.filter(function (x) { var v = x.lei || 0; return v >= b[1] && v < b[2]; }).length; });
      h += '<section class="card section"><h2>Cât de mari sunt achizițiile directe</h2><p class="note">Câte achiziții directe intră în fiecare treaptă de valoare (în lei). Pragul legal pentru o achiziție directă este 270.120 lei la produse și servicii și 900.400 lei la lucrări (din iulie 2022).</p>' +
        hbl(B.map(function (b, i) { return { l: b[0], v: bn[i] }; }), function (v) { return nr(v); }, da.length) + "</section>";
    }
    h += '<div id="sx-semn"></div><div id="sx-ver"></div><div id="sx-nf"></div>';
    if (fk.length) h += '<section class="card section"><h2>Toți furnizorii</h2><p class="note">' + (SX.castigatori ? "Achiziții directe și contracte câștigate la licitație" : "Achiziții directe") + ', după filtrele de mai sus.</p><div id="sx-f"></div></section>';
    h += '<section class="card section"><h2>Toate achizițiile</h2><p class="note">Fiecare rând duce la pagina din SICAP; numele furnizorului duce la pagina lui.</p><div id="sx-l"></div></section>';
    el.innerHTML = h;
    // grafice
    chart($("ch-a"), { cats: A, stacked: true, label: "Valoarea pe ani",
      series: ser.map(function (s) { return { name: s[1], color: s[2], values: A.map(function (y) { return rot((gA[y] || {})[s[0]] || 0, u); }) }; }),
      labelValue: function (i) { var g = gA[A[i]] || {}, t = ser.reduce(function (a, s) { return a + (g[s[0]] || 0); }, 0); return t ? eti(t, u) : ""; },
      tooltip: function (i) { var g = gA[A[i]] || {}; return "<b>" + A[i] + "</b>" + ser.map(function (s) { return "<br>" + s[1] + ": " + bani(g[s[0]] || 0) + " (" + nr(g["n" + s[0]] || 0) + ")"; }).join(""); },
      onClick: function (i) { SXR({ a0: A[i], a1: A[i] }); } });
    chart($("ch-n"), { cats: A, stacked: true, label: "Numărul de achiziții pe ani",
      series: ser.map(function (s) { return { name: s[1], color: s[2], values: A.map(function (y) { return (gA[y] || {})["n" + s[0]] || 0; }) }; }),
      labelValue: function (i) { var g = gA[A[i]] || {}; return nr(ser.reduce(function (a, s) { return a + (g["n" + s[0]] || 0); }, 0)) || ""; },
      tooltip: function (i) { var g = gA[A[i]] || {}; return "<b>" + A[i] + "</b>" + ser.map(function (s) { return "<br>" + s[1] + ": " + nr(g["n" + s[0]] || 0); }).join(""); } });
    chart($("ch-l"), { cats: LL.map(function (m) { return LUNI[m - 1].slice(0, 3); }), label: "Valoarea pe luni ale anului",
      series: [{ name: "Valoare", color: "var(--s1)", values: LL.map(function (m) { return rot((gL[m] || {}).v || 0, uL); }) }],
      tooltip: function (i) { var g = gL[LL[i]] || { v: 0, n: 0 }; return "<b>" + LUNI[LL[i] - 1] + "</b><br>" + bani(g.v) + "<br>" + nr(g.n) + " achiziții"; } });
    sxSemnale($("sx-semn"), da, "Achiziții directe repetate la același furnizor");
    sxVerificat($("sx-ver"), F);
    sxNeincheiate($("sx-nf"), F);
    if (fk.length) sxFurnizori($("sx-f"), gf, fk);
    sxLista($("sx-l"), rows);
  }

  function sxSemnale(el, da, titlu) {
    var g = {};
    da.forEach(function (x) { if (x.t !== "da" || !x.ok || x.niv === 2 || !(x.f >= 0) || !SX.furn[x.f][0]) return; var c = SX.cpv[x.c] || "", k = x.an + "|" + x.i + "|" + x.f + "|" + c.slice(0, 3); (g[k] = g[k] || []).push(x); });
    var out = [];
    Object.keys(g).forEach(function (k) {
      var l = g[k]; if (l.length < 2) return;
      var s = l.reduce(function (a, x) { return a + leiOk(x); }, 0), dm = l.reduce(function (a, x) { return x.d > a ? x.d : a; }, ""), p = prag(dm, SX.cpv[l[0].c]);
      if (s > p && l.every(function (x) { return (x.lei || 0) < p; })) out.push({ l: l, s: s, p: p });
    });
    if (!out.length) { el.innerHTML = ""; return; }
    out.sort(function (a, b) { return b.s - a.s; });
    el.innerHTML = '<section class="card section"><h2>De verificat: ' + esc(titlu.toLowerCase()) + '</h2><p class="note">Aceeași instituție, același an, același furnizor și aceeași categorie de produse sau servicii: mai multe achiziții directe, fiecare sub pragul legal, dar împreună peste prag. ' +
      "Nu e o constatare de încălcare a legii: divizarea se judecă după necesarul estimat al instituției. E un semnal care merită verificat. " + nr(out.length) + " cazuri.</p>" +
      out.slice(0, 12).map(function (x) {
        var a = x.l[0];
        return '<div class="doc"><div class="h"><span class="id">' + esc(a.an) + " · " + fLink(a.f) + '</span><span class="tag">' + esc(SX.inst[a.i][1]) + "</span></div>" +
          '<div class="t">' + x.l.length + " achiziții directe, total <strong>" + lei(x.s) + "</strong>, față de pragul de " + lei(x.p) + " · " + esc(cat(a.c)) + "</div>" +
          '<div class="m">' + x.l.slice(0, 8).map(function (y) { return '<a href="' + url(y) + '" rel="noopener">' + esc(y.cod || y.id) + "</a>"; }).join("") + (x.l.length > 8 ? "<span>și încă " + (x.l.length - 8) + "</span>" : "") + "</div></div>";
      }).join("") + (out.length > 12 ? '<p class="note">Se afișează primele 12, după sumă. Restrânge filtrele ca să le vezi pe celelalte.</p>' : "") + "</section>";
  }

  function sxVerificat(el, F) {
    var G = Object.assign({}, F, { t: "da", ab: "1", min: "", nf: "" }), v = sxFilt(G).filter(function (x) { return x.niv && x.ok; }).sort(function (a, b) { return (b.lei || 0) - (a.lei || 0); });
    if (!v.length) { el.innerHTML = ""; return; }
    var ab = v.filter(function (x) { return x.niv === 2; }).length;
    el.innerHTML = '<section class="card section"><h2>Valori de verificat în SICAP</h2><p class="note">Achiziții directe trecute în SICAP cu o valoare peste pragul legal, chiar și cu TVA inclus. ' +
      (ab ? "<strong>" + ab + "</strong> dintre ele depășesc de peste 10 ori pragul: sunt aproape sigur greșeli de introducere (de exemplu, zecimale sau o valoare totală pusă la o singură cumpărare) și " + (F.ab ? "sunt incluse acum în totaluri, la cerere." : "nu intră în totalurile și graficele de mai sus.") + " " : "") +
      "Valoarea corectă se poate vedea în documentele din SICAP.</p>" +
      v.slice(0, 15).map(function (x) {
        return '<div class="doc"><div class="h"><span class="id">' + esc(zi(x.d)) + " · " + lei(x.lei) + '</span><span class="tag"' + (x.niv === 2 ? ' style="border-color:var(--bad)"' : "") + ">" + (x.niv === 2 ? "valoare aberantă" : "peste pragul legal") + "</span></div>" +
          '<div class="t">' + esc(x.o) + '</div><div class="m"><span>' + esc(SX.inst[x.i][1]) + "</span>" + fLink(x.f) + '<a href="' + url(x) + '" rel="noopener">în SICAP (' + esc(x.cod) + ")</a></div></div>";
      }).join("") + (v.length > 15 ? '<p class="note">Și încă ' + (v.length - 15) + ".</p>" : "") + "</section>";
  }

  function sxNeincheiate(el, F) {
    if (F.nf) { el.innerHTML = ""; return; }
    var v = sxFilt(Object.assign({}, F, { t: "da", nf: "1", ab: "1" })).filter(function (x) { return !x.ok; }).sort(function (a, b) { return (b.lei || 0) - (a.lei || 0); });
    if (!v.length) { el.innerHTML = ""; return; }
    var ps = {}; v.forEach(function (x) { ps[x.stare || "fără stare"] = (ps[x.stare || "fără stare"] || 0) + 1; });
    el.innerHTML = '<section class="card section"><h2>Achiziții directe neîncheiate</h2><p class="note">Achiziții directe pornite în SICAP, dar care nu s-au încheiat: furnizorul a refuzat condițiile, oferta a fost respinsă sau achiziția a fost anulată. ' +
      "Nu sunt bani cheltuiți, așa că nu intră în totaluri și grafice. Le poți include cu bifa de sus. " + nr(v.length) + " achiziții: " +
      Object.keys(ps).sort(function (a, b) { return ps[b] - ps[a]; }).map(function (k) { return esc(k.toLowerCase()) + " " + nr(ps[k]); }).join(", ") + ".</p>" +
      v.slice(0, 10).map(function (x) { return sxItem(x, true); }).join("") + (v.length > 10 ? '<p class="note">Cele mai mari 10, după valoare. Bifează „include achizițiile directe neîncheiate” ca să le vezi pe toate în listă.</p>' : "") + "</section>";
  }

  function sxFurnizori(el, gf, fk) {
    var shown = 20;
    el.innerHTML = '<div class="filters"><input type="search" placeholder="Caută furnizorul după nume sau CUI" aria-label="Caută furnizorul"></div><p class="count"></p><div class="tw"><table><thead><tr><th>Furnizor</th><th>CUI</th><th class="n">Achiziții</th><th class="n">Valoare</th><th class="n">Ani</th></tr></thead><tbody></tbody></table></div><button class="more" hidden>Arată mai mulți</button>';
    var inp = el.querySelector("input");
    function draw() {
      var q = norm(inp.value).trim();
      var l = fk.filter(function (k) { return !q || norm(SX.furn[k].join(" ")).indexOf(q) >= 0; });
      el.querySelector(".count").textContent = nr(l.length) + (l.length === 1 ? " furnizor" : " furnizori");
      el.querySelector("tbody").innerHTML = l.slice(0, shown).map(function (k) {
        var g = gf[k], an = {}; g.rows.forEach(function (x) { an[x.an] = 1; }); var a = Object.keys(an).sort();
        return "<tr><td>" + fLink(+k) + "</td><td>" + esc(SX.furn[k][0]) + '</td><td class="n">' + nr(g.n) + '</td><td class="n">' + bani(g.v) + '</td><td class="n">' + (a.length > 1 ? a[0] + "-" + a[a.length - 1] : a[0] || "") + "</td></tr>";
      }).join("");
      el.querySelector(".more").hidden = l.length <= shown;
    }
    inp.addEventListener("input", function () { shown = 20; draw(); });
    el.querySelector(".more").addEventListener("click", function () { shown += 50; draw(); });
    draw();
  }

  // fluxul de noutăți din achiziții (coloana din dreapta): licitații lansate, contracte atribuite, achiziții directe
  var FEED_MIN = { "": 0, mari: 50000 };
  var SXF = { fel: "", mari: false };   // filtrele comune ale coloanelor și ale fluxului
  function sxFelOk(x) {
    var fel = SXF.fel;
    if (fel && (fel === "lic" ? x.t !== "cn" : fel === "atr" ? (x.t !== "can" && x.t !== "ac") : x.t !== "da")) return false;
    if (x.t === "da" && (x.lei || 0) < (SXF.mari ? 50000 : 5000)) return false;
    return true;
  }
  function sxFelFiltre(el, dupa) {
    el.innerHTML = '<div class="seg mic" role="group" aria-label="Ce achiziții">' + [["", "Toate"], ["lic", "Licitații lansate"], ["atr", "Contracte atribuite"], ["da", "Achiziții directe"]].map(function (x) {
      return '<button type="button" data-f="' + x[0] + '" aria-pressed="' + (SXF.fel === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>" +
      '<label class="chk"><input type="checkbox"' + (SXF.mari ? " checked" : "") + "> achizițiile directe doar peste 50.000 lei</label>";
    Array.prototype.forEach.call(el.querySelectorAll(".seg button"), function (b) { b.addEventListener("click", function () { SXF.fel = b.dataset.f; sxFelFiltre(el, dupa); dupa(); }); });
    el.querySelector("input").addEventListener("change", function () { SXF.mari = this.checked; dupa(); });
  }
  // coloanele cu cele mai recente achiziții ale principalelor instituții (cu sigla lor) și ale celorlalte
  var SX_PRINC = [["4244148", "Primăria Municipiului Rădăuți", "primaria"], ["2563140", "Servicii Comunale S.A.", "servicii-comunale"],
    ["4327367", "Spitalul Municipal „Sf. Doctori Cosma și Damian”", "spital"], ["713519", "ACET S.A. (apă și canalizare)", "acet"]];
  function sxColoane(el) {
    if (!el) return;
    var idx = {}; SX.inst.forEach(function (x, i) { idx[String(x[2])] = i; });
    var an = String(new Date().getFullYear());
    var col = SX_PRINC.filter(function (p) { return idx[p[0]] != null; }).map(function (p) { return { p: p, i: idx[p[0]] }; });
    var princ = {}; col.forEach(function (c) { princ[c.i] = 1; });
    col.push({ p: [null, "Alte instituții din oraș", null], alte: true });
    var et = { cn: ["licitație lansată", "ic"], can: ["contract atribuit", "c"], ac: ["acord-cadru atribuit", "c"], da: ["achiziție directă", "n"] };
    el.innerHTML = col.map(function (c) {
      var L2 = SX.A.filter(function (x) { return x.ok && x.niv !== 2 && x.d && (c.alte ? !princ[x.i] : x.i === c.i) && sxFelOk(x); })
        .sort(function (a, b) { return (b.d || "").localeCompare(a.d || ""); });
      var tot = L2.filter(function (x) { return x.an === an && x.t !== "cn"; }).reduce(function (s, x) { return s + (val(x) || 0); }, 0);
      var link = c.alte ? "#bani/achizitii" : sxHash({ i: String(SX.inst[c.i][0]) });
      return '<div class="sx-col"><a class="sx-col-h" href="' + link + '">' + (c.p[2] ? '<img src="' + BASE + "assets/img/sigle/" + c.p[2] + '.png" alt="" loading="lazy">' : '<span class="sx-col-alte">+' + (SX.inst.length - col.length + 1) + "</span>") +
        "<b>" + esc(c.p[1]) + '</b><span class="muted">' + (tot ? bani(tot) + " în " + an : "nimic încheiat în " + an) + "</span></a>" +
        (L2.length ? '<ol class="sx-feed-l sx-col-l">' + L2.slice(0, 15).map(function (x) {
          var e = et[x.t] || ["", "n"];
          return '<li class="' + e[1] + '"><div class="ff-d">' + esc(zi(x.d)) + ' · <span>' + esc(x.sub ? "contract subsecvent" : e[0]) + "</span></div>" +
            '<a class="ff-t" href="' + url(x) + '" rel="noopener">' + esc((x.o || "(fără titlu)").slice(0, 120)) + "</a>" +
            '<div class="ff-m">' + (c.alte ? esc(SX.inst[x.i][1]) + (x.lei ? " · " : "") : "") + (x.lei ? "<strong>" + bani(val(x)) + "</strong>" + (x.t === "cn" ? " estimat" : "") : "") + (x.f >= 0 ? " · " + fLink(x.f) : "") + "</div></li>";
        }).join("") + "</ol>" : '<p class="empty">Nimic recent.</p>') + '<a class="sx-col-tot" href="' + link + '">Toate →</a></div>';
    }).join("");
  }
  function sxFeed(el, F) {
    if (!el) return;
    var gr = /^g:/.test(F.i) ? F.i.slice(2) : null, ii = F.i !== "" && !gr ? SX.iid[F.i] : null;
    var ev = SX.A.filter(function (x) {
      if (!x.ok || x.niv === 2 || !x.d) return false;
      if (ii != null && x.i !== ii) return false;
      if (gr && SX.inst[x.i][3] !== gr) return false;
      return sxFelOk(x);
    }).sort(function (a, b) { return (b.d || "").localeCompare(a.d || ""); }).slice(0, 24);
    var et = { cn: ["licitație lansată", "ic"], can: ["contract atribuit", "c"], ac: ["acord-cadru atribuit", "c"], da: ["achiziție directă", "n"] };
    el.innerHTML = '<div class="sx-feed-h"><h2>Cele mai noi achiziții, toate la un loc</h2><p class="note">' + (ii != null ? "La " + esc(SX.inst[ii][1]) : gr ? "La " + esc(gr.toLowerCase()) : "La toate instituțiile din oraș") + ", după filtrele de mai sus.</p></div>" +
      (ev.length ? '<ol class="sx-feed-l">' + ev.map(function (x) {
        var e = et[x.t] || ["", "n"];
        return '<li class="' + e[1] + '"><div class="ff-d">' + esc(zi(x.d)) + ' · <span>' + esc(x.sub ? "contract subsecvent" : e[0]) + "</span></div>" +
          '<a class="ff-t" href="' + url(x) + '" rel="noopener">' + esc((x.o || "(fără titlu)").slice(0, 140)) + "</a>" +
          '<div class="ff-m">' + esc(SX.inst[x.i][1]) + (x.lei ? " · <strong>" + bani(val(x)) + "</strong>" + (x.t === "cn" ? " estimat" : "") : "") + (x.f >= 0 ? " · " + fLink(x.f) : "") + "</div></li>";
      }).join("") + "</ol>" : '<p class="empty">Nimic recent pentru filtrele alese.</p>');
  }

  function sxItem(x, cuInst) {
    var m = [];
    if (cuInst) m.push("<span>" + esc(SX.inst[x.i][1]) + "</span>");
    if (x.f >= 0) m.push(fLink(x.f));
    if (x.t !== "da" && x.proc) m.push("<span>" + esc(x.proc) + (x.t === "cn" && x.stare ? " · " + esc(x.stare) : "") + (x.cont ? " · contestată" : "") + (x.nrc ? " · contract " + esc(x.nrc) : "") + "</span>");
    m.push("<span>" + esc(cat(x.c)) + "</span>");
    m.push('<a href="' + url(x) + '" rel="noopener">în SICAP' + (x.cod ? " (" + esc(x.cod) + ")" : "") + "</a>");
    return '<div class="doc"><div class="h"><span class="id">' + esc(zi(x.d)) + (x.lei ? " · " + bani(val(x)) : "") + '</span><span class="tag">' + (x.sub ? "Contract subsecvent (din acord-cadru)" : TIPS[x.t]) + "</span>" +
      (!x.ok ? '<span class="tag" style="border-color:var(--plan)">neîncheiată: ' + esc((x.stare || "").toLowerCase()) + "</span>" : "") +
      (x.ok && x.niv ? '<span class="tag" style="border-color:var(--' + (x.niv === 2 ? "bad" : "warn") + ')">' + (x.niv === 2 ? "valoare aberantă" : "peste pragul legal") + "</span>" : "") + "</div>" +
      '<div class="t">' + esc(x.o || "(fără titlu)") + '</div><div class="m">' + m.join("") + "</div></div>";
  }
  function sxLista(el, rows, cuInst) {
    var shown = 25, ord = "data";
    el.innerHTML = '<div class="filters"><select aria-label="Ordinea"><option value="data">Cele mai noi întâi</option><option value="val">Cele mai mari valori întâi</option></select></div><p class="count"></p><div class="items"></div><button class="more" hidden>Arată mai multe</button>';
    function draw() {
      var l = rows.slice().sort(ord === "val" ? function (a, b) { return val(b) - val(a); } : function (a, b) { return (b.d || "").localeCompare(a.d || ""); });
      el.querySelector(".count").textContent = nr(l.length) + " înregistrări";
      el.querySelector(".items").innerHTML = l.slice(0, shown).map(function (x) { return sxItem(x, cuInst !== false); }).join("");
      el.querySelector(".more").hidden = l.length <= shown;
    }
    el.querySelector("select").addEventListener("change", function () { ord = this.value; shown = 25; draw(); });
    el.querySelector(".more").addEventListener("click", function () { shown += 50; draw(); });
    draw();
  }

  // fișa firmei: pe lângă SICAP, autorizațiile și certificatele de urbanism cerute de ea și hotărârile care o pomenesc
  var FORME = /\b(s\.?\s?c\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|p\.?\s?f\.?\s?a\.?|i\.?\s?i\.?|i\.?\s?f\.?|societatea|comerciala|companie)(?=\s|$|[,.;)])/g;
  function firmaRx(nume) {
    var t = norm(nume).replace(/[„”"'«»(),.;:&-]+/g, " ").replace(FORME, " ").split(/\s+/).filter(function (w) { return w.length >= 3; });
    if (!t.length || !t.some(function (w) { return w.length >= 4; })) return null;
    var esc_ = function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
    // un singur cuvânt (ex. „ASFALT”): doar urmat de forma juridică, ca să nu prindem cuvântul obișnuit
    // la începutul numelui (sau după „S.C.”/ghilimele) și urmat imediat de forma juridică
    return t.length === 1 ? new RegExp("(^|s\\.?\\s?c\\.?[\\s\"„,.]*|[\"„]\\s*)" + esc_(t[0]) + "[\\s,.\"”]+(s\\.?\\s?r\\.?\\s?l|s\\.?\\s?a)\\b") : new RegExp("(^|[^a-z0-9])" + t.map(esc_).join("[\\s,.&-]+") + "([^a-z0-9]|$)");
  }
  function firmaAlte(el, nume) {
    var rx = firmaRx(nume); if (!el || !rx) return;
    if (!URB) { get(DATA + "urbanism.json").then(function (d) { URB = d; firmaAlte(el, nume); }).catch(function () { URB = { cu: [], ac: [] }; }); return; }
    var acte = []; ["ac", "cu"].forEach(function (t) { (URB[t] || []).forEach(function (a) { if (a.pj && rx.test(norm(a.solicitant))) acte.push({ t: t, a: a }); }); });
    var H = (L.hcl || []).filter(function (h) { return rx.test(norm(h.titlu)); });
    var C = (L.contracte || []).filter(function (c) { return rx.test(norm(c.titlu)); });
    if (!acte.length && !H.length && !C.length) return;
    el.innerHTML = '<section class="card section"><h2>Alte legături cu orașul</h2><p class="note">Găsite după numele firmei în registrele de urbanism, în titlurile hotărârilor și ale contractelor publicate pe site. Verifică în documente: o firmă cu nume asemănător poate apărea și ea.</p>' +
      (acte.length ? "<h3>Autorizații de construire și certificate de urbanism (" + acte.length + ")</h3>" + acte.slice(0, 30).map(function (x) {
        return '<div class="doc"><div class="h"><span class="id">' + (x.t === "ac" ? "AC " : "CU ") + esc(x.a.nr || "") + " · " + esc(zi(x.a.data)) + '</span><span class="tag">' + esc(x.a.categorie || "") + "</span>" + (x.a.strada ? '<span class="muted">' + esc(x.a.strada) + "</span>" : "") +
          '</div><div class="t">' + esc((x.a.scop || "").slice(0, 240)) + '</div><div class="m">' + (safeUrl(x.a.registru_pdf) ? '<a class="lk" href="' + esc(x.a.registru_pdf) + '" rel="noopener">registrul</a>' : "") + "</div></div>"; }).join("") : "") +
      (H.length ? "<h3>Hotărâri ale consiliului local (" + H.length + ")</h3>" + H.slice(0, 30).map(function (h) { return doc(linkHcl(h), h.titlu, h.data ? "adoptată " + zi(h.data) : "", h); }).join("") : "") +
      (C.length ? "<h3>Contracte publicate pe site-ul primăriei (" + C.length + ")</h3>" + C.slice(0, 30).map(function (c) { return doc("Contract", c.titlu, c.postat ? "publicat " + zi(c.postat) : "", c); }).join("") : "") + "</section>";
  }
  function sxFurnizor(el, r, cui) {
    var f = SX.fcui[cui];
    var inapoi = '<p class="back"><a href="#bani/achizitii">← Toate achizițiile</a></p>';
    if (f == null) { el.innerHTML = head("Achiziții publice", "", r) + inapoi + '<section class="card section"><p class="empty">Furnizorul cu CUI ' + esc(cui) + " nu apare în achizițiile instituțiilor din Rădăuți.</p></section>"; return; }
    var Fn = SX.furn[f];
    function deseneaza() {
      var all = SX.A.filter(function (x) { return x.f === f; }), rows = all.filter(function (x) { return x.niv < 2 && x.ok && x.t !== "ac"; });
      var acs = all.filter(function (x) { return x.t === "ac"; });
      var nDa = rows.filter(function (x) { return x.t === "da"; }).length, nCan = rows.length - nDa;
      var tot = suma(rows), ani = {}; all.forEach(function (x) { ani[x.an] = 1; }); var ak = Object.keys(ani).sort();
      var gi = grup(rows, function (x) { return x.i; }), ik = Object.keys(gi).sort(function (a, b) { return gi[b].v - gi[a].v; });
      var gc = grup(rows, function (x) { return SX.div[x.c]; }), ck = Object.keys(gc).sort(function (a, b) { return gc[b].v - gc[a].v; });
      // locul în clasamentul furnizorilor (achiziții directe, toți anii)
      var tf = {}; SX.A.forEach(function (x) { if (x.ok && x.niv < 2 && x.f >= 0 && x.t !== "ac") tf[x.f] = (tf[x.f] || 0) + val(x); });
      var loc = 1 + Object.keys(tf).filter(function (k) { return tf[k] > (tf[f] || 0); }).length;
      var h = head(Fn[1] || ("CUI " + Fn[0]), "CUI " + esc(Fn[0]) + ". Tot ce a vândut instituțiilor din Rădăuți prin SICAP, din 2018: achiziții directe" + (SX.castigatori ? " și contracte câștigate la licitație" : "") + ".", r) + inapoi +
        '<div class="filters">' + segMon() + "</div>" +
        '<div class="grid">' + tile("Total primit", bani(tot), "", nr(nDa) + " achiziții directe" + (nCan ? " și " + nr(nCan) + " contracte prin licitație" : "") + ", " + (ak.length ? (ak.length > 1 ? ak[0] + "-" + ak[ak.length - 1] : "în " + ak[0]) : "")) +
        tile("Instituții care au cumpărat", nr(ik.length), "", ik.length ? "cele mai multe de la " + esc(SX.inst[ik[0]][1]) : "") +
        tile("Locul între furnizori", nr(loc), "", "din " + nr(Object.keys(tf).length) + ", după suma primită") +
        tile("Valoarea medie a unei achiziții", bani(rows.length ? tot / rows.length : 0), "", "cea mai mare: " + bani(rows.reduce(function (m, x) { return Math.max(m, val(x)); }, 0))) + "</div>";
      var A = []; if (ak.length) for (var y = +ak[0]; y <= +ak[ak.length - 1]; y++) A.push(String(y));
      var topI = ik.slice(0, 3), culori = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--plan)"];
      var serii = topI.map(function (k, j) { return { k: [+k], name: SX.inst[k][1], color: culori[j] }; });
      if (ik.length > 3) serii.push({ k: ik.slice(3).map(Number), name: "Alte instituții", color: culori[3] });
      var gA = {}; rows.forEach(function (x) { var g = gA[x.an] || (gA[x.an] = { v: 0, n: 0, pe: {} }); g.v += val(x); g.n++; g.pe[x.i] = (g.pe[x.i] || 0) + val(x); });
      var u = unitate(Math.max.apply(null, A.map(function (y) { return (gA[y] || {}).v || 0; }).concat([1])));
      h += '<section class="card section"><h2>Cât a primit, pe ani</h2><p class="note">În ' + u.n + ", pe instituții." + notaCurs() + "</p>" + (serii.length > 1 ? legend(serii.map(function (s) { return [s.name, s.color]; })) : "") + '<div class="chart" id="ch-fa"></div>' +
        '<details class="tbl"><summary>Vezi tabelul</summary><div class="tw"><table><thead><tr><th>An</th><th class="n">Achiziții</th><th class="n">Lei</th><th class="n">Euro</th></tr></thead><tbody>' +
        A.slice().reverse().map(function (y) { var l = rows.filter(function (x) { return x.an === y; }); return "<tr><td>" + y + '</td><td class="n">' + nr(l.length) + '</td><td class="n">' + lei(l.reduce(function (a, x) { return a + leiOk(x); }, 0)) + '</td><td class="n">' + euro(l.reduce(function (a, x) { return a + (x.eur || 0); }, 0)) + "</td></tr>"; }).join("") +
        "</tbody></table></div></details></section>";
      h += '<div class="grid two"><section class="card"><h2>Câte achiziții, pe ani</h2><div class="chart" id="ch-fn"></div></section>' +
        '<section class="card"><h2>Ce a vândut</h2><p class="note">Pe categorii de produse și servicii.</p>' + hbl(ck.slice(0, 8).map(function (k) { return { l: CPV[k] || ("CPV " + k), v: gc[k].v }; }), bani, tot) + "</section></div>";
      if (ik.length > 1) h += '<section class="card section"><h2>Cui a vândut</h2>' + hbl(ik.map(function (k) { return { l: SX.inst[k][1], v: gi[k].v, href: sxHash({ i: String(SX.inst[k][0]), q: Fn[0] }) }; }), bani, tot) + "</section>";
      h += '<div id="sx-semn"></div>';
      var ab = all.filter(function (x) { return x.niv === 2 && x.ok; }), ne = all.filter(function (x) { return !x.ok; });
      if (acs.length) h += '<p class="callout">' + (acs.length === 1 ? "Un acord-cadru" : acs.length + " acorduri-cadru") + " cu o valoare maximă de " + bani(suma(acs)) + ". Nu intră în totaluri: acordul-cadru e doar plafonul; ce s-a cumpărat efectiv apare în contractele subsecvente.</p>";
      if (ne.length) h += '<p class="callout">' + ne.length + (ne.length === 1 ? " achiziție directă nu s-a încheiat" : " achiziții directe nu s-au încheiat") + " (" + esc(Array.from(new Set(ne.map(function (x) { return (x.stare || "").toLowerCase(); }))).join(", ")) + "), în valoare de " + lei(ne.reduce(function (a, x) { return a + leiOk(x); }, 0)) + ". Nu sunt bani primiți și nu intră în totaluri; apar în lista de mai jos, marcate.</p>";
      if (ab.length) h += '<p class="callout">' + ab.length + (ab.length === 1 ? " achiziție are" : " achiziții au") + " în SICAP o valoare de peste 10 ori pragul legal (în total " + lei(ab.reduce(function (a, x) { return a + leiOk(x); }, 0)) + "), aproape sigur o greșeală de introducere. Nu intră în totalurile de mai sus; apar în lista de mai jos, marcate.</p>";
      if (!SX.castigatori) h += '<p class="note">Contractele atribuite prin licitație nu au încă furnizorul câștigător în datele noastre; apar după următoarea colectare.</p>';
      h += '<div id="fn-alte"></div><section class="card section"><h2>Toate achizițiile de la acest furnizor</h2><div id="sx-l"></div></section>';
      el.innerHTML = h;
      firmaAlte($("fn-alte"), Fn[1] || "");
      chart($("ch-fa"), { cats: A, stacked: true, label: "Valoarea pe ani",
        series: serii.map(function (s) { return { name: s.name, color: s.color, values: A.map(function (y) { var g = gA[y]; return g ? rot(s.k.reduce(function (a, k) { return a + (g.pe[k] || 0); }, 0), u) : 0; }) }; }),
        labelValue: function (i) { var g = gA[A[i]]; return g && g.v ? eti(g.v, u) : ""; },
        tooltip: function (i) { var g = gA[A[i]] || { v: 0, n: 0 }; return "<b>" + A[i] + "</b><br>" + bani(g.v) + "<br>" + nr(g.n) + " achiziții"; } });
      chart($("ch-fn"), { cats: A, label: "Numărul de achiziții și contracte pe ani", series: [{ name: "Achiziții", color: "var(--s1)", values: A.map(function (y) { return (gA[y] || {}).n || 0; }) }],
        labelValue: function (i) { return (gA[A[i]] || {}).n || ""; }, tooltip: function (i) { return "<b>" + A[i] + "</b><br>" + nr((gA[A[i]] || {}).n || 0) + " achiziții"; } });
      sxSemnale($("sx-semn"), rows, "Achiziții repetate de la acest furnizor");
      var instF = {}; all.forEach(function (x) { instF[x.i] = 1; });
      lista($("sx-l"), all.sort(function (a, b) { return (b.d || "").localeCompare(a.d || ""); }), {
        placeholder: "Caută în obiectul achiziției", unitate: ["achiziție", "achiziții"],
        an: function (x) { return x.an; }, text: function (x) { return [x.o, x.cod, SX.cpv[x.c]].join(" "); },
        extraFilter: Object.keys(instF).length > 1 ? { html: '<select aria-label="Instituția"><option value="">Toate instituțiile</option>' + Object.keys(instF).map(function (i) { return '<option value="' + i + '">' + esc(SX.inst[i][1]) + "</option>"; }).join("") + "</select>", test: function (x, e) { return String(x.i) === e; } } : null,
        item: function (x) { return sxItem(x, true); }
      });
      legaSeg(el, deseneaza);
    }
    deseneaza();
  }

  // ---------- Primărie: Buget ----------
  var RX_BUGET = /buget|rectific|executi|imprumut|credite de angajament|venituri si cheltuieli|excedent|deficit/;
  var BUG;   // undefined = neîncărcat, null = indisponibil
  function buget(el, r) {
    if (BUG === undefined) {
      el.innerHTML = head("Buget", "", r) + '<p class="updated">Se încarcă datele bugetului...</p>';
      get(DATA + "buget.json").then(function (d) { BUG = d; render(); }).catch(function () { BUG = null; render(); });
      return;
    }
    var H = (L.hcl || []).filter(function (x) { return RX_BUGET.test(norm(x.titlu)); });
    var fel = function (x) { var t = norm(x.titlu); return /rectific/.test(t) ? "rect" : /aprob\w* (a )?bugetului|aprobarea bugetului/.test(t) ? "apr" : /imprumut/.test(t) ? "impr" : "alt"; };
    var F3 = [["apr", "Aprobarea bugetului", "var(--s1)"], ["rect", "Rectificări", "var(--s2)"], ["impr", "Împrumuturi", "var(--s3)"], ["alt", "Alte hotărâri despre buget", "var(--plan)"]];
    var pe = {}; H.forEach(function (x) { var a = String(x.an), k = fel(x); pe[a] = pe[a] || {}; pe[a][k] = (pe[a][k] || 0) + 1; });
    var ani = Object.keys(pe).sort(), A = []; if (ani.length) for (var y = +ani[0]; y <= +ani[ani.length - 1]; y++) A.push(String(y));
    var an = ani[ani.length - 1], rect = an ? (pe[an].rect || 0) : 0;
    var h = head("Buget", "Bugetul municipiului: hotărârile consiliului despre buget, documentele de buget și bilanțurile publicate de primărie.", r) +
      '<div class="grid">' + tile("Hotărâri despre buget", nr(H.length), "", ani.length ? "din " + ani[0] + " până în " + an : "") +
      (an ? tile("Rectificări de buget în " + an, nr(rect), "", "modificări ale bugetului aprobat la început de an") : "") +
      tile("Documente de buget publicate", nr((L.buget || []).length), "", "pe site-ul primăriei") +
      tile("Bilanțuri contabile", nr((L.bilanturi || []).length), "", "trimestriale, publicate pe site") + "</div>" +
      '<div id="exec"></div><div id="pe-ani"></div><div id="aprobat"></div><div id="datorie"></div>' +
      '<section class="card section"><h2>Hotărâri despre buget, pe ani</h2><p class="note">Hotărârile consiliului local care aprobă, rectifică sau modifică bugetul, după titlu. Multe rectificări într-un an înseamnă un buget schimbat des.</p>' +
      legend(F3.map(function (f) { return [f[1], f[2]]; })) + '<div class="chart" id="ch-b"></div></section>' +

      '<section class="card section"><h2>Hotărârile despre buget</h2><div id="lst"></div></section>' +
      '<div class="grid two"><section class="card"><h2>Documente de buget</h2><div id="lst2"></div></section><section class="card"><h2>Bilanțuri contabile</h2><div id="lst3"></div></section></div>';
    el.innerHTML = h;
    executie($("exec"));
    bugetPeAni($("pe-ani"));
    bugetAprobat($("aprobat"));
    datoria($("datorie"));
    chart($("ch-b"), { cats: A, stacked: true, label: "Hotărâri despre buget pe ani",
      series: F3.map(function (f) { return { name: f[1], color: f[2], values: A.map(function (y) { return (pe[y] || {})[f[0]] || 0; }) }; }),
      labelValue: function (i) { var p = pe[A[i]] || {}; return Object.keys(p).reduce(function (a, k) { return a + p[k]; }, 0) || ""; },
      tooltip: function (i) { var p = pe[A[i]] || {}; return "<b>" + A[i] + "</b>" + F3.map(function (f) { return p[f[0]] ? "<br>" + f[1] + ": " + p[f[0]] : ""; }).join(""); } });
    lista($("lst"), H, { placeholder: "Caută în titluri (ex. rectificare, împrumut, credite)", unitate: ["hotărâre", "hotărâri"],
      an: function (x) { return String(x.an); }, text: function (x) { return x.titlu + " " + x.nr + "/" + x.an; },
      extraFilter: { html: '<select aria-label="Felul"><option value="">Toate</option>' + F3.map(function (f) { return '<option value="' + f[0] + '">' + f[1] + "</option>"; }).join("") + "</select>", test: function (x, e) { return fel(x) === e; } },
      item: function (x) { return doc(linkHcl(x), x.titlu, x.data ? "adoptată " + zi(x.data) : "", x); } });
    [["lst2", L.buget || []], ["lst3", L.bilanturi || []]].forEach(function (p) {
      lista($(p[0]), p[1], { an: function (x) { return (x.postat || "").slice(0, 4); }, text: function (x) { return x.titlu; },
        item: function (x) { return doc(zi(x.postat), x.titlu, "", x); } });
    });
  }

  // inel (donut) cu legendă: părțile unui întreg, cel mult 6 felii + „Altele”
  // „harta” bugetului: dreptunghiuri cu aria proporțională cu suma (algoritmul „squarified”); click pe un dreptunghi = detalii
  function treemap(el, items, opt) {
    var W = Math.max(300, el.clientWidth || 700), H = W < 560 ? 420 : 340, tot = items.reduce(function (a, x) { return a + x.v; }, 0);
    if (!tot) { el.innerHTML = ""; return; }
    var rest = items.filter(function (x) { return x.v > 0; }).map(function (x) { return { x: x, a: x.v / tot * W * H }; }), out = [], box = { x: 0, y: 0, w: W, h: H };
    function worst(row, s) { var sum = 0, mx = 0, mn = Infinity; row.forEach(function (r) { sum += r.a; mx = Math.max(mx, r.a); mn = Math.min(mn, r.a); }); return Math.max(s * s * mx / (sum * sum), sum * sum / (s * s * mn)); }
    function aseaza(row) {
      var sum = row.reduce(function (a, r) { return a + r.a; }, 0), oriz = box.w >= box.h, l = oriz ? sum / box.h : sum / box.w, p = 0;
      row.forEach(function (r) { var d = r.a / l; out.push(oriz ? { x: box.x, y: box.y + p, w: l, h: d, it: r.x } : { x: box.x + p, y: box.y, w: d, h: l, it: r.x }); p += d; });
      if (oriz) { box.x += l; box.w -= l; } else { box.y += l; box.h -= l; }
    }
    var row = [];
    while (rest.length) {
      var s = Math.min(box.w, box.h), c = rest[0];
      if (!row.length || worst(row.concat([c]), s) <= worst(row, s)) { row.push(c); rest.shift(); } else { aseaza(row); row = []; }
    }
    if (row.length) aseaza(row);
    el.innerHTML = '<div class="tm" style="height:' + H + 'px" role="list" aria-label="' + esc(opt.label || "") + '">' + out.map(function (b, i) {
      var pct = Math.round(100 * b.it.v / tot), mic = b.w < 90 || b.h < 46;
      return '<button type="button" role="listitem" class="tm-b' + (mic ? " mic" : "") + '" data-i="' + i + '" style="left:' + (100 * b.x / W) + "%;top:" + (100 * b.y / H) + "%;width:" + (100 * b.w / W) + "%;height:" + (100 * b.h / H) + "%;--c:" + b.it.color + '" title="' + esc(b.it.l + ": " + lei(b.it.v) + " (" + pct + "%)") + '">' +
        (mic ? "" : "<b>" + esc(b.it.l) + "</b><span>" + lei(b.it.v) + " · " + pct + "%</span>") + "</button>";
    }).join("") + '</div><div class="tm-d" id="' + el.id + '-d"></div>';
    Array.prototype.forEach.call(el.querySelectorAll(".tm-b"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(el.querySelectorAll(".tm-b"), function (x) { x.classList.toggle("ales", x === b); });
        if (opt.onClick) opt.onClick(out[+b.dataset.i].it, $(el.id + "-d"));
      });
    });
  }
  function donut(el, items, opt) {
    opt = opt || {};
    items = items.filter(function (x) { return x.v > 0; });
    var total = items.reduce(function (a, x) { return a + x.v; }, 0);
    if (!total) { el.innerHTML = '<p class="note">Fără date pentru acest an.</p>'; return; }
    var max = opt.max || 6, rest = items.slice(max);
    items = items.slice(0, max);
    if (rest.length) items.push({ l: "Altele", v: rest.reduce(function (a, x) { return a + x.v; }, 0), color: "var(--plan)", sub: rest.map(function (x) { return x.l; }) });
    var R = 96, r0 = 62, cx = 100, cy = 100, a = -Math.PI / 2;
    var pt = function (rad, ang) { return (cx + rad * Math.cos(ang)).toFixed(2) + " " + (cy + rad * Math.sin(ang)).toFixed(2); };
    var paths = items.map(function (x, i) {
      var f = x.v / total, a1 = a + f * 2 * Math.PI, big = f > 0.5 ? 1 : 0;
      var d = f >= 0.9999 ? "M" + pt(R, -Math.PI / 2) + " A" + R + " " + R + " 0 1 1 " + pt(R, Math.PI * 1.4999) + " Z" :
        "M" + pt(R, a) + " A" + R + " " + R + " 0 " + big + " 1 " + pt(R, a1) + " L" + pt(r0, a1) + " A" + r0 + " " + r0 + " 0 " + big + " 0 " + pt(r0, a) + " Z";
      a = a1;
      return '<path data-i="' + i + '" d="' + d + '" fill="' + x.color + '" stroke="var(--surface)" stroke-width="2"/>';
    }).join("");
    var pc = function (v) { var p = 100 * v / total; return p < 1 ? "sub 1%" : Math.round(p) + "%"; };
    el.innerHTML = '<div class="dn"><svg viewBox="0 0 200 200" role="img" aria-label="' + esc(opt.label || "") + '">' + paths +
      '<text class="ctr1" x="100" y="94" text-anchor="middle">' + esc(opt.centru || "total") + '</text><text class="ctr2" x="100" y="118" text-anchor="middle">' + esc(opt.total || lei(total)) + "</text></svg>" +
      "<ul>" + items.map(function (x, i) {
        return '<li data-i="' + i + '"' + (x.sub ? ' title="' + esc(x.sub.join(", ")) + '"' : "") + '><i style="background:' + x.color + '"></i><span>' + esc(x.l) + '<span class="v">' + lei(x.v) + '</span></span><span class="p">' + pc(x.v) + "</span></li>";
      }).join("") + "</ul></div>";
    var c1 = el.querySelector(".ctr1"), c2 = el.querySelector(".ctr2"), t1 = c1.textContent, t2 = c2.textContent;
    var on = function (i) {
      Array.prototype.forEach.call(el.querySelectorAll("li"), function (li) { li.classList.toggle("on", li.dataset.i === String(i)); });
      Array.prototype.forEach.call(el.querySelectorAll("path"), function (p) { p.style.opacity = i == null || p.dataset.i === String(i) ? 1 : 0.35; });
      if (i == null) { c1.textContent = t1; c2.textContent = t2; } else { var x = items[i]; c1.textContent = x.l.length > 26 ? x.l.slice(0, 25) + "…" : x.l; c2.textContent = pc(x.v); }
    };
    Array.prototype.forEach.call(el.querySelectorAll("path,li"), function (n) {
      n.addEventListener("mouseenter", function () { on(+n.dataset.i); });
      n.addEventListener("mouseleave", function () { on(null); });
    });
  }
  // culori fixe: fiecare sursă de venit și fiecare capitol au mereu aceeași culoare, în orice an
  var CUL = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)", "var(--c8)"];
  function culoareSursa(k) { var i = SURSE_ORD.indexOf(k); return i >= 0 && i < CUL.length ? CUL[i] : "var(--plan)"; }
  var SCURT_SURSE = { "Impozite și taxe locale": "impozite și taxe locale plătite de rădăuțeni și firme", "Cote din impozitul pe venit": "cote din impozitul pe salarii și venituri",
    "Sume defalcate din TVA": "bani de la bugetul de stat (sume din TVA)", "Alte venituri proprii (chirii, servicii, amenzi)": "chirii, servicii și amenzi",
    "Subvenții de la stat și alte bugete": "subvenții de la stat (programe naționale)", "Fonduri europene": "fonduri europene", "Împrumuturi": "împrumuturi",
    "Excedent din anii trecuți și alte operațiuni financiare": "bani rămași din anii trecuți", "Alte venituri": "alte venituri" };
  function sutaLei(items, total, txt) {
    var it = items.filter(function (x) { return x.v > 0; }).slice(0, 4);
    return it.map(function (x) { return "<strong>" + Math.round(100 * x.v / total) + " lei</strong> " + esc(txt(x.l)); }).join(", ");
  }
  // bugetul municipiului pe ani: de unde vin banii, cât s-a investit și din ce, cât s-a împrumutat
  var PAL = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)", "var(--c8)"];
  var SURSE_ORD = ["Impozite și taxe locale", "Cote din impozitul pe venit", "Sume defalcate din TVA", "Alte venituri proprii (chirii, servicii, amenzi)",
    "Subvenții de la stat și alte bugete", "Fonduri europene", "Împrumuturi", "Excedent din anii trecuți și alte operațiuni financiare", "Alte venituri"];
  function bugetPeAni(el) {
    var M = BUG && (BUG.entitati || []).filter(function (e) { return e.cui === BUG.municipiu; })[0];
    var D = M && (BUG.detalii || {})[M.cui];
    var azi = String(new Date().getFullYear());
    var ani = D ? Object.keys(D).filter(function (a) { return a < azi && M.ani[a]; }).sort() : [];
    if (ani.length < 2) { el.innerHTML = ""; return; }
    var P = ((BUG.datorie || {}).pe_ani) || {};
    var g = function (a, k, x) { return ((D[a] || {})[k] || {})[x] || 0; };
    var inv = function (a) { return g(a, "fel", "Investiții (dezvoltare)"); };
    var fun = function (a) { return g(a, "fel", "Funcționare") + g(a, "fel", "Nespecificat"); };
    var tr = function (a) { return (P[a] || {}).trageri || 0; };
    var eu = function (a) { return g(a, "surse", "Fonduri europene"); };
    var sub = function (a) { return g(a, "surse", "Subvenții de la stat și alte bugete"); };
    var a0 = ani[0], a1 = ani[ani.length - 1];
    var sInv = ani.reduce(function (s, a) { return s + inv(a); }, 0), sTr = ani.reduce(function (s, a) { return s + tr(a); }, 0);
    var sEu = ani.reduce(function (s, a) { return s + eu(a); }, 0);
    var cr = function (x, y) { return x && y ? Math.round(100 * (y - x) / x) : null; };
    var cv = cr(M.ani[a0].venituri, M.ani[a1].venituri), ci = cr(inv(a0), inv(a1));
    var surse = SURSE_ORD.filter(function (k) { return ani.some(function (a) { return g(a, "surse", k); }); });
    var u = unitate(Math.max.apply(null, ani.map(function (a) { return M.ani[a].venituri || 0; }).concat([1])));
    var un = u.n.replace(/ de (euro|lei)$/, " de lei");
    var cap = {}; ani.forEach(function (a) { Object.keys((D[a] || {}).dezv || {}).forEach(function (k) { cap[k] = (cap[k] || 0) + D[a].dezv[k]; }); });
    var capTop = Object.keys(cap).sort(function (x, y) { return cap[y] - cap[x]; }).slice(0, 6);
    var h = '<section class="card section"><h2>Bugetul orașului de la an la an</h2>' +
      '<p class="note">Anii încheiați, ' + a0 + "-" + a1 + ', în lei curenți (fără ajustare cu inflația). Sursa: execuția bugetară raportată Ministerului Finanțelor, prin transparenta.eu.</p>' +
      '<div class="grid" style="margin:8px 0 0">' +
      tile("Venituri " + a1, lei(M.ani[a1].venituri), "", cv != null ? (cv >= 0 ? "cu " + cv + "% mai mult" : "cu " + (-cv) + "% mai puțin") + " decât în " + a0 : "") +
      tile("Investiții " + a1, lei(inv(a1)), "", ci != null ? (ci >= 0 ? "cu " + ci + "% mai mult" : "cu " + (-ci) + "% mai puțin") + " decât în " + a0 : "") +
      tile("Investiții " + a0 + "-" + a1, lei(sInv), "", "secțiunea de dezvoltare, în total") +
      tile("Împrumutat " + a0 + "-" + a1, lei(sTr), "", sInv ? "echivalentul a <strong>" + Math.round(100 * sTr / sInv) + "%</strong> din investițiile perioadei" : "") + "</div>" +

      '<h3 style="margin-top:16px">De unde au venit banii, pe ani</h3><p class="note">Veniturile municipiului pe surse, în ' + un + '. Banii din împrumuturi apar separat.</p>' +
      legend(surse.map(function (k) { return [k, culoareSursa(k)]; })) + '<div class="chart" id="ch-surse"></div>' +

      '<h3 style="margin-top:16px">Secțiunea de dezvoltare și secțiunea de funcționare</h3><p class="note">Bugetul local are două secțiuni: <strong>funcționare</strong> (salarii, utilități, întreținere, ajutoare sociale) și <strong>dezvoltare</strong> (investiții: construcții, străzi, clădiri, echipamente). Cheltuieli, în ' + un + ".</p>" +
      legend([["Dezvoltare (investiții)", "var(--s1)"], ["Funcționare", "var(--plan)"]]) + '<div class="chart" id="ch-sect"></div>' +

      '<h3 style="margin-top:16px">Investițiile și din ce au fost finanțate</h3><p class="note">Pentru fiecare an: cât s-a investit, cât s-a împrumutat și cât a venit din fonduri europene și subvenții de la stat (o parte din subvenții plătesc și cheltuieli curente). ' +
      "Banii nu au etichetă, deci nu putem spune exact ce investiție a fost plătită din credit; dar împrumuturile unei primării se pot face, prin lege, mai ales pentru investiții și pentru refinanțarea datoriei. " +
      (sInv ? "În " + a0 + "-" + a1 + " municipiul a investit <strong>" + lei(sInv) + "</strong>, a tras din împrumuturi <strong>" + lei(sTr) + "</strong> și a primit din fonduri europene <strong>" + lei(sEu) + "</strong>." : "") + "</p>" +
      legend([["Investiții", "var(--s1)"], ["Împrumutat", "var(--bad)"], ["Fonduri europene", "var(--c6)"], ["Subvenții de la stat", "var(--c4)"]]) + '<div class="chart" id="ch-fin"></div>' +

      (capTop.length ? '<h3 style="margin-top:16px">Pe ce s-a investit, pe ani</h3><p class="note">Secțiunea de dezvoltare pe capitole, în ' + un + ".</p>" +
        legend(capTop.concat(["Altele"]).map(function (k, i) { return [k, PAL[i % PAL.length]]; })) + '<div class="chart" id="ch-dezv"></div>' : "") +
      "</section>";
    el.innerHTML = h;
    var tt = function (a, rows) { return "<b>" + a + "</b>" + rows.filter(function (r) { return r[1]; }).map(function (r) { return "<br>" + r[0] + ": " + lei(r[1]); }).join(""); };
    chart($("ch-surse"), { cats: ani, stacked: true, label: "Veniturile pe surse și ani",
      series: surse.map(function (k) { return { name: k, color: culoareSursa(k), values: ani.map(function (a) { return rot(g(a, "surse", k), u); }) }; }),
      labelValue: function (i) { return dec((M.ani[ani[i]].venituri / u.div).toFixed(u.z)); },
      tooltip: function (i) { var a = ani[i]; return tt(a, [["Total venituri", M.ani[a].venituri]].concat(surse.map(function (k) { return [k, g(a, "surse", k)]; }))); } });
    chart($("ch-sect"), { cats: ani, stacked: true, label: "Secțiunea de dezvoltare și de funcționare pe ani",
      series: [{ name: "Dezvoltare", color: "var(--s1)", values: ani.map(function (a) { return rot(inv(a), u); }) },
               { name: "Funcționare", color: "var(--plan)", values: ani.map(function (a) { return rot(fun(a), u); }) }],
      tooltip: function (i) { var a = ani[i], t = inv(a) + fun(a); return tt(a, [["Dezvoltare (investiții)", inv(a)], ["Funcționare", fun(a)]]) + (t ? "<br>Investițiile: " + Math.round(100 * inv(a) / t) + "% din cheltuieli" : ""); } });
    var u2 = unitate(Math.max.apply(null, ani.map(function (a) { return Math.max(inv(a), tr(a), eu(a), sub(a)); }).concat([1])));
    chart($("ch-fin"), { cats: ani, grouped: true, label: "Investiții, împrumuturi, fonduri europene și subvenții pe ani",
      series: [{ name: "Investiții", color: "var(--s1)", values: ani.map(function (a) { return rot(inv(a), u2); }) },
               { name: "Împrumutat", color: "var(--bad)", values: ani.map(function (a) { return rot(tr(a), u2); }) },
               { name: "Fonduri europene", color: "var(--c6)", values: ani.map(function (a) { return rot(eu(a), u2); }) },
               { name: "Subvenții", color: "var(--c4)", values: ani.map(function (a) { return rot(sub(a), u2); }) }],
      tooltip: function (i) { var a = ani[i]; return tt(a, [["Investiții", inv(a)], ["Împrumutat", tr(a)], ["Fonduri europene", eu(a)], ["Subvenții de la stat", sub(a)]]) +
        (inv(a) && tr(a) ? "<br>Împrumutul = " + Math.round(100 * tr(a) / inv(a)) + "% din investiții" : ""); } });
    if (capTop.length) chart($("ch-dezv"), { cats: ani, stacked: true, label: "Investițiile pe capitole și ani",
      series: capTop.concat(["Altele"]).map(function (k, i) {
        return { name: k, color: PAL[i % PAL.length], values: ani.map(function (a) {
          var x = (D[a] || {}).dezv || {};
          return rot(k === "Altele" ? Object.keys(x).filter(function (c) { return capTop.indexOf(c) < 0; }).reduce(function (s, c) { return s + x[c]; }, 0) : (x[k] || 0), u); }) }; }),
      tooltip: function (i) { var a = ani[i], x = (D[a] || {}).dezv || {}; return tt(a, Object.keys(x).sort(function (p, q) { return x[q] - x[p]; }).slice(0, 8).map(function (k) { return [k, x[k]]; })); } });
  }

  // bugetul aprobat (planul depus la Ministerul Finanțelor) față de execuție
  var FIN_ORD = ["Împrumuturi", "PNRR", "Fonduri europene", "Programe naționale (PNDL, Anghel Saligny etc.)", "Subvenții de la alte bugete",
    "Excedentul din anii trecuți", "Bani mutați din secțiunea de funcționare", "Vânzări de bunuri (terenuri, clădiri)", "Alte surse"];
  var FIN_CUL = { "Împrumuturi": "var(--c8)", "PNRR": "var(--c2)", "Fonduri europene": "var(--c3)", "Programe naționale (PNDL, Anghel Saligny etc.)": "var(--c4)",
    "Subvenții de la alte bugete": "var(--c5)", "Excedentul din anii trecuți": "var(--c6)", "Bani mutați din secțiunea de funcționare": "var(--c7)", "Vânzări de bunuri (terenuri, clădiri)": "var(--c1)" };
  function culFin(k) { return FIN_CUL[k] || "var(--plan)"; }
  function bugetAprobat(el) {
    var A = (BUG && BUG.aprobat) || {}, ani = Object.keys(A).sort();
    if (!ani.length) { el.innerHTML = ""; return; }
    var M = (BUG.entitati || []).filter(function (e) { return e.cui === BUG.municipiu; })[0] || { ani: {} };
    var D = (BUG.detalii || {})[BUG.municipiu] || {};
    var realiz = function (a) { return D[a] ? (D[a].fel["Investiții (dezvoltare)"] || 0) : null; };
    var u = unitate(Math.max.apply(null, ani.map(function (a) { return Math.max(A[a].cheltuieli, A[a].dezvoltare); }).concat([1])));
    var un = u.n.replace(/ de (euro|lei)$/, " de lei");
    var surse = FIN_ORD.filter(function (k) { return ani.some(function (a) { return (A[a].finantare_dezvoltare || {})[k]; }); });
    var cuImpr = ani.filter(function (a) { return (A[a].finantare_dezvoltare || {})["Împrumuturi"]; });
    var azi = String(new Date().getFullYear());
    var h = '<section class="card section"><h2>Bugetul aprobat: ce și-a propus primăria</h2>' +
      '<p class="note">Bugetele municipiului așa cum au fost depuse la Ministerul Finanțelor (formularul „Buget individual”, Transparență bugetară), ' + ani[0] + "-" + ani[ani.length - 1] +
      ". Sunt bugetele de la începutul anului; pe parcurs se rectifică. Le comparăm cu ce s-a cheltuit efectiv (execuția).</p>" +
      '<h3 style="margin-top:12px">Investiții planificate și investiții realizate</h3><p class="note">Secțiunea de dezvoltare: cât prevedea bugetul aprobat și cât s-a plătit efectiv în anul respectiv, în ' + un + ".</p>" +
      legend([["Planificat (buget aprobat)", "var(--track)"], ["Realizat (execuție)", "var(--s1)"]]) + '<div class="chart" id="ch-apr"></div>' +
      '<h3 style="margin-top:16px">Din ce urmau să fie plătite investițiile</h3><p class="note">Sursele secțiunii de dezvoltare din bugetul aprobat, în ' + un + ". " +
      (cuImpr.length ? "Împrumuturi apar în bugetul aprobat în: <strong>" + cuImpr.join(", ") + "</strong>." : "În bugetele aprobate nu apare niciun împrumut; dacă s-au contractat credite, au intrat prin rectificări.") + "</p>" +
      legend(surse.map(function (k) { return [k, culFin(k)]; })) + '<div class="chart" id="ch-fin2"></div>' +
      '<details class="tbl"><summary>Vezi tabelul</summary><div class="tw"><table><thead><tr><th>An</th><th class="n">Buget aprobat</th><th class="n">Funcționare</th><th class="n">Dezvoltare</th><th class="n">din care împrumuturi</th><th class="n">Cheltuit efectiv</th><th class="n">Investiții realizate</th><th class="n">Realizare investiții</th></tr></thead><tbody>' +
      ani.slice().reverse().map(function (a) {
        var x = A[a], r = realiz(a), ex = (M.ani[a] || {}).cheltuieli;
        return "<tr><td>" + a + '</td><td class="n">' + lei(x.cheltuieli) + '</td><td class="n">' + lei(x.functionare) + '</td><td class="n">' + lei(x.dezvoltare) + '</td><td class="n">' + lei((x.finantare_dezvoltare || {})["Împrumuturi"] || 0) +
          '</td><td class="n">' + (ex != null ? lei(ex) + (a === azi ? "*" : "") : "-") + '</td><td class="n">' + (r != null ? lei(r) : "-") + '</td><td class="n">' + (r != null && x.dezvoltare ? Math.round(100 * r / x.dezvoltare) + "%" : "-") + "</td></tr>";
      }).join("") + '</tbody></table></div><p class="note">* anul în curs: execuția până la ultima raportare.</p></details></section>';
    el.innerHTML = h;
    chart($("ch-apr"), { cats: ani, grouped: true, label: "Investiții planificate și realizate pe ani",
      series: [{ name: "Planificat", color: "var(--track)", values: ani.map(function (a) { return rot(A[a].dezvoltare, u); }) },
               { name: "Realizat", color: "var(--s1)", values: ani.map(function (a) { return rot(realiz(a) || 0, u); }) }],
      tooltip: function (i) { var a = ani[i], r = realiz(a); return "<b>" + a + "</b><br>Planificat: " + lei(A[a].dezvoltare) + "<br>Realizat: " + (r != null ? lei(r) + (A[a].dezvoltare ? " (" + Math.round(100 * r / A[a].dezvoltare) + "%)" : "") : "fără date de execuție"); } });
    chart($("ch-fin2"), { cats: ani, stacked: true, label: "Sursele planificate ale investițiilor pe ani",
      series: surse.map(function (k) { return { name: k, color: culFin(k), values: ani.map(function (a) { return rot(Math.max(0, (A[a].finantare_dezvoltare || {})[k] || 0), u); }) }; }),
      tooltip: function (i) { var a = ani[i], f = A[a].finantare_dezvoltare || {}; return "<b>" + a + "</b>" + surse.map(function (k) { return f[k] ? "<br>" + k + ": " + lei(f[k]) : ""; }).join(""); } });
  }

  // datoria publică: din execuția bugetară (trageri, rate, dobânzi), soldul din documentele primăriei și hotărârile de împrumut
  var RX_DATORIE = /imprumut|finantar\w* rambursabil|datori\w* public|garantar\w* (unui|unei) (credit|imprumut)|credit\w* (bancar|intern|extern)|obligatiuni/;
  function datoria(el) {
    var X = (BUG && BUG.datorie) || {}, P = X.pe_ani || {}, ani = Object.keys(P).sort(), S = X.sold || {};
    var H = (L.hcl || []).filter(function (x) { var t = norm(x.titlu); return RX_DATORIE.test(t) && !/credite de angajament/.test(t); });
    if (!ani.length && !H.length && !Object.keys(S).length) { el.innerHTML = ""; return; }
    var sum = function (k) { return ani.reduce(function (a, y) { return a + (P[y][k] || 0); }, 0); };
    var tr = sum("trageri"), ra = sum("rambursari"), dob = sum("dobanzi");
    var sd = Object.keys(S).sort(), ult = sd[sd.length - 1];
    var u = unitate(Math.max.apply(null, ani.map(function (a) { return Math.max(P[a].trageri, P[a].rambursari, P[a].dobanzi); }).concat([1])));
    var h = '<section class="card section"><h2>Datoria publică a municipiului</h2>' +
      '<p class="note">Din execuția bugetară: banii trași din împrumuturi (datorie nouă), ratele rambursate și dobânzile plătite în fiecare an. ' +
      "Soldul datoriei (cât mai are de rambursat municipiul) nu apare în aceste raportări; îl trecem din documentele publice ale primăriei, cu sursa.</p>" +
      '<div class="grid" style="margin:8px 0 0">' +
      (ult ? tile("Soldul datoriei", lei(S[ult].lei), "", "la " + zi(ult) + (S[ult].sursa ? ", sursa: " + esc(S[ult].sursa) : "")) :
        tile("Soldul datoriei", "-", "", "nu e încă trecut; vine din anexa privind datoria publică a bugetului aprobat")) +
      (ani.length ? tile("Împrumutat " + ani[0] + "-" + ani[ani.length - 1], lei(tr), "", "bani trași din credite") +
        tile("Rambursat", lei(ra), "", "rate de capital plătite în aceeași perioadă") +
        tile("Dobânzi plătite", lei(dob), "", "costul împrumuturilor, " + ani[0] + "-" + ani[ani.length - 1]) : "") + "</div>" +
      (ani.length ? '<h3 style="margin-top:16px">Pe ani</h3><p class="note">În ' + u.n.replace(/ de (euro|lei)$/, " de lei") + '. Dacă împrumutul nou depășește ratele, datoria crește.</p>' +
        legend([["Împrumutat (trageri)", "var(--s1)"], ["Rate rambursate", "var(--s3)"], ["Dobânzi", "var(--s2)"]].concat(tr ? [["Linia: împrumutat minus rambursat, adunat din " + ani[0], "var(--ink)"]] : [])) + '<div class="chart" id="ch-dat"></div>' : "") +
      (H.length ? '<h3 style="margin-top:16px">Hotărârile consiliului despre împrumuturi</h3><p class="note">Contractarea, garantarea sau modificarea împrumuturilor, după titlul hotărârii.</p><div id="dat-h"></div>' : "") +
      "</section>";
    el.innerHTML = h;
    var cum = 0, net = ani.map(function (a) { cum += (P[a].trageri || 0) - (P[a].rambursari || 0); return rot(cum, u); });
    if (ani.length) chart($("ch-dat"), { cats: ani, grouped: true, label: "Împrumuturi, rate și dobânzi pe ani",
      line: tr ? { values: net, color: "var(--ink)" } : null,
      series: [{ name: "Împrumutat", color: "var(--s1)", values: ani.map(function (a) { return rot(P[a].trageri || 0, u); }) },
               { name: "Rate", color: "var(--s3)", values: ani.map(function (a) { return rot(P[a].rambursari || 0, u); }) },
               { name: "Dobânzi", color: "var(--s2)", values: ani.map(function (a) { return rot(P[a].dobanzi || 0, u); }) }],
      tooltip: function (i) { var v = P[ani[i]]; return "<b>" + ani[i] + "</b><br>Împrumutat: " + lei(v.trageri) + "<br>Rate rambursate: " + lei(v.rambursari) + "<br>Dobânzi: " + lei(v.dobanzi) +
        (tr ? "<br>Datorie nouă netă din " + ani[0] + ": " + lei(net[i] * u.div) : ""); } });
    if (H.length) lista($("dat-h"), H.slice().sort(function (a, b) { return (b.data || "").localeCompare(a.data || ""); }), { unitate: ["hotărâre", "hotărâri"],
      an: function (x) { return String(x.an); }, text: function (x) { return x.titlu + " " + x.nr + "/" + x.an; },
      item: function (x) { return doc(linkHcl(x), x.titlu, x.data ? "adoptată " + zi(x.data) : "", x); } });
  }

  function executie(el, anAles) {
    var M = BUG && (BUG.entitati || []).filter(function (e) { return e.cui === BUG.municipiu; })[0];
    if (!M || !Object.keys(M.ani).length) {
      el.innerHTML = '<p class="callout">Execuția bugetară (venituri și cheltuieli pe capitole) apare aici după următoarea colectare, din datele Ministerului Finanțelor publicate prin transparenta.eu.</p>';
      return;
    }
    var D = (BUG.detalii || {})[M.cui] || {}, ani = Object.keys(M.ani).sort(), azi = String(new Date().getFullYear());
    var an = anAles || (ani.filter(function (a) { return a < azi; }).pop() || ani[ani.length - 1]);
    var x = M.ani[an] || {}, d = D[an] || { ch: {}, vn: {}, fel: {}, economic: {} };
    var sold = (x.venituri || 0) - (x.cheltuieli || 0), inv = d.fel["Investiții (dezvoltare)"] || 0, chT = x.cheltuieli || 0;
    var parti = an === azi ? " (până la ultima raportare)" : "";
    var u = unitate(Math.max.apply(null, ani.map(function (a) { return Math.max(M.ani[a].venituri || 0, M.ani[a].cheltuieli || 0); }).concat([1])));
    var h = '<section class="card section"><div class="h-row"><h2>Execuția bugetului municipiului</h2><label class="lbl-s">anul <select id="b-an">' +
      ani.slice().reverse().map(function (a) { return "<option" + (a === an ? " selected" : "") + ">" + a + "</option>"; }).join("") + "</select></label></div>" +
      '<p class="note">Bani încasați și cheltuiți efectiv, din raportările primăriei către Ministerul Finanțelor (Transparență bugetară), prin <a href="https://transparenta.eu/entities/' + esc(M.cui) + '" rel="noopener">transparenta.eu</a>. ' +
      "Cifrele municipiului includ și instituțiile finanțate prin primărie (școli, cultură, asistență socială).</p>" +
      '<div class="grid" style="margin:8px 0 0">' + tile("Venituri " + an + parti, lei(x.venituri), "", "încasate în buget") + tile("Cheltuieli " + an + parti, lei(x.cheltuieli), "", M.populatie ? "adică <strong>" + lei(chT / M.populatie) + "</strong> pe locuitor" : "") +
      tile(sold >= 0 ? "Excedent" : "Deficit", '<span style="color:var(--' + (sold >= 0 ? "good" : "bad") + ')">' + lei(Math.abs(sold)) + "</span>", "", "venituri minus cheltuieli") +
      (chT && inv ? tile("Investiții", Math.round(100 * inv / chT) + "%", "", "din cheltuieli, adică " + lei(inv) + "; restul e funcționare") : "") + "</div>" +
      '<h3 style="margin-top:16px">Venituri și cheltuieli, pe ani</h3><p class="note">În ' + u.n.replace(/ de (euro|lei)$/, " de lei") + ".</p>" + legend([["Venituri", "var(--s3)"], ["Cheltuieli", "var(--s2)"]]) + '<div class="chart" id="ch-vc"></div>' +
      '<h3 style="margin-top:18px">Pe înțelesul tuturor: bugetul din ' + an + parti + "</h3>" +
      '<h3 style="margin-top:12px">De unde vin banii</h3><div id="dn-v"></div><h3 style="margin-top:18px">Pe ce se cheltuie</h3><p class="note">Fiecare dreptunghi e cât suma cheltuită. Apasă pe unul ca să vezi cum a evoluat de la an la an.</p><div id="dn-c"></div>' +
      '<div id="sut"></div><div id="chit"></div>' +
      '<h3 style="margin-top:16px">Pe tipuri de cheltuieli (' + an + ')</h3>' + hbl(Object.keys(d.economic).map(function (k) { return { l: k, v: d.economic[k] }; }), lei, chT) +
      "</section>";
    var alte = (BUG.entitati || []).filter(function (e) { return e.cui !== M.cui && Object.keys(e.ani).length; });
    if (alte.length) {
      var a1 = String(+an - 1);
      alte.sort(function (p, q) { return ((q.ani[an] || {}).cheltuieli || 0) - ((p.ani[an] || {}).cheltuieli || 0); });
      h += '<section class="card section"><h2>Instituțiile din Rădăuți</h2><p class="note">Cheltuielile fiecărei instituții care raportează separat. Instituțiile finanțate prin primărie sunt deja cuprinse în cifrele municipiului de mai sus.</p>' +
        '<div class="tw"><table><thead><tr><th>Instituția</th><th class="n">Cheltuieli ' + a1 + '</th><th class="n">Cheltuieli ' + an + '</th><th class="n">Venituri ' + an + "</th></tr></thead><tbody>" +
        alte.map(function (e) { return '<tr><td><a href="https://transparenta.eu/entities/' + esc(e.cui) + '" rel="noopener">' + esc(e.nume) + '</a></td><td class="n">' + lei((e.ani[a1] || {}).cheltuieli) + '</td><td class="n">' + lei((e.ani[an] || {}).cheltuieli) + '</td><td class="n">' + lei((e.ani[an] || {}).venituri) + "</td></tr>"; }).join("") +
        "</tbody></table></div></section>";
    }
    el.innerHTML = h;
    $("b-an").addEventListener("change", function () { executie(el, this.value); });
    // inelele: sursele de venit (culori fixe pe sursă) și capitolele de cheltuieli (culori fixe după totalul pe toți anii)
    var sv = d.surse && Object.keys(d.surse).length ? d.surse : d.vn;
    var iv = Object.keys(sv).map(function (k) { return { l: k, v: sv[k], color: culoareSursa(k) }; }).sort(function (p, q) { return q.v - p.v; });
    var tot = {}; Object.keys(D).forEach(function (a) { Object.keys(D[a].ch || {}).forEach(function (k) { tot[k] = (tot[k] || 0) + D[a].ch[k]; }); });
    var rang = Object.keys(tot).sort(function (p, q) { return tot[q] - tot[p]; });
    var ic = Object.keys(d.ch).map(function (k) { var i = rang.indexOf(k); return { l: k, v: d.ch[k], color: i >= 0 && i < CUL.length ? CUL[i] : "var(--plan)" }; }).sort(function (p, q) { return q.v - p.v; });
    donut($("dn-v"), iv, { label: "De unde vin banii în " + an, centru: "venituri " + an, total: lei(x.venituri) });
    treemap($("dn-c"), ic, { label: "Pe ce se cheltuie în " + an, onClick: function (it, box) {
      var aniC = ani.filter(function (a) { return D[a] && D[a].ch && D[a].ch[it.l] != null; });
      box.innerHTML = '<div class="tm-dc" style="--c:' + it.color + '"><b>' + esc(it.l) + "</b>: " + lei(it.v) + " în " + an + ", adică " + Math.round(100 * it.v / chT) + "% din cheltuieli" +
        (M.populatie ? " și <strong>" + lei(it.v / M.populatie) + "</strong> pe locuitor" : "") + '.<div class="chart" id="ch-tm"></div></div>';
      var u2 = unitate(Math.max.apply(null, aniC.map(function (a) { return D[a].ch[it.l]; }).concat([1])));
      chart($("ch-tm"), { cats: aniC, label: it.l + " pe ani", series: [{ name: it.l, color: it.color, values: aniC.map(function (a) { return rot(D[a].ch[it.l], u2); }) }],
        tooltip: function (i) { return "<b>" + aniC[i] + "</b><br>" + lei(D[aniC[i]].ch[it.l]); } });
    } });
    var tv = iv.reduce(function (a, q) { return a + q.v; }, 0), tc = ic.reduce(function (a, q) { return a + q.v; }, 0);
    if (tv && tc) $("sut").innerHTML = '<p class="sut">Din fiecare <strong>100 de lei</strong> intrați în bugetul orașului în ' + an + ": " + sutaLei(iv, tv, function (l) { return "din " + (SCURT_SURSE[l] || l.toLowerCase()); }) + ".<br>" +
      "Din fiecare <strong>100 de lei</strong> cheltuiți: " + sutaLei(ic, tc, function (l) { return "pentru " + l.toLowerCase(); }) +
      (chT && inv ? "; în total, <strong>" + Math.round(100 * inv / chT) + " lei</strong> au fost investiții, restul funcționare." : ".") + "</p>";
    if (tc) {
      var chV = 500; try { chV = +localStorage.getItem("mc_chit") || 500; } catch (e) {}
      $("chit").innerHTML = '<div class="chit"><h3>Chitanța ta</h3><p class="note">Scrie cât plătești pe an impozite și taxe locale (clădire, teren, mașină, salubrizare) și vezi cum s-ar împărți, dacă banii tăi ar merge ca toate cheltuielile orașului din ' + an + '. E o ilustrare: bugetul are și alte venituri (cote din impozitul pe venit, fonduri europene, transferuri). Am lăsat deoparte sănătatea: spitalul municipal, cuprins în bugetul orașului, e plătit mai ales din contractul cu Casa de Asigurări de Sănătate.</p>' +
        '<label class="lbl-s">Plătesc <input id="chit-v" type="number" min="0" step="10" value="' + chV + '" inputmode="numeric"> lei pe an</label><div id="chit-l"></div></div>';
      var chDraw = function () {
        var v = Math.max(0, +$("chit-v").value || 0); try { localStorage.setItem("mc_chit", String(v)); } catch (e) {}
        var icF = ic.filter(function (q) { return !/^Sănătate/.test(q.l); }), tF = icF.reduce(function (z, q) { return z + q.v; }, 0) || 1;
        $("chit-l").innerHTML = '<table class="chit-t"><tbody>' + icF.filter(function (q) { return q.v / tF >= 0.005; }).map(function (q) {
          return '<tr><td><i style="background:' + q.color + '"></i>' + esc(q.l) + '</td><td class="n">' + dec((v * q.v / tF).toFixed(2)) + " lei</td></tr>"; }).join("") +
          '</tbody><tfoot><tr><td>Total</td><td class="n">' + dec(v.toFixed(2)) + " lei</td></tr></tfoot></table>";
      };
      $("chit-v").addEventListener("input", chDraw); chDraw();
    }
    chart($("ch-vc"), { cats: ani, grouped: true, label: "Venituri și cheltuieli pe ani",
      series: [{ name: "Venituri", color: "var(--s3)", values: ani.map(function (a) { return rot(M.ani[a].venituri || 0, u); }) },
               { name: "Cheltuieli", color: "var(--s2)", values: ani.map(function (a) { return rot(M.ani[a].cheltuieli || 0, u); }) }],
      tooltip: function (i) { var v = M.ani[ani[i]]; return "<b>" + ani[i] + (ani[i] === azi ? " (parțial)" : "") + "</b><br>Venituri: " + lei(v.venituri) + "<br>Cheltuieli: " + lei(v.cheltuieli); },
      onClick: function (i) { executie(el, ani[i]); } });
  }

  // ---------- Primărie: teme care leagă documentele (date/teme.json) ----------
  var TEME = null;
  var TEME_PAG = { investitii: 1, taxe: 1, patrimoniu: 1, finantari: 1, dispozitii: 1, rapoarte: 1 };
  // ---------- Termoficarea: prețurile pe perioade, cine plătește (populația, bugetul local) și toate hotărârile ----------
  var TERMO = null;
  var TERMO_FEL = { tarife: "Prețuri și tarife", pierderi: "Pierderi și subvenții acoperite din buget", gestiune: "Contractul și organizarea serviciului", investitii: "Investiții", alta: "Alte hotărâri" };
  var LUNI_S = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
  function lunaScurt(d) { return d ? (d.slice(8, 10) !== "01" ? +d.slice(8, 10) + " " : "") + LUNI_S[+d.slice(5, 7) - 1] + " " + d.slice(2, 4) : ""; }
  function perioada(p) { return zi(p.de_la) + (p.pana_la ? " - " + zi(p.pana_la) : " (începând cu)"); }
  function termoficare(el, r) {
    var cap = head("Termoficarea", "Căldura și apa caldă de la Servicii Comunale: cât costă, cât plătesc cei racordați, cât acoperă subvenția din bugetul local și toate hotărârile consiliului.", r);
    if (!TERMO) { el.innerHTML = cap + '<p class="updated">Se încarcă...</p>'; Promise.all([get(DATA + "termoficare.json").then(function (d) { TERMO = d; }).catch(function () { TERMO = { hotarari: [], preturi: [] }; }), incarcaSed()]).then(render); return; }
    var P = (TERMO.preturi || []).filter(function (p) { return p.populatie_cu_tva || p.total_cu_tva; }), H = TERMO.hotarari || [];
    var ult = P[P.length - 1], ant = P[P.length - 2];
    var lei2 = function (v) { return v == null ? '<span class="muted">-</span>' : dec(v.toFixed(2)) + " lei"; };
    var urm = []; (SED.urmatoare || []).forEach(function (c) { (c.ordinea_de_zi || []).forEach(function (p) { if (/energiei termice|termofic|agent termic|pierderi.*termic/i.test(norm(p.text || ""))) urm.push({ c: c, p: p }); }); });
    var h = cap;
    if (urm.length) h += '<section class="card section urm"><h2>Pe ordinea de zi</h2>' + urm.map(function (x) {
      return '<div class="doc"><div class="h"><span class="rz ic">' + esc(ziSapt(x.c.data)) + esc(zi(x.c.data)) + (x.c.ora ? ", ora " + esc(x.c.ora) : "") + '</span><span class="tag">ședință ' + esc(TIP_SED[x.c.tip] || "") + '</span></div><div class="t">' + esc(x.p.text) + "</div></div>"; }).join("") +
      '<p class="note"><a href="#consiliu/urmatoare">Toată ordinea de zi și cum poți participa →</a></p></section>';
    if (ult) h += '<div class="grid">' + tile(ult.pana_la && ult.pana_la < new Date().toISOString().slice(0, 10) ? "Ultimul preț aprobat pentru cei racordați" : "Plătesc cei racordați la termoficare", ult.populatie_cu_tva != null ? dec(ult.populatie_cu_tva.toFixed(2)) : "-", "lei/MWh", perioada(ult) + (ult.pana_la && ult.pana_la < new Date().toISOString().slice(0, 10) ? "; a expirat, nu e încă aprobat unul nou" : ant && ant.populatie_cu_tva ? "; înainte " + dec(ant.populatie_cu_tva.toFixed(2)) + " lei" : "")) +
      tile("Subvenție din bugetul local", ult.subventie_cu_tva != null ? dec(ult.subventie_cu_tva.toFixed(2)) : "-", "lei/MWh", "diferența până la prețul întreg, plătită din banii tuturor locuitorilor") +
      tile("Prețul întreg", ult.total_cu_tva != null ? dec(ult.total_cu_tva.toFixed(2)) : "-", "lei/MWh", "producere, transport și distribuție" + (ult.tva ? ", cu TVA " + ult.tva + "%" : "")) + "</div>";
    h += '<section class="card section"><h2>Cum se formează prețul</h2><ul class="pasi">' +
      "<li><b>Prețul întreg</b> are două părți: <b>producerea</b> căldurii la centrala Servicii Comunale (prețul îl aprobă ANRE, autoritatea națională pentru energie) și <b>transportul și distribuția</b> prin rețeaua orașului. Peste ele se adaugă TVA-ul.</li>" +
      "<li><b>Consiliul Local</b> aprobă prin hotărâre prețul local, cât plătesc cei racordați la termoficare și cât din preț acoperă <b>bugetul local</b> (subvenția). Subvenția vine din banii tuturor locuitorilor, inclusiv ai celor care nu sunt racordați. Fără o hotărâre nouă când expiră cea veche, Servicii Comunale nu are cu ce preț să factureze.</li>" +
      "<li>Firmele și instituțiile (consumatorii noncasnici) plătesc prețul întreg; subvenția e doar pentru gospodăriile racordate.</li>" +
      "<li>Prețurile sunt în <b>lei pe MWh</b> (1 Gcal = 1,163 MWh).</li></ul></section>";
    if (P.length) {
      h += '<section class="card section"><h2>Prețurile, perioadă cu perioadă</h2><p class="note">Din articolele și anexele hotărârilor de tarife, verificate de echipă în document (cele marcate „neverificat” sunt citite automat și încă nu au fost verificate). Până în 2023, hotărârile dau prețurile în lei/Gcal; aici sunt transformate în lei/MWh (împărțite la 1,163), ca să se poată compara. Fiecare perioadă duce la hotărâre.</p>' +
        '<h3 class="an-h">Lei pe MWh, cu TVA: cât plătesc cei racordați și cât subvenția din bugetul local</h3>' + legend([["Plătesc cei racordați la termoficare", "#ec7a2c"], ["Subvenție din bugetul local (plătită de toți locuitorii)", "#2a78d6"]]) + '<div class="chart" id="tf-ch"></div>' +
        '<h3 class="an-h">Cum au evoluat, în lei pe MWh</h3>' + legend([["Prețul întreg", "#5b6b7b"], ["Plătesc cei racordați la termoficare", "#ec7a2c"], ["Subvenție din bugetul local (plătită de toți locuitorii)", "#2a78d6"]]) + '<div class="chart" id="tf-ln"></div>' +
        '<h3 class="an-h">Cine plătește, în procente din prețul întreg</h3>' + legend([["Cei racordați", "#ec7a2c"], ["Subvenția din bugetul local", "#2a78d6"]]) + '<div class="chart" id="tf-pc"></div>' +
        '<p class="note">Când subvenția crește, cei racordați plătesc un procent mai mic din prețul întreg, iar restul îl plătesc toți locuitorii, prin bugetul local; în iernile cu TVA redus, prețul întreg scade și el.</p>' +
        '<div class="tw"><table class="tx-t"><thead><tr><th>Perioada</th><th class="n">Plătesc cei racordați</th><th class="n">Subvenție din buget</th><th class="n">Prețul întreg</th><th class="n">TVA</th><th class="n">Cei racordați, față de perioada dinainte</th><th>Hotărârea</th></tr></thead><tbody>' +
        P.slice().reverse().map(function (p, i, A) { var a = A[i + 1];
          return "<tr><td>" + esc(perioada(p)) + (p.verificat === false ? ' <span class="tag" title="Citit automat din hotărâre, încă neverificat de echipă">neverificat</span>' : "") + (p.nota ? '<br><small class="muted">' + esc(p.nota) + "</small>" : "") + '</td><td class="n"><b>' + lei2(p.populatie_cu_tva) + '</b></td><td class="n">' + lei2(p.subventie_cu_tva) + '</td><td class="n">' + lei2(p.total_cu_tva) + '</td><td class="n">' + (p.tva ? p.tva + "%" : "-") +
            '</td><td class="n">' + (a ? variatie(a.populatie_cu_tva, p.populatie_cu_tva) : "") + "</td><td>" + (p.hcl ? linkHcl(p.hcl) : "") + "</td></tr>"; }).join("") + "</tbody></table></div></section>";
    }
    var PV = TERMO.pierderi || [], pier = H.filter(function (x) { return x.fel === "pierderi"; });
    if (PV.length) {
      var sumPV = PV.reduce(function (z, x) { return z + x.lei; }, 0);
      h += '<section class="card section"><h2>Pierderi acoperite din bugetul local</h2><p>Pe lângă subvenția din preț, consiliul local a aprobat acoperirea pierderilor Servicii Comunale din termoficare: <b>' + lei(sumPV) + "</b> pentru " +
        esc(PV[0].perioada.split(" - ")[0]) + " - " + esc(PV[PV.length - 1].perioada.split(" - ").pop()) + ", adică aproximativ <b>" + lei(sumPV / 24292) + "</b> de fiecare locuitor al orașului. Sumele sunt din articolul 1 al fiecărei hotărâri, verificate în document.</p>" +
        legend([["Pierderi acoperite din buget", "#2a78d6"]]) + '<div class="chart" id="tf-pi"></div>' +
        '<div class="tw"><table><thead><tr><th>Perioada</th><th class="n">Suma</th><th>Hotărârea</th></tr></thead><tbody>' + PV.slice().reverse().map(function (x) {
          return "<tr><td>" + esc(x.perioada) + '</td><td class="n"><b>' + nr(x.lei) + " lei</b></td><td>" + linkHcl(x.hcl) + (x.data ? ", " + esc(zi(x.data)) : "") + "</td></tr>"; }).join("") + "</tbody></table></div></section>";
    } else if (pier.length) h += '<section class="card section"><h2>Pierderi acoperite din bugetul local</h2><p class="note">Pe lângă subvenția din preț, consiliul aprobă din când în când acoperirea pierderilor Servicii Comunale din termoficare.</p>' +
      pier.map(function (x) { return '<div class="doc"><div class="h"><span class="id">' + linkHcl(x) + "</span>" + (x.data ? '<span class="muted">' + esc(zi(x.data)) + "</span>" : "") + (x.pierderi_lei ? '<span class="inv-v">' + lei(x.pierderi_lei) + "</span>" : "") + '</div><div class="t">' + esc(x.pe_scurt || x.titlu) + "</div></div>"; }).join("") + "</section>";
    h += '<section class="card section"><h2>Toate hotărârile despre termoficare <span class="nr-b n">' + H.length + '</span></h2><div id="tf-l"></div></section>';
    h += alerteHtml("", "Primește pe e-mail noutățile despre căldură", "termic");
    el.innerHTML = h;
    alerteLeaga(el);
    if (PV.length && $("tf-pi")) chart($("tf-pi"), { cats: PV.map(function (x) { return x.perioada.replace(/(\w+) (\d{4}) - (\w+) (\d{4})/, function (m, a, b, c, d) { return a.slice(0, 3) + " " + b.slice(2) + "-" + c.slice(0, 3) + " " + d.slice(2); }).replace(/^(\w+) - (\w+) (\d{4})$/, function (m, a, c, d) { return a.slice(0, 3) + "-" + c.slice(0, 3) + " " + d.slice(2); }).replace(/noi/g, "nov"); }),
      label: "Pierderi din termoficare acoperite din bugetul local, pe perioade", bwMax: 60, labelValue: function (i) { return lei(PV[i].lei); },
      series: [{ name: "Pierderi", color: "#2a78d6", values: PV.map(function (x) { return Math.round(x.lei / 1e4) / 100; }) }], yFmt: function (g) { return g + " mil."; },
      tooltip: function (i) { var x = PV[i]; return "<b>" + esc(x.perioada) + "</b><br>" + nr(x.lei) + " lei<br>HCL " + x.hcl.nr + "/" + x.hcl.an; } });
    var cats = P.map(function (p) { return lunaScurt(p.de_la); }), r0 = function (v) { return v == null ? null : Math.round(v); };
    var pct = function (p, k) { var t = p.total_cu_tva || ((p.populatie_cu_tva || 0) + (p.subventie_cu_tva || 0)); return t && p[k] != null ? Math.round(1000 * p[k] / t) / 10 : null; };
    var tipTf = function (i) { var p = P[i]; return "<b>" + esc(perioada(p)) + "</b><br>plătesc cei racordați: " + lei2(p.populatie_cu_tva) + "/MWh (" + dec(pct(p, "populatie_cu_tva")) + "%)<br>subvenție din bugetul local: " + lei2(p.subventie_cu_tva) + "/MWh (" + dec(pct(p, "subventie_cu_tva")) + "%)<br>prețul întreg: " + lei2(p.total_cu_tva) + "/MWh" + (p.tva ? " (TVA " + p.tva + "%)" : "") + (p.hcl ? "<br>HCL " + p.hcl.nr + "/" + p.hcl.an : ""); };
    if (P.length) {
      chart($("tf-ln"), { cats: cats, series: [], h: 260, minW: 720, label: "Prețul întreg, partea celor racordați și subvenția din bugetul local, în lei pe MWh", tooltip: tipTf,
        lines: [{ name: "Prețul întreg", color: "#5b6b7b", values: P.map(function (p) { return r0(p.total_cu_tva); }) }, { name: "Cei racordați", color: "#ec7a2c", values: P.map(function (p) { return r0(p.populatie_cu_tva); }) },
          { name: "Subvenția din bugetul local", color: "#2a78d6", values: P.map(function (p) { return r0(p.subventie_cu_tva); }) }],
        lineLabel: function (l, i, v) { return nr(v); } });
      chart($("tf-pc"), { cats: cats, series: [], h: 230, minW: 720, maxY: 100, stepY: 25, yFmt: function (g) { return g + "%"; }, label: "Partea celor racordați și a subvenției din bugetul local, în procente din prețul întreg", tooltip: tipTf,
        lines: [{ name: "Cei racordați", color: "#ec7a2c", values: P.map(function (p) { return pct(p, "populatie_cu_tva"); }) }, { name: "Subvenția din bugetul local", color: "#2a78d6", values: P.map(function (p) { return pct(p, "subventie_cu_tva"); }) }],
        lineLabel: function (l, i, v) { return Math.round(v) + "%"; } });
    }
    if (P.length) chart($("tf-ch"), { cats: cats, stacked: true, h: 300, minW: 720, bwMax: 36, label: "Prețul energiei termice pe perioade: partea celor racordați și subvenția din bugetul local",
      segLabel: function (sr, i, v) { return nr(Math.round(v)); }, labelValue: function (i) { return P[i].total_cu_tva ? nr(Math.round(P[i].total_cu_tva)) : null; },
      series: [{ name: "Plătesc cei racordați", color: "#ec7a2c", values: P.map(function (p) { return p.populatie_cu_tva || 0; }) }, { name: "Subvenție din bugetul local", color: "#2a78d6", values: P.map(function (p) { return p.subventie_cu_tva || 0; }) }],
      tooltip: function (i) { var p = P[i]; return "<b>" + esc(perioada(p)) + "</b><br>plătesc cei racordați: " + lei2(p.populatie_cu_tva) + "/MWh<br>subvenție din bugetul local: " + lei2(p.subventie_cu_tva) + "/MWh<br>prețul întreg: " + lei2(p.total_cu_tva) + "/MWh" + (p.tva ? " (TVA " + p.tva + "%)" : "") + (p.hcl ? "<br>HCL " + p.hcl.nr + "/" + p.hcl.an : ""); } });
    function listaTf(vot) {
      if (!$("tf-l")) return;
      lista($("tf-l"), H, { placeholder: "Caută: tarif, pierderi, contract, ANRE", unitate: ["hotărâre", "hotărâri"], an: function (x) { return String(x.an); }, text: function (x) { return x.titlu + " " + (x.pe_scurt || ""); },
        extraFilter: { html: '<select aria-label="Felul"><option value="">Toate felurile</option>' + Object.keys(TERMO_FEL).map(function (k) { return '<option value="' + k + '">' + TERMO_FEL[k] + "</option>"; }).join("") + "</select>", test: function (x, e) { return x.fel === e; } },
        item: function (x) { var v = vot[x.an + "/" + x.nr];
          return '<div class="doc"><div class="h"><span class="id">' + linkHcl(x) + '</span><span class="tag">' + esc(TERMO_FEL[x.fel] || "") + "</span>" + (x.data ? '<span class="muted">' + esc(zi(x.data)) + "</span>" : "") + '</div><div class="t">' + esc(x.titlu) + "</div>" +
            (x.pe_scurt ? '<div class="m"><span>' + esc(x.pe_scurt) + "</span></div>" : "") + (v ? '<div class="m"><span class="muted">Votul: ' + votHtml(v) + "</span></div>" : "") + "</div>"; } });
    }
    listaTf({});
    voturiIntern2(function (V) {   // apoi, cu voturile din procesele-verbale
      var vot = {}; (V.sedinte || []).forEach(function (s) { (s.voturi || []).forEach(function (v) { if (v.hcl) vot[v.hcl.an + "/" + v.hcl.nr] = v; }); });
      listaTf(vot);
    });
  }
  function temaPagina(el, r) {
    var titluri = { investitii: ["Investițiile orașului", "Obiectivele de investiții pe categorii (străzi, școli, apă și canal...), pe hartă și fiecare cu hotărârile, valoarea aprobată și achizițiile din SICAP."],
      taxe: ["Taxe și impozite locale", "Lista taxelor și impozitelor locale din hotărârile anuale, cum au evoluat de la an la an și toate hotărârile despre ele."],
      patrimoniu: ["Terenuri și clădiri", "Ce face orașul cu terenurile și clădirile lui: vânzări, concesionări, închirieri, schimburi, treceri dintr-un domeniu în altul."],
      finantari: ["Finanțări nerambursabile", "Banii din bugetul orașului pentru asociații, fundații și culte, prin programele anuale (Legea nr. 350/2005)."],
      dispozitii: ["Dispozițiile primarului", "Dispozițiile publicate de primar, pe tipuri, și câte au fost emise în total, după numerotare."],
      rapoarte: ["Rapoarte", "Rapoartele publicate de primărie: raportul anual, transparența decizională, acces la informații, integritate."] };
    var t = titluri[r.sub], cap = head(t[0], t[1], r);
    if (!TEME) { el.innerHTML = cap + '<p class="updated">Se încarcă...</p>'; get(DATA + "teme.json").then(function (d) { TEME = d; render(); }).catch(function () { TEME = {}; render(); }); return; }
    var D = TEME[r.sub];
    if (!D || (Array.isArray(D) && !D.length) || (D.lista && !D.lista.length)) { el.innerHTML = cap + '<section class="card section"><p class="empty">Datele apar după următoarea colectare.</p></section>'; return; }
    ({ investitii: pagInvestitii, taxe: pagTaxe, patrimoniu: pagPatrimoniu, finantari: pagFinantari, dispozitii: pagDispozitii, rapoarte: pagRapoarte })[r.sub](el, cap, D);
  }
  var STARE_INV = { aprobat: ["aprobat în consiliu", "n"], licitat: ["licitație lansată", "ic"], contractat: ["cu achiziții în SICAP", "par"], finalizat: ["finalizat", "c"] };
  var CAT_INV = { strazi: "var(--c2)", trotuare: "#8b5e3c", apa: "var(--c1)", energie: "var(--c4)", scoli: "var(--c3)", parcuri: "var(--c6)", cladiri: "var(--plan)",
    social: "var(--c5)", sanatate: "var(--c8)", cultura: "var(--c7)", digital: "#5b6b7a", mediu: "#4f8a3c", alta: "#9aa3ab" };
  function numeCat(k) { return ((TEME || {}).categorii_investitii || {})[k] || k; }
  function cheieStr(n) { var t = norm(n).replace(/[^a-z0-9 ]+/g, " ").trim().replace(/^(strada|str|bulevardul|b dul|piata)\s+/, ""); return t.replace(/\s+/g, " ").trim(); }
  function pagInvestitii(el, cap, D) {
    var tot = D.reduce(function (a, x) { return a + (x.valoare || 0); }, 0), cuV = D.filter(function (x) { return x.valoare; }).length;
    var nr_ = function (s) { return D.filter(function (x) { return x.stare === s; }).length; };
    var pc = {}; D.forEach(function (x) { var k = x.categorie || "alta"; pc[k] = pc[k] || { n: 0, v: 0 }; pc[k].n++; pc[k].v += x.valoare || 0; });
    var cats = Object.keys(CAT_INV).filter(function (k) { return pc[k]; }).sort(function (a, b) { return a === "alta" ? 1 : b === "alta" ? -1 : pc[b].n - pc[a].n; });
    var G = (TEME || {}).strazi_geo || {}, peHarta = D.filter(function (x) { return (x.chei || []).length; });
    var str = D.filter(function (x) { return x.categorie === "strazi"; }), nStr = {}; str.forEach(function (x) { (x.strazi || []).forEach(function (s) { nStr[norm(s)] = 1; }); });
    // pe ani: câte obiective noi (după prima hotărâre), pe categorii
    var ani = []; D.forEach(function (x) { var a = (x.prima || "").slice(0, 4); if (a && ani.indexOf(a) < 0) ani.push(a); }); ani.sort();
    var aniDe = function (x) { if (!x._ani) { var o = []; x.pasi.forEach(function (p) { var a = (p.data || "").slice(0, 4); if (a && o.indexOf(a) < 0) o.push(a); }); x._ani = o; } return x._ani; };
    var aniHcl = []; D.forEach(function (x) { aniDe(x).forEach(function (a) { if (aniHcl.indexOf(a) < 0) aniHcl.push(a); }); }); aniHcl.sort();
    var ASF = (TEME || {}).asfaltari || {}, aniAsf = Object.keys(ASF).filter(function (a) { return ASF[a].aprobat.km || ASF[a].finalizat.km; }).sort();
    function asfSectiune() {
      if (!aniAsf.length) return "";
      var tA = 0, tF = 0; aniAsf.forEach(function (a) { tA += ASF[a].aprobat.km; tF += ASF[a].finalizat.km; });
      var ult = aniAsf[aniAsf.length - 1];
      return '<section class="card section"><h2>Asfaltări și modernizări de străzi, pe ani</h2>' +
        '<div class="grid">' + tile("Km în obiective aprobate", dec(tA.toFixed(1)), "km", "în " + aniAsf[0] + "-" + ult + ", după anul hotărârii de aprobare") + tile("Km în obiective finalizate", dec(tF.toFixed(1)), "km", "după hotărârile de finalizare sau trecere în inventar") +
        tile("În " + ult, dec(ASF[ult].aprobat.km.toFixed(1)), "km", ASF[ult].aprobat.strazi + " străzi în " + ASF[ult].aprobat.obiective + " obiective aprobate") + "</div>" +
        '<p class="note">Lungimile sunt ale străzilor întregi din OpenStreetMap, în oraș, pentru străzile numite în obiectivele din categoria „Străzi și asfaltări”; dacă s-a lucrat doar pe un tronson, cifra e mai mare decât lucrarea. Obiectivele fără străzi numite (de exemplu „modernizare străzi balastate”) nu intră în kilometri. E o estimare: verifică în documentația fiecărui obiectiv.</p>' +
        legend([["în obiective aprobate", "var(--c1)"], ["în obiective finalizate", "var(--ok, #1baf7a)"]]) + '<div class="chart" id="ch-asf"></div>' +
        '<div class="tw"><table class="asf-t"><thead><tr><th>Anul</th><th class="n">Km aprobați</th><th class="n">Străzi</th><th class="n">Obiective</th><th class="n">Km finalizați</th><th>Străzile (aprobate în anul acela)</th></tr></thead><tbody>' +
        aniAsf.slice().reverse().map(function (a) { var o = ASF[a];
          return '<tr><td><a href="#" data-asf="' + a + '">' + a + '</a></td><td class="n">' + dec(o.aprobat.km.toFixed(1)) + '</td><td class="n">' + o.aprobat.strazi + '</td><td class="n">' + o.aprobat.obiective + (o.aprobat.fara_strazi ? ' <small class="muted" title="obiective fără străzi numite">(' + o.aprobat.fara_strazi + " fără străzi)</small>" : "") + '</td><td class="n">' + (o.finalizat.km ? dec(o.finalizat.km.toFixed(1)) : '<span class="muted">-</span>') + "</td><td>" +
            (o.aprobat.lista || []).map(function (t) { return '<a href="#strada?s=' + encodeURIComponent(t[0]) + '">' + esc(t[0]) + "</a> <small class=\"muted\">" + dec((+t[1]).toFixed(1)) + "</small>"; }).join(", ") + "</td></tr>"; }).join("") +
        '</tbody></table></div><p class="note">Apasă pe un an ca să vezi pe hartă străzile din anul acela.</p></section>';
    }
    el.innerHTML = cap + '<div class="grid">' + tile("Obiective de investiții", nr(D.length), "", "din hotărârile consiliului local") +
      tile("Valoarea aprobată", lei(tot), "", "la " + cuV + " obiective cu valoarea citită din hotărâre") +
      tile("Străzi și asfaltări", nr(str.length), "", nr(Object.keys(nStr).length) + " străzi numite în obiective") + tile("Finalizate", nr(nr_("finalizat")), "", "după hotărârile de finalizare sau de trecere în inventar") + "</div>" +
      (!D.some(function (x) { return x.categorie; }) ? "" : '<section class="card section"><h2>Pe categorii</h2><p class="note">Categoria e dată automat, după cuvintele din numele obiectivului (asfalt, trotuar, școală, canalizare...). Un obiectiv are o singură categorie, cea mai potrivită. Apasă pe o categorie ca să vezi obiectivele.</p>' +
      '<div class="sx-2"><div><h3 class="an-h">Câte obiective</h3>' + hbl(cats.map(function (k) { return { l: numeCat(k), v: pc[k].n, href: "javascript:void(0)", k: k }; }), nr, D.length).replace(/href="javascript:void\(0\)"/g, 'href="#" data-cat') + "</div>" +
      '<div><h3 class="an-h">Valoarea aprobată</h3>' + hbl(cats.filter(function (k) { return pc[k].v; }).sort(function (a, b) { return pc[b].v - pc[a].v; }).map(function (k) { return { l: numeCat(k), v: pc[k].v }; }), lei, tot) + "</div></div>" +
      (ani.length > 2 ? '<h3 class="an-h">Obiective noi pe ani, după prima hotărâre</h3>' + legend(cats.map(function (k) { return [numeCat(k), CAT_INV[k]]; })) + '<div class="chart" id="ch-inv"></div>' : "") + "</section>") +
      asfSectiune() +
      '<section class="card section" id="inv-hl"><h2>Pe hartă și în listă</h2><p class="note">Alege categoriile (de exemplu doar „Străzi și asfaltări”) și trage de bara anilor ca să vezi cum s-a schimbat orașul; ▶ pornește anii pe rând. „Adunat” arată tot ce a fost aprobat până în anul ales, cu anul ales mai aprins; altfel vezi doar obiectivele cu hotărâri chiar în anul acela (aprobare, modificare, finanțare, finalizare).</p>' +
      '<div class="inv-ani"><button type="button" class="btn-s inv-play" id="inv-play" aria-label="Pornește anii pe rând">▶</button><input type="range" id="inv-sl" min="0" max="' + aniHcl.length + '" value="' + aniHcl.length + '" step="1" aria-label="Anul">' +
      '<output id="inv-ao">Toți anii</output><label class="cx-c"><input type="checkbox" id="inv-cum" checked> adunat</label></div>' +
      '<div class="filters inv-fl"><button type="button" class="btn-s" data-toate="1">Toate categoriile</button><button type="button" class="btn-s" data-toate="0">Nicio categorie</button></div>' +
      '<div class="legend inv-lg">' + cats.map(function (k) { return '<button type="button" class="on" data-k="' + k + '" aria-pressed="true"><i style="background:' + CAT_INV[k] + '"></i>' + esc(numeCat(k)) + ' <small class="muted" data-n="' + k + '"></small></button>'; }).join("") + "</div>" +
      '<p class="count inv-cnt" aria-live="polite"></p>' +
      (peHarta.length ? '<div class="map" id="inv-map"></div><p class="note">Străzile pomenite în numele obiectivelor, desenate după OpenStreetMap (sau, unde strada nu a fost găsită acolo, un punct pe stradă). Linia arată strada întreagă, nu exact tronsonul lucrat.</p>' : "") +
      "</section>" +
      '<section class="card section" id="inv-sec"><h2>Obiectivele</h2><p class="note">Hotărârile sunt grupate după numele obiectivului, citit din titlu. Valoarea e cea din ultima hotărâre cu indicatori; achizițiile din SICAP sunt cele cu titlu asemănător, publicate după prima hotărâre, deci pot fi și altele legate de obiectiv sau, rar, unele nelegate. Verifică în documente.</p><div id="inv-l"></div></section>';
    var act = {}; cats.forEach(function (k) { act[k] = true; });
    var anSel = "", cumul = true, joaca = null;
    var inAn = function (x) { return !anSel || (cumul ? aniDe(x)[0] <= anSel : aniDe(x).indexOf(anSel) >= 0); };
    var inFiltru = function (x) { return act[x.categorie || "alta"] && inAn(x); };
    var L = lista($("inv-l"), D, { placeholder: "Caută: stradă, școală, lucrare", unitate: ["obiectiv", "obiective"], faraAn: true, an: function (x) { return (x.ultima || "").slice(0, 4); }, extern: inFiltru,
      text: function (x) { return x.nume + " " + (x.strazi || []).join(" ") + " " + x.pasi.map(function (p) { return p.titlu; }).join(" "); },
      extraFilter: { html: '<select aria-label="Stadiul"><option value="">Orice stadiu</option>' + Object.keys(STARE_INV).map(function (k) { return '<option value="' + k + '">' + STARE_INV[k][0] + "</option>"; }).join("") + "</select>",
        test: function (x, e) { return x.stare === e; } },
      item: function (x) {
        var st = STARE_INV[x.stare] || ["", "n"];
        return '<div class="doc inv"><div class="h"><span class="rz ' + st[1] + '">' + st[0] + '</span><span class="tag" style="border-color:' + CAT_INV[x.categorie || "alta"] + '">' + esc(numeCat(x.categorie || "alta")) + "</span>" + (x.valoare ? '<span class="inv-v">' + lei(x.valoare) + (x.tva ? ' <small class="muted">' + esc(x.tva) + "</small>" : "") + "</span>" : "") + "</div>" +
          '<div class="t"><b>' + esc(x.nume) + "</b></div>" +
          ((x.strazi || []).length ? '<div class="muted inv-st">Străzi: ' + x.strazi.map(function (s) { var g = G[cheieStr(s)]; return '<a href="#strada?s=' + encodeURIComponent(s) + '">' + esc(s) + "</a>" + (g && g.km ? ' <small>(' + dec(g.km.toFixed(1)) + " km)</small>" : ""); }).join(", ") + "</div>" : "") +
          '<ol class="inv-p">' + x.pasi.map(function (p) { return "<li><span>" + esc(zi(p.data)) + "</span> " + linkHcl(p) + " · " + esc(NUME_PAS[p.pas] || p.pas) + (p.valoare ? " · " + lei(p.valoare) : "") + "</li>"; }).join("") + "</ol>" +
          ((x.sicap || []).length ? '<div class="inv-s"><span class="muted">În SICAP:</span> ' + x.sicap.map(function (q) {
            return '<a href="' + SICAP_URL + (q.fel === "directa" ? "direct-acquisition/view/" : q.fel === "licitatie" ? "notices/c-notice/v2/view/" : "notices/ca-notices/view-c/") + q.id + '" rel="noopener">' +
              esc({ directa: "achiziție directă", licitatie: "licitație", contract: "contract" }[q.fel]) + " " + esc(zi(q.data)) + (q.lei ? ", " + lei(q.lei) : "") + "</a>"; }).join(" · ") + "</div>" : "") + "</div>";
      } });
    var straturi = [], harta = null;
    function aplica() {
      var f = D.filter(inFiltru), pm = f.filter(function (x) { return (x.chei || []).length; }).length;
      $("inv-hl").querySelector(".inv-cnt").textContent = nr(f.length) + (f.length === 1 ? " obiectiv" : " obiective") + (anSel ? (cumul ? " aprobate până în " + anSel + " (" + D.filter(function (x) { return act[x.categorie || "alta"] && aniDe(x)[0] === anSel; }).length + " noi în " + anSel + ")" : " cu hotărâri în " + anSel) : "") + (peHarta.length ? ", din care " + nr(pm) + " pe hartă" : "");
      cats.forEach(function (k) { var n = D.filter(function (x) { return (x.categorie || "alta") === k && inAn(x); }).length, e = el.querySelector('[data-n="' + k + '"]'); if (e) e.textContent = n; });
      Array.prototype.forEach.call(el.querySelectorAll(".inv-lg button"), function (b) { var on = !!act[b.getAttribute("data-k")]; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
      L.draw();
      if (harta) {
        var vis = [];
        straturi.forEach(function (o) {
          var v = inFiltru(o.x); if (v && !harta.hasLayer(o.g)) o.g.addTo(harta); if (!v && harta.hasLayer(o.g)) harta.removeLayer(o.g); if (v) vis.push(o.g);
          if (v) { var nou = !anSel || !cumul || aniDe(o.x)[0] === anSel; o.g.setStyle({ opacity: nou ? 0.9 : 0.3, fillOpacity: nou ? 0.95 : 0.3 }); if (nou) o.g.bringToFront(); }
        });
        if (vis.length && !joaca) { try { harta.fitBounds(window.L.featureGroup(vis).getBounds().pad(0.08), { maxZoom: 15 }); } catch (e) { /* */ } }
      }
    }
    function laAn(i) { $("inv-sl").value = i; anSel = aniHcl[i] || ""; $("inv-ao").textContent = anSel || "Toți anii"; aplica(); }
    $("inv-sl").addEventListener("input", function () { laAn(+this.value); });
    $("inv-cum").addEventListener("change", function () { cumul = this.checked; aplica(); });
    $("inv-play").addEventListener("click", function () {
      var b = this;
      if (joaca) { clearInterval(joaca); joaca = null; b.textContent = "▶"; aplica(); return; }
      cumul = true; $("inv-cum").checked = true; b.textContent = "❚❚";
      var i = 0; laAn(0);
      joaca = setInterval(function () { i++; if (i >= aniHcl.length) { clearInterval(joaca); joaca = null; b.textContent = "▶"; laAn(aniHcl.length - 1); return; } laAn(i); }, 1300);
    });
    Array.prototype.forEach.call(el.querySelectorAll(".inv-lg button"), function (b) { b.addEventListener("click", function () { var k = b.getAttribute("data-k"); act[k] = !act[k]; aplica(); }); });
    Array.prototype.forEach.call(el.querySelectorAll("[data-toate]"), function (b) { b.addEventListener("click", function () { var v = b.getAttribute("data-toate") === "1"; cats.forEach(function (k) { act[k] = v; }); aplica(); }); });
    // click pe o categorie din grafic -> doar categoria aceea, pe hartă și în listă
    Array.prototype.forEach.call(el.querySelectorAll("[data-cat]"), function (a, i) {
      a.addEventListener("click", function (e) { e.preventDefault(); cats.forEach(function (k) { act[k] = k === cats[i]; }); aplica(); $("inv-hl").scrollIntoView({ behavior: "smooth" }); });
    });
    // asfaltări: un an din grafic sau din tabel -> harta cu străzile și asfaltările din anul acela
    Array.prototype.forEach.call(el.querySelectorAll("[data-asf]"), function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); cats.forEach(function (k) { act[k] = k === "strazi"; }); cumul = false; $("inv-cum").checked = false; laAn(aniHcl.indexOf(a.getAttribute("data-asf"))); $("inv-hl").scrollIntoView({ behavior: "smooth" }); });
    });
    aplica();
    if (ani.length > 2 && $("ch-inv")) chart($("ch-inv"), { cats: ani, stacked: true, label: "Obiective de investiții noi pe ani, pe categorii",
      series: cats.map(function (k) { return { name: numeCat(k), color: CAT_INV[k], values: ani.map(function (a) { return D.filter(function (x) { return (x.categorie || "alta") === k && (x.prima || "").slice(0, 4) === a; }).length; }) }; }),
      tooltip: function (i) { var a = ani[i]; return "<b>" + a + "</b><br>" + cats.map(function (k) { var n = D.filter(function (x) { return (x.categorie || "alta") === k && (x.prima || "").slice(0, 4) === a; }).length; return n ? numeCat(k) + ": " + n : ""; }).filter(Boolean).join("<br>"); } });
    if (aniAsf.length && $("ch-asf")) chart($("ch-asf"), { cats: aniAsf, grouped: true, label: "Kilometri de străzi în obiectivele de modernizare, pe ani",
      series: [{ name: "în obiective aprobate", color: "var(--c1)", values: aniAsf.map(function (a) { return ASF[a].aprobat.km; }) }, { name: "în obiective finalizate", color: "var(--ok, #1baf7a)", values: aniAsf.map(function (a) { return ASF[a].finalizat.km; }) }],
      tooltip: function (i) { var a = ASF[aniAsf[i]]; return "<b>" + aniAsf[i] + "</b><br>aprobate: " + dec(a.aprobat.km.toFixed(1)) + " km (" + a.aprobat.strazi + " străzi, " + a.aprobat.obiective + " obiective)<br>finalizate: " + dec(a.finalizat.km.toFixed(1)) + " km (" + a.finalizat.strazi + " străzi)"; } });
    if (!peHarta.length) return;
    incarcaLeaflet().then(function () {
      var Lf = window.L, m = harta = Lf.map("inv-map", { scrollWheelZoom: false }).setView([47.8445, 25.9195], 14);
      Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
      var cs = getComputedStyle(document.documentElement);
      var culoare = function (k) { var c = CAT_INV[k]; return c.indexOf("var(") === 0 ? (cs.getPropertyValue(c.slice(4, -1)).trim() || "#2a78d6") : c; };
      peHarta.forEach(function (x) {
        var k = x.categorie || "alta", c = culoare(k), st = STARE_INV[x.stare] || [""], g = Lf.featureGroup();
        var pop = '<div class="pop-act"><b>' + esc(x.nume.slice(0, 200)) + "</b><br>" + esc(numeCat(k)) + " · " + esc(st[0]) + (x.valoare ? " · " + lei(x.valoare) : "") + "<br>" + x.pasi.slice(-3).map(function (p) { return linkHcl(p) + " (" + esc(zi(p.data)) + ")"; }).join(", ") + "</div>";
        x.chei.forEach(function (ch) {
          var o = G[ch]; if (!o) return;
          if (o.linii) o.linii.forEach(function (ln) { g.addLayer(Lf.polyline(ln, { color: c, weight: k === "strazi" ? 6 : 5, opacity: 0.85 }).bindPopup(pop, popOpt(m))); });
          else if (o.punct) g.addLayer(Lf.circleMarker(o.punct, { radius: 7, color: "#fff", weight: 2, fillColor: c, fillOpacity: 0.95 }).bindPopup(pop, popOpt(m)));
        });
        straturi.push({ x: x, g: g });
      });
      aplica();
    }).catch(function () { $("inv-map").innerHTML = '<p class="empty">Harta nu s-a putut încărca.</p>'; });
  }
  var NUME_PAS = { indicatori: "documentație și indicatori", modificare: "indicatori modificați", finantare: "finanțare sau cofinanțare", credite: "credite de angajament",
    esalonare: "eșalonare financiară", finalizat: "proiect finalizat", inventar: "trecut în inventar", alta: "altă hotărâre" };
  var CAT_TAXE = ["clădiri", "terenuri", "mijloace de transport", "certificate și autorizații", "afișaj și reclamă", "spectacole", "taxe speciale", "alte taxe", "facilități și scutiri"];
  function valTaxa(v, u) { if (v == null) return '<span class="muted">-</span>'; return dec(+(+v).toFixed(v < 10 && v % 1 ? 2 : v % 1 ? 2 : 0)) + (u ? " " + esc(u) : ""); }
  function variatie(a, b) {   // b față de a
    if (a == null || b == null || !a) return "";
    var p = 100 * (b - a) / a; if (Math.abs(p) < 0.05) return '<span class="vr z">=</span>';
    return '<span class="vr ' + (p > 0 ? "up" : "dn") + '">' + (p > 0 ? "+" : "") + dec(+p.toFixed(1)) + "%</span>";
  }
  // ---------- „Cât plătesc eu?”: estimarea impozitelor locale ale unei familii, pe ani, din nivelurile citite din hotărâri ----------
  // Rădăuți e municipiu de rangul II: coeficienții de corecție pe zone (Codul fiscal, art. 457 alin. 6)
  var COEF_ZONA = { A: 2.4, B: 2.3, C: 2.2, D: 2.1 };
  var AUTO_TR = [[1600, "auto_pana_1600"], [2000, "auto_1601_2000"], [2600, "auto_2001_2600"], [3000, "auto_2601_3000"], [Infinity, "auto_peste_3000"]];
  function calcHtml(ani) {
    if (!ani.length) return "";
    var inp = function (id, lbl, val, extra) { return '<label class="cx-f"><span>' + lbl + '</span><input type="number" inputmode="decimal" min="0" id="' + id + '" value="' + val + '"' + (extra || "") + "></label>"; };
    return '<section class="card section cx"><h2>Cât plătești? Calculează-ți impozitele</h2>' +
      '<p class="note">Scrie datele casei, ale terenului și ale mașinii tale și vezi cât ar fi impozitele locale în fiecare an pentru care am citit hotărârea, și cât s-a schimbat. E o <b>estimare</b>: folosește nivelurile extrase automat din hotărâri și formula simplificată din Codul fiscal (clădire din beton cu instalații, persoană fizică, fără scutiri). Suma exactă o afli de la Direcția de taxe și impozite locale sau din Ghișeul.ro.</p>' +
      '<div class="cx-g"><fieldset><legend>Casa sau apartamentul</legend>' + inp("cx-mp", "Suprafața construită desfășurată (m²)", 80) +
      '<label class="cx-f"><span>Zona din oraș</span><select id="cx-z"><option>A</option><option selected>B</option><option>C</option><option>D</option></select></label>' +
      '<label class="cx-f"><span>Vechimea clădirii</span><select id="cx-v"><option value="1">sub 30 de ani</option><option value="0.9">30-50 de ani</option><option value="0.7">50-100 de ani</option><option value="0.5">peste 100 de ani</option></select></label></fieldset>' +
      '<fieldset><legend>Terenul de sub casă</legend>' + inp("cx-t", "Suprafața terenului (m²)", 0) + '<label class="cx-f"><span>Zona</span><select id="cx-tz"><option value="a">A</option><option value="b" selected>B</option></select></label></fieldset>' +
      '<fieldset><legend>Mașina și gunoiul</legend>' + inp("cx-cc", "Capacitatea cilindrică a autoturismului (cm³; 0 dacă nu ai)", 1400) + inp("cx-p", "Câte persoane în casă (pentru salubrizare)", 3) +
      '<label class="cx-c"><input type="checkbox" id="cx-b" checked> plătesc tot până la 31 martie (bonificație)</label></fieldset></div>' +
      '<div id="cx-r" aria-live="polite"></div></section>';
  }
  function calcLeaga(ani, valI) {
    if (!$("cx-r")) return;
    var v = function (id) { var x = parseFloat(($(id).value || "0").replace(",", ".")); return isFinite(x) && x > 0 ? x : 0; };
    function rand() {
      var mp = v("cx-mp"), z = $("cx-z").value, vech = +$("cx-v").value, t = v("cx-t"), tz = $("cx-tz").value, cc = v("cx-cc"), pers = v("cx-p"), bon = $("cx-b").checked;
      var R = ani.map(function (a) {
        var o = { a: a, parti: [], lipsa: [] }, add = function (nume, val, det) { if (val == null) o.lipsa.push(nume); else o.parti.push([nume, val, det]); };
        if (mp) { var vm = valI(a, "valoare_cladire_beton"), cota = valI(a, "cladiri_rezidentiale_pf");
          add("Clădirea", vm != null && cota != null ? mp * vm * COEF_ZONA[z] * vech * cota / 100 : null, vm != null && cota != null ? dec(mp) + " m² × " + dec(vm) + " lei/m² × " + dec(COEF_ZONA[z]) + (vech < 1 ? " × " + dec(vech) : "") + " × " + dec(cota) + "%" : ""); }
        if (t) { var vt = valI(a, "teren_intravilan_zona_" + tz); add("Terenul", vt != null ? t / 10000 * vt : null, vt != null ? dec(t) + " m² × " + dec(vt) + " lei/ha" : ""); }
        if (cc) { var k = AUTO_TR.filter(function (x) { return cc <= x[0]; })[0][1], va = valI(a, k); add("Autoturismul", va != null ? Math.ceil(cc / 200) * va : null, va != null ? Math.ceil(cc / 200) + " × 200 cm³ × " + dec(va) + " lei" : ""); }
        if (pers) { var vs = valI(a, "salubrizare_pf"); add("Salubrizarea", vs != null ? pers * vs * 12 : null, vs != null ? dec(pers) + " pers. × " + dec(vs) + " lei × 12 luni" : ""); }
        var imp = o.parti.filter(function (p) { return p[0] !== "Salubrizarea"; }).reduce(function (s, p) { return s + p[1]; }, 0), b = bon ? valI(a, "bonificatie") : null;
        o.bon = b && imp ? imp * b / 100 : 0;
        o.total = o.parti.reduce(function (s, p) { return s + p[1]; }, 0) - o.bon;
        return o;
      }).filter(function (o) { return o.parti.length; });
      if (!R.length) { $("cx-r").innerHTML = '<p class="empty">Pentru datele alese nu avem nivelurile din hotărâri.</p>'; return; }
      var ult = R[R.length - 1], pr = R[R.length - 2], f2 = function (x) { return dec(Math.round(x)) + " lei"; };
      var h = '<div class="cx-tot"><div><span class="muted">În ' + ult.a + ", în total</span><b>" + f2(ult.total) + "</b>" + (pr ? '<span>față de ' + f2(pr.total) + " în " + pr.a + " " + variatie(pr.total, ult.total) + "</span>" : "") + "</div>" +
        '<ul class="cx-p">' + ult.parti.map(function (p) { return "<li><b>" + esc(p[0]) + ":</b> " + f2(p[1]) + ' <small class="muted">' + esc(p[2]) + "</small></li>"; }).join("") +
        (ult.bon ? '<li><b>Bonificație:</b> -' + f2(ult.bon) + "</li>" : "") + (ult.lipsa.length ? '<li class="muted">Fără ' + esc(ult.lipsa.join(", ").toLowerCase()) + ": nivelul nu a putut fi citit din hotărâre.</li>" : "") + "</ul></div>";
      if (R.length > 1) h += '<h3 class="an-h">Pe ani</h3><div class="chart" id="cx-ch"></div><div class="tw"><table class="tx-t"><thead><tr><th>Anul</th>' + ["Clădirea", "Terenul", "Autoturismul", "Salubrizarea"].map(function (n) { return '<th class="n">' + n + "</th>"; }).join("") + '<th class="n">Total</th><th class="n">Față de anul dinainte</th></tr></thead><tbody>' +
        R.slice().reverse().map(function (o, i, A) { var g = function (n) { var p = o.parti.filter(function (x) { return x[0] === n; })[0]; return p ? f2(p[1]) : '<span class="muted">-</span>'; }, ant = A[i + 1];
          return "<tr><td>" + o.a + "</td>" + ["Clădirea", "Terenul", "Autoturismul", "Salubrizarea"].map(function (n) { return '<td class="n">' + g(n) + "</td>"; }).join("") + '<td class="n"><b>' + f2(o.total) + '</b></td><td class="n">' + (ant ? variatie(ant.total, o.total) : "") + "</td></tr>"; }).join("") + "</tbody></table></div>";
      $("cx-r").innerHTML = h;
      if ($("cx-ch")) chart($("cx-ch"), { cats: R.map(function (o) { return o.a; }), series: [], h: 170, label: "Impozitele estimate pe ani", line: { color: "var(--c1)", values: R.map(function (o) { return Math.round(o.total); }) },
        tooltip: function (i) { return "<b>" + R[i].a + "</b>: " + f2(R[i].total) + "<br>" + R[i].parti.map(function (p) { return esc(p[0]) + ": " + f2(p[1]); }).join("<br>"); } });
    }
    Array.prototype.forEach.call(document.querySelectorAll(".cx input, .cx select"), function (e) { e.addEventListener("input", rand); e.addEventListener("change", rand); });
    rand();
  }
  function pagTaxe(el, cap, D) {
    var ani = Object.keys(D).sort(), IND = (TEME || {}).indicatori_taxe || {}, cuAi = ani.filter(function (a) { return D[a].ai && (Object.keys(D[a].ai.indicatori || {}).length || (D[a].ai.taxe || []).length); });
    var valI = function (a, k) { var o = D[a] && D[a].ai && D[a].ai.indicatori[k]; return o ? o.valoare : null; };
    var serii = Object.keys(IND).filter(function (k) { return cuAi.filter(function (a) { return valI(a, k) != null; }).length >= 2; });
    var ult = cuAi[cuAi.length - 1];
    var hclAn = function (a) { return D[a].hcl ? '<a href="#consiliu/hcl/' + D[a].hcl.an + "/" + D[a].hcl.nr + '">HCL ' + D[a].hcl.nr + "/" + D[a].hcl.an + "</a>" : ""; };
    var h = cap;
    if (ult) {
      var pr = cuAi[cuAi.length - 2], tl = function (k, sub) { var v = valI(ult, k); return v == null ? "" : tile(IND[k].nume.split(":")[0], valTaxa(v, ""), IND[k].unitate, (sub || "") + (pr && valI(pr, k) != null ? " " + pr + ": " + valTaxa(valI(pr, k), IND[k].unitate) : "")); };
      h += '<div class="grid">' + tl("indexare", "") + tl("cladiri_rezidentiale_pf", "locuințe, persoane fizice;") + tl("auto_pana_1600", "autoturism mic;") + tl("salubrizare_pf", "") + "</div>";
      h += calcHtml(cuAi);
      h += '<p class="note">Valorile din lista și graficele de mai jos sunt <b>extrase automat</b>, cu un model de inteligență artificială, din textul scanat al hotărârii anuale; pot avea greșeli. Fiecare an duce la hotărâre: verifică acolo înainte să folosești o cifră.</p>';
      if (serii.length) h += '<section class="card section"><h2>Cum au evoluat</h2><p class="note">Câteva niveluri, în fiecare an pentru care hotărârea a putut fi citită. Treci cu mouse-ul (sau atinge) peste grafic pentru valoare și citatul din hotărâre.</p><div class="tx-g">' +
        serii.map(function (k, n) { var A = cuAi.filter(function (a) { return valI(a, k) != null; }), v0 = valI(A[0], k), v1 = valI(A[A.length - 1], k);
          return '<div class="tx-c"><div class="tx-h"><b>' + esc(IND[k].nume) + '</b><span class="muted">' + esc(IND[k].unitate) + '</span></div><div class="tx-v">' + valTaxa(v1, "") + " " + variatie(v0, v1) + ' <small class="muted">față de ' + A[0] + '</small></div><div class="chart tx-ch" id="tx-' + n + '"></div></div>'; }).join("") + "</div></section>";
      h += '<section class="card section"><h2>Lista taxelor</h2><div class="filters"><select id="tx-an" aria-label="Anul">' + cuAi.slice().reverse().map(function (a) { return "<option>" + a + "</option>"; }).join("") + '</select><select id="tx-cat" aria-label="Categoria"><option value="">Toate categoriile</option>' +
        CAT_TAXE.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + '</select><input type="search" id="tx-q" placeholder="Caută: teren, autorizație, firmă" aria-label="Caută"></div><div id="tx-l"></div></section>';
    }
    var cuNiv = ani.filter(function (a) { return Object.keys(D[a].niveluri || {}).length; });
    if (!ult && cuNiv.length) {
      var K = [["indexare_pct", "Indexare față de anul anterior", function (v) { return dec(v) + "%"; }],
        ["cladiri_rezidentiale_pf_pct", "Impozit pe clădirile rezidențiale ale persoanelor fizice (cota)", function (v) { return dec(v) + "%"; }],
        ["auto_1600_lei_200cm3", "Impozit auto, autoturisme până la 1.600 cm³ (lei pentru fiecare 200 cm³)", function (v) { return dec(v.toFixed(2)) + " lei"; }],
        ["salubrizare_pf_lei_persoana_luna", "Taxa de salubrizare, persoane fizice (lei pe persoană, pe lună)", function (v) { return dec(v.toFixed(2)) + " lei"; }]];
      h += '<section class="card section"><h2>Câteva niveluri, de la an la an</h2><p class="note">Citite automat din hotărârea anuală (textul scanat), deci unele lipsesc; fiecare an duce la hotărâre. Lista completă a taxelor apare după următoarea colectare.</p>' +
        '<div class="tw"><table><thead><tr><th></th>' + cuNiv.map(function (a) { return '<th class="n">' + a + "<br>" + hclAn(a) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        K.map(function (k) { return "<tr><td>" + k[1] + "</td>" + cuNiv.map(function (a) { var v = (D[a].niveluri || {})[k[0]]; return '<td class="n">' + (v != null ? k[2](v) : '<span class="muted">-</span>') + "</td>"; }).join("") + "</tr>"; }).join("") +
        "</tbody></table></div></section>";
    }
    h += '<section class="card section"><h2>Hotărârile, pe ani</h2>' + ani.slice().reverse().map(function (a) {
      return '<h3 class="an-h">Pentru anul ' + a + "</h3>" + (D[a].ai && D[a].ai.observatii ? '<p class="note">' + esc(D[a].ai.observatii) + "</p>" : "") + D[a].hotarari.map(function (x) { return '<div class="doc"><div class="h"><span class="id">' + linkHcl(x) + "</span>" + (x.anuala ? '<span class="rz c">hotărârea anuală</span>' : '<span class="tag">modificare</span>') + (x.data ? '<span class="muted">adoptată ' + esc(zi(x.data)) + "</span>" : "") + '</div><div class="t">' + esc(x.titlu) + "</div></div>"; }).join("");
    }).join("") + "</section>";
    el.innerHTML = h;
    serii.forEach(function (k, n) {
      var A = cuAi.filter(function (a) { return valI(a, k) != null; });
      chart($("tx-" + n), { cats: A, series: [], h: 150, minW: 220, label: IND[k].nume, line: { color: "var(--sec, var(--c1))", values: A.map(function (a) { return valI(a, k); }) },
        tooltip: function (i) { var o = D[A[i]].ai.indicatori[k]; return "<b>" + A[i] + "</b>: " + valTaxa(o.valoare, IND[k].unitate) + (o.citat ? '<br><i>„' + esc(o.citat) + "”</i>" : "") + (D[A[i]].hcl ? "<br>HCL " + D[A[i]].hcl.nr + "/" + D[A[i]].hcl.an : ""); } });
    });
    if (!ult) return;
    calcLeaga(cuAi, valI);
    function desen() {
      var a = $("tx-an").value, c = $("tx-cat").value, q = norm($("tx-q").value).trim(), i = cuAi.indexOf(a), pa = i > 0 ? cuAi[i - 1] : null;
      var prev = {}; if (pa) (D[pa].ai.taxe || []).forEach(function (t) { prev[norm(t.categorie + "|" + t.denumire)] = t; });
      var T = (D[a].ai.taxe || []).filter(function (t) { return (!c || t.categorie === c) && (!q || norm(t.denumire + " " + t.categorie).indexOf(q) >= 0); });
      var pe = {}; T.forEach(function (t) { (pe[t.categorie] = pe[t.categorie] || []).push(t); });
      var ord = CAT_TAXE.filter(function (k) { return pe[k]; }).concat(Object.keys(pe).filter(function (k) { return CAT_TAXE.indexOf(k) < 0; }));
      $("tx-l").innerHTML = '<p class="count">' + nr(T.length) + " rânduri, din " + hclAn(a) + (pa ? "; comparate cu " + pa : "") + "</p>" + (ord.length ? ord.map(function (k) {
        return '<h3 class="an-h">' + esc(k.charAt(0).toUpperCase() + k.slice(1)) + '</h3><div class="tw"><table class="tx-t"><thead><tr><th>Taxa</th><th class="n">' + a + "</th>" + (pa ? '<th class="n">' + pa + '</th><th class="n">Diferența</th>' : "") + "</tr></thead><tbody>" +
          pe[k].map(function (t) { var p = prev[norm(t.categorie + "|" + t.denumire)];
            return "<tr><td>" + esc(t.denumire) + '</td><td class="n">' + valTaxa(t.valoare, t.unitate) + "</td>" + (pa ? '<td class="n">' + (p ? valTaxa(p.valoare, p.unitate) : '<span class="muted">-</span>') + '</td><td class="n">' + (p && p.unitate === t.unitate ? variatie(p.valoare, t.valoare) : "") + "</td>" : "") + "</tr>"; }).join("") +
          "</tbody></table></div>"; }).join("") : '<p class="empty">Nicio taxă găsită.</p>');
      Array.prototype.forEach.call($("tx-l").querySelectorAll("table"), sortabil);
    }
    ["tx-an", "tx-cat"].forEach(function (id) { $(id).addEventListener("change", desen); });
    $("tx-q").addEventListener("input", desen);
    desen();
  }
  var FEL_PAT = { vanzare: ["Vânzări", "var(--c8)"], concesionare: ["Concesionări", "var(--c4)"], inchiriere: ["Închirieri", "var(--c1)"], schimb: ["Schimburi", "var(--c7)"],
    folosinta: ["Folosință gratuită, administrare", "var(--c3)"], uz: ["Drept de uz, servitute, superficie", "var(--c6)"], cumparare: ["Cumpărări, donații, preluări", "var(--c5)"], domeniu: ["Domeniul public / privat, inventar", "var(--plan)"] };
  // iconițele de pe harta terenurilor (pătrate colorate, ca să nu semene cu punctele rotunde de la urbanism)
  var PAT_IC = { vanzare: '<path d="M4 12l8-8h7v7l-8 8z"/><circle cx="15.5" cy="8.5" r="1.5"/>', concesionare: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H20M17 12v3M14.5 12v2"/>',
    inchiriere: '<path d="M4 11l8-6 8 6v8H4z"/><path d="M10 19v-5h4v5"/>', schimb: '<path d="M5 9h12l-3-3M19 15H7l3 3"/>', folosinta: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    uz: '<path d="M4 18h16M7 18V9l5-4 5 4v9"/>', cumparare: '<path d="M5 7h14l-1.5 9h-11z"/><path d="M9 7a3 3 0 0 1 6 0"/>', domeniu: '<rect x="5" y="5" width="14" height="14" rx="1"/><path d="M5 12h14M12 5v14"/>' };
  function pagPatrimoniu(el, cap, D) {
    var pe = {}; D.forEach(function (x) { pe[x.fel] = (pe[x.fel] || 0) + 1; });
    var anC = String(new Date().getFullYear()), vAn = D.filter(function (x) { return x.fel === "vanzare" && x.an == anC; }).length;
    el.innerHTML = cap + '<div class="grid">' + tile("Hotărâri despre terenuri și clădiri", nr(D.length), "", "din 2013 până azi") + tile("Vânzări", nr(pe.vanzare || 0), "", vAn + " în " + anC) +
      tile("Concesionări și închirieri", nr((pe.concesionare || 0) + (pe.inchiriere || 0)), "", "") + tile("Pe hartă", nr(D.filter(function (x) { return x.lat; }).length), "", "unde strada din titlu a putut fi găsită") + "</div>" +
      '<section class="card section"><h2>Pe tipuri</h2>' + hbl(Object.keys(FEL_PAT).filter(function (k) { return pe[k]; }).map(function (k) { return { l: FEL_PAT[k][0], v: pe[k] }; }), nr, D.length) + "</section>" +
      '<section class="card section"><h2>Pe hartă</h2><p class="note">Poziția e cea a străzii (sau a adresei) din titlul hotărârii, găsită automat; e aproximativă. Hotărârile despre aceeași stradă sunt așezate una lângă alta, în jurul punctului. Apasă pe un tip din legendă ca să-l ascunzi sau să-l arăți.</p>' +
      '<div class="legend inv-lg pat-lg">' + Object.keys(FEL_PAT).filter(function (k) { return pe[k]; }).map(function (k) { return '<button type="button" class="on" data-k="' + k + '"><i class="pm-l" style="--c:' + FEL_PAT[k][1] + '"><svg viewBox="0 0 24 24">' + PAT_IC[k] + "</svg></i>" + esc(FEL_PAT[k][0]) + " (" + pe[k] + ")</button>"; }).join("") + "</div>" +
      '<div class="map" id="pat-map"></div></section>' +
      '<section class="card section"><h2>Toate hotărârile</h2><div id="pat-l"></div></section>';
    lista($("pat-l"), D, { placeholder: "Caută: stradă, număr cadastral, firmă", unitate: ["hotărâre", "hotărâri"], an: function (x) { return String(x.an); }, text: function (x) { return x.titlu + " " + (x.strada || "") + " " + (x.cadastral || ""); },
      extraFilter: { html: '<select aria-label="Tipul"><option value="">Toate tipurile</option>' + Object.keys(FEL_PAT).map(function (k) { return '<option value="' + k + '">' + FEL_PAT[k][0] + "</option>"; }).join("") + "</select>", test: function (x, e) { return x.fel === e; } },
      item: function (x) {
        return '<div class="doc"><div class="h"><span class="id">' + linkHcl(x) + '</span><span class="tag" style="border-color:' + FEL_PAT[x.fel][1] + '">' + esc(FEL_PAT[x.fel][0]) + "</span>" +
          (x.strada ? '<span class="muted">' + esc(x.strada) + "</span>" : "") + (x.suprafata ? '<span class="muted">' + nr(x.suprafata) + " mp</span>" : "") + '<span class="muted">' + esc(zi(x.data)) + "</span></div>" +
          '<div class="t">' + esc(x.titlu) + "</div></div>";
      } });
    incarcaLeaflet().then(function () {
      var Lf = window.L, m = Lf.map("pat-map", { scrollWheelZoom: false }).setView([47.8445, 25.9195], 14);
      Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
      // fără grupare: fiecare hotărâre își are eticheta; cele de pe aceeași stradă (aceleași coordonate) sunt întinse în spirală, în pixeli
      var cs = getComputedStyle(document.documentElement), straturi = {}, pePunct = {}, toate = [];
      D.filter(function (x) { return x.lat; }).sort(function (a, b) { return (b.data || "") < (a.data || "") ? -1 : 1; }).forEach(function (x) {
        var c = cs.getPropertyValue(FEL_PAT[x.fel][1].slice(4, -1)).trim() || "#2a78d6", kp = x.lat.toFixed(5) + "," + x.lon.toFixed(5), n = pePunct[kp] = (pePunct[kp] || 0) + 1;
        var dx = 0, dy = 0;
        if (n > 1) { var a = (n - 1) * 2.39996, rr = 15 * Math.sqrt(n - 1); dx = Math.round(rr * Math.cos(a)); dy = Math.round(rr * Math.sin(a)); }
        var g = straturi[x.fel] = straturi[x.fel] || Lf.layerGroup().addTo(m);
        var mk = Lf.marker([x.lat, x.lon], { icon: Lf.divIcon({ className: "pm-w", iconSize: [26, 26], iconAnchor: [13 - dx, 13 - dy], popupAnchor: [dx, dy - 12],
            html: '<span class="pm" style="--c:' + c + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + (PAT_IC[x.fel] || PAT_IC.domeniu) + "</svg></span>" }), title: FEL_PAT[x.fel][0] })
          .bindPopup('<div class="pop-act"><b>' + esc(FEL_PAT[x.fel][0]) + "</b> · " + linkHcl(x) + " · " + esc(zi(x.data)) + '<div class="pop-scop">' + esc(x.titlu.slice(0, 260)) + "</div></div>", popOpt(m));
        g.addLayer(mk); toate.push(mk);
      });
      Array.prototype.forEach.call(el.querySelectorAll(".pat-lg button"), function (b) {
        b.addEventListener("click", function () { var k = b.getAttribute("data-k"), on = b.classList.toggle("on"); if (straturi[k]) { if (on) straturi[k].addTo(m); else m.removeLayer(straturi[k]); } });
      });
    }).catch(function () { $("pat-map").innerHTML = '<p class="empty">Harta nu s-a putut încărca.</p>'; });
  }
  var DOM_FIN = { social: ["Social, ONG-uri (asociații și fundații)", "var(--c1)"], culte: ["Culte religioase", "var(--c7)"], sport: ["Sport", "var(--c3)"], cultura: ["Cultură", "var(--c4)"],
    tineret: ["Tineret", "var(--c5)"], educatie: ["Educație", "var(--c2)"], mediu: ["Mediu", "var(--c6)"] };
  function pagFinantari(el, cap, D) {
    var P = D.filter(function (x) { return x.anul_programului && x.total && !x.inlocuit; }).sort(function (a, b) { return a.anul_programului < b.anul_programului ? -1 : 1; });
    var dom = {}; P.forEach(function (x) { Object.keys(x.domenii || {}).forEach(function (k) { dom[k] = 1; }); });
    var dk = Object.keys(DOM_FIN).filter(function (k) { return dom[k]; }), ult = P[P.length - 1];
    el.innerHTML = cap + (ult ? '<div class="grid">' + tile("Programul pe " + ult.anul_programului, lei(ult.total), "", Object.keys(ult.domenii || {}).map(function (k) { return lei(ult.domenii[k]) + " " + (DOM_FIN[k] || [k])[0].toLowerCase(); }).join(", ")) +
      tile("În total, în programele găsite", lei(P.reduce(function (a, x) { return a + x.total; }, 0)), "", P.length + " programe anuale, " + P[0].anul_programului + "-" + ult.anul_programului) + "</div>" : "") +
      (P.length ? '<section class="card section"><h2>Bugetul programelor, pe domenii</h2>' + legend(dk.map(function (k) { return DOM_FIN[k]; })) + '<div class="chart" id="ch-fin"></div>' +
        '<p class="note">Sumele sunt cele aprobate în program, citite automat din hotărâre; cât s-a dat efectiv fiecărui beneficiar se vede în contractele de finanțare, publicate separat de primărie. Anii lipsă sunt ani pentru care hotărârea cu programul nu a fost găsită sau citită.</p></section>' +
        '<section class="card section"><h2>Pe categorii, în total</h2><p class="note">Suma tuturor programelor găsite, ' + P[0].anul_programului + "-" + ult.anul_programului + ', pe categorii.</p>' +
        hbl(dk.map(function (k) { return { l: DOM_FIN[k][0], v: P.reduce(function (a, x) { return a + ((x.domenii || {})[k] || 0); }, 0) }; }).sort(function (a, b) { return b.v - a.v; }), lei, P.reduce(function (a, x) { return a + x.total; }, 0)) +
        '<h3 class="an-h">Evoluția fiecărei categorii (mii lei)</h3>' + legend(dk.map(function (k) { return DOM_FIN[k]; })) + '<div class="chart" id="ch-fin2"></div>' +
        '<div class="tw"><table class="fin-t"><thead><tr><th>Anul</th>' + dk.map(function (k) { return '<th class="n">' + esc(DOM_FIN[k][0].split(" (")[0]) + "</th>"; }).join("") + '<th class="n">Total</th><th>Hotărârea</th></tr></thead><tbody>' +
        P.slice().reverse().map(function (x) { return "<tr><td>" + x.anul_programului + "</td>" + dk.map(function (k) { var v = (x.domenii || {})[k]; return '<td class="n">' + (v ? lei(v) : '<span class="muted">-</span>') + "</td>"; }).join("") + '<td class="n"><b>' + lei(x.total) + "</b></td><td>" + linkHcl(x) + "</td></tr>"; }).join("") +
        "</tbody></table></div></section>" : "") +
      '<section class="card section"><h2>Hotărârile</h2>' + D.map(function (x) { return '<div class="doc"><div class="h"><span class="id">' + linkHcl(x) + "</span>" + (x.total ? '<span class="rz c">' + lei(x.total) + "</span>" : "") + (x.data ? '<span class="muted">' + esc(zi(x.data)) + "</span>" : "") + '</div><div class="t">' + esc(x.titlu) + "</div></div>"; }).join("") + "</section>";
    if (P.length) chart($("ch-fin"), { cats: P.map(function (x) { return x.anul_programului; }), stacked: true, label: "Finanțări nerambursabile pe ani",
      series: dk.map(function (k) { return { name: DOM_FIN[k][0], color: DOM_FIN[k][1], values: P.map(function (x) { return Math.round(((x.domenii || {})[k] || 0) / 1000); }) }; }),
      labelValue: function (i) { return Math.round(P[i].total / 1000); }, tooltip: function (i) { return "<b>" + P[i].anul_programului + "</b>: " + lei(P[i].total) + "<br>" + Object.keys(P[i].domenii || {}).map(function (k) { return (DOM_FIN[k] || [k])[0] + ": " + lei(P[i].domenii[k]); }).join("<br>"); } });
    Array.prototype.forEach.call(el.querySelectorAll("table.fin-t"), sortabil);
    if (P.length) chart($("ch-fin2"), { cats: P.map(function (x) { return x.anul_programului; }), grouped: true, label: "Finanțări nerambursabile pe categorii și ani (mii lei)",
      series: dk.map(function (k) { return { name: DOM_FIN[k][0], color: DOM_FIN[k][1], values: P.map(function (x) { return Math.round(((x.domenii || {})[k] || 0) / 1000); }) }; }),
      tooltip: function (i) { return "<b>" + P[i].anul_programului + "</b><br>" + dk.map(function (k) { var v = (P[i].domenii || {})[k]; return v ? DOM_FIN[k][0] + ": " + lei(v) : ""; }).filter(Boolean).join("<br>"); } });
  }
  function pagDispozitii(el, cap, D) {
    var ani = Object.keys(D.pe_ani).sort(), ult = ani[ani.length - 1], A = D.pe_ani[ult] || {};
    el.innerHTML = cap + '<div class="grid">' + tile("Dispoziții publicate în " + ult, nr(A.publicate || 0), "", "pe site-ul primăriei") +
      (A.numar_maxim ? tile("Dispoziții emise în " + ult, "cel puțin " + nr(A.numar_maxim), "", "după cel mai mare număr din cele publicate") : "") + "</div>" +
      '<section class="card section"><h2>Publicate și emise, pe ani</h2><p class="note">Primarul emite dispoziții pentru multe lucruri: convocarea consiliului, buget, personal, comisii, ajutoare. Cele cu caracter normativ se publică; cele individuale se comunică celor vizați, deci nu toate apar pe site. Numărul emis e estimat după cea mai mare dispoziție publicată în anul respectiv.</p>' +
      '<div class="tw"><table><thead><tr><th>An</th><th class="n">Publicate</th><th class="n">Emise (cel puțin)</th>' + Object.keys(D.feluri).map(function (k) { return '<th class="n">' + esc(D.feluri[k]) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      ani.slice().reverse().map(function (a) { var x = D.pe_ani[a]; return "<tr><td>" + a + '</td><td class="n">' + x.publicate + '</td><td class="n">' + (x.numar_maxim ? nr(x.numar_maxim) : "-") + "</td>" + Object.keys(D.feluri).map(function (k) { return '<td class="n">' + ((x.pe_feluri || {})[k] || 0) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table></div></section>" +
      '<section class="card section"><h2>Dispozițiile publicate</h2><div id="disp-l"></div></section>';
    lista($("disp-l"), D.lista, { placeholder: "Caută în titluri", unitate: ["dispoziție", "dispoziții"], an: function (x) { return x.an; }, text: function (x) { return x.obiect; },
      extraFilter: { html: '<select aria-label="Tipul"><option value="">Toate tipurile</option>' + Object.keys(D.feluri).map(function (k) { return '<option value="' + k + '">' + esc(D.feluri[k]) + "</option>"; }).join("") + "</select>", test: function (x, e) { return x.fel === e; } },
      item: function (x) { return doc((x.nr ? "Dispoziția nr. " + x.nr : "Dispoziție") + "/" + esc(x.an), x.obiect, '<span class="tag">' + esc(D.feluri[x.fel] || "") + "</span>" + (x.data ? " publicată " + esc(zi(x.data)) : ""), x); } });
  }
  function pagRapoarte(el, cap, D) {
    var g = {}; D.lista.forEach(function (x) { (g[x.fel] = g[x.fel] || []).push(x); });
    var nCl = (g.consilieri || []).length + (g.comisii || []).length + (g.viceprimar || []).length;
    el.innerHTML = cap + (nCl ? '<p class="callout">Rapoartele comisiilor de specialitate, ale viceprimarilor și ale consilierilor (' + nCl + ') sunt la <a href="#consiliu/rapoarte">Consiliul Local → Rapoarte</a>.</p>' : "") +
      Object.keys(D.feluri).filter(function (k) { return g[k] && ["consilieri", "comisii", "viceprimar"].indexOf(k) < 0; }).map(function (k) {
      var L2 = g[k].slice().sort(function (a, b) { return (b.an || "").localeCompare(a.an || ""); });
      return '<section class="card section"><h2>' + esc(D.feluri[k]) + ' <span class="nr-b n">' + L2.length + "</span></h2>" + L2.map(function (x) {
        return '<div class="doc"><div class="h">' + (x.an ? '<span class="id"' + (x.an_estimat ? ' title="an dedus din data încărcării: raportul se depune la începutul anului următor"' : "") + ">" + esc(x.an) + (x.an_estimat ? " (estimat)" : "") + "</span>" : "") + '<a class="lk" href="' + esc(safeUrl(x.url) || "#") + '" rel="noopener">PDF</a>' +
          (safeUrl(x.pagina) ? '<a class="lk" href="' + esc(x.pagina) + '" rel="noopener">pagina</a>' : "") + '</div><div class="t">' + esc(x.titlu) + "</div></div>"; }).join("") + "</section>";
    }).join("");
  }

  // ---------- Primărie: Urbanism, harta ----------
  var LEAF = null;
  function incarcaLeaflet() {
    if (LEAF) return LEAF;
    var cdn = "https://cdnjs.cloudflare.com/ajax/libs/";
    function css(u) { var l = document.createElement("link"); l.rel = "stylesheet"; l.href = u; document.head.appendChild(l); }
    function js(u) { return new Promise(function (ok, nu) { var s = document.createElement("script"); s.src = u; s.onload = ok; s.onerror = nu; document.head.appendChild(s); }); }
    css(cdn + "leaflet/1.9.4/leaflet.min.css");
    LEAF = js(cdn + "leaflet/1.9.4/leaflet.min.js");   // fără grupare în cifre: punctele se văd toate (vezi puncteRasfirate)
    return LEAF;
  }
  function harta(el, r) {
    var cap = head("Urbanism", "Unde se construiește în Rădăuți: certificatele de urbanism și autorizațiile de construire, pe hartă, după adresa din registre.", r);
    if (!URB) {
      el.innerHTML = cap + '<p class="updated">Se încarcă registrele...</p>';
      get(DATA + "urbanism.json").then(function (d) { URB = d; render(); }).catch(function () { URB = { cu: [], ac: [] }; render(); });
      return;
    }
    var toate = [];
    ["ac", "cu"].forEach(function (t) { (URB[t] || []).forEach(function (a) { toate.push({ t: t, a: a }); }); });
    var cu = toate.filter(function (x) { return x.a.lat; });
    var ani = {}, cats = {}; toate.forEach(function (x) { if (x.a.data) ani[x.a.data.slice(0, 4)] = 1; cats[x.a.categorie || "Altele"] = 1; });
    var aniK = Object.keys(ani).sort().reverse();
    el.innerHTML = cap + '<div class="card section sx-bar"><div class="filters">' +
      '<select id="m-t" aria-label="Ce arată harta"><option value="ac">Autorizații de construire</option><option value="cu">Certificate de urbanism</option><option value="">Ambele</option></select>' +
      '<select id="m-a" aria-label="Anul"><option value="activ" selected>Active acum (probabil valabile)</option><option value="">Toți anii</option>' + aniK.map(function (a) { return "<option>" + a + "</option>"; }).join("") + "</select>" +
      '<select id="m-c" aria-label="Categoria"><option value="">Toate categoriile</option>' + Object.keys(cats).sort().map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("") + "</select>" +
      '<input id="m-q" type="search" placeholder="Caută: stradă, lucrare, firmă" aria-label="Caută"></div><p class="count" id="m-n"></p></div>' +
      '<div class="map" id="map" role="region" aria-label="Harta certificatelor și autorizațiilor"></div>' +
      '<p class="note">Pozițiile sunt căutate automat după adresa din registru, în OpenStreetMap: unde numărul casei nu e găsit, punctul e pus pe stradă (marcat mai deschis). Adresele noi se adaugă zilnic, câteva sute pe zi. ' +
      "Pe hartă, persoanele fizice nu sunt numite; numele apar în registrele publicate de primărie.</p>" +
      '<div class="legend"><span><i style="background:var(--s1)"></i>Autorizație de construire</span><span><i style="background:var(--s2)"></i>Certificat de urbanism</span><span><i style="background:var(--plan)"></i>Poziție aproximativă (pe stradă)</span></div>';
    incarcaLeaflet().then(function () {
      var Lf = window.L, cs = getComputedStyle(document.documentElement);
      var cul = { ac: cs.getPropertyValue("--s1").trim() || "#2a78d6", cu: cs.getPropertyValue("--s2").trim() || "#eb6834", ap: cs.getPropertyValue("--plan").trim() || "#8a8f94" };
      var m = Lf.map("map", { scrollWheelZoom: false }).setView([47.8445, 25.9195], 14);
      Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
      var grup = Lf.layerGroup().addTo(m);
      function popup(x) {
        var a = x.a, f = safeUrl(a.registru_pdf);
        return "<b>" + (x.t === "ac" ? "AC " : "CU ") + esc(a.nr || "fără nr.") + " · " + esc(zi(a.data)) + "</b><br>" + esc(a.categorie || "") +
          (a.scop ? "<br>" + esc(a.scop.length > 220 ? a.scop.slice(0, 220) + "…" : a.scop) : "") + "<br><span style=\"color:#666\">" + esc(a.strada || a.adresa || "") + "</span>" +
          "<br>" + (a.pj ? esc(a.solicitant || "") : "persoană fizică") + (a.valoare ? " · " + lei(a.valoare) : "") +
          (a.precizie === "stradă" ? "<br><i>poziție aproximativă, pe stradă</i>" : "") + (f ? '<br><a href="' + esc(f) + '" rel="noopener">registrul (PDF)</a>' : "");
      }
      function deseneaza() {
        var t = $("m-t").value, an = $("m-a").value, c = $("m-c").value, q = norm($("m-q").value).trim();
        var sel = toate.filter(function (x) {
          return (!t || x.t === t) && (!an || (an === "activ" ? actActiv(x) : (x.a.data || "").slice(0, 4) === an)) && (!c || (x.a.categorie || "Altele") === c) &&
            (!q || norm([x.a.strada, x.a.adresa, x.a.scop, x.a.pj ? x.a.solicitant : "", x.a.nr].join(" ")).indexOf(q) >= 0);
        });
        var pe = sel.filter(function (x) { return x.a.lat; });
        grup.clearLayers();
        puncteRasfirate(Lf, pe.map(function (x) { var aprox = x.a.precizie === "stradă"; return { lat: x.a.lat, lon: x.a.lon, cul: aprox ? cul.ap : cul[x.t], aprox: aprox, pop: actPopup(x) }; }), { popOpt: popOpt(m) })
          .forEach(function (mk) { grup.addLayer(mk); });
        $("m-n").textContent = nr(pe.length) + " pe hartă, din " + nr(sel.length) + (sel.length - pe.length ? " (" + nr(sel.length - pe.length) + " fără adresă găsită încă)" : "");
      }
      ["m-t", "m-a", "m-c"].forEach(function (id) { $(id).addEventListener("change", deseneaza); });
      var tq; $("m-q").addEventListener("input", function () { clearTimeout(tq); tq = setTimeout(deseneaza, 250); });
      deseneaza();
      if (!cu.length) $("m-n").textContent = "Adresele se pun pe hartă începând cu următoarea colectare.";
    }).catch(function () { $("map").innerHTML = '<p class="empty" style="padding:16px">Harta nu s-a putut încărca.</p>'; });
  }

  // ---------- Primărie: Litigii ----------
  var LIT = null;
  var REZ = [["câștigat", "Câștigate de instituție", "var(--good)", "c"], ["pierdut", "Pierdute de instituție", "var(--bad)", "p"], ["parțial", "Câștigate în parte", "var(--warn)", "par"],
    ["în curs", "În curs", "var(--s1)", "ic"], ["neclar", "Fără soluție clară", "var(--plan)", "n"]];
  var ROLN = { "a fost chemată în judecată": "Instituția e pârâtă (chemată în judecată)", "a dat în judecată": "Instituția e reclamantă (a dat în judecată)", "a atacat hotărârea": "Instituția a atacat o hotărâre", "altă calitate": "Altă calitate" };
  var LKEYS = ["q", "aut", "an", "rez", "rol", "gr", "st", "fz", "inst", "mat"];
  // ---- fișa unui dosar: părțile față în față, etapele ca traseu, hotărârea finală ----
  var RZ_SIMB = { "câștigat": "✓", "pierdut": "✕", "parțial": "◐", "în curs": "…" };
  var RZ_CLS = { "câștigat": "c", "pierdut": "p", "parțial": "par", "în curs": "ic" };
  function rzMare(rez, prov, aut) {
    var cls = RZ_CLS[rez] || "n";
    var cine = aut && aut.length === 1 && aut[0] !== "Municipiul Rădăuți" ? "de instituție" : aut && aut.length > 1 ? "de autorități" : "de municipiu";
    var txt = rez === "neclar" || !rez ? "fără soluție clară" : rez === "în curs" ? "în curs" : rez + " " + cine;
    return '<span class="rz big ' + cls + '">' + (RZ_SIMB[rez] ? '<span aria-hidden="true">' + RZ_SIMB[rez] + "</span> " : "") + esc(txt) + (prov ? " (provizoriu)" : "") + "</span>";
  }
  function listaParti(nume, mun) {
    var pf = 0, o = [];
    (nume || []).forEach(function (n) { if (n === "persoană fizică") pf++; else o.push(n); });
    var li = function (n) { return "<li" + (mun[n] ? ' class="mun"' : "") + ">" + esc(n) + (mun[n] ? ' <span class="tag" title="' + esc(mun[n]) + '">' + (mun[n] === "Municipiul Rădăuți" ? "municipiul" : "instituție din Rădăuți") + "</span>" : "") + "</li>"; };
    o.sort(function (a, b) { return (mun[b] ? 1 : 0) - (mun[a] ? 1 : 0); });
    var h = o.slice(0, 4).map(li).join("");
    if (o.length > 4) h += '<li><details><summary>și încă ' + (o.length - 4) + "</summary><ul>" + o.slice(4).map(li).join("") + "</ul></details></li>";
    if (pf) h += '<li class="pf">' + (pf === 1 ? "o persoană fizică" : pf + " persoane fizice") + "</li>";
    return h || '<li class="pf">-</li>';
  }
  function hotTxt(h) {
    if (!h) return "";
    return esc(h.tip || "Hotărâre") + (h.nr ? " nr. " + esc(h.nr) : "") + (h.data ? " din " + esc(zi(h.data)) : "");
  }
  function hotCopie(d, e) {
    var h = e.hotarare || {};
    return [e.instanta, (h.tip || "Hotărâre") + (h.nr ? " nr. " + h.nr : "") + (h.data ? " din " + h.data.split("-").reverse().join(".") : ""), "dosar " + d.numar].join(", ");
  }
  function fisaDosar(d) {
    var mun = {}; d.etape.forEach(function (e) { (e.parti || []).forEach(function (p) { if (p.municipiu) mun[p.nume] = p.autoritate || "Municipiul Rădăuți"; }); });
    var cls = RZ_CLS[d.rezultat] || "n";
    var portal = d.cod_portal ? "https://portal.just.ro/" + encodeURIComponent(d.cod_portal) + "/SitePages/cautare.aspx?k=" + encodeURIComponent(d.numar) : "https://portal.just.ro";
    var vazut = {};   // aceeași cale de atac apare la fiecare instanță: o arătăm o singură dată
    var princ = d.etape.filter(function (e) { return !e.asociat || e.asociat === "reînregistrat"; }), asoc = d.etape.filter(function (e) { return e.asociat && e.asociat !== "reînregistrat"; });
    if (!princ.length) { princ = d.etape; asoc = []; }
    var pasi = princ.map(function (e) {
      var ec = e.stare === "în curs" ? "ic" : (RZ_CLS[e.rezultat] || "n");
      var st = e.termen ? '<span class="s">în curs · următorul termen <strong>' + esc(zi(e.termen)) + "</strong></span>" :
        e.solutie ? '<span class="s">' + esc(e.solutie) + (e.data_solutie ? " · " + esc(zi(e.data_solutie)) : "") + "</span>" +
          (e.rezultat ? ' <span class="rz ' + ec + '">' + esc(e.rezultat) + "</span>" : "") :
        '<span class="s">' + (e.stare === "în curs" ? "în curs, fără termen afișat" : "fără soluție afișată pe portal") + "</span>";
      var atac = (e.cai_atac || []).filter(function (c) { var k = c.tip + c.data + c.parte; if (vazut[k]) return false; vazut[k] = 1; return true; }).map(function (c) { return '<span class="s atac">' + esc(c.tip) + " declarat" + (c.parte ? " de " + esc(c.parte) : "") + (c.data ? " la " + esc(zi(c.data)) : "") + "</span>"; }).join("");
      return '<li class="' + ec + '"><span class="dot" aria-hidden="true"></span><b>' + esc(e.stadiu || "Etapă") + "</b>" +
        (e.numar && e.numar !== d.numar ? '<span class="s nrd">dosar ' + esc(e.numar) + "</span>" : "") +
        '<span class="s">' + esc(e.instanta) + (e.data ? " · din " + esc(zi(e.data)) : "") + "</span>" + st + atac + "</li>";
    }).join("");
    var asocH = asoc.length ? '<details class="lc-asoc"' + (asoc.length <= 2 ? " open" : "") + "><summary>Dosare asociate (" + asoc.length + "): măsuri, contestații, cameră preliminară</summary>" + asoc.map(function (e) {
      var ec = e.stare === "în curs" ? "ic" : (RZ_CLS[e.rezultat] || "n");
      return '<div class="lc-as ' + ec + '"><strong>' + esc(e.numar) + "</strong> · " + esc(e.obiect || "") + " · " + esc(e.instanta) + (e.data ? " · din " + esc(zi(e.data)) : "") +
        '<div class="muted">' + (e.termen ? "în curs · termen " + esc(zi(e.termen)) : e.solutie ? esc(e.solutie) + (e.hotarare ? " · " + hotTxt(e.hotarare) : "") : "fără soluție afișată") + "</div>" +
        (e.sumar ? "<blockquote>" + esc(e.sumar.slice(0, 300)) + (e.sumar.length > 300 ? "..." : "") + "</blockquote>" : "") + "</div>";
    }).join("") + "</details>" : "";
    var fin = princ.filter(function (e) { return e.hotarare && e.solutie; }).pop();
    var hot = fin ? '<div class="lc-hot"><div class="lbl">Hotărârea' + (d.stare === "în curs" ? " din ultima etapă judecată" : "") + "</div>" +
      "<strong>" + hotTxt(fin.hotarare) + "</strong> · " + esc(fin.instanta) + " · " + esc(fin.stadiu || "") +
      (fin.sumar ? "<blockquote>" + esc(fin.sumar.slice(0, 700)) + (fin.sumar.length > 700 ? "..." : "") + "</blockquote>" : "") +
      '<div class="lc-a"><a href="https://www.rejust.ro/" rel="noopener" target="_blank">textul hotărârii pe ReJust</a>' +
      '<button class="lnk" type="button" data-copy="' + esc(hotCopie(d, fin)) + '">copiază datele hotărârii (pentru căutare)</button></div></div>' : "";
    return '<article class="lc ' + cls + '"><div class="lc-h"><span class="lc-nr">' + esc(d.numar) + "</span>" + rzMare(d.rezultat, d.provizoriu, d.autoritati) +
      '<span class="tag">' + esc(d.grup || "") + '</span>' + (d.faza ? '<span class="tag faza">' + esc(d.faza) + "</span>" : "") + '<span class="lc-d">înregistrat ' + esc(zi(d.data)) + "</span></div>" +
      '<div class="lc-aut">' + (d.autoritati || []).map(esc).join(" · ") + ((d.numere || []).length > 1 ? ' <span class="muted">· dosare legate: ' + d.numere.filter(function (x) { return x !== d.numar; }).map(esc).join(", ") + "</span>" : "") + "</div>" +
      '<h3 class="lc-t">' + esc(d.obiect || "obiect nemenționat") + "</h3>" +
      '<div class="lc-p"><div><div class="lbl">Reclamant</div><ul>' + listaParti(d.reclamanti, mun) + '</ul></div><div class="vs" aria-hidden="true">contra</div>' +
      '<div><div class="lbl">Pârât</div><ul>' + listaParti(d.parati, mun) + "</ul></div>" +
      ((d.alte_parti || []).length ? '<div class="alte"><div class="lbl">Alte părți (intervenienți, terți)</div><ul>' + listaParti(d.alte_parti, mun) + "</ul></div>" : "") + "</div>" +
      '<ol class="lc-steps">' + pasi + "</ol>" + asocH + hot +
      '<div class="lc-a"><a href="' + portal + '" rel="noopener" target="_blank">deschide dosarul pe portal.just.ro</a><button class="lnk" type="button" data-copy="' + esc(d.numar) + '">copiază numărul dosarului</button></div></article>';
  }
  function legaCopiere(el) {
    Array.prototype.forEach.call(el.querySelectorAll("button[data-copy]"), function (b) {
      if (b._ok) return; b._ok = 1;
      b.addEventListener("click", function () {
        var t = b.dataset.copy, gata = function () { b.textContent = "copiat"; setTimeout(function () { b.textContent = "copiat: " + (t.length > 40 ? t.slice(0, 40) + "..." : t); }, 10); };
        if (navigator.clipboard) navigator.clipboard.writeText(t).then(gata, gata); else gata();
      });
    });
  }
  function rzTag(d) {
    var R = REZ.filter(function (x) { return x[0] === d.rezultat; })[0] || REZ[4];
    return '<span class="rz ' + R[3] + '">' + esc(d.rezultat === "în curs" ? "în curs" : d.rezultat === "neclar" ? "fără soluție clară" : d.rezultat) + (d.provizoriu ? " (provizoriu)" : "") + "</span>";
  }
  function litLink(sub, F, schimb) {   // adresa unei secțiuni din Litigii, cu filtrele curente plus schimbările date
    var o = {}; LKEYS.concat(["v"]).forEach(function (k) { if (F && F[k]) o[k] = F[k]; });
    Object.keys(schimb || {}).forEach(function (k) { if (schimb[k]) o[k] = schimb[k]; else delete o[k]; });
    var p = Object.keys(o).map(function (k) { return k + "=" + encodeURIComponent(o[k]); });
    return "#litigii/" + sub + (p.length ? "?" + p.join("&") : "");
  }
  function litFiltru(D, F) {
    var q = norm(F.q).trim();
    return D.filter(function (d) {
      if (F.aut && (d.autoritati || []).indexOf(F.aut) < 0) return false;
      if (F.an && d.an !== F.an) return false;
      if (F.rez && d.rezultat !== F.rez) return false;
      if (F.rol && d.rol !== F.rol) return false;
      if (F.gr && d.grup !== F.gr) return false;
      if (F.st && d.stadiu_max !== F.st) return false;
      if (F.fz && (d.faza || "").indexOf(F.fz) !== 0) return false;
      if (F.inst && (d.instante || []).indexOf(F.inst) < 0) return false;
      if (F.mat && d.materie !== F.mat) return false;
      if (q) {
        if (d._s == null) d._s = norm([(d.numere || [d.numar]).join(" "), d.obiect, d.grup, d.materie, (d.instante || []).join(" "), (d.autoritati || []).join(" "), (d.alte_parti || []).join(" ")]
          .concat((d.adverse || []).map(function (p) { return p.nume; })).join(" "));
        if (d._s.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function litigii(el, r) {
    var sub = r.sub || "noutati";
    var desc = { noutati: "Dosarele noi și soluțiile pronunțate, cele mai recente întâi.", dosare: "Toate dosarele, cu căutare și filtre; tabel sau fișe detaliate.",
      statistici: "Cifrele dosarelor: pe ani, rezultate, instituții, obiecte, instanțe și părți adverse." }[sub];
    var cap = head("Litigii", "Dosarele din instanțe în care e parte o autoritate publică din Rădăuți: municipiul (primăria, primarul, consiliul local, poliția locală) și instituțiile pentru care urmărim achizițiile în SICAP. Sursa: portal.just.ro, verificat zilnic. " + desc, r);
    if (!LIT) {
      el.innerHTML = cap + '<p class="updated">Se încarcă dosarele...</p>';
      get(DATA + "litigii.json").then(function (d) { LIT = d; render(); }).catch(function () { el.innerHTML = cap + '<section class="card section"><p>Dosarele apar după prima colectare din portalul instanțelor.</p></section>'; });
      return;
    }
    var D = LIT.dosare || [], F = {}; LKEYS.forEach(function (k) { F[k] = (r.q || {})[k] || ""; }); F.v = (r.q || {}).v || "";
    var uniq = function (f) { var o = {}; D.forEach(function (d) { [].concat(f(d)).forEach(function (v) { if (v) o[v] = (o[v] || 0) + 1; }); }); return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }); };
    var opt = function (v, t, s) { return '<option value="' + esc(v) + '"' + (s === v ? " selected" : "") + ">" + esc(t) + "</option>"; };
    var aniL = uniq(function (d) { return d.an; }).sort().reverse();
    var aut = uniq(function (d) { return d.autoritati; });
    el.innerHTML = cap + '<div class="card section sx-bar"><div class="filters"><input id="l-q" type="search" value="' + esc(F.q) + '" placeholder="Caută: număr de dosar, obiect, parte (ex. Rădăuțiul Civic, SRL, anulare)" aria-label="Caută">' +
      '<select id="l-aut" aria-label="Instituția">' + opt("", "Toate instituțiile", F.aut) + aut.map(function (a) { return opt(a, a, F.aut); }).join("") + "</select>" +
      '<select id="l-an" aria-label="Anul">' + opt("", "Toți anii", F.an) + aniL.map(function (a) { return opt(a, a, F.an); }).join("") + "</select></div>" +
      '<details class="mai-filtre"' + (F.rez || F.rol || F.gr || F.st || F.inst || F.mat ? " open" : "") + '><summary>Mai multe filtre</summary><div class="filters">' +
      '<select id="l-rez" aria-label="Rezultatul">' + opt("", "Orice rezultat", F.rez) + REZ.map(function (x) { return opt(x[0], x[1], F.rez); }).join("") + "</select>" +
      '<select id="l-rol" aria-label="Rolul instituției">' + opt("", "Orice rol al instituției", F.rol) + Object.keys(ROLN).map(function (k) { return opt(k, ROLN[k], F.rol); }).join("") + "</select>" +
      '<select id="l-gr" aria-label="Ce se judecă">' + opt("", "Orice obiect", F.gr) + uniq(function (d) { return d.grup; }).map(function (g) { return opt(g, g, F.gr); }).join("") + "</select></div><div class=\"filters\">" +
      '<select id="l-fz" aria-label="Unde e acum">' + opt("", "Oriunde ar fi acum", F.fz) + [["Fond - în curs", "Acum la fond"], ["Apel - în curs", "Acum în apel"], ["Recurs - în curs", "Acum în recurs"], ["Soluționat", "Soluționate"]].map(function (x) { return opt(x[0], x[1], F.fz); }).join("") + "</select>" +
      '<select id="l-st" aria-label="Până unde a ajuns">' + opt("", "Orice etapă", F.st) + uniq(function (d) { return d.stadiu_max; }).map(function (g) { return opt(g, "A ajuns în: " + g.toLowerCase(), F.st); }).join("") + "</select>" +
      '<select id="l-inst" aria-label="Instanța">' + opt("", "Toate instanțele", F.inst) + uniq(function (d) { return d.instante; }).map(function (g) { return opt(g, g, F.inst); }).join("") + "</select>" +
      '<select id="l-mat" aria-label="Materia">' + opt("", "Toate materiile", F.mat) + uniq(function (d) { return d.materie; }).map(function (g) { return opt(g, g, F.mat); }).join("") + "</select></div></details>" +
      '<div class="sx-act"><a href="#litigii/' + sub + '">Șterge filtrele</a></div></div><div id="l-out"></div>';
    function citeste() {
      LKEYS.forEach(function (k) { F[k] = $("l-" + k).value; });
      history.replaceState(null, "", litLink(sub, F));
      iesire();
    }
    function iesire() {
      var rows = litFiltru(D, F), o = $("l-out");
      if (sub === "noutati") return litNoutati(o, rows, F);
      if (!rows.length) { o.innerHTML = '<section class="card section"><p class="empty">Niciun dosar nu corespunde filtrelor.</p></section>'; return; }
      if (sub === "statistici") return litStat(o, rows, F);
      litDosare(o, rows, F, function (v) { F.v = v; history.replaceState(null, "", litLink(sub, F)); iesire(); });
    }
    LKEYS.forEach(function (k) { if (k !== "q") $("l-" + k).addEventListener("change", citeste); });
    var tq; $("l-q").addEventListener("input", function () { clearTimeout(tq); tq = setTimeout(citeste, 250); });
    iesire();
  }

  function litStat(el, rows, F) {
    var cC = rows.filter(function (d) { return d.rezultat === "câștigat"; }).length, cP = rows.filter(function (d) { return d.rezultat === "pierdut"; }).length;
    var pe = {}; rows.forEach(function (d) { var a = d.an || "?"; pe[a] = pe[a] || {}; pe[a][d.rezultat] = (pe[a][d.rezultat] || 0) + 1; });
    var ani = Object.keys(pe).filter(function (a) { return a !== "?"; }).sort(), A = [];
    if (ani.length) for (var y = +ani[0]; y <= +ani[ani.length - 1]; y++) A.push(String(y));
    var cnt = function (f) { var o = {}; rows.forEach(function (d) { [].concat(f(d)).forEach(function (v) { if (v) o[v] = (o[v] || 0) + 1; }); }); return o; };
    var top = function (o, n) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, n); };
    var gr = cnt(function (d) { return d.grup; }), inst = cnt(function (d) { return d.instante; }), au = cnt(function (d) { return d.autoritati; });
    var adv = cnt(function (d) { var o = {}; (d.adverse || []).forEach(function (p) { o[p.nume === "persoană fizică" ? "Persoane fizice" : p.nume] = 1; }); return Object.keys(o); });
    var pr = REZ.filter(function (x) { return rows.some(function (d) { return d.rezultat === x[0]; }); });
    var aniR = ani.length ? (ani[0] === ani[ani.length - 1] ? ani[0] : ani[0] + "-" + ani[ani.length - 1]) : "";
    el.innerHTML = '<div class="grid">' +
      tile("Dosare", nr(rows.length), "", aniR ? "înregistrate în " + aniR : "") +
      tile("În curs", nr(rows.filter(function (d) { return d.stare === "în curs"; }).length), "", "cu termen viitor sau ședință în ultimul an", litLink("dosare", F, { rez: "în curs" })) +
      tile("Câștigate / pierdute", '<span style="color:var(--good)">' + nr(cC) + '</span> <small>/</small> <span style="color:var(--bad)">' + nr(cP) + "</span>", "", cC + cP ? "instituția a câștigat <strong>" + Math.round(100 * cC / (cC + cP)) + "%</strong> din dosarele cu soluție clară" : "") +
      tile("Instituția chemată în judecată", nr(rows.filter(function (d) { return d.rol === "a fost chemată în judecată"; }).length), "", "ca pârâtă sau intimată, în prima etapă", litLink("dosare", F, { rol: "a fost chemată în judecată" })) + "</div>" +
      (Object.keys(au).length > 1 ? '<section class="card section"><h2>Pe instituții</h2><p class="note">În câte dosare e parte fiecare autoritate. Apasă ca să vezi doar dosarele ei.</p>' +
        hbl(top(au, 20).map(function (k) { return { l: k, v: au[k], href: litLink("statistici", F, { aut: k }) }; }), nr, rows.length) + "</section>" : "") +
      '<section class="card section"><h2>Dosare pe ani, după rezultat</h2><p class="note">După anul înregistrării. Rezultatul e al ultimei etape cu soluție: verde, câștigat de instituție; roșu, pierdut. Apasă pe un an ca să-l filtrezi.</p>' +
      legend(pr.map(function (x) { return [x[1], x[2]]; })) + '<div class="chart" id="ch-lit"></div></section>' +
      '<div class="grid two"><section class="card"><h2>Ce se judecă</h2><p class="note">Obiectul dosarelor, grupat.</p>' +
      hbl(top(gr, 12).map(function (k) { return { l: k, v: gr[k], href: litLink("statistici", F, { gr: k }) }; }), nr, rows.length) + "</section>" +
      '<section class="card"><h2>Cu cine se judecă</h2><p class="note">Părțile adverse, în câte dosare apar.</p>' +
      hbl(top(adv, 12).map(function (k) { return { l: k, v: adv[k], href: k === "Persoane fizice" ? null : litLink("dosare", F, { q: k }) }; }), nr, rows.length) + "</section></div>" +
      '<section class="card section"><h2>La ce instanțe</h2>' + hbl(top(inst, 10).map(function (k) { return { l: k, v: inst[k], href: litLink("statistici", F, { inst: k }) }; }), nr, rows.length) + "</section>";
    chart($("ch-lit"), { cats: A, stacked: true, label: "Dosare pe ani, după rezultat",
      series: pr.map(function (x) { return { name: x[1], color: x[2], values: A.map(function (y) { return (pe[y] || {})[x[0]] || 0; }) }; }),
      labelValue: function (i) { var p = pe[A[i]] || {}; return Object.keys(p).reduce(function (a, k) { return a + p[k]; }, 0) || ""; },
      tooltip: function (i) { var p = pe[A[i]] || {}; return "<b>" + A[i] + "</b>" + pr.map(function (x) { return p[x[0]] ? "<br>" + x[1] + ": " + p[x[0]] : ""; }).join(""); },
      onClick: function (i) { location.hash = litLink("statistici", F, { an: A[i] }); } });
  }

  function litDosare(el, rows, F, schimba) {
    var fise = F.v === "fise";
    el.innerHTML = '<section class="card section"><div class="h-row"><div class="seg" role="group" aria-label="Vizualizare"><button type="button" data-v="" aria-pressed="' + !fise + '">Tabel</button><button type="button" data-v="fise" aria-pressed="' + fise + '">Fișe</button></div>' +
      '<button class="lnk" id="l-csv" type="button">descarcă tabelul (CSV, pentru Excel)</button></div>' +
      '<p class="count">' + nr(rows.length) + (rows.length === 1 ? " dosar" : " dosare") + '</p><div id="l-l"></div><button class="more" id="l-m" hidden>Arată mai multe</button></section>';
    Array.prototype.forEach.call(el.querySelectorAll(".seg button"), function (b) { b.addEventListener("click", function () { schimba(b.dataset.v); }); });
    var col = function (d) {
      var e = d.etape[d.etape.length - 1] || {};
      return [(d.numere || [d.numar]).join(", "), d.data, d.obiect || "", (d.autoritati || []).join("; "), partiTxt(d.reclamanti), partiTxt(d.parati), partiTxt(d.alte_parti), (d.faza || d.stadiu_max || "") + (e.instanta ? " · " + e.instanta : ""),
        d.stare === "în curs" ? (d.termen ? "în curs, termen " + zi(d.termen) : "în curs") : (d.solutie || "-") + (d.data_solutie ? " (" + zi(d.data_solutie) + ")" : ""),
        d.rezultat + (d.provizoriu ? " (provizoriu)" : "")];
    };
    var shown = fise ? 20 : 100;
    function draw() {
      if (fise) $("l-l").innerHTML = rows.slice(0, shown).map(fisaDosar).join("");
      else $("l-l").innerHTML = '<p class="note">Reclamantul și pârâtul sunt cei din prima etapă (la fond); la „alte părți” apar intervenienții și ceilalți participanți, cu calitatea lor. Apasă pe număr pentru fișa dosarului.</p>' +
        '<div class="tw"><table class="lit-t"><thead><tr><th>Dosar</th><th>Înregistrat</th><th>Obiect</th><th>Instituția</th><th>Reclamant</th><th>Pârât</th><th>Alte părți</th><th>Unde e acum</th><th>Ultima soluție / termen</th><th>Rezultat</th></tr></thead><tbody>' +
        rows.slice(0, shown).map(function (d) {
          var c = col(d);
          return '<tr><td class="nw"><a href="' + litLink("dosare", {}, { q: d.numar, v: "fise" }) + '">' + esc(d.numar) + "</a>" + ((d.numere || []).length > 1 ? '<br><small class="muted">+ ' + (d.numere.length - 1) + (d.numere.length === 2 ? " dosar legat" : " dosare legate") + "</small>" : "") + '</td><td class="nw">' + esc(zi(c[1])) + "</td><td>" + esc(c[2]) + "</td><td>" + esc(c[3]) + "</td><td>" + esc(c[4]) +
            "</td><td>" + esc(c[5]) + "</td><td>" + esc(c[6]) + "</td><td>" + esc(c[7]) + "</td><td>" + esc(c[8]) + "</td><td>" + rzTag(d) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
      $("l-m").hidden = rows.length <= shown;
      legaCopiere(el);
    }
    $("l-m").addEventListener("click", function () { shown += fise ? 40 : 200; draw(); });
    $("l-csv").addEventListener("click", function () {
      var q = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
      var txt = "﻿" + [["Dosare", "Înregistrat", "Obiect", "Instituția", "Reclamant", "Pârât", "Alte părți", "Unde e acum", "Ultima soluție / termen", "Rezultat"]].concat(rows.map(col))
        .map(function (r) { return r.map(q).join(";"); }).join("\r\n");
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
      a.download = "litigii-radauti.csv"; document.body.appendChild(a); a.click(); a.remove();
    });
    draw();
  }

  function partiTxt(a) {   // persoanele fizice se numără, nu se repetă
    var pf = 0, o = [];
    (a || []).forEach(function (n) { if (/^persoană fizică/.test(n)) pf++; else o.push(n); });
    if (pf) o.push(pf === 1 ? "persoană fizică" : pf + " persoane fizice");
    return o.join("; ") || "-";
  }
  function stire(n) {
    var cls = RZ_CLS[n.rezultat] || (n.fel === "dosar nou" ? "nou" : "n");
    return '<article class="lc mic ' + cls + '"><div class="lc-h"><span class="lc-d0">' + esc(zi(n.data)) + '</span><span class="tag">' + esc(n.fel) + "</span>" +
      '<a class="lc-nr" href="' + litLink("dosare", {}, { q: n.cauza || n.numar, v: "fise" }) + '">' + esc(n.numar) + "</a>" + (/\/a\d+/i.test(n.numar) ? '<span class="tag">dosar asociat</span>' : "") + (n.rezultat ? rzMare(n.rezultat, false, n.autoritati) : "") + "</div>" +
      '<h3 class="lc-t">' + esc(n.obiect || "obiect nemenționat") + "</h3>" +
      '<div class="lc-m"><strong>' + esc((n.autoritati || []).join(", ")) + "</strong> · " + esc((n.stadiu || "Etapă") + " · " + n.instanta) + "</div>" +
      '<div class="lc-m"><strong>Reclamant:</strong> ' + esc(partiTxt(n.reclamanti)) + " · <strong>Pârât:</strong> " + esc(partiTxt(n.parati)) +
      ((n.alte_parti || []).length ? " · <strong>Alte părți:</strong> " + esc(partiTxt(n.alte_parti)) : "") + "</div>" +
      (n.fel === "soluție" ? '<div class="lc-m"><strong>' + esc(n.solutie) + "</strong>" + (n.hotarare ? " · " + hotTxt(n.hotarare) : "") + "</div>" +
        (n.sumar ? "<blockquote>" + esc(n.sumar.slice(0, 400)) + (n.sumar.length > 400 ? "..." : "") + "</blockquote>" : "") : "") + "</article>";
  }
  function litNoutati(el, rows, F) {
    var ok = {}; rows.forEach(function (d) { ok[d.numar] = 1; });
    var fel = F.v === "solutii" ? "soluție" : F.v === "noi" ? "dosar nou" : "";
    var N = (LIT.noutati || []).filter(function (n) { return ok[n.numar] && (!fel || n.fel === fel); }), shown = 30;
    el.innerHTML = '<section class="card section"><div class="h-row"><h2>Noutăți din instanțe</h2><div class="seg" role="group" aria-label="Ce noutăți">' +
      [["", "Toate"], ["solutii", "Soluții"], ["noi", "Dosare noi"]].map(function (x) { return '<button type="button" data-v="' + x[0] + '" aria-pressed="' + (F.v === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div></div>" +
      '<p class="note">Cele mai recente întâi. Rezultatul pentru instituție e interpretat automat din soluție; verificați pe portal.just.ro înainte de a-l cita.</p><div id="l-nl"></div><button class="more" id="l-nm" hidden>Arată mai multe</button></section>';
    Array.prototype.forEach.call(el.querySelectorAll(".seg button"), function (b) { b.addEventListener("click", function () { F.v = b.dataset.v; history.replaceState(null, "", litLink("noutati", F)); litNoutati(el, rows, F); }); });
    function draw() { $("l-nl").innerHTML = N.length ? N.slice(0, shown).map(stire).join("") : '<p class="empty">Nicio noutate pentru filtrele alese.</p>'; $("l-nm").hidden = N.length <= shown; }
    $("l-nm").addEventListener("click", function () { shown += 50; draw(); });
    draw();
  }

  // ---------- Voturile din procesele-verbale (intern, în verificare) ----------
  function voturiIntern(el) {
    get(DATA + "voturi.json").then(function (V) {
      var pa = V.pe_ani || {}, ani = Object.keys(pa).sort().reverse();
      var S = (V.sedinte || []).filter(function (x) { return x.voturi && x.voturi.length; });
      var h = '<section class="card section"><h2>Voturi extrase automat din procesele-verbale</h2><p class="note">Extrase automat din textul recunoscut (OCR). Formularea proceselor-verbale variază, deci cifrele trebuie verificate pe documente înainte de a fi publicate. Fiecare vot are fragmentul de text din care a fost extras.</p>' +
        '<div class="tw"><table><thead><tr><th>An</th><th class="n">Ședințe</th><th class="n">Cu voturi găsite</th><th class="n">Voturi</th><th class="n">Unanime</th><th class="n">Cu „împotrivă”</th><th class="n">Cu abțineri</th><th class="n">Respinse</th></tr></thead><tbody>' +
        ani.map(function (y) { var p = pa[y]; return "<tr><td>" + y + '</td><td class="n">' + p.sedinte + '</td><td class="n">' + p.cu_voturi + '</td><td class="n">' + p.voturi + '</td><td class="n">' + p.unanime + '</td><td class="n">' + p.cu_impotriva + '</td><td class="n">' + p.cu_abtineri + '</td><td class="n">' + p.respinse + "</td></tr>"; }).join("") +
        '</tbody></table></div><div id="vt-l"></div></section>';
      el.innerHTML = h;
      lista($("vt-l"), S, {
        placeholder: "Caută în titlurile proiectelor sau numele consilierilor", unitate: ["ședință", "ședințe"],
        an: function (x) { return x.data.slice(0, 4); },
        text: function (x) { return x.voturi.map(function (v) { return (v.titlu || "") + " " + v.nume_impotriva.join(" ") + " " + v.nume_abtineri.join(" "); }).join(" "); },
        extraFilter: { html: '<select aria-label="Voturi"><option value="">Toate ședințele</option><option value="imp">Cu voturi împotrivă sau abțineri</option></select>', test: function (x) { return x.voturi.some(function (v) { return v.impotriva || v.abtineri; }); } },
        item: function (x) {
          var u = safeUrl(x.pdf), un = x.voturi.filter(function (v) { return !v.impotriva && !v.abtineri; }).length, ne = x.voturi.length - un;
          return '<details class="doc vt-s"><summary><div class="h"><span class="id">Ședința ' + esc(TIP[x.tip] || x.tip || "") + " din " + esc(zi(x.data)) + "</span>" +
            '<span class="vt-r"><b>' + x.voturi.length + "</b> " + (x.voturi.length === 1 ? "vot" : "voturi") + (un ? " · " + un + " unanim" + (un === 1 ? "" : "e") : "") + (ne ? ' · <span class="vt-ne">' + ne + " cu împotrivă sau abțineri</span>" : "") + (x.prezenti ? " · " + x.prezenti + " prezenți" : "") + "</span>" +
            (u ? '<a class="lk" href="' + esc(u) + '" rel="noopener">PDF</a>' : "") + "</div></summary>" +
            ((x.absenti || []).length ? '<div class="m"><span>Absenți: ' + x.absenti.map(function (n) { return linkCons(V, n); }).join(", ") + (x.in_functie ? " (prezenți " + x.prezenti + " din " + x.in_functie + ")" : "") + "</span></div>" : "") +
            x.voturi.map(function (v) {
              return '<div class="m" style="display:block;margin-top:6px"><strong>' + (v.punct ? "Punctul " + v.punct + ": " : "") + "</strong>" + esc((v.titlu || "proiect neidentificat").slice(0, 200)) +
                (v.hcl ? " " + linkHcl(v.hcl) : "") + "<br>" +
                votHtml(v) +
                ' <details class="more-t"><summary>textul</summary><span class="muted">' + esc(v.fragment) + "</span></details></div>";
            }).join("") + "</details>";
        }
      });
    }).catch(function () { el.innerHTML = ""; });
  }

  // ---------- Consilierii: prezență și voturi (intern, din procesele-verbale) ----------
  var VCOD = { P: ["pentru", "c", "pentru (dedus)"], I: ["împotrivă", "p", "împotrivă"], A: ["abținere", "par", "abținere"], N: ["nu a votat", "n", "nu a votat"], X: ["absent", "n", "absent"], "?": ["necunoscut", "n", "necunoscut"] };
  function mandateDin(V) {   // [[eticheta, început, sfârșit]]
    var M = V.mandate || {}, k = Object.keys(M).sort(function (a, b) { return M[a].localeCompare(M[b]); });
    return k.map(function (x, i) { return [x, M[x], i + 1 < k.length ? M[k[i + 1]] : "9999"]; });
  }
  function statCons(c, d0, d1) {
    var st = { sedinte: 0, prezent: 0, absent: 0, necunoscut: 0, P: 0, I: 0, A: 0, N: 0, "?": 0, X: 0 };
    Object.keys(c.cod).forEach(function (d) {
      if (d < d0 || d >= d1) return;
      var s = c.cod[d]; st.sedinte++;
      st[s[0] === "p" ? "prezent" : s[0] === "X" ? "absent" : "necunoscut"]++;
      for (var i = 1; i < s.length; i++) st[s[i]]++;
    });
    return st;
  }
  // ---------- Scorul de activitate al consilierilor (metodologia Rădăuțiul Civic, 2022-2023) ----------
  // nota = 1 (din oficiu) + 2,5 × prezența + 2,5 × inițiativele + 2,5 × intervențiile + 1 × raportul/2 + 0,5 × fără traseism + 0,25 × președinte de comisie
  var AN_CURENT = String(new Date().getFullYear());
  function perfManual() { return (COMP || {}).performanta || {}; }
  function areNota(V) { return (V.consilieri || []).some(function (c) { return c.interventii; }); }   // datele noi vin cu prima colectare după actualizare
  function notaCons(V, c, d0, d1) {
    var prez = 0, abs = 0, neAbs = 0, cuInt = 0, nInt = 0, aniS = {};
    Object.keys(c.cod).forEach(function (d) {
      if (d < d0 || d >= d1) return;
      var ch = c.cod[d][0], ni = (c.interventii || {})[d] || 0; aniS[d.slice(0, 4)] = 1; nInt += ni;
      if (ch === "X") { abs++; return; }
      if (ch === "p") prez++;
      neAbs++; if (ni) cuInt++;
    });
    var hcl = 0, nf = 0, nnf = 0;
    (V.sedinte || []).forEach(function (s) { if (s.data < d0 || s.data >= d1) return; hcl += s.hcl_in_sedinta || 0; if (s.in_functie) { nf += s.in_functie; nnf++; } });
    var norma = hcl / Math.max(1, (nnf ? nf / nnf : 19) - 1) || 0, init = (c.initiative || []).filter(function (x) { return x[0] >= d0 && x[0] < d1; });
    var M = perfManual(), ani = Object.keys(aniS).sort(), RA = rapoarteCons(c), calit = (M.calitate_rapoarte || {})[c.id] || {};
    var crAn = function (a) { if (calit[a] != null) return +calit[a]; if (a >= AN_CURENT) return null; return RA.some(function (x) { return x.an === a; }) ? 1 : 0; };
    var crs = ani.map(crAn).filter(function (v) { return v != null; }), CR = crs.length ? crs.reduce(function (a, b) { return a + b; }, 0) / crs.length : 1;
    var trase = (M.traseism || {})[c.id], pres = ((M.presedinti_comisii || {})[c.id] || []).some(function (a) { return ani.indexOf(String(a)) >= 0; });
    // prezența: ședințele fără absență numită în procesul-verbal (PV-urile numesc absenții; ceilalți erau în sală)
    var P = abs + neAbs ? 1 - abs / (abs + neAbs) : null, INT = neAbs ? Math.min(1, cuInt / neAbs) : null, IP = norma ? Math.min(1, init.length / norma) : 0;
    var nota = 1 + 2.5 * (P || 0) + 2.5 * IP + 2.5 * (INT || 0) + CR / 2 + (trase ? 0 : 0.5) + (pres ? 0.25 : 0);
    return { nota: Math.min(10, Math.round(nota * 100) / 100), P: P, IP: IP, INT: INT, CR: CR, crEstimat: !crs.length, SP: !trase, trase: trase, PRC: pres, prez: prez, abs: abs, neAbs: neAbs, cuInt: cuInt, nInt: nInt,
      init: init, norma: hcl ? norma : null, sedinte: abs + neAbs, ani: ani };
  }
  function culoareNota(n) { return n >= 8 ? "#1baf7a" : n >= 6.5 ? "#8bbf3c" : n >= 5 ? "#e5a823" : n >= 3.5 ? "#ec7a2c" : "#d64545"; }
  function scalaNota(n) {
    return '<div class="nota-sc" role="img" aria-label="Scor de activitate ' + dec(n.toFixed(2)) + ' din 10"><div class="nota-bar"><i style="left:' + (n * 10) + '%"><b style="background:' + culoareNota(n) + '">' + dec(n.toFixed(1)) + "</b></i></div>" +
      '<div class="nota-ax">' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (x) { return "<span>" + x + "</span>"; }).join("") + "</div></div>";
  }
  function pctN(v) { return v == null ? "-" : Math.round(100 * v) + "%"; }
  var METODA_NOTA = '<details class="metoda"><summary>Cum se calculează scorul de activitate</summary><div class="note">' +
    "<p>Folosim metodologia cu care Asociația Rădăuțiul Civic a evaluat consilierii locali în 2022 și 2023 (<a href=\"https://www.radautiulcivic.ro/arhive/7385\" rel=\"noopener\">metodologia</a>, <a href=\"https://www.radautiulcivic.ro/arhive/7981\" rel=\"noopener\">evaluarea 2021-2023</a>). Scorul e de la 1 la 10:</p>" +
    "<ul><li><b>1 punct din oficiu</b>, ca rezervă pentru eventualele noastre erori;</li>" +
    "<li><b>până la 2,5 puncte pentru prezență</b>: ședințele în care nu e numit printre absenți în procesul-verbal;</li>" +
    "<li><b>până la 2,5 puncte pentru inițiative</b>: proiectele de hotărâre inițiate (din ordinea de zi din procesele-verbale), față de o normă: câte proiecte au venit pe consilier, adică hotărârile adoptate în perioadă împărțite la numărul consilierilor (fără viceprimar). În 2022 norma a fost 17 (308 proiecte, 18 consilieri);</li>" +
    "<li><b>până la 2,5 puncte pentru intervenții</b>: în câte dintre ședințele la care a fost prezent a luat cuvântul (după procesul-verbal; nu socotim anunțul că nu participă la vot);</li>" +
    "<li><b>până la 1 punct pentru raportul de activitate</b>: 0 dacă lipsește sau e copiat, 1 dacă e general, 2 dacă e detaliat, împărțit la 2. Automat socotim 1 pentru un raport publicat; calitatea o stabilește echipa. Pentru anul în curs raportul nu e încă scadent;</li>" +
    "<li><b>0,5 puncte dacă nu a schimbat partidul</b> în mandat și <b>0,25 puncte (bonus) pentru președinția unei comisii</b>; le completează echipa din documente.</li></ul>" +
    "<p>Scorul e strict cantitativ: nu măsoară cât de bune sunt intervențiile sau proiectele, întâlnirile cu cetățenii sau munca din comisii. Prezența, intervențiile și inițiativele sunt citite automat din procesele-verbale scanate și pot avea erori; spune-ne dacă găsești una.</p></div></details>";
  // tabel sortabil: click pe capul unei coloane (data-ns="1" = nesortabilă); valoarea din data-v, altfel textul celulei
  function sortabil(tb) {
    var ths = tb.querySelectorAll("thead th"), body = tb.tBodies[0]; if (!body) return;
    var val = function (tr, i) {   // celula din coloana i, ținând cont de colspan (o celulă întinsă peste coloană = fără valoare)
      var k = 0, td = null;
      for (var j = 0; j < tr.cells.length; j++) { var c = tr.cells[j], w = c.colSpan || 1; if (i < k + w) { td = w === 1 ? c : null; break; } k += w; }
      if (!td) return ""; var v = td.getAttribute("data-v"); return v != null ? v : td.textContent.trim();
    };
    Array.prototype.forEach.call(ths, function (th, i) {
      if (th.getAttribute("data-ns")) return;
      th.classList.add("srt"); th.tabIndex = 0; th.setAttribute("aria-sort", "none"); th.title = "Sortează";
      var go = function () {
        var rows = Array.prototype.slice.call(body.rows), num = rows.some(function (tr) { return val(tr, i) !== ""; }) && rows.every(function (tr) { var v = val(tr, i); return v === "" || !isNaN(+v); });
        var dir = th.getAttribute("aria-sort") === (num ? "descending" : "ascending") ? (num ? 1 : -1) : (num ? -1 : 1);
        rows.sort(function (a, b) {
          var x = val(a, i), y = val(b, i);
          if (num) { x = x === "" ? -Infinity : +x; y = y === "" ? -Infinity : +y; return (x - y) * dir || (a.getAttribute("data-n") || "").localeCompare(b.getAttribute("data-n") || "", "ro"); }
          return String(x).localeCompare(String(y), "ro") * dir;
        });
        rows.forEach(function (tr) { body.appendChild(tr); });
        Array.prototype.forEach.call(ths, function (t) { if (t !== th && t.classList.contains("srt")) t.setAttribute("aria-sort", "none"); });
        th.setAttribute("aria-sort", dir > 0 ? "ascending" : "descending");
        Array.prototype.forEach.call(body.querySelectorAll("td.nrc"), function (td, k) { td.textContent = k + 1; });
      };
      th.addEventListener("click", go);
      th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }
  // prezența: ședințele în care consilierul nu e numit printre absenți (procesele-verbale numesc absenții)
  function ratPrez(st) { return st.sedinte ? 1 - st.absent / st.sedinte : null; }
  function pctPrez(st) { var r = ratPrez(st); return r == null ? "-" : Math.round(100 * r) + "%"; }
  function linkCons(V, nume) {   // numele unui consilier din PV, cu link la profil (dacă îl recunoaștem)
    var k = norm(nume).replace(/-/g, " ").split(/\s+/).filter(function (w) { return w.length > 1; }).sort().join(" ");
    var c = (V.consilieri || []).filter(function (x) { return x.id.replace(/-/g, " ") === k; })[0];
    return c ? '<a href="#consiliu/consilieri/' + encodeURIComponent(c.id) + '">' + esc(nume) + "</a>" : esc(nume);
  }
  function consilieri(el, r) {
    el.innerHTML = head("Consiliul Local", "Consilierii locali: prezența la ședințe și cum au votat, din procesele-verbale.", r) + '<p class="updated">Se încarcă...</p>';
    if (!COMP) { incarcaComp().then(function () { consilieri(el, r); }); return; }
    if (!TEME) { incarcaTeme().then(function () { consilieri(el, r); }); return; }
    voturiIntern2(function (V) {
      var C = V.consilieri || [], M = mandateDin(V);
      if (!C.length) { el.innerHTML = head("Consiliul Local", "", r) + '<section class="card section"><p>Profilurile apar după următoarea colectare.</p></section>'; return; }
      var ales = (r.q || {}).m || (M.length ? M[M.length - 1][0] : "");
      var mm = M.filter(function (x) { return x[0] === ales; })[0] || ["", "0000", "9999"];
      var rows = C.map(function (c) { return { c: c, s: statCons(c, mm[1], mm[2]) }; }).filter(function (o) { return o.s.sedinte; });
      var ord = (r.q || {}).o || "nume";
      var cheie = { nume: function (o) { return o.c.nume; }, absente: function (o) { return -o.s.absent; }, imp: function (o) { return -(o.s.I + o.s.A); }, prez: function (o) { var r = ratPrez(o.s); return r == null ? 2 : r; } }[ord] || function (o) { return o.c.nume; };
      rows.sort(function (a, b) { var x = cheie(a), y = cheie(b); return x < y ? -1 : x > y ? 1 : a.c.nume.localeCompare(b.c.nume); });
      var tAbs = rows.reduce(function (a, o) { return a + o.s.absent; }, 0), tImp = rows.reduce(function (a, o) { return a + o.s.I; }, 0), tAbt = rows.reduce(function (a, o) { return a + o.s.A; }, 0);
      var th = function (k, t) { return "<th" + (k === "nume" ? "" : ' class="n"') + ">" + t + "</th>"; };
      var curent = ales === (M.length ? M[M.length - 1][0] : "");
      var evMand = function (c) { return (c.evenimente || []).filter(function (e) { return e.data >= mm[1] && e.data < mm[2]; }); };
      var incetare = function (o) {   // data și motivul încetării mandatului în legislatura aleasă (sau null)
        var e = evMand(o.c).filter(function (x) { return x.fel !== "validare"; })[0], k = curent ? compDe(o.c.id) : null;
        if (e) return { d: e.data, h: e.hcl, t: "" };
        if (k && k.iesit) return { d: k.iesit.pana_la, t: k.iesit.text || "" };
        return null;
      };
      rows.forEach(function (o) { o.inc = incetare(o); });
      var activi = rows.filter(function (o) { return !o.inc; }), incetati = rows.filter(function (o) { return o.inc; });
      if (curent) (COMP.consilieri || []).forEach(function (x) {   // consilieri noi, încă fără procese-verbale
        if (!x.iesit && x.nou && !rows.some(function (o) { return o.c.id === x.id; })) activi.push({ c: { id: x.id, nume: x.nume, perioade: [], evenimente: [] }, s: null, k: x });
      });
      incetati.sort(function (a, b) { return a.inc.d < b.inc.d ? -1 : 1; });
      // anii de activitate ai mandatului ales: un an aparține mandatului în funcție la 1 iulie (2024 e al mandatului 2020-2024)
      var aniM = (function () { var y0 = +mm[1].slice(0, 4), y1 = +mm[2].slice(0, 4); if (+mm[1].slice(5, 7) > 6) y0++; if (mm[2] < "9999" && +mm[2].slice(5, 7) < 7) y1--; return [String(y0), String(Math.min(y1, +AN_CURENT))]; })();
      var tabel = function (L2, inc) {
        return '<div class="tw"><table class="cs-t srt-t"><thead><tr>' + (inc ? "" : '<th class="n" data-ns="1">Nr.</th>') + th("nume", "Consilier") + "<th>Partid</th>" + (inc ? "<th>În consiliu</th><th>Mandat încetat</th>" : "") + (areNota(V) ? '<th class="n" title="Scorul de activitate, de la 1 la 10 (vezi mai jos cum se calculează)">Scor activitate</th>' : "") +
          th("prez", "Prezență") + th("absente", "Absențe") + th("imp", "Împotrivă / abțineri") + '<th class="n">Nu a votat</th><th class="n">Pentru (dedus)</th><th class="n">Necunoscut</th><th class="n" title="Rapoartele anuale pentru anii ' + aniM[0] + "-" + aniM[1] + ', anii mandatului ales">Rapoarte de activitate (' + aniM[0] + "-" + aniM[1] + ')</th></tr></thead><tbody>' +
          L2.map(function (o, i) {
            var s = o.s, k = o.k || (curent ? compDe(o.c.id) : null), val = evMand(o.c).filter(function (e) { return e.fel === "validare"; })[0];
            var p = (o.c.perioade || []).filter(function (x) { return x[1] >= mm[1] && x[0] < mm[2]; });
            // numele din procesele-verbale e citit automat (OCR); când diferă de cel de pe pagina primăriei, îl folosim pe al primăriei
            var tk = function (n) { return norm(n || "").replace(/-/g, " ").split(/\s+/).filter(Boolean).sort().join(" "); };
            var nume = k && tk(k.nume) !== tk(o.c.nume) && tk(k.nume).length === tk(o.c.nume).length ? k.nume : o.c.nume;
            var link = o.c.id && s ? '<a href="#consiliu/consilieri/' + encodeURIComponent(o.c.id) + '"><strong>' + esc(nume) + "</strong></a>" : "<strong>" + esc(nume) + "</strong>";
            var nou = val ? '<span class="tag">validat ' + esc(zi(val.data)) + "</span>" : k && k.nou ? '<span class="tag">din ' + esc(zi(k.nou.din)) + "</span>" : "";
            var tot = s ? s.prezent + s.absent : 0, nRap = rapoarteCons(o.c).filter(function (x) { return x.an && x.an >= aniM[0] && x.an <= aniM[1]; }).length, nt = s && areNota(V) ? notaCons(V, o.c, mm[1], mm[2]) : null;
            return '<tr data-n="' + esc(norm(nume)) + '" data-p="' + esc((k && k.partid) || "") + '">' + (inc ? "" : '<td class="n nrc">' + (i + 1) + "</td>") + '<td class="cs-n" data-v="' + esc(nume) + '"><span class="cs-nm">' + avatar(k, o.c.nume, false, true) + "<span>" + link + (nou ? "<br>" + nou : "") + "</span></span></td>" +
              '<td class="cs-p">' + (k && k.sigla ? '<img src="' + FTDATA + esc(k.sigla) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + esc((k && k.partid) || "") + "</td>" +
              (inc ? '<td class="nw" data-v="' + esc((p[0] || [""])[0]) + '">' + p.map(function (x) { return esc(zi(x[0])) + " - " + esc(zi(x[1])); }).join("<br>") + '</td><td class="inc" data-v="' + esc(o.inc.d || "") + '">' + esc(zi(o.inc.d)) +
                (o.inc.h ? " · " + linkHcl(o.inc.h) : "") + (o.inc.t ? '<details class="more-t"><summary>detalii</summary><div class="muted">' + esc(o.inc.t) + "</div></details>" : "") + "</td>" : "") +
              (!areNota(V) ? "" : '<td class="n" data-v="' + (nt ? nt.nota : -1) + '">' + (nt ? '<span class="nota-p" style="background:' + culoareNota(nt.nota) + '" title="prezență ' + pctN(nt.P) + ", intervenții în " + pctN(nt.INT) + " din ședințe, " + nt.init.length + ' inițiative">' + dec(nt.nota.toFixed(1)) + "</span>" : '<span class="muted">-</span>') + "</td>") +
              (s ? '<td class="n" data-v="' + (s.sedinte ? ratPrez(s) : -1) + '">' + pctPrez(s) + '</td><td class="n" data-v="' + s.absent + '">' + nr(s.absent) + '</td><td class="n" data-v="' + (s.I + s.A) + '">' + nr(s.I) + " / " + nr(s.A) +
                '</td><td class="n" data-v="' + s.N + '">' + nr(s.N) + '</td><td class="n" data-v="' + s.P + '">' + nr(s.P) + '</td><td class="n" data-v="' + s["?"] + '">' + nr(s["?"]) + "</td>"
                : '<td class="n muted" colspan="6">încă fără procese-verbale publicate</td>') +
              '<td class="n" data-v="' + nRap + '">' + (function () { var n_ = nRap; return n_ ? '<a href="#consiliu/consilieri/' + encodeURIComponent(o.c.id) + '">' + n_ + "</a>" : '<span class="muted">0</span>'; })() + "</td></tr>";
          }).join("") + "</tbody></table></div>";
      };
      el.innerHTML = head("Consiliul Local", "Consilierii locali: prezența la ședințe și cum au votat, din procesele-verbale (extrase automat; pot avea erori).", r) +
        '<div class="card section sx-bar"><div class="filters"><label class="lbl-s">Mandatul <select id="c-m">' + M.slice().reverse().map(function (x) { return "<option" + (x[0] === ales ? " selected" : "") + ">" + esc(x[0]) + "</option>"; }).join("") + "</select></label></div></div>" +
        '<div class="grid">' + tile("Consilieri în funcție", nr(activi.length), "", "în mandatul " + esc(ales) + (incetati.length ? "; " + incetati.length + " cu mandat încetat" : "")) + tile("Absențe", nr(tAbs), "", "în total, numite în procesele-verbale") +
        tile("Voturi împotrivă", nr(tImp), "", "date de consilieri numiți") + tile("Abțineri", nr(tAbt), "", "ale consilierilor numiți") + "</div>" +
        (curent ? '<section class="card section cl-comp"><h2>Componența pe partide</h2><figure><img src="' + BASE + 'assets/img/componenta-cl.webp" width="1600" height="1100" loading="lazy" ' +
          'alt="Componența Consiliului Local Rădăuți: 19 consilieri, 8 PSD, 9 PNL și 2 AUR, așezați în jurul mesei de ședință"><figcaption class="note">19 consilieri: 9 PNL, 8 PSD, 2 AUR (situația din noiembrie 2026). Fiecare siluetă e un consilier.</figcaption></figure></section>' : "") +
        (curent ? (function () {   // fețele consilierilor, pe partide
          var pe = {}; activi.forEach(function (o) { var k = o.k || compDe(o.c.id), p_ = (k && k.partid) || "Partid necompletat"; (pe[p_] = pe[p_] || []).push({ o: o, k: k }); });
          var ord = Object.keys(pe).sort(function (a, b) { return a === "Partid necompletat" ? 1 : b === "Partid necompletat" ? -1 : pe[b].length - pe[a].length; });
          return '<section class="card section cs-fete"><h2>Cine sunt consilierii</h2><p class="note">Apasă pe un consilier ca să vezi cum a votat, prezența, scorul de activitate și rapoartele lui.</p>' +
            ord.map(function (p_) {
              var sig = (pe[p_].filter(function (x) { return x.k && x.k.sigla; })[0] || {}).k;
              return '<h3 class="cs-fh">' + (sig ? '<img src="' + FTDATA + esc(sig.sigla) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + esc(p_) + ' <span class="nr-b n">' + pe[p_].length + "</span></h3>" +
                '<div class="cs-fg">' + pe[p_].sort(function (a, b) { return a.o.c.nume.localeCompare(b.o.c.nume); }).map(function (x) {
                  var nt = x.o.s && areNota(V) ? notaCons(V, x.o.c, mm[1], mm[2]) : null, nume = x.k ? x.k.nume : x.o.c.nume;
                  var foto = x.k && x.k.foto ? '<img src="' + FTDATA + esc(x.k.foto) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<i>' + esc(initiale(nume)) + '</i>\'">' : "<i>" + esc(initiale(nume)) + "</i>";
                  return '<a class="cs-fc" href="#consiliu/consilieri/' + encodeURIComponent(x.o.c.id || "") + '"' + (x.o.s ? "" : ' aria-disabled="true"') + '><span class="cs-ff">' + foto + "</span><b>" + esc(nume) + "</b>" +
                    '<span class="cs-fm">' + (nt ? '<span class="nota-p" style="background:' + culoareNota(nt.nota) + '" title="Scor activitate">' + dec(nt.nota.toFixed(1)) + "</span> " : "") + (x.o.s ? "prezență " + pctPrez(x.o.s) : "din " + esc(zi((x.k && x.k.nou && x.k.nou.din) || ""))) + "</span></a>";
                }).join("") + "</div>";
            }).join("") + "</section>";
        })() : "") +
        '<section class="card section"><div class="h-row"><h2>' + (curent ? "Consilierii în funcție" : "Consilierii din mandatul " + esc(ales)) + ' <span class="nr-b">' + activi.length + "</span></h2>" +
        (curent && safeUrl(COMP.sursa) ? '<a href="' + esc(COMP.sursa) + '" rel="noopener">componența pe site-ul primăriei</a>' : "") + "</div>" +
        '<p class="note">Lista e reconstruită din procesele-verbale (președinții de ședință, absenții, cei prezenți online și cei care au votat împotrivă, s-au abținut sau nu au votat), din hotărârile despre mandate și, pentru mandatul actual, din pagina „Componența” a primăriei (fotografii, partide, declarații). ' +
        "Procesele-verbale numesc doar consilierii care nu au votat „pentru”; votul „pentru” al fiecăruia îl deducem doar când știm sigur cine era în sală. Cifrele sunt extrase automat și se verifică pe documente.</p>" +
        '<div class="filters cs-f"><input type="search" id="cs-q" placeholder="Caută un consilier" aria-label="Caută un consilier"><select id="cs-p" aria-label="Partidul"><option value="">Toate partidele</option>' +
        Object.keys(activi.concat(incetati).reduce(function (a, o) { var k = o.k || (curent ? compDe(o.c.id) : null); if (k && k.partid) a[k.partid] = 1; return a; }, {})).sort().map(function (p_) { return "<option>" + esc(p_) + "</option>"; }).join("") +
        '</select><span class="muted cs-h">Apasă pe capul unei coloane ca să sortezi după ea.</span></div>' +
        tabel(activi, false) + "</section>" +
        (function () {
          if (!areNota(V)) return "";
          var R = rows.map(function (o) { return { o: o, n: notaCons(V, o.c, mm[1], mm[2]) }; }).filter(function (x) { return x.n.sedinte >= 3; }).sort(function (a, b) { return b.n.nota - a.n.nota; });
          if (!R.length) return "";
          var med = R.reduce(function (a, x) { return a + x.n.nota; }, 0) / R.length;
          return '<section class="card section"><h2>Scorul de activitate în mandatul ' + esc(ales) + "</h2>" +
            '<p class="note">Media consilierilor: <b>' + dec(med.toFixed(2)) + "</b>. Apasă pe un nume pentru detalii pe ani. Scorul e calculat automat după metodologia Rădăuțiul Civic; vezi mai jos ce intră în ea și ce nu.</p>" +
            '<div class="hbars nota-rk">' + R.map(function (x) { var n = x.n.nota;
              return '<a class="hb hb-a" href="#consiliu/consilieri/' + encodeURIComponent(x.o.c.id) + '"><span class="hb-l">' + esc(x.o.c.nume) + '</span><span class="hb-t"><i style="width:' + (n * 10) + "%;background:" + culoareNota(n) + '"></i></span><span class="hb-v">' + dec(n.toFixed(2)) + "</span></a>"; }).join("") + "</div>" +
            METODA_NOTA + "</section>";
        })() +
        (incetati.length ? '<section class="card section"><h2>Mandat încetat în această legislatură <span class="nr-b n">' + incetati.length + "</span></h2>" +
          '<p class="note">Consilieri care au plecat din consiliu înainte de sfârșitul mandatului: demisie, incompatibilitate, pierderea calității de membru al partidului și alte cazuri prevăzute de lege. Locul lor e preluat de supleanți de pe aceeași listă.</p>' +
          tabel(incetati, true) + "</section>" : "") +
        '<section class="card section"><h2>Absențe, pe consilieri</h2>' + hbl(rows.slice().sort(function (a, b) { return b.s.absent - a.s.absent; }).filter(function (o) { return o.s.absent; }).slice(0, 25).map(function (o) {
          return { l: o.c.nume, v: o.s.absent, href: "#consiliu/consilieri/" + encodeURIComponent(o.c.id) }; }), nr, tAbs) + "</section>";
      $("c-m").addEventListener("change", function () { location.hash = "#consiliu/consilieri?m=" + encodeURIComponent(this.value); });
      Array.prototype.forEach.call(el.querySelectorAll("table.srt-t"), sortabil);
      var filtru = function () {
        var q = norm($("cs-q").value).trim(), p_ = $("cs-p").value;
        Array.prototype.forEach.call(el.querySelectorAll("table.cs-t tbody tr"), function (tr) { tr.hidden = !!((q && (tr.dataset.n || "").indexOf(q) < 0) || (p_ && tr.dataset.p !== p_)); });
      };
      $("cs-q").addEventListener("input", filtru); $("cs-p").addEventListener("change", filtru);
    });
  }
  // rapoartele de activitate ale unui consilier (din pagina „Rapoarte de activitate” a primăriei), după numele din titlu
  function rapoarteCons(c) {
    var L2 = ((TEME || {}).rapoarte || {}).lista || [], k = compDe(c.id);
    var tok = function (n) { return norm(n || "").replace(/[^a-z ]+/g, " ").split(/\s+/).filter(function (w) { return w.length > 1; }); };
    var nume = [tok(c.nume), k ? tok(k.nume) : null].filter(Boolean);
    return L2.filter(function (x) {
      if (x.fel !== "consilieri") return false;
      var t = " " + tok(x.titlu).join(" ") + " ";
      return nume.some(function (n) { return n.length >= 2 && n.every(function (w) { return t.indexOf(" " + w + " ") >= 0; }); });
    }).sort(function (a, b) { return (b.an || "").localeCompare(a.an || ""); });
  }
  function incarcaTeme() { return TEME ? Promise.resolve(TEME) : get(DATA + "teme.json").then(function (d) { TEME = d; return d; }).catch(function () { TEME = {}; return TEME; }); }
  // ---------- fișa consilierului: față de grupul său, pe teme, ce a spus în ședințe ----------
  var TEME_VOT = [["Termoficare", /termic|termoficar/], ["Buget și taxe", /buget|rectificar|impozit|\btax|imprumut|credit/], ["Urbanism", /urbanis|p\.?\s?u\.?\s?[zd]\b|construir|planul urbanistic/],
    ["Patrimoniu", /domeniul (public|privat)|concesion|inchiri|vanzar|teren|imobil|dare in administrare/], ["Servicii publice", /salubr|deseu|\bapa\b|canaliz|iluminat|transport|parcar|cimitir|deszapez/],
    ["Social și sănătate", /social|spital|medical|locuint|asistent|varstnic/], ["Școli și sport", /scoal|scoli|liceu|gradinit|invatamant|sport|club/]];
  function consGrupTeme(V, c, voturi) {
    var eu = compDe(c.id), partid = eu && eu.partid;
    // grupul: colegii de partid de acum; ne uităm doar la mandatul în curs, ca partidul să fie același
    var Mv = mandateDin(V), mand = Mv[Mv.length - 1], de_la = mand ? mand[1] : "0000";
    var colegi = partid ? (V.consilieri || []).filter(function (x) { var k = compDe(x.id); return x.id !== c.id && k && k.partid === partid && !k.iesit; }) : [];
    var sep = { singur: 0, cu: 0, ex: [] };
    voturi.forEach(function (x, j) {
      if (x.d < de_la || "IAN".indexOf(x.c) < 0) return;
      var i = x.s.voturi.indexOf(x.v) + 1, cu = colegi.filter(function (k) { var cd = k.cod && k.cod[x.d]; return cd && cd[i] === x.c; });
      if (cu.length) sep.cu++; else { sep.singur++; if (sep.ex.length < 12) sep.ex.push(x); }
    });
    var tem = TEME_VOT.map(function (t) { var L = voturi.filter(function (x) { return x.c !== "X" && x.c !== "?" && t[1].test(norm((x.v.titlu || "").slice(0, 400))); });
      return { t: t[0], n: L.length, P: L.filter(function (x) { return x.c === "P"; }).length, I: L.filter(function (x) { return x.c === "I"; }).length, A: L.filter(function (x) { return x.c === "A"; }).length, N: L.filter(function (x) { return x.c === "N"; }).length }; })
      .filter(function (x) { return x.n; });
    var h = "";
    if (partid && sep.singur + sep.cu) h += '<section class="card section"><h2>Față de colegii de partid</h2><p class="note">În mandatul în curs, ori de câte ori a votat împotrivă, s-a abținut sau nu a votat: a făcut-o împreună cu cel puțin un coleg de la ' + esc(partid) +
      ' sau singur din grupul său. Procesele-verbale numesc doar pe cei care nu votează „pentru”, deci numărăm doar aceste voturi.</p><div class="grid">' +
      tile("Cu colegii de partid", nr(sep.cu), sep.cu === 1 ? "vot" : "voturi", "") + tile("Singur din " + partid, nr(sep.singur), sep.singur === 1 ? "vot" : "voturi", "") + "</div>" +
      (sep.ex.length ? '<details class="nota-d"><summary><b>Când a votat altfel decât colegii lui</b></summary>' + sep.ex.map(function (x) { var K = VCOD[x.c];
        return '<div class="doc"><div class="h"><span class="rz ' + K[1] + '">' + esc(K[2]) + "</span>" + linkSed(x.d, x.s.tip) + (x.v.hcl ? linkHcl(x.v.hcl) : "") + '</div><div class="t">' + esc((x.v.titlu || "proiect neidentificat").slice(0, 200)) + "</div></div>"; }).join("") + "</details>" : "") + "</section>";
    if (tem.length) h += '<section class="card section"><h2>Pe teme</h2><p class="note">Voturile cunoscute, după titlul proiectului. „Pentru” e dedus doar în ședințele în care știm sigur cine a fost în sală.</p><div class="tw"><table><thead><tr><th>Tema</th><th class="n">Voturi</th><th class="n">Pentru (dedus)</th><th class="n">Împotrivă</th><th class="n">Abțineri</th><th class="n">Nu a votat</th></tr></thead><tbody>' +
      tem.map(function (x) { return "<tr><td>" + esc(x.t) + '</td><td class="n">' + x.n + '</td><td class="n">' + x.P + '</td><td class="n">' + (x.I ? "<b>" + x.I + "</b>" : 0) + '</td><td class="n">' + (x.A ? "<b>" + x.A + "</b>" : 0) + '</td><td class="n">' + x.N + "</td></tr>"; }).join("") + "</tbody></table></div></section>";
    return h;
  }
  function consInterventii(c) {
    var tok = norm(c.nume).split(/[\s-]+/).filter(function (w) { return w.length >= 4; });
    var al = function (cine) { var t = " " + norm(cine).replace(/[^a-z ]/g, " ") + " "; return tok.some(function (w) { return t.indexOf(" " + w + " ") >= 0; }); };
    var L = [];
    (REZ || []).forEach(function (x) { ((x.rezumat || {}).puncte || []).forEach(function (p) { (p.interventii || []).forEach(function (i) { if (i.cine && al(i.cine)) L.push({ d: x.data, p: p, i: i, v: x.video }); }); }); });
    if (!L.length) return "";
    L.sort(function (a, b) { return b.d.localeCompare(a.d); });
    return '<section class="card section"><h2>Ce a spus în ședințe <span class="nr-b n">' + L.length + '</span></h2><p class="note">Din rezumatele ședințelor scrise de Rădăuțiul Civic din înregistrări. Minutul arată momentul din înregistrare.</p>' +
      L.slice(0, 40).map(function (x) { return '<div class="doc"><div class="h"><a href="#consiliu/sedinte/' + esc(x.d) + '">Ședința din ' + esc(zi(x.d)) + "</a>" + (x.i.minut ? ' <span class="rz-min">' + esc(x.i.minut) + "</span>" : "") +
        (x.v && safeUrl(x.v) ? ' <a class="lk" href="' + esc(safeUrl(x.v)) + '" rel="noopener">înregistrarea</a>' : "") + '</div><div class="t">' + esc(x.p.titlu || "") + '</div><div class="m"><span>' + esc(x.i.ce || "") + "</span></div></div>"; }).join("") + "</section>";
  }
  function consilierProfil(el, r, id) {
    el.innerHTML = head("Consilier local", "", r) + '<p class="updated">Se încarcă...</p>';
    if (!COMP) { incarcaComp().then(function () { consilierProfil(el, r, id); }); return; }
    if (!TEME) { incarcaTeme().then(function () { consilierProfil(el, r, id); }); return; }
    if (!REZ) { incarcaRez().then(function () { consilierProfil(el, r, id); }); return; }
    voturiIntern2(function (V) {
      var c = (V.consilieri || []).filter(function (x) { return x.id === id; })[0];
      var inapoi = '<p class="back"><a href="#consiliu/consilieri">← Toți consilierii</a></p>';
      if (!c) { el.innerHTML = head("Consilier local", "", r) + inapoi + '<section class="card section"><p class="empty">Consilierul nu a fost găsit.</p></section>'; return; }
      var sed = {}; (V.sedinte || []).forEach(function (s) { sed[s.data] = s; });
      var st = statCons(c, "0000", "9999"), ani = {}, voturi = [], abs = [];
      Object.keys(c.cod).sort().reverse().forEach(function (d) {
        var cod = c.cod[d], s = sed[d] || { voturi: [] }, a = d.slice(0, 4);
        ani[a] = ani[a] || { s: 0, X: 0, I: 0, A: 0, N: 0, P: 0 }; ani[a].s++;
        if (cod[0] === "X") { ani[a].X++; abs.push(s); }
        for (var i = 1; i < cod.length; i++) { var v = s.voturi[i - 1]; if (!v) continue; if (cod[i] !== "X") ani[a][cod[i]] = (ani[a][cod[i]] || 0) + 1; voturi.push({ d: d, s: s, v: v, c: cod[i] }); }
      });
      var altfel = voturi.filter(function (x) { return x.c === "I" || x.c === "A" || x.c === "N"; });
      var vItem = function (x) {
        var K = VCOD[x.c];
        return '<div class="doc"><div class="h"><span class="rz ' + K[1] + '">' + esc(K[2]) + "</span>" + linkSed(x.d, x.s.tip) + (x.v.hcl ? linkHcl(x.v.hcl) : "") +
          '</div><div class="t">' + (x.v.punct ? "Punctul " + x.v.punct + ": " : "") + esc((x.v.titlu || "proiect neidentificat").slice(0, 240)) + '</div><div class="m"><span>' + votHtml(x.v) + "</span></div></div>";
      };
      el.innerHTML = head(c.nume, "Consilier local" + (c.mandate.length ? (c.mandate.length === 1 ? ", mandatul " : ", mandatele ") + c.mandate.join(", ") : "") + ". În consiliu: " + c.perioade.map(function (p) { return zi(p[0]) + " - " + zi(p[1]); }).join("; ") + ".", r, compDe(c.id) && !compDe(c.id).iesit ? ["consilier-" + c.id, c.nume + ", consilier local în Rădăuți"] : null) + inapoi +
        (compDe(c.id) ? '<section class="card section cs-prof">' + avatar(compDe(c.id), c.nume, true) + '<div><b>' + esc(compDe(c.id).partid || "Consilier local") + "</b>" +
          '<div class="cs-d">' + (compDe(c.id).iesit ? '<span class="warn-t">Nu mai e consilier local. ' + esc(compDe(c.id).iesit.text || "") + "</span>" : "") +
          (INTERN ? (declaratii(compDe(c.id)) || '<span class="muted">Declarațiile nu sunt pe pagina primăriei.</span>') + ' <a href="#declaratii">analiza declarațiilor</a>' : "") + "</div></div></section>" : "") +
        ((c.evenimente || []).length ? '<p class="note">' + c.evenimente.map(function (e) { return e.hcl ? (e.fel === "validare" ? "Mandat validat" : "Mandat încetat") + " prin " + linkHcl(e.hcl) + " din " + esc(zi(e.data)) : (e.fel === "validare" ? "A depus jurământul în " : "Mandat încetat în ") + linkSed(e.data, null); }).join(" · ") + ".</p>" : "") +
        '<div class="grid">' + tile("Prezență", pctPrez(st), "", nr(st.sedinte - st.absent) + " din " + nr(st.sedinte) + " ședințe fără absență în procesul-verbal") +
        tile("Voturi împotrivă", nr(st.I), "", "") + tile("Abțineri", nr(st.A), "", "") + tile("Nu a votat", nr(st.N), "", "conflict de interese sau a ieșit din sală") + "</div>" +
        (function () {
          var ani_ = Object.keys(ani).sort(), Mv = mandateDin(V), mand = Mv.filter(function (m) { return c.mandate.indexOf(m[0]) >= 0; }).pop();
          if (!ani_.length || !areNota(V)) return "";
          var NA = ani_.map(function (a) { return { a: a, n: notaCons(V, c, a, String(+a + 1)) }; }).filter(function (x) { return x.n.sedinte; });
          var NM = mand ? notaCons(V, c, mand[1], mand[2]) : null;
          var sedL = function (d) { return '<a href="#consiliu/sedinte/' + esc(d) + '">' + esc(zi(d)) + "</a>"; };
          var intD = Object.keys(c.interventii || {}).sort().reverse();
          return '<section class="card section"><h2>Scorul de activitate</h2>' +
            (NM ? '<p class="note">În mandatul ' + esc(mand[0]) + ", până acum:</p>" + scalaNota(NM.nota) +
              '<div class="grid nota-g">' + tile("Prezență", pctN(NM.P), "", (NM.sedinte - NM.abs) + " din " + NM.sedinte + " ședințe fără absență în procesul-verbal") +
              tile("Intervenții", pctN(NM.INT), "din ședințe", "a luat cuvântul în " + NM.cuInt + " din " + NM.neAbs + " ședințe (" + NM.nInt + " intervenții)") +
              tile("Proiecte inițiate", nr(NM.init.length), "", NM.norma ? "norma pe consilier în perioadă: " + dec(NM.norma.toFixed(0)) : "") +
              tile("Raport de activitate", dec(NM.CR.toFixed(1)), "din 2", NM.crEstimat ? "fără an încheiat de evaluat" : "în medie pe anii încheiați") + "</div>" : "") +
            (NA.length > 1 ? '<h3 class="an-h">Scorul pe ani</h3><div class="chart" id="cp-nota"></div>' : "") +
            '<div class="tw"><table><thead><tr><th>An</th><th class="n">Scor activitate</th><th class="n">Prezență</th><th class="n">Ședințe cu intervenții</th><th class="n">Proiecte inițiate</th><th class="n">Raport</th></tr></thead><tbody>' +
            NA.slice().reverse().map(function (x) { var n = x.n, cr = (perfManual().calitate_rapoarte || {})[c.id];
              return "<tr><td>" + x.a + (x.a >= AN_CURENT ? ' <small class="muted">(în curs)</small>' : "") + '</td><td class="n"><span class="nota-p" style="background:' + culoareNota(n.nota) + '">' + dec(n.nota.toFixed(1)) + '</span></td><td class="n">' + pctN(n.P) + '</td><td class="n">' + n.cuInt + " / " + n.neAbs +
                '</td><td class="n">' + n.init.length + (n.norma ? ' <small class="muted">/ ' + dec(n.norma.toFixed(0)) + "</small>" : "") + '</td><td class="n">' + (x.a >= AN_CURENT && !(cr && cr[x.a] != null) ? '<span class="muted">se depune anul viitor</span>' : n.CR >= 2 ? "detaliat" : n.CR >= 1 ? "publicat" : "lipsă") + "</td></tr>"; }).join("") +
            "</tbody></table></div>" +
            (c.initiative && c.initiative.length ? '<h3 class="an-h">Proiecte inițiate <span class="nr-b n">' + c.initiative.length + "</span></h3>" + '<ul class="nota-li">' + c.initiative.map(function (x) { return "<li>" + sedL(x[0]) + ": " + esc(x[1]) + "...</li>"; }).join("") + "</ul>" : "") +
            (intD.length ? '<details class="nota-d"><summary><b>Ședințele în care a luat cuvântul</b> <span class="nr-b n">' + intD.length + '</span></summary><p class="note">În paranteză, de câte ori, după procesul-verbal.</p><div class="lnks">' + intD.map(function (d) { return '<a href="#consiliu/sedinte/' + esc(d) + '">' + esc(zi(d)) + " <small>(" + c.interventii[d] + ")</small></a>"; }).join("") + "</div></details>" : "") +
            METODA_NOTA + "</section>";
        })() +
        consGrupTeme(V, c, voturi) + consInterventii(c) +
        '<section class="card section"><h2>Pe ani</h2><p class="note">„Pentru (dedus)” e votul unui consilier prezent care nu e numit printre cei care au votat altfel; îl socotim doar în ședințele în care știm sigur cine a fost în sală.</p>' +
        '<div class="tw"><table><thead><tr><th>An</th><th class="n">Ședințe</th><th class="n">Absent</th><th class="n">Împotrivă</th><th class="n">Abțineri</th><th class="n">Nu a votat</th><th class="n">Pentru (dedus)</th></tr></thead><tbody>' +
        Object.keys(ani).sort().reverse().map(function (a) { var x = ani[a]; return "<tr><td>" + a + '</td><td class="n">' + x.s + '</td><td class="n">' + x.X + '</td><td class="n">' + x.I + '</td><td class="n">' + x.A + '</td><td class="n">' + x.N + '</td><td class="n">' + x.P + "</td></tr>"; }).join("") +
        "</tbody></table></div></section>" +
        (altfel.length ? '<section class="card section"><h2>Când a votat altfel decât „pentru”</h2>' + altfel.slice(0, 60).map(vItem).join("") + (altfel.length > 60 ? '<p class="note">Și încă ' + (altfel.length - 60) + "; toate sunt mai jos.</p>" : "") + "</section>" : "") +
        (abs.length ? '<section class="card section"><h2>Absențe</h2><div class="lnks">' + abs.map(function (s) { return linkSed(s.data, s.tip); }).join("") + "</div></section>" : "") +
        (function () { var RA = rapoarteCons(c); return RA.length ? '<section class="card section"><h2>Rapoarte de activitate <span class="nr-b n">' + RA.length + "</span></h2>" +
          '<p class="note">Rapoartele anuale pe care consilierul le-a depus, publicate de primărie.</p>' + RA.map(function (x) {
            return '<div class="doc"><div class="h">' + (x.an ? '<span class="id"' + (x.an_estimat ? ' title="an dedus din data încărcării: raportul se depune la începutul anului următor"' : "") + ">" + esc(x.an) + (x.an_estimat ? " (estimat)" : "") + "</span>" : "") + '<a class="lk" href="' + esc(safeUrl(x.url) || "#") + '" rel="noopener">PDF</a></div><div class="t">' + esc(x.titlu) + "</div></div>"; }).join("") + "</section>" : ""; })() +
        '<section class="card section"><h2>Toate voturile</h2><div id="cp-l"></div></section>';
      if ($("cp-nota")) { var NA2 = Object.keys(ani).sort().map(function (a) { return { a: a, n: notaCons(V, c, a, String(+a + 1)) }; }).filter(function (x) { return x.n.sedinte; });
        chart($("cp-nota"), { cats: NA2.map(function (x) { return x.a; }), series: [], h: 170, label: "Scorul de activitate pe ani", line: { color: "var(--c1)", values: NA2.map(function (x) { return x.n.nota; }) },
          tooltip: function (i) { var n = NA2[i].n; return "<b>" + NA2[i].a + "</b>: scor " + dec(n.nota.toFixed(2)) + "<br>prezență " + pctN(n.P) + ", intervenții în " + n.cuInt + "/" + n.neAbs + " ședințe, " + n.init.length + " proiecte inițiate"; } }); }
      lista($("cp-l"), voturi, { placeholder: "Caută în titlurile proiectelor (ex. buget, teren, taxe)", unitate: ["vot", "voturi"],
        an: function (x) { return x.d.slice(0, 4); }, text: function (x) { return (x.v.titlu || "") + (x.v.hcl ? " hcl " + x.v.hcl.nr + "/" + x.v.hcl.an : ""); },
        extraFilter: { html: '<select aria-label="Votul"><option value="">Orice vot</option>' + Object.keys(VCOD).map(function (k) { return '<option value="' + k + '">' + VCOD[k][2] + "</option>"; }).join("") + "</select>", test: function (x, e) { return x.c === e; } },
        item: vItem });
    });
  }

  // ---------- Consiliul Local: rapoartele comisiilor de specialitate, ale viceprimarilor și ale consilierilor ----------
  function rapoarteConsiliu(el, r) {
    var cap = head("Consiliul Local", "Rapoartele de activitate ale comisiilor de specialitate, ale viceprimarilor și ale consilierilor locali, publicate de primărie.", r);
    if (!TEME) { el.innerHTML = cap + '<p class="updated">Se încarcă...</p>'; incarcaTeme().then(render); return; }
    if (!COMP) { incarcaComp().then(render); return; }
    var D = (TEME.rapoarte || {}), L2 = D.lista || [], fel = D.feluri || {};
    var tok = function (n) { return norm(n || "").replace(/[^a-z ]+/g, " ").split(/\s+/).filter(function (w) { return w.length > 1; }); };
    var cons = (COMP.consilieri || []).filter(function (x) { return x.id; }).map(function (x) { return { id: x.id, nume: x.nume, t: tok(x.nume) }; });
    var cine = function (titlu) { var t = " " + tok(titlu).join(" ") + " "; return cons.filter(function (c) { return c.t.length >= 2 && c.t.every(function (w) { return t.indexOf(" " + w + " ") >= 0; }); })[0]; };
    var item = function (x) { var c = x.fel === "consilieri" ? cine(x.titlu) : null;
      return '<div class="doc"><div class="h">' + (x.an ? '<span class="id"' + (x.an_estimat ? ' title="an dedus din data încărcării: raportul se depune la începutul anului următor"' : "") + ">" + esc(x.an) + (x.an_estimat ? " (estimat)" : "") + "</span>" : "") + '<a class="lk" href="' + esc(safeUrl(x.url) || "#") + '" rel="noopener">PDF</a>' +
        (safeUrl(x.pagina) ? '<a class="lk" href="' + esc(x.pagina) + '" rel="noopener">pagina</a>' : "") + (c ? '<a class="lk" href="#consiliu/consilieri/' + encodeURIComponent(c.id) + '">fișa consilierului</a>' : "") + '</div><div class="t">' + esc(x.titlu) + "</div></div>"; };
    var sec = function (k, nota) {
      var X = L2.filter(function (x) { return x.fel === k; }).sort(function (a, b) { return (b.an || "0").localeCompare(a.an || "0"); });
      if (!X.length) return "";
      var ani = []; X.forEach(function (x) { var a = x.an || "fără an"; if (ani.indexOf(a) < 0) ani.push(a); });
      return '<section class="card section"><h2>' + esc(fel[k] || k) + ' <span class="nr-b n">' + X.length + "</span></h2>" + (nota ? '<p class="note">' + nota + "</p>" : "") +
        ani.map(function (a, i) { var Y = X.filter(function (x) { return (x.an || "fără an") === a; });
          return '<details class="rp-an"' + (i < 2 ? " open" : "") + "><summary><b>" + esc(a) + '</b> <span class="muted">' + Y.length + (Y.length === 1 ? " raport" : " rapoarte") + "</span></summary>" + Y.map(item).join("") + "</details>"; }).join("") + "</section>";
    };
    el.innerHTML = cap + (L2.length ? sec("comisii", "Comisiile de specialitate avizează proiectele de hotărâre înainte de vot (economică și buget, urbanism, social-cultural și învățământ, administrație publică și juridică). Rapoartele lor anuale arată ce au discutat și avizat.") +
      sec("viceprimar", "") + sec("consilieri", "Raportul anual de activitate e obligatoriu pentru fiecare consilier local (Codul administrativ, art. 225). Rapoartele sunt și pe fișa fiecărui consilier, unde intră în scorul de activitate.") :
      '<section class="card section"><p class="empty">Rapoartele apar după următoarea colectare.</p></section>');
  }
  // ---------- Pagini de detaliu: o hotărâre, o ședință ----------
  function linkHcl(x) { return '<a href="#consiliu/hcl/' + x.an + "/" + x.nr + '">HCL ' + x.nr + "/" + x.an + "</a>"; }
  function linkSed(data, tip) { return '<a href="#consiliu/sedinte/' + esc(data) + '">Ședința ' + esc(TIP[tip] || "") + " din " + esc(zi(data)) + "</a>"; }
  function zileIntre(a, b) { return Math.round((new Date(b) - new Date(a)) / 864e5); }
  function cuvinte(t) { var o = {}; (norm(t).match(/[a-z]{5,}/g) || []).forEach(function (w) { if (!/^(privind|pentru|aprobarea|hotarare|municipiului|radauti|local|consiliul|proiect)/.test(w)) o[w] = 1; }); return o; }
  function asemanare(a, b) { var A = cuvinte(a), B = cuvinte(b), c = 0, n = 0, k; for (k in A) { n++; if (B[k]) c++; } for (k in B) if (!A[k]) n++; return n ? c / n : 0; }
  var VOT = undefined;
  var COMP = null;
  function incarcaComp() { return COMP ? Promise.resolve(COMP) : get(DATA + "componenta.json").then(function (d) { COMP = d; return d; }).catch(function () { COMP = { consilieri: [] }; return COMP; }); }
  function compDe(id) { return id ? ((COMP || {}).consilieri || []).filter(function (x) { return x.id === id; })[0] : null; }
  function initiale(n) { return (n || "").split(/[\s-]+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0); }).join("").toUpperCase(); }
  function avatar(x, nume, mare, faraSigla) {
    return '<span class="av' + (mare ? " mare" : "") + '">' + (x && x.foto ? '<img src="' + FTDATA + esc(x.foto) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<i>' + esc(initiale(nume)) + '</i>\'">' : "<i>" + esc(initiale(nume)) + "</i>") +
      (x && x.sigla && !faraSigla ? '<img class="av-p" src="' + FTDATA + esc(x.sigla) + '" alt="' + esc(x.partid || "partid") + '" title="' + esc(x.partid || "") + '" loading="lazy" onerror="this.remove()">' : "") + "</span>";
  }
  function declaratii(x) {
    if (!x) return "";
    var f = function (l, t) { return l.length ? '<span class="dc"><b>' + t + ":</b> " + l.map(function (d) { return '<a class="lk" href="' + esc(safeUrl(d.url) || "#") + '" rel="noopener">' + esc(d.text.replace(/^declarat(ie|ia)\s*/i, "") || "PDF") + "</a>"; }).join(" ") + "</span>" : ""; };
    return f(x.avere || [], "Avere") + f(x.interese || [], "Interese");
  }
  function voturiIntern2(cb) {
    if (VOT !== undefined) { if (VOT) cb(VOT); return; }
    get(DATA + "voturi.json").then(function (d) { VOT = d; cb(d); }).catch(function () { VOT = null; });
  }
  function votHtml(v) {
    return (v.unanimitate ? "unanimitate" : "pentru " + (v.pentru == null ? "?" : v.pentru) + ", împotrivă " + v.impotriva + ", abțineri " + v.abtineri + (v.nu_voteaza ? ", nu votează " + v.nu_voteaza : "")) +
      (v.rezultat ? " · " + esc(v.rezultat) : "") + (v.nume_impotriva.length ? " · împotrivă: " + esc(v.nume_impotriva.join(", ")) : "") + (v.nume_abtineri.length ? " · abțineri: " + esc(v.nume_abtineri.join(", ")) : "") +
      ((v.nume_nu_voteaza || []).length ? " · nu au votat: " + esc(v.nume_nu_voteaza.join(", ")) : "") + (v.consistent === false ? ' <span class="tag">cifre de verificat</span>' : "");
  }

  // drumul unei hotărâri: proiect publicat -> termen de propuneri -> ședința convocată -> votată -> publicată pe site
  function drum(pasi) {
    pasi = pasi.filter(function (p) { return p && p.d; }).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    if (pasi.length < 2) return "";
    return '<section class="card section"><h2>Drumul hotărârii</h2><ol class="drum">' + pasi.map(function (p, i) {
      var z = i ? zileIntre(pasi[i - 1].d, p.d) : null;
      return '<li class="' + (p.cls || "") + '">' + (z != null ? '<span class="dz">' + (z === 0 ? "aceeași zi" : "după " + z + " " + zile(z)) + "</span>" : '<span class="dz"></span>') +
        '<i class="dot"></i><b>' + esc(p.t) + "</b><span>" + esc(zi(p.d)) + "</span>" + (p.n ? '<span class="muted">' + p.n + "</span>" : "") + "</li>";
    }).join("") + "</ol></section>";
  }
  function hclDetaliu(el, r, an, nr) {
    if (!SED) { incarcaSed().then(function () { hclDetaliu(el, r, an, nr); }); }
    var H = L.hcl || [], x = H.filter(function (h) { return String(h.an) === an && String(h.nr) === nr; })[0];
    var inapoi = '<p class="back"><a href="#consiliu/hcl">← Toate hotărârile</a></p>';
    if (!x) { el.innerHTML = head("Consiliul Local", "", r) + inapoi + '<section class="card section"><p class="empty">Hotărârea ' + esc(nr) + "/" + esc(an) + " nu apare în listele publicate de primărie.</p></section>"; return; }
    var sed = (L.pv || []).filter(function (p) { return p.data === x.data; })[0];
    // hotărâri care o menționează în titlu (o modifică, o completează, o abrogă)
    var rx = new RegExp("\\bnr\\.?\\s*" + nr + "\\s*(/|din)\\s*(\\d{1,2}[./]\\d{1,2}[./])?\\s*" + an + "\\b");
    var ment = H.filter(function (h) { return h !== x && +h.an >= +an && rx.test(norm(h.titlu)); });
    var aceeasi = x.data ? H.filter(function (h) { return h !== x && h.data === x.data; }) : [];
    var proiect = (L.proiecte || []).map(function (p) { return { p: p, s: asemanare(p.titlu, x.titlu) }; }).filter(function (o) { return o.s >= 0.5 && (!x.data || ((o.p.postat || "") <= x.data && zileIntre(o.p.postat, x.data) <= 183)); }).sort(function (a, b) { return b.s - a.s; })[0];
    var rows = [["Adoptată", x.data ? esc(zi(x.data)) : "-"], ["Ședința", sed ? linkSed(sed.data, sed.tip) : (x.data ? ("procesul-verbal din " + esc(zi(x.data)) + " nu e publicat") : "-")],
      ["Publicată pe site", x.postat ? esc(zi(x.postat)) + (x.data ? " (după " + zileIntre(x.data, x.postat) + " zile)" : "") : (x.sursa === "arhiva" ? "în arhiva site-ului vechi" : "-")],
      ["Documentul", '<span class="lnks">' + (linkuri(x) || "nepublicat") + "</span>"]];
    if (proiect) rows.push(["Proiectul de hotărâre", '<a href="' + esc(safeUrl(proiect.p.pdf) || safeUrl(proiect.p.pagina) || "#") + '" rel="noopener">' + esc(proiect.p.titlu) + "</a>" + (proiect.p.postat ? " (publicat " + esc(zi(proiect.p.postat)) + ")" : "")]);
    var h = head("HCL " + x.nr + "/" + x.an, esc(x.titlu), r, ["hcl-" + x.an + "-" + x.nr, "HCL " + x.nr + "/" + x.an + ": " + x.titlu]) + inapoi +
      '<section class="card section"><div class="tw"><table><tbody>' + rows.map(function (p) { return "<tr><th>" + p[0] + "</th><td>" + p[1] + "</td></tr>"; }).join("") + "</tbody></table></div></section>" +
      drum([proiect && proiect.p.postat ? { t: "Proiectul publicat", d: proiect.p.postat } : null,
        (function () { var c = SED && (SED.consultare || []).filter(function (q) { return q.adoptat && q.adoptat.nr == x.nr && q.adoptat.an == x.an; })[0]; return c && c.termen ? { t: "Termenul pentru propuneri", d: c.termen } : null; })(),
        (function () { var c = SED && (SED.recente || []).filter(function (q) { return q.data === x.data; })[0]; return c && c.postat ? { t: "Ședința convocată", d: c.postat } : null; })(),
        x.data ? { t: "Adoptată în ședință", d: x.data, cls: "c" } : null,
        x.postat ? { t: "Publicată pe site", d: x.postat, cls: x.data && zileIntre(x.data, x.postat) > 30 ? "par" : "", n: x.data && zileIntre(x.data, x.postat) > 30 ? "peste 30 de zile de la adoptare" : "" } : null]) +
      '<div id="hd-vot"></div>' +
      (ment.length ? '<section class="card section"><h2>Hotărâri care o menționează</h2><p class="note">Hotărâri ulterioare care o modifică, o completează sau o abrogă, după titlu.</p>' +
        ment.map(function (h) { return doc(linkHcl(h), h.titlu, h.data ? "adoptată " + zi(h.data) : "", h); }).join("") + "</section>" : "") +
      '<div id="hd-lit"></div>' +
      (aceeasi.length ? '<section class="card section"><h2>Adoptate în aceeași ședință</h2>' + aceeasi.map(function (h) { return doc(linkHcl(h), h.titlu, "", h); }).join("") + "</section>" : "");
    el.innerHTML = h;
    voturiIntern2(function (V) {
      var gas = [];
      (V.sedinte || []).forEach(function (s) { (s.voturi || []).forEach(function (v) { if (v.hcl && String(v.hcl.an) === an && String(v.hcl.nr) === nr) gas.push(v); }); });
      if (gas.length && $("hd-vot")) $("hd-vot").innerHTML = '<section class="card section"><h2>Votul (citit automat din procesul-verbal)</h2>' + gas.map(function (v) { return '<p class="note">' + votHtml(v) + "</p>"; }).join("") + "</section>";
    });
    var cauta = function () {
      var rl = new RegExp("\\b(hcl|hotararea|hotararii)[^0-9]{0,25}\\b" + nr + "\\s*(/|din)\\s*(\\d{1,2}[./]\\d{1,2}[./])?\\s*" + an + "\\b");
      var D = (LIT && LIT.dosare || []).filter(function (d) { return rl.test(norm(d.obiect)); });
      if (D.length && $("hd-lit")) $("hd-lit").innerHTML = '<section class="card section"><h2>Litigii în care apare</h2>' + D.map(function (d) {
        return '<div class="doc"><div class="h"><span class="id"><a href="#litigii/dosare?v=fise&q=' + encodeURIComponent(d.numar) + '">' + esc(d.numar) + "</a></span>" + rzTag(d) + "</div><div class=\"t\">" + esc(d.obiect) + "</div></div>"; }).join("") + "</section>";
    };
    if (!INTERN) return;   // litigiile sunt doar în versiunea internă
    if (LIT) cauta(); else get(DATA + "litigii.json").then(function (d) { LIT = LIT || d; cauta(); }).catch(function () {});
  }

  function sedintaDetaliu(el, r, data) {
    var P = (L.pv || []).filter(function (p) { return p.data === data; }), H = (L.hcl || []).filter(function (h) { return h.data === data; }).sort(function (a, b) { return a.nr - b.nr; });
    var toate = (L.pv || []).map(function (p) { return p.data; }).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
    var i = toate.indexOf(data), prev = toate[i - 1], next = toate[i + 1];
    var tip = (P[0] || {}).tip;
    var h = head("Ședința " + (TIP[tip] || "") + " din " + zi(data), "Consiliul Local al Municipiului Rădăuți.", r, ["sedinta-" + data, "Ședința Consiliului Local Rădăuți din " + zi(data)]) +
      '<p class="back"><a href="#consiliu/sedinte">← Toate ședințele</a>' + (prev ? ' · <a href="#consiliu/sedinte/' + prev + '">ședința anterioară</a>' : "") + (next ? ' · <a href="#consiliu/sedinte/' + next + '">ședința următoare</a>' : "") + "</p>" +
      '<div class="grid">' + tile("Hotărâri adoptate", nr(H.length), "", H.length ? "HCL " + H[0].nr + (H.length > 1 ? " - " + H[H.length - 1].nr : "") + "/" + data.slice(0, 4) : "nicio hotărâre cu această dată în listele publicate") +
      tile("Procesul-verbal", P.length ? "publicat" : "lipsește", "", P[0] && P[0].postat ? "postat " + zi(P[0].postat) + " (după " + zileIntre(data, P[0].postat) + " zile)" : "") + "</div>" +
      '<div id="sd-rez"></div>' + (P.length ? '<section class="card section"><h2>Procesul-verbal</h2>' + P.map(function (p) { return doc(esc(TIP[p.tip] || "Ședință"), p.titlu, p.postat ? "postat " + zi(p.postat) : "", p); }).join("") + "</section>" : "") +
      '<div id="sd-vot"></div>' +
      '<section class="card section"><h2>Hotărârile adoptate</h2>' + (H.map(function (x) { return doc(linkHcl(x), x.titlu, x.postat ? "postată " + zi(x.postat) : "", x); }).join("") || '<p class="empty">Nicio hotărâre cu această dată în listele publicate.</p>') + "</section>";
    el.innerHTML = h;
    incarcaRez().then(function () {
      // o ședință transmisă în mai multe înregistrări (ex. după o pauză) are câte un rezumat pentru fiecare parte
      var xs = (REZ || []).filter(function (x) { return x.data === data; }).sort(function (p, q) { return (p.aprobat_la || "").localeCompare(q.aprobat_la || ""); });
      if (xs.length && $("sd-rez")) $("sd-rez").innerHTML = '<section class="card section"><h2>Rezumatul ședinței</h2>' + xs.map(function (x, i) {
        return (xs.length > 1 ? '<h3 class="an-h">Partea ' + (i + 1) + (x.titlu_video ? ": " + esc(x.titlu_video) : "") + "</h3>" : "") + rezumatHtml(x); }).join("") + "</section>";
    });
    voturiIntern2(function (V) {
      var s = (V.sedinte || []).filter(function (x) { return x.data === data; })[0];
      if (s && s.voturi.length && $("sd-vot")) $("sd-vot").innerHTML = '<section class="card section"><h2>Voturile (citite automat din procesul-verbal)</h2>' +
        ((s.absenti || []).length ? '<p class="note">Prezenți ' + s.prezenti + (s.in_functie ? " din " + s.in_functie : "") + ". Absenți: " + s.absenti.map(function (n) { return linkCons(V, n); }).join(", ") + ".</p>" : "") +
        (s.presedinte ? '<p class="note">Președinte de ședință: ' + linkCons(V, s.presedinte) + ".</p>" : "") + s.voturi.map(function (v) {
        return '<div class="m" style="display:block;margin:6px 0"><strong>' + (v.punct ? "Punctul " + v.punct + ": " : "") + "</strong>" + esc((v.titlu || "proiect neidentificat").slice(0, 200)) +
          (v.hcl ? " " + linkHcl(v.hcl) : "") + "<br>" + votHtml(v) + "</div>"; }).join("") + postBox(postDupa(data, s, H, V), "Text gata de postat: cum s-a votat") + "</section>";
    });
  }

  // ---------- Rezumatele ședințelor (AI, aprobate de echipă) ----------
  var REZ = null;
  function incarcaRez() { return REZ ? Promise.resolve(REZ) : get(FTDATA + "rezumate.json").then(function (d) { REZ = d.rezumate || []; return REZ; }).catch(function () { REZ = []; return REZ; }); }
  var VOT_CLS = { adoptat: "c", respins: "p", "amânat": "par", retras: "n" };
  function rezumatHtml(x, compact) {
    var R = x.rezumat || {}, v = safeUrl(x.video);
    var min = function (m) { return m ? '<span class="rz-min">' + esc(m) + "</span>" : ""; };
    return '<div class="rzm">' + (R.rezumat ? '<p class="rzm-sum">' + esc(R.rezumat) + "</p>" : "") +
      (compact ? "" : (R.puncte || []).map(function (p) {
        var vot = p.vot || {};
        return '<div class="rzm-p"><div class="rzm-h"><b>' + (p.nr != null ? esc(p.nr) + ". " : "") + esc(p.titlu || "") + "</b>" + min(p.minut) +
          (vot.rezultat ? ' <span class="rz ' + (VOT_CLS[vot.rezultat] || "n") + '">' + esc(vot.rezultat) + "</span>" : "") + (p.hcl ? ' <a href="#consiliu/hcl/' + esc(String(p.hcl).split("/")[1]) + "/" + esc(String(p.hcl).split("/")[0]) + '">HCL ' + esc(p.hcl) + "</a>" : "") + "</div>" +
          (p.pe_scurt ? "<p>" + esc(p.pe_scurt) + "</p>" : "") + (p.discutie ? '<p class="muted2">' + esc(p.discutie) + "</p>" : "") +
          ((p.interventii || []).length ? "<ul>" + p.interventii.map(function (i) { return "<li>" + min(i.minut) + " <b>" + esc(i.cine || "") + ":</b> " + esc(i.ce || "") + "</li>"; }).join("") + "</ul>" : "") +
          (vot.detalii ? '<p class="note">Vot: ' + esc(vot.detalii) + (vot.sursa ? " (sursa: " + esc(vot.sursa) + ")" : "") + "</p>" : "") + "</div>";
      }).join("") +
      ((R.alte_subiecte || []).length ? '<div class="rzm-p"><div class="rzm-h"><b>Alte subiecte</b></div><ul>' + R.alte_subiecte.map(function (a) { return "<li>" + min(a.minut) + " " + esc(a.ce || "") + "</li>"; }).join("") + "</ul></div>" : "")) +
      '<p class="note">Rezumat realizat automat (transcriere Whisper, redactare cu un model AI) din înregistrarea ședinței' + (x.titlu_video ? " „" + esc(x.titlu_video) + "”" : "") +
      ", ordinea de zi și documentele primăriei, apoi citit și aprobat de echipa monitorului" + (x.aprobat_la ? " pe " + esc(zi(x.aprobat_la)) : "") + ". Minutele arată momentul din înregistrare în care începe discuția. " +
      (v ? '<a href="' + esc(v) + '" rel="noopener">Înregistrarea ședinței</a>.' : "") + "</p></div>";
  }
  function rezPentru(data) { return (REZ || []).filter(function (x) { return x.data === data; })[0]; }

  // ---------- Panoul intern: înregistrări, ciorne, aprobare ----------
  var API = "api.php";
  function apiPost(o) {
    return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o), credentials: "same-origin" })
      .then(function (x) { return x.json().then(function (d) { if (!x.ok || d.eroare) throw new Error(d.eroare || ("HTTP " + x.status)); return d; }); });
  }
  // ---------- Despre: cine face monitorul, de unde vin datele, formularul de contact ----------
  function despre(el) {
    var S = [["https://primariaradauti.ro", "Site-ul Primăriei Municipiului Rădăuți", "hotărâri, proiecte, procese-verbale, dispoziții, registre de urbanism, contracte, anunțuri de angajare, componența consiliului"],
      ["https://arhiva.primariaradauti.ro", "Arhiva site-ului primăriei", "documentele mai vechi"],
      ["https://www.e-licitatie.ro", "SICAP (e-licitatie.ro)", "achizițiile directe, licitațiile și contractele tuturor instituțiilor din oraș, din 2018"],
      ["https://transparenta.eu", "transparenta.eu (date de la Ministerul Finanțelor)", "execuția bugetului municipiului și a bugetelor instituțiilor"],
      ["https://www.openstreetmap.org", "OpenStreetMap", "harta și pozițiile adreselor din registrele de urbanism"]];
    el.innerHTML = head("Despre Monitor local", "Ce fac consiliul local, primarul și instituțiile orașului, din documentele lor publice, pe înțelesul tuturor.", route()) +
      '<div class="grid two">' +
      '<section class="card section"><h2>Cine îl face</h2><p>Monitor local e un proiect al <a href="https://radautiulcivic.ro" rel="noopener">Asociației Rădăuțiul Civic</a>, o organizație neguvernamentală din Rădăuți. ' +
      "Codul monitorului e public pe <a href=\"https://github.com/Radautiul-Civic/monitor-local\" rel=\"noopener\">GitHub</a>.</p></section>" +
      '<section class="card section"><h2>Ce este și ce nu este</h2><p>Monitorul adună ce publică primăria și îl arată ordonat: cifre, liste, termene. Cifrele sunt <b>observații</b> la o anumită dată, nu acuzații. ' +
      "Fiecare cifră duce la documentul-sursă, ca oricine să poată verifica.</p></section></div>" +
      '<section class="card section"><h2>De unde vin datele</h2><ul class="src">' + S.map(function (x) {
        return '<li><a href="' + x[0] + '" rel="noopener"><b>' + esc(x[1]) + "</b></a><span>" + esc(x[2]) + "</span></li>"; }).join("") + "</ul></section>" +
      '<section class="card section"><h2>Cum lucrăm</h2><ol class="pasi-n">' +
      "<li><b>Zilnic, automat.</b> Un program citește în fiecare dimineață documentele noi de pe site-urile de mai sus.</li>" +
      "<li><b>Textul documentelor scanate</b> e citit automat (OCR), deci poate avea greșeli; pentru citări, documentul-sursă e cel care contează.</li>" +
      "<li><b>Voturile</b> sunt extrase automat din procesele-verbale, deci pot avea erori; fiecare vot are alături fragmentul de text din care a fost extras.</li>" +
      "<li><b>Rezumatele ședințelor</b> sunt scrise cu ajutorul inteligenței artificiale din înregistrare și documente, apoi citite, corectate și aprobate de un om din echipă înainte de publicare.</li>" +
      "<li><b>Greșelile</b> le corectăm când le aflăm. Spune-ne dacă vezi una.</li></ol></section>" +
      '<section class="card section" id="date-deschise"><h2>Date deschise</h2><p class="note">Datele monitorului, în fișiere CSV pe care le deschizi în Excel sau LibreOffice (separator „;”, UTF-8), actualizate zilnic. Le poți folosi liber, cu mențiunea sursei: Monitor local, Asociația Rădăuțiul Civic. Datele sunt extrase automat din documente publice; verifică în documentul-sursă înainte de a cita o cifră.</p><div id="dd-l"><p class="updated">Se încarcă lista...</p></div></section>' +
      '<section class="card section ct" id="contact"><h2>Ai găsit o greșeală? Scrie-ne</h2>' +
      '<p class="note">Mesajul ajunge doar la echipa monitorului. Numele și e-mailul sunt opționale; le folosim doar ca să-ți putem răspunde.</p>' +
      '<form id="ct-f" novalidate><label>Mesajul<textarea id="ct-m" rows="5" required maxlength="4000" placeholder="Ce ai observat? Dacă e despre un document anume, spune-ne care."></textarea></label>' +
      '<div class="ct-r"><label>Numele (opțional)<input id="ct-n" maxlength="120" autocomplete="name"></label><label>E-mailul (opțional)<input id="ct-e" type="email" maxlength="200" autocomplete="email"></label></div>' +
      '<label class="ct-h" aria-hidden="true">Site<input id="ct-s" tabindex="-1" autocomplete="off"></label>' +
      '<div class="ct-a"><button class="btn ok" type="submit">Trimite mesajul</button><span id="ct-o" role="status"></span></div></form></section>';
    get(FTDATA + "deschise/index.json").then(function (I) {
      $("dd-l").innerHTML = '<ul class="src">' + I.map(function (x) {
        return '<li><a href="' + FTDATA + "deschise/" + esc(x.fisier) + '" download><b>' + esc(x.fisier) + "</b></a><span>" + esc(x.descriere) + " · " + nr(x.randuri) + " rânduri" + (x.octeti ? " · " + gb(x.octeti) : "") + "</span></li>";
      }).join("") + "</ul>";
    }).catch(function () { $("dd-l").innerHTML = '<p class="empty">Fișierele apar după următoarea colectare.</p>'; });
    var f = $("ct-f"), o = $("ct-o"), pag = (document.referrer || "").indexOf(location.host) >= 0 ? document.referrer : "";
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var m = $("ct-m").value.trim();
      if (m.length < 5) { o.textContent = "Scrie mesajul, te rog."; $("ct-m").focus(); return; }
      f.querySelector("button").disabled = true; o.textContent = "Se trimite...";
      fetch(BASE + "contact.php", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mesaj: m, nume: $("ct-n").value, email: $("ct-e").value, site: $("ct-s").value, pagina: pag || ULTIMA }) })
        .then(function (x) { return x.json().then(function (d) { if (!x.ok || d.eroare) throw new Error(d.eroare || "eroare"); }); })
        .then(function () { f.innerHTML = '<p class="ct-ok">Mulțumim! Am primit mesajul și ne uităm cât de repede putem.</p>'; })
        .catch(function (err) { o.textContent = "Nu s-a putut trimite: " + err.message; f.querySelector("button").disabled = false; });
    });
  }
  // ---------- Declarațiile consilierilor (doar intern): firmele din declarații, lângă SICAP și urbanism ----------
  function declaratiiIntern(el) {
    if (!INTERN) return;
    var cap = head("Declarațiile consilierilor (intern)", "Firmele citite automat din declarațiile de avere și de interese ale consilierilor locali, puse lângă achizițiile din SICAP și registrele de urbanism. Doar pentru echipă.");
    el.innerHTML = cap + '<p class="updated">Se încarcă...</p>';
    get(DATA + "declaratii.json").then(function (D) {
      var C = D.consilieri || [];
      el.innerHTML = cap + '<p class="callout"><b>Atenție:</b> potrivirile sunt automate, după numele firmelor citite din declarații (textul scanat, cu greșeli). O potrivire nu înseamnă o neregulă: o firmă poate avea același nume cu alta, iar o relație declarată poate fi legală. Verifică întotdeauna în declarație, în SICAP și la Registrul Comerțului înainte de orice concluzie. Nimic de aici nu se publică.</p>' +
        '<div class="grid">' + tile("Consilieri cu declarații", nr(C.filter(function (x) { return x.id; }).length), "", nr(C.reduce(function (a, x) { return a + x.declaratii.length; }, 0)) + " declarații") +
        tile("Firme găsite în declarații", nr(C.reduce(function (a, x) { return a + x.firme.length; }, 0)), "", "citite automat") +
        tile("Consilieri cu potriviri", nr(C.filter(function (x) { return x.potriviri; }).length), "", "o firmă din declarație apare în SICAP sau în urbanism") + "</div>" +
        C.map(function (x) {
          return '<section class="card section"><div class="h-row"><h2>' + (x.id ? '<a href="#consiliu/consilieri/' + encodeURIComponent(x.id) + '">' + esc(x.nume || x.id) + "</a>" : "Declarații nepotrivite cu un consilier") +
            (x.potriviri ? ' <span class="nr-b">' + x.potriviri + " potriviri</span>" : "") + "</h2></div>" +
            '<div class="m dc-l">' + x.declaratii.map(function (d) { return '<a class="lk" href="' + esc(safeUrl(d.url) || "#") + '" rel="noopener">' + (d.fel === "avere" ? "avere " : "interese ") + esc(d.an || "") + (d.citita ? "" : " (necitită)") + "</a>"; }).join(" ") + "</div>" +
            (x.firme.length ? x.firme.map(function (f) {
              return '<div class="doc"><div class="h"><span class="id">' + esc(f.nume) + "</span>" +
                (f.sicap ? '<span class="rz par">SICAP: ' + nr(f.sicap.n) + " achiziții, " + lei(f.sicap.lei) + "</span>" : "") + (f.urbanism_n ? '<span class="rz ic">urbanism: ' + f.urbanism_n + " acte</span>" : "") + "</div>" +
                (f.sicap ? '<div class="m"><a href="#bani/achizitii/furnizor/' + encodeURIComponent(f.sicap.cui) + '">' + esc(f.sicap.nume) + " (CUI " + esc(f.sicap.cui) + ")</a><span>" + esc(f.sicap.institutii.join(", ")) + "</span></div>" : "") +
                (f.urbanism_n ? '<div class="m">' + f.urbanism.slice(0, 5).map(function (u) { return "<span>" + (u.t === "ac" ? "AC " : "CU ") + esc(u.nr || "") + " · " + esc(zi(u.data)) + (u.strada ? " · " + esc(u.strada) : "") + "</span>"; }).join("") + "</div>" : "") +
                '<details class="more-t"><summary>unde apare în declarație</summary>' + f.contexte.map(function (c) { return '<div class="muted">… ' + esc(c) + " …</div>"; }).join("") + "</details></div>";
            }).join("") : '<p class="empty">Nicio firmă găsită în textul declarațiilor' + (x.declaratii.some(function (d) { return !d.citita; }) ? " (unele nu sunt încă citite)" : "") + ".</p>") + "</section>";
        }).join("");
    }).catch(function () { el.innerHTML = cap + '<section class="card section"><p class="empty">Analiza apare după următoarea colectare.</p></section>'; });
  }
  function mesajeIntern(el) {
    if (!INTERN) return;
    el.innerHTML = head("Mesaje de la cititori", "Mesajele trimise din formularul de pe pagina Despre. Le vede doar echipa.") + '<p class="updated">Se încarcă...</p>';
    fetch(API, { cache: "no-store", credentials: "same-origin" }).then(function (x) { return x.json(); }).then(function (d) {
      var M = (d.mesaje || []).map(function (m, i) { return { m: m, i: i }; }).reverse();
      el.innerHTML = head("Mesaje de la cititori", "Mesajele trimise din formularul de pe pagina Despre. Le vede doar echipa.") +
        '<section class="card section">' + (M.length ? M.map(function (o) {
          var m = o.m;
          return '<div class="doc' + (m.citit ? " rezolvat" : "") + '"><div class="h"><span class="id">' + esc(zi(m.la)) + " " + esc((m.la || "").slice(11, 16)) + "</span>" +
            (m.nume ? "<span>" + esc(m.nume) + "</span>" : "") + (m.email ? '<a href="mailto:' + esc(m.email) + '">' + esc(m.email) + "</a>" : "") +
            '<span class="rz ' + (m.citit ? "c" : "ic") + '">' + (m.citit ? "rezolvat" : "nou") + "</span></div>" +
            '<div class="t" style="white-space:pre-wrap">' + esc(m.mesaj) + '</div><div class="m">' + (m.pagina ? "<span>de pe " + esc(m.pagina) + "</span>" : "") +
            '<button class="btn" data-i="' + o.i + '" data-c="' + (m.citit ? "0" : "1") + '">' + (m.citit ? "Marchează nerezolvat" : "Marchează rezolvat") + "</button></div></div>";
        }).join("") : '<p class="empty">Niciun mesaj deocamdată.</p>') + "</section>";
      Array.prototype.forEach.call(el.querySelectorAll("button[data-i]"), function (b) {
        b.addEventListener("click", function () { b.disabled = true; apiPost({ act: "mesaj", i: +b.dataset.i, citit: b.dataset.c === "1" }).then(function () { mesajeIntern(el); }).catch(function (e) { b.disabled = false; alert(e.message); }); });
      });
    }).catch(function () { el.innerHTML = head("Mesaje de la cititori", "") + '<p class="empty">Nu am putut citi mesajele.</p>'; });
  }
  // ---------- Panoul de control: ce are echipa de făcut, într-un singur loc ----------
  function sarciniIntern(el) {
    if (!INTERN) return;
    el.innerHTML = head("De făcut", "") + '<p class="updated">Se încarcă...</p>';
    var opt = function (p) { return p.catch(function () { return null; }); };
    Promise.all([opt(get(API)), opt(get(DATA + "rezumate.json")), opt(incarcaSed()), opt(get(DATA + "semnale.json")), opt(get(DATA + "cartoane.json?v=" + Date.now()))]).then(function (d) {
      var st = d[0] || {}, C = d[1] || {}, Sd = d[2] || {}, Sg = d[3], K = d[4] || {}, A = st.aprobari || {};
      var ciorne = Object.keys(C).filter(function (k) { var x = A[k]; return C[k].rezumat && (!x || x.stare === "ciorna" || x.stare === "refa"); });
      var cuVideo = {}; (st.video || []).forEach(function (v) { cuVideo[v.data] = 1; });
      Object.keys(C).forEach(function (k) { cuVideo[k.slice(0, 10)] = 1; if (C[k].data_sedinta) cuVideo[C[k].data_sedinta] = 1; if (C[k].data) cuVideo[C[k].data] = 1; });
      var azi = new Date().toISOString().slice(0, 10), lim = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
      var faraVideo = (Sd.recente || []).concat(Sd.urmatoare || []).filter(function (c) { return c.data && c.data <= azi && c.data >= lim && !cuVideo[c.data]; });
      var asteapta = (st.video || []).filter(function (v) { return !Object.keys(C).some(function (k) { return k.indexOf(v.data) === 0; }); });
      var mesaje = (st.mesaje || []).filter(function (m) { return !m.citit; });
      var cartC = Object.keys(K).filter(function (k) { return K[k].sursa === "ciorna"; });
      var semn = Sg ? (Sg.consultare || []).length + (Sg.diferente || []).length + (Sg.modificate || []).length + (Sg.achizitii || []).filter(function (x) { return x.fel === "fragmentare"; }).length : null;
      var card = function (n, titlu, text, link, eticheta, urgent) {
        return '<a class="sr-c' + (n ? (urgent ? " urgent" : " are") : "") + '" href="' + link + '"><b>' + (n == null ? "-" : n) + "</b><span><strong>" + esc(titlu) + "</strong>" + esc(text) + '</span><i>' + esc(eticheta) + " &rarr;</i></a>";
      };
      el.innerHTML = head("De făcut", "Tot ce așteaptă o decizie sau o verificare din partea echipei. Restul meniului e platforma, așa cum o vede (sau o va vedea) publicul.") +
        '<div class="sr-g">' +
        card(ciorne.length, "Rezumate de verificat și aprobat", "Ciornele ședințelor: verifică voturile pe înregistrare, apoi aprobă.", "#rezumate", "panoul de rezumate", true) +
        card(faraVideo.length, "Ședințe fără înregistrare", "Ținute în ultimele 60 de zile, fără link adăugat în panou.", "#rezumate", "adaugă linkul", true) +
        card(asteapta.length, "Înregistrări în lucru", "Adăugate, în așteptarea transcrierii și a ciornei.", "#rezumate", "vezi lista") +
        card(mesaje.length, "Mesaje necitite", "De la cititori, din formularul de pe pagina Despre.", "#mesaje", "citește", true) +
        card(cartC.length, "Cartoane din ciorne", "Făcute automat; devin finale după aprobarea rezumatului.", "#analize", "vezi cartoanele") +
        card(semn, "Semnale de verificat", "Consultări scurtate, diferențe proiect - hotărâre, postări modificate, achiziții repetate.", "#semnale", "vezi semnalele") +
        "</div>" +
        '<section class="card section"><h2>Decizii care așteaptă</h2><ul class="sr-l">' +
        "<li><b>Întreabă monitorul:</b> cheia AI se pune de mână în cPanel (intern/cheie-ai.php) sau renunțăm la funcție.</li>" +
        "<li><b>Alertele pe e-mail:</b> cron-ul din cPanel și adresa de expediere.</li>" +
        "<li><b>Datele deschise:</b> licența (propunere: CC BY 4.0).</li>" +
        "<li><b>Semnalele:</b> verificarea juridică a metodei (termene, ce e „normativ”, pragurile achiziției directe).</li>" +
        "<li><b>Monitorul public:</b> data deschiderii.</li></ul></section>" +
        '<section class="card section"><h2>Starea datelor</h2><p>Ultima colectare: <b>' + esc(zi(IND.calculat_la)) + "</b>." + (Sg ? " Semnale calculate la " + esc(zi(Sg.generat_la)) + "." : " Semnalele nu au fost încă calculate.") + "</p></section>";
    });
  }

  // ---------- Semnalele automate și indicele de transparență (deocamdată doar intern, până se verifică metoda) ----------
  var SEMN_FEL = { diferenta_proiect: ["Diferă de proiect", "par"], consultare_scurta: ["Consultare sub 30 de zile", "p"], fara_anunt: ["Fără anunț de consultare găsit", "par"], publicare_tarzie: ["Publicată târziu", "par"],
    fragmentare: ["Achiziții directe repetate peste prag", "p"], sub_prag: ["Chiar sub pragul achiziției directe", "par"] };
  var SEMN_COMP = { diferente: "Diferențe proiect - hotărâre", modificate: "Postări modificate", consultare: "Consultare publică", publicare: "Publicare la timp", sedinte_planificate: "Ședințe planificate", achizitii: "Achiziții directe" };
  function semnaleIntern(el, r) {
    if (!INTERN) return;
    el.innerHTML = head("Semnale", "") + '<p class="updated">Se încarcă...</p>';
    Promise.all([get(DATA + "semnale.json"), get(DATA + "arhiva-manifest.json").catch(function () { return null; })]).then(function (d) {
      var S = d[0], M = d[1] || [], ind = (S.indice || []).filter(function (x) { return x.indice != null; }).reverse();
      var grav = function (g) { return '<span class="sg-g sg-' + g + '" title="importanța semnalului">' + "●●●".slice(0, g) + "</span>"; };
      var fel = function (f) { var k = SEMN_FEL[f] || [f, "n"]; return '<span class="rz ' + k[1] + '">' + esc(k[0]) + "</span>"; };
      var hclDoc = function (x) {
        var h = x.hcl;
        return '<div class="doc"><div class="h">' + grav(x.grav) + fel(x.fel) + linkHcl(h) + " <span class=\"muted\">adoptată " + esc(zi(h.data)) + "</span>" +
          (h.pagina ? ' <a class="lk" href="' + esc(safeUrl(h.pagina) || "#") + '" rel="noopener">pe site</a>' : "") + '</div><div class="t">' + esc(h.titlu) + "</div>" +
          '<div class="m"><span>' + esc(x.text) + "</span>" + (x.anunt ? ' <span>Anunțul: publicat ' + esc(zi(x.anunt.postat)) + (x.anunt.pagina ? ', <a href="' + esc(safeUrl(x.anunt.pagina) || "#") + '" rel="noopener">vezi anunțul</a>' : "") + "</span>" : "") + "</div></div>";
      };
      var achDoc = function (x) {
        return '<div class="doc"><div class="h">' + grav(x.grav) + fel(x.fel) + "<b>" + esc(x.institutie || "") + "</b>" + (x.an ? ' <span class="muted">' + esc(x.an) + "</span>" : "") + '</div><div class="t">Furnizor: ' + esc(x.furnizor || "-") +
          (x.cpv ? ' · CPV ' + esc(x.cpv) : "") + '</div><div class="m"><span>' + esc(x.text) + "</span></div>" +
          (x.achizitii.length > 1 ? '<details class="tbl"><summary>Cele ' + x.achizitii.length + ' achiziții</summary><div class="tw"><table><thead><tr><th>Data</th><th>Obiect</th><th class="n">Lei</th><th>Cod SICAP</th></tr></thead><tbody>' +
            x.achizitii.map(function (a) { return "<tr><td>" + esc(zi(a.data)) + "</td><td>" + esc(a.obiect || "") + '</td><td class="n">' + nr(Math.round(a.lei)) + "</td><td>" + esc(a.cod || "") + "</td></tr>"; }).join("") + "</tbody></table></div></details>"
            : '<p class="note">' + esc(zi(x.achizitii[0].data)) + ": " + esc(x.achizitii[0].obiect || "") + " (" + esc(x.achizitii[0].cod || "") + ")</p>") + "</div>";
      };
      var disp = M.filter(function (f) { return f.x; }).sort(function (a, b) { return (b.x || "").localeCompare(a.x || ""); });
      var U = S.urgenta || {}, aniU = Object.keys(U).sort().reverse();
      var frag = (S.achizitii || []).filter(function (x) { return x.fel === "fragmentare"; }), sub = (S.achizitii || []).filter(function (x) { return x.fel === "sub_prag"; });
      el.innerHTML = head("Semnale", "Ce merită o întrebare, găsit automat în documentele publice: consultări scurtate, hotărâri publicate târziu, ședințe de îndată, achiziții directe repetate. Un semnal nu e o acuzație: fiecare duce la documentul din care a fost dedus.") +
        '<p class="callout">Pagină internă până verificăm metoda. Pragurile și regulile sunt la final, în „Cum se calculează”.</p>' +
        (ind.length ? '<section class="card section"><h2>Indicele de transparență al primăriei</h2><p class="note">De la 0 la 100, media a patru componente. Arată tendința, nu dă o notă de legalitate.</p>' +
          ind.map(function (x) {
            return '<h3 class="an-h">' + esc(x.an) + (x.an >= String(AN_CURENT) ? ' <small class="muted">(an în curs)</small>' : "") + '</h3><div class="grid">' + tile("Indicele", x.indice, "din 100", "") +
              ["consultare", "publicare", "sedinte_planificate", "achizitii"].map(function (k) { var v = x.componente[k], D = x.detalii;
                var sub_ = { consultare: D.normative ? (D.normative - D.cu_problema_consultare) + " din " + D.normative + " hotărâri probabil normative fără semnal" : "nicio hotărâre normativă",
                  publicare: D.hotarari_cu_data_publicarii + " hotărâri cu data publicării", sedinte_planificate: D.de_indata + " din " + D.sedinte + " ședințe convocate de îndată",
                  achizitii: D.grupuri_fragmentare + " grupuri de achiziții directe repetate peste prag" }[k];
                return tile(SEMN_COMP[k], v == null ? "-" : v, v == null ? "" : "din 100", sub_); }).join("") + "</div>";
          }).join("") + "</section>" : "") +
        '<section class="card section"><h2>Consultarea publică <span class="nr-b n">' + (S.consultare || []).length + "</span></h2>" +
          '<p class="note">Hotărâri cu caracter probabil normativ (taxe, tarife, regulamente) adoptate la mai puțin de ' + S.praguri.zile_consultare + " de zile de la anunțul proiectului sau fără anunț găsit pe site. Doar din 2025, de când site-ul nou publică anunțurile.</p>" +
          ((S.consultare || []).length ? S.consultare.slice().reverse().map(hclDoc).join("") : '<p class="empty">Niciun semnal.</p>') + "</section>" +
        '<section class="card section"><h2>Publicarea hotărârilor <span class="nr-b n">' + (S.publicare || []).length + "</span></h2>" +
          ((S.publicare || []).length ? S.publicare.map(hclDoc).join("") : '<p class="empty">Nicio hotărâre din 2025 încoace nu a apărut pe site la mai mult de ' + S.praguri.zile_publicare + " de zile după adoptare.</p>") + "</section>" +
        '<section class="card section"><h2>Ședințele convocate de îndată</h2><p class="note">Ședința de îndată se convoacă fără termenul obișnuit, pentru situații urgente. Cetățenii află de ea cel mai târziu.</p><div class="tw"><table><thead><tr><th>An</th><th class="n">Ședințe</th><th class="n">Extraordinare</th><th class="n">De îndată</th></tr></thead><tbody>' +
          aniU.map(function (a) { var x = U[a]; return "<tr><td>" + a + '</td><td class="n">' + x.total + '</td><td class="n">' + x.extraordinare + '</td><td class="n">' + (x.de_indata ? "<b>" + x.de_indata + "</b>" : 0) + "</td></tr>"; }).join("") + "</tbody></table></div></section>" +
        '<section class="card section"><h2>Achiziții directe repetate <span class="nr-b n">' + frag.length + '</span></h2><p class="note">La aceeași instituție, același furnizor, aceeași grupă CPV, în același an: cel puțin trei achiziții directe care împreună depășesc pragul. Nu înseamnă automat fragmentare ilegală; înseamnă că merită întrebat de ce nu s-a făcut o singură procedură.</p>' +
          (frag.length ? frag.map(achDoc).join("") : '<p class="empty">Niciun semnal.</p>') + "</section>" +
        '<section class="card section"><h2>Chiar sub prag <span class="nr-b n">' + sub.length + '</span></h2><p class="note">Achiziții directe între 90% și 100% din prag.</p>' +
          (sub.length ? '<details><summary>Vezi lista</summary>' + sub.map(achDoc).join("") + "</details>" : '<p class="empty">Niciun semnal.</p>') + "</section>" +
        '<section class="card section"><h2>Ce s-a schimbat între proiect și hotărâre <span class="nr-b n">' + (S.diferente || []).length + "</span></h2>" +
          '<p class="note">Sume noi în articolele hotărârii față de proiectul publicat. Pot fi amendamente votate sau greșeli de citire automată: se verifică pe ambele documente.</p>' +
          ((S.diferente || []).length ? S.diferente.slice().reverse().map(hclDoc).join("") : '<p class="empty">' + (S.diferente ? "Niciun semnal." : "Se calculează la următoarea colectare.") + "</p>") + "</section>" +
        '<section class="card section"><h2>Postări modificate după publicare <span class="nr-b n">' + (S.modificate || []).length + "</span></h2>" +
          '<p class="note">Hotărâri, proiecte, procese-verbale și convocări al căror conținut pe site s-a schimbat după ce monitorul le-a văzut prima dată. Versiunea veche e în arhiva noastră.</p>' +
          ((S.modificate || []).length ? '<div class="tw"><table><thead><tr><th>Ultima modificare</th><th>Postarea</th><th>Publicată</th><th class="n">Versiuni</th></tr></thead><tbody>' +
            S.modificate.slice(0, 200).map(function (x) { return "<tr><td>" + esc(zi(x.ultima)) + '</td><td><a href="' + esc(safeUrl(x.pagina) || "#") + '" rel="noopener">' + esc((x.titlu || "").slice(0, 140)) + "</a> <small class=\"muted\">" + esc(x.sursa) + "</small></td><td>" + esc(zi(x.publicat)) + '</td><td class="n">' + x.versiuni + "</td></tr>"; }).join("") + "</tbody></table></div>"
            : '<p class="empty">' + (S.modificate ? "Nicio postare modificată." : "Se calculează la următoarea colectare.") + "</p>") + "</section>" +
        '<section class="card section"><h2>Documente dispărute de pe site-ul primăriei <span class="nr-b n">' + disp.length + "</span></h2>" +
          '<p class="note">Fișiere văzute de arhiva noastră și care nu mai sunt pe site. Copia lor e în arhiva de siguranță, cu amprenta din momentul copierii.</p>' +
          (disp.length ? '<div class="tw"><table><thead><tr><th>Dispărut la</th><th>Fișier</th><th>Încărcat</th><th>Copie</th></tr></thead><tbody>' + disp.slice(0, 200).map(function (f) {
            return "<tr><td>" + esc(zi(f.x)) + '</td><td><a href="' + esc(safeUrl(f.u) || "#") + '" rel="noopener">' + esc(f.n || f.u.split("/").pop()) + "</a></td><td>" + esc(f.d ? zi(f.d) : "-") + "</td><td>" +
              (f.w ? '<a href="' + esc(safeUrl(f.w) || "#") + '" rel="noopener">Internet Archive</a>' : f.c ? "pe hostingul nostru" : "-") + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="empty">' + (M.length ? "Niciun document dispărut." : "Manifestul arhivei nu s-a putut citi.") + "</p>") + "</section>" +
        '<section class="card section"><h2>Cum se calculează</h2><dl class="sg-m">' + Object.keys(S.metoda || {}).map(function (k) { return "<dt>" + esc(SEMN_COMP[k] || (k === "indice" ? "Indicele" : k)) + "</dt><dd>" + esc(S.metoda[k]) + "</dd>"; }).join("") + "</dl>" +
          '<p class="note">Actualizat la ' + esc(zi(S.generat_la)) + ".</p></section>";
      glosar(el);
    }).catch(function () { el.innerHTML = head("Semnale", "") + '<p class="empty">Semnalele nu au fost calculate încă. Apar după următoarea colectare.</p>'; });
  }

  // ---------- Analizele Rădăuțiul Civic (doar intern): cartoanele și textele postărilor, plus ciornele făcute automat din rezumate ----------
  function analizeIntern(el) {
    if (!INTERN) return;
    var cine = decodeURIComponent((location.hash.split("/")[1] || "").split("?")[0]);
    el.innerHTML = head("Analizele Rădăuțiul Civic", "") + '<p class="updated">Se încarcă...</p>';
    Promise.all([get("analize/index.json?v=" + Date.now()).catch(function () { return {}; }), get(DATA + "cartoane.json?v=" + Date.now()).catch(function () { return {}; })]).then(function (d) {
      var A = (d[0].analize || []).map(function (a) { return Object.assign({ baza: "analize/" + a.id + "/" }, a); });
      var C = Object.keys(d[1] || {}).map(function (k) { return Object.assign({ id: k, ciorna: 1, baza: "cartoane/" + k + "/", fisier: "Sedinta " + d[1][k].data }, d[1][k]); })
        .sort(function (a, b) { return (b.data || "").localeCompare(a.data || ""); });
      var x = A.concat(C).filter(function (a) { return a.id === cine; })[0];
      var poza = function (a, n, i) { return a.baza + encodeURIComponent(n) + (a.generat_la ? "?v=" + encodeURIComponent(a.generat_la) : ""); };
      if (x) {
        el.innerHTML = head(x.titlu || "Analiză", (x.data ? zi(x.data) + ". " : "") + (x.ciorna ? "Ciornă făcută automat din rezumatul aprobat al ședinței." : "Analiză a Asociației Rădăuțiul Civic.")) +
          '<p><a href="#analize">&larr; toate analizele</a></p>' +
          (x.ciorna ? '<p class="callout">Ciornă automată: verifică voturile și numele pe înregistrare înainte de orice postare. Transcrierea automată greșește des rezultatul votului.</p>' : "") +
          (x.pe_scurt ? '<section class="card section"><p>' + esc(x.pe_scurt) + "</p></section>" : "") +
          '<section class="card section"><h2>Cartoanele (' + (x.cartoane || []).length + ')</h2><p class="note">Pătrate, 1080 × 1080, pentru Facebook și Instagram. Apasă pe un carton ca să-l descarci.</p><div class="an-grid">' +
          (x.cartoane || []).map(function (n, i) { return '<a href="' + esc(poza(x, n)) + '" download="' + esc((x.fisier || x.id) + " " + (i + 1) + ".png") + '" title="' + esc((x.titluri || [])[i] || "") + '"><img loading="lazy" src="' + esc(poza(x, n)) + '" alt="' + esc((x.titluri || [])[i] || "Cartonul " + (i + 1)) + '"><span>' + (i + 1) + ". " + esc((x.titluri || [])[i] || "") + "</span></a>"; }).join("") + "</div></section>" +
          '<section class="card section"><h2>Textele postărilor</h2><p class="note">Postările nu trimit la monitor cât timp acesta nu e public.</p>' +
          ((x.postari || {}).facebook ? postBox(x.postari.facebook, "Facebook") : "") + ((x.postari || {}).instagram ? postBox(x.postari.instagram, "Instagram") : "") + "</section>" +
          ((x.surse || []).length ? '<section class="card section"><h2>Surse</h2><ul>' + x.surse.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></section>" : "") +
          ((x.note || []).length ? '<section class="card section"><h2>Note de lucru</h2><ul>' + x.note.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></section>" : "");
        return;
      }
      var lista = function (L) { return '<div class="an-l">' + L.map(function (a) { return '<a class="an-c" href="#analize/' + encodeURIComponent(a.id) + '">' + ((a.cartoane || []).length ? '<img loading="lazy" src="' + esc(poza(a, a.cartoane[0])) + '" alt="">' : "") +
        "<div><b>" + esc(a.titlu || a.id) + "</b><small>" + (a.data ? esc(zi(a.data)) + " · " : "") + (a.cartoane || []).length + " cartoane</small>" + (a.pe_scurt ? "<p>" + esc(a.pe_scurt) + "</p>" : "") + "</div></a>"; }).join("") + "</div>"; };
      el.innerHTML = head("Analizele Rădăuțiul Civic", "Analizele noastre pe deciziile locale: cartoanele pentru rețelele sociale, textele postărilor și sursele. Deocamdată doar în versiunea internă.") +
        '<section class="card section"><h2>Analize</h2>' + (A.length ? lista(A) : '<p class="empty">Nicio analiză încă.</p>') + "</section>" +
        '<section class="card section"><h2>Ciorne din rezumatele ședințelor</h2><p class="note">Se fac automat, cu același șablon, pentru fiecare rezumat aprobat în panoul „Rezumate”. Sunt un punct de plecare: se verifică și se completează de mână înainte de postare.</p>' +
        (C.length ? lista(C) : '<p class="empty">Nicio ciornă încă. Apar după ce aprobi un rezumat de ședință (la următoarea rulare a fluxului de transcriere).</p>') + "</section>";
    });
  }
  // transcrierea unei ședințe, ușor de citit și de căutat (doar intern): pentru verificarea a ceea ce s-a spus
  function transcriereIntern(el, r) {
    if (!INTERN) return;
    var id = decodeURIComponent(r.rest[0] || "");
    el.innerHTML = head("Transcrierea ședinței", "") + '<p class="updated">Se încarcă...</p>';
    Promise.all([get("transcrieri/" + encodeURIComponent(id) + ".json"), get("transcrieri/" + encodeURIComponent(id) + "-vorbitori.json").catch(function () { return null; })]).then(function (d) {
      var T = d[0], VB = d[1], I = (VB && VB.interventii) || [], S = T.segmente || [];
      var hms = function (x) { x = Math.floor(x); return Math.floor(x / 3600) + ":" + ("0" + Math.floor(x % 3600 / 60)).slice(-2) + ":" + ("0" + x % 60).slice(-2); };
      var link = function (t) { var u = safeUrl(T.url) || ""; return /youtu/.test(u) ? u + (u.indexOf("?") > 0 ? "&" : "?") + "t=" + Math.floor(t) : u; };
      var cineLa = function (t) { for (var i = 0; i < I.length; i++) if (I[i].a <= t && t <= I[i].b + 1) return I[i]; return null; };
      var nume = {}; I.forEach(function (x) { if (x.cine) nume[x.cine] = (nume[x.cine] || 0) + 1; });
      var lista = Object.keys(nume).sort(function (a, b) { return nume[b] - nume[a]; });
      el.innerHTML = head("Transcrierea ședinței din " + zi(T.data), "Transcriere automată (Whisper) a înregistrării" + (T.titlu ? " „" + esc(T.titlu) + "”" : "") + ". Are greșeli. " +
          (VB ? "Vorbitorii sunt puși de un model AI, după procesul-verbal: „probabil” înseamnă nesigur." : "Nu spune cine vorbește: vorbitorii apar după ce se publică procesul-verbal.") + " Ascultă pe înregistrare înainte de a cita.") +
        '<p><a href="#rezumate">&larr; panoul de rezumate</a> · <a href="' + esc(safeUrl(T.url) || "#") + '" rel="noopener">înregistrarea</a> · <a href="transcrieri/' + esc(encodeURIComponent(id)) + '.json" download>JSON</a></p>' +
        '<div class="tr-vid">' + videoBox(T.url, true) + "</div>" +
        '<div class="filters"><input id="tr-q" type="search" placeholder="Caută în transcriere (ex. turbine, certificate, audit)" aria-label="Caută">' +
        (lista.length ? '<select id="tr-c" aria-label="Vorbitorul"><option value="">Toți vorbitorii</option>' + lista.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + " (" + nume[n] + ")</option>"; }).join("") + "</select>" : "") +
        '<span id="tr-n" class="muted"></span></div>' +
        (VB && (VB.nepotriviri || []).length ? '<details class="callout"><summary><b>Ce nu se potrivește între procesul-verbal și înregistrare</b> (' + VB.nepotriviri.length + ")</summary><ul>" +
          VB.nepotriviri.map(function (n) { return "<li>" + esc(n.minut || "") + " " + esc(n.ce || "") + "</li>"; }).join("") + "</ul></details>" : "") +
        '<section class="card section tr-l" id="tr-l"></section>';
      var arata = function () {
        var q = norm($("tr-q").value.trim()), c = $("tr-c") ? $("tr-c").value : "", n = 0, ultim = null, h = "";
        S.forEach(function (x) {
          var v = cineLa(x[0]);
          if (q && norm(x[2]).indexOf(q) < 0) return;
          if (c && (!v || v.cine !== c)) return;
          n++;
          if (v !== ultim && I.length) {
            h += '<h4 class="tr-v">' + (v && v.cine ? esc(v.cine) + (v.rol ? ' <small class="muted">' + esc(v.rol) + "</small>" : "") + (v.sigur !== "sigur" ? ' <span class="rz par" title="' + esc(v.dovada || "") + '">probabil</span>' : ' <span class="rz c" title="' + esc(v.dovada || "") + '">sigur</span>') : '<span class="muted">vorbitor neidentificat</span>') +
              (v && v.pv ? '<span class="tr-pv" title="din procesul-verbal">PV: „' + esc(v.pv) + "”</span>" : "") + "</h4>";
            ultim = v;
          }
          h += '<p><a class="rz-min" href="' + esc(link(x[0])) + '" rel="noopener" title="la acest minut în înregistrare">' + hms(x[0]) + "</a> " + esc(x[2]) + "</p>";
        });
        $("tr-l").innerHTML = h || '<p class="empty">Nimic găsit.</p>';
        $("tr-n").textContent = q || c ? n + " fragmente" : S.length + " fragmente, " + hms(S.length ? S[S.length - 1][1] : 0);
      };
      var t; $("tr-q").addEventListener("input", function () { clearTimeout(t); t = setTimeout(arata, 200); });
      if ($("tr-c")) $("tr-c").addEventListener("change", arata);
      arata();
      legaVideo(el);
      if (/youtu/.test(T.url || "")) $("tr-l").addEventListener("click", function (ev) {   // minutul pornește înregistrarea de sus de acolo
        var a = ev.target.closest("a.rz-min"); if (!a) return;
        var p = a.textContent.split(":").map(Number), t = p[0] * 3600 + p[1] * 60 + p[2], f = el.querySelector(".tr-vid iframe");
        if (f) { ev.preventDefault(); f.src = videoEmbedUrl(T.url, t) + "&autoplay=1"; f.scrollIntoView({ block: "nearest" }); }
      });
    }).catch(function () { el.innerHTML = head("Transcrierea ședinței", "") + '<p class="empty">Transcrierea nu există sau nu s-a putut citi.</p>'; });
  }
  // ---------- Dosar pe temă (doar intern): cauți, alegi documentele, descarci un fișier pentru un chat AI ----------
  var DOS = { intern: null, tr: null, sel: null, rez: null };
  var DOS_FEL = { dispozitii: "Dispoziție", rapoarte: "Raport", hcl_anexe: "Anexă la hotărâre", comunale: "Servicii Comunale", tr: "Transcriere ședință" };
  function dosFel(f) { return FELURI[f] || DOS_FEL[f] || f; }
  function dosAscunde(t) {   // ca monitor_colector/ascunde.py: CNP, act de identitate, domiciliu
    t = String(t || "").replace(/(^|[^\d])[1-8]\d{12}(?!\d)/g, "$1[CNP]").replace(/(seria?\s*[A-Z]{2}\s*(?:nr\.?|num[aă]r(?:ul)?)?\s*)\d{6}/gi, "$1[nr. act]");
    var out = "", poz = 0, re = /domiciliat\w*\s+(?:[iî]n\s+)?/gi, m;
    while ((m = re.exec(t))) {
      if (m.index < poz) continue;
      var rest = t.slice(re.lastIndex, re.lastIndex + 220), j = rest.match(/\bjud(?:e[tţț]ul)?\.?\s*[\wăâîșşțţ]+/i);
      out += t.slice(poz, m.index) + m[0] + "[adresă]"; poz = re.lastIndex + (j ? j.index + j[0].length : Math.min(rest.length, 120));
    }
    t = out + t.slice(poz);
    return t.replace(/\b(?:str\.|strada)\s*[^,;\n]{1,40},?\s*nr\.?\s*\d+\w?(?:[,\s]*(?:bl|sc|et|ap)\.?\s*\w+){0,5}[,\s]*ap\.?\s*\d+/gi, "[adresă]");
  }
  function dosSel() {
    if (DOS.sel) return DOS.sel;
    try { DOS.sel = JSON.parse(localStorage.getItem("mc-dosar") || "{}") || {}; } catch (e) { DOS.sel = {}; }
    return DOS.sel;
  }
  function dosSalveaza() { try { localStorage.setItem("mc-dosar", JSON.stringify(DOS.sel || {})); } catch (e) {} }
  function dosIntern() { return DOS.intern ? Promise.resolve(DOS.intern) : get(DATA + "dosar-intern.json").then(function (d) { DOS.intern = d.docs || []; return DOS.intern; }).catch(function () { DOS.intern = []; return DOS.intern; }); }
  function dosTranscrieri() {   // toate transcrierile (se încarcă doar dacă le ceri)
    if (DOS.tr) return DOS.tr;
    DOS.tr = get(DATA + "rezumate.json").catch(function () { return {}; }).then(function (C) {
      var ids = Object.keys(C || {}).filter(function (k) { return /^\d{4}-\d{2}-\d{2}-/.test(k); }), out = [], i = 0;
      function urm() {
        if (i >= ids.length) return Promise.resolve(out);
        var lot = ids.slice(i, i + 4); i += 4;
        return Promise.all(lot.map(function (id) {
          return get("transcrieri/" + encodeURIComponent(id) + ".json").then(function (T) {
            var S = T.segmente || [];
            out.push({ k: "tr:" + id, sursa: "tr", fel: "tr", id: id, titlu: "Transcrierea ședinței din " + zi(T.data || id.slice(0, 10)) + (T.titlu ? " („" + T.titlu + "”)" : ""),
              data: T.data || id.slice(0, 10), url: T.url || "", link: "#rezumate/transcriere/" + encodeURIComponent(id), seg: S, text: S.map(function (s) { return s[2]; }).join(" ") });
          }).catch(function () {});
        })).then(urm);
      }
      return urm();
    });
    return DOS.tr;
  }
  function dosPotrivire(text, R) {   // toate cuvintele (ca început de cuvânt) și toate expresiile exacte
    var n = " " + ftNormPoz(String(text || "")).replace(/\s+/g, " ");
    return R.tok.every(function (w) { return new RegExp("[^a-z0-9]" + w.replace(/[^a-z0-9]/g, "")).test(n); }) && R.fraze.every(function (f) { return n.indexOf(f) >= 0; });
  }
  function dosPozitii(text, R) {
    var n = ftNormPoz(String(text || "")), cuv = R.fraze.length ? R.fraze : R.tok, poz = [];
    cuv.forEach(function (w) { var j = 0; while ((j = n.indexOf(w, j)) >= 0 && poz.length < 400) { if (j === 0 || !/[a-z0-9]/.test(n[j - 1])) poz.push([j, j + w.length]); j += w.length; } });
    return poz.sort(function (a, b) { return a[0] - b[0]; });
  }
  function dosFragmente(text, R, max, lat) {   // ferestre în jurul aparițiilor, unite când se suprapun
    lat = lat || 450;
    var poz = dosPozitii(text, R), fer = [];
    poz.forEach(function (p) {
      var a = Math.max(0, p[0] - lat), b = Math.min(text.length, p[1] + lat), u = fer[fer.length - 1];
      if (u && a <= u[1]) u[1] = Math.max(u[1], b); else fer.push([a, b]);
    });
    return fer.slice(0, max || 8).map(function (f) { return (f[0] > 0 ? "… " : "") + text.slice(f[0], f[1]).replace(/\s+/g, " ").trim() + (f[1] < text.length ? " …" : ""); });
  }
  function dosFragmenteTr(it, R, max) {   // transcriere: segmentele găsite, cu câte două înainte și după, și minutul
    var S = it.seg || [], hms = function (x) { x = Math.floor(x); return Math.floor(x / 3600) + ":" + ("0" + Math.floor(x % 3600 / 60)).slice(-2) + ":" + ("0" + x % 60).slice(-2); };
    var gasite = [], fer = [];
    S.forEach(function (s, i) { if (dosPozitii(s[2], { tok: R.tok, fraze: [] }).length || R.fraze.some(function (f) { return ftNormPoz(s[2]).indexOf(f) >= 0; })) gasite.push(i); });
    gasite.forEach(function (i) { var a = Math.max(0, i - 2), b = Math.min(S.length - 1, i + 2), u = fer[fer.length - 1]; if (u && a <= u[1] + 1) u[1] = b; else fer.push([a, b]); });
    return fer.slice(0, max || 8).map(function (f) { return "[" + hms(S[f[0]][0]) + "] " + S.slice(f[0], f[1] + 1).map(function (s) { return s[2]; }).join(" "); });
  }
  function dosText(it) {   // textul complet al unui document din dosar
    if (it.sursa === "ft") return ftText(it.id);
    if (it.sursa === "sc") return dosIntern().then(function (L) { var x = L.filter(function (d) { return d.id === it.id; })[0]; return x ? x.text : ""; });
    return dosTranscrieri().then(function (L) { var x = L.filter(function (d) { return d.k === it.k; })[0]; if (x) it.seg = x.seg; return x ? x.text : ""; });
  }
  function dosIntern2Item(d) { return { k: "sc:" + d.id, sursa: "sc", fel: "comunale", id: d.id, titlu: d.titlu, data: d.data, url: d.url, link: "#comunale/documente" }; }
  function dosFt2Item(d) { return { k: "ft:" + d[0], sursa: "ft", fel: d[1], id: d[0], titlu: d[2], data: d[3] || (d[4] ? String(d[4]) : null), url: d[7], link: d[6] }; }

  function dosarIntern(el) {
    if (!INTERN) return;
    var S = dosSel();
    el.innerHTML = head("Dosar pe temă", "Cauți o temă în tot ce are monitorul, alegi documentele și descarci un singur fișier, pe care îl încarci într-un chat AI (de exemplu în proiectul „RC - Monitor local”) sau îl salvezi în documentele proiectului. Datele personale (CNP, act de identitate, domiciliu) se ascund la export.") +
      '<section class="card section"><div class="filters"><input type="search" id="ds-q" placeholder="Tema: cuvinte din text, de ex. termoficare pierderi; „expresie exactă” între ghilimele" aria-label="Tema dosarului">' +
      '<input id="ds-a1" type="number" min="2000" max="2100" placeholder="din anul" aria-label="Din anul" style="max-width:8em"><input id="ds-a2" type="number" min="2000" max="2100" placeholder="până în" aria-label="Până în anul" style="max-width:8em">' +
      '<button class="btn" id="ds-go" type="button">Caută</button></div><div class="ds-feluri" id="ds-f"><span class="muted">Se încarcă felurile de documente...</span></div>' +
      '<p class="note">Găsește documentele care conțin toate cuvintele (poți scrie doar începutul unui cuvânt). Poți face mai multe căutări: ce bifezi se adună în același dosar și rămâne bifat și dacă revii pe pagină.</p></section>' +
      '<section class="card section ds-cos"><h2>Dosarul tău <span class="nr-b n" id="ds-n">0</span></h2><div id="ds-lista"></div>' +
      '<div class="filters"><input id="ds-titlu" placeholder="Titlul dosarului (ex. Termoficare 2024-2026)" aria-label="Titlul dosarului">' +
      '<select id="ds-mod" aria-label="Ce intră din fiecare document"><option value="fr">Fragmentele relevante (recomandat)</option><option value="tot">Textul complet</option></select>' +
      '<button class="btn" id="ds-exp" type="button">Pregătește fișierul</button><button class="btn-s" id="ds-gol" type="button">Golește dosarul</button></div><div id="ds-out"></div></section>' +
      '<div id="ds-rez"></div>';
    var feluri = {};
    function cos() {
      var k = Object.keys(S).sort(function (a, b) { return String(S[b].data || "").localeCompare(String(S[a].data || "")); });
      $("ds-n").textContent = k.length;
      $("ds-lista").innerHTML = k.length ? '<ol class="ds-l">' + k.map(function (x) { var it = S[x]; return '<li><span class="tag">' + esc(dosFel(it.fel)) + "</span> " + (it.data ? '<span class="muted">' + esc(zi(it.data)) + "</span> " : "") + esc(it.titlu || "(fără titlu)") +
        ' <span class="muted">(căutat: „' + esc(it.q) + '”)</span> <button type="button" class="btn-s" data-scoate="' + esc(x) + '">scoate</button></li>'; }).join("") + "</ol>" : '<p class="empty">Niciun document încă. Caută mai sus și bifează.</p>';
      Array.prototype.forEach.call($("ds-lista").querySelectorAll("button[data-scoate]"), function (b) { b.addEventListener("click", function () { delete S[b.dataset.scoate]; dosSalveaza(); cos(); bifeaza(); }); });
    }
    function bifeaza() { Array.prototype.forEach.call(document.querySelectorAll("#ds-rez input[data-k]"), function (c) { c.checked = !!S[c.dataset.k]; }); }
    cos();
    Promise.all([ftMeta().catch(function () { return { docs: [] }; }), dosIntern()]).then(function (d) {
      var nrF = {}; (d[0].docs || []).forEach(function (x) { nrF[x[1]] = (nrF[x[1]] || 0) + 1; });
      nrF.comunale = d[1].length; nrF.tr = null;
      $("ds-f").innerHTML = Object.keys(nrF).sort(function (a, b) { return (nrF[b] || 0) - (nrF[a] || 0); }).map(function (f) {
        return '<label class="ds-fel"><input type="checkbox" value="' + esc(f) + '"' + (f === "tr" || f === "cu" || f === "ac" ? "" : " checked") + "> " + esc(dosFel(f)) + (nrF[f] != null ? ' <span class="muted">(' + nr(nrF[f]) + ")</span>" : ' <span class="muted">(se încarcă la căutare)</span>') + "</label>";
      }).join(" ");
    });
    function cauta() {
      var q = $("ds-q").value.trim(), R = ftInterpreteaza(q), out = $("ds-rez");
      if (!R.tok.length && !R.fraze.length) { out.innerHTML = '<section class="card section"><p class="empty">Scrie cuvinte de cel puțin trei litere.</p></section>'; return; }
      var alese = Array.prototype.map.call(document.querySelectorAll("#ds-f input:checked"), function (c) { return c.value; });
      var a1 = +$("ds-a1").value || 0, a2 = +$("ds-a2").value || 9999;
      var inAni = function (it) { var an = +(String(it.data || "").slice(0, 4)) || 0; return !an ? !(a1 || a2 < 9999) : an >= a1 && an <= a2; };
      out.innerHTML = '<section class="card section"><p class="updated">Se caută' + (alese.indexOf("tr") >= 0 && !DOS.tr ? " (prima dată se încarcă și transcrierile, durează puțin)" : "") + "...</p></section>";
      var ftFel = alese.filter(function (f) { return f !== "comunale" && f !== "tr"; });
      Promise.all([
        ftFel.length ? ftCauta(q, ftFel).then(function (X) { return X.gol ? { items: [], ignorate: X.ignorate } : { items: X.ids.map(function (i) { return dosFt2Item(FT.docs[i]); }), ignorate: X.ignorate }; }) : { items: [] },
        alese.indexOf("comunale") >= 0 ? dosIntern().then(function (L) { return L.filter(function (x) { return dosPotrivire(x.text + " " + x.titlu, R); }).map(dosIntern2Item); }) : [],
        alese.indexOf("tr") >= 0 ? dosTranscrieri().then(function (L) { return L.filter(function (x) { return dosPotrivire(x.text, R); }); }) : []
      ]).then(function (d) {
        var L = d[0].items.concat(d[1], d[2]).filter(inAni).sort(function (a, b) { return String(b.data || "").localeCompare(String(a.data || "")); });
        var ign = d[0].ignorate || [];
        var shown = 0;
        out.innerHTML = '<section class="card section"><h2>Rezultate <span class="nr-b n">' + nr(L.length) + "</span></h2>" + (ign.length ? '<p class="note">Ignorat la hotărâri, procese-verbale etc. (apar în aproape toate documentele): ' + esc(ign.join(", ")) + ".</p>" : "") +
          (L.length ? '<div class="filters"><button type="button" class="btn-s" id="ds-toate">Bifează tot ce e afișat</button><button type="button" class="btn-s" id="ds-niciunul">Debifează tot ce e afișat</button></div>' : '<p class="empty">Niciun document nu conține toate cuvintele.</p>') +
          '<div id="ds-l"></div><button class="more" id="ds-more" hidden>Arată mai multe</button></section>';
        function arata(n) {
          var b = L.slice(shown, shown + n); shown += b.length;
          $("ds-l").insertAdjacentHTML("beforeend", b.map(function (it) {
            return '<div class="doc ds-it"><label class="h"><input type="checkbox" data-k="' + esc(it.k) + '"' + (S[it.k] ? " checked" : "") + '> <span class="tag">' + esc(dosFel(it.fel)) + "</span>" + (it.data ? '<span class="muted">' + esc(zi(it.data)) + "</span>" : "") + "</label>" +
              '<div class="t">' + (it.link ? '<a href="' + esc(it.link) + '">' + esc(it.titlu || "(fără titlu)") + "</a>" : esc(it.titlu || "(fără titlu)")) + '</div><div class="fr muted" data-fr="' + esc(it.k) + '">se încarcă fragmentul...</div>' +
              '<div class="m">' + (safeUrl(it.url) ? '<a href="' + esc(safeUrl(it.url)) + '" rel="noopener">' + (it.sursa === "tr" ? "înregistrarea" : "documentul original") + "</a>" : "") + "</div></div>";
          }).join(""));
          b.forEach(function (it) {
            Array.prototype.forEach.call($("ds-l").querySelectorAll('input[data-k="' + it.k.replace(/"/g, "") + '"]'), function (c) {
              c.addEventListener("change", function () { if (c.checked) S[it.k] = { k: it.k, sursa: it.sursa, fel: it.fel, id: it.id, titlu: it.titlu, data: it.data, url: it.url, link: it.link, q: q }; else delete S[it.k]; dosSalveaza(); cos(); });
            });
            dosText(it).then(function (t) {
              var f = $("ds-l").querySelector('[data-fr="' + it.k.replace(/"/g, "") + '"]'); if (!f) return;
              var fr = it.sursa === "tr" ? dosFragmenteTr(it, R, 1) : dosFragmente(t, R, 1, 160);
              f.textContent = fr.length ? dosAscunde(fr[0]) : (R.fraze.length ? "(nu conține expresia exactă; probabil nu e relevant)" : "");
            });
          });
          $("ds-more").hidden = shown >= L.length;
        }
        if (L.length) {
          arata(40);
          $("ds-more").addEventListener("click", function () { arata(40); });
          $("ds-toate").addEventListener("click", function () { L.slice(0, shown).forEach(function (it) { S[it.k] = { k: it.k, sursa: it.sursa, fel: it.fel, id: it.id, titlu: it.titlu, data: it.data, url: it.url, link: it.link, q: q }; }); dosSalveaza(); cos(); bifeaza(); });
          $("ds-niciunul").addEventListener("click", function () { L.slice(0, shown).forEach(function (it) { delete S[it.k]; }); dosSalveaza(); cos(); bifeaza(); });
        }
        if (!$("ds-titlu").value) $("ds-titlu").value = q.replace(/["„”]/g, "");
      });
    }
    $("ds-go").addEventListener("click", cauta);
    $("ds-q").addEventListener("keydown", function (e) { if (e.key === "Enter") cauta(); });
    $("ds-gol").addEventListener("click", function () { if (!Object.keys(S).length || !window.confirm("Golești dosarul?")) return; Object.keys(S).forEach(function (k) { delete S[k]; }); dosSalveaza(); cos(); bifeaza(); $("ds-out").innerHTML = ""; });
    $("ds-exp").addEventListener("click", function () {
      var k = Object.keys(S).sort(function (a, b) { return String(a.data || "9999").localeCompare(String(b.data || "9999")); });   // în ordine cronologică
      if (!k.length) { $("ds-out").innerHTML = '<p class="empty">Dosarul e gol.</p>'; return; }
      var tot = $("ds-mod").value === "tot", titlu = ($("ds-titlu").value || "dosar").replace(/[_\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
      $("ds-out").innerHTML = '<p class="updated">Se pregătește (0 din ' + k.length + ")...</p>";
      var gata = 0, baza = location.origin + location.pathname;
      var lot = function (i) {
        if (i >= k.length) return Promise.resolve();
        return Promise.all(k.slice(i, i + 6).map(function (x) {
          var it = S[x];
          return dosText(it).then(function (t) {
            var R = ftInterpreteaza(it.q || ""), corp;
            if (tot) corp = it.sursa === "tr" ? (it.seg || []).map(function (s) { var x2 = Math.floor(s[0]); return "[" + Math.floor(x2 / 3600) + ":" + ("0" + Math.floor(x2 % 3600 / 60)).slice(-2) + ":" + ("0" + x2 % 60).slice(-2) + "] " + s[2]; }).join("\n") : t;
            else corp = (it.sursa === "tr" ? dosFragmenteTr(it, R, 12) : dosFragmente(t, R, 10)).map(function (f) { return "> " + f; }).join("\n\n") || "(fragmentul nu a fost găsit în text; vezi documentul original)";
            it._corp = dosAscunde(corp).replace(/—/g, " - ");
            $("ds-out").firstChild.textContent = "Se pregătește (" + (++gata) + " din " + k.length + ")...";
          });
        })).then(function () { return lot(i + 6); });
      };
      lot(0).then(function () {
        var azi = zi(new Date().toISOString().slice(0, 10)), cautari = [];
        k.forEach(function (x) { if (cautari.indexOf(S[x].q) < 0) cautari.push(S[x].q); });
        var listaDoc = k.map(function (x, i) { var it = S[x]; return (i + 1) + ". " + (it.data ? zi(it.data) + " | " : "") + dosFel(it.fel) + " | " + it.titlu + (safeUrl(it.url) ? " | " + it.url : ""); }).join("\n");
        var instr = "## Instrucțiuni pentru chat\n\n" +
          "- Folosește doar documentele din acest dosar. Dacă un răspuns nu reiese din ele, spune asta și spune ce document ar lipsi.\n" +
          "- La fiecare afirmație, citează documentul: felul, numărul și data, cu linkul original din listă.\n" +
          "- Textele documentelor scanate sunt citite automat (OCR) și pot avea greșeli: cifrele, numele și voturile se verifică pe documentul original înainte de publicare.\n" +
          "- Transcrierile ședințelor sunt automate: citatele și voturile se verifică pe înregistrare, la minutul indicat.\n" +
          "- " + (tot ? "Fiecare document apare cu textul complet." : "Din fiecare document apar doar fragmentele în care se găsesc cuvintele căutate; pentru context, deschide documentul original.") + "\n" +
          "- Datele personale (CNP, act de identitate, domiciliu) au fost ascunse.\n\n";
        var blocuri = k.map(function (x, i) {
          var it = S[x];
          return "## " + (i + 1) + ". " + it.titlu + "\n\nFelul: " + dosFel(it.fel) + (it.data ? ". Data: " + zi(it.data) : "") + ".\n" + (safeUrl(it.url) ? "Original: " + it.url + "\n" : "") + (it.link ? "În monitor (intern): " + baza + it.link + "\n" : "") +
            "\n" + (tot ? "Textul:\n\n```\n" + it._corp + "\n```" : "Fragmente:\n\n" + it._corp) + "\n";
        });
        var LIM = 250000, parti = [[]], lung = 0;
        blocuri.forEach(function (b) { if (lung + b.length > LIM && parti[parti.length - 1].length) { parti.push([]); lung = 0; } parti[parti.length - 1].push(b); lung += b.length; });
        var fis = parti.map(function (p, i) {
          var n = parti.length, cap = "# Dosar: " + titlu + (n > 1 ? " (partea " + (i + 1) + " din " + n + ")" : "") + "\n\n" +
            "Generat la " + azi + " din Monitorul local al Asociației Rădăuțiul Civic (date din surse publice: site-ul Primăriei Rădăuți, site-ul Servicii Comunale, înregistrările ședințelor). " +
            "Căutări: " + cautari.map(function (c) { return "„" + c + "”"; }).join("; ") + ". Documente: " + k.length + (n > 1 ? ", împărțite în " + n + " fișiere" : "") + ".\n\n" + instr +
            "## Lista documentelor\n\n" + listaDoc + "\n\n";
          return { nume: "Dosar " + titlu + (n > 1 ? " partea " + (i + 1) + " din " + n : "") + ".md", text: cap + p.join("\n") };
        });
        $("ds-out").innerHTML = '<p class="note">' + (fis.length > 1 ? "Dosarul e mare, așa că e împărțit în " + fis.length + " fișiere. Încarcă-le pe toate în același chat." : "Fișierul e gata.") + " Îl poți încărca într-un chat nou al proiectului sau îl poți salva în documentele proiectului, ca să-l vadă toate chaturile.</p>" +
          fis.map(function (f, i) { return '<div class="filters"><button type="button" class="btn" data-f="' + i + '">Descarcă „' + esc(f.nume) + '”</button><button type="button" class="btn-s" data-c="' + i + '">Copiază textul</button><span class="muted">' + nr(Math.round(f.text.length / 1000)) + " mii de caractere</span></div>"; }).join("");
        Array.prototype.forEach.call($("ds-out").querySelectorAll("button[data-f]"), function (b) {
          b.addEventListener("click", function () {
            var f = fis[+b.dataset.f], a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([f.text], { type: "text/markdown;charset=utf-8" })); a.download = f.nume;
            document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
          });
        });
        Array.prototype.forEach.call($("ds-out").querySelectorAll("button[data-c]"), function (b) {
          b.addEventListener("click", function () {
            var f = fis[+b.dataset.c];
            (navigator.clipboard ? navigator.clipboard.writeText(f.text) : Promise.reject()).then(function () { b.textContent = "Copiat"; }, function () { b.textContent = "Nu s-a putut copia; descarcă fișierul"; });
          });
        });
      });
    });
  }
  // data scrisă în adresa videoclipului (ex. „...-24-noe2026”, „24-11-2026”), ca să prindem o dată greșită aleasă în panou
  var LUNI_URL = { ian: 1, feb: 2, mar: 3, apr: 4, mai: 5, iun: 6, iul: 7, aug: 8, sep: 9, oct: 10, noi: 11, noe: 11, nov: 11, dec: 12 };
  function dataDinUrl(u) {
    u = (u || "").toLowerCase();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    var m = u.match(new RegExp("(?:^|[^\\d])(\\d{1,2})[-_.](" + Object.keys(LUNI_URL).join("|") + ")[a-z]*[-_.]?(20\\d\\d)(?!\\d)"));
    if (m) return m[3] + "-" + p(LUNI_URL[m[2]]) + "-" + p(+m[1]);
    m = u.match(/(?:^|[^\d])(\d{1,2})[-_.](\d{1,2})[-_.](20\d\d)(?!\d)/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return m[3] + "-" + p(+m[2]) + "-" + p(+m[1]);
    return null;
  }
  function panouRezumate(el) {
    if (!INTERN) return;
    el.innerHTML = head("Rezumatele ședințelor (panou)", "Adaugă înregistrarea unei ședințe; fluxul „Transcriere ședințe” o transcrie (Whisper) și scrie ciorna rezumatului. Aici o citești, o corectezi și o aprobi; abia atunci apare pe pagina publică a ședinței.") +
      '<section class="card section"><h2>Adaugă o înregistrare</h2><div class="filters"><input id="v-data" type="date" aria-label="Data ședinței"><input id="v-url" type="url" placeholder="Linkul videoclipului (Facebook sau YouTube), ex. https://www.facebook.com/61559725245078/videos/..." aria-label="Link"><button class="btn" id="v-add" type="button">Adaugă</button></div>' +
      '<p class="note" id="v-msg">Transcrierea pornește automat la cel mult 6 ore după adăugare (sau imediat, din GitHub: Actions → „Transcriere ședințe și rezumate” → Run workflow). O ședință de două ore se transcrie în câteva ore.</p></section><div id="rz-l"><p class="updated">Se încarcă...</p></div>';
    var inainte = document.querySelector("#v-msg");
    inainte.insertAdjacentHTML("afterend", '<details class="v-bloc"><summary><b>Adaugă mai multe deodată</b> (ședințele din trecut)</summary>' +
      '<p class="note">Câte una pe rând: data ședinței și linkul, de exemplu <code>2025-03-31 https://www.facebook.com/61559725245078/videos/123...</code>. Data poate fi scrisă și 31.03.2025. Ședințele lungi transmise în două părți: două rânduri cu aceeași dată.</p>' +
      '<textarea id="v-bloc" rows="8" placeholder="2025-03-31 https://www.facebook.com/..."></textarea><button class="btn" id="v-bloc-add" type="button">Adaugă toate</button> <span id="v-bloc-msg" class="muted"></span></details>');
    $("v-bloc-add").addEventListener("click", function () {
      var linii = $("v-bloc").value.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean), bune = [], rele = [];
      linii.forEach(function (l) {
        var m = l.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})/), u = l.match(/https:\/\/\S+/);
        if (!m || !u) { rele.push(l); return; }
        var d = m[1].indexOf(".") > 0 ? m[1].split(".").reverse().map(function (x) { return x.length < 2 ? "0" + x : x; }).join("-") : m[1];
        bune.push({ data: d, url: u[0] });
      });
      var msg = $("v-bloc-msg"), ok = 0, er = [];
      msg.textContent = "Se adaugă " + bune.length + "...";
      bune.reduce(function (p, x) { return p.then(function () { return apiPost({ act: "video", data: x.data, url: x.url }).then(function () { ok++; }, function (e) { er.push(x.data + ": " + e.message); }); }); }, Promise.resolve())
        .then(function () { msg.textContent = ok + " adăugate" + (er.length ? "; erori: " + er.join("; ") : "") + (rele.length ? "; rânduri fără dată sau link: " + rele.length : "") + "."; if (!er.length && !rele.length) $("v-bloc").value = ""; lista(); });
    });
    $("v-add").addEventListener("click", function () {
      var d = $("v-data").value, u = $("v-url").value.trim();
      $("v-msg").textContent = "Se salvează...";
      var du = dataDinUrl(u);
      if (du && d && du !== d && !window.confirm("În link scrie data " + zi(du) + ", iar tu ai ales " + zi(d) + ". Adaugi totuși cu data " + zi(d) + "?")) { $("v-msg").textContent = "Neadăugată: verifică data."; return; }
      apiPost({ act: "video", data: d, url: u }).then(function (r) { $("v-msg").textContent = r.nota || "Adăugată. Apare mai jos ca „în așteptare”."; $("v-url").value = ""; lista(); })
        .catch(function (e) { $("v-msg").textContent = "Eroare: " + e.message; });
    });
    function lista() {
      Promise.all([get(API).catch(function () { return { video: [], aprobari: {} }; }), get(DATA + "rezumate.json").catch(function () { return {}; }), incarcaSed().catch(function () { return null; }),
        get(DATA + "cartoane.json?v=" + Date.now()).then(function (x) { CARTOANE_C = x; }).catch(function () { CARTOANE_C = {}; }),
        VOT !== undefined ? null : get(DATA + "voturi.json").then(function (x) { VOT = x; }).catch(function () { VOT = null; })]).then(function (d) {
        var st = d[0], C = d[1] || {}, A = st.aprobari || {}, rows = {};
        // memento: ședințele ținute în ultimele 60 de zile pentru care nu s-a adăugat nicio înregistrare
        var cuVideo = {}; (st.video || []).forEach(function (v) { cuVideo[v.data] = 1; });
        Object.keys(C).forEach(function (k) { cuVideo[k.slice(0, 10)] = 1; if (C[k].data_sedinta) cuVideo[C[k].data_sedinta] = 1; if (C[k].data) cuVideo[C[k].data] = 1; });
        var azi = new Date().toISOString().slice(0, 10), lim = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
        var lipsa = ((SED || {}).recente || []).concat((SED || {}).urmatoare || []).filter(function (c) { return c.data && c.data <= azi && c.data >= lim && !cuVideo[c.data]; })
          .sort(function (a, b) { return b.data.localeCompare(a.data); });
        (st.video || []).forEach(function (v) { var m = (v.url || "").match(/\/videos\/(\d+)/); rows[v.data + "|" + v.url] = { v: v, idp: m ? v.data + "-" + m[1] : null }; });
        var ids = Object.keys(C).sort().reverse();
        var asteapta = Object.keys(rows).map(function (k) { return rows[k]; }).filter(function (x) { return !x.idp || !C[x.idp]; });
        var h = (lipsa.length ? '<section class="card section rz-lipsa"><h2>Ședințe fără înregistrare adăugată <span class="nr-b n">' + lipsa.length + "</span></h2>" +
          '<p class="note">Caută înregistrarea pe pagina de Facebook care transmite ședințele (Jurnalist Live) sau în articolul ședinței de pe radautiziar.ro, apoi adaug-o mai sus.</p>' +
          lipsa.map(function (c) { return '<div class="doc"><div class="h"><span class="id">' + esc(zi(c.data)) + "</span> " + esc(TIP[c.tip] || "") + (c.ora ? ", ora " + esc(c.ora) : "") +
            ' <button type="button" class="btn-s" data-zi="' + esc(c.data) + '">Completează data</button></div></div>'; }).join("") + "</section>" : "") +
          (asteapta.length ? '<section class="card section"><h2>În așteptarea transcrierii</h2>' + asteapta.map(function (x) {
          var du = dataDinUrl(x.v.url), nep = du && du !== x.v.data;
          return '<div class="doc' + (nep ? " v-nep" : "") + '"><div class="h"><span class="id">' + esc(zi(x.v.data)) + '</span><span class="muted">adăugată ' + esc(zi(x.v.adaugat_la)) + "</span></div>" +
            (nep ? '<p class="note"><b>Data nu se potrivește cu linkul:</b> în link scrie ' + esc(zi(du)) + ". Până o corectezi, înregistrarea nu se transcrie.</p>" : "") +
            '<div class="m"><a href="' + esc(safeUrl(x.v.url) || "#") + '" rel="noopener">' + esc(x.v.url) + "</a></div>" +
            '<div class="filters v-mod"><input type="date" value="' + esc(nep ? du : x.v.data) + '" aria-label="Data corectă a ședinței"><button type="button" class="btn-s" data-act="data" data-url="' + esc(x.v.url) + '">Schimbă data</button>' +
            '<button type="button" class="btn-s" data-act="scoate" data-url="' + esc(x.v.url) + '">Scoate din listă</button></div></div>';
        }).join("") + "</section>" : "") +
          (ids.length ? ids.map(function (id) { return ciornaHtml(id, C[id], A[id]); }).join("") : '<section class="card section"><p class="empty">Nicio ciornă încă.</p></section>');
        $("rz-l").innerHTML = h;
        Array.prototype.forEach.call($("rz-l").querySelectorAll(".v-mod button"), function (b) {
          b.addEventListener("click", function () {
            var sc = b.dataset.act === "scoate", d = b.parentNode.querySelector("input").value;
            if (sc && !window.confirm("Scoți înregistrarea din lista de transcris?")) return;
            b.disabled = true;
            apiPost(sc ? { act: "video-modifica", url: b.dataset.url, scoate: 1 } : { act: "video-modifica", url: b.dataset.url, data: d }).then(lista).catch(function (e) { b.disabled = false; alert(e.message); });
          });
        });
        Array.prototype.forEach.call($("rz-l").querySelectorAll("button[data-zi]"), function (b) { b.addEventListener("click", function () { $("v-data").value = b.dataset.zi; $("v-url").focus(); window.scrollTo(0, 0); }); });
        ids.forEach(function (id) { legaCiorna(id, C[id], A[id]); });
        legaVideo($("rz-l"));
      });
    }
    lista();
  }
  var STARE_RZ = { aprobat: ["Aprobat, public", "c"], respins: ["Respins", "p"], refa: ["Refacere cerută", "par"], ciorna: ["Ciornă", "ic"] };
  // înregistrarea ședinței încorporată în pagină (intern): Facebook sau YouTube; se încarcă doar când e deschisă
  function videoEmbedUrl(u, start) {
    u = safeUrl(u) || "";
    var y = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
    if (y) return "https://www.youtube-nocookie.com/embed/" + y[1] + "?rel=0" + (start ? "&start=" + Math.floor(start) : "");
    if (/facebook\.com|fb\.watch/.test(u)) return "https://www.facebook.com/plugins/video.php?href=" + encodeURIComponent(u) + "&show_text=false";
    return null;
  }
  function videoBox(u, deschis) {
    var e = videoEmbedUrl(u);
    return e ? '<details class="vid"' + (deschis ? " open" : "") + ' data-src="' + esc(e) + '"><summary>Vezi înregistrarea aici</summary><div class="vid-f"></div></details>' : "";
  }
  function legaVideo(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll("details.vid"), function (d) {
      var pune = function () { var f = d.querySelector(".vid-f"); if (d.open && !f.firstChild) f.innerHTML = '<iframe src="' + esc(d.dataset.src) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" title="Înregistrarea ședinței"></iframe>'; };
      d.addEventListener("toggle", pune); pune();
    });
  }
  var CARTOANE_C = null;   // intern/date/cartoane.json: cartoanele și textele făcute automat din rezumate (ciorne și aprobate)
  function rzVoturiPv(c, R) {
    var d = c.data_sedinta || c.data, s = VOT && (VOT.sedinte || []).filter(function (x) { return x.data === d; })[0];
    var P = (R.puncte || []).filter(function (p) { return p.vot && (p.vot.rezultat || p.vot.detalii); });
    if (!P.length && !s) return "";
    return '<details class="rz-v" open><summary><b>Verificarea voturilor</b> ' + (s ? '<span class="muted">rezumatul (din înregistrare) alături de procesul-verbal</span>' : '<span class="warn-t">procesul-verbal nu e publicat încă: verifică pe înregistrare</span>') + "</summary>" +
      '<div class="rz-v2"><div><h4>Din rezumat</h4>' + (P.length ? "<ol>" + P.map(function (p) { return "<li><b>" + esc(p.vot.rezultat || "?") + "</b> " + esc(p.vot.detalii || "") + ' <small class="muted">' + esc((p.titlu || "").slice(0, 80)) + "</small></li>"; }).join("") + "</ol>" : '<p class="empty">Fără voturi în rezumat.</p>') + "</div>" +
      "<div><h4>Din procesul-verbal</h4>" + (s ? "<ol>" + (s.voturi || []).filter(function (v) { return !v.procedural; }).map(function (v) { return "<li>" + votHtml(v) + ' <small class="muted">' + esc((v.titlu || "").replace(/^[\s\S]{0,120}?\b(privind|pentru)\b/i, "$1").slice(0, 90)) + "</small></li>"; }).join("") + "</ol>" : '<p class="empty">Încă nepublicat.</p>') + "</div></div></details>";
  }
  function rzPostare(id) {
    var x = CARTOANE_C && CARTOANE_C[id];
    if (!x) return '<p class="note">Cartoanele pentru Facebook și Instagram se fac automat la următoarea rulare a fluxului de transcriere și apar aici.</p>';
    return '<details class="rz-post"><summary><b>Postarea: ' + (x.cartoane || []).length + " cartoane și textele</b> " + (x.sursa === "ciorna" ? '<span class="muted">(din ciornă; se refac după aprobare)</span>' : "") + "</summary>" +
      '<div class="an-grid">' + (x.cartoane || []).map(function (n, i) { var u = "cartoane/" + encodeURIComponent(id) + "/" + encodeURIComponent(n) + "?v=" + encodeURIComponent(x.generat_la || "");
        return '<a href="' + esc(u) + '" download="' + esc("Sedinta " + x.data + " " + (i + 1) + ".png") + '"><img loading="lazy" src="' + esc(u) + '" alt=""><span>' + (i + 1) + ". " + esc((x.titluri || [])[i] || "") + "</span></a>"; }).join("") + "</div>" +
      ((x.postari || {}).facebook ? postBox(x.postari.facebook, "Facebook") : "") + ((x.postari || {}).instagram ? postBox(x.postari.instagram, "Instagram") : "") +
      '<p class="note"><a href="#analize/' + esc(encodeURIComponent(id)) + '">Deschide pe pagina Analize</a></p></details>';
  }
  function ciornaHtml(id, c, a) {
    var s = (a && a.stare) || "ciorna", R = (a && a.stare === "aprobat" && a.rezumat) || c.rezumat || {}, k = "c-" + id;
    var inp = function (f, v, mare) { return mare ? '<textarea data-f="' + f + '" rows="' + Math.min(10, Math.max(2, Math.ceil(String(v || "").length / 110))) + '">' + esc(v || "") + "</textarea>" : '<input data-f="' + f + '" value="' + esc(v || "") + '">'; };
    return '<section class="card section rz-c" id="' + k + '"><div class="h-row"><h2>Ședința din ' + esc(zi(c.data_sedinta || c.data)) + ' <span class="rz ' + STARE_RZ[s][1] + '">' + STARE_RZ[s][0] + "</span></h2>" +
      '<span class="lnks"><a href="' + esc(safeUrl(c.url) || "#") + '" rel="noopener">înregistrarea</a><a href="#rezumate/transcriere/' + esc(encodeURIComponent(id)) + '">transcrierea</a></span></div>' +
      '<p class="note">' + esc(c.titlu || "") + (c.durata ? " · " + Math.round(c.durata / 60) + " minute" : "") + " · " + (c.are_pv ? "cu procesul-verbal" : "fără procesul-verbal (nepublicat la generare)") +
      (R._model ? " · model " + esc(R._model) : "") + (a ? " · decizie: " + esc(a.stare) + " " + esc(zi(a.la)) + (a.de ? " (" + esc(a.de) + ")" : "") : "") + "</p>" +
      (c.eroare ? '<p class="callout">Rezumatul n-a putut fi generat: ' + esc(c.eroare) + "</p>" : "") +
      ((R.observatii || []).length ? '<div class="callout"><b>De verificat (semnalat de model):</b><ul>' + R.observatii.map(function (o) { return "<li>" + esc(o) + "</li>"; }).join("") + "</ul></div>" : "") +
      videoBox(c.url) + rzVoturiPv(c, R) +
      (c.rezumat || (a && a.rezumat) ? '<div class="rz-ed"><label>Rezumatul ședinței</label>' + inp("rezumat", R.rezumat, true) +
        (R.puncte || []).map(function (p, i) {
          var v = p.vot || {};
          return '<fieldset data-p="' + i + '"><legend>Punctul ' + esc(p.nr) + ' <small class="muted">minut ' + esc(p.minut || "-") + "</small></legend>" +
            "<label>Titlu</label>" + inp("titlu", p.titlu) + "<label>Pe scurt</label>" + inp("pe_scurt", p.pe_scurt, true) + "<label>Discuția</label>" + inp("discutie", p.discutie, true) +
            (p.interventii || []).map(function (t, j) { return '<div class="rz-int" data-i="' + j + '">' + inp("cine", t.cine) + inp("minut", t.minut) + inp("ce", t.ce, true) + "</div>"; }).join("") +
            '<div class="rz-vot"><label>Vot</label>' + inp("vot_rezultat", v.rezultat) + inp("vot_detalii", v.detalii) + inp("vot_sursa", v.sursa) + "<label>HCL</label>" + inp("hcl", p.hcl) + "</div></fieldset>";
        }).join("") +
        '<label class="rz-chk"><input type="checkbox" data-verif> Am verificat pe înregistrare rezultatul fiecărui vot (pentru, împotrivă, abțineri)</label>' +
        '<div class="rz-act"><button class="btn ok" data-a="aprobat" type="button">Aprobă și publică</button><button class="btn" data-a="refa" type="button">Cere refacerea</button><button class="btn rau" data-a="respins" type="button">Respinge</button>' +
        (s === "aprobat" ? '<button class="btn" data-a="ciorna" type="button">Retrage de pe public</button>' : "") + '<span class="rz-msg muted"></span></div></div>' : '<p class="empty">Fără rezumat încă.</p>') +
      rzPostare(id) + "</section>";
  }
  function legaCiorna(id, c, a) {
    var sec = $("c-" + id); if (!sec) return;
    // câmpurile de text cresc cât textul, ca să se vadă tot fără derulare
    Array.prototype.forEach.call(sec.querySelectorAll("textarea"), function (t) {
      var creste = function () { t.style.height = "auto"; t.style.height = (t.scrollHeight + 4) + "px"; };
      t.addEventListener("input", creste); creste();
    });
    Array.prototype.forEach.call(sec.querySelectorAll(".rz-act button"), function (b) {
      b.addEventListener("click", function () {
        var stare = b.dataset.a, msg = sec.querySelector(".rz-msg"), ck = sec.querySelector("[data-verif]");
        if (stare === "aprobat" && ck && !ck.checked) { msg.textContent = "Bifează întâi că ai verificat voturile pe înregistrare."; ck.focus(); return; }
        var R = JSON.parse(JSON.stringify((a && a.stare === "aprobat" && a.rezumat) || c.rezumat || {}));
        var val = function (root, f) { var e = root.querySelector('[data-f="' + f + '"]'); return e ? e.value.trim() : null; };
        R.rezumat = val(sec.querySelector(".rz-ed"), "rezumat");
        Array.prototype.forEach.call(sec.querySelectorAll("fieldset[data-p]"), function (fs) {
          var p = R.puncte[+fs.dataset.p];
          ["titlu", "pe_scurt", "discutie", "hcl"].forEach(function (f) { p[f] = val(fs, f) || null; });
          p.vot = { rezultat: val(fs, "vot_rezultat") || null, detalii: val(fs, "vot_detalii") || null, sursa: val(fs, "vot_sursa") || null };
          Array.prototype.forEach.call(fs.querySelectorAll(".rz-int"), function (d) { var t = p.interventii[+d.dataset.i]; t.cine = val(d, "cine"); t.minut = val(d, "minut"); t.ce = val(d, "ce"); });
          p.interventii = (p.interventii || []).filter(function (t) { return t.ce; });
        });
        delete R._tokeni; delete R.observatii;
        msg.textContent = "Se salvează...";
        apiPost({ act: "decizie", id: id, stare: stare, rezumat: stare === "aprobat" ? R : undefined, data: c.data_sedinta || c.data, url: c.url, titlu: c.titlu })
          .then(function () { msg.textContent = stare === "aprobat" ? "Aprobat: e public pe pagina ședinței." : stare === "refa" ? "Refacerea se face la următoarea rulare a fluxului de transcriere." : "Salvat."; REZ = null; })
          .catch(function (e) { msg.textContent = "Eroare: " + e.message; });
      });
    });
  }

  // ---------- Pentru cetățeni: ședința următoare, noutățile, strada mea ----------
  var SED = null, NOU = null;
  var TIP_SED = { ordinara: "ordinară", extraordinara: "extraordinară", extraordinara_de_indata: "extraordinară, convocată de îndată" };
  var ZILE_S = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];
  function ziSapt(s) { var d = new Date(s + "T12:00:00"); return isNaN(d) ? "" : ZILE_S[d.getDay()] + ", "; }
  function catePana(s) { var n = Math.round((new Date(s + "T12:00:00") - new Date(new Date().toISOString().slice(0, 10) + "T12:00:00")) / 864e5); return n === 0 ? "azi" : n === 1 ? "mâine" : n > 1 ? "peste " + n + " zile" : ""; }
  function incarcaSed() { return SED ? Promise.resolve(SED) : get(DATA + "sedinte.json").then(function (d) { SED = d; return d; }).catch(function () { SED = { urmatoare: [], recente: [], consultare: [] }; return SED; }); }
  function incarcaNou() { return NOU ? Promise.resolve(NOU) : get(DATA + "noutati.json").then(function (d) { NOU = d; return d; }).catch(function () { NOU = { evenimente: [], tipuri: {} }; return NOU; }); }
  // ---------- Texte gata de postat: înainte de ședință (punctele importante) și după (cum s-a votat) ----------
  var IMP_RX = [[/buget|rectific/, 5], [/impozit|tax[ae]|tarif|pret|majorar/, 5], [/vanzar|vinde|concesion|inchiri|schimb de teren|dezmembr|alipir/, 4], [/investit|indicator|modernizar|reabilit|construir|asfalt|extinder/, 4],
    [/imprumut|credit|finantar|cofinant|pnrr|fonduri/, 4], [/\bpuz\b|\bpug\b|\bpud\b|urbanis/, 3], [/strategi|regulament|organigram|stat de functii|salariz/, 3], [/asociati|societat|servicii comunale|aga\b|consiliul de administratie/, 2]];
  var IMP_NU = /proces(ul)?.verbal|presedinte(lui)? de sedinta|ordinii de zi|informar|raport(ul)? (de activitate|privind activitatea)|diverse|intrebari|interpelari/;
  function importante(od, n) {
    return od.map(function (p, i) { var t = norm(p.text || ""), sc = 0; if (!IMP_NU.test(t)) IMP_RX.forEach(function (x) { if (x[0].test(t)) sc += x[1]; }); return { p: p, i: i, sc: sc }; })
      .filter(function (x) { return x.sc > 0; }).sort(function (a, b) { return b.sc - a.sc || a.i - b.i; }).slice(0, n).sort(function (a, b) { return a.i - b.i; }).map(function (x) { return x.p; });
  }
  function scurt(t, n) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, "") + "..."; }
  function obiectPunct(t) { return scurt(String(t || "").replace(/^\s*(proiect(ul)?\s+de\s+hot[aă]r[aâ]re\s*)?(\(?\s*nr\.?[^,;]*?\)?\s*)?(privind|pentru)\s+/i, "").replace(/\s*[-–]\s*ini[tţț]iat.*$/i, ""), 150); }
  function postInainte(c) {
    var od = c.ordinea_de_zi || [], I = importante(od, 5);
    return ziSapt(c.data).replace(/, $/, "").replace(/^./, function (x) { return x.toUpperCase(); }) + ", " + zi(c.data) + (c.ora ? ", ora " + c.ora : "") + ": ședința " + (TIP_SED[c.tip] || "") + " a Consiliului Local Rădăuți." +
      (od.length ? " Pe ordinea de zi sunt " + od.length + (od.length === 1 ? " punct" : od.length < 20 ? " puncte" : " de puncte") + "." + (I.length ? " Printre cele mai importante:\n" + I.map(function (p) { return "• " + obiectPunct(p.text); }).join("\n") : "") : "") +
      "\n\nȘedințele sunt publice: poți veni să asculți. Toată ordinea de zi și proiectele, pe Monitor local: " + SITE + "s/sedinta-" + c.data + ".html";
  }
  function postDupa(data, s, H, V) {
    var t = "Ședința Consiliului Local Rădăuți din " + zi(data) + ": " + (H.length ? H.length + (H.length === 1 ? " hotărâre adoptată" : H.length < 20 ? " hotărâri adoptate" : " de hotărâri adoptate") : "hotărârile nu sunt încă publicate") + ".";
    if (s) {
      var resp = s.voturi.filter(function (v) { return v.rezultat === "respins"; }), alt = s.voturi.filter(function (v) { return (v.nume_impotriva || []).length || (v.nume_abtineri || []).length; });
      if (resp.length) t += "\nRespinse: " + resp.map(function (v) { return obiectPunct(v.titlu || (v.punct ? "punctul " + v.punct : "un proiect neidentificat")); }).join("; ") + ".";
      if (alt.length) t += "\nNu toți au votat pentru:\n" + alt.slice(0, 6).map(function (v) {
        return "• " + obiectPunct(v.titlu || (v.punct ? "punctul " + v.punct : "un proiect neidentificat")) + ": " + ((v.nume_impotriva || []).length ? "împotrivă " + v.nume_impotriva.join(", ") : "") + ((v.nume_impotriva || []).length && (v.nume_abtineri || []).length ? "; " : "") + ((v.nume_abtineri || []).length ? "abțineri " + v.nume_abtineri.join(", ") : ""); }).join("\n") + (alt.length > 6 ? "\n• și încă " + (alt.length - 6) : "");
      else if (s.voturi.length) t += " Toate proiectele votate au trecut fără voturi împotrivă numite în procesul-verbal.";
      if ((s.absenti || []).length) t += "\nAu lipsit: " + s.absenti.join(", ") + ".";
    }
    return t + "\n\nVoturile și hotărârile, pe Monitor local: " + SITE + "#consiliu/sedinte/" + data + "\n(Cifrele sunt citite automat din procesul-verbal; verifică în document.)";
  }
  function postBox(text, titlu) {
    if (!INTERN) return "";   // textele gata de postat sunt pentru echipă, nu pentru versiunea publică
    return '<details class="post"><summary>' + esc(titlu || "Text gata de postat") + '</summary><textarea readonly rows="8">' + esc(text) + '</textarea><button type="button" class="btn-s" onclick="var t=this.previousElementSibling;t.select();try{navigator.clipboard.writeText(t.value)}catch(e){document.execCommand(\'copy\')}this.textContent=\'Copiat\'">Copiază textul</button></details>';
  }
  function sedCard(c, mare) {
    var od = c.ordinea_de_zi || [], doc = safeUrl(c.pdf) || safeUrl(c.pagina);
    return '<article class="lc ' + (c.viitoare ? "ic" : "n") + '"><div class="lc-h"><span class="tag">Ședință ' + esc(TIP_SED[c.tip] || "") + "</span>" +
      (c.viitoare ? '<span class="rz ic">' + esc(catePana(c.data)) + "</span>" : "") + '<span class="lc-d">convocată prin dispoziția ' + esc(c.nr_dispozitie || "") + " din " + esc(zi(c.postat)) + "</span>" +
      shareBtn("sedinta-" + c.data, "Ședința Consiliului Local Rădăuți din " + zi(c.data)) + "</div>" +
      '<div class="lc-t">' + esc(ziSapt(c.data)) + esc(zi(c.data)) + (c.ora ? ", ora " + esc(c.ora) : "") + "</div>" +
      (od.length ? '<ol class="odz">' + od.slice(0, mare ? 60 : 5).map(function (p) {
        var l = [];
        if (p.proiect && safeUrl(p.proiect.pagina)) l.push('<a href="' + esc(p.proiect.pagina) + '" rel="noopener">proiectul' + (p.proiect.nr ? " nr. " + esc(p.proiect.nr) : "") + "</a>");
        if (p.hcl) l.push('<a href="#consiliu/hcl/' + p.hcl.an + "/" + p.hcl.nr + '">adoptat: HCL ' + p.hcl.nr + "/" + p.hcl.an + "</a>");
        // proiectul e încă în consultare publică: poți trimite propuneri până la termen
        var nrP = (p.proiect && p.proiect.nr) || ((String(p.text).match(/\b(99\d{3})\b/) || [])[1]);
        var cons = nrP && SED && (SED.consultare || []).filter(function (q) { return q.deschis && String(q.nr) === String(nrP); })[0];
        if (cons) l.unshift('<a class="tag cons-t" href="#consiliu/proiecte">în consultare până pe ' + esc(zi(cons.termen)) + ": trimite propuneri</a>");
        return "<li>" + esc(p.text) + (l.length ? ' <span class="lnks">' + l.join("") + "</span>" : "") + "</li>";
      }).join("") + "</ol>" + (!mare && od.length > 5 ? '<p class="note"><a href="#consiliu/urmatoare">Toate cele ' + od.length + " puncte</a></p>" : "") :
        '<p class="lc-m">Ordinea de zi e în dispoziția de convocare' + (doc ? "" : ".") + "</p>") +
      '<div class="lc-a">' + (doc ? '<a href="' + esc(doc) + '" rel="noopener">dispoziția de convocare (documentul primăriei)</a>' : "") +
      (od.length ? '<span class="muted">Ordinea de zi e citită automat din dispoziție; verifică în document.</span>' : "") + "</div>" + (c.viitoare && mare ? postBox(postInainte(c), "Text gata de postat pe Facebook sau WhatsApp") : "") + "</article>";
  }
  // e-mailul cu propuneri la un proiect în consultare, adresat secretarului general (Legea nr. 52/2003)
  function mailPropuneri(p) {
    var catre = p.email || (SED && SED.email) || "secretariat@primariaradauti.ro";
    var proiect = "proiectul de hotărâre" + (p.nr ? " înregistrat cu nr. " + p.nr + (p.postat ? " din " + zi(p.postat) : "") : "") + " privind " + p.obiect.replace(/^(proiect(ul)? de hot[aă]r[aâ]re\s*)?(nr\.?\s*[\w\/.-]+\s*)?(privind\s*)?/i, "");
    var subiect = "Propuneri la " + proiect.slice(0, 150) + (proiect.length > 150 ? "..." : "");
    var corp = "Către: " + ((SED && SED.destinatar) || "Secretarul general al Municipiului Rădăuți") + "\n\n" +
      "Subsemnatul/Subsemnata, [nume și prenume], cu domiciliul în [localitatea], în temeiul Legii nr. 52/2003 privind transparența decizională în administrația publică, " +
      "transmit următoarele propuneri, sugestii și opinii la " + proiect + ":\n\n" +
      "1. [articolul sau prevederea din proiect] - [propunerea] - [motivarea]\n2. \n3. \n\n" +
      "Vă rog să îmi comunicați modul în care propunerile au fost analizate și, dacă nu au fost preluate, motivele.\n\n" +
      "Cu stimă,\n[nume și prenume]\n[telefon / e-mail]\n\n" +
      (safeUrl(p.pagina) ? "Proiectul: " + p.pagina + "\n" : "");
    return "mailto:" + catre + "?subject=" + encodeURIComponent(subiect) + "&body=" + encodeURIComponent(corp);
  }
  // lista strânsă a proiectelor în consultare (pagina de start), fiecare cu butonul de propuneri
  // ---------- Sondaje la proiectele în consultare (sondaj.php pe hosting) ----------
  var SDJ = null;
  function sdjHtml(p, mic) { return p.nr && !p.adoptat ? '<div class="sdj' + (mic ? " mic" : "") + '" data-p="' + esc(p.nr) + '" hidden></div>' : ""; }
  function sdjDesen(e) {
    var p = e.getAttribute("data-p"), c = (SDJ.cifre || {})[p] || { da: 0, nu: 0, ns: 0 }, al = (SDJ.votul_tau || {})[p], t = c.da + c.nu + c.ns;
    var b = function (v, l) { return '<button type="button" data-v="' + v + '" aria-pressed="' + (al === v) + '">' + l + "</button>"; };
    var pc = function (n) { return t ? Math.round(100 * n / t) : 0; };
    e.innerHTML = '<span class="sdj-q">Ești de acord cu proiectul?</span><span class="sdj-b">' + b("da", "Da") + b("nu", "Nu") + b("ns", "Nu știu") + "</span>" +
      (al && t ? '<span class="sdj-r"><span class="sdj-bar"><i class="da" style="width:' + pc(c.da) + '%"></i><i class="nu" style="width:' + pc(c.nu) + '%"></i><i class="ns" style="width:' + pc(c.ns) + '%"></i></span>' +
        "<small>Da " + pc(c.da) + "% · Nu " + pc(c.nu) + "% · Nu știu " + pc(c.ns) + "% · " + t + (t === 1 ? " vot" : " voturi") + '. Sondaj informal, fără valoare juridică: părerea ta contează oficial doar dacă trimiți propuneri.</small></span>'
        : '<small class="muted">' + (t ? t + (t === 1 ? " vot" : " voturi") + " până acum; " : "") + "vezi rezultatul după ce votezi.</small>");
    e.hidden = false;
    Array.prototype.forEach.call(e.querySelectorAll("button"), function (x) {
      x.addEventListener("click", function () {
        var v = x.getAttribute("data-v");
        fetch(BASE + "sondaj.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p: p, v: v }) }).then(function (r) { return r.json(); }).then(function (d) {
          if (!d.ok) { alertaSdj(e, d.eroare); return; }
          SDJ.cifre[p] = d.cifre; SDJ.votul_tau[p] = d.votul_tau;
          Array.prototype.forEach.call(document.querySelectorAll('.sdj[data-p="' + p + '"]'), sdjDesen);
        }).catch(function () { alertaSdj(e, "votul nu a putut fi trimis"); });
      });
    });
  }
  function alertaSdj(e, m) { var s = e.querySelector("small"); if (s) s.textContent = m || "eroare"; }
  function sdjInit() {
    var L = document.querySelectorAll(".sdj[data-p]"); if (!L.length) return;
    (SDJ ? Promise.resolve(SDJ) : fetch(BASE + "sondaj.php", { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) { SDJ = { cifre: d.cifre || {}, votul_tau: d.votul_tau || {} }; if (Array.isArray(SDJ.cifre)) SDJ.cifre = {}; if (Array.isArray(SDJ.votul_tau)) SDJ.votul_tau = {}; return SDJ; }))
      .then(function () { Array.prototype.forEach.call(document.querySelectorAll(".sdj[data-p]"), sdjDesen); }).catch(function () { /* fără server (previzualizare): sondajele nu apar */ });
  }
  function consLista(des, deschisa) {
    var zr = function (t) { var z = Math.ceil((new Date(t) - new Date(new Date().toISOString().slice(0, 10))) / 864e5); return z <= 0 ? "ultima zi" : z === 1 ? "mai e o zi" : "mai sunt " + z + " zile"; };
    return '<details class="cons-l"' + (deschisa ? " open" : "") + '><summary><span class="lbl">Proiecte în consultare publică</span><b>' + des.length + (des.length === 1 ? " proiect deschis" : " proiecte deschise") +
      '</b><span class="muted">poți trimite propuneri până la termen</span></summary><div class="cm-l">' + des.map(function (p) {
        return '<div class="cm"><div class="cm-t"><a href="' + esc(safeUrl(p.pagina) || "#consiliu/proiecte") + '" rel="noopener">' + esc(p.obiect) + "</a>" +
          '<span class="cm-m">' + (p.nr ? "nr. " + esc(p.nr) + " · " : "") + "până pe <b>" + esc(zi(p.termen)) + "</b> · " + zr(p.termen) + "</span>" + sdjHtml(p, true) + "</div>" +
          '<div class="cm-a"><a class="btn ok" href="' + esc(mailPropuneri(p)) + '">✉ Trimite propuneri</a>' + (p.nr ? shareBtn("proiect-" + p.nr, "Proiect în consultare: " + p.obiect) : "") + "</div></div>";
      }).join("") + '</div><p class="cm-f"><a href="#consiliu/proiecte">Toate proiectele de hotărâre →</a></p></details>';
  }
  function consCard(p) {
    var st = p.adoptat ? '<span class="rz c">adoptat ca HCL ' + p.adoptat.nr + "/" + p.adoptat.an + "</span>" : p.deschis ? '<span class="rz ic">propuneri până pe ' + esc(zi(p.termen)) + "</span>" : '<span class="rz n">termen încheiat</span>';
    return '<div class="doc"><div class="h"><span class="id">' + (p.nr ? "Proiect nr. " + esc(p.nr) : "Proiect de hotărâre") + "</span>" + st + '<span class="muted">publicat ' + esc(zi(p.postat)) + "</span>" +
      (p.nr && !p.adoptat ? shareBtn("proiect-" + p.nr, "Proiect în consultare: " + p.obiect) : "") + "</div>" +
      '<div class="t">' + esc(p.obiect) + '</div><div class="m">' + (safeUrl(p.pagina) ? '<a href="' + esc(p.pagina) + '" rel="noopener">anunțul și proiectul</a>' : "") +
      (p.adoptat ? '<a href="#consiliu/hcl/' + p.adoptat.an + "/" + p.adoptat.nr + '">hotărârea</a>' : "") + (p.termen && p.termen_din && !p.adoptat ? "<span>termen: " + esc(p.termen_din) + "</span>" : "") + "</div>" +
      (p.deschis && !p.adoptat ? '<div class="cons-mail"><a class="btn ok" href="' + esc(mailPropuneri(p)) + '">✉ Trimite propuneri pe e-mail</a><span class="muted">către secretarul general (' +
        esc(p.email || SED.email || "secretariat@primariaradauti.ro") + "), până pe " + esc(zi(p.termen)) + ". Se deschide un model de scrisoare, gata de completat.</span></div>" : "") + (p.deschis ? sdjHtml(p) : "") + "</div>";
  }
  function urmatoare(el, r) {
    var cap = head("Consiliul Local", "Ce se votează la ședința următoare și ce proiecte de hotărâre poți comenta acum.", r);
    if (!SED) { el.innerHTML = cap + '<p class="updated">Se încarcă...</p>'; incarcaSed().then(render); return; }
    var U = SED.urmatoare || [], C = SED.consultare || [], des = C.filter(function (p) { return p.deschis; });
    el.innerHTML = cap +
      '<section class="card section"><h2>' + (U.length ? (U.length > 1 ? "Ședințele convocate" : "Ședința următoare") : "Nicio ședință convocată deocamdată") + "</h2>" +
      (U.length ? U.map(function (c) { return sedCard(c, true); }).join("") : '<p>Primăria n-a publicat încă o dispoziție de convocare pentru o ședință viitoare. Ședințele ordinare au loc de regulă o dată pe lună; convocarea apare cu câteva zile înainte.</p>' +
        ((SED.recente || [])[0] ? "<h3>Ultima ședință convocată</h3>" + sedCard(SED.recente[0], true) : "")) + "</section>" +
      '<section class="card section"><h2>Cum poți participa</h2><ul class="pasi">' +
      "<li><b>Vino la ședință.</b> Ședințele sunt publice; data, ora și locul sunt în convocare.</li>" +
      "<li><b>Trimite propuneri la proiecte</b>, cu butonul de la fiecare proiect deschis, mai jos." + (safeUrl(SED.formular) ? ' Sau prin <a href="' + esc(SED.formular) + '" rel="noopener">formularul primăriei</a>.' : "") + "</li>" +
      "<li><b>Cere o dezbatere publică</b>, dacă reprezinți o asociație.</li>" +
      "<li><b>Vezi cum s-a votat</b>, după ședință, în <a href=\"#consiliu/sedinte\">Ședințe</a> și <a href=\"#consiliu/hcl\">Hotărâri</a>.</li></ul>" +
      '<details class="info"><summary>Ce spune legea</summary><p>Legea nr. 52/2003 privind transparența decizională îți dă dreptul să trimiți în scris propuneri, sugestii sau opinii la proiectele de hotărâre puse în consultare, în termenul anunțat de primărie. ' +
      "Tot după această lege, o asociație legal constituită sau o altă autoritate publică poate cere în scris organizarea unei dezbateri publice pe un proiect. " +
      "Termenul pentru propuneri e cel din anunțul primăriei; unde anunțul nu îl spune clar, arătăm 10 zile de la publicare. Verifică întotdeauna în anunț.</p></details></section>" +
      '<section class="card section"><h2>Proiecte în consultare publică <small class="muted">' + des.length + " deschise</small></h2>" +
      '<p class="note">Proiectele de hotărâre anunțate de primărie în ultimele două luni, cele mai noi întâi.</p>' + (C.length ? C.map(consCard).join("") : '<p class="empty">Niciun proiect anunțat în ultimele două luni.</p>') + "</section>";
    sdjInit();
  }
  var NT_CUL = { rezumat: "var(--c1)", sedinta: "var(--c1)", consultare: "var(--c7)", hcl: "var(--c3)", pv: "var(--c3)", urbanism: "var(--c2)", achizitie: "var(--c4)", licitatie: "var(--c4)", atribuire: "var(--c4)", concurs: "var(--c5)", contract: "var(--c4)", buget: "var(--c6)" };
  var NT_GRUP = [["", "Toate"], ["consiliu", "Consiliul local", ["sedinta", "consultare", "hcl", "pv"]], ["bani", "Bani publici", ["achizitie", "licitatie", "atribuire", "contract", "buget"]],
    ["urbanism", "Urbanism", ["urbanism"]], ["concurs", "Angajări", ["concurs"]]];
  // ---------- „Săptămâna în Rădăuți”: ce s-a întâmplat în ultimele 7 zile și ce urmează, din noutățile monitorului ----------
  function zIso(d) { return d.toISOString().slice(0, 10); }
  function sumaLei(t) { var m = String(t || "").match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?\s*lei/); return m ? +m[1].replace(/\./g, "") : 0; }
  function saptamana(box, off) {
    if (!box) return;
    var azi = new Date(new Date().toISOString().slice(0, 10) + "T12:00:00Z"), sf = new Date(azi - off * 7 * 864e5), st = new Date(sf - 6 * 864e5), urmSf = new Date(sf.getTime() + 7 * 864e5);
    var a = zIso(st), b = zIso(sf), c = zIso(urmSf);
    var E = (NOU.evenimente || []).filter(function (e) { return e.data >= a && e.data <= b && e.tip !== "rezumat"; });
    var pe = function (t) { return E.filter(function (e) { return e.tip === t; }); };
    var ach = pe("achizitie"), atr = pe("atribuire"), lic = pe("licitatie"), con = pe("concurs"), cons = pe("consultare"), hclE = pe("hcl"), pvE = pe("pv"), bug = pe("buget"), urb = pe("urbanism");
    var nHcl = hclE.reduce(function (s, e) { var m = String(e.titlu).match(/(\d+)\s+hot/); return s + (m ? +m[1] : 1); }, 0);
    var vAch = ach.reduce(function (s, e) { return s + sumaLei(e.titlu); }, 0), vAtr = atr.reduce(function (s, e) { return s + sumaLei(e.text); }, 0);
    var sedT = Object.keys((function () { var o = {}; (L.pv || []).concat(SED.recente || []).concat(SED.urmatoare || []).forEach(function (p) { if (p.data >= a && (off ? p.data <= b : p.data < b)) o[p.data] = 1; }); return o; })());
    var dela = off ? zIso(new Date(sf.getTime() + 864e5)) : b;   // „ce urmează”: de azi (sau de după săptămâna aleasă) încolo, 7 zile
    var urm = (SED.urmatoare || []).concat(SED.recente || []).filter(function (x, i, A) { return x.data >= dela && x.data <= c && A.findIndex(function (y) { return y.data === x.data; }) === i; }),
      ter = (SED.consultare || []).filter(function (p) { return p.termen >= dela && p.termen <= c && (p.deschis || off); });
    var top = ach.concat(atr).map(function (e) { return { e: e, v: e.tip === "atribuire" ? sumaLei(e.text) : sumaLei(e.titlu) }; }).filter(function (x) { return x.v; }).sort(function (x, y) { return y.v - x.v; }).slice(0, 3);
    var curat = function (t) { return String(t || "").replace(/^Contract atribuit:\s*/, "").replace(/^[\d.,]+\s*lei:\s*/, ""); };
    var per = (+a.slice(8, 10)) + (a.slice(5, 7) !== b.slice(5, 7) ? " " + LUNI_N[+a.slice(5, 7) - 1] : "") + " - " + (+b.slice(8, 10)) + " " + LUNI_N[+b.slice(5, 7) - 1] + " " + b.slice(0, 4);
    var rand = function (ic_, txt, link) { return "<li>" + (link ? '<a href="' + link + '">' : "") + "<b>" + ic_ + "</b> " + txt + (link ? "</a>" : "") + "</li>"; };
    var lst = [];
    if (sedT.length) lst.push(rand(sedT.length === 1 ? "1 ședință" : sedT.length + " ședințe", "ale consiliului local (" + sedT.map(function (d) { return zi(d).replace(/ \d{4}$/, ""); }).join(", ") + ")", "#consiliu/sedinte"));
    if (nHcl) lst.push(rand(nHcl + (nHcl === 1 ? " hotărâre" : nHcl < 20 ? " hotărâri" : " de hotărâri"), "publicate de primărie", "#consiliu/hcl"));
    if (cons.length) lst.push(rand(cons.length + (cons.length === 1 ? " proiect nou" : " proiecte noi"), "în consultare publică: " + cons.slice(0, 3).map(function (e) { return esc(e.titlu.replace(/^Privind\s+/i, "").slice(0, 90)); }).join("; "), "#consiliu/proiecte"));
    if (pvE.length) lst.push(rand(pvE.length + (pvE.length === 1 ? " proces-verbal" : " procese-verbale"), "de ședință publicate", "#consiliu/sedinte"));
    if (ach.length) lst.push(rand(ach.length + (ach.length === 1 ? " achiziție directă" : " achiziții directe"), vAch ? "în valoare de " + lei(vAch) : "", "#bani/achizitii"));
    if (atr.length) lst.push(rand(atr.length + (atr.length === 1 ? " contract atribuit" : " contracte atribuite"), vAtr ? "după licitație, " + lei(vAtr) : "după licitație", "#bani/achizitii"));
    if (lic.length) lst.push(rand(lic.length + (lic.length === 1 ? " licitație lansată" : " licitații lansate"), "", "#bani/achizitii"));
    if (con.length) lst.push(rand(con.length + (con.length === 1 ? " anunț de angajare" : " anunțuri de angajare"), "sau de examen", "#primarie/angajari/concursuri"));
    if (urb.length) lst.push(rand(urb.length + (urb.length === 1 ? " registru de urbanism" : " registre de urbanism"), "publicate (autorizații și certificate)", "#primarie/urbanism"));
    if (bug.length) lst.push(rand(bug.length + (bug.length === 1 ? " document de buget" : " documente de buget"), "(execuție, bilanț)", "#bani/buget"));
    var vii = urm.map(function (x) { return [x.data, rand(esc(ziSapt(x.data)) + esc(zi(x.data).replace(/ \d{4}$/, "")) + (x.ora ? ", " + esc(x.ora) : "") + (x.data === b && !off ? " (azi)" : ""), "ședința " + esc(TIP_SED[x.tip] || "") + " a consiliului" + ((x.ordinea_de_zi || []).length ? ", " + x.ordinea_de_zi.length + " puncte" : ""), "#consiliu/sedinte")]; })
      .concat(ter.map(function (p) { return [p.termen, rand(esc(zi(p.termen).replace(/ \d{4}$/, "")), "ultima zi pentru propuneri: " + esc(p.obiect.replace(/^Privind\s+/i, "").slice(0, 90)), "#consiliu/proiecte")]; }))
      .sort(function (x, y) { return x[0] < y[0] ? -1 : 1; }).map(function (x) { return x[1]; });
    // textul de postat
    var pl = function (n, unu, mai) { return n === 1 ? unu : n + (n % 100 >= 20 || n % 100 === 0 && n ? " de " : " ") + mai; };
    var viiT = urm.map(function (x) { return [x.data, "• " + ziSapt(x.data) + zi(x.data) + (x.ora ? ", ora " + x.ora : "") + ": ședința " + (TIP_SED[x.tip] || "") + " a consiliului local\n"]; })
      .concat(ter.map(function (p) { return [p.termen, "• " + zi(p.termen) + ": ultima zi pentru propuneri la proiectul „" + p.obiect.replace(/^Privind\s+/i, "").slice(0, 90) + "”\n"]; }))
      .sort(function (x, y) { return x[0] < y[0] ? -1 : 1; }).map(function (x) { return x[1]; });
    var txt = "Săptămâna în Rădăuți (" + per + "), din documentele publice ale primăriei:\n" +
      (sedT.length ? "• " + pl(sedT.length, "o ședință a consiliului local", "ședințe ale consiliului local") + "\n" : "") + (nHcl ? "• " + pl(nHcl, "o hotărâre publicată", "hotărâri publicate") + "\n" : "") +
      (cons.length ? "• " + pl(cons.length, "un proiect nou", "proiecte noi") + " în consultare publică" + (cons[0] ? ", printre care: " + cons[0].titlu.replace(/^Privind\s+/i, "").slice(0, 100) : "") + "\n" : "") +
      (ach.length ? "• " + pl(ach.length, "o achiziție directă", "achiziții directe") + (vAch ? ", " + lei(vAch) : "") + "\n" : "") + (atr.length ? "• " + pl(atr.length, "un contract atribuit", "contracte atribuite") + " după licitație" + (vAtr ? ", " + lei(vAtr) : "") + "\n" : "") +
      (top[0] ? "• cea mai mare cheltuială: " + curat(top[0].e.titlu).slice(0, 110) + " (" + lei(top[0].v) + ")\n" : "") + (con.length ? "• " + pl(con.length, "un anunț", "anunțuri") + " de angajare sau examen\n" : "") +
      (viiT.length ? "\nCe urmează:\n" + viiT.join("") : "");
    box.innerHTML = '<section class="card section sapt"><div class="sapt-h"><button type="button" class="btn-s" data-o="' + (off + 1) + '" aria-label="Săptămâna anterioară">‹</button><div><span class="lbl">Săptămâna în Rădăuți</span><h2>' + esc(per) + "</h2></div>" +
      (off > 0 ? '<button type="button" class="btn-s" data-o="' + (off - 1) + '" aria-label="Săptămâna următoare">›</button>' : '<span class="btn-s ghost"></span>') + "</div>" +
      '<div class="sapt-g"><div><h3>Ce s-a întâmplat</h3>' + (lst.length ? '<ul class="sapt-l">' + lst.join("") + "</ul>" : '<p class="empty">Nimic nou publicat în săptămâna aceasta.</p>') +
      (top.length ? '<h3>Cele mai mari cheltuieli</h3><ul class="sapt-l mic">' + top.map(function (x) { return '<li><b>' + lei(x.v) + "</b> " + esc(curat(x.e.titlu).slice(0, 120)) + ' <span class="muted">' + esc(String(x.e.text || "").replace(/^\d+\s*/, "").split(";")[0].slice(0, 60)) + "</span></li>"; }).join("") + "</ul>" : "") + "</div>" +
      '<div><h3>' + (off ? "Ce urma" : "Ce urmează") + "</h3>" + (vii.length ? '<ul class="sapt-l">' + vii.join("") + "</ul>" : '<p class="muted">Nicio ședință și niciun termen în următoarele 7 zile.</p>') + "</div></div>" +
      (lst.length ? postBox(txt, "Text gata de postat") : "") + "</section>";
    Array.prototype.forEach.call(box.querySelectorAll("[data-o]"), function (x) { x.addEventListener("click", function () { saptamana(box, +x.getAttribute("data-o")); }); });
  }
  function noutatiCard() {
    var el = $("nou-card"); if (!el) return;
    Promise.all([incarcaSed(), incarcaNou(), incarcaRez()]).then(function () {
      if (!$("nou-card")) return;
      // rezumatele ședințelor sunt ale noastre, nu ale primăriei: stau într-o casetă separată, nu în fluxul „Ce a mai publicat primăria”
      var RZ = (REZ || []).slice().sort(function (a, b) { return (b.data || "").localeCompare(a.data || ""); });   // după data ședinței
      // toate ședințele convocate și încă neținute (pot fi două: una ordinară și una extraordinară), în ordinea datei
      var UU = (SED.urmatoare || []).slice().sort(function (a, b) { return (a.data + (a.ora || "")).localeCompare(b.data + (b.ora || "")); }), U = UU[0], des = (SED.consultare || []).filter(function (p) { return p.deschis; });
      var h = "";
      if (U || des.length) h += '<section class="card section urm">' + (U ? '<div class="urm-g">' : "<div>") +
        UU.map(function (U, i) { var n = (U.ordinea_de_zi || []).length;
          return '<a class="urm-i" href="#consiliu/urmatoare"><span class="lbl">' + (UU.length > 1 ? esc({ ordinara: "Ședința ordinară", extraordinara: "Ședința extraordinară", extraordinara_de_indata: "Ședința convocată de îndată" }[U.tip] || "Ședința consiliului") : "Ședința următoare a consiliului") + "</span><b>" + esc(ziSapt(U.data)) + esc(zi(U.data)) + (U.ora ? ", ora " + esc(U.ora) : "") + "</b><span>" +
            (n ? n + (n === 1 ? " punct" : n < 20 ? " puncte" : " de puncte") + " pe ordinea de zi" : "ședință " + esc(TIP_SED[U.tip] || "")) + " · " + esc(catePana(U.data)) + "</span></a>"; }).join("") +
        "</div>" + (des.length ? consLista(des, true) : "") + "</section>";
      h += '<div id="sapt"></div>';
      var E = NOU.evenimente || [], flux = $("nou-flux"), hf = "";
      if (RZ.length) hf += '<section class="card section"><h2>Rezumatele noastre ale ședințelor</h2><p class="note">Scrise de Rădăuțiul Civic din înregistrările ședințelor, nu publicate de primărie.</p><ul class="sapt-l">' +
        RZ.slice(0, 4).map(function (x) { return '<li><a href="#consiliu/sedinte/' + esc(x.data) + '"><b>Ședința din ' + esc(zi(x.data)) + "</b> " + esc(((x.rezumat || {}).rezumat || "").slice(0, 200)) + "</a></li>"; }).join("") + "</ul></section>";
      if (E.length) hf += '<section class="card section"><div class="h-row"><h2>Ce a mai publicat primăria</h2><a class="rss" href="' + FTDATA + 'noutati.xml" title="Abonează-te prin RSS">RSS</a></div>' +
        '<div class="seg nt-seg" role="group" aria-label="Ce noutăți">' + NT_GRUP.map(function (g, i) { return '<button type="button" data-g="' + g[0] + '" aria-pressed="' + (i === 0) + '">' + esc(g[1]) + "</button>"; }).join("") + "</div>" +
        '<div id="nou-l"></div><button class="more" id="nou-m" hidden>Arată mai multe</button></section>' + alerteHtml("", "Primește noutățile pe e-mail, pe strada sau subiectul tău");
      if (flux) { el.innerHTML = h; flux.innerHTML = hf; } else el.innerHTML = h + hf;
      saptamana($("sapt"), 0);
      sdjInit();
      alerteLeaga();
      if (!E.length) return;
      var box = flux || el, grup = "", shown = flux ? 6 : 10;
      function lista() {
        var g = NT_GRUP.filter(function (x) { return x[0] === grup; })[0], sel = E.filter(function (e) { return !grup || g[2].indexOf(e.tip) >= 0; });
        var pz = "";
        $("nou-l").innerHTML = sel.slice(0, shown).map(function (e) {
          var cap = e.data !== pz ? '<div class="nt-zi">' + esc(ziSapt(e.data)) + esc(zi(e.data)) + "</div>" : ""; pz = e.data;
          var ext = /^https?:/.test(e.link || ""), t = e.link && (!ext || safeUrl(e.link)) ? '<a href="' + esc(e.link) + '"' + (ext ? ' rel="noopener" title="anunțul în SICAP (e-licitatie.ro)"' : "") + ">" + esc(e.titlu) + (ext ? " ↗" : "") + "</a>" : esc(e.titlu);
          return cap + '<div class="nt"><span class="nt-tip" style="--c:' + (NT_CUL[e.tip] || "var(--plan)") + '">' + esc((NOU.tipuri || {})[e.tip] || e.tip) + '</span><div class="nt-t">' + t +
            (safeUrl(e.sursa) ? ' <a class="nt-s" href="' + esc(e.sursa) + '" rel="noopener" title="documentul pe site-ul primăriei">sursa ↗</a>' : "") + (e.text ? '<div class="nt-x">' + esc(e.text) + "</div>" : "") + "</div></div>";
        }).join("") || '<p class="empty">Nimic în ultimele luni.</p>';
        $("nou-m").hidden = sel.length <= shown;
      }
      Array.prototype.forEach.call(box.querySelectorAll(".nt-seg button"), function (b) {
        b.addEventListener("click", function () {
          grup = b.dataset.g; shown = 12;
          Array.prototype.forEach.call(box.querySelectorAll(".nt-seg button"), function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          lista();
        });
      });
      $("nou-m").addEventListener("click", function () { shown += 20; lista(); });
      lista();
    });
  }

  // ---- fișa unui act de urbanism, în fereastra de pe hartă ----
  var ACT_CAMPURI = [["categorie", "Categoria"], ["adresa", "Adresa"], ["cf_cadastral", "CF / nr. cadastral"], ["regim_inaltime", "Regim de înălțime"],
    ["sup_construita", "Suprafața construită"], ["sup_desfasurata", "Suprafața desfășurată"], ["nr_ap", "Apartamente"], ["valoare", "Valoarea lucrărilor"],
    ["proiectant", "Proiectant"], ["executant", "Executant"], ["data_inceperii", "Începerea lucrărilor"], ["data_finalizarii", "Finalizarea lucrărilor"],
    ["data_expirarii", "Valabil până la"], ["observatii", "Observații"]];
  // fereastra de pe hartă încape în hartă și pe telefon (harta are acolo ~340 px lățime)
  // puncte fără grupare în cifre: cele cu aceleași coordonate (de obicei poziția străzii) sunt așezate în spirală în jurul punctului
  function puncteRasfirate(Lf, L2, opt) {   // L2: [{lat, lon, cul, aprox, pop}] -> [marker]
    var pe = {}, out = [];
    L2.forEach(function (x) { var k = x.lat.toFixed(5) + "," + x.lon.toFixed(5); (pe[k] = pe[k] || []).push(x); });
    Object.keys(pe).forEach(function (k) {
      var G = pe[k];
      if (G.length > (opt && opt.maxSpirala || 12) && G.every(function (x) { return x.aprox; })) {   // multe acte fără număr găsit: un singur semn, cu lista
        out.push(Lf.marker([G[0].lat, G[0].lon], { icon: Lf.divIcon({ className: "pt-grup", html: "<i>" + G.length + "</i>", iconSize: [30, 30], iconAnchor: [15, 15] }), title: G.length + " acte cu poziție aproximativă (numărul casei nu a fost găsit)" })
          .bindPopup('<div class="pop-act"><b>' + G.length + " acte pe stradă, fără număr găsit pe hartă</b><br><span class=\"muted\">Poziție aproximativă: mijlocul străzii.</span><hr>" + G.slice(0, 40).map(function (x) { return x.pop; }).join("<hr>") + (G.length > 40 ? "<hr>și încă " + (G.length - 40) : "") + "</div>", opt && opt.popOpt));
        return;
      }
      G.forEach(function (x, i) {
        var a = i * 2.39996, r = (opt && opt.pas || 9) * Math.sqrt(i), dx = Math.round(r * Math.cos(a)), dy = Math.round(r * Math.sin(a)), d = (opt && opt.d) || 14;
        out.push(Lf.marker([x.lat, x.lon], { icon: Lf.divIcon({ className: "pt-dot" + (x.aprox ? " aprox" : ""), html: '<i style="background:' + x.cul + '"></i>', iconSize: [d, d], iconAnchor: [d / 2 - dx, d / 2 - dy], popupAnchor: [dx, dy - d / 2] }), keyboard: false })
          .bindPopup(x.pop, opt && opt.popOpt));
      });
    });
    return out;
  }
  // un act de urbanism e „activ” (probabil încă valabil): autorizația până la data expirării din registru, altfel 24 de luni de la emitere;
  // certificatul de urbanism 12 luni (valabilitatea obișnuită; se poate prelungi). Estimare: data exactă e în act.
  function actActiv(x) {
    var d = x.a.data || "", azi = new Date().toISOString().slice(0, 10);
    if (x.t === "ac" && x.a.data_expirarii) return x.a.data_expirarii >= azi;
    var t = new Date(azi); t.setMonth(t.getMonth() - (x.t === "ac" ? 24 : 12));
    return d >= t.toISOString().slice(0, 10);
  }
  function popOpt(m) {
    var z = m.getSize(), w = Math.max(200, Math.min(380, z.x - 56));
    return { maxWidth: w, minWidth: Math.min(260, w), maxHeight: Math.max(220, Math.min(360, z.y - 90)), autoPanPadding: [12, 12], className: "pop-mic" };
  }
  function actPopup(x) {
    var a = x.a, f = safeUrl(a.registru_pdf), pg = safeUrl(a.registru_pagina);
    var rand = function (k, e) { var v = a[k]; if (v == null || v === "") return ""; if (k === "valoare") v = lei(v); else if (/^data_/.test(k)) v = zi(v); else if (/^sup_/.test(k)) v = v + " mp"; return "<tr><th>" + esc(e) + "</th><td>" + esc(v) + "</td></tr>"; };
    return '<div class="pop-act"><b>' + (x.t === "ac" ? "Autorizație de construire" : "Certificat de urbanism") + " nr. " + esc(a.nr || "-") + "</b> · " + esc(zi(a.data)) +
      (a.scop ? '<p class="pop-scop">' + esc(a.scop) + "</p>" : "") +
      "<table>" + "<tr><th>Solicitant</th><td>" + (a.pj ? esc(a.solicitant || "") : "persoană fizică") + "</td></tr>" + ACT_CAMPURI.map(function (c) { return rand(c[0], c[1]); }).join("") + "</table>" +
      (a.precizie === "stradă" ? '<p class="pop-n">Poziție aproximativă: numărul casei n-a fost găsit, punctul e pe stradă.</p>' : "") +
      '<p class="pop-l">' + (f ? '<a href="' + esc(f) + '" rel="noopener">registrul primăriei (PDF)</a>' : "") + (pg ? ' <a href="' + esc(pg) + '" rel="noopener">pagina registrului</a>' : "") + "</p></div>";
  }

  // ---- Strada mea: tot ce privește o stradă ----
  var PREF_STR = /^(strada|str|str-la|stradela|bulevardul|bd|b-dul|calea|aleea|al|piata|pta|intrarea|intr|fundatura|drumul|soseaua|sos)\b\.?\s*/;
  function strCheie(s) { return norm(s).replace(/[„”"'.]/g, " ").replace(/\s+/g, " ").trim().replace(PREF_STR, "").replace(/\s*(nr|numarul)\b.*$/, "").replace(/\s+\d.*$/, "").trim(); }
  // ---------- Orașul pe zone: unde se fac investiții, unde se construiește, ce terenuri se dau (pătrate de ~500 m) ----------
  var Z0 = [47.822, 25.880], ZD = [0.0045, 0.0067];
  var ZMET = { inv: ["Obiective de investiții", nr], invV: ["Valoarea investițiilor aprobate", lei], ac: ["Autorizații de construire", nr], acV: ["Valoarea lucrărilor autorizate", lei], pat: ["Hotărâri despre terenuri și clădiri", nr] };
  function zCheie(la, lo) { var i = Math.floor((la - Z0[0]) / ZD[0]), j = Math.floor((lo - Z0[1]) / ZD[1]); return i >= 0 && j >= 0 && i < 12 && j < 13 ? i + "_" + j : null; }
  function zoneCalc(an) {
    var Z = {}, cel = function (k) { var p = k.split("_"); return Z[k] = Z[k] || { k: k, la: Z0[0] + p[0] * ZD[0], lo: Z0[1] + p[1] * ZD[1], inv: 0, invV: 0, ac: 0, acV: 0, pat: 0, str: {}, invL: [] }; };
    var strada_ = function (c, s) { if (!s) return; var k = cheieStr(s), o = c.str[k] = c.str[k] || { n: 0, s: s }; o.n++; if (/[ăâîșşțţ]/i.test(s)) o.s = s; };
    var G = (TEME || {}).strazi_geo || {};
    ((TEME || {}).investitii || []).forEach(function (x) {
      if (an && !x.pasi.some(function (p) { return (p.data || "").slice(0, 4) === an; })) return;
      var ks = {};
      (x.chei || []).forEach(function (ch) { var o = G[ch]; if (!o) return; (o.linii || []).forEach(function (ln) { ln.forEach(function (pt) { var k = zCheie(pt[0], pt[1]); if (k) ks[k] = 1; }); }); if (o.punct) { var k = zCheie(o.punct[0], o.punct[1]); if (k) ks[k] = 1; } });
      var L = Object.keys(ks); L.forEach(function (k) { var c = cel(k); c.inv++; c.invV += (x.valoare || 0) / L.length; c.invL.push(x); (x.strazi || []).forEach(function (s) { strada_(c, s); }); });
    });
    ((URB || {}).ac || []).forEach(function (a) { if (!a.lat || (an && (a.data || "").slice(0, 4) !== an)) return; var k = zCheie(a.lat, a.lon); if (!k) return; var c = cel(k); c.ac++; c.acV += a.valoare || 0; strada_(c, a.strada); });
    ((TEME || {}).patrimoniu || []).forEach(function (p) { if (!p.lat || (an && String(p.an) !== an)) return; var k = zCheie(p.lat, p.lon); if (!k) return; var c = cel(k); c.pat++; strada_(c, p.strada); });
    Object.keys(Z).forEach(function (k) { var s = Z[k].str; Z[k].nume = Object.keys(s).sort(function (a, b) { return s[b].n - s[a].n; }).slice(0, 3).map(function (x) { return s[x].s; }); });
    return Z;
  }
  function zoneHtml() {
    var ani = {}; ((URB || {}).ac || []).forEach(function (a) { if (a.data) ani[a.data.slice(0, 4)] = 1; }); ((TEME || {}).investitii || []).forEach(function (x) { x.pasi.forEach(function (p) { if (p.data) ani[p.data.slice(0, 4)] = 1; }); });
    return '<section class="card section" id="zone"><h2>Orașul pe zone</h2><p class="note">Rădăuțiul împărțit în pătrate de aproximativ 500 de metri. Alege ce vrei să compari: unde au mers investițiile, unde se construiește, unde s-au dat terenuri și clădiri. Pozițiile vin din străzile pomenite în documente, deci sunt aproximative; o investiție pe o stradă lungă intră în toate pătratele străzii, cu valoarea împărțită între ele.</p>' +
      '<div class="filters"><select id="z-m" aria-label="Ce arată harta">' + Object.keys(ZMET).map(function (k) { return '<option value="' + k + '">' + ZMET[k][0] + "</option>"; }).join("") + '</select><select id="z-an" aria-label="Anul"><option value="">Toți anii</option>' +
      Object.keys(ani).sort().reverse().map(function (a) { return "<option>" + a + "</option>"; }).join("") + '</select></div><div class="map" id="z-map"></div><h3 class="an-h">Zonele cu cele mai multe</h3><div id="z-top"></div></section>';
  }
  function zoneLeaga() {
    if (!$("z-map")) return;
    var harta = null, strat = null;
    function desen() {
      var m = $("z-m").value, an = $("z-an").value, Z = zoneCalc(an), L = Object.keys(Z).map(function (k) { return Z[k]; }).filter(function (c) { return c[m]; }).sort(function (a, b) { return b[m] - a[m]; });
      var max = L.length ? L[0][m] : 1, tot = L.reduce(function (s, c) { return s + c[m]; }, 0);
      var nm = function (c) { return c.nume.length ? "zona " + c.nume.slice(0, 2).join(" / ") : "zonă fără nume de stradă"; };
      $("z-top").innerHTML = L.length ? hbl(L.slice(0, 12).map(function (c) { return { l: nm(c), v: c[m], href: c.nume[0] ? "#strada?s=" + encodeURIComponent(c.nume[0]) : "" }; }), ZMET[m][1], tot) : '<p class="empty">Nimic de arătat pentru alegerea asta.</p>';
      if (!harta) return;
      if (strat) harta.removeLayer(strat);
      strat = window.L.layerGroup().addTo(harta);
      L.forEach(function (c) {
        var f = Math.sqrt(c[m] / max);
        window.L.rectangle([[c.la, c.lo], [c.la + ZD[0], c.lo + ZD[1]]], { color: "#2a78d6", weight: 1, opacity: 0.5, fillColor: "#2a78d6", fillOpacity: 0.08 + 0.6 * f })
          .bindPopup('<div class="pop-act"><b>' + esc(nm(c)) + "</b><br>" + Object.keys(ZMET).filter(function (k) { return c[k]; }).map(function (k) { return esc(ZMET[k][0]) + ": " + ZMET[k][1](Math.round(c[k])); }).join("<br>") +
            (c.invL.length ? '<br><span class="muted">' + c.invL.slice(0, 4).map(function (x) { return esc(x.nume.slice(0, 70)); }).join("; ") + (c.invL.length > 4 ? "..." : "") + "</span>" : "") +
            (c.nume[0] ? '<br><a href="#strada?s=' + encodeURIComponent(c.nume[0]) + '">strada ' + esc(c.nume[0]) + "</a>" : "") + "</div>", popOpt(harta)).addTo(strat);
      });
    }
    $("z-m").addEventListener("change", desen); $("z-an").addEventListener("change", desen);
    desen();
    incarcaLeaflet().then(function () {
      if (!$("z-map")) return;
      harta = window.L.map("z-map", { scrollWheelZoom: false }).setView([47.8445, 25.9195], 13);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(harta);
      desen();
    }).catch(function () { $("z-map").innerHTML = '<p class="empty">Harta nu s-a putut încărca.</p>'; });
  }
  // ---------- Alerte pe e-mail (alerte.php): noutățile despre o stradă sau un subiect ----------
  var SUBIECTE_AL = [["taxe", "Taxe și impozite"], ["buget", "Buget"], ["investiti", "Investiții"], ["asfalt", "Asfaltări"], ["urbanism", "Urbanism"], ["achizit", "Achiziții publice"], ["concurs", "Concursuri și angajări"], ["teren", "Terenuri și clădiri"],
    ["termic", "Căldura (termoficare)"], ["salubr", "Salubrizare"], ["apa", "Apa rece și canalizarea"], ["ilumin", "Iluminatul public"], ["dezapez", "Curățenia străzilor și deszăpezirea"]];
  function alerteHtml(strada, titlu, subiect) {
    var id = "al-" + Math.random().toString(36).slice(2, 7);
    return '<details class="card section alerte"' + (strada || subiect ? " open" : "") + '><summary><b>' + esc(titlu || "Primește noutățile pe e-mail") + '</b> <span class="muted">gratuit, te poți dezabona oricând</span></summary>' +
      '<form class="al-f" data-id="' + id + '"><label class="cx-f"><span>Străzile tale (despărțite prin virgulă, cel mult 5)</span><input name="strazi" type="text" maxlength="250" value="' + esc(strada || "") + '" placeholder="ex. Putnei, Ștefan cel Mare"></label>' +
      '<fieldset class="al-s"><legend>și/sau subiectele care te interesează</legend>' + SUBIECTE_AL.map(function (x) { return '<label><input type="checkbox" name="subiect" value="' + x[0] + '"' + (x[0] === subiect ? " checked" : "") + "> " + esc(x[1]) + "</label>"; }).join("") + "</fieldset>" +
      '<label class="cx-f"><span>Adresa de e-mail</span><input name="email" type="email" required maxlength="200" autocomplete="email"></label>' +
      '<input name="site" type="text" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">' +
      '<label class="cx-c"><input name="acord" type="checkbox" required> Sunt de acord ca Asociația Rădăuțiul Civic să-mi păstreze adresa și alegerile, doar ca să-mi trimită aceste noutăți. Nu le dă nimănui; le șterge la dezabonare.</label>' +
      '<button class="btn ok" type="submit">Abonează-mă</button> <span class="al-m muted" aria-live="polite"></span>' +
      '<p class="note">Îți trimitem întâi un e-mail de confirmare. Apoi, când apar pe monitor hotărâri, proiecte, autorizații sau achiziții care pomenesc ce ai ales, primești cel mult un e-mail pe zi.</p></form></details>';
  }
  function alerteLeaga(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll("form.al-f:not([data-ok])"), function (f) {
      f.setAttribute("data-ok", "1");
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var m = f.querySelector(".al-m"), b = f.querySelector("button");
        var corp = { act: "abonare", email: f.email.value.trim(), acord: f.acord.checked, site: f.site.value,
          strazi: f.strazi.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 5),
          subiecte: Array.prototype.filter.call(f.querySelectorAll('input[name="subiect"]'), function (c) { return c.checked; }).map(function (c) { return c.value; }) };
        if (!corp.strazi.length && !corp.subiecte.length) { m.textContent = "Alege cel puțin o stradă sau un subiect."; return; }
        b.disabled = true; m.textContent = "Se trimite...";
        fetch(BASE + "alerte.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corp) }).then(function (r) { return r.json(); }).then(function (d) {
          b.disabled = false;
          m.textContent = d.ok ? (d.deja ? "Gata: am adăugat alegerile la abonarea ta." : "Ți-am trimis un e-mail de confirmare. Deschide-l și apasă pe link (verifică și în Spam).") : (d.eroare || "Nu a mers; încearcă din nou.");
          if (d.ok) m.classList.remove("muted");
        }).catch(function () { b.disabled = false; m.textContent = "Nu a mers acum; încearcă mai târziu."; });
      });
    });
  }
  function strada(el, r) {
    var cap = head("Strada mea", "Scrie numele străzii și vezi tot ce o privește.");
    var lipsa = [];
    if (!URB) lipsa.push(get(DATA + "urbanism.json").then(function (d) { URB = d; }).catch(function () { URB = { cu: [], ac: [] }; }));
    if (SX === null) lipsa.push(get(DATA + "sicap-explorer.json").then(function (d) { SX = sxPrep(d); }).catch(function () { SX = false; }));
    if (!TEME) lipsa.push(incarcaTeme());
    if (lipsa.length) { el.innerHTML = cap + '<p class="updated">Se încarcă registrele...</p>'; Promise.all(lipsa).then(render); return; }
    var nume = {};
    ["ac", "cu"].forEach(function (t) { (URB[t] || []).forEach(function (a) { var k = a.strada && strCheie(a.strada); if (k && k.length > 2) { var x = nume[k] = nume[k] || { n: 0, f: {} }; x.n++; x.f[a.strada] = (x.f[a.strada] || 0) + 1; } }); });
    var chei = Object.keys(nume).sort(function (a, b) { return nume[b].n - nume[a].n; });
    var afis = function (k) { var f = nume[k].f; return Object.keys(f).sort(function (a, b) { return f[b] - f[a]; })[0]; };
    var q0 = (r.q || {}).s || "";
    el.innerHTML = cap + '<div class="card section sx-bar"><div class="filters"><input id="s-q" type="search" list="s-l" value="' + esc(q0) + '" placeholder="Strada (ex. Putnei, Ștefan cel Mare, Calea Cernăuți)" aria-label="Strada" autocomplete="off">' +
      '<datalist id="s-l">' + chei.slice(0, 600).map(function (k) { return '<option value="' + esc(afis(k)) + '">'; }).join("") + "</datalist></div>" +
      '<div class="chips" id="s-chips"' + (q0 ? " hidden" : "") + '><span class="muted">Încearcă:</span>' + chei.slice(0, 10).map(function (k) { return '<a class="chipl" href="#strada?s=' + encodeURIComponent(afis(k)) + '">' + esc(afis(k)) + "</a>"; }).join("") + "</div>" +
      '</div><div id="s-gol"' + (q0 ? " hidden" : "") + '><div class="s-ce">' +
      [["casa", "Ce se construiește", "autorizațiile de construire și certificatele de urbanism de pe stradă, pe hartă"], ["hcl", "Ce s-a hotărât", "hotărârile consiliului local care pomenesc strada"],
        ["cos", "Ce s-a cumpărat", "lucrări și achiziții publice pentru strada ta"], ["cauta", "Ce scrie în documente", "procese-verbale și alte documente care o pomenesc"]].map(function (x) {
        return '<div class="s-ce-i">' + ic(x[0]) + "<b>" + x[1] + "</b><span>" + x[2] + "</span></div>"; }).join("") + '</div>' + zoneHtml() + '</div><div id="s-out"></div>';
    zoneLeaga();
    var tq;
    $("s-q").addEventListener("input", function () { clearTimeout(tq); tq = setTimeout(function () { var v = $("s-q").value.trim(); history.replaceState(null, "", "#strada" + (v ? "?s=" + encodeURIComponent(v) : "")); arata(v); }, 400); });
    function arata(v) {
      var o = $("s-out"), k = strCheie(v);
      if ($("s-gol")) { $("s-gol").hidden = k.length >= 3; $("s-chips").hidden = k.length >= 3; }
      if (k.length < 3) { o.innerHTML = ""; return; }
      var re = new RegExp("(^|[^a-z])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z]|$)");
      var potr = function (t) { return re.test(norm(t)); };
      var acte = [];
      ["ac", "cu"].forEach(function (t) { (URB[t] || []).forEach(function (a) { if ((a.strada && strCheie(a.strada) === k) || (!a.strada && potr(a.adresa || ""))) acte.push({ t: t, a: a }); }); });
      acte.sort(function (x, y) { return (y.a.data || "").localeCompare(x.a.data || ""); });
      var ac = acte.filter(function (x) { return x.t === "ac"; }), cu = acte.filter(function (x) { return x.t === "cu"; });
      var hc = (L.hcl || []).filter(function (x) { return potr(x.titlu || ""); });
      var sx = SX ? SX.A.filter(function (x) { return x.ok && potr(x.o || ""); }).sort(function (a, b) { return (b.d || "").localeCompare(a.d || ""); }) : [];
      var val = ac.reduce(function (s, x) { return s + (x.a.valoare || 0); }, 0), sxv = sx.filter(function (x) { return x.t !== "cn"; }).reduce(function (s, x) { return s + leiOk(x); }, 0);
      var act = function (x) {
        var a = x.a, f = safeUrl(a.registru_pdf);
        return '<div class="doc"><div class="h"><span class="id">' + (x.t === "ac" ? "Autorizație " : "Certificat ") + esc(a.nr || "") + " · " + esc(zi(a.data)) + '</span><span class="tag">' + esc(a.categorie || "") + "</span></div>" +
          '<div class="t">' + esc((a.scop || "").slice(0, 220)) + '</div><div class="m"><span>' + esc(a.adresa || a.strada || "") + "</span><span>" + (a.pj ? esc(a.solicitant || "") : "persoană fizică") + "</span>" + (a.valoare ? "<span>" + lei(a.valoare) + "</span>" : "") +
          (f ? '<a href="' + esc(f) + '" rel="noopener">registrul</a>' : "") + "</div></div>";
      };
      o.innerHTML = (acte.some(function (x) { return x.a.lat; }) ? '<section class="card section"><h2>Autorizații de construire și certificate de urbanism pe stradă</h2><p class="note">Apasă pe un punct ca să vezi actul: ce se construiește, cine, valoarea, proiectantul și registrul primăriei. Albastru: autorizații de construire; portocaliu: certificate de urbanism. „Active” înseamnă probabil încă valabile: autorizațiile până la data expirării din registru (sau 24 de luni de la emitere, când data lipsește), certificatele de urbanism 12 luni de la emitere; data exactă e în act. Un cerc cu cifră adună actele de pe stradă al căror număr nu a fost găsit pe hartă.</p>' +
          (function () { var nA = acte.filter(function (x) { return x.a.lat && actActiv(x); }).length, nT = acte.filter(function (x) { return x.a.lat; }).length;
            return '<div class="filters sm-f"><div class="seg sm-st" role="group" aria-label="Care acte"><button type="button" data-v="activ" aria-pressed="true">Active (' + nA + ')</button><button type="button" data-v="vechi" aria-pressed="false">Mai vechi (' + (nT - nA) + ')</button><button type="button" data-v="toate" aria-pressed="false">Toate (' + nT + ")</button></div>" +
              '<span class="sm-t"><label class="cx-c"><input type="checkbox" value="ac" checked> autorizații de construire</label><label class="cx-c"><input type="checkbox" value="cu" checked> certificate de urbanism</label></span><span class="sm-n muted"></span></div>'; })() +
          '<div class="map" id="s-map" style="height:420px"></div></section>' : "") +
        '<div class="grid">' + tile("Autorizații de construire", nr(ac.length), "", ac.length ? "ultima: " + zi(ac[0].a.data) + (val ? "; valoare declarată " + lei(val) : "") : "") +
        tile("Certificate de urbanism", nr(cu.length), "", cu.length ? "ultimul: " + zi(cu[0].a.data) : "") +
        tile("Hotărâri care o pomenesc în titlu", nr(hc.length), "", hc.length ? "ultima: HCL " + hc[0].nr + "/" + hc[0].an : "") +
        tile("Achiziții publice care o pomenesc", nr(sx.length), "", sxv ? lei(sxv) + " în total" : "") + "</div>" +
        (hc.length ? '<section class="card section"><h2>Hotărâri ale consiliului</h2>' + hc.slice(0, 15).map(function (x) { return doc(linkHcl(x), x.titlu, x.data ? "adoptată " + zi(x.data) : "", x); }).join("") +
          (hc.length > 15 ? '<p class="note">Și încă ' + (hc.length - 15) + ".</p>" : "") + "</section>" : "") +
        (sx.length ? '<section class="card section"><h2>Achiziții publice</h2>' + sx.slice(0, 12).map(function (x) { return sxItem(x, true); }).join("") +
          (sx.length > 12 ? '<p class="note"><a href="#bani/achizitii?q=' + encodeURIComponent(k) + '">Toate cele ' + sx.length + "</a></p>" : "") + "</section>" : "") +
        (ac.length ? '<section class="card section"><h2>Autorizații de construire</h2>' + ac.slice(0, 12).map(act).join("") + (ac.length > 12 ? '<p class="note"><a href="#primarie/urbanism/ac">Toate autorizațiile</a> (caută „' + esc(v) + "”)</p>" : "") + "</section>" : "") +
        (cu.length ? '<section class="card section"><h2>Certificate de urbanism</h2>' + cu.slice(0, 8).map(act).join("") + (cu.length > 8 ? '<p class="note">Și încă ' + (cu.length - 8) + ".</p>" : "") + "</section>" : "") +
        '<section class="card section"><h2>În textul documentelor</h2><div id="s-ft"></div></section>' + alerteHtml(v.replace(/^(strada|str\.?)\s+/i, ""), "Primește pe e-mail noutățile despre strada " + v.replace(/^(strada|str\.?)\s+/i, "")) +
        (!acte.length && !hc.length && !sx.length ? '<p class="note">Nu am găsit acte de urbanism, hotărâri sau achiziții cu acest nume de stradă. Încearcă doar numele, fără „strada” (ex. Putnei).</p>' : "");
      ftBox($("s-ft"), { q: '"' + v.replace(/^(strada|str\.?)\s+/i, "") + '"', cate: 8 });
      alerteLeaga(o);
      if ($("s-map")) incarcaLeaflet().then(function () {
        var Lf = window.L, cs = getComputedStyle(document.documentElement);
        var cul = { ac: cs.getPropertyValue("--s1").trim() || "#2a78d6", cu: cs.getPropertyValue("--s2").trim() || "#eb6834" };
        var m = Lf.map("s-map", { scrollWheelZoom: false }), pts = [];
        Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
        // mai multe acte pe aceeași adresă: așezate în spirală în jurul punctului, toate vizibile
        var grup = Lf.layerGroup().addTo(m), prima = true;
        function deseneaza() {
          var st = (o.querySelector(".sm-st [aria-pressed=true]") || {}).getAttribute ? o.querySelector(".sm-st [aria-pressed=true]").getAttribute("data-v") : "activ";
          var tip = Array.prototype.filter.call(o.querySelectorAll(".sm-t input"), function (c) { return c.checked; }).map(function (c) { return c.value; });
          var sel = acte.filter(function (x) { return x.a.lat && tip.indexOf(x.t) >= 0 && (st === "toate" || (st === "activ") === actActiv(x)); });
          grup.clearLayers();
          puncteRasfirate(Lf, sel.map(function (x) { return { lat: x.a.lat, lon: x.a.lon, cul: cul[x.t], aprox: x.a.precizie === "stradă", pop: actPopup(x) }; }), { popOpt: popOpt(m), d: 16, pas: 10 })
            .forEach(function (mk) { grup.addLayer(mk); });
          var pts = sel.map(function (x) { return [x.a.lat, x.a.lon]; });
          if (!pts.length) pts = acte.filter(function (x) { return x.a.lat; }).map(function (x) { return [x.a.lat, x.a.lon]; });
          if (prima || pts.length) { if (pts.length === 1) m.setView(pts[0], 17); else if (pts.length) m.fitBounds(pts, { padding: [24, 24], maxZoom: 17 }); prima = false; }
          var n = o.querySelector(".sm-n"); if (n) n.textContent = sel.length + (sel.length === 1 ? " act" : " acte") + " pe hartă";
        }
        Array.prototype.forEach.call(o.querySelectorAll(".sm-st button"), function (b) { b.addEventListener("click", function () { Array.prototype.forEach.call(o.querySelectorAll(".sm-st button"), function (x) { x.setAttribute("aria-pressed", x === b); }); deseneaza(); }); });
        Array.prototype.forEach.call(o.querySelectorAll(".sm-t input"), function (c) { c.addEventListener("change", deseneaza); });
        deseneaza();
      }).catch(function () { if ($("s-map")) $("s-map").innerHTML = '<p class="empty" style="padding:16px">Harta nu s-a putut încărca.</p>'; });
    }
    if (q0) arata(q0);
  }

  // ---------- Concursuri și angajări ----------
  var CON = null, AKEYS = ["q", "inst", "proc", "an", "st"];
  var PROC = [["recrutare", "Concurs de recrutare", "var(--c1)"], ["promovare", "Examen de promovare", "var(--c4)"], ["transfer", "Transfer la cerere", "var(--c3)"], ["management", "Concurs de management", "var(--c7)"]];
  var ASTARE = [["ok", "Ocupat / promovat", "var(--good)"], ["nu", "Neocupat / nepromovat", "var(--bad)"], ["curs", "În desfășurare", "var(--c1)"],
    ["necitit", INTERN ? "Rezultat necitit încă" : "Rezultatul e în documentul publicat", "var(--warn)"], ["lipsa", "Fără rezultat final publicat", "var(--plan)"]];
  function aStare(c) {
    var s = c.stare;
    return s === "ocupat" || s === "promovat" ? "ok" : s === "neocupat" || s === "nepromovat" ? "nu" : s === "în desfășurare" ? "curs" : s === "fără rezultat final publicat" ? "lipsa" : "necitit";
  }
  var ACLS = { ok: "c", nu: "p", curs: "ic", necitit: "par", lipsa: "n" };
  function angLink(sub, F, schimb) {
    var o = {}; AKEYS.forEach(function (k) { if (F && F[k]) o[k] = F[k]; });
    Object.keys(schimb || {}).forEach(function (k) { if (schimb[k]) o[k] = schimb[k]; else delete o[k]; });
    var p = Object.keys(o).map(function (k) { return k + "=" + encodeURIComponent(o[k]); });
    return "#primarie/angajari/" + sub + (p.length ? "?" + p.join("&") : "");
  }
  function angFiltru(C, F) {
    var t = norm(F.q).trim();
    return C.filter(function (c) {
      return (!F.inst || c.institutie === F.inst) && (!F.proc || c.procedura === F.proc) && (!F.an || String(c.an) === F.an) &&
        (!F.st || aStare(c) === F.st) &&
        (!t || norm([c.titlu, (c.functii || []).join(" "), c.structura, c.institutie, c.nr_anunt].join(" ") + " " + c.etape.map(function (e) { return e.titlu; }).join(" ")).indexOf(t) >= 0);
    });
  }
  function angajari(el, r) {
    var sub = ["statistici", "concursuri", "posturi"].indexOf(r.rest[0]) >= 0 ? r.rest[0] : "statistici";
    var desc = { statistici: "Câte concursuri și examene au fost, pentru ce posturi, la ce instituții, cu câți candidați și cu ce rezultat.",
      concursuri: "Fiecare concurs, cu toate etapele lui (anunț, selecția dosarelor, probe, rezultate, contestații) și documentele publicate.",
      posturi: "Organigrama aprobată de consiliul local, istoricul ei și posturile scoase la concurs: care s-au ocupat și care nu." }[sub];
    var cap = head("Concursuri și angajări", "Concursurile de angajare și examenele de promovare ale primăriei și ale instituțiilor din subordine, din anunțurile publicate pe site-ul primăriei și în arhiva lui. " + desc, r);
    if (!CON) {
      el.innerHTML = cap + '<p class="updated">Se încarcă concursurile...</p>';
      get(DATA + "concursuri.json").then(function (d) { CON = d; render(); }).catch(function () { CON = { concursuri: [], organigrama: [], statistici: {} }; render(); });
      return;
    }
    var C = CON.concursuri || [], F = {}; AKEYS.forEach(function (k) { F[k] = (r.q || {})[k] || ""; });
    var uniq = function (f) { var o = {}; C.forEach(function (c) { [].concat(f(c)).forEach(function (v) { if (v) o[v] = (o[v] || 0) + 1; }); }); return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }); };
    var opt = function (v, t, s) { return '<option value="' + esc(v) + '"' + (String(s) === String(v) ? " selected" : "") + ">" + esc(t) + "</option>"; };
    el.innerHTML = cap + (!C.length && !(CON.organigrama || []).length ? '<section class="card section"><p>Concursurile apar după prima colectare a anunțurilor de angajare de pe site-ul primăriei și din arhivă.</p></section>' :
      '<div class="card section sx-bar"><div class="filters"><input id="a-q" type="search" value="' + esc(F.q) + '" placeholder="Caută: funcție, compartiment, număr de anunț (ex. paznic, evidența persoanelor, 14400)" aria-label="Caută">' +
      '<select id="a-inst" aria-label="Instituția">' + opt("", "Toate instituțiile", F.inst) + uniq(function (c) { return c.institutie; }).map(function (a) { return opt(a, a, F.inst); }).join("") + "</select>" +
      '<select id="a-an" aria-label="Anul">' + opt("", "Toți anii", F.an) + uniq(function (c) { return c.an; }).sort().reverse().map(function (a) { return opt(a, a, F.an); }).join("") + "</select></div><div class=\"filters\">" +
      '<select id="a-proc" aria-label="Felul procedurii">' + opt("", "Orice procedură", F.proc) + PROC.map(function (x) { return opt(x[0], x[1], F.proc); }).join("") + "</select>" +
      '<select id="a-st" aria-label="Rezultatul">' + opt("", "Orice rezultat", F.st) + ASTARE.map(function (x) { return opt(x[0], x[1], F.st); }).join("") + "</select></div>" +
      '<div class="sx-act"><a href="#primarie/angajari/' + sub + '">Șterge filtrele</a></div></div><div id="a-out"></div>');
    if (!$("a-out")) return;
    function citeste() {
      AKEYS.forEach(function (k) { F[k] = $("a-" + k).value; });
      history.replaceState(null, "", angLink(sub, F));
      iesire();
    }
    function iesire() {
      var rows = angFiltru(C, F), o = $("a-out");
      if (sub === "posturi") return angPosturi(o, rows, F);
      if (!rows.length) { o.innerHTML = '<section class="card section"><p class="empty">Niciun concurs nu corespunde filtrelor.</p></section>'; return; }
      if (sub === "statistici") return angStat(o, rows, F);
      angLista(o, rows);
    }
    AKEYS.forEach(function (k) { if (k !== "q") $("a-" + k).addEventListener("change", citeste); });
    var tq; $("a-q").addEventListener("input", function () { clearTimeout(tq); tq = setTimeout(citeste, 250); });
    iesire();
  }
  function angStat(el, rows, F) {
    var rec = rows.filter(function (c) { return c.procedura === "recrutare"; });
    var cnt = function (L, f) { var o = {}; L.forEach(function (c) { [].concat(f(c)).forEach(function (v) { if (v) o[v] = (o[v] || 0) + 1; }); }); return o; };
    var top = function (o, n) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, n); };
    var ani = Object.keys(cnt(rows, function (c) { return c.an; })).sort(), A = [];
    if (ani.length) for (var y = +ani[0]; y <= +ani[ani.length - 1]; y++) A.push(String(y));
    var pe = function (L, f) { var o = {}; L.forEach(function (c) { var a = String(c.an); o[a] = o[a] || {}; var k = f(c); o[a][k] = (o[a][k] || 0) + 1; }); return o; };
    var pP = pe(rows, function (c) { return c.procedura; }), pS = pe(rec, aStare);
    var ok = rec.filter(function (c) { return aStare(c) === "ok"; }).length, nu = rec.filter(function (c) { return aStare(c) === "nu"; }).length;
    var cand = rec.filter(function (c) { return c.candidati; }), unu = cand.filter(function (c) { return c.candidati === 1; }).length;
    var dur = rows.filter(function (c) { return c.durata_zile != null; }).map(function (c) { return c.durata_zile; });
    var med = cand.length ? cand.reduce(function (a, c) { return a + c.candidati; }, 0) / cand.length : null;
    var inst = cnt(rows, function (c) { return c.institutie; }), fn = cnt(rec, function (c) { return c.functii && c.functii.length ? c.functii : ["(funcție necitită)"]; });
    var bucket = cnt(cand, function (c) { return c.candidati === 1 ? "1 candidat" : c.candidati === 2 ? "2 candidați" : c.candidati <= 5 ? "3-5 candidați" : "6 sau mai mulți"; });
    var aniR = A.length ? (A[0] === A[A.length - 1] ? A[0] : A[0] + "-" + A[A.length - 1]) : "";
    el.innerHTML = '<div class="grid">' +
      tile("Concursuri și examene", nr(rows.length), "", (aniR ? aniR + "; " : "") + "<strong>" + nr(rec.length) + " concursuri de angajare</strong>, restul promovări, transferuri și management", angLink("concursuri", F)) +
      tile("Posturi ocupate prin concurs", nr(ok), "", rec.length ? "din " + nr(rec.length) + " concursuri de angajare; <strong>" + nr(nu) + " neocupate</strong>" : "", angLink("concursuri", F, { proc: "recrutare", st: "ok" })) +
      tile("Concursuri cu un singur candidat", nr(unu), "", cand.length ? "din " + nr(cand.length) + " concursuri de angajare la care știm numărul candidaților (" + Math.round(100 * unu / cand.length) + "%)" : "numărul candidaților se citește din documente") +
      tile("Candidați pe concurs, în medie", med != null ? dec(med.toFixed(1)) : "-", "", "la concursurile de angajare; din selecția dosarelor sau din rezultatele finale") +
      (dur.length ? tile("Durata medie a unui concurs", nr(Math.round(dur.reduce(function (a, b) { return a + b; }, 0) / dur.length)), "zile", "de la primul anunț la rezultatele finale") : "") + "</div>" +
      '<section class="card section"><h2>Concursuri pe ani, după procedură</h2><p class="note">După data primului anunț. Apasă pe un an ca să-l filtrezi.</p>' +
      legend(PROC.filter(function (x) { return rows.some(function (c) { return c.procedura === x[0]; }); }).map(function (x) { return [x[1], x[2]]; })) + '<div class="chart" id="ch-a1"></div></section>' +
      (rec.length ? '<section class="card section"><h2>Concursurile de angajare: s-a ocupat postul?</h2><p class="note">Rezultatul se citește automat din documentul cu rezultatele finale. ' + (INTERN ? "„Rezultat necitit încă” înseamnă că documentul e scanat și n-a trecut încă prin recunoașterea textului sau nu l-am putut interpreta." : "Când rezultatul nu poate fi citit automat, îl găsești în documentul publicat de primărie,") + ' deschide documentul din fișa concursului.</p>' +
        legend(ASTARE.map(function (x) { return [x[1], x[2]]; })) + '<div class="chart" id="ch-a2"></div></section>' : "") +
      '<div class="grid two"><section class="card"><h2>Pe instituții</h2><p class="note">Câte concursuri și examene a organizat fiecare. Apasă ca să vezi doar instituția.</p>' +
      hbl(top(inst, 15).map(function (k) { return { l: k, v: inst[k], href: angLink("statistici", F, { inst: k }) }; }), nr, rows.length) + "</section>" +
      '<section class="card"><h2>Pentru ce posturi s-au angajat oameni</h2><p class="note">Funcțiile scoase la concurs de angajare, de câte ori.</p>' +
      hbl(top(fn, 15).map(function (k) { return { l: k.charAt(0).toUpperCase() + k.slice(1), v: fn[k], href: k.charAt(0) === "(" ? null : angLink("concursuri", F, { q: k }) }; }), nr, rec.length) + "</section></div>" +
      (cand.length ? '<section class="card section"><h2>Câți candidați au fost</h2><p class="note">La concursurile de angajare la care documentele arată numărul candidaților.</p>' +
        hbl(["1 candidat", "2 candidați", "3-5 candidați", "6 sau mai mulți"].filter(function (k) { return bucket[k]; }).map(function (k) { return { l: k, v: bucket[k] }; }), nr, cand.length) + "</section>" : "");
    chart($("ch-a1"), { cats: A, stacked: true, label: "Concursuri pe ani, după procedură",
      series: PROC.map(function (x) { return { name: x[1], color: x[2], values: A.map(function (y) { return (pP[y] || {})[x[0]] || 0; }) }; }),
      labelValue: function (i) { var p = pP[A[i]] || {}; return Object.keys(p).reduce(function (a, k) { return a + p[k]; }, 0) || ""; },
      tooltip: function (i) { var p = pP[A[i]] || {}; return "<b>" + A[i] + "</b>" + PROC.map(function (x) { return p[x[0]] ? "<br>" + x[1] + ": " + p[x[0]] : ""; }).join(""); },
      onClick: function (i) { location.hash = angLink("statistici", F, { an: A[i] }); } });
    if ($("ch-a2")) chart($("ch-a2"), { cats: A, stacked: true, label: "Concursuri de angajare pe ani, după rezultat",
      series: ASTARE.map(function (x) { return { name: x[1], color: x[2], values: A.map(function (y) { return (pS[y] || {})[x[0]] || 0; }) }; }),
      labelValue: function (i) { var p = pS[A[i]] || {}; return Object.keys(p).reduce(function (a, k) { return a + p[k]; }, 0) || ""; },
      tooltip: function (i) { var p = pS[A[i]] || {}; return "<b>" + A[i] + "</b>" + ASTARE.map(function (x) { return p[x[0]] ? "<br>" + x[1] + ": " + p[x[0]] : ""; }).join(""); },
      onClick: function (i) { location.hash = angLink("concursuri", F, { an: A[i], proc: "recrutare" }); } });
  }
  function angFisa(c) {
    var s = aStare(c), sn = { ok: c.procedura === "promovare" ? "Promovat" : "Ocupat", nu: c.procedura === "promovare" ? "Nepromovat" : "Neocupat",
      curs: "În desfășurare", necitit: INTERN ? (c.stare === "rezultat în document scanat" ? "Rezultat în document scanat" : "Rezultat necitit") : "Rezultatul e în document", lipsa: "Fără rezultat final publicat" }[s];
    var cap = function (x) { return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; };
    var det = [];
    if (c.functii && c.functii.length) det.push("<b>Funcția:</b> " + esc(c.functii.map(cap).join(", ")) + (c.posturi > 1 ? " (" + c.posturi + " posturi)" : ""));
    if (c.structura) det.push("<b>Structura:</b> " + esc(c.structura));
    var cat = [c.categorie, c.nivel ? "de " + c.nivel : null, c.durata ? "pe durată " + c.durata : null].filter(Boolean).join(", ");
    if (cat) det.push(esc(cap(cat)));
    var rz = [];
    if (c.candidati) rz.push("<b>" + c.candidati + (c.candidati === 1 ? " candidat" : " candidați") + "</b>");
    if (c.admisi != null && (c.admisi || c.respinsi || c.absenti)) rz.push((c.procedura === "promovare" ? "promovați " : "admiși ") + c.admisi + ", respinși " + c.respinsi + (c.absenti ? ", absenți " + c.absenti : ""));
    if (c.contestatii) rz.push(c.contestatii + (c.contestatii === 1 ? " contestație" : " contestații"));
    if (c.durata_zile != null) rz.push(c.durata_zile + " zile de la anunț la rezultate");
    var titlu = c.titlu.length > 280 ? c.titlu.slice(0, 277) + "..." : c.titlu;
    return '<article class="lc ' + ACLS[s] + '"><div class="lc-h"><span class="tag">' + esc(c.procedura_nume) + '</span><span class="lc-m" style="margin:0">' + esc(c.institutie) + "</span>" +
      '<span class="rz ' + ACLS[s] + '">' + esc(sn) + '</span><span class="lc-d">' + esc(zi(c.inceput)) + (c.sfarsit && c.sfarsit !== c.inceput ? " - " + esc(zi(c.sfarsit)) : "") + "</span></div>" +
      '<div class="lc-t" title="' + esc(c.titlu) + '">' + esc(titlu) + "</div>" +
      (det.length ? '<div class="lc-m">' + det.join(" · ") + "</div>" : "") + (rz.length ? '<div class="lc-m">' + rz.join(" · ") + "</div>" : "") +
      '<ol class="lc-steps">' + c.etape.map(function (e, i) {
        var cls = e.etapa === "final" ? ACLS[s] : "";
        var docs = (e.docs || []).filter(function (d) { return safeUrl(d.url); }).slice(0, 3).map(function (d, k) { return '<a href="' + esc(d.url) + '" rel="noopener">' + (k ? "document " + (k + 1) : "document") + "</a>"; });
        if (safeUrl(e.link)) docs.unshift('<a href="' + esc(e.link) + '" rel="noopener">anunțul</a>');
        return '<li class="' + cls + '"><span class="dot"></span><b>' + esc(e.nume) + '</b><span class="s">' + esc(zi(e.data)) + '</span><span class="atac lnks">' + docs.join("") + "</span></li>";
      }).join("") + "</ol></article>";
  }
  function angLista(el, rows) {
    var shown = 20;
    el.innerHTML = '<section class="card section"><div class="h-row"><p class="count">' + nr(rows.length) + (rows.length === 1 ? " concurs" : " concursuri") + '</p><button class="lnk" id="a-csv" type="button">descarcă lista (CSV, pentru Excel)</button></div><div id="a-l"></div><button class="more" id="a-m" hidden>Arată mai multe</button></section>';
    function draw() { $("a-l").innerHTML = rows.slice(0, shown).map(angFisa).join(""); $("a-m").hidden = rows.length <= shown; }
    $("a-m").addEventListener("click", function () { shown += 30; draw(); });
    $("a-csv").addEventListener("click", function () {
      var cols = [["Început", "inceput"], ["Sfârșit", "sfarsit"], ["Procedura", "procedura_nume"], ["Instituția", "institutie"], ["Funcția", function (c) { return (c.functii || []).join(", "); }],
        ["Structura", "structura"], ["Categoria", "categorie"], ["Durata", "durata"], ["Posturi", "posturi"], ["Candidați", "candidati"], ["Admiși", "admisi"], ["Respinși", "respinsi"],
        ["Absenți", "absenti"], ["Contestații", "contestatii"], ["Rezultat", "stare"], ["Nr. anunț", "nr_anunt"], ["Titlu", "titlu"], ["Link", function (c) { return (c.etape[0] || {}).link; }]];
      var q = function (v) { v = v == null ? "" : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var csv = "﻿" + cols.map(function (x) { return x[0]; }).join(";") + "\n" + rows.map(function (c) { return cols.map(function (x) { return q(typeof x[1] === "function" ? x[1](c) : c[x[1]]); }).join(";"); }).join("\n");
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "concursuri-radauti.csv"; a.click();
    });
    draw();
  }
  // ---- organigrama interactivă: structurile primăriei și instituțiile subordonate, cu concursurile lor ----
  // Structura aparatului de specialitate, după pagina „Stat de funcții” a primăriei (organigrama oficială e o
  // imagine scanată, Anexa 1 la HCL 64/2026). Concursurile se leagă de o structură după cuvintele din anunț.
  var ORG = [
    { g: "Direcția Economică", s: [["Compartimentul Impozite și Taxe", /impozit|taxe locale|taxelor|executare silit|incasar/], ["Compartimentul Contabilitate, Buget, Finanțe", /contabil|buget|financiar|finante|casier/]] },
    { g: "Serviciul Public Comunitar Local de Evidență a Persoanelor", s: [["Compartimentul Stare Civilă", /stare civil/], ["Compartimentul Evidența Persoanelor", /evidenta (a )?persoan|evidenta pe/]] },
    { g: "Direcția Tehnică", s: [["Direcția Tehnică", /tehnic|investit|lucrari publice|drumuri|iluminat|spatii verzi|administrare domeni/]] },
    { g: "Direcția Arhitectului Șef", s: [["Compartimentul Urbanism și Mediu", /urbanism|amenajarea teritoriului|arhitect|mediu|disciplina in construct|autorizar\w* constru/]] },
    { g: "Serviciul Administrație Publică Locală", s: [["Serviciul Administrație Publică Locală", /administratie publica|secretar|registratur|relatii cu publicul|arhiv|resurse umane|juridic|consilier juridic|monitorul oficial/],
      ["Compartimentul Fond Funciar și Patrimoniu", /fond funciar|patrimoniu|cadastr/]] },
    { g: "Alte compartimente", s: [["Registrul Agricol", /registr\w* agricol/], ["Protecție Civilă și Situații de Urgență", /protectie civil|situatii de urgenta/], ["Achiziții Publice", /achizitii/],
      ["Transport Local și Autorizare Comercială", /transport|autorizare comercial/], ["Proiecte și Programe", /proiecte|programe|fonduri europene|implementare/], ["Audit public intern", /audit/], ["Informatică", /informatic|it\b/]] }
  ];
  function orgDate(rows) {
    var prim = rows.filter(function (c) { return c.institutie.indexOf("Primăria") === 0; }), luate = {}, cut = {};
    ORG.forEach(function (gr) { gr.s.forEach(function (st) {
      // structura numită în anunț are întâietate; altfel, după funcție și titlu
      var L2 = prim.filter(function (c) { return !luate[c.id] && st[1].test(norm(c.structura || ((c.functii || []).join(" ") + " " + c.titlu))); });
      L2.forEach(function (c) { luate[c.id] = 1; }); cut[st[0]] = L2;
    }); });
    cut["Alte structuri sau nespecificat"] = prim.filter(function (c) { return !luate[c.id]; });
    var inst = {}; rows.forEach(function (c) { if (c.institutie.indexOf("Primăria") !== 0) (inst[c.institutie] = inst[c.institutie] || []).push(c); });
    return { cut: cut, inst: inst };
  }
  function orgBox(nume, L2, cheie) {
    var rec = L2.filter(function (c) { return c.procedura !== "promovare"; }), ok = rec.filter(function (c) { return aStare(c) === "ok"; }).length,
      curs = L2.filter(function (c) { return aStare(c) === "curs"; }).length, prom = L2.length - rec.length;
    return '<button type="button" class="org-b' + (L2.length ? "" : " gol") + '" data-k="' + esc(cheie) + '"><span class="org-n">' + esc(nume) + '</span><span class="org-c">' +
      (L2.length ? '<span title="concursuri de angajare și transferuri">' + rec.length + " concursuri</span>" + (ok ? '<span class="ok" title="posturi ocupate prin concurs">' + ok + " ocupate</span>" : "") +
        (curs ? '<span class="ic">' + curs + " în curs</span>" : "") + (prom ? '<span class="mut">' + prom + " promovări</span>" : "") : '<span class="mut">fără concursuri publicate</span>') + "</span></button>";
  }
  function organigrama(el, rows) {
    var D = orgDate(rows), toate = {};
    Object.keys(D.cut).forEach(function (k) { toate["s:" + k] = { n: k, L: D.cut[k] }; });
    Object.keys(D.inst).forEach(function (k) { toate["i:" + k] = { n: k, L: D.inst[k] }; });
    var instK = Object.keys(D.inst).sort(function (a, b) { return D.inst[b].length - D.inst[a].length; });
    el.innerHTML = '<div class="org">' +
      '<div class="org-top"><div class="org-sus">Consiliul Local al Municipiului Rădăuți</div><div class="org-lin"></div><div class="org-sus prim">Primarul Municipiului Rădăuți</div></div>' +
      '<div class="org-ram"><div class="org-col"><h3>Aparatul de specialitate al primarului</h3>' + ORG.map(function (gr) {
        return '<div class="org-g"><div class="org-gn">' + esc(gr.g) + "</div>" + gr.s.map(function (st) { return orgBox(st[0], D.cut[st[0]] || [], "s:" + st[0]); }).join("") + "</div>";
      }).join("") + '<div class="org-g"><div class="org-gn">Nelegate de o structură</div>' + orgBox("Alte structuri sau nespecificat", D.cut["Alte structuri sau nespecificat"], "s:Alte structuri sau nespecificat") + "</div></div>" +
      '<div class="org-col"><h3>Instituții și servicii subordonate</h3><div class="org-g">' + (instK.length ? instK.map(function (k) { return orgBox(k, D.inst[k], "i:" + k); }).join("") : '<p class="empty">Niciun concurs al instituțiilor subordonate.</p>') + "</div></div></div>" +
      '<div id="org-det" class="org-det" hidden></div></div>';
    Array.prototype.forEach.call(el.querySelectorAll(".org-b"), function (b) {
      b.addEventListener("click", function () {
        var x = toate[b.dataset.k], det = $("org-det");
        Array.prototype.forEach.call(el.querySelectorAll(".org-b"), function (o) { o.classList.toggle("act", o === b); });
        if (!x) return;
        var fn = {}; x.L.forEach(function (c) { (c.functii && c.functii.length ? c.functii : ["(funcție necitită)"]).forEach(function (f) { var y = fn[f] = fn[f] || { n: 0, ok: 0, nu: 0, curs: 0 }; y.n++; var s2 = aStare(c); if (s2 === "ok") y.ok++; else if (s2 === "nu") y.nu++; else if (s2 === "curs") y.curs++; }); });
        det.hidden = false;
        det.innerHTML = '<div class="h-row"><h3>' + esc(x.n) + '</h3><button type="button" class="lnk" id="org-x">închide</button></div>' +
          (x.L.length ? '<div class="tw"><table class="lit-t"><thead><tr><th>Funcția</th><th class="n">Concursuri</th><th class="n">Ocupate</th><th class="n">Neocupate</th><th class="n">În curs</th></tr></thead><tbody>' +
            Object.keys(fn).sort(function (a, c) { return fn[c].n - fn[a].n; }).map(function (f) { var y = fn[f]; return "<tr><td>" + esc(f.charAt(0).toUpperCase() + f.slice(1)) + '</td><td class="n">' + y.n + '</td><td class="n">' + y.ok + '</td><td class="n">' + y.nu + '</td><td class="n">' + y.curs + "</td></tr>"; }).join("") +
            "</tbody></table></div>" + x.L.slice(0, 12).map(angFisa).join("") + (x.L.length > 12 ? '<p class="note">Și încă ' + (x.L.length - 12) + ' concursuri, în <a href="#primarie/angajari/concursuri">lista completă</a>.</p>' : "")
            : '<p class="empty">Nu am găsit concursuri publicate pentru această structură. Posturile ei pot fi ocupate de mult timp sau anunțurile nu numesc structura.</p>');
        $("org-x").addEventListener("click", function () { det.hidden = true; b.classList.remove("act"); });
        det.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });
  }

  function angPosturi(el, rows, F) {
    var O = (CON.organigrama || []).slice().reverse(), oc = CON.organigrama_curenta || {};
    if (F.inst) O = O.filter(function (o) { return (o.institutii || []).some(function (i) { return i.split(" ")[0] === F.inst.split(" ")[0]; }); });
    var rec = rows.filter(function (c) { return c.procedura === "recrutare" || c.procedura === "transfer" || c.procedura === "management"; });
    var g = {};
    rec.forEach(function (c) {
      (c.functii && c.functii.length ? c.functii : ["(funcție necitită)"]).forEach(function (f) {
        var k = c.institutie + "|" + f, x = g[k] = g[k] || { inst: c.institutie, f: f, n: 0, ok: 0, nu: 0, curs: 0, alt: 0, ultim: "" };
        var s = aStare(c); x.n++; if (s === "ok") x.ok++; else if (s === "nu") x.nu++; else if (s === "curs") x.curs++; else x.alt++;
        if ((c.inceput || "") > x.ultim) x.ultim = c.inceput;
      });
    });
    var G = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.n - a.n || (b.ultim > a.ultim ? 1 : -1); });
    var curs = rows.filter(function (c) { return aStare(c) === "curs"; });
    var cifre = function (o) { var c = o.cifre || {}, p = []; if (c.total) p.push("<b>" + c.total + " posturi</b>"); if (c.publice) p.push(c.publice + " funcții publice"); if (c.contractuale) p.push(c.contractuale + " contractuale"); if (c.demnitate) p.push(c.demnitate + " de demnitate"); return p.join(", ") || (INTERN ? (o.are_text ? "cifrele nu au putut fi citite" : "document scanat, necitit încă") : "vezi hotărârea"); };
    el.innerHTML = '<section class="card section"><h2>Organigrama și concursurile ei</h2><p class="note">Apasă pe o structură ca să vezi ce posturi s-au scos la concurs acolo, cine le-a ocupat și ce concursuri sunt în curs. ' +
      "Structura e cea din pagina " + (safeUrl(oc.stat_de_functii) ? '<a href="' + esc(oc.stat_de_functii) + '" rel="noopener">„Stat de funcții”</a>' : "„Stat de funcții”") + " a primăriei; organigrama oficială e " +
      (safeUrl(oc.pagina) ? '<a href="' + esc(oc.pagina) + '" rel="noopener">aici</a>' : "pe site-ul primăriei") + ". Concursurile sunt legate de o structură după cuvintele din anunț, deci încadrarea e orientativă.</p>" + '<div id="org-v"></div></section>' +
      (curs.length ? '<section class="card section"><h2>Concursuri în desfășurare</h2>' + curs.slice(0, 8).map(angFisa).join("") + "</section>" : "") +
      '<section class="card section"><h2>Posturile scoase la concurs, pe funcții</h2><p class="note">Concursurile de angajare, transferurile și concursurile de management: de câte ori s-a scos la concurs fiecare funcție și cu ce rezultat. Un post scos la concurs era vacant la acel moment. Apasă pe o funcție ca să vezi concursurile.</p>' +
      (G.length ? '<div class="tw"><table class="lit-t"><thead><tr><th>Funcția</th><th>Instituția</th><th class="n">Concursuri</th><th class="n">Ocupate</th><th class="n">Neocupate</th><th class="n">În curs</th><th class="n">Fără rezultat citit</th><th>Ultimul</th></tr></thead><tbody>' +
        G.slice(0, 80).map(function (x) {
          var f = x.f.charAt(0).toUpperCase() + x.f.slice(1);
          return "<tr><td>" + (x.f.charAt(0) === "(" ? esc(f) : '<a href="' + angLink("concursuri", F, { q: x.f, inst: x.inst }) + '">' + esc(f) + "</a>") + "</td><td>" + esc(x.inst) + '</td><td class="n">' + x.n + '</td><td class="n">' + x.ok +
            '</td><td class="n">' + x.nu + '</td><td class="n">' + x.curs + '</td><td class="n">' + x.alt + '</td><td class="nw">' + esc(zi(x.ultim)) + "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="empty">Niciun concurs de angajare pentru filtrele alese.</p>') + "</section>" +
      '<section class="card section"><h2>Istoricul organigramei</h2><p class="note">Hotărârile consiliului local care aprobă sau modifică organigrama, statul de funcții sau numărul de posturi, cele mai noi întâi. Numărul de posturi e citit automat din textul hotărârii (adesea scanat), deci e orientativ: verifică în document.</p>' +
      (O.length ? '<div class="tw"><table class="lit-t"><thead><tr><th>Hotărârea</th><th>Data</th><th>Instituția</th><th>Ce face</th><th>Posturi (citit automat)</th></tr></thead><tbody>' +
        O.map(function (o) {
          return '<tr><td class="nw"><a href="#consiliu/hcl/' + o.an + "/" + o.nr + '">HCL ' + o.nr + "/" + o.an + '</a></td><td class="nw">' + esc(zi(o.data)) + "</td><td>" + esc((o.institutii || []).join(", ")) +
            '</td><td><span title="' + esc(o.titlu) + '">' + esc(o.tip === "modificare" ? "modifică" : "aprobă") + "</span>: " + esc(o.titlu.length > 140 ? o.titlu.slice(0, 137) + "..." : o.titlu) + "</td><td>" + cifre(o) + "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="empty">Nicio hotărâre despre organigramă găsită încă.</p>') + "</section>";
    organigrama($("org-v"), rows);
  }

  // ---------- Căutare în tot monitorul ----------
  function cauta(el, r) {
    var q0 = (r.q || {}).q || "";
    el.innerHTML = head("Caută în monitor", "Hotărâri, proiecte, ședințe, contracte, certificate și autorizații, achiziții publice, furnizori, concursuri" + (INTERN ? ", litigii" : "") + " și textul documentelor, într-un singur loc.", r) +
      '<div class="card section sx-bar"><div class="filters"><input id="c-q" type="search" value="' + esc(q0) + '" placeholder="' + (INTERN ? "Ce cauți? (ex. Putnei, asfaltare, buget 2025, SRL, 1234/285/2024)" : "Ce cauți? (ex. Putnei, buget 2025, asfaltare, SRL, HCL 160/2026)") + '" aria-label="Caută" autofocus></div></div><div id="c-out"></div>';
    var inp = $("c-q"), t;
    function pornire() {
      var q = inp.value.trim();
      history.replaceState(null, "", "#cauta" + (q ? "?q=" + encodeURIComponent(q) : ""));
      cautaRez($("c-out"), q);
    }
    inp.addEventListener("input", function () { clearTimeout(t); t = setTimeout(pornire, 300); });
    inp.focus();
    if (q0) pornire();
  }
  function potriveste(q) {
    var w = norm(q).split(/\s+/).filter(function (x) { return x.length > 1; });
    return function (text) { var n = norm(text); return w.every(function (x) { return n.indexOf(x) >= 0; }); };
  }
  function cautaRez(el, q) {
    if (norm(q).replace(/\s/g, "").length < 3) { el.innerHTML = '<p class="note">Scrie cel puțin trei litere.</p>'; return; }
    var ok = potriveste(q), grupe = [];
    function grupa(titlu, lst, item, maiMulte) {
      if (!lst.length) return;
      grupe.push('<section class="card section"><h2>' + esc(titlu) + ' <small class="muted">' + nr(lst.length) + "</small></h2>" + lst.slice(0, 8).map(item).join("") +
        (lst.length > 8 && maiMulte ? '<p class="note"><a href="' + maiMulte + '">Vezi toate cele ' + nr(lst.length) + "</a></p>" : lst.length > 8 ? '<p class="note">Și încă ' + nr(lst.length - 8) + ".</p>" : "") + "</section>");
    }
    grupa("Hotărâri", (L.hcl || []).filter(function (x) { return ok(x.titlu + " hcl " + x.nr + "/" + x.an); }), function (x) { return doc(linkHcl(x), x.titlu, x.data ? "adoptată " + zi(x.data) : "", x); });
    grupa("Proiecte de hotărâre", (L.proiecte || []).filter(function (x) { return ok(x.titlu); }), function (x) { return doc("Proiect", x.titlu, x.postat ? "postat " + zi(x.postat) : "", x); });
    grupa("Ședințe", (L.pv || []).filter(function (x) { return ok(x.titlu + " " + zi(x.data) + " " + (x.data || "")); }), function (x) { return doc(linkSed(x.data, x.tip), x.titlu, "", x); });
    grupa("Contracte publicate pe site", (L.contracte || []).filter(function (x) { return ok(x.titlu); }), function (x) { return doc(zi(x.postat), x.titlu, "", x); });
    grupa("Documente de buget", (L.buget || []).concat(L.bilanturi || []).filter(function (x) { return ok(x.titlu); }), function (x) { return doc(zi(x.postat), x.titlu, "", x); });
    if (URB) ["ac", "cu"].forEach(function (k) {
      grupa(k === "ac" ? "Autorizații de construire" : "Certificate de urbanism", (URB[k] || []).filter(function (a) { return ok([a.nr, a.solicitant, a.adresa, a.strada, a.scop, a.proiectant, a.executant].join(" ")); }), function (a) {
        var f = safeUrl(a.registru_pdf);
        return '<div class="doc"><div class="h"><span class="id">' + (k === "ac" ? "AC " : "CU ") + esc(a.nr || "fără nr.") + " · " + esc(zi(a.data)) + '</span><span class="tag">' + esc(a.categorie || "") + "</span></div>" +
          '<div class="t"><strong>' + esc(a.solicitant || "") + "</strong>" + (a.scop ? " - " + esc(a.scop.slice(0, 200)) : "") + '</div><div class="m"><span>' + esc(a.strada || a.adresa || "") + "</span>" + (f ? '<a href="' + esc(f) + '" rel="noopener">registrul (PDF)</a>' : "") + "</div></div>";
      }, "#primarie/urbanism/" + k);
    });
    if (SX) {
      var fz = SX.furn.map(function (f, i) { return { f: f, i: i }; }).filter(function (o) { return o.f[0] && ok(o.f.join(" ")); });
      grupa("Furnizori ai instituțiilor din Rădăuți", fz, function (o) { return '<div class="doc"><div class="h"><span class="id">' + fLink(o.i) + '</span><span class="muted">CUI ' + esc(o.f[0]) + "</span></div></div>"; });
      grupa("Achiziții publice", SX.A.filter(function (x) { return x.ok && x.t !== "cn" && ok([x.o, x.cod, SX.cpv[x.c]].join(" ")); }).sort(function (a, b) { return (b.d || "").localeCompare(a.d || ""); }),
        function (x) { return sxItem(x, true); }, "#bani/achizitii?q=" + encodeURIComponent(q));
    }
    if (LIT) grupa("Litigii", (LIT.dosare || []).filter(function (d) { return ok([d.numar, d.obiect, d.grup].concat((d.adverse || []).map(function (p) { return p.nume; })).join(" ")); }), function (d) {
      return '<div class="doc"><div class="h"><span class="id"><a href="#litigii/dosare?v=fise&q=' + encodeURIComponent(d.numar) + '">' + esc(d.numar) + "</a></span>" + rzTag(d) + '<span class="muted">' + esc(zi(d.data)) + '</span></div><div class="t">' + esc(d.obiect || "") + "</div></div>";
    }, "#litigii/dosare?v=fise&q=" + encodeURIComponent(q));
    if (CON) grupa("Concursuri și angajări", (CON.concursuri || []).filter(function (c) { return ok([c.titlu, (c.functii || []).join(" "), c.structura, c.institutie, c.nr_anunt].join(" ")); }), function (c) {
      return '<div class="doc"><div class="h"><span class="id"><a href="#primarie/angajari/concursuri?q=' + encodeURIComponent(c.nr_anunt || (c.functii || [])[0] || "") + '">' + esc(c.procedura_nume) + "</a></span>" +
        '<span class="rz ' + ACLS[aStare(c)] + '">' + esc(c.stare) + '</span><span class="muted">' + esc(zi(c.inceput)) + '</span></div><div class="t">' + esc(c.titlu.slice(0, 220)) + "</div></div>";
    }, "#primarie/angajari/concursuri?q=" + encodeURIComponent(q));
    grupe.push('<section class="card section"><h2>În textul documentelor</h2><div id="c-ft"></div><p class="note"><a href="#texte?q=' + encodeURIComponent(q) + '">Caută doar în text, cu filtru pe felul documentului</a></p></section>');
    var lipsa = [];
    if (!URB) lipsa.push(get(DATA + "urbanism.json").then(function (d) { URB = URB || d; }).catch(function () { URB = URB || { cu: [], ac: [] }; }));
    if (SX === null) lipsa.push(get(DATA + "sicap-explorer.json").then(function (d) { SX = SX || sxPrep(d); }).catch(function () { SX = SX || false; }));
    if (!CON) lipsa.push(get(DATA + "concursuri.json").then(function (d) { CON = CON || d; }).catch(function () { CON = CON || { concursuri: [], organigrama: [] }; }));
    if (!LIT && INTERN) lipsa.push(get(DATA + "litigii.json").then(function (d) { LIT = LIT || d; }).catch(function () { LIT = LIT || { dosare: [], noutati: [] }; }));
    el.innerHTML = (grupe.join("") || (lipsa.length ? "" : '<p class="empty">Nimic găsit pentru „' + esc(q) + "”.</p>")) + (lipsa.length ? '<p class="updated">' + (INTERN ? "Se încarcă și urbanismul, achizițiile, concursurile și litigiile..." : "Se încarcă și urbanismul, achizițiile și concursurile...") + "</p>" : "");
    if ($("c-ft")) ftBox($("c-ft"), { q: q, cate: 8, ascuns: true });
    if (lipsa.length) Promise.all(lipsa).then(function () { if ($("c-q") && $("c-q").value.trim() === q) cautaRez(el, q); });
  }

  function texte(el) {
    var items = Object.keys(WORD).map(function (u) { return { pdf: u, word: WORD[u], sursa: WORD[u].split("/")[0], titlu: WORD[u].split("/").slice(1).join("/").replace(/\.docx$/, "") }; });
    var surse = {}; items.forEach(function (x) { surse[x.sursa] = (surse[x.sursa] || 0) + 1; });
    el.innerHTML = head("Textele documentelor", "Textul fiecărui document publicat de primărie, extras automat (cele scanate sunt citite prin recunoaștere optică, deci pot avea greșeli). Documentul oficial e cel de pe site-ul primăriei, la care duce fiecare rezultat.", route()) +
      '<section class="card section"><h2>Caută în textul tuturor documentelor</h2><div id="ft-all"></div></section>' +
      (INTERN ? '<section class="card section"><h2>Documentele, după nume (Word)</h2><div id="lst"></div></section>' : "");
    ftBox($("ft-all"), { q: (route().q || {}).q || "", onQuery: function (q) { history.replaceState(null, "", "#texte" + (q ? "?q=" + encodeURIComponent(q) : "")); } });
    if (!INTERN) return;
    lista($("lst"), items, {
      placeholder: "Caută după numele documentului",
      an: function (x) { var m = x.titlu.match(/(?:din |\.)(20\d\d)\b/); return m ? m[1] : ""; }, text: function (x) { return x.titlu + " " + x.sursa; },
      extraFilter: { html: '<select aria-label="Sursa"><option value="">Toate sursele</option>' + Object.keys(surse).sort().map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + " (" + surse[s] + ")</option>"; }).join("") + "</select>", test: function (x, e) { return x.sursa === e; } },
      item: function (x) { return doc(esc(x.sursa), x.titlu, "", { pdf: x.pdf }); }
    });
  }

  // ---------- Pagini pe teme: aceleași surse (hotărâri, proiecte, ședințe, investiții, achiziții, buget) filtrate după subiect ----------
  var SX_ERR = false;
  function incarcaBug() { return BUG !== undefined ? Promise.resolve(BUG) : get(DATA + "buget.json").then(function (d) { BUG = d; return d; }).catch(function () { BUG = null; return null; }); }
  function incarcaSX() { return SX || SX_ERR ? Promise.resolve(SX) : get(DATA + "sicap-explorer.json").then(function (d) { SX = sxPrep(d); return SX; }).catch(function () { SX_ERR = true; return null; }); }
  var RX_SC = "servicii comunale|energi\\w* termic|termoficar|agent\\w* termic|pierderilor induse|salubrizare stradala|dezapezir|deszapezir|(serviciu\\w*|activitat\\w*|contract\\w*|tarif\\w*) .{0,40}iluminat\\w* public|iluminat public al municipiului";
  var FEL_SC = [["Curățenia străzilor și deszăpezirea", "salubrizare stradala|dezapez|deszapez"], ["Iluminatul public", "iluminat"],
    ["Termoficarea: prețuri", "tarif|pretul local|pretului local"], ["Termoficarea: pierderi și subvenții", "pierderi|subventi"], ["Termoficarea: contractul", "energi\\w* termic|termoficar|agent\\w* termic"],
    ["Conducerea: AGA și consiliul de administrație", "adunar\\w* general|\\baga\\b|consiliu\\w* de administra"], ["Bani: buget, capital, credite, audit", "venituri si cheltuieli|capital\\w* social|credit|imprumut|audit|cheltuielilor"],
    ["Terenuri și alte contracte", "."]];
  var TEMA_CFG = {
    "servicii/strazi": { alerta: "dezapez", titlu: "Curățenia străzilor și deszăpezirea", text: "Măturatul și spălatul străzilor și deszăpezirea le face Servicii Comunale, la tarifele aprobate de consiliul local. Aici: hotărârile, tarifele și ce s-a cumpărat pentru iarnă.",
      rx: "salubrizare stradala|dezapez|deszapez|maturat|curatenie stradal|zapad|polei|antiderapant|igienei publice", sx: "dezapez|deszapez|zapad|antiderapant|sare (de |pentru )?deszapez|sare industriala|sare gema|polei|maturat|maturator|salubrizare stradala" },
    "servicii/iluminat": { alerta: "ilumin", extra: iluminatHtml, titlu: "Iluminatul public", text: "Becurile și stâlpii de pe străzi: contractul pentru întreținerea iluminatului, tarifele, extinderile de rețea și modernizările aprobate de consiliul local.",
      rx: "iluminat", sx: "iluminat|corpuri de iluminat|stalp\\w* .{0,20}iluminat", fel: [["Contractul și tarifele", "contract|tarif|gestiun|studiu\\w* de oportunitate|prestari"], ["Investiții: extinderi și modernizări", "."]] },
    "servicii/hotarari": { titlu: "Toate hotărârile despre Servicii Comunale", text: "Hotărârile consiliului local despre societate și serviciile pe care le face pentru oraș, pe teme.", rx: RX_SC, fel: FEL_SC, sx: false, cui: "2563140", faraSicap: true },
    "servicii/salubrizare": { alerta: "salubr", titlu: "Salubrizare", text: "Ridicarea gunoiului menajer e organizată la nivelul județului Suceava: din 2025 o face operatorul regional al zonei Rădăuți, iar până atunci a făcut-o Servicii Comunale. Aici: cât plătește populația, hotărârile consiliului local despre salubrizare (regulamentul județean, taxa, cantitățile minime pentru firme), investițiile și cheltuielile orașului.",
      extra: salubTarifeHtml, dupa: salubTarifeDeseneaza,
      rx: "salubriz|deseu|gunoi|colectar\\w* selectiv|insul\\w* ecologic|asociati\\w* de dezvoltare intercomunitara|ecologizar", nu: "salubrizare stradala", sx: "deseu|gunoi|salubriz|ecologiz|pubel|europubel|insul\\w* ecologic", capitol: "Protecția mediului (salubritate, canalizare)",
      fel: [["Regulamente și organizarea serviciului", "regulament|asociati|delegar|contract|norme"], ["Taxe și tarife", "tax|tarif|cantitat"], ["Investiții", "."]] },
    "servicii/apa": { alerta: "apa", extra: apaTarifeHtml, dupa: apaTarifeDeseneaza, titlu: "Apa rece și canalizarea", text: "Apa rece de la robinet și canalizarea le asigură operatorul regional ACET Suceava, în care orașul e acționar. Orașul votează în asociația județeană pentru apă și canalizare prin reprezentantul său, pe baza mandatelor date de consiliul local. Aici: mandatele, extinderile de rețele aprobate de consiliu și achizițiile.",
      rx: "\\bacet\\b|apa potabil|alimentare cu apa|ape uzate|apa si (de )?canal|canalizar|epurare|aductiune|asociati\\w* judetene? pentru apa", nu: "pluvial",
      sx: "apa potabila|canalizare|apa si canal|epurare|bransament\\w* (de )?apa|retea de apa|retele de apa", fel: [["Asociația județeană și operatorul", "acet|asociati|mandat|tarif|delegar"], ["Extinderi și investiții", "."]] },
    "servicii/alte": { titlu: "Piețe, cimitir, câini fără stăpân", text: "Serviciile mai mici ale orașului: piețele și târgul, cimitirul municipal, gestionarea câinilor fără stăpân și taxiurile. Aici: regulamentele, contractele și investițiile aprobate de consiliul local.",
      rx: "piet(e|ei|ii|ele)\\b|agroalimentar|targul obor|cimitir|caini|ecarisaj|adapost\\w* (de|pentru) (caini|animale)|regim de taxi|toalet\\w* public|wc public", nu: "vanzar|oborului",
      sx: "piata agroalimentara|targul obor|cimitir|caini|ecarisaj|capturare|adapost", fel: [["Piețe și târg", "piet|agroalimentar|obor|targ"], ["Cimitirul", "cimitir"], ["Câinii fără stăpân", "caini|ecarisaj|adapost|animal"], ["Taxiuri", "taxi"], ["Altele", "."]] },
    "teme/drumuri": { titlu: "Străzi și trotuare", text: "Asfaltări, modernizări, trotuare, semnalizare și sensuri giratorii: ce a aprobat consiliul local, ce s-a cumpărat și cât cheltuie orașul pe transporturi.",
      rx: "modernizar\\w* .{0,20}strad|reabilitar\\w* .{0,20}strad|asfalt|trotuar|carosabil|sens giratoriu|semnalizare|infrastructur\\w* rutier|drum\\w* (local|comunal|de acces)|strazi(lor)?\\b|pist\\w* de biciclet|pavaj|parte carosabila",
      nu: "nomenclator|denumir", cat: ["strazi", "trotuare"], sx: "asfalt|trotuar|carosabil|marcaj|semnalizare rutiera|indicatoare rutiere|modernizare strad|pavaj|borduri|mixtur", capitol: "Transporturi (străzi, drumuri, transport public)",
      fel: [["Asfaltări și modernizări", "asfalt|modernizar|reabilitar|pavaj|carosabil|strazi"], ["Trotuare", "trotuar"], ["Semnalizare și circulație", "semnalizare|giratoriu|circulati|biciclet"], ["Altele", "."]], harta: true },
    "teme/parcari": { titlu: "Parcări", text: "Locurile de parcare, parcările de reședință, taxele și regulile de parcare: hotărârile consiliului local, investițiile și achizițiile.",
      rx: "parcar|parcaj|stationar", sx: "parcar|parcaj|parcometr", fel: [["Reguli și taxe", "regulament|tax|tarif|abonament|reședinta|resedinta"], ["Amenajări și investiții", "."]] },
    "teme/scoli": { titlu: "Școli și grădinițe", text: "Rețeaua școlară, reparațiile și investițiile în școli și grădinițe, ce cumpără unitățile de învățământ și cât cheltuie orașul pe învățământ.",
      rx: "scoal|scoli|gradinit|liceu|colegiul|invatamant|\\bcres[ae]\\b|retea scolar|elevi|prescolar", nu: "comisi\\w* (pentru|de analiza)|locuint|amenajament|asfalt|covor", cat: ["scoli"], grupInst: "Școli și grădinițe", capitol: "Învățământ",
      fel: [["Rețeaua școlară", "retea|reteaua|organizar"], ["Investiții și reparații", "reabilit|reparat|modernizar|investit|indicator|construir|extinder|dotar|termoizol"], ["Altele", "."]] },
    "teme/parcuri": { titlu: "Parcuri și spații verzi", text: "Parcurile, locurile de joacă, registrul spațiilor verzi și grădina zoologică: hotărâri, investiții și achiziții.",
      rx: "\\bparc(ul|uri|urile|ului|urilor)?\\b|spati\\w* verz|loc\\w* de joaca|gradina zoo|parc zoo|\\barbori|toaletar", nu: "parcare|parcaj|parc industrial", cat: ["parcuri"],
      sx: "spatii verzi|loc de joaca|\\bparc(ul)?\\b|gazon|arbori|toaletare|plantar|\\bflori\\b|gradina zoo", sxNu: "fotovoltaic|parc auto|parcul auto" },
    "teme/pug": { titlu: "PUG și urbanism", text: "Planul urbanistic general (PUG) stabilește ce se poate construi și unde, în tot orașul; planurile zonale (PUZ) și de detaliu (PUD) schimbă sau precizează regulile pentru o zonă sau o parcelă.",
      rx: "plan\\w* urbanistic|\\bpug\\b|\\bpuz\\b|\\bpud\\b|regulament\\w* local de urbanism", fel: [["PUG", "general|\\bpug\\b"], ["PUZ", "zonal|\\bpuz\\b"], ["PUD", "detaliu|\\bpud\\b"], ["Altele", "."]], sx: "plan urbanistic|\\bpug\\b|\\bpuz\\b|urbanism" }
  };
  // o achiziție directă nu poate depăși pragurile legale; o valoare de milioane la una e o greșeală de introducere în SICAP și nu intră în sume
  function leiOk(x) { return x.t === "da" && x.lei > 1.5e6 ? 0 : x.lei || 0; }
  function temaPotriviri(C) {
    var rx = new RegExp(C.rx), nu = C.nu ? new RegExp(C.nu) : null;
    var ok = function (t) { t = norm(t); return rx.test(t) && !(nu && nu.test(t)); };
    var fel = (C.fel || []).map(function (f) { return [f[0], new RegExp(f[1])]; });
    var felDe = function (t) { t = norm(t); for (var i = 0; i < fel.length; i++) if (fel[i][1].test(t)) return fel[i][0]; return fel.length ? fel[fel.length - 1][0] : ""; };
    var H = (L.hcl || []).filter(function (x) { return ok(x.titlu); });
    H.forEach(function (x) { x._fel = felDe(x.titlu); });
    var azi = new Date().toISOString().slice(0, 10), an1 = String(new Date().getFullYear() - 1) + azi.slice(4);
    var P = (L.proiecte || []).filter(function (x) { return (x.postat || "") >= an1 && ok(x.titlu); });
    var urm = [];
    ((SED || {}).urmatoare || []).forEach(function (s) { (s.ordinea_de_zi || []).forEach(function (o) { if (o.text && ok(o.text)) urm.push({ data: s.data, ora: s.ora, tip: s.tip, text: o.text, nr: o.nr }); }); });
    var cons = ((SED || {}).consultare || []).filter(function (p) { return p.termen && p.termen >= azi && ok(p.obiect || p.titlu || ""); });
    var I = ((TEME || {}).investitii || []).filter(function (x) { return (C.cat && C.cat.indexOf(x.categorie) >= 0) || ok(x.nume); });
    var Dz = (((TEME || {}).dispozitii || {}).lista || []).filter(function (x) { return x.obiect && ok(x.obiect) && !/convoc/.test(norm(x.obiect)); });
    var S = [];
    if (SX && !C.faraSicap || SX && C.cui) {
      var rxS = C.sx ? new RegExp(C.sx) : C.sx === false ? null : rx, rxN = C.sxNu ? new RegExp(C.sxNu) : null, ci = C.cui && SX.fcui[C.cui] != null ? SX.fcui[C.cui] : -1;
      S = SX.A.filter(function (x) {
        if (x.t === "cn") return false;   // anunțurile de licitație sunt estimări, repetate la fiecare republicare: adunăm doar ce s-a atribuit
        if (/\bacet\b/i.test((SX.inst[x.i] || [])[1] || "") && !/radaut/.test(norm(x.o))) return false;   // operatorul regional de apă cumpără pentru tot județul
        if (ci >= 0 && x.f === ci) return true;
        if (C.grupInst) return (SX.inst[x.i] || [])[3] === C.grupInst;
        return rxS && rxS.test(norm(x.o)) && !(rxN && rxN.test(norm(x.o)));
      });
    }
    return { H: H, P: P, urm: urm, cons: cons, I: I, Dz: Dz, S: S, ok: ok, felDe: felDe };
  }
  function temaGen(el, r, C) {
    if (!C) { el.innerHTML = head("Pagina nu există", "Alege o temă din meniu.", r); return; }
    var cap = head(C.titlu, C.text, r);
    if (!TEME || BUG === undefined || (!SX && !SX_ERR) || !SED) {
      el.innerHTML = cap + '<p class="updated">Se încarcă datele...</p>';
      Promise.all([incarcaTeme(), incarcaBug(), incarcaSX(), incarcaSed()]).then(render);
      return;
    }
    var T = temaPotriviri(C), H = T.H, h = cap, azi = new Date().getFullYear();
    var aniH = {}; H.forEach(function (x) { if (x.an) aniH[x.an] = 1; });
    var ult = H.slice().sort(function (a, b) { return (b.data || String(b.an)).localeCompare(a.data || String(a.an)); })[0];
    var vI = T.I.reduce(function (a, x) { return a + (x.valoare || 0); }, 0), vS = T.S.reduce(function (a, x) { return a + leiOk(x); }, 0);
    var M = BUG && (BUG.entitati || []).filter(function (e) { return e.cui === BUG.municipiu; })[0], DB = BUG && M ? (BUG.detalii || {})[M.cui] || {} : {};
    var aniB = C.capitol ? Object.keys(DB).filter(function (a) { return DB[a].ch && DB[a].ch[C.capitol] != null; }).sort() : [], anB = aniB.filter(function (a) { return +a < azi; }).pop();
    h += '<div class="grid">' + tile("Hotărâri ale consiliului", nr(H.length), "", Object.keys(aniH).length ? "din " + Object.keys(aniH).sort()[0] + " până azi" : "") +
      (ult ? tile("Cea mai recentă", ult.data ? zi(ult.data) : String(ult.an), "", linkHcl(ult)) : "") +
      (T.I.length ? tile("Obiective de investiții", nr(T.I.length), "", vI ? "valoare aprobată: <strong>" + lei(vI) + "</strong>" : "") : "") +
      (T.S.length ? tile(C.grupInst ? "Achiziții ale școlilor" : "Achiziții în SICAP", lei(vS), "", nr(T.S.length) + " achiziții și contracte din 2018") : "") +
      (anB ? tile("Bugetul orașului, " + anB, lei(DB[anB].ch[C.capitol]), "", "la capitolul „" + esc(C.capitol.replace(/ \(.*/, "")) + "”" + (M.populatie ? ", adică <strong>" + lei(DB[anB].ch[C.capitol] / M.populatie) + "</strong> pe locuitor" : "")) : "") + "</div>";
    if (C.extra) h += C.extra(T);
    if (T.urm.length || T.cons.length || T.P.length) {
      h += '<section class="card section"><h2>' + (T.urm.length || T.cons.length ? "Ce e în lucru acum" : "Proiecte puse în consultare în ultimul an") + '</h2><ul class="sc-l">' +
        T.urm.map(function (o) { return '<li><b>' + esc(zi(o.data)) + "</b>, pe ordinea de zi a ședinței " + esc(TIP[o.tip] || "") + ': <a href="#consiliu/sedinte/' + esc(o.data) + '">' + esc(o.text.slice(0, 220)) + "</a></li>"; }).join("") +
        T.cons.map(function (p) { return "<li>Până la <b>" + esc(zi(p.termen)) + "</b> poți trimite propuneri la proiectul: " + esc((p.obiect || p.titlu).slice(0, 220)) + ' <a class="lk" href="' + esc(mailPropuneri(p)) + '">✉ Trimite propuneri</a></li>'; }).join("") +
        (T.cons.length ? "" : T.P.slice(0, 5).map(function (p) { return "<li>" + esc(zi(p.postat)) + ", pus în consultare: " + esc(p.titlu.replace(/^Anun\S+( din [\d.]+)?\s*[–-]?\s*/, "").replace(/^Proiect(ul)? de hot\S+\s+(înregistrat cu\s+)?(nr\.?\s*[\d\/.]+\s*)?/i, "").slice(0, 200)) + (safeUrl(p.pagina) ? ' <a class="lk" href="' + esc(p.pagina) + '" rel="noopener">anunțul</a>' : "") + "</li>"; }).join("")) +
        "</ul></section>";
    }
    var feluri = (C.fel || []).map(function (f) { return f[0]; }).filter(function (f) { return H.some(function (x) { return x._fel === f; }); });
    if (H.length) {
      h += '<section class="card section"><h2>Hotărârile consiliului local</h2>' + (feluri.length > 1 ? legend(feluri.map(function (f, i) { return [f, CUL[i % CUL.length]]; })) : "") +
        '<div class="chart" id="tg-ch"></div><div id="tg-h"></div></section>';
    }
    if (T.I.length) h += '<section class="card section"><div class="h-row"><h2>Investiții</h2><a href="#bani/investitii">toate investițiile orașului</a></div><p class="note">Obiectivele aprobate de consiliul local, cu valoarea din ultima hotărâre și stadiul după documente.</p><div id="tg-i"></div></section>';
    if (T.S.length) h += '<section class="card section"><h2>' + (C.grupInst ? "Ce cumpără școlile și grădinițele" : "Achiziții publice") + '</h2><p class="note">Din SICAP, după obiectul achiziției' + (C.grupInst ? " (instituțiile de învățământ)" : "") + ". Doar achizițiile directe și contractele atribuite, în lei, fără anunțurile de licitație (care sunt estimări)." + (function () { var g = T.S.filter(function (x) { return !leiOk(x) && x.lei; }).length; return g ? " " + (g === 1 ? "O achiziție directă are" : g + " achiziții directe au") + " în SICAP o valoare de milioane, peste pragul legal, deci greșit introdusă; nu e adunată." : ""; })() + "</p>" +
      '<div class="chart" id="tg-s"></div><div id="tg-sl"></div></section>';
    if (aniB.length) h += '<section class="card section"><h2>Cât cheltuie orașul: ' + esc(C.capitol) + '</h2><p class="note">Plățile efective din bugetul municipiului, pe ani (Ministerul Finanțelor, prin <a href="#bani/buget">pagina bugetului</a>).</p><div class="chart" id="tg-b"></div></section>';
    if (T.Dz.length) h += '<section class="card section"><div class="h-row"><h2>Dispozițiile primarului</h2><a href="#primarie/dispozitii">toate dispozițiile</a></div><div id="tg-d"></div></section>';
    el.innerHTML = h;
    if (C.dupa) C.dupa(T);
    if (H.length) {
      var aniL = []; for (var a = Math.min.apply(null, Object.keys(aniH).map(Number)); a <= azi; a++) aniL.push(String(a));
      var fs = feluri.length ? feluri : [""];
      chart($("tg-ch"), { cats: aniL, stacked: true, label: "Hotărâri pe ani", minW: aniL.length * 26, segLabel: false,
        series: fs.map(function (f, i) { return { name: f || "Hotărâri", color: CUL[i % CUL.length], values: aniL.map(function (a) { return H.filter(function (x) { return String(x.an) === a && (!f || x._fel === f); }).length; }) }; }),
        tooltip: function (i) { var a = aniL[i]; return "<b>" + a + "</b>" + fs.map(function (f) { var n = H.filter(function (x) { return String(x.an) === a && (!f || x._fel === f); }).length; return n ? "<br>" + esc(f || "hotărâri") + ": " + n : ""; }).join(""); } });
      lista($("tg-h"), H.slice().sort(function (a, b) { return (b.data || String(b.an)).localeCompare(a.data || String(a.an)) || b.nr - a.nr; }), { unitate: ["hotărâre", "hotărâri"],
        an: function (x) { return String(x.an); }, text: function (x) { return x.titlu + " " + x.nr + "/" + x.an; },
        extraFilter: feluri.length > 1 ? { html: '<select aria-label="Tema"><option value="">Toate temele</option>' + feluri.map(function (f) { return "<option>" + esc(f) + "</option>"; }).join("") + "</select>", test: function (x, e) { return x._fel === e; } } : null,
        item: function (x) { return doc(linkHcl(x), x.titlu, (x.data ? "adoptată " + zi(x.data) : "") + (x._fel && feluri.length > 1 ? ' · <span class="tag">' + esc(x._fel) + "</span>" : ""), x); } });
    }
    if (T.I.length) lista($("tg-i"), T.I.slice().sort(function (a, b) { return (b.ultima || b.prima || "").localeCompare(a.ultima || a.prima || ""); }), { unitate: ["obiectiv", "obiective"], placeholder: "Caută un obiectiv",
      an: function (x) { return (x.prima || "").slice(0, 4); }, text: function (x) { return x.nume + " " + (x.strazi || []).join(" "); },
      item: function (x) { var u = (x.pasi || [])[x.pasi.length - 1] || {}, st = STARE_INV[x.stare];
        return '<div class="doc"><div class="h"><span class="id">' + (x.valoare ? lei(x.valoare) : "valoare nepublicată") + "</span>" + (st ? '<span class="tag">' + esc(st[0]) + "</span>" : "") + '</div><div class="t">' + esc(x.nume) + '</div><div class="m">' +
          (u.nr ? "<span>ultima hotărâre: " + linkHcl(u) + (u.data ? ", " + zi(u.data) : "") + "</span>" : "") + ((x.strazi || []).length ? "<span>" + x.strazi.slice(0, 4).map(function (s) { return '<a href="#strada?s=' + encodeURIComponent(s) + '">' + esc(s) + "</a>"; }).join(", ") + "</span>" : "") + "</div></div>"; } });
    if (T.S.length) {
      var aniS = SX.ani.filter(function (a) { return T.S.some(function (x) { return x.an === a; }); }), u = unitate(Math.max.apply(null, aniS.map(function (a) { return T.S.filter(function (x) { return x.an === a; }).reduce(function (s, x) { return s + leiOk(x); }, 0); }).concat([1])));
      chart($("tg-s"), { cats: aniS, label: "Achiziții pe ani", series: [{ name: "Achiziții", color: "var(--c2)", values: aniS.map(function (a) { return rot(T.S.filter(function (x) { return x.an === a; }).reduce(function (s, x) { return s + leiOk(x); }, 0), u); }) }],
        tooltip: function (i) { var xs = T.S.filter(function (x) { return x.an === aniS[i]; }); return "<b>" + aniS[i] + "</b><br>" + nr(xs.length) + " achiziții, " + lei(xs.reduce(function (s, x) { return s + leiOk(x); }, 0)); } });
      lista($("tg-sl"), T.S.slice().sort(function (a, b) { return (b.d || "").localeCompare(a.d || ""); }), { unitate: ["achiziție", "achiziții"], placeholder: "Caută în achiziții",
        an: function (x) { return x.an; }, text: function (x) { return x.o + " " + ((SX.furn[x.f] || [])[1] || "") + " " + ((SX.inst[x.i] || [])[1] || ""); }, item: function (x) { return sxItem(x, true); } });
    }
    if (aniB.length) {
      var ub = unitate(Math.max.apply(null, aniB.map(function (a) { return DB[a].ch[C.capitol]; }).concat([1])));
      chart($("tg-b"), { cats: aniB, label: C.capitol + " pe ani", series: [{ name: C.capitol, color: "var(--c1)", values: aniB.map(function (a) { return rot(DB[a].ch[C.capitol], ub); }) }],
        tooltip: function (i) { var a = aniB[i]; return "<b>" + a + (+a === azi ? " (parțial)" : "") + "</b><br>" + lei(DB[a].ch[C.capitol]) + (M.populatie ? "<br>" + lei(DB[a].ch[C.capitol] / M.populatie) + " pe locuitor" : ""); } });
    }
    if (C.alerta) { el.insertAdjacentHTML("beforeend", alerteHtml("", "Primește pe e-mail noutățile despre " + C.titlu.toLowerCase().replace(/ \(.*/, ""), C.alerta)); alerteLeaga(el); }
    if (T.Dz.length) lista($("tg-d"), T.Dz, { unitate: ["dispoziție", "dispoziții"], an: function (x) { return String(x.an); }, text: function (x) { return x.obiect + " " + x.nr; },
      item: function (x) { return doc("Dispoziția " + esc(x.nr) + "/" + esc(x.an), x.obiect, x.data ? zi(x.data) : "", x); } });
  }

  // ---------- Salubrizarea: cât plătește populația (TEME.salubrizare, din surse/salubrizare/tarife.json) ----------
  function salubTarifeHtml() {
    var S = (TEME || {}).salubrizare, P = S && S.casnici || [];
    if (!P.length) return "";
    var u = P[P.length - 1], p0 = P[0], an = function (v, n) { return dec((v * n * 12).toFixed(2)) + " lei"; };
    var nc = (S.noncasnici || [])[S.noncasnici.length - 1];
    return '<section class="card section"><h2>Cât plătește populația pentru gunoi</h2>' +
      '<div class="grid">' + tile("Acum, de persoană", dec(u.lei_persoana_luna.toFixed(2)), "lei pe lună", "din " + esc(zi(u.de_la)) + ", " + linkHcl(u.hcl)) +
      tile("O familie de 4 persoane", an(u.lei_persoana_luna, 4), "", "pe an, la taxa de acum") +
      tile("Față de " + p0.de_la.slice(0, 4), "×" + dec((u.lei_persoana_luna / p0.lei_persoana_luna).toFixed(1)), "", dec(p0.lei_persoana_luna.toFixed(2)) + " lei de persoană pe lună în " + p0.de_la.slice(0, 4) + ", la Servicii Comunale") +
      (nc ? tile("Firme și instituții", nr(nc.lei_tona), "lei pe tonă", "din " + esc(zi(nc.de_la)) + ", " + linkHcl(nc.hcl)) : "") + "</div>" +
      '<p style="margin-top:12px">Până în mai 2025, gunoiul l-a ridicat Servicii Comunale, prin contractul de delegare nr. 2318/03.03.2008, iar oamenii plăteau direct operatorului prețul aprobat de consiliu. Din 1 iunie 2025 se plătește la primărie <b>taxa specială de salubrizare</b>, pentru fiecare persoană care locuiește la adresă, iar serviciul îl face operatorul regional. Cine nu separă corect deșeurile plătește un tarif mai mare.</p>' +
      legend([["deșeuri reziduale", "var(--c2)"], ["reciclabile", "var(--c1)"], ["biodegradabile", "var(--c3)"], ["preț întreg (fără defalcare)", "var(--plan)"]]) +
      '<div class="chart" id="sb-ch"></div>' +
      '<div class="tw"><table><thead><tr><th>De la</th><th>Ce se plătește</th><th class="n">Lei/persoană/lună</th><th class="n">Reziduale</th><th class="n">Reciclabile</th><th class="n">Biodegradabile</th><th class="n">Dacă nu separi corect</th><th class="n">Familie de 4, pe an</th><th>Hotărârea</th></tr></thead><tbody>' +
      P.slice().reverse().map(function (x) {
        var f = function (v) { return v != null ? dec(v.toFixed(2)) : "-"; };
        return "<tr><td>" + esc(zi(x.de_la)) + "</td><td>" + esc(x.cine || "") + (x.nota ? '<br><small class="muted">' + esc(x.nota) + "</small>" : "") + '</td><td class="n"><b>' + f(x.lei_persoana_luna) + '</b></td><td class="n">' + f(x.reziduale) +
          '</td><td class="n">' + f(x.reciclabile) + '</td><td class="n">' + f(x.biodegradabile) + '</td><td class="n">' + f(x.separare_incorecta) + '</td><td class="n">' + an(x.lei_persoana_luna, 4) + "</td><td>" + linkHcl(x.hcl) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<p class="note">Între octombrie 2017 și mai 2025 nu am găsit în hotărârile publicate altă modificare a prețului pentru populație. Dacă știi una, scrie-ne.</p></section>';
  }
  function salubTarifeDeseneaza() {
    var S = (TEME || {}).salubrizare, P = S && S.casnici || [], el = $("sb-ch");
    if (!P.length || !el) return;
    var cats = P.map(function (x) { return lunaScurt(x.de_la); }), v = function (k) { return P.map(function (x) { return x[k] || 0; }); };
    chart(el, { cats: cats, stacked: true, label: "Taxa de salubrizare pentru populație, lei de persoană pe lună", bwMax: 70, yFmt: function (x) { return x + " lei"; },
      segLabel: function (sr, i, v) { return dec(v.toFixed(2)); }, labelValue: function (i) { return dec(P[i].lei_persoana_luna.toFixed(2)) + " lei"; },
      series: [{ name: "Reziduale", color: "var(--c2)", values: v("reziduale") }, { name: "Reciclabile", color: "var(--c1)", values: v("reciclabile") },
        { name: "Biodegradabile", color: "var(--c3)", values: v("biodegradabile") }, { name: "Preț întreg", color: "var(--plan)", values: P.map(function (x) { return x.reziduale == null ? x.lei_persoana_luna : 0; }) }],
      tooltip: function (i) { var x = P[i]; return "<b>din " + esc(zi(x.de_la)) + "</b><br>" + dec(x.lei_persoana_luna.toFixed(2)) + " lei de persoană pe lună" + (x.reziduale != null ? "<br>reziduale " + dec(x.reziduale.toFixed(2)) + ", reciclabile " + dec(x.reciclabile.toFixed(2)) + ", biodegradabile " + dec(x.biodegradabile.toFixed(2)) : "") + "<br>HCL " + x.hcl.nr + "/" + x.hcl.an; } });
  }

  // ---------- Servicii publice: cine face fiecare serviciu, cum se plătește, cât costă ----------
  function serviciiPublice(el, r) {
    var cap = head("Servicii publice", "Cine face fiecare serviciu public din oraș (căldura, gunoiul, apa, curățenia străzilor, iluminatul), cum îl plătești, cât costă acum și ce a hotărât consiliul local.", r);
    if (!TEME || BUG === undefined || (!SX && !SX_ERR) || !SED || !TERMO) {
      el.innerHTML = cap + '<p class="updated">Se încarcă datele...</p>';
      Promise.all([incarcaTeme(), incarcaBug(), incarcaSX(), incarcaSed(), get(DATA + "termoficare.json").then(function (d) { TERMO = d; }).catch(function () { TERMO = { hotarari: [], preturi: [] }; })]).then(render);
      return;
    }
    var ult = function (k) { var H = temaPotriviri(TEMA_CFG[k]).H.slice().sort(function (a, b) { return (b.data || String(b.an)).localeCompare(a.data || String(a.an)); }); return H; };
    var hs = function (H) { return H.length ? nr(H.length) + " " + (H.length === 1 ? "hotărâre" : "hotărâri") + "; ultima: " + linkHcl(H[0]) + (H[0].data ? ", " + zi(H[0].data) : "") : "nicio hotărâre găsită"; };
    var P = (TERMO.preturi || []).filter(function (p) { return p.populatie_cu_tva; }), pu = P[P.length - 1];
    var TH = (TERMO.hotarari || []).slice().sort(function (a, b) { return (b.data || String(b.an)).localeCompare(a.data || String(a.an)); });
    var SB = ((TEME.salubrizare || {}).casnici || []), sb = SB[SB.length - 1], SV = TEME.servicii || {};
    var IL = ((SV.iluminat || {}).tarife || []).slice(-1)[0], AP = ((SV.apa || {}).tarife || []).slice(-1)[0];
    var R2 = [
      ["Căldura și apa caldă", "#servicii/termoficare", "Servicii Comunale S.A., societatea orașului", "cei racordați plătesc factura la operator; restul prețului (subvenția) îl plătesc toți locuitorii, din bugetul local",
        pu ? "<b>" + dec(pu.populatie_cu_tva.toFixed(2)) + " lei/MWh</b> plătesc cei racordați" + (pu.subventie_cu_tva ? ", plus " + dec(pu.subventie_cu_tva.toFixed(2)) + " lei/MWh subvenție din bugetul local, plătită de toți locuitorii" : "") + ", din " + zi(pu.de_la) : "", hs(TH)],
      ["Gunoiul menajer", "#servicii/salubrizare", "operatorul regional al zonei Rădăuți, prin asociația județeană (până în mai 2025, Servicii Comunale)", "taxa specială de salubrizare, la primărie, pentru fiecare persoană de la adresă",
        sb ? "<b>" + dec(sb.lei_persoana_luna.toFixed(2)) + " lei</b> de persoană pe lună, din " + zi(sb.de_la) : "", hs(ult("servicii/salubrizare"))],
      ["Apa rece și canalizarea", "#servicii/apa", "ACET S.A. Suceava, operatorul regional, în care orașul e acționar", "factura de la operator; tarifele se aprobă în asociația județeană, unde orașul votează prin mandatul dat de consiliu", AP && AP.canalizare != null ? "<b>" + dec((AP.apa + AP.canalizare).toFixed(2)) + " lei/mc</b> apă și canalizare, fără TVA, din " + zi(AP.de_la) : "", hs(ult("servicii/apa"))],
      ["Curățenia străzilor și deszăpezirea", "#servicii/strazi", "Servicii Comunale S.A.", "din bugetul local, la tarifele aprobate de consiliu", "", hs(ult("servicii/strazi"))],
      ["Iluminatul public", "#servicii/iluminat", "Servicii Comunale S.A., prin atribuire directă din 2025", "din bugetul local, la prețul de întreținere din contract", IL ? "<b>" + nr(IL.lei_luna) + " lei</b> pe lună, fără TVA, din " + zi(IL.de_la) : "", hs(ult("servicii/iluminat"))],
      ["Piețe, cimitir, câini fără stăpân", "#servicii/alte", "primăria și firmele cu care are contracte", "taxe și tarife locale, din regulamentele aprobate de consiliu", "", hs(ult("servicii/alte"))]];
    el.innerHTML = cap + '<section class="card section"><h2>Cine face ce și cine plătește</h2><div class="sp-g">' + R2.map(function (x) {
      return '<div class="sc-c"><h3><a href="' + x[1] + '">' + esc(x[0]) + '</a></h3><dl class="sp-dl"><dt>Cine îl face</dt><dd>' + esc(x[2]) + "</dd><dt>Cum plătești</dt><dd>" + esc(x[3]) + "</dd>" +
        (x[4] ? "<dt>Cât costă acum</dt><dd>" + x[4] + "</dd>" : "") + '</dl><p class="note">' + x[5] + "</p></div>";
    }).join("") + "</div></section>" +
      '<section class="card section"><h2>Servicii Comunale S.A.</h2><p>Societatea orașului face căldura, curățenia străzilor și deszăpezirea și lucrări pentru instituții. <a href="#servicii/societate">Ce face, cine o conduce și ce bani primește</a>.</p></section>';
  }

  // ---------- Apa și iluminatul: tarifele verificate (TEME.servicii, din surse/servicii/date.json) ----------
  function apaTarifeHtml() {
    var A = ((TEME || {}).servicii || {}).apa, T = A && A.tarife || [];
    if (!T.length) return "";
    var u = T[T.length - 1], p0 = T[0], f = function (v) { return v != null ? dec(v.toFixed(2)) : "-"; };
    return '<section class="card section"><h2>Cât costă metrul cub de apă</h2><div class="grid">' +
      tile("Apă potabilă", f(u.apa), "lei/mc", "fără TVA, din " + esc(zi(u.de_la))) + tile("Canalizare și epurare", f(u.canalizare), "lei/mc", "fără TVA, din " + esc(zi(u.de_la))) +
      (u.canalizare != null ? tile("Împreună", f(u.apa + u.canalizare), "lei/mc", "fără TVA; " + nr(Math.round((u.apa + u.canalizare) * 10)) + " lei la 10 mc pe lună") : "") +
      (p0.canalizare != null && u.canalizare != null ? tile("Față de " + p0.de_la.slice(0, 4), "×" + dec(((u.apa + u.canalizare) / (p0.apa + p0.canalizare)).toFixed(1)), "", f(p0.apa + p0.canalizare) + " lei/mc în " + p0.de_la.slice(0, 4)) : "") + "</div>" +
      '<p style="margin-top:12px">Tarifele nu le aprobă consiliul local, ci asociația județeană pentru apă și canalizare (AJAC Suceava), cu avizul autorității naționale de reglementare (ANRSC). Consiliul local dă mandat reprezentantului orașului în asociație, de exemplu pentru strategia de tarifare 2025-2029 (' + linkHcl(A.strategie.hcl) + "), care prevede creșteri în fiecare an, de la 1 ianuarie.</p>" +
      legend([["apă potabilă", "var(--c1)"], ["canalizare și epurare", "var(--c4)"]]) + '<div class="chart" id="ap-ch"></div>' +
      '<div class="tw"><table><thead><tr><th>De la</th><th class="n">Apă</th><th class="n">Canalizare</th><th>Sursa</th></tr></thead><tbody>' + T.slice().reverse().map(function (x) {
        return "<tr><td>" + esc(zi(x.de_la)) + '</td><td class="n">' + f(x.apa) + '</td><td class="n">' + f(x.canalizare) + "</td><td>" + (x.hcl ? linkHcl(x.hcl) + ": " : "") + (safeUrl(x.url) ? '<a href="' + esc(x.url) + '" rel="noopener">' + esc(x.sursa) + "</a>" : esc(x.sursa)) + "</td></tr>"; }).join("") +
      '</tbody></table></div><p class="note">Lei pe metru cub, fără TVA, aceleași în toată aria ACET. Lipsesc anii pentru care n-am găsit încă o sursă publică sigură.</p></section>';
  }
  function apaTarifeDeseneaza() {
    var A = ((TEME || {}).servicii || {}).apa, T = A && A.tarife || [], el = $("ap-ch");
    if (!T.length || !el) return;
    chart(el, { cats: T.map(function (x) { return lunaScurt(x.de_la); }), grouped: true, bwMax: 40, label: "Tarifele la apă și canalizare, lei pe metru cub, fără TVA",
      series: [{ name: "Apă potabilă", color: "var(--c1)", values: T.map(function (x) { return x.apa || 0; }) }, { name: "Canalizare", color: "var(--c4)", values: T.map(function (x) { return x.canalizare || 0; }) }],
      tooltip: function (i) { var x = T[i]; return "<b>din " + esc(zi(x.de_la)) + "</b><br>apă: " + (x.apa != null ? dec(x.apa.toFixed(2)) : "-") + " lei/mc<br>canalizare: " + (x.canalizare != null ? dec(x.canalizare.toFixed(2)) : "-") + " lei/mc"; } });
  }
  function iluminatHtml() {
    var I = ((TEME || {}).servicii || {}).iluminat, T = I && I.tarife || [];
    if (!T.length) return "";
    var u = T[T.length - 1], a = T[T.length - 2];
    return '<section class="card section"><h2>Cine face iluminatul și cât costă</h2><div class="grid">' +
      tile("Întreținerea, pe lună", nr(u.lei_luna), "lei", "fără TVA, din " + esc(zi(u.de_la)) + ", " + linkHcl(u.hcl)) +
      tile("Pe an", lei(u.lei_luna * 12), "", "fără TVA, plătiți din bugetul local") +
      (a ? tile("Înainte", nr(a.lei_luna), "lei pe lună", "din " + esc(zi(a.de_la)) + "; +" + dec((100 * (u.lei_luna / a.lei_luna - 1)).toFixed(1)) + "%") : "") +
      tile("Redevența", nr(I.redeventa_lunara_cu_tva), "lei pe lună", "cu TVA, plătită de operator orașului") + "</div>" +
      '<p style="margin-top:12px">Iluminatul îl întreține <b>' + esc(I.operator) + "</b>, prin " + esc(I.contract) + ". Prețul se indexează anual cu inflația. Extinderile de rețea și modernizările sunt investiții separate, aprobate de consiliul local.</p></section>";
  }

  // ---------- Servicii Comunale: pe scurt ----------
  // Documentele de pe serviciicomunale.ro (doar intern: unele au CNP, adrese, acte de identitate)
  var SCDOC = null;
  function comunaleDocumente(el, r) {
    var cap = head("Documentele Servicii Comunale", "Tot ce publică societatea pe site-ul ei (serviciicomunale.ro): articolele, paginile și fișierele încărcate, colectate zilnic. Textul documentelor scanate se recunoaște automat (OCR) și se poate căuta cu sonda (sc-grep, sc-text). Unele documente conțin date personale (CNP, adresă, act de identitate): nu se reproduc în materiale.", r);
    if (!SCDOC) {
      el.innerHTML = cap + '<p class="updated">Se încarcă lista...</p>';
      get(DATA + "comunale-documente.json").then(function (d) { SCDOC = d; comunaleDocumente(el, r); })
        .catch(function () { el.innerHTML = cap + '<section class="card section"><p>Lista apare după următoarea colectare zilnică.</p></section>'; });
      return;
    }
    var A = SCDOC.articole || [], cats = {};
    A.forEach(function (a) { (a.categorii || []).forEach(function (c) { cats[c] = (cats[c] || 0) + 1; }); });
    var nd = A.reduce(function (s, a) { return s + (a.documente || []).length; }, 0),
      ntxt = A.reduce(function (s, a) { return s + (a.documente || []).filter(function (d) { return d.text; }).length; }, 0);
    var h = cap + '<section class="card section"><div class="grid">' + tile("Articole și pagini", nr(A.length), "", "de pe serviciicomunale.ro") +
      tile("Documente", nr(nd), "", "PDF, Word, Excel") + tile("Cu text citit", nr(ntxt), "", "restul așteaptă descărcarea sau OCR-ul") + "</div>" +
      '<div class="flt" style="margin-top:12px"><input id="scd-q" type="search" placeholder="Caută în titluri (ex. bilanț, AGA, audit, termoficare)" style="min-width:260px"> ' +
      '<select id="scd-c"><option value="">Toate categoriile</option>' + Object.keys(cats).sort().map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + " (" + cats[c] + ")</option>"; }).join("") + "</select></div>" +
      '<div id="scd-l" style="margin-top:12px"></div></section>';
    el.innerHTML = h;
    var stare = function (d) { return d.text ? (d.ocr ? "text recunoscut (OCR)" : "text") : d.scanat ? "scanat, OCR în curs" : "nedescărcat încă"; };
    var arata = function () {
      var q = norm(document.getElementById("scd-q").value || ""), c = document.getElementById("scd-c").value;
      var L = A.filter(function (a) {
        return (!c || (a.categorii || []).indexOf(c) >= 0) && (!q || norm(a.titlu + " " + (a.documente || []).map(function (d) { return d.titlu; }).join(" ") + " " + (a.rezumat || "")).indexOf(q) >= 0);
      });
      document.getElementById("scd-l").innerHTML = L.length ? L.map(function (a) {
        return '<div class="doc"><div class="h"><span class="id">' + esc(a.data ? zi(a.data) : "fără dată") + "</span> " + (a.categorii || []).map(function (c) { return '<span class="tag">' + esc(c) + "</span>"; }).join(" ") +
          ' <a href="' + esc(a.pagina) + '" target="_blank" rel="noopener">' + esc(a.titlu) + "</a></div>" +
          (a.rezumat && !(a.documente || []).length ? '<p class="note">' + esc(a.rezumat.slice(0, 300)) + "</p>" : "") +
          ((a.documente || []).length ? '<ul class="sc-l">' + a.documente.map(function (d) { return '<li><a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.titlu) + "</a>" + (d.pagini ? " (" + d.pagini + " pag.)" : "") + ' <span class="muted">' + stare(d) + "</span></li>"; }).join("") + "</ul>" : "") + "</div>";
      }).join("") : '<p class="muted">Niciun rezultat.</p>';
    };
    document.getElementById("scd-q").addEventListener("input", arata);
    document.getElementById("scd-c").addEventListener("change", arata);
    arata();
  }

  function serviciiPeScurt(el, r) {
    var cap = head("Servicii Comunale S.A. Rădăuți", "Societatea pe acțiuni a orașului, care face termoficarea, curățenia străzilor și deszăpezirea și lucrări cerute de primărie și de instituțiile din oraș. Municipiul Rădăuți votează în adunarea generală a acționarilor prin reprezentanții numiți de consiliul local.", r);
    if (!TEME || BUG === undefined || (!SX && !SX_ERR) || !SED || !TERMO) {
      el.innerHTML = cap + '<p class="updated">Se încarcă datele...</p>';
      Promise.all([incarcaTeme(), incarcaBug(), incarcaSX(), incarcaSed(), get(DATA + "termoficare.json").then(function (d) { TERMO = d; }).catch(function () { TERMO = { hotarari: [], preturi: [] }; })]).then(render);
      return;
    }
    var C = TEMA_CFG["servicii/hotarari"], T = temaPotriviri(C), H = T.H;
    var de = function (f) { return H.filter(function (x) { return x._fel.indexOf(f) === 0; }).sort(function (a, b) { return (b.data || String(b.an)).localeCompare(a.data || String(a.an)); }); };
    var P = (TERMO.preturi || []).filter(function (p) { return p.populatie_cu_tva; }), pu = P[P.length - 1];
    var pierderi = TERMO.pierderi || [], sumP = pierderi.reduce(function (a, x) { return a + x.lei; }, 0);
    var S = T.S, vS = S.reduce(function (a, x) { return a + leiOk(x); }, 0);
    var card = function (titlu, href, txt, hs) {
      return '<div class="sc-c"><h3><a href="' + href + '">' + esc(titlu) + "</a></h3><p>" + txt + "</p>" + (hs.length ? '<p class="note">' + nr(hs.length) + " " + (hs.length === 1 ? "hotărâre" : "hotărâri") + "; ultima: " + linkHcl(hs[0]) + (hs[0].data ? ", " + zi(hs[0].data) : "") + "</p>" : "") + "</div>";
    };
    var termo = de("Termoficarea"), str = de("Curățenia"), il = de("Iluminatul"), con = de("Conducerea"), bani = de("Bani");
    var h = cap + '<section class="card section"><h2>Ce face pentru oraș</h2><div class="sc-g">' +
      card("Termoficarea", "#servicii/termoficare", "Produce și distribuie căldura și apa caldă, prin contractul de dare în administrare nr. 17021/22.11.2018, prelungit prin hotărâri ale consiliului." +
        (pu ? " Ultimul preț aprobat pentru cei racordați: <strong>" + dec(pu.populatie_cu_tva.toFixed(2)) + " lei/MWh</strong>, din " + esc(zi(pu.de_la)) + "." : ""), termo) +
      card("Curățenia străzilor și deszăpezirea", "#servicii/strazi", "Măturatul și spălatul străzilor și deszăpezirea, la tarifele aprobate de consiliul local.", str) +
      card("Iluminatul public", "#servicii/iluminat", "Întreține iluminatul public: întâi prin contractul nr. 3575/13.04.2007, prelungit de mai multe ori, apoi prin contractul de delegare nr. 4687/21.03.2025, atribuit direct.", il) +
      card("Lucrări pentru instituții", "#bani/achizitii/furnizor/2563140", S.length ? "Instituțiile din oraș i-au dat <strong>" + nr(S.length) + "</strong> achiziții directe în SICAP, în valoare de <strong>" + lei(vS) + "</strong> (lucrări, vidanjare, amenajări)." : "Achizițiile din SICAP apar după următoarea colectare.", []) +
      "</div></section>" +
      '<section class="card section"><h2>Cine o conduce și cine răspunde</h2><p>Societatea are un <b>consiliu de administrație</b>, ales printr-o procedură de selecție (guvernanța corporativă a întreprinderilor publice, OUG nr. 109/2011), și o <b>adunare generală a acționarilor</b> (AGA), în care orașul e reprezentat de consilieri locali desemnați prin hotărâre. Bugetul de venituri și cheltuieli al societății se aprobă anual.</p>' +
      (con.length ? '<ul class="sc-l">' + con.slice(0, 6).map(function (x) { return "<li>" + linkHcl(x) + (x.data ? " (" + esc(zi(x.data)) + ")" : "") + ": " + esc(x.titlu.replace(/^(Hot[aă]r[aâ]re|HCL)\s*(nr\.?\s*[\d.\/]+\s*(din [\d.]+)?)?\s*/i, "").slice(0, 200)) + "</li>"; }).join("") + "</ul>" : "") + "</section>" +
      '<section class="card section"><h2>Banii de la oraș</h2><div class="grid">' +
      (sumP ? tile("Pierderi acoperite din buget", lei(sumP), "", "la termoficare, " + esc(pierderi[0].perioada.split(" - ")[0]) + " - " + esc(pierderi[pierderi.length - 1].perioada.split(" - ").pop()) + ", prin " + nr(pierderi.length) + " hotărâri") : "") +
      (pu && pu.subventie_cu_tva ? tile("Subvenția la căldură", dec(pu.subventie_cu_tva.toFixed(2)), "lei/MWh", "partea din preț plătită din bugetul local, din " + esc(zi(pu.de_la))) : "") +
      (S.length ? tile("Achiziții directe de la societate", lei(vS), "", "de la instituțiile din oraș, din 2018") : "") + "</div>" +
      (bani.length ? '<h3 style="margin-top:14px">Buget, capital, credite, audit</h3><ul class="sc-l">' + bani.slice(0, 10).map(function (x) { return "<li>" + linkHcl(x) + (x.data ? " (" + esc(zi(x.data)) + ")" : "") + ": " + esc(x.titlu.replace(/^(Hot[aă]r[aâ]re|HCL)\s*(nr\.?\s*[\d.\/]+\s*(din [\d.]+)?)?\s*/i, "").slice(0, 200)) + "</li>"; }).join("") + "</ul>" : "") + "</section>";
    if (S.length) h += '<section class="card section"><div class="h-row"><h2>Ce i-au cumpărat instituțiile</h2><a href="#bani/achizitii/furnizor/2563140">fișa furnizorului</a></div><div class="chart" id="sc-s"></div><div id="sc-sl"></div></section>';
    h += '<section class="card section"><h2>Toate hotărârile, pe teme</h2><p><a href="#comunale/hotarari">' + nr(H.length) + " hotărâri ale consiliului local</a> despre societate și serviciile ei, din " + (H.length ? Math.min.apply(null, H.map(function (x) { return x.an; })) : "") + ".</p>" +
      '<p class="note">Bilanțurile și indicatorii societății (venituri, profit, angajați) le adăugăm într-o etapă următoare.</p></section>';
    el.innerHTML = h;
    if (S.length) {
      var aniS = SX.ani.filter(function (a) { return S.some(function (x) { return x.an === a; }); }), u = unitate(Math.max.apply(null, aniS.map(function (a) { return S.filter(function (x) { return x.an === a; }).reduce(function (s, x) { return s + leiOk(x); }, 0); }).concat([1])));
      chart($("sc-s"), { cats: aniS, label: "Achiziții directe de la Servicii Comunale, pe ani", series: [{ name: "Achiziții", color: "var(--c2)", values: aniS.map(function (a) { return rot(S.filter(function (x) { return x.an === a; }).reduce(function (s, x) { return s + leiOk(x); }, 0), u); }) }],
        tooltip: function (i) { var xs = S.filter(function (x) { return x.an === aniS[i]; }); return "<b>" + aniS[i] + "</b><br>" + nr(xs.length) + " achiziții, " + lei(xs.reduce(function (s, x) { return s + leiOk(x); }, 0)); } });
      lista($("sc-sl"), S.slice().sort(function (a, b) { return (b.d || "").localeCompare(a.d || ""); }), { unitate: ["achiziție", "achiziții"], placeholder: "Caută în achiziții",
        an: function (x) { return x.an; }, text: function (x) { return x.o + " " + ((SX.inst[x.i] || [])[1] || ""); }, item: function (x) { return sxItem(x, true); } });
    }
  }

  // ---------- Glosar: pagina cu toți termenii (explicațiile din pagini vin din GLOSAR, mai sus) ----------
  function glosarPagina(el, r) {
    var L2 = GLOSAR.slice().sort(function (a, b) { return a[0].localeCompare(b[0], "ro"); });
    el.innerHTML = head("Glosar", "Cuvintele din documentele consiliului și ale primăriei, explicate pe scurt. În paginile monitorului, cuvintele subliniate cu punctat au explicația la atingere.", r) +
      '<section class="card section"><div class="filters"><input type="search" id="gl-q" placeholder="Caută un cuvânt" aria-label="Caută în glosar"></div><dl class="glosar" id="gl-l">' +
      L2.map(function (g) { return '<div class="gl-i" data-t="' + esc(norm(g[0] + " " + g[2])) + '"><dt>' + esc(g[0]) + "</dt><dd>" + esc(g[2]) + "</dd></div>"; }).join("") + "</dl></section>";
    $("gl-q").addEventListener("input", function () { var q = norm(this.value).trim(); Array.prototype.forEach.call(document.querySelectorAll("#gl-l .gl-i"), function (d) { d.hidden = q && d.getAttribute("data-t").indexOf(q) < 0; }); });
  }

  // ---------- „Cum funcționează” și „Ce poți face tu”, sub fiecare pagină ----------
  var CF = {
    "consiliu/sedinte": ["Consiliul local se întrunește cel puțin o dată pe lună, în ședință ordinară. Primarul convoacă ședința prin dispoziție, cu ordinea de zi, cu cel puțin 5 zile înainte (3 zile la ședința extraordinară; de îndată doar în situații urgente). Ședința e legală dacă e prezentă majoritatea consilierilor în funcție. După ședință se publică procesul-verbal și hotărârile.",
      ["Ședințele sunt publice: poți veni să asiști. Uită-te în calendar la data și ora ședinței.", "Citește ordinea de zi înainte și întreabă-ți consilierii cum votează la proiectele care te privesc.", "Poți cere să iei cuvântul, în condițiile regulamentului consiliului."]],
    "consiliu/proiecte": ["Un proiect de hotărâre e propus de primar, de viceprimar, de consilieri sau de cetățeni. Proiectele normative se publică pentru consultare cu cel puțin 30 de zile înainte de vot. Apoi primesc raportul compartimentului de specialitate și avizul comisiilor, ajung pe ordinea de zi și se votează.",
      ["Trimite propuneri în scris până la termenul din anunț; butonul „Trimite propuneri” pregătește e-mailul.", "Dacă e un proiect important, o asociație poate cere în scris o dezbatere publică, iar primăria e obligată să o organizeze.", "Urmărește proiectul pe ordinea de zi a ședinței și vezi apoi cum s-a votat."]],
    "consiliu/hcl": ["Hotărârea se adoptă prin votul consilierilor, cu majoritatea cerută de lege (simplă, absolută sau calificată). Secretarul general o contrasemnează, o comunică prefectului, care îi verifică legalitatea, și o publică. Abia apoi produce efecte.",
      ["Caută hotărârile care te privesc, după stradă sau după cuvânt, și vezi cine a votat cum.", "Dacă o hotărâre ți se pare nelegală, poți cere prefectului să o verifice sau o poți ataca în instanță, la contencios administrativ, după plângerea prealabilă.", "Dacă nu găsești o hotărâre pe site, o poți cere în baza Legii nr. 544/2001."]],
    "consiliu/consilieri": ["Consilierii locali sunt aleși pe 4 ani. Votează hotărârile, lucrează în comisii de specialitate și trebuie să prezinte un raport anual de activitate, făcut public.",
      ["Vezi cum a votat consilierul tău și dacă a fost prezent.", "Scrie-le consilierilor despre o problemă din cartier; ei pot propune proiecte de hotărâre.", "Citește rapoartele lor anuale și întreabă-i despre ce au promis."]],
    "primarie/urbanism": ["Certificatul de urbanism spune ce se poate construi pe un teren și ce avize trebuie; nu dă dreptul de a construi. Autorizația de construire, emisă de primar, permite lucrările. Pe șantier trebuie afișat panoul cu datele autorizației.",
      ["Verifică pe hartă ce s-a autorizat pe strada ta.", "Dacă se construiește fără panou sau altfel decât scrie pe el, poți sesiza primăria (disciplina în construcții) și Inspectoratul de Stat în Construcții.", "Regulile generale le dă PUG-ul: urmărește consultările la actualizarea lui."]],
    "primarie/dispozitii": ["Dispozițiile sunt actele primarului: convocarea consiliului, numiri, comisii, ajutoare sociale. Secretarul general le contrasemnează legalitatea, iar cele normative se publică.",
      ["Caută dispozițiile pe o temă care te interesează.", "Dacă o dispoziție te privește direct, o poți contesta: întâi la primar (plângere prealabilă), apoi în instanță."]],
    "primarie/angajari": ["Posturile din aparatul de specialitate al primarului și din instituțiile subordonate se ocupă prin concurs, anunțat public, cu etape: selecția dosarelor, proba scrisă, interviul, rezultatele și contestațiile.",
      ["Urmărește anunțurile de concurs și termenele de depunere a dosarelor.", "Verifică rezultatele publicate după fiecare etapă."]],
    "bani/buget": ["Bugetul local e planul anual de venituri și cheltuieli. Primarul îl propune, proiectul se publică, iar locuitorii pot depune contestații în 15 zile. Consiliul local îl aprobă cu majoritate absolută, iar primarul îl execută. În timpul anului bugetul se poate rectifica.",
      ["Când proiectul de buget e publicat, trimite propuneri sau contestații.", "Compară ce s-a planificat cu ce s-a cheltuit efectiv (execuția).", "Cere detalii despre o cheltuială în baza Legii nr. 544/2001."]],
    "bani/taxe": ["Impozitele și taxele locale le stabilește consiliul local în fiecare an, în limitele din Codul fiscal. Se plătesc în două rate, până la 31 martie și 30 septembrie; consiliul poate da o reducere (bonificație) de până la 10% pentru plata integrală până la 31 martie.",
      ["Calculează cât plătești cu calculatorul de mai sus.", "Proiectul de taxe pentru anul următor se pune în consultare: poți trimite propuneri.", "Poți plăti online, pe ghiseul.ro."]],
    "bani/investitii": ["O investiție începe cu documentația (SF sau DALI), apoi consiliul aprobă indicatorii tehnico-economici, primăria face licitația, semnează contractul, iar la final lucrarea se recepționează.",
      ["Vezi ce se face pe strada ta și în ce stadiu e.", "Dacă o lucrare întârzie sau e prost făcută, sesizează primăria în scris; ai dreptul la răspuns în 30 de zile.", "Cere contractul și procesul-verbal de recepție în baza Legii nr. 544/2001."]],
    "bani/achizitii": ["Instituțiile cumpără prin SICAP: direct, sub pragurile din Legea nr. 98/2016, sau prin licitație. Anunțurile și contractele atribuite sunt publice.",
      ["Caută ce a cumpărat o instituție și de la cine.", "Cere contractul sau documentele achiziției în baza Legii nr. 544/2001.", "Neregulile în folosirea banilor publici le poți semnala Curții de Conturi."]],
    "bani/patrimoniu": ["Terenurile și clădirile orașului sunt în domeniul public (nu pot fi vândute) sau în domeniul privat (pot fi vândute, concesionate, închiriate). Orice vânzare, concesionare sau închiriere se aprobă prin hotărâre a consiliului local și, de regulă, se face prin licitație publică.",
      ["Urmărește ce terenuri se vând sau se concesionează în cartierul tău.", "Întreabă de ce o vânzare se face direct, fără licitație, și pe ce preț."]],
    "bani/finantari": ["Orașul dă bani asociațiilor, fundațiilor și cluburilor sportive prin concurs de proiecte, după un program anual publicat (Legea nr. 350/2005). Rezultatele și contractele se publică.",
      ["Dacă ai o asociație, urmărește anunțul anual și depune un proiect.", "Verifică cine a primit bani și pentru ce."]],
    "servicii/pe-scurt": ["Unele servicii le face orașul direct sau prin societatea lui, Servicii Comunale (căldura, curățenia străzilor, deszăpezirea); altele sunt organizate la nivelul județului, prin asociații ale autorităților locale, și le fac operatori regionali (gunoiul, apa și canalizarea). Consiliul local aprobă tarifele locale și dă mandat reprezentantului orașului în asociațiile județene.",
      ["Reclamațiile le faci întâi la operatorul serviciului, în scris; dacă nu se rezolvă, la primărie.", "Urmărește proiectele de hotărâre despre tarife și taxe: sunt puse în consultare și poți trimite propuneri.", "Cere contractul de delegare și raportările operatorului în baza Legii nr. 544/2001."]],
    "servicii/societate": ["Servicii Comunale e societatea orașului. Consiliul local numește reprezentanții orașului în adunarea generală a acționarilor, aprobă bugetul societății, tarifele serviciilor și, la termoficare, acoperirea pierderilor din bugetul local.",
      ["Reclamațiile despre căldură, curățenie sau deszăpezire le faci întâi la societate, apoi la primărie, care răspunde de serviciul public.", "Cere bugetul și contractele societății în baza Legii nr. 544/2001.", "Urmărește hotărârile despre tarife și pierderi: se votează în consiliu."]],
    "servicii/termoficare": ["Prețul căldurii are două părți: cât plătesc cei racordați la termoficare și cât acoperă bugetul local (subvenția), adică banii tuturor locuitorilor. Ambele se aprobă prin hotărâre a consiliului local. Când costurile sunt mai mari decât încasările, consiliul poate aproba acoperirea pierderilor din buget.",
      ["Compară prețul plătit de populație cu prețul întreg, pe ani.", "Urmărește proiectele de hotărâre despre tarife și trimite propuneri la consultare.", "Reclamațiile despre furnizare le faci întâi la operator, apoi la primărie."]],
    "servicii/strazi": ["Curățenia străzilor și deszăpezirea le face Servicii Comunale, la tarifele aprobate de consiliul local. Iarna, primăria are un plan de deszăpezire, cu ordinea în care se curăță străzile.",
      ["Semnalează strada nedeszăpezită sau murdară la primărie, în scris, ca să ai număr de înregistrare.", "Trotuarul din fața casei îl curăță proprietarul, potrivit regulilor locale de gospodărire."]],
    "servicii/iluminat": ["Iluminatul public e un serviciu al orașului, delegat din 2025 societății Servicii Comunale, prin atribuire directă; orașul plătește lunar întreținerea, la prețul din contract. Extinderile și modernizările se aprobă de consiliul local ca investiții.",
      ["Semnalează becul ars sau stâlpul căzut la primărie.", "Urmărește investițiile în iluminat pe strada ta."]],
    "servicii/apa": ["Apa și canalizarea sunt un serviciu regional: orașele și comunele din județ s-au asociat și au delegat serviciul operatorului regional. Consiliul local aprobă mandatul reprezentantului orașului în adunarea generală a asociației, de exemplu pentru tarife și investiții.",
      ["Reclamațiile despre apă, presiune sau facturi le faci la operator.", "Urmărește mandatele date de consiliul local: acolo se vede ce votează orașul despre tarife."]],
    "servicii/alte": ["Piețele și cimitirul au regulamente de funcționare aprobate de consiliul local, cu taxele și tarifele lor. Câinii fără stăpân sunt gestionați printr-un contract de servicii aprobat de consiliu.",
      ["Semnalează câinii fără stăpân la primărie, în scris.", "Regulamentul cimitirului și tarifele le găsești în hotărârile de mai sus."]],
    "servicii/hotarari": ["Toate hotărârile despre societate și serviciile ei, clasificate automat după titlu.", ["Alege o temă din filtru ca să vezi doar hotărârile despre ea."]],
    "servicii/salubrizare": ["Colectarea gunoiului e organizată la nivelul județului: orașele și comunele s-au asociat (ADI) și au delegat serviciul unui operator. Consiliul local aprobă regulamentul serviciului, taxa de salubrizare și regulile locale.",
      ["Reclamațiile despre ridicarea gunoiului le faci la operator; dacă nu se rezolvă, la primărie.", "Taxa de salubrizare se plătește la primărie, ca celelalte taxe locale.", "Sortează deșeurile: reciclabilele merg la containerele separate și la insulele ecologice."]],
    "teme/pug": ["PUG-ul se actualizează periodic, cu consultarea publicului, și se aprobă de consiliul local. Până la aprobarea unui PUG nou rămâne în vigoare cel vechi. PUZ-urile pot schimba regulile pentru o zonă.",
      ["Participă la consultările despre PUG și PUZ-uri și trimite observații în scris.", "Verifică ce scrie PUG-ul pentru terenul tău înainte să ceri certificat de urbanism."]],
    strada: ["Pagina adună tot ce privește o stradă: investiții, autorizații de construire, certificate de urbanism, hotărâri și achiziții.",
      ["Abonează-te la alerte ca să afli când apare ceva nou pe strada ta.", "Dacă vezi o problemă, scrie primăriei și păstrează numărul de înregistrare."]]
  };
  function cfHtml(r) {
    if (r.rest.length && !TAB3[r.s.id + "/" + r.sub]) return "";
    var cheie = { "comunale/pe-scurt": "servicii/societate", "comunale/hotarari": "servicii/hotarari", "comunale/termoficare": "servicii/termoficare", "acet/apa": "servicii/apa" }[r.s.id + "/" + r.sub];
    var c = CF[cheie || r.s.id + "/" + r.sub] || CF[r.s.id] || (r.s.id === "teme" ? CF["teme/" + r.sub] : null);
    if (!c) return "";
    return '<section class="card section cf"><div class="cf-g"><div><h2>Cum funcționează</h2><p>' + c[0] + '</p></div><div><h2>Ce poți face tu</h2><ul>' +
      c[1].map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul></div></div></section>";
  }

  // ---------- prima vizită: un ghid scurt, ascuns după ce e închis ----------
  function primaVizita() {
    var vazut = false; try { vazut = localStorage.getItem("mc_ghid") === "1"; } catch (e) {}
    var el = $("app"); if (vazut || !el || $("pv-g")) return;
    el.insertAdjacentHTML("afterbegin", '<section class="card section pv-g" id="pv-g"><h2>Prima dată aici?</h2><ol>' +
      '<li><a href="#strada">Strada mea</a>: scrie numele străzii și vezi tot ce s-a aprobat, construit sau cumpărat acolo.</li>' +
      '<li><a href="#consiliu/sedinte">Consiliul Local</a>: calendarul ședințelor, ce se votează și cum votează fiecare consilier.</li>' +
      '<li><a href="#bani/investitii">Banii orașului</a>: bugetul, taxele, investițiile și achizițiile, pe înțelesul tuturor.</li>' +
      '<li>Cuvintele <span class="gl-ex">subliniate cu punctat</span> au o explicație: atinge-le. Toate sunt în <a href="#despre/glosar">glosar</a>.</li></ol>' +
      '<button type="button" class="btn" id="pv-ok">Am înțeles</button></section>');
    $("pv-ok").addEventListener("click", function () { try { localStorage.setItem("mc_ghid", "1"); } catch (e) {} var g = $("pv-g"); if (g) g.remove(); });
  }

  function render() {
    var r = route(); nav(r);
    document.body.setAttribute("data-sec", r.s.id);
    var el = $("app");
    if (!IND || !L) return;
    var id = r.s.id;
    if (id === "acasa") el.innerHTML = acasa();
    else if (id === "consiliu") {
      if (r.sub === "hcl" && r.rest.length >= 2) hclDetaliu(el, r, r.rest[0], r.rest[1]);
      else if (r.sub === "sedinte" && r.rest[0]) sedintaDetaliu(el, r, r.rest[0]);
      else if (r.sub === "sedinte") sedintePagina(el, r);
      else if (r.sub === "rapoarte") rapoarteConsiliu(el, r);
      else if (r.sub === "consilieri") { if (r.rest[0]) consilierProfil(el, r, decodeURIComponent(r.rest[0])); else consilieri(el, r); }
      else (r.sub === "proiecte" ? proiecte : hcl)(el, r);
    }
    else if (id === "cauta") (r.sub === "texte" ? texte : cauta)(el, r);
    else if (id === "litigii" && INTERN) litigii(el, r);
    else if (id === "primarie") {
      if (r.sub === "angajari") angajari(el, r);
      else if (TEME_PAG[r.sub]) temaPagina(el, r);
      else if ((r.rest[0] || "harta") === "harta") harta(el, r);
      else registru(el, r, r.rest[0] === "ac" ? "ac" : "cu");
    }
    else if (id === "bani") {
      if (r.sub === "buget") buget(el, r);
      else if (r.sub === "achizitii") (r.rest[0] === "contracte" ? contracte : sicap)(el, r);
      else temaPagina(el, r);
    }
    else if (id === "servicii") {
      if (r.sub === "termoficare") termoficare(el, r);
      else if (r.sub === "pe-scurt") serviciiPublice(el, r);
      else if (r.sub === "societate") { if (r.rest[0] === "hotarari") temaGen(el, r, TEMA_CFG["servicii/hotarari"]); else serviciiPeScurt(el, r); }
      else temaGen(el, r, TEMA_CFG["servicii/" + r.sub]);
    }
    else if (id === "comunale") {
      if (r.sub === "termoficare") termoficare(el, r);
      else if (r.sub === "hotarari") temaGen(el, r, TEMA_CFG["servicii/hotarari"]);
      else if (r.sub === "documente" && INTERN) comunaleDocumente(el, r);
      else serviciiPeScurt(el, r);
    }
    else if (id === "acet") temaGen(el, r, TEMA_CFG["servicii/apa"]);
    else if (id === "teme") temaGen(el, r, TEMA_CFG["teme/" + r.sub]);
    else if (id === "strada") strada(el, r);
    else if (id === "rezumate") ((r.path || "").split("/")[1] === "transcriere" ? transcriereIntern : panouRezumate)(el, r);
    else if (id === "texte") texte(el);
    else if (id === "despre") (r.sub === "glosar" ? glosarPagina : despre)(el, r);
    else if (id === "mesaje") mesajeIntern(el);
    else if (id === "analize") analizeIntern(el);
    else if (id === "dosar") dosarIntern(el, r);
    else if (id === "sarcini") sarciniIntern(el);
    else if (id === "semnale") semnaleIntern(el, r);
    else if (id === "declaratii" && INTERN) declaratiiIntern(el);
    else if (id === "arhiva") arhivaIntern(el, r);
    if (id === "acasa") { noutatiCard(); anCard(); arhivaCard(); litNewsCard(); primaVizita(); }
    if ($("cf")) { $("cf").innerHTML = cfHtml(r); glosar($("cf")); }
    $("actualizat").textContent = "Date actualizate la " + zi(IND.calculat_la) + ".";
    document.title = (id === "acasa" ? "" : r.s.nume + " - ") + "Monitor local" + (INTERN ? " (intern)" : "");
  }

  function get(u) { return fetch(u, { cache: "no-store" }).then(function (x) { if (!x.ok) throw new Error(u); return x.json(); }); }
  nav(route());
  Promise.all([get(DATA + "indicatori.json"), get(DATA + "liste.json"),
    INTERN ? get("texte/index.json").catch(function () { return []; }) : Promise.resolve([])]).then(function (d) {
    IND = d[0]; L = d[1];
    (d[2] || []).forEach(function (x) { WORD[x.pdf] = x.word; });
    render();
  }).catch(function () {
    $("app").innerHTML = '<div class="card section"><strong>Datele nu sunt disponibile momentan.</strong> Reîncercăm la următoarea actualizare zilnică.</div>';
  });
  var ultimaPagina = route().path;
  var ULTIMA = "";
  window.addEventListener("hashchange", function () {
    var p = route().path; if (p !== "despre") ULTIMA = location.origin + location.pathname + "#" + ultimaPagina; render();
    if (p !== ultimaPagina) window.scrollTo(0, 0);   // doar filtrele s-au schimbat: rămânem unde eram
    ultimaPagina = p;
  });
})();
