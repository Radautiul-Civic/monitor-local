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
  if (INTERN) { SECTIUNI.push({ id: "texte", nume: "Toate textele" }); SECTIUNI.push({ id: "arhiva", nume: "Arhiva de siguranță" }); }

  function route() {
    var full = (location.hash || "#acasa").slice(1), qi = full.indexOf("?");
    var h = (qi >= 0 ? full.slice(0, qi) : full).split("/"), q = {};
    (qi >= 0 ? full.slice(qi + 1) : "").split("&").forEach(function (p) {
      if (!p) return; var kv = p.split("=");
      try { q[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || "").replace(/\+/g, " ")); } catch (e) {}
    });
    var s = SECTIUNI.filter(function (x) { return x.id === h[0]; })[0] || SECTIUNI[0];
    var sub = s.sub ? ((s.sub.filter(function (x) { return x[0] === h[1]; })[0] || s.sub[0])[0]) : null;
    return { s: s, sub: sub, rest: h.slice(2), q: q, path: h.join("/") };
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
      if (!cfg.cats.length) { el.innerHTML = ""; return; }
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
      var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(cfg.label || "") + '"' + (cfg.onClick ? ' class="clic"' : "") + ">";
      s += '<g class="grid">';
      for (var g = 0; g <= nice + 1e-9; g += step) s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(g) + '" y2="' + y(g) + '"/>';
      s += '</g><g class="axis">';
      for (g = 0; g <= nice + 1e-9; g += step) s += '<text x="' + (m.l - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + (step < 1 ? dec(+g.toFixed(1)) : nr(Math.round(g))) + "</text>";
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
      var un = opt.unitate || ["document", "documente"];
      el.querySelector(".count").textContent = nr(f.length) + " " + (f.length === 1 ? un[0] : un[1]);
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
    (x.alte_pdf || []).forEach(function (u, i) { if (safeUrl(u)) o.push('<a href="' + esc(u) + '" rel="noopener">PDF ' + (i + 2) + "</a>"); });
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
      (IND.sicap && IND.sicap.achizitii_directe ? tile("Achiziții publice în SICAP", nr(IND.sicap.achizitii_directe), "", "achiziții directe din 2018, la " + IND.sicap.institutii + " instituții din Rădăuți; vezi furnizorii și sumele", "#achizitii/sicap") : "") +
      (scanPct != null ? tile("Documente publicate doar ca scanare", scanPct + "%", "", nr(d.scanate) + " din " + nr(d.descarcate) + ": textul nu poate fi căutat și nu e accesibil cititoarelor de ecran") : "") +
      "</div>";
    h += '<div id="arhiva-card"></div>';
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

  function gb(o) { return o >= 1e9 ? dec((o / 1e9).toFixed(1)) + " GB" : o >= 1e6 ? Math.round(o / 1e6) + " MB" : Math.max(1, Math.round(o / 1e3)) + " KB"; }
  function arhivaCard() {
    var el = $("arhiva-card"); if (!el) return;
    get(BASE + "date/arhiva-stare.json").then(function (d) {
      var t = 0, c = 0, w = 0, x = 0, o = 0;
      Object.keys(d.site_uri || {}).forEach(function (k) { var v = d.site_uri[k]; t += v.total; c += v.copiate; w += v.in_wayback; x += v.disparute; o += v.octeti_copiati; });
      if (!t) return;
      el.innerHTML = '<section class="card section"><h2>Arhiva de siguranță</h2><p class="note">Copiem toate fișierele și paginile publicate pe site-urile primăriei (inclusiv arhiva veche), ca documentele publice să nu se piardă dacă sunt șterse.</p>' +
        '<div class="grid" style="margin:8px 0 0">' +
        tile("Fișiere și pagini inventariate", nr(t), "", "pe primariaradauti.ro și arhiva.primariaradauti.ro") +
        tile("Copiate de noi", Math.round(100 * c / t) + "%", "", nr(c) + " fișiere, " + gb(o) + ", cu amprentă SHA-256") +
        tile("În Internet Archive", Math.round(100 * w / t) + "%", "", nr(w) + " adrese, verificabile public în Wayback Machine") +
        (x ? tile("Dispărute de pe site-urile primăriei", nr(x), "", "păstrate în copia noastră și în Internet Archive") : "") +
        '</div><p class="note">Lista completă, cu data și amprenta fiecărui fișier: <a href="' + BASE + 'date/arhiva-manifest.csv">manifest (CSV)</a>. Actualizat la ' + esc(zi(d.actualizat_la)) + ".</p></section>";
    }).catch(function () {});
  }

  function arhivaIntern(el) {
    el.innerHTML = head("Arhiva de siguranță (intern)", "Copiile noastre ale tuturor fișierelor și paginilor de pe site-urile primăriei. „copie” deschide fișierul salvat de noi, „original” adresa primăriei, „Wayback” copia publică din Internet Archive.") +
      '<section class="card section"><div id="lst"><p class="updated">Se încarcă manifestul...</p></div></section>';
    get(BASE + "date/arhiva-manifest.json").then(function (M) {
      var tipuri = { media: "fișier", link: "fișier legat", pagina: "pagină" };
      lista($("lst"), M, {
        placeholder: "Caută în adresă sau titlu (ex. hcl, buget, 2016, autorizatii)",
        an: function (x) { return (x.d || "").slice(0, 4); }, text: function (x) { return (x.n || "") + " " + x.u; },
        extraFilter: { html: '<select aria-label="Filtru"><option value="">Toate</option><option value="arhiva">arhiva.primariaradauti.ro</option><option value="site">primariaradauti.ro</option><option value="disparut">Dispărute de pe site</option><option value="necopiat">Încă necopiate</option></select>',
          test: function (x, e) { return e === "disparut" ? !!x.x : e === "necopiat" ? !x.c : x.s === e; } },
        item: function (x) {
          var f = safeUrl(x.u), w = safeUrl(x.w), nume = decodeURIComponent((x.u.split("/").filter(Boolean).pop() || x.u));
          var cop = x.c ? x.c.replace(/^intern\//, "").split("/").map(encodeURIComponent).join("/") : null;
          return '<div class="doc"><div class="h"><span class="id">' + esc(x.n || nume) + '</span><span class="tag">' + esc(tipuri[x.t] || x.t) + "</span>" + (x.x ? '<span class="tag" style="border-color:var(--bad)">dispărut de pe site</span>' : "") + "</div>" +
            '<div class="m"><span>' + esc(x.d ? zi(x.d) : "") + (x.m ? " · " + gb(x.m) : "") + (x.h ? " · SHA-256 " + esc(x.h.slice(0, 12)) + "…" : "") + "</span>" +
            (cop ? '<a href="' + cop + '">copie</a>' : '<span class="tag">necopiat încă</span>') + (f ? '<a href="' + esc(f) + '" rel="noopener">original</a>' : "") + (w ? '<a href="' + esc(w) + '" rel="noopener">Wayback</a>' : "") + "</div></div>";
        }
      });
    }).catch(function () { $("lst").innerHTML = '<p class="empty">Manifestul nu e încă disponibil: apare după prima rulare „Arhivare”.</p>'; });
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
    if (ani.some(function (y) { return sed[y].necunoscut; })) tipuri.push(["necunoscut", "Tip nemenționat în titlu", "var(--plan)"]);
    var h = head("Decizii locale", "Hotărârile Consiliului Local, ședințele și proiectele de hotărâre.", r) + '<div class="grid">' +
      (an ? tile("Ședințe în " + an, nS, "", tipuri.map(function (t) { return (s[t[0]] || 0) + " " + t[1].toLowerCase(); }).join(", ")) : "") +
      (an && nS ? tile("Ședințe convocate în regim de urgență (" + an + ")", Math.round(100 * ((s.extraordinara || 0) + (s.extraordinara_de_indata || 0)) / nS) + "%", "", "extraordinare și de îndată, din totalul ședințelor") : "") +
      (pv ? tile("Durata medie de publicare a procesului-verbal", dec(pv.medie_zile), zile(pv.medie_zile), "de la ședință la postare; maxim <strong>" + pv.max_zile + " zile</strong>, din " + pv.pv + " procese-verbale") : "") + "</div>" +
      '<section class="card section"><h2>Ședințe pe ani, după tip</h2><p class="note">Din procesele-verbale publicate de primărie, pe site și în arhivă (' + (ani[0] || "-") + "-" + (ani[ani.length - 1] || "-") + "). O ședință se numără o singură dată, chiar dacă procesul-verbal e împărțit în mai multe fișiere.</p>" +
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
      key: "contracte", titlu: "Achiziții publice", text: "Contractele publicate de primărie pe site și achizițiile din sistemul național SICAP.", h2: "Contracte publicate pe site",
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
  var TIPS = { da: "Achiziție directă", can: "Contract atribuit prin licitație", cn: "Licitație lansată" };
  function prag(d, cpv) { var w = (cpv || "").slice(0, 2) === "45"; return (d || "") >= "2022-07-14" ? (w ? 900400 : 270120) : (w ? 450200 : 135060); }

  function sxPrep(d) {
    var A = [];
    d.da.forEach(function (r) { A.push({ t: "da", id: r[0], i: r[1], d: r[2], an: (r[2] || "").slice(0, 4), f: r[3], c: r[4], lei: r[5], eur: r[6], o: r[7], cod: r[8], niv: r[9] }); });
    d.can.forEach(function (r) { A.push({ t: "can", id: r[0], i: r[1], d: r[2], an: (r[2] || "").slice(0, 4), f: -1, c: r[3], lei: r[4], eur: r[5], o: r[6], cod: r[7], proc: r[8], niv: 0 }); });
    d.cn.forEach(function (r) { A.push({ t: "cn", id: r[0], i: r[1], d: r[2], an: (r[2] || "").slice(0, 4), f: -1, c: r[3], lei: r[4], eur: r[5], o: r[6], cod: r[7], proc: r[8], stare: r[9], cont: r[10], niv: 0 }); });
    d.A = A;
    d.div = d.cpv.map(function (c) { return /^\d{2}/.test(c) ? c.slice(0, 2) : "--"; });
    var ani = {}; A.forEach(function (x) { if (x.an) ani[x.an] = 1; });
    d.ani = Object.keys(ani).sort();
    d.fcui = {}; d.furn.forEach(function (f, i) { if (f[0]) d.fcui[f[0]] = i; });
    d.iid = {}; d.inst.forEach(function (x, i) { d.iid[x[0]] = i; });
    return d;
  }
  function url(x) { return SICAP_URL + (x.t === "da" ? "direct-acquisition/view/" : x.t === "can" ? "notices/ca-notices/view-c/" : "notices/c-notice/v2/view/") + x.id; }
  function fLink(f) {
    var F = SX.furn[f]; if (!F) return "";
    return F[0] ? '<a href="#achizitii/sicap/furnizor/' + encodeURIComponent(F[0]) + '">' + esc(F[1] || F[0]) + "</a>" : esc(F[1]);
  }
  function cat(c) { var k = SX.div[c]; return CPV[k] || (k === "--" ? "Fără cod CPV" : "CPV " + k); }

  // filtrele, păstrate în adresă (#achizitii/sicap?i=..&t=..), ca o căutare să poată fi trimisă mai departe
  var FKEYS = ["i", "t", "a0", "a1", "c", "q", "min", "ab"];
  function sxFiltre(q) { var F = {}; FKEYS.forEach(function (k) { F[k] = q[k] || ""; }); return F; }
  function sxHash(F, baza) {
    var p = FKEYS.filter(function (k) { return F[k]; }).map(function (k) { return k + "=" + encodeURIComponent(F[k]); });
    return (baza || "#achizitii/sicap") + (p.length ? "?" + p.join("&") : "");
  }
  function sxFilt(F, faraTip) {
    var q = norm(F.q).trim(), ii = F.i !== "" ? SX.iid[F.i] : null, min = +F.min || 0;
    return SX.A.filter(function (x) {
      if (!faraTip && (F.t ? x.t !== F.t : x.t === "cn")) return false;
      if (ii != null && x.i !== ii) return false;
      if (F.a0 && x.an < F.a0) return false;
      if (F.a1 && x.an > F.a1) return false;
      if (F.c && SX.div[x.c] !== F.c) return false;
      if (x.niv === 2 && !F.ab) return false;
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
    return MON === "eur" ? " Sumele în euro sunt calculate la cursul " + (c.sursa === "BNR" ? "BNR din ziua fiecărei achiziții" : "din SICAP al anului respectiv") + "." : "";
  }

  function sicap(el, r) {
    var cap = head("Achiziții publice", "Ce cumpără primăria și instituțiile din Rădăuți, din Sistemul Electronic de Achiziții Publice (SICAP, e-licitatie.ro), din 2018.", r);
    if (!SX) {
      el.innerHTML = cap + '<p class="updated">Se încarcă datele SICAP...</p>';
      get(BASE + "date/sicap-explorer.json").then(function (d) { SX = sxPrep(d); render(); })
        .catch(function () { el.innerHTML = cap + '<section class="card section"><h2>Date din SICAP</h2><p>Datele apar după următoarea rulare a colectării.</p></section>'; });
      return;
    }
    if (r.rest[0] === "furnizor" && r.rest[1]) return sxFurnizor(el, r, decodeURIComponent(r.rest[1]));
    sxPanorama(el, r, cap);
  }

  function sxPanorama(el, r, cap) {
    var F = sxFiltre(r.q);
    var cnt = {}; SX.A.forEach(function (x) { if (x.t !== "cn") cnt[x.i] = (cnt[x.i] || 0) + 1; });
    var instOrd = SX.inst.map(function (x, i) { return i; }).sort(function (a, b) { return (cnt[b] || 0) - (cnt[a] || 0); });
    var divs = {}; SX.A.forEach(function (x) { divs[SX.div[x.c]] = 1; });
    var opt = function (v, t, s) { return '<option value="' + esc(v) + '"' + (String(s) === String(v) ? " selected" : "") + ">" + esc(t) + "</option>"; };
    var aniOpt = function (s, gol) { return opt("", gol, s) + SX.ani.map(function (a) { return opt(a, a, s); }).join(""); };
    el.innerHTML = cap +
      '<div class="card section sx-bar"><div class="filters">' +
      '<select id="f-i" aria-label="Instituția">' + opt("", "Toate instituțiile (" + SX.inst.length + ")", F.i) + instOrd.map(function (i) { return opt(SX.inst[i][0], SX.inst[i][1] + " (" + nr(cnt[i] || 0) + ")", F.i); }).join("") + "</select>" +
      '<select id="f-t" aria-label="Tipul">' + opt("", "Toate cumpărările", F.t) + opt("da", "Achiziții directe (fără licitație)", F.t) + opt("can", "Contracte atribuite prin licitație", F.t) + opt("cn", "Licitații lansate (valoare estimată)", F.t) + "</select>" +
      '<select id="f-c" aria-label="Categoria">' + opt("", "Toate categoriile", F.c) + Object.keys(divs).sort(function (a, b) { return (CPV[a] || a).localeCompare(CPV[b] || b, "ro"); }).map(function (k) { return opt(k, CPV[k] || (k === "--" ? "Fără cod CPV" : "CPV " + k), F.c); }).join("") + "</select>" +
      '</div><div class="filters">' +
      '<input id="f-q" type="search" value="' + esc(F.q) + '" placeholder="Caută: obiect, furnizor, CUI, cod CPV (ex. asfalt, 45233)" aria-label="Caută">' +
      '<label class="lbl-s">din <select id="f-a0" aria-label="De la anul">' + aniOpt(F.a0, "2018") + '</select></label><label class="lbl-s">până în <select id="f-a1" aria-label="Până în anul">' + aniOpt(F.a1, "prezent") + "</select></label>" +
      '<select id="f-min" aria-label="Valoarea minimă">' + opt("", "Orice valoare", F.min) + ["10000", "50000", "100000", "270000", "1000000"].map(function (v) { return opt(v, "peste " + nr(+v) + " lei", F.min); }).join("") + "</select>" +
      segMon() + "</div>" +
      '<div class="sx-act"><label class="chk"><input type="checkbox" id="f-ab"' + (F.ab ? " checked" : "") + "> include valorile aberante din SICAP</label>" +
      '<a href="#achizitii/sicap" id="f-reset">Șterge filtrele</a></div></div><div id="sx-out"></div>';
    function citeste() {
      ["i", "t", "c", "q", "a0", "a1", "min"].forEach(function (k) { F[k] = $("f-" + k).value; });
      F.ab = $("f-ab").checked ? "1" : "";
      if (F.a0 && F.a1 && F.a0 > F.a1) { var t = F.a0; F.a0 = F.a1; F.a1 = t; }
      history.replaceState(null, "", sxHash(F));
      sxOut($("sx-out"), F);
    }
    ["f-i", "f-t", "f-c", "f-a0", "f-a1", "f-min", "f-ab"].forEach(function (id) { $(id).addEventListener("change", citeste); });
    var tq; $("f-q").addEventListener("input", function () { clearTimeout(tq); tq = setTimeout(citeste, 250); });
    legaSeg(el, function () { sxOut($("sx-out"), F); });
    SXR = function (patch) { Object.keys(patch).forEach(function (k) { F[k] = patch[k]; }); location.hash = sxHash(F); };
    sxOut($("sx-out"), F);
    if (INTERN) {   // ce am găsit în SICAP și n-am inclus: de verificat dacă lipsește vreo instituție din oraș
      el.insertAdjacentHTML("beforeend", '<div id="sx-ex"></div>');
      get(BASE + "date/sicap.json").then(function (d) {
        var ex = d.excluse || []; if (!ex.length) return;
        $("sx-ex").innerHTML = '<section class="card section"><h2>Autorități găsite în SICAP, dar neincluse (intern)</h2><p class="note">Apar la căutarea după „Rădăuți” sau după termenii suplimentari, dar nu sunt din oraș sau nu au CUI-ul în listă. Dacă una e din Rădăuți, CUI-ul ei se adaugă în config.SICAP_CUI_EXTRA.</p><div class="tw"><table><tbody>' +
          ex.map(function (x) { return "<tr><td>" + esc(x.text) + '</td><td class="n">id ' + esc(x.id) + "</td></tr>"; }).join("") + "</tbody></table></div></section>";
      }).catch(function () {});
    }
  }

  function sxOut(el, F) {
    var rows = sxFilt(F), cumparari = F.t !== "cn";
    var da = rows.filter(function (x) { return x.t === "da"; }), can = rows.filter(function (x) { return x.t === "can"; });
    var tot = suma(rows), nAni = {}, h = "";
    rows.forEach(function (x) { if (x.an) nAni[x.an] = 1; });
    var ani = Object.keys(nAni).sort();
    if (!rows.length) { el.innerHTML = '<section class="card section"><p class="empty">Nicio achiziție nu corespunde filtrelor.</p></section>'; return; }
    var perioada = ani.length ? (ani[0] === ani[ani.length - 1] ? "în " + ani[0] : "din " + ani[0] + " până în " + ani[ani.length - 1]) : "";
    var gf = grup(da, function (x) { return x.f >= 0 ? x.f : null; });
    var fk = Object.keys(gf).sort(function (a, b) { return gf[b].v - gf[a].v; });
    var top5 = fk.slice(0, 5).reduce(function (a, k) { return a + gf[k].v; }, 0), vda = suma(da);
    var maxRow = rows.reduce(function (m, x) { return val(x) > val(m) ? x : m; }, rows[0]);
    // cifrele principale
    h += '<div class="grid">' +
      tile(cumparari ? "Total cumpărat" : "Valoarea estimată a licitațiilor", bani(tot), "", nr(rows.length) + (cumparari ? " achiziții și contracte, " : " licitații, ") + perioada);
    if (!F.t && tot) h += tile("Cumpărat fără licitație", Math.round(100 * vda / tot) + "%", "", "din valoare: " + nr(da.length) + " achiziții directe, " + bani(vda));
    if (fk.length) h += tile("Furnizori diferiți", nr(fk.length), "", "primii 5 au primit <strong>" + Math.round(100 * top5 / (vda || 1)) + "%</strong> din banii pe achiziții directe");
    h += tile("Cea mai mare valoare", bani(val(maxRow)), "", esc((maxRow.f >= 0 ? SX.furn[maxRow.f][1] + ": " : "") + (maxRow.o || "").slice(0, 70))) + "</div>";
    // pe ani
    var gA = {}; rows.forEach(function (x) { var g = gA[x.an] || (gA[x.an] = { da: 0, can: 0, cn: 0, nda: 0, ncan: 0, ncn: 0 }); g[x.t] += val(x); g["n" + x.t]++; });
    var A = []; if (ani.length) for (var y = +ani[0]; y <= +ani[ani.length - 1]; y++) A.push(String(y));
    var ser = cumparari ? [["da", "Achiziții directe", "var(--s1)"], ["can", "Contracte prin licitație", "var(--s2)"]].filter(function (s) { return !F.t || F.t === s[0]; }) : [["cn", "Licitații lansate", "var(--s3)"]];
    var maxA = Math.max.apply(null, A.map(function (y) { var g = gA[y] || {}; return ser.reduce(function (a, s) { return a + (g[s[0]] || 0); }, 0); }).concat([1]));
    var u = unitate(maxA);
    h += '<section class="card section"><h2>' + (cumparari ? "Cât s-a cumpărat, pe ani" : "Valoarea estimată a licitațiilor lansate, pe ani") + '</h2><p class="note">În ' + u.n + ". Achizițiile directe după data finalizării, contractele după data anunțului de atribuire. Apasă pe un an ca să vezi doar anul respectiv." + notaCurs() + "</p>" +
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
    h += '<div class="grid two">' + (fk.length ? '<section class="card"><h2>Furnizorii cu cele mai mari sume</h2><p class="note">Achiziții directe. Apasă pe un furnizor ca să vezi tot ce a vândut instituțiilor din Rădăuți.</p>' +
      hbl(fk.slice(0, 10).map(function (k) { var Fn = SX.furn[k]; return { l: Fn[1] || Fn[0], v: gf[k].v, href: Fn[0] ? "#achizitii/sicap/furnizor/" + encodeURIComponent(Fn[0]) : null }; }), bani, vda) + "</section>" : "") +
      '<section class="card"><h2>Pe ce s-au dat banii</h2><p class="note">Pe categorii de produse și servicii (codul CPV). Apasă pe o categorie ca să o filtrezi.</p>' +
      hbl(ck.slice(0, 12).map(function (k) { return { l: CPV[k] || (k === "--" ? "Fără cod CPV" : "CPV " + k), v: gc[k].v, href: F.c ? null : sxHash(Object.assign({}, F, { c: k })) }; }), bani, tot) + "</section></div>";
    if (F.i === "") {
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
    h += '<div id="sx-semn"></div><div id="sx-ver"></div>';
    if (fk.length) h += '<section class="card section"><h2>Toți furnizorii</h2><p class="note">Achiziții directe, după filtrele de mai sus.</p><div id="sx-f"></div></section>';
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
    if (fk.length) sxFurnizori($("sx-f"), gf, fk);
    sxLista($("sx-l"), rows);
  }

  function sxSemnale(el, da, titlu) {
    var g = {};
    da.forEach(function (x) { if (x.niv === 2 || !(x.f >= 0) || !SX.furn[x.f][0]) return; var c = SX.cpv[x.c] || "", k = x.an + "|" + x.i + "|" + x.f + "|" + c.slice(0, 3); (g[k] = g[k] || []).push(x); });
    var out = [];
    Object.keys(g).forEach(function (k) {
      var l = g[k]; if (l.length < 2) return;
      var s = l.reduce(function (a, x) { return a + (x.lei || 0); }, 0), dm = l.reduce(function (a, x) { return x.d > a ? x.d : a; }, ""), p = prag(dm, SX.cpv[l[0].c]);
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
    var G = Object.assign({}, F, { t: "da", ab: "1", min: "" }), v = sxFilt(G).filter(function (x) { return x.niv; }).sort(function (a, b) { return (b.lei || 0) - (a.lei || 0); });
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

  function sxItem(x, cuInst) {
    var m = [];
    if (cuInst) m.push("<span>" + esc(SX.inst[x.i][1]) + "</span>");
    if (x.f >= 0) m.push(fLink(x.f));
    if (x.t !== "da" && x.proc) m.push("<span>" + esc(x.proc) + (x.stare ? " · " + esc(x.stare) : "") + (x.cont ? " · contestată" : "") + "</span>");
    m.push("<span>" + esc(cat(x.c)) + "</span>");
    m.push('<a href="' + url(x) + '" rel="noopener">în SICAP' + (x.cod ? " (" + esc(x.cod) + ")" : "") + "</a>");
    return '<div class="doc"><div class="h"><span class="id">' + esc(zi(x.d)) + (x.lei ? " · " + bani(val(x)) : "") + '</span><span class="tag">' + TIPS[x.t] + "</span>" +
      (x.niv ? '<span class="tag" style="border-color:var(--' + (x.niv === 2 ? "bad" : "warn") + ')">' + (x.niv === 2 ? "valoare aberantă" : "peste pragul legal") + "</span>" : "") + "</div>" +
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

  function sxFurnizor(el, r, cui) {
    var f = SX.fcui[cui];
    var inapoi = '<p class="back"><a href="#achizitii/sicap">← Toate achizițiile</a></p>';
    if (f == null) { el.innerHTML = head("Achiziții publice", "", r) + inapoi + '<section class="card section"><p class="empty">Furnizorul cu CUI ' + esc(cui) + " nu apare în achizițiile instituțiilor din Rădăuți.</p></section>"; return; }
    var Fn = SX.furn[f];
    function deseneaza() {
      var all = SX.A.filter(function (x) { return x.f === f; }), rows = all.filter(function (x) { return x.niv < 2; });
      var tot = suma(rows), ani = {}; all.forEach(function (x) { ani[x.an] = 1; }); var ak = Object.keys(ani).sort();
      var gi = grup(rows, function (x) { return x.i; }), ik = Object.keys(gi).sort(function (a, b) { return gi[b].v - gi[a].v; });
      var gc = grup(rows, function (x) { return SX.div[x.c]; }), ck = Object.keys(gc).sort(function (a, b) { return gc[b].v - gc[a].v; });
      // locul în clasamentul furnizorilor (achiziții directe, toți anii)
      var tf = {}; SX.A.forEach(function (x) { if (x.t === "da" && x.niv < 2 && x.f >= 0) tf[x.f] = (tf[x.f] || 0) + val(x); });
      var loc = 1 + Object.keys(tf).filter(function (k) { return tf[k] > (tf[f] || 0); }).length;
      var h = head(Fn[1] || ("CUI " + Fn[0]), "CUI " + esc(Fn[0]) + ". Tot ce a vândut instituțiilor din Rădăuți prin achiziții directe în SICAP, din 2018.", r) + inapoi +
        '<div class="filters">' + segMon() + "</div>" +
        '<div class="grid">' + tile("Total primit", bani(tot), "", nr(rows.length) + " achiziții directe, " + (ak.length ? (ak.length > 1 ? ak[0] + "-" + ak[ak.length - 1] : "în " + ak[0]) : "")) +
        tile("Instituții care au cumpărat", nr(ik.length), "", ik.length ? "cele mai multe de la " + esc(SX.inst[ik[0]][1]) : "") +
        tile("Locul între furnizori", nr(loc), "", "din " + nr(Object.keys(tf).length) + ", după valoarea achizițiilor directe") +
        tile("Valoarea medie a unei achiziții", bani(rows.length ? tot / rows.length : 0), "", "cea mai mare: " + bani(rows.reduce(function (m, x) { return Math.max(m, val(x)); }, 0))) + "</div>";
      var A = []; if (ak.length) for (var y = +ak[0]; y <= +ak[ak.length - 1]; y++) A.push(String(y));
      var topI = ik.slice(0, 3), culori = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--plan)"];
      var serii = topI.map(function (k, j) { return { k: [+k], name: SX.inst[k][1], color: culori[j] }; });
      if (ik.length > 3) serii.push({ k: ik.slice(3).map(Number), name: "Alte instituții", color: culori[3] });
      var gA = {}; rows.forEach(function (x) { var g = gA[x.an] || (gA[x.an] = { v: 0, n: 0, pe: {} }); g.v += val(x); g.n++; g.pe[x.i] = (g.pe[x.i] || 0) + val(x); });
      var u = unitate(Math.max.apply(null, A.map(function (y) { return (gA[y] || {}).v || 0; }).concat([1])));
      h += '<section class="card section"><h2>Cât a primit, pe ani</h2><p class="note">În ' + u.n + ", pe instituții." + notaCurs() + "</p>" + (serii.length > 1 ? legend(serii.map(function (s) { return [s.name, s.color]; })) : "") + '<div class="chart" id="ch-fa"></div>' +
        '<details class="tbl"><summary>Vezi tabelul</summary><div class="tw"><table><thead><tr><th>An</th><th class="n">Achiziții</th><th class="n">Lei</th><th class="n">Euro</th></tr></thead><tbody>' +
        A.slice().reverse().map(function (y) { var l = rows.filter(function (x) { return x.an === y; }); return "<tr><td>" + y + '</td><td class="n">' + nr(l.length) + '</td><td class="n">' + lei(l.reduce(function (a, x) { return a + (x.lei || 0); }, 0)) + '</td><td class="n">' + euro(l.reduce(function (a, x) { return a + (x.eur || 0); }, 0)) + "</td></tr>"; }).join("") +
        "</tbody></table></div></details></section>";
      h += '<div class="grid two"><section class="card"><h2>Câte achiziții, pe ani</h2><div class="chart" id="ch-fn"></div></section>' +
        '<section class="card"><h2>Ce a vândut</h2><p class="note">Pe categorii de produse și servicii.</p>' + hbl(ck.slice(0, 8).map(function (k) { return { l: CPV[k] || ("CPV " + k), v: gc[k].v }; }), bani, tot) + "</section></div>";
      if (ik.length > 1) h += '<section class="card section"><h2>Cui a vândut</h2>' + hbl(ik.map(function (k) { return { l: SX.inst[k][1], v: gi[k].v, href: sxHash({ i: String(SX.inst[k][0]), q: Fn[0] }) }; }), bani, tot) + "</section>";
      h += '<div id="sx-semn"></div>';
      var ab = all.filter(function (x) { return x.niv === 2; });
      if (ab.length) h += '<p class="callout">' + ab.length + (ab.length === 1 ? " achiziție are" : " achiziții au") + " în SICAP o valoare de peste 10 ori pragul legal (în total " + lei(ab.reduce(function (a, x) { return a + (x.lei || 0); }, 0)) + "), aproape sigur o greșeală de introducere. Nu intră în totalurile de mai sus; apar în lista de mai jos, marcate.</p>";
      h += '<p class="note">Contractele atribuite prin licitație nu au încă furnizorul câștigător în datele noastre; le adăugăm într-o etapă următoare.</p>';
      h += '<section class="card section"><h2>Toate achizițiile de la acest furnizor</h2><div id="sx-l"></div></section>';
      el.innerHTML = h;
      chart($("ch-fa"), { cats: A, stacked: true, label: "Valoarea pe ani",
        series: serii.map(function (s) { return { name: s.name, color: s.color, values: A.map(function (y) { var g = gA[y]; return g ? rot(s.k.reduce(function (a, k) { return a + (g.pe[k] || 0); }, 0), u) : 0; }) }; }),
        labelValue: function (i) { var g = gA[A[i]]; return g && g.v ? eti(g.v, u) : ""; },
        tooltip: function (i) { var g = gA[A[i]] || { v: 0, n: 0 }; return "<b>" + A[i] + "</b><br>" + bani(g.v) + "<br>" + nr(g.n) + " achiziții"; } });
      chart($("ch-fn"), { cats: A, label: "Numărul de achiziții pe ani", series: [{ name: "Achiziții", color: "var(--s1)", values: A.map(function (y) { return (gA[y] || {}).n || 0; }) }],
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
    else if (id === "arhiva") arhivaIntern(el);
    if (id === "acasa") arhivaCard();
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
  var ultimaPagina = route().path;
  window.addEventListener("hashchange", function () {
    var p = route().path; render();
    if (p !== ultimaPagina) window.scrollTo(0, 0);   // doar filtrele s-au schimbat: rămânem unde eram
    ultimaPagina = p;
  });
})();
