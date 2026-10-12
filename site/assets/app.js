/* Monitor local - aplicația paginii (publică și internă).
   <body data-base="" data-mode="public">  sau  <body data-base="../" data-mode="intern"> */
(function () {
  "use strict";
  var B = document.body.dataset, BASE = B.base || "", INTERN = B.mode === "intern";
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
    { id: "decizii", nume: "Decizii locale", sub: [["hcl", "Hotărâri de Consiliu Local"], ["sedinte", "Ședințe și procese-verbale"], ["proiecte", "Proiecte de hotărâre"]] },
    { id: "urbanism", nume: "Urbanism", sub: [["cu", "Certificate de urbanism"], ["ac", "Autorizații de construire"]] },
    { id: "achizitii", nume: "Achiziții publice", sub: [["contracte", "Contracte"], ["sicap", "SICAP"]] }
  ];
  if (INTERN) SECTIUNI.push({ id: "texte", nume: "Toate textele" });

  function route() {
    var h = (location.hash || "#acasa").slice(1).split("/");
    var s = SECTIUNI.filter(function (x) { return x.id === h[0]; })[0] || SECTIUNI[0];
    var sub = s.sub ? ((s.sub.filter(function (x) { return x[0] === h[1]; })[0] || s.sub[0])[0]) : null;
    return { s: s, sub: sub };
  }

  function nav(r) {
    $("nav").innerHTML = SECTIUNI.map(function (s) {
      return '<a href="#' + s.id + '"' + (s.id === r.s.id ? ' aria-current="page"' : "") + ">" + esc(s.nume) + "</a>";
    }).join("");
  }

  function head(title, text, r) {
    var h = '<div class="page-head"><h1>' + esc(title) + "</h1>" + (text ? "<p>" + text + "</p>" : "");
    if (r && r.s.sub) h += '<div class="subnav">' + r.s.sub.map(function (x) {
      return '<a href="#' + r.s.id + "/" + x[0] + '"' + (x[0] === r.sub ? ' aria-current="page"' : "") + ">" + esc(x[1]) + "</a>";
    }).join("") + "</div>";
    return h + "</div>";
  }

  function tile(lbl, val, unit, sub, href) {
    var tag = href ? 'a class="card tile" href="' + href + '"' : 'div class="card tile"';
    return "<" + tag + '><div class="lbl">' + esc(lbl) + '</div><div class="val">' + val + (unit ? "<small>" + esc(unit) + "</small>" : "") +
      '</div><div class="sub">' + (sub || "") + "</div></" + (href ? "a" : "div") + ">";
  }

  // ---------- grafic cu coloane (simple, stivuite sau cu „pistă”) ----------
  // cfg: {cats:[...], series:[{name, color, values:[...]}], stacked, track:{name, values}, gaps:{cat:"text"}, unit}
  function chart(el, cfg) {
    function draw() {
      var W = Math.max(280, el.clientWidth || 600), H = 220, m = { t: 18, r: 8, b: 26, l: 36 };
      var n = cfg.cats.length, iw = W - m.l - m.r, ih = H - m.t - m.b, band = iw / n;
      var bw = Math.min(24, band * 0.62);
      var tot = cfg.cats.map(function (_, i) {
        var v = cfg.stacked ? cfg.series.reduce(function (a, s) { return a + (s.values[i] || 0); }, 0)
          : Math.max.apply(null, cfg.series.map(function (s) { return s.values[i] || 0; }));
        return Math.max(v, cfg.track ? (cfg.track.values[i] || 0) : 0);
      });
      var max = Math.max.apply(null, tot.concat([1]));
      var step = Math.pow(10, Math.floor(Math.log10(max))); var nice = Math.ceil(max / step) * step;
      if (nice / step <= 2) step /= 2; if (nice / step > 6) step *= 2; nice = Math.ceil(max / step) * step;
      var y = function (v) { return m.t + ih - (v / nice) * ih; };
      var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(cfg.label || "") + '">';
      s += '<g class="grid">';
      for (var g = 0; g <= nice + 1e-9; g += step) s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(g) + '" y2="' + y(g) + '"/>';
      s += '</g><g class="axis">';
      for (g = 0; g <= nice + 1e-9; g += step) s += '<text x="' + (m.l - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + nr(Math.round(g)) + "</text>";
      var every = band < 30 ? 2 : 1;
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
        var base = 0, segs = cfg.series.filter(function (sr) { return sr.values[i]; });
        segs.forEach(function (sr, k) {
          var v = sr.values[i], top = cfg.stacked ? base + v : v;
          var y0 = y(cfg.stacked ? base : 0), y1 = y(top);
          if (cfg.stacked && k > 0) y0 -= 2;   // 2px spațiu între segmente
          s += rect(x, y0, y1, bw, sr.color, !cfg.stacked || k === segs.length - 1);
          base = top;
        });
        var lab = cfg.labelValue ? cfg.labelValue(i) : null;
        if (lab != null) s += '<text class="lbl" x="' + (x + bw / 2) + '" y="' + (y(tot[i]) - 5) + '" text-anchor="middle">' + esc(lab) + "</text>";
        s += '<rect class="hit" x="' + (m.l + band * i) + '" y="' + m.t + '" width="' + band + '" height="' + ih + '"/></g>';
      });
      s += "</svg>";
      el.innerHTML = s + '<div class="tip"></div>';
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
      '<select aria-label="Anul"><option value="">Toți anii</option>' + Object.keys(ani).sort().reverse().map(function (a) { return "<option>" + esc(a) + "</option>"; }).join("") + "</select>" + extra +
      '</div><p class="count" aria-live="polite"></p><div class="items"></div><button class="more" hidden>Arată mai multe</button>';
    var q = el.querySelector("input"), sel = el.querySelector("select"), ex = el.querySelectorAll("select")[1];
    function filt() {
      var t = norm(q.value).trim(), a = sel.value, e = ex ? ex.value : "";
      return items.filter(function (x) {
        return (!a || opt.an(x) === a) && (!e || opt.extraFilter.test(x, e)) && (!t || norm(opt.text(x)).indexOf(t) >= 0);
      });
    }
    function draw() {
      var f = filt();
      el.querySelector(".count").textContent = nr(f.length) + (f.length === 1 ? " document" : " documente");
      el.querySelector(".items").innerHTML = f.slice(0, shown).map(opt.item).join("") || '<p class="empty">Niciun document găsit.</p>';
      el.querySelector(".more").hidden = f.length <= shown;
    }
    q.addEventListener("input", function () { shown = 25; draw(); });
    sel.addEventListener("change", function () { shown = 25; draw(); });
    if (ex) ex.addEventListener("change", function () { shown = 25; draw(); });
    el.querySelector(".more").addEventListener("click", function () { shown += 50; draw(); });
    draw();
  }
  function linkuri(x) {
    var o = [], p = safeUrl(x.pagina), f = safeUrl(x.pdf);
    if (p) o.push('<a href="' + esc(p) + '" rel="noopener">pagina</a>');
    if (f) o.push('<a href="' + esc(f) + '" rel="noopener">PDF</a>');
    if (INTERN && f && WORD[f]) o.push('<a href="texte/' + WORD[f].split("/").map(encodeURIComponent).join("/") + '">text (Word)</a>');
    if (x.scanat === 1) o.push('<span class="tag" title="Document scanat: textul nu poate fi căutat și nu e citit de cititoarele de ecran">scanat</span>');
    return o.join("");
  }
  function doc(id, title, meta, x) {
    return '<div class="doc"><div class="h"><span class="id">' + id + '</span></div><div class="t">' + esc(title || "(fără titlu)") +
      '</div><div class="m">' + (meta ? "<span>" + meta + "</span>" : "") + linkuri(x) + "</div></div>";
  }

  // ---------- pagini ----------
  function acasa() {
    var I = BASE + "assets/img/";
    var hero = '<figure class="hero"><picture>' +
      '<source media="(max-width:640px)" type="image/webp" srcset="' + I + 'banner-mobil.webp">' +
      '<source media="(max-width:640px)" srcset="' + I + 'banner-mobil.jpg">' +
      '<source type="image/webp" srcset="' + I + 'banner-1200.webp 1200w, ' + I + 'banner-1983.webp 1983w" sizes="(max-width:1080px) 100vw, 1048px">' +
      '<img src="' + I + 'banner-1200.jpg" srcset="' + I + 'banner-1200.jpg 1200w, ' + I + 'banner-1983.jpg 1983w" sizes="(max-width:1080px) 100vw, 1048px" width="1983" height="793" ' +
      'alt="Monitor local, un proiect Rădăuțiul Civic: informații publice, pentru o comunitate mai transparentă și mai implicată. Hotărâri, ședințe, urbanism, achiziții publice." fetchpriority="high">' +
      "</picture></figure>";
    var h = hero + head("Ce publică Primăria Municipiului Rădăuți",
      "Monitorul verifică zilnic actele publicate de primărie și consiliul local, din surse publice: hotărâri, ședințe, urbanism, achiziții. Fiecare cifră duce la documentul-sursă.");
    var pe = IND.hcl_pe_ani || {}, ani = Object.keys(pe).sort();
    var total = ani.reduce(function (a, y) { return a + pe[y].gasite; }, 0);
    var lag = IND.hcl_intarziere_publicare || {}, ultim = Object.keys(lag).filter(function (y) { return lag[y].fiabil !== false; }).sort().pop();
    var sed = IND.sedinte_pe_tip || {}, an = Object.keys(sed).sort().pop(), s = an ? sed[an] : {};
    var nS = Object.keys(s).reduce(function (a, k) { return a + s[k]; }, 0), nEx = (s.extraordinara || 0) + (s.extraordinara_de_indata || 0);
    var reg = IND.registre_urbanism || {}, c = IND.contracte_site || {}, d = IND.documente || {};
    var scanPct = d.descarcate ? Math.round(100 * d.scanate / d.descarcate) : null;
    h += '<div class="grid">' +
      tile("Hotărâri de consiliu în monitor", nr(total), "", ani.length ? "din " + ani[0] + " până în " + ani[ani.length - 1] : "", "#decizii/hcl") +
      (ultim ? tile("Durata medie de publicare a unei hotărâri (" + ultim + ")", dec(lag[ultim].medie_zile), zile(lag[ultim].medie_zile), "de la adoptare la postarea pe site; maxim <strong>" + lag[ultim].max_zile + " zile</strong>", "#decizii/hcl") : "") +
      (an ? tile("Ședințe ale consiliului în " + an, nS, "", "<strong>" + nEx + " extraordinare</strong> sau de îndată, " + (s.ordinara || 0) + " ordinare", "#decizii/sedinte") : "") +
      (reg.cu ? tile("Zile fără registru de urbanism publicat", nr(reg.cu.zile_neacoperite), zile(reg.cu.zile_neacoperite), "ultimul registru acoperă până la " + zi(reg.cu.ultima_perioada_pana_la), "#urbanism/cu") : "") +
      (c.zile_de_la_ultima != null ? tile("Zile de la ultimul contract publicat", nr(c.zile_de_la_ultima), zile(c.zile_de_la_ultima), "ultimul: " + zi(c.ultima_postare), "#achizitii/contracte") : "") +
      (scanPct != null ? tile("Documente publicate doar ca scanare", scanPct + "%", "", nr(d.scanate) + " din " + nr(d.descarcate) + ": textul nu poate fi căutat și nu e accesibil cititoarelor de ecran") : "") +
      "</div>";
    // stadiul monitorului
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

  function hcl(el, r) {
    var pe = IND.hcl_pe_ani || {}, lag = IND.hcl_intarziere_publicare || {};
    var ani = Object.keys(pe).map(Number), cats = [];
    for (var a = Math.min.apply(null, ani); a <= Math.max.apply(null, ani); a++) cats.push(String(a));
    var gaps = {}; cats.forEach(function (y) { if (!pe[y]) gaps[y] = "fără sursă"; });
    var total = ani.reduce(function (s, y) { return s + pe[y].gasite; }, 0);
    var scan = ani.reduce(function (s, y) { return s + pe[y].scanate; }, 0);
    var ultim = Object.keys(lag).filter(function (y) { return lag[y].fiabil !== false; }).sort().pop();
    var h = head("Decizii locale", "Hotărârile Consiliului Local, ședințele și proiectele de hotărâre.", r) +
      '<div class="grid">' + tile("Hotărâri în monitor", nr(total), "", "din " + cats[0] + " până în " + cats[cats.length - 1]) +
      (ultim ? tile("Durata medie de publicare (" + ultim + ")", dec(lag[ultim].medie_zile), zile(lag[ultim].medie_zile), "de la adoptare la postarea pe site, pentru " + lag[ultim].hcl + " hotărâri") : "") +
      tile("Hotărâri publicate doar ca scanare", nr(scan), "", "din " + nr(total) + " (" + Math.round(100 * scan / Math.max(total, 1)) + "%)") + "</div>" +
      '<section class="card section"><h2>Hotărâri pe ani</h2><p class="note">Câte hotărâri apar în listele publicate de primărie, față de ultimul număr de hotărâre din an.</p>' +
      legend([["Hotărâri găsite", "var(--s1)"], ["Ultimul număr din an", "var(--track)"]]) + '<div class="chart" id="ch-hcl"></div>' +
      '<details class="tbl"><summary>Vezi tabelul</summary><div class="tw"><table><thead><tr><th>An</th><th class="n">Găsite</th><th class="n">Ultimul nr.</th><th class="n">Acoperire</th><th class="n">Scanate</th><th class="n">Durată medie publicare</th><th>Sursa</th></tr></thead><tbody>' +
      cats.slice().reverse().map(function (y) {
        var v = pe[y];
        if (!v) return "<tr><td>" + y + '</td><td colspan="6">Nicio sursă publică găsită pentru acest an.</td></tr>';
        return "<tr><td>" + y + '</td><td class="n">' + v.gasite + '</td><td class="n">' + v.ultimul_nr + '</td><td class="n">' + v.acoperire_pct + '%</td><td class="n">' + v.scanate +
          '</td><td class="n">' + (v.medie_publicare_zile != null ? dec(v.medie_publicare_zile) + " zile" : "-") + "</td><td>" + esc(v.sursa) + "</td></tr>";
      }).join("") + "</tbody></table></div></details>" +
      '<p class="note">Acoperirea sub 100% înseamnă că în lista publicată lipsesc numere de hotărâre. Verificăm alte surse înainte de orice concluzie. Durata de publicare se calculează doar pentru anii în care data postării pe site e credibilă.</p></section>';
    if (INTERN) {
      var lipsa = IND.hcl_numere_lipsa || {};
      h += '<section class="card section"><h2>Numere lipsă, de verificat (intern)</h2><p class="note">Numerele de hotărâre care nu apar în lista publicată, pe ani. De căutat în procesele-verbale și în alte surse.</p><div class="tw"><table><thead><tr><th>An</th><th class="n">Lipsă</th><th>Numere</th></tr></thead><tbody>' +
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
    h += '<section class="card section"><h2>Toate hotărârile</h2><div id="lst"></div></section>';
    el.innerHTML = h;
    chart($("ch-hcl"), {
      cats: cats, label: "Hotărâri găsite pe ani, față de ultimul număr de hotărâre",
      series: [{ name: "Hotărâri găsite", color: "var(--s1)", values: cats.map(function (y) { return pe[y] ? pe[y].gasite : 0; }) }],
      track: { values: cats.map(function (y) { return pe[y] ? pe[y].ultimul_nr : 0; }) }, gaps: gaps,
      tooltip: function (i) { var v = pe[cats[i]]; return v ? "<b>" + cats[i] + "</b><br>" + v.gasite + " găsite din " + v.ultimul_nr + " (" + v.acoperire_pct + "%)<br>" + v.scanate + " scanate" : "<b>" + cats[i] + "</b><br>nicio sursă publică"; }
    });
    lista($("lst"), L.hcl || [], {
      placeholder: "Caută în titluri (ex. buget, teren, strada Ștefan cel Mare)",
      an: function (x) { return String(x.an); }, text: function (x) { return x.titlu + " " + x.nr + "/" + x.an; },
      item: function (x) { return doc("HCL " + x.nr + "/" + x.an, x.titlu, (x.data ? "adoptată " + zi(x.data) : "") + (x.postat ? " · postată " + zi(x.postat) : ""), x); }
    });
  }

  function sedinte(el, r) {
    var sed = IND.sedinte_pe_tip || {}, ani = Object.keys(sed).sort(), pv = IND.pv_intarziere_publicare;
    var an = ani[ani.length - 1], s = an ? sed[an] : {};
    var nS = Object.keys(s).reduce(function (a, k) { return a + s[k]; }, 0);
    var tipuri = [["ordinara", "Ordinare", "var(--s1)"], ["extraordinara", "Extraordinare", "var(--s2)"], ["extraordinara_de_indata", "De îndată", "var(--s3)"]];
    var h = head("Decizii locale", "Hotărârile Consiliului Local, ședințele și proiectele de hotărâre.", r) + '<div class="grid">' +
      (an ? tile("Ședințe în " + an, nS, "", tipuri.map(function (t) { return (s[t[0]] || 0) + " " + t[1].toLowerCase(); }).join(", ")) : "") +
      (an && nS ? tile("Ședințe convocate în regim de urgență (" + an + ")", Math.round(100 * ((s.extraordinara || 0) + (s.extraordinara_de_indata || 0)) / nS) + "%", "", "extraordinare și de îndată, din totalul ședințelor") : "") +
      (pv ? tile("Durata medie de publicare a procesului-verbal", dec(pv.medie_zile), zile(pv.medie_zile), "de la ședință la postare; maxim <strong>" + pv.max_zile + " zile</strong>, din " + pv.pv + " procese-verbale") : "") + "</div>" +
      '<section class="card section"><h2>Ședințe pe ani, după tip</h2><p class="note">Din procesele-verbale publicate pe site (disponibile începând cu ' + (ani[0] || "-") + ").</p>" +
      legend(tipuri.map(function (t) { return [t[1], t[2]]; })) + '<div class="chart" id="ch-sed"></div>' +
      '<details class="tbl"><summary>Vezi tabelul</summary><div class="tw"><table><thead><tr><th>An</th>' + tipuri.map(function (t) { return '<th class="n">' + t[1] + "</th>"; }).join("") + '<th class="n">Total</th></tr></thead><tbody>' +
      ani.slice().reverse().map(function (y) { var v = sed[y], t = 0; return "<tr><td>" + y + "</td>" + tipuri.map(function (k) { t += v[k[0]] || 0; return '<td class="n">' + (v[k[0]] || 0) + "</td>"; }).join("") + '<td class="n">' + t + "</td></tr>"; }).join("") +
      '</tbody></table></div></details></section><section class="card section"><h2>Procese-verbale</h2><div id="lst"></div></section>';
    el.innerHTML = h;
    chart($("ch-sed"), {
      cats: ani, stacked: true, label: "Ședințe pe ani după tip",
      series: tipuri.map(function (t) { return { name: t[1], color: t[2], values: ani.map(function (y) { return sed[y][t[0]] || 0; }) }; }),
      labelValue: function (i) { var v = sed[ani[i]]; return Object.keys(v).reduce(function (a, k) { return a + v[k]; }, 0); },
      tooltip: function (i) { var v = sed[ani[i]]; return "<b>" + ani[i] + "</b><br>" + tipuri.map(function (t) { return t[1] + ": " + (v[t[0]] || 0); }).join("<br>"); }
    });
    lista($("lst"), L.pv || [], {
      an: function (x) { return (x.data || "").slice(0, 4); }, text: function (x) { return x.titlu; },
      extraFilter: { html: '<select aria-label="Tipul ședinței"><option value="">Toate tipurile</option><option value="ordinara">Ordinare</option><option value="extraordinara">Extraordinare</option><option value="extraordinara_de_indata">De îndată</option></select>', test: function (x, e) { return x.tip === e; } },
      item: function (x) { return doc("Ședința " + (TIP[x.tip] || "") + " din " + zi(x.data), x.titlu, x.postat ? "postat " + zi(x.postat) : "", x); }
    });
  }

  function simplu(el, r, cfg) {
    var items = L[cfg.key] || [];
    var h = head(cfg.titlu, cfg.text, r) + (cfg.top || "") + '<section class="card section"><h2>' + esc(cfg.h2) + "</h2>" + (cfg.note ? '<p class="note">' + cfg.note + "</p>" : "") + '<div id="lst"></div></section>';
    el.innerHTML = h;
    if (cfg.after) cfg.after();
    lista($("lst"), cfg.filter ? items.filter(cfg.filter) : items, cfg.opt);
  }

  function proiecte(el, r) {
    var pe = IND.proiecte_pe_ani || {}, n = Object.keys(pe).reduce(function (a, y) { return a + pe[y]; }, 0);
    simplu(el, r, {
      key: "proiecte", titlu: "Decizii locale", text: "Hotărârile Consiliului Local, ședințele și proiectele de hotărâre.", h2: "Proiecte de hotărâre",
      top: '<div class="grid">' + tile("Proiecte de hotărâre publicate", nr(n), "", n ? "pe site-ul primăriei, înainte de dezbatere" : "colectarea pornește la următoarea rulare") + "</div>",
      opt: { an: function (x) { return (x.postat || "").slice(0, 4); }, text: function (x) { return x.titlu; }, item: function (x) { return doc("Proiect", x.titlu, x.postat ? "postat " + zi(x.postat) : "", x); } }
    });
  }

  var URB = null;
  function lei(v) { return v == null ? "-" : (v >= 1e6 ? dec((v / 1e6).toFixed(1)) + " mil." : nr(Math.round(v))) + " lei"; }
  function hbars(obj, total) {
    var k = Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }), max = k.length ? obj[k[0]] : 1;
    return '<div class="hbars">' + k.map(function (c) {
      return '<div class="hb"><span class="hb-l">' + esc(c) + '</span><span class="hb-t"><i style="width:' + Math.max(2, 100 * obj[c] / max) + '%"></i></span><span class="hb-v">' +
        obj[c] + (total ? ' <small>' + Math.round(100 * obj[c] / total) + "%</small>" : "") + "</span></div>";
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
      get(BASE + "date/urbanism.json").then(function (d) { URB = d; registru(el, r, kind); })
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
      var L2 = luniContinue(U.pe_luni, 18);
      chart($("ch-u"), { cats: L2.map(function (m) { return LUNI[+m.slice(5) - 1].slice(0, 3) + (m.slice(5) === "01" || m === L2[0] ? " " + m.slice(2, 4) : ""); }), label: nume + " pe luni",
        series: [{ name: nume, color: "var(--s1)", values: L2.map(function (m) { return U.pe_luni[m] || 0; }) }],
        tooltip: function (i) { var m = L2[i]; return "<b>" + LUNI[+m.slice(5) - 1] + " " + m.slice(0, 4) + "</b><br>" + (U.pe_luni[m] || 0) + (cu ? " certificate" : " autorizații"); } });
    }
    var cats = {}; acte.forEach(function (a) { cats[a.categorie || "Altele"] = 1; });
    lista($("lst"), acte, {
      placeholder: cu ? "Caută: stradă, solicitant, scop (ex. Putnei, locuință, SRL)" : "Caută: stradă, solicitant, lucrare, constructor",
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
      key: "contracte", titlu: "Achiziții publice", text: "Contractele publicate de primărie și, în curând, procedurile din sistemul național de achiziții (SICAP).", h2: "Contracte publicate pe site",
      top: '<div class="grid">' + tile("Zile de la ultimul contract publicat", c.zile_de_la_ultima == null ? "-" : nr(c.zile_de_la_ultima), zile(c.zile_de_la_ultima), "ultimul: " + zi(c.ultima_postare)) +
        tile("Contracte publicate", nr(ani.reduce(function (a, y) { return a + pe[y]; }, 0)), "", ani.length ? "din " + ani[0] + " până în " + ani[ani.length - 1] : "") + "</div>" +
        (ani.length > 1 ? '<section class="card section"><h2>Contracte publicate pe ani</h2><p class="note">După data postării pe site.</p><div class="chart" id="ch-c"></div></section>' : ""),
      after: function () {
        if (ani.length > 1) chart($("ch-c"), { cats: ani, label: "Contracte publicate pe ani", series: [{ name: "Contracte", color: "var(--s1)", values: ani.map(function (y) { return pe[y]; }) }], labelValue: function (i) { return pe[ani[i]]; }, tooltip: function (i) { return "<b>" + ani[i] + "</b><br>" + pe[ani[i]] + " contracte"; } });
      },
      opt: { an: function (x) { return (x.postat || "").slice(0, 4); }, text: function (x) { return x.titlu; }, item: function (x) { return doc(zi(x.postat), x.titlu, "", x); } }
    });
  }

  function sicap(el, r) {
    el.innerHTML = head("Achiziții publice", "Contractele publicate de primărie și, în curând, procedurile din sistemul național de achiziții (SICAP).", r) +
      '<section class="card section"><h2>Date din SICAP</h2><p>În lucru. Vom aduce procedurile de achiziție, anunțurile și contractele atribuite de Municipiul Rădăuți (CUI 4244148), din Sistemul Electronic de Achiziții Publice.</p>' +
      '<p class="note">Până atunci, contractele publicate pe site-ul primăriei sunt în fila „Contracte”.</p></section>';
  }

  function texte(el) {
    var items = Object.keys(WORD).map(function (u) { return { pdf: u, word: WORD[u], sursa: WORD[u].split("/")[0], titlu: WORD[u].split("/").slice(1).join("/").replace(/\.docx$/, "") }; });
    var surse = {}; items.forEach(function (x) { surse[x.sursa] = (surse[x.sursa] || 0) + 1; });
    el.innerHTML = head("Toate textele (intern)", "Textul extras din fiecare document descărcat, ca document Word. Poate conține erori de recunoaștere și date personale: nu se distribuie public.") +
      '<section class="card section"><div id="lst"></div></section>';
    lista($("lst"), items, {
      placeholder: "Caută după numele documentului",
      an: function (x) { var m = x.titlu.match(/(?:din |\.)(20\d\d)\b/); return m ? m[1] : ""; }, text: function (x) { return x.titlu + " " + x.sursa; },
      extraFilter: { html: '<select aria-label="Sursa"><option value="">Toate sursele</option>' + Object.keys(surse).sort().map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + " (" + surse[s] + ")</option>"; }).join("") + "</select>", test: function (x, e) { return x.sursa === e; } },
      item: function (x) { return doc(esc(x.sursa), x.titlu, "", { pdf: x.pdf }); }
    });
  }

  function render() {
    var r = route(); nav(r);
    var el = $("app");
    if (!IND || !L) return;
    var id = r.s.id;
    if (id === "acasa") el.innerHTML = acasa();
    else if (id === "decizii") (r.sub === "sedinte" ? sedinte : r.sub === "proiecte" ? proiecte : hcl)(el, r);
    else if (id === "urbanism") registru(el, r, r.sub);
    else if (id === "achizitii") (r.sub === "sicap" ? sicap : contracte)(el, r);
    else if (id === "texte") texte(el);
    $("actualizat").textContent = "Date actualizate la " + zi(IND.calculat_la) + ".";
    document.title = (id === "acasa" ? "" : r.s.nume + " - ") + "Monitor local" + (INTERN ? " (intern)" : "");
  }

  function get(u) { return fetch(u, { cache: "no-store" }).then(function (x) { if (!x.ok) throw new Error(u); return x.json(); }); }
  nav(route());
  Promise.all([get(BASE + "date/indicatori.json"), get(BASE + "date/liste.json"),
    INTERN ? get("texte/index.json").catch(function () { return []; }) : Promise.resolve([])]).then(function (d) {
    IND = d[0]; L = d[1];
    (d[2] || []).forEach(function (x) { WORD[x.pdf] = x.word; });
    render();
  }).catch(function () {
    $("app").innerHTML = '<div class="card section"><strong>Datele nu sunt disponibile momentan.</strong> Reîncercăm la următoarea actualizare zilnică.</div>';
  });
  window.addEventListener("hashchange", function () { render(); window.scrollTo(0, 0); });
})();
