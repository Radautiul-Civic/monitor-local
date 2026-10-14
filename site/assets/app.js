/* Monitor local - aplicația paginii (publică și internă).
   <body data-base="" data-mode="public">  sau  <body data-base="../" data-mode="intern"> */
(function () {
  "use strict";
  var B = document.body.dataset, BASE = B.base || "", INTERN = B.mode === "intern";
  // datele: zona publică are doar hotărârile și SICAP; pagina internă își ia datele complete din intern/date/
  var DATA = INTERN ? "date/" : BASE + "date/";
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
  var SECTIUNI = INTERN ? [
    { id: "acasa", nume: "Acasă" },
    { id: "consiliu", nume: "Consiliul Local", def: "hcl", sub: [["proiecte", "Proiecte de hotărâre"], ["hcl", "Hotărâri adoptate"], ["sedinte", "Ședințe și procese-verbale"], ["consilieri", "Consilieri"]] },
    { id: "primarie", nume: "Primărie", def: "urbanism", sub: [["buget", "Buget"], ["urbanism", "Urbanism"]] },
    { id: "achizitii", nume: "Achiziții publice", sub: [["contracte", "Contracte"], ["sicap", "SICAP"]] },
    { id: "litigii", nume: "Litigii", def: "noutati", sub: [["noutati", "Noutăți"], ["dosare", "Dosare"], ["statistici", "Statistici"]] },
    { id: "cauta", nume: "Caută" }
  ] : [   // versiunea publică: hotărârile consiliului local, registrele de urbanism și achizițiile din SICAP
    { id: "acasa", nume: "Acasă" },
    { id: "consiliu", nume: "Hotărâri CL", def: "hcl", sub: [["hcl", "Hotărâri adoptate"]] },
    { id: "primarie", nume: "Urbanism", def: "urbanism", sub: [["urbanism", "Urbanism"]] },
    { id: "achizitii", nume: "Achiziții publice", def: "sicap", sub: [["sicap", "SICAP"]] },
    { id: "cauta", nume: "Caută" }
  ];
  var URB_TABS = [["cu", "Certificate de urbanism"], ["ac", "Autorizații de construire"]].concat(INTERN ? [["harta", "Harta"]] : []);
  // adresele vechi (linkuri deja trimise) duc în noua structură
  var ALIAS = { decizii: function (h) { return ["consiliu"].concat(h.slice(1)); },
    urbanism: function (h) { return ["primarie", "urbanism"].concat(h.slice(1)); } };
  if (INTERN) { SECTIUNI.push({ id: "texte", nume: "Toate textele" }); SECTIUNI.push({ id: "arhiva", nume: "Arhiva de siguranță" }); }

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
    $("nav").innerHTML = SECTIUNI.map(function (s) {
      return '<a href="#' + s.id + '"' + (s.id === r.s.id ? ' aria-current="page"' : "") + ">" + esc(s.nume) + "</a>";
    }).join("");
  }

  function head(title, text, r) {
    var h = '<div class="page-head"><h1>' + esc(title) + "</h1>" + (text ? "<p>" + text + "</p>" : "");
    if (r && r.s.sub && r.s.sub.length > 1) h += '<div class="subnav">' + r.s.sub.map(function (x) {
      return '<a href="#' + r.s.id + "/" + x[0] + '"' + (x[0] === r.sub ? ' aria-current="page"' : "") + ">" + esc(x[1]) + "</a>";
    }).join("") + "</div>";
    if (r && r.s.id === "primarie" && r.sub === "urbanism") {
      var t2 = r.rest[0] || "cu";
      h += '<div class="subnav sub2">' + URB_TABS.map(function (x) {
        return '<a href="#primarie/urbanism/' + x[0] + '"' + (x[0] === t2 ? ' aria-current="page"' : "") + ">" + esc(x[1]) + "</a>";
      }).join("") + "</div>";
    }
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
        return Math.max(v, cfg.track ? (cfg.track.values[i] || 0) : 0, cfg.line ? (cfg.line.values[i] || 0) : 0);
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
          base = top;
        });
        var lab = cfg.labelValue ? cfg.labelValue(i) : null;
        if (lab != null) s += '<text class="lbl" x="' + (x + bw / 2) + '" y="' + (y(tot[i]) - 5) + '" text-anchor="middle">' + esc(lab) + "</text>";
        s += '<rect class="hit" x="' + (m.l + band * i) + '" y="' + m.t + '" width="' + band + '" height="' + ih + '"/></g>';
      });
      if (cfg.line) {   // o linie peste bare (ex. datoria cumulată); valorile negative se opresc la 0
        var pts = cfg.line.values.map(function (v, i) { return (m.l + band * i + band / 2) + "," + y(Math.max(0, v || 0)); });
        s += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + cfg.line.color + '" stroke-width="2" pointer-events="none"/>' +
          pts.map(function (p) { var q = p.split(","); return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="3" fill="' + cfg.line.color + '" pointer-events="none"/>'; }).join("");
      }
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

  // ---------- Căutare în textul documentelor (OCR), doar intern ----------
  var FT = null, FT_SH = {}, FT_TXT = {};
  var FELURI = { hcl: "Hotărâre", pv: "Proces-verbal", proiecte: "Proiect de hotărâre", contracte: "Contract", buget: "Buget", bilanturi: "Bilanț",
    cu: "Registru certificate", ac: "Registru autorizații", arhiva: "Arhiva veche", altele: "Alt document" };
  function ftMeta() {
    if (FT) return Promise.resolve(FT);
    return get(DATA + "cautare/docs.json").then(function (m) { FT = m; FT.comuneS = {}; (m.comune || []).forEach(function (w) { FT.comuneS[w] = 1; }); FT.bucS = {}; (m.bucati || []).forEach(function (b) { FT.bucS[b] = 1; }); return FT; });
  }
  function ftBucata(k) {
    if (FT_SH[k]) return FT_SH[k];
    FT_SH[k] = FT.bucS[k] ? get(DATA + "cautare/idx/" + k + ".json?v=" + encodeURIComponent(FT.generat_la)).catch(function () { return {}; }) : Promise.resolve({});
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
    if (!FT_TXT[id]) FT_TXT[id] = fetch(DATA + "cautare/txt/" + id + ".txt", { cache: "force-cache" }).then(function (x) { return x.ok ? x.text() : ""; }).catch(function () { return ""; });
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
    return INTERN ? '<section class="card section"><h2>' + esc(titlu) + '</h2><div class="ft-box" data-f="' + esc(feluri.join(",")) + '" data-p="' + esc(ph || "") + '"></div></section>' : "";
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
    var h = hero + (INTERN ? head("Ce publică Primăria Municipiului Rădăuți",
      "Monitorul verifică zilnic actele publicate de primărie și consiliul local, din surse publice: hotărâri, ședințe, urbanism, achiziții. Fiecare cifră duce la documentul-sursă.") :
      head("Hotărâri, construcții și bani publici în Rădăuți",
      "Monitorul adună zilnic, din surse publice, hotărârile Consiliului Local al Municipiului Rădăuți, certificatele de urbanism și autorizațiile de construire emise de primărie și achizițiile publice ale instituțiilor din oraș, din sistemul național SICAP. Fiecare cifră duce la documentul-sursă."));
    var pe = IND.hcl_pe_ani || {}, ani = Object.keys(pe).sort();
    var total = ani.reduce(function (a, y) { return a + pe[y].gasite; }, 0);
    var lag = IND.hcl_intarziere_publicare || {}, ultim = Object.keys(lag).filter(function (y) { return lag[y].fiabil !== false; }).sort().pop();
    var sed = IND.sedinte_pe_tip || {}, an = Object.keys(sed).sort().pop(), s = an ? sed[an] : {};
    var nS = Object.keys(s).reduce(function (a, k) { return a + s[k]; }, 0), nEx = (s.extraordinara || 0) + (s.extraordinara_de_indata || 0);
    var reg = IND.registre_urbanism || {}, c = IND.contracte_site || {}, d = IND.documente || {};
    var scanPct = d.descarcate ? Math.round(100 * d.scanate / d.descarcate) : null;
    var hScan = ani.reduce(function (a, y) { return a + (pe[y].scanate || 0); }, 0);
    h += '<div class="grid">' +
      tile("Hotărâri de consiliu în monitor", nr(total), "", ani.length ? "din " + ani[0] + " până în " + ani[ani.length - 1] : "", "#consiliu/hcl") +
      (ultim ? tile("Durata medie de publicare a unei hotărâri (" + ultim + ")", dec(lag[ultim].medie_zile), zile(lag[ultim].medie_zile), "de la adoptare la postarea pe site; maxim <strong>" + lag[ultim].max_zile + " zile</strong>", "#consiliu/hcl") : "") +
      (an ? tile("Ședințe ale consiliului în " + an, nS, "", "<strong>" + nEx + " extraordinare</strong> sau de îndată, " + (s.ordinara || 0) + " ordinare", "#consiliu/sedinte") : "") +
      (reg.cu ? tile("Zile fără registru de urbanism publicat", nr(reg.cu.zile_neacoperite), zile(reg.cu.zile_neacoperite), "ultimul registru acoperă până la " + zi(reg.cu.ultima_perioada_pana_la), "#primarie/urbanism/cu") : "") +
      (c.zile_de_la_ultima != null ? tile("Zile de la ultimul contract publicat", nr(c.zile_de_la_ultima), zile(c.zile_de_la_ultima), "ultimul: " + zi(c.ultima_postare), "#achizitii/contracte") : "") +
      (IND.litigii && IND.litigii.total ? tile("Dosare în instanță", nr(IND.litigii.total), "", "în care e parte o autoritate din Rădăuți, din " + IND.litigii.primul_an + "; <strong>" + nr(IND.litigii.in_curs) + " în curs</strong>", "#litigii/statistici") : "") +
      (IND.sicap && IND.sicap.achizitii_directe ? tile("Achiziții publice în SICAP", nr(IND.sicap.achizitii_directe), "", "achiziții directe din 2018, la " + IND.sicap.institutii + " instituții din Rădăuți; vezi furnizorii și sumele", "#achizitii/sicap") : "") +
      (scanPct != null ? tile("Documente publicate doar ca scanare", scanPct + "%", "", nr(d.scanate) + " din " + nr(d.descarcate) + ": textul nu poate fi căutat și nu e accesibil cititoarelor de ecran") : "") +
      (!INTERN && total ? tile("Hotărâri publicate doar ca scanare", Math.round(100 * hScan / total) + "%", "", nr(hScan) + " din " + nr(total) + ": textul nu poate fi căutat și nu e accesibil cititoarelor de ecran", "#consiliu/hcl") : "") +
      "</div>";
    if (!INTERN) return h + '<section class="card section"><h2>Ce găsești aici</h2><p>Toate hotărârile Consiliului Local publicate de primărie din 2013, cu pagina fiecăreia; certificatele de urbanism și autorizațiile de construire din registrele primăriei: ce se construiește, unde și de către cine; achizițiile publice ale primăriei, ale instituțiilor subordonate și ale școlilor din oraș, din 2018: cine cumpără, ce și de la cine. ' +
      'Caută orice după cuvinte, număr sau firmă în <a href="#cauta">Caută</a>.</p></section>';
    h += '<p class="callout">Versiunea internă: toate datele, inclusiv urbanism, litigii, buget, voturi și arhiva de siguranță. Rapoartele de verificare ale ultimei colectări: <a href="date/rapoarte.zip?v=' + Date.now() + '">rapoarte.zip</a>.</p>';
    h += '<div id="lit-news"></div><div id="arhiva-card"></div>';
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
    for (var a = Math.min.apply(null, ani); a <= Math.max.apply(null, ani); a++) cats.push(String(a));
    var gaps = {}; cats.forEach(function (y) { if (!pe[y]) gaps[y] = "fără sursă"; });
    var total = ani.reduce(function (s, y) { return s + pe[y].gasite; }, 0);
    var scan = ani.reduce(function (s, y) { return s + pe[y].scanate; }, 0);
    var ultim = Object.keys(lag).filter(function (y) { return lag[y].fiabil !== false; }).sort().pop();
    var h = head("Consiliul Local", INTERN ? "Proiectele de hotărâre, hotărârile adoptate și ședințele Consiliului Local al Municipiului Rădăuți." : "Hotărârile adoptate de Consiliul Local al Municipiului Rădăuți, așa cum sunt publicate de primărie.", r) +
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
    h += ftSectiune("Caută în textul hotărârilor", ["hcl"], "Cuvinte din textul hotărârilor (ex. Putnei, concesionare teren); „expresie exactă” între ghilimele") +
      '<section class="card section"><h2>Toate hotărârile</h2><p class="note">Căutarea de aici e în titluri' + (INTERN ? "; pentru textul complet, folosește căutarea de mai sus" : "") + '.</p><div id="lst"></div></section>';
    el.innerHTML = h;
    ftLeaga(el);
    chart($("ch-hcl"), {
      cats: cats, label: "Hotărâri găsite pe ani, față de ultimul număr de hotărâre",
      series: [{ name: "Hotărâri găsite", color: "var(--s1)", values: cats.map(function (y) { return pe[y] ? pe[y].gasite : 0; }) }],
      track: { values: cats.map(function (y) { return pe[y] ? pe[y].ultimul_nr : 0; }) }, gaps: gaps,
      tooltip: function (i) { var v = pe[cats[i]]; return v ? "<b>" + cats[i] + "</b><br>" + v.gasite + " găsite din " + v.ultimul_nr + " (" + v.acoperire_pct + "%)<br>" + v.scanate + " scanate" : "<b>" + cats[i] + "</b><br>nicio sursă publică"; }
    });
    lista($("lst"), L.hcl || [], {
      placeholder: "Caută în titluri (ex. buget, teren, strada Ștefan cel Mare)",
      an: function (x) { return String(x.an); }, text: function (x) { return x.titlu + " " + x.nr + "/" + x.an; },
      item: function (x) { return doc(linkHcl(x), x.titlu, (x.data ? "adoptată " + zi(x.data) : "") + (x.postat ? " · postată " + zi(x.postat) : ""), x); }
    });
  }

  function sedinte(el, r) {
    var sed = IND.sedinte_pe_tip || {}, ani = Object.keys(sed).sort(), pv = IND.pv_intarziere_publicare;
    var an = ani[ani.length - 1], s = an ? sed[an] : {};
    var nS = Object.keys(s).reduce(function (a, k) { return a + s[k]; }, 0);
    var tipuri = [["ordinara", "Ordinare", "var(--s1)"], ["extraordinara", "Extraordinare", "var(--s2)"], ["extraordinara_de_indata", "De îndată", "var(--s3)"]];
    if (ani.some(function (y) { return sed[y].necunoscut; })) tipuri.push(["necunoscut", "Tip nemenționat în titlu", "var(--plan)"]);
    var h = head("Consiliul Local", INTERN ? "Proiectele de hotărâre, hotărârile adoptate și ședințele Consiliului Local al Municipiului Rădăuți." : "Hotărârile adoptate de Consiliul Local al Municipiului Rădăuți, așa cum sunt publicate de primărie.", r) + '<div class="grid">' +
      (an ? tile("Ședințe în " + an, nS, "", tipuri.map(function (t) { return (s[t[0]] || 0) + " " + t[1].toLowerCase(); }).join(", ")) : "") +
      (an && nS ? tile("Ședințe convocate în regim de urgență (" + an + ")", Math.round(100 * ((s.extraordinara || 0) + (s.extraordinara_de_indata || 0)) / nS) + "%", "", "extraordinare și de îndată, din totalul ședințelor") : "") +
      (pv ? tile("Durata medie de publicare a procesului-verbal", dec(pv.medie_zile), zile(pv.medie_zile), "de la ședință la postare; maxim <strong>" + pv.max_zile + " zile</strong>, din " + pv.pv + " procese-verbale") : "") + "</div>" +
      '<section class="card section"><h2>Ședințe pe ani, după tip</h2><p class="note">Din procesele-verbale publicate de primărie, pe site și în arhivă (' + (ani[0] || "-") + "-" + (ani[ani.length - 1] || "-") + "). O ședință se numără o singură dată, chiar dacă procesul-verbal e împărțit în mai multe fișiere.</p>" +
      legend(tipuri.map(function (t) { return [t[1], t[2]]; })) + '<div class="chart" id="ch-sed"></div>' +
      '<details class="tbl"><summary>Vezi tabelul</summary><div class="tw"><table><thead><tr><th>An</th>' + tipuri.map(function (t) { return '<th class="n">' + t[1] + "</th>"; }).join("") + '<th class="n">Total</th></tr></thead><tbody>' +
      ani.slice().reverse().map(function (y) { var v = sed[y], t = 0; return "<tr><td>" + y + "</td>" + tipuri.map(function (k) { t += v[k[0]] || 0; return '<td class="n">' + (v[k[0]] || 0) + "</td>"; }).join("") + '<td class="n">' + t + "</td></tr>"; }).join("") +
      '</tbody></table></div></details></section>' + (INTERN ? '<div id="vt"></div>' : "") + ftSectiune("Caută în textul proceselor-verbale", ["pv"], "Cuvinte din dezbateri (ex. nume de consilier, stradă, proiect); „expresie exactă” între ghilimele") +
      '<section class="card section"><h2>Procese-verbale</h2><div id="lst"></div></section>';
    el.innerHTML = h;
    ftLeaga(el);
    if (INTERN) voturiIntern($("vt"));
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

  function proiecte(el, r) {
    var pe = IND.proiecte_pe_ani || {}, n = Object.keys(pe).reduce(function (a, y) { return a + pe[y]; }, 0);
    simplu(el, r, {
      key: "proiecte", titlu: "Consiliul Local", ft: ["Caută în textul proiectelor", ["proiecte"]], text: "Proiectele de hotărâre, hotărârile adoptate și ședințele Consiliului Local al Municipiului Rădăuți.", h2: "Proiecte de hotărâre",
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
    return F[0] ? '<a href="#achizitii/sicap/furnizor/' + encodeURIComponent(F[0]) + '">' + esc(F[1] || F[0]) + "</a>" : esc(F[1]);
  }
  function cat(c) { var k = SX.div[c]; return CPV[k] || (k === "--" ? "Fără cod CPV" : "CPV " + k); }

  // filtrele, păstrate în adresă (#achizitii/sicap?i=..&t=..), ca o căutare să poată fi trimisă mai departe
  var FKEYS = ["i", "t", "a0", "a1", "c", "q", "min", "ab", "nf"];
  function sxFiltre(q) { var F = {}; FKEYS.forEach(function (k) { F[k] = q[k] || ""; }); return F; }
  function sxHash(F, baza) {
    var p = FKEYS.filter(function (k) { return F[k]; }).map(function (k) { return k + "=" + encodeURIComponent(F[k]); });
    return (baza || "#achizitii/sicap") + (p.length ? "?" + p.join("&") : "");
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
    el.innerHTML = cap +
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
      '<a href="#achizitii/sicap" id="f-reset">Șterge filtrele</a></div></div><div id="sx-out"></div>';
    function citeste() {
      ["i", "t", "c", "q", "a0", "a1", "min"].forEach(function (k) { F[k] = $("f-" + k).value; });
      F.ab = $("f-ab").checked ? "1" : "";
      F.nf = $("f-nf").checked ? "1" : "";
      if (F.a0 && F.a1 && F.a0 > F.a1) { var t = F.a0; F.a0 = F.a1; F.a1 = t; }
      history.replaceState(null, "", sxHash(F));
      sxOut($("sx-out"), F);
    }
    ["f-i", "f-t", "f-c", "f-a0", "f-a1", "f-min", "f-ab", "f-nf"].forEach(function (id) { $(id).addEventListener("change", citeste); });
    var tq; $("f-q").addEventListener("input", function () { clearTimeout(tq); tq = setTimeout(citeste, 250); });
    legaSeg(el, function () { sxOut($("sx-out"), F); });
    SXR = function (patch) { Object.keys(patch).forEach(function (k) { F[k] = patch[k]; }); location.hash = sxHash(F); };
    sxOut($("sx-out"), F);
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
      hbl(fk.slice(0, 10).map(function (k) { var Fn = SX.furn[k]; return { l: Fn[1] || Fn[0], v: gf[k].v, href: Fn[0] ? "#achizitii/sicap/furnizor/" + encodeURIComponent(Fn[0]) : null }; }), bani, vf) + "</section>" : "") +
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

  function sxFurnizor(el, r, cui) {
    var f = SX.fcui[cui];
    var inapoi = '<p class="back"><a href="#achizitii/sicap">← Toate achizițiile</a></p>';
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
        A.slice().reverse().map(function (y) { var l = rows.filter(function (x) { return x.an === y; }); return "<tr><td>" + y + '</td><td class="n">' + nr(l.length) + '</td><td class="n">' + lei(l.reduce(function (a, x) { return a + (x.lei || 0); }, 0)) + '</td><td class="n">' + euro(l.reduce(function (a, x) { return a + (x.eur || 0); }, 0)) + "</td></tr>"; }).join("") +
        "</tbody></table></div></details></section>";
      h += '<div class="grid two"><section class="card"><h2>Câte achiziții, pe ani</h2><div class="chart" id="ch-fn"></div></section>' +
        '<section class="card"><h2>Ce a vândut</h2><p class="note">Pe categorii de produse și servicii.</p>' + hbl(ck.slice(0, 8).map(function (k) { return { l: CPV[k] || ("CPV " + k), v: gc[k].v }; }), bani, tot) + "</section></div>";
      if (ik.length > 1) h += '<section class="card section"><h2>Cui a vândut</h2>' + hbl(ik.map(function (k) { return { l: SX.inst[k][1], v: gi[k].v, href: sxHash({ i: String(SX.inst[k][0]), q: Fn[0] }) }; }), bani, tot) + "</section>";
      h += '<div id="sx-semn"></div>';
      var ab = all.filter(function (x) { return x.niv === 2 && x.ok; }), ne = all.filter(function (x) { return !x.ok; });
      if (acs.length) h += '<p class="callout">' + (acs.length === 1 ? "Un acord-cadru" : acs.length + " acorduri-cadru") + " cu o valoare maximă de " + bani(suma(acs)) + ". Nu intră în totaluri: acordul-cadru e doar plafonul; ce s-a cumpărat efectiv apare în contractele subsecvente.</p>";
      if (ne.length) h += '<p class="callout">' + ne.length + (ne.length === 1 ? " achiziție directă nu s-a încheiat" : " achiziții directe nu s-au încheiat") + " (" + esc(Array.from(new Set(ne.map(function (x) { return (x.stare || "").toLowerCase(); }))).join(", ")) + "), în valoare de " + lei(ne.reduce(function (a, x) { return a + (x.lei || 0); }, 0)) + ". Nu sunt bani primiți și nu intră în totaluri; apar în lista de mai jos, marcate.</p>";
      if (ab.length) h += '<p class="callout">' + ab.length + (ab.length === 1 ? " achiziție are" : " achiziții au") + " în SICAP o valoare de peste 10 ori pragul legal (în total " + lei(ab.reduce(function (a, x) { return a + (x.lei || 0); }, 0)) + "), aproape sigur o greșeală de introducere. Nu intră în totalurile de mai sus; apar în lista de mai jos, marcate.</p>";
      if (!SX.castigatori) h += '<p class="note">Contractele atribuite prin licitație nu au încă furnizorul câștigător în datele noastre; apar după următoarea colectare.</p>';
      h += '<section class="card section"><h2>Toate achizițiile de la acest furnizor</h2><div id="sx-l"></div></section>';
      el.innerHTML = h;
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
      '<div id="exec"></div><div id="pe-ani"></div><div id="datorie"></div>' +
      '<section class="card section"><h2>Hotărâri despre buget, pe ani</h2><p class="note">Hotărârile consiliului local care aprobă, rectifică sau modifică bugetul, după titlu. Multe rectificări într-un an înseamnă un buget schimbat des.</p>' +
      legend(F3.map(function (f) { return [f[1], f[2]]; })) + '<div class="chart" id="ch-b"></div></section>' +

      '<section class="card section"><h2>Hotărârile despre buget</h2><div id="lst"></div></section>' +
      '<div class="grid two"><section class="card"><h2>Documente de buget</h2><div id="lst2"></div></section><section class="card"><h2>Bilanțuri contabile</h2><div id="lst3"></div></section></div>';
    el.innerHTML = h;
    executie($("exec"));
    bugetPeAni($("pe-ani"));
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
      '<h3 style="margin-top:12px">De unde vin banii</h3><div id="dn-v"></div><h3 style="margin-top:18px">Pe ce se cheltuie</h3><div id="dn-c"></div>' +
      '<div id="sut"></div>' +
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
    donut($("dn-c"), ic, { label: "Pe ce se cheltuie în " + an, centru: "cheltuieli " + an, total: lei(chT) });
    var tv = iv.reduce(function (a, q) { return a + q.v; }, 0), tc = ic.reduce(function (a, q) { return a + q.v; }, 0);
    if (tv && tc) $("sut").innerHTML = '<p class="sut">Din fiecare <strong>100 de lei</strong> intrați în bugetul orașului în ' + an + ": " + sutaLei(iv, tv, function (l) { return "din " + (SCURT_SURSE[l] || l.toLowerCase()); }) + ".<br>" +
      "Din fiecare <strong>100 de lei</strong> cheltuiți: " + sutaLei(ic, tc, function (l) { return "pentru " + l.toLowerCase(); }) +
      (chT && inv ? "; în total, <strong>" + Math.round(100 * inv / chT) + " lei</strong> au fost investiții, restul funcționare." : ".") + "</p>";
    chart($("ch-vc"), { cats: ani, grouped: true, label: "Venituri și cheltuieli pe ani",
      series: [{ name: "Venituri", color: "var(--s3)", values: ani.map(function (a) { return rot(M.ani[a].venituri || 0, u); }) },
               { name: "Cheltuieli", color: "var(--s2)", values: ani.map(function (a) { return rot(M.ani[a].cheltuieli || 0, u); }) }],
      tooltip: function (i) { var v = M.ani[ani[i]]; return "<b>" + ani[i] + (ani[i] === azi ? " (parțial)" : "") + "</b><br>Venituri: " + lei(v.venituri) + "<br>Cheltuieli: " + lei(v.cheltuieli); },
      onClick: function (i) { executie(el, ani[i]); } });
  }

  // ---------- Primărie: Urbanism, harta ----------
  var LEAF = null;
  function incarcaLeaflet() {
    if (LEAF) return LEAF;
    var cdn = "https://cdnjs.cloudflare.com/ajax/libs/";
    function css(u) { var l = document.createElement("link"); l.rel = "stylesheet"; l.href = u; document.head.appendChild(l); }
    function js(u) { return new Promise(function (ok, nu) { var s = document.createElement("script"); s.src = u; s.onload = ok; s.onerror = nu; document.head.appendChild(s); }); }
    css(cdn + "leaflet/1.9.4/leaflet.min.css"); css(cdn + "leaflet.markercluster/1.5.3/MarkerCluster.min.css"); css(cdn + "leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css");
    LEAF = js(cdn + "leaflet/1.9.4/leaflet.min.js").then(function () { return js(cdn + "leaflet.markercluster/1.5.3/leaflet.markercluster.min.js"); });
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
      '<select id="m-a" aria-label="Anul"><option value="">Toți anii</option>' + aniK.map(function (a, i) { return "<option" + (i === 0 ? " selected" : "") + ">" + a + "</option>"; }).join("") + "</select>" +
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
      var grup = Lf.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 40 });
      m.addLayer(grup);
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
          return (!t || x.t === t) && (!an || (x.a.data || "").slice(0, 4) === an) && (!c || (x.a.categorie || "Altele") === c) &&
            (!q || norm([x.a.strada, x.a.adresa, x.a.scop, x.a.pj ? x.a.solicitant : "", x.a.nr].join(" ")).indexOf(q) >= 0);
        });
        var pe = sel.filter(function (x) { return x.a.lat; });
        grup.clearLayers();
        grup.addLayers(pe.map(function (x) {
          var aprox = x.a.precizie === "stradă";
          return Lf.circleMarker([x.a.lat, x.a.lon], { radius: 7, weight: 1.5, color: "#fff", fillColor: aprox ? cul.ap : cul[x.t], fillOpacity: aprox ? 0.75 : 0.95 }).bindPopup(popup(x));
        }));
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
      var h = '<section class="card section"><h2>Voturi extrase din procesele-verbale (intern, în verificare)</h2><p class="note">Extrase automat din textul recunoscut (OCR). Formularea proceselor-verbale variază, deci cifrele trebuie verificate pe documente înainte de a fi publicate. Fiecare vot are fragmentul de text din care a fost extras.</p>' +
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
          var u = safeUrl(x.pdf);
          return '<div class="doc"><div class="h"><span class="id">Ședința ' + esc(TIP[x.tip] || x.tip || "") + " din " + esc(zi(x.data)) + "</span><span class=\"tag\">" + x.voturi.length + " voturi" + (x.prezenti ? ", " + x.prezenti + " prezenți" : "") + "</span>" +
            (u ? '<a href="' + esc(u) + '" rel="noopener">PDF</a>' : "") + "</div>" +
            ((x.absenti || []).length ? '<div class="m"><span>Absenți: ' + x.absenti.map(function (n) { return linkCons(V, n); }).join(", ") + (x.in_functie ? " (prezenți " + x.prezenti + " din " + x.in_functie + ")" : "") + "</span></div>" : "") +
            x.voturi.map(function (v) {
              return '<div class="m" style="display:block;margin-top:6px"><strong>' + (v.punct ? "Punctul " + v.punct + ": " : "") + "</strong>" + esc((v.titlu || "proiect neidentificat").slice(0, 200)) +
                (v.hcl ? " " + linkHcl(v.hcl) : "") + "<br>" +
                votHtml(v) +
                ' <details class="more-t"><summary>textul</summary><span class="muted">' + esc(v.fragment) + "</span></details></div>";
            }).join("") + "</div>";
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
  function pctPrez(st) { var t = st.prezent + st.absent; return t ? Math.round(100 * st.prezent / t) + "%" : "-"; }
  function linkCons(V, nume) {   // numele unui consilier din PV, cu link la profil (dacă îl recunoaștem)
    var k = norm(nume).replace(/-/g, " ").split(/\s+/).filter(function (w) { return w.length > 1; }).sort().join(" ");
    var c = (V.consilieri || []).filter(function (x) { return x.id.replace(/-/g, " ") === k; })[0];
    return c ? '<a href="#consiliu/consilieri/' + encodeURIComponent(c.id) + '">' + esc(nume) + "</a>" : esc(nume);
  }
  function consilieri(el, r) {
    el.innerHTML = head("Consiliul Local", "Consilierii locali: prezența la ședințe și cum au votat, din procesele-verbale.", r) + '<p class="updated">Se încarcă...</p>';
    voturiIntern2(function (V) {
      var C = V.consilieri || [], M = mandateDin(V);
      if (!C.length) { el.innerHTML = head("Consiliul Local", "", r) + '<section class="card section"><p>Profilurile apar după următoarea colectare.</p></section>'; return; }
      var ales = (r.q || {}).m || (M.length ? M[M.length - 1][0] : "");
      var mm = M.filter(function (x) { return x[0] === ales; })[0] || ["", "0000", "9999"];
      var rows = C.map(function (c) { return { c: c, s: statCons(c, mm[1], mm[2]) }; }).filter(function (o) { return o.s.sedinte; });
      var ord = (r.q || {}).o || "nume";
      var cheie = { nume: function (o) { return o.c.nume; }, absente: function (o) { return -o.s.absent; }, imp: function (o) { return -(o.s.I + o.s.A); }, prez: function (o) { var t = o.s.prezent + o.s.absent; return t ? o.s.prezent / t : 2; } }[ord] || function (o) { return o.c.nume; };
      rows.sort(function (a, b) { var x = cheie(a), y = cheie(b); return x < y ? -1 : x > y ? 1 : a.c.nume.localeCompare(b.c.nume); });
      var tAbs = rows.reduce(function (a, o) { return a + o.s.absent; }, 0), tImp = rows.reduce(function (a, o) { return a + o.s.I; }, 0), tAbt = rows.reduce(function (a, o) { return a + o.s.A; }, 0);
      var th = function (k, t) { return '<th class="n"><a href="#consiliu/consilieri?m=' + encodeURIComponent(ales) + "&o=" + k + '">' + t + (ord === k ? " ▾" : "") + "</a></th>"; };
      el.innerHTML = head("Consiliul Local", "Consilierii locali: prezența la ședințe și cum au votat, din procesele-verbale (intern, în verificare).", r) +
        '<div class="card section sx-bar"><div class="filters"><label class="lbl-s">Mandatul <select id="c-m">' + M.slice().reverse().map(function (x) { return "<option" + (x[0] === ales ? " selected" : "") + ">" + esc(x[0]) + "</option>"; }).join("") + "</select></label></div></div>" +
        '<div class="grid">' + tile("Consilieri găsiți în procesele-verbale", nr(rows.length), "", "în mandatul " + esc(ales)) + tile("Absențe", nr(tAbs), "", "în total, numite în procesele-verbale") +
        tile("Voturi împotrivă", nr(tImp), "", "date de consilieri numiți") + tile("Abțineri", nr(tAbt), "", "ale consilierilor numiți") + "</div>" +
        '<section class="card section"><h2>Consilierii</h2><p class="note">Lista e reconstruită din procesele-verbale (președinții de ședință, absenții, cei prezenți online și cei care au votat împotrivă, s-au abținut sau nu au votat) și din hotărârile despre mandate: validări și încetări de mandat. ' +
        "Începutul fiecărei legislaturi e prima hotărâre de organizare a noului consiliu (comisii de specialitate, viceprimar) de după alegeri. " +
        "Procesele-verbale numesc doar consilierii care nu au votat „pentru”; votul „pentru” al fiecăruia îl deducem doar când știm sigur cine era în sală. Cifrele se verifică pe documente înainte de publicare.</p>" +
        '<div class="tw"><table><thead><tr>' + th("nume", "Consilier") + "<th>Perioada</th>" + th("prez", "Prezență") + th("absente", "Absențe") + th("imp", "Împotrivă / abțineri") + '<th class="n">Nu a votat</th><th class="n">Pentru (dedus)</th><th class="n">Necunoscut</th></tr></thead><tbody>' +
        rows.map(function (o) {
          var s = o.s, p = o.c.perioade.filter(function (x) { return x[1] >= mm[1] && x[0] < mm[2]; });
          var evs = (o.c.evenimente || []).filter(function (e) { return e.data >= mm[1] && e.data < mm[2]; });
          return '<tr><td><a href="#consiliu/consilieri/' + encodeURIComponent(o.c.id) + '"><strong>' + esc(o.c.nume) + "</strong></a>" +
            evs.map(function (e) { return ' <span class="tag">' + (e.fel === "validare" ? "validat " : "mandat încetat ") + esc(zi(e.data)) + "</span>"; }).join("") + "</td><td class=\"nw\">" + p.map(function (x) { return esc(zi(x[0])) + " - " + esc(zi(x[1])); }).join("<br>") +
            '</td><td class="n">' + pctPrez(s) + '</td><td class="n">' + nr(s.absent) + '</td><td class="n">' + nr(s.I) + " / " + nr(s.A) + '</td><td class="n">' + nr(s.N) + '</td><td class="n">' + nr(s.P) + '</td><td class="n">' + nr(s["?"]) + "</td></tr>";
        }).join("") + "</tbody></table></div></section>" +
        '<section class="card section"><h2>Absențe, pe consilieri</h2>' + hbl(rows.slice().sort(function (a, b) { return b.s.absent - a.s.absent; }).filter(function (o) { return o.s.absent; }).slice(0, 25).map(function (o) {
          return { l: o.c.nume, v: o.s.absent, href: "#consiliu/consilieri/" + encodeURIComponent(o.c.id) }; }), nr, tAbs) + "</section>";
      $("c-m").addEventListener("change", function () { location.hash = "#consiliu/consilieri?m=" + encodeURIComponent(this.value) + "&o=" + ord; });
    });
  }
  function consilierProfil(el, r, id) {
    el.innerHTML = head("Consilier local", "", r) + '<p class="updated">Se încarcă...</p>';
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
      el.innerHTML = head(c.nume, "Consilier local" + (c.mandate.length ? (c.mandate.length === 1 ? ", mandatul " : ", mandatele ") + c.mandate.join(", ") : "") + ". În consiliu: " + c.perioade.map(function (p) { return zi(p[0]) + " - " + zi(p[1]); }).join("; ") + ".", r) + inapoi +
        ((c.evenimente || []).length ? '<p class="note">' + c.evenimente.map(function (e) { return e.hcl ? (e.fel === "validare" ? "Mandat validat" : "Mandat încetat") + " prin " + linkHcl(e.hcl) + " din " + esc(zi(e.data)) : (e.fel === "validare" ? "A depus jurământul în " : "Mandat încetat în ") + linkSed(e.data, null); }).join(" · ") + ".</p>" : "") +
        '<div class="grid">' + tile("Prezență", pctPrez(st), "", nr(st.prezent) + " ședințe prezent, " + nr(st.absent) + " absent" + (st.necunoscut ? ", " + nr(st.necunoscut) + " necunoscut" : "")) +
        tile("Voturi împotrivă", nr(st.I), "", "") + tile("Abțineri", nr(st.A), "", "") + tile("Nu a votat", nr(st.N), "", "conflict de interese sau a ieșit din sală") + "</div>" +
        '<section class="card section"><h2>Pe ani</h2><p class="note">„Pentru (dedus)” e votul unui consilier prezent care nu e numit printre cei care au votat altfel; îl socotim doar în ședințele în care știm sigur cine a fost în sală.</p>' +
        '<div class="tw"><table><thead><tr><th>An</th><th class="n">Ședințe</th><th class="n">Absent</th><th class="n">Împotrivă</th><th class="n">Abțineri</th><th class="n">Nu a votat</th><th class="n">Pentru (dedus)</th></tr></thead><tbody>' +
        Object.keys(ani).sort().reverse().map(function (a) { var x = ani[a]; return "<tr><td>" + a + '</td><td class="n">' + x.s + '</td><td class="n">' + x.X + '</td><td class="n">' + x.I + '</td><td class="n">' + x.A + '</td><td class="n">' + x.N + '</td><td class="n">' + x.P + "</td></tr>"; }).join("") +
        "</tbody></table></div></section>" +
        (altfel.length ? '<section class="card section"><h2>Când a votat altfel decât „pentru”</h2>' + altfel.slice(0, 60).map(vItem).join("") + (altfel.length > 60 ? '<p class="note">Și încă ' + (altfel.length - 60) + "; toate sunt mai jos.</p>" : "") + "</section>" : "") +
        (abs.length ? '<section class="card section"><h2>Absențe</h2><div class="lnks">' + abs.map(function (s) { return linkSed(s.data, s.tip); }).join("") + "</div></section>" : "") +
        '<section class="card section"><h2>Toate voturile</h2><div id="cp-l"></div></section>';
      lista($("cp-l"), voturi, { placeholder: "Caută în titlurile proiectelor (ex. buget, teren, taxe)", unitate: ["vot", "voturi"],
        an: function (x) { return x.d.slice(0, 4); }, text: function (x) { return (x.v.titlu || "") + (x.v.hcl ? " hcl " + x.v.hcl.nr + "/" + x.v.hcl.an : ""); },
        extraFilter: { html: '<select aria-label="Votul"><option value="">Orice vot</option>' + Object.keys(VCOD).map(function (k) { return '<option value="' + k + '">' + VCOD[k][2] + "</option>"; }).join("") + "</select>", test: function (x, e) { return x.c === e; } },
        item: vItem });
    });
  }

  // ---------- Pagini de detaliu: o hotărâre, o ședință ----------
  function linkHcl(x) { return '<a href="#consiliu/hcl/' + x.an + "/" + x.nr + '">HCL ' + x.nr + "/" + x.an + "</a>"; }
  function linkSed(data, tip) { return '<a href="#consiliu/sedinte/' + esc(data) + '">Ședința ' + esc(TIP[tip] || "") + " din " + esc(zi(data)) + "</a>"; }
  function zileIntre(a, b) { return Math.round((new Date(b) - new Date(a)) / 864e5); }
  function cuvinte(t) { var o = {}; (norm(t).match(/[a-z]{5,}/g) || []).forEach(function (w) { if (!/^(privind|pentru|aprobarea|hotarare|municipiului|radauti|local|consiliul|proiect)/.test(w)) o[w] = 1; }); return o; }
  function asemanare(a, b) { var A = cuvinte(a), B = cuvinte(b), c = 0, n = 0, k; for (k in A) { n++; if (B[k]) c++; } for (k in B) if (!A[k]) n++; return n ? c / n : 0; }
  var VOT = undefined;
  function voturiIntern2(cb) {
    if (!INTERN) return;
    if (VOT !== undefined) { if (VOT) cb(VOT); return; }
    get(DATA + "voturi.json").then(function (d) { VOT = d; cb(d); }).catch(function () { VOT = null; });
  }
  function votHtml(v) {
    return (v.unanimitate ? "unanimitate" : "pentru " + (v.pentru == null ? "?" : v.pentru) + ", împotrivă " + v.impotriva + ", abțineri " + v.abtineri + (v.nu_voteaza ? ", nu votează " + v.nu_voteaza : "")) +
      (v.rezultat ? " · " + esc(v.rezultat) : "") + (v.nume_impotriva.length ? " · împotrivă: " + esc(v.nume_impotriva.join(", ")) : "") + (v.nume_abtineri.length ? " · abțineri: " + esc(v.nume_abtineri.join(", ")) : "") +
      ((v.nume_nu_voteaza || []).length ? " · nu au votat: " + esc(v.nume_nu_voteaza.join(", ")) : "") + (v.consistent === false ? ' <span class="tag">cifre de verificat</span>' : "");
  }

  function hclDetaliu(el, r, an, nr) {
    var H = L.hcl || [], x = H.filter(function (h) { return String(h.an) === an && String(h.nr) === nr; })[0];
    var inapoi = '<p class="back"><a href="#consiliu/hcl">← Toate hotărârile</a></p>';
    if (!x) { el.innerHTML = head("Consiliul Local", "", r) + inapoi + '<section class="card section"><p class="empty">Hotărârea ' + esc(nr) + "/" + esc(an) + " nu apare în listele publicate de primărie.</p></section>"; return; }
    var sed = (L.pv || []).filter(function (p) { return p.data === x.data; })[0];
    // hotărâri care o menționează în titlu (o modifică, o completează, o abrogă)
    var rx = new RegExp("\\bnr\\.?\\s*" + nr + "\\s*(/|din)\\s*(\\d{1,2}[./]\\d{1,2}[./])?\\s*" + an + "\\b");
    var ment = H.filter(function (h) { return h !== x && +h.an >= +an && rx.test(norm(h.titlu)); });
    var aceeasi = x.data ? H.filter(function (h) { return h !== x && h.data === x.data; }) : [];
    var proiect = (L.proiecte || []).map(function (p) { return { p: p, s: asemanare(p.titlu, x.titlu) }; }).filter(function (o) { return o.s >= 0.5 && (!x.data || (o.p.postat || "") <= x.data); }).sort(function (a, b) { return b.s - a.s; })[0];
    var rows = [["Adoptată", x.data ? esc(zi(x.data)) : "-"], ["Ședința", sed ? linkSed(sed.data, sed.tip) : (x.data ? (INTERN ? "procesul-verbal din " + esc(zi(x.data)) + " nu e publicat" : "ședința din " + esc(zi(x.data))) : "-")],
      ["Publicată pe site", x.postat ? esc(zi(x.postat)) + (x.data ? " (după " + zileIntre(x.data, x.postat) + " zile)" : "") : (x.sursa === "arhiva" ? "în arhiva site-ului vechi" : "-")],
      ["Documentul", '<span class="lnks">' + (linkuri(x) || "nepublicat") + "</span>"]];
    if (proiect && INTERN) rows.push(["Proiectul de hotărâre", '<a href="' + esc(safeUrl(proiect.p.pdf) || safeUrl(proiect.p.pagina) || "#") + '" rel="noopener">' + esc(proiect.p.titlu) + "</a>" + (proiect.p.postat ? " (publicat " + esc(zi(proiect.p.postat)) + ")" : "")]);
    var h = head("HCL " + x.nr + "/" + x.an, esc(x.titlu), r) + inapoi +
      '<section class="card section"><div class="tw"><table><tbody>' + rows.map(function (p) { return "<tr><th>" + p[0] + "</th><td>" + p[1] + "</td></tr>"; }).join("") + "</tbody></table></div></section>" +
      '<div id="hd-vot"></div>' +
      (ment.length ? '<section class="card section"><h2>Hotărâri care o menționează</h2><p class="note">Hotărâri ulterioare care o modifică, o completează sau o abrogă, după titlu.</p>' +
        ment.map(function (h) { return doc(linkHcl(h), h.titlu, h.data ? "adoptată " + zi(h.data) : "", h); }).join("") + "</section>" : "") +
      '<div id="hd-lit"></div>' +
      (aceeasi.length ? '<section class="card section"><h2>Adoptate în aceeași ședință</h2>' + aceeasi.map(function (h) { return doc(linkHcl(h), h.titlu, "", h); }).join("") + "</section>" : "");
    el.innerHTML = h;
    voturiIntern2(function (V) {
      var gas = [];
      (V.sedinte || []).forEach(function (s) { (s.voturi || []).forEach(function (v) { if (v.hcl && String(v.hcl.an) === an && String(v.hcl.nr) === nr) gas.push(v); }); });
      if (gas.length && $("hd-vot")) $("hd-vot").innerHTML = '<section class="card section"><h2>Votul (intern, în verificare)</h2>' + gas.map(function (v) { return '<p class="note">' + votHtml(v) + "</p>"; }).join("") + "</section>";
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
    var h = head("Ședința " + (TIP[tip] || "") + " din " + zi(data), "Consiliul Local al Municipiului Rădăuți.", r) +
      '<p class="back"><a href="#consiliu/sedinte">← Toate ședințele</a>' + (prev ? ' · <a href="#consiliu/sedinte/' + prev + '">ședința anterioară</a>' : "") + (next ? ' · <a href="#consiliu/sedinte/' + next + '">ședința următoare</a>' : "") + "</p>" +
      '<div class="grid">' + tile("Hotărâri adoptate", nr(H.length), "", H.length ? "HCL " + H[0].nr + (H.length > 1 ? " - " + H[H.length - 1].nr : "") + "/" + data.slice(0, 4) : "nicio hotărâre cu această dată în listele publicate") +
      tile("Procesul-verbal", P.length ? "publicat" : "lipsește", "", P[0] && P[0].postat ? "postat " + zi(P[0].postat) + " (după " + zileIntre(data, P[0].postat) + " zile)" : "") + "</div>" +
      (P.length ? '<section class="card section"><h2>Procesul-verbal</h2>' + P.map(function (p) { return doc(esc(TIP[p.tip] || "Ședință"), p.titlu, p.postat ? "postat " + zi(p.postat) : "", p); }).join("") + "</section>" : "") +
      '<div id="sd-vot"></div>' +
      '<section class="card section"><h2>Hotărârile adoptate</h2>' + (H.map(function (x) { return doc(linkHcl(x), x.titlu, x.postat ? "postată " + zi(x.postat) : "", x); }).join("") || '<p class="empty">Nicio hotărâre cu această dată în listele publicate.</p>') + "</section>";
    el.innerHTML = h;
    voturiIntern2(function (V) {
      var s = (V.sedinte || []).filter(function (x) { return x.data === data; })[0];
      if (s && s.voturi.length && $("sd-vot")) $("sd-vot").innerHTML = '<section class="card section"><h2>Voturile (intern, în verificare)</h2>' +
        ((s.absenti || []).length ? '<p class="note">Prezenți ' + s.prezenti + (s.in_functie ? " din " + s.in_functie : "") + ". Absenți: " + s.absenti.map(function (n) { return linkCons(V, n); }).join(", ") + ".</p>" : "") +
        (s.presedinte ? '<p class="note">Președinte de ședință: ' + linkCons(V, s.presedinte) + ".</p>" : "") + s.voturi.map(function (v) {
        return '<div class="m" style="display:block;margin:6px 0"><strong>' + (v.punct ? "Punctul " + v.punct + ": " : "") + "</strong>" + esc((v.titlu || "proiect neidentificat").slice(0, 200)) +
          (v.hcl ? " " + linkHcl(v.hcl) : "") + "<br>" + votHtml(v) + "</div>"; }).join("") + "</section>";
    });
  }

  // ---------- Căutare în tot monitorul ----------
  function cauta(el, r) {
    var q0 = (r.q || {}).q || "";
    el.innerHTML = head("Caută în monitor", INTERN ? "Hotărâri, proiecte, ședințe, contracte, certificate și autorizații, achiziții publice, furnizori și litigii, într-un singur loc." :
      "În hotărârile Consiliului Local, în certificatele și autorizațiile de construire și în achizițiile publice din SICAP: după cuvinte, stradă, număr de hotărâre, firmă sau CUI.") +
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
        function (x) { return sxItem(x, true); }, "#achizitii/sicap?q=" + encodeURIComponent(q));
    }
    if (LIT) grupa("Litigii", (LIT.dosare || []).filter(function (d) { return ok([d.numar, d.obiect, d.grup].concat((d.adverse || []).map(function (p) { return p.nume; })).join(" ")); }), function (d) {
      return '<div class="doc"><div class="h"><span class="id"><a href="#litigii/dosare?v=fise&q=' + encodeURIComponent(d.numar) + '">' + esc(d.numar) + "</a></span>" + rzTag(d) + '<span class="muted">' + esc(zi(d.data)) + '</span></div><div class="t">' + esc(d.obiect || "") + "</div></div>";
    }, "#litigii/dosare?v=fise&q=" + encodeURIComponent(q));
    if (INTERN) grupe.push('<section class="card section"><h2>În textul documentelor</h2><div id="c-ft"></div><p class="note"><a href="#texte?q=' + encodeURIComponent(q) + '">Caută doar în text, cu filtru pe felul documentului</a></p></section>');
    var lipsa = [];
    if (!URB) lipsa.push(get(DATA + "urbanism.json").then(function (d) { URB = URB || d; }).catch(function () { URB = URB || { cu: [], ac: [] }; }));
    if (SX === null) lipsa.push(get(DATA + "sicap-explorer.json").then(function (d) { SX = SX || sxPrep(d); }).catch(function () { SX = SX || false; }));
    if (!LIT && INTERN) lipsa.push(get(DATA + "litigii.json").then(function (d) { LIT = LIT || d; }).catch(function () { LIT = LIT || { dosare: [], noutati: [] }; }));
    el.innerHTML = (grupe.join("") || (lipsa.length ? "" : '<p class="empty">Nimic găsit pentru „' + esc(q) + "”.</p>")) + (lipsa.length ? '<p class="updated">' + (INTERN ? "Se încarcă și urbanismul, achizițiile și litigiile..." : "Se încarcă și urbanismul și achizițiile publice...") + "</p>" : "");
    if (INTERN && $("c-ft")) ftBox($("c-ft"), { q: q, cate: 8, ascuns: true });
    if (lipsa.length) Promise.all(lipsa).then(function () { if ($("c-q") && $("c-q").value.trim() === q) cautaRez(el, q); });
  }

  function texte(el) {
    var items = Object.keys(WORD).map(function (u) { return { pdf: u, word: WORD[u], sursa: WORD[u].split("/")[0], titlu: WORD[u].split("/").slice(1).join("/").replace(/\.docx$/, "") }; });
    var surse = {}; items.forEach(function (x) { surse[x.sursa] = (surse[x.sursa] || 0) + 1; });
    el.innerHTML = head("Toate textele (intern)", "Textul extras din fiecare document descărcat, ca document Word. Poate conține erori de recunoaștere și date personale: nu se distribuie public.") +
      '<section class="card section"><h2>Caută în textul tuturor documentelor</h2><div id="ft-all"></div></section>' +
      '<section class="card section"><h2>Documentele, după nume</h2><div id="lst"></div></section>';
    ftBox($("ft-all"), { q: (route().q || {}).q || "", onQuery: function (q) { history.replaceState(null, "", "#texte" + (q ? "?q=" + encodeURIComponent(q) : "")); } });
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
    else if (id === "consiliu") {
      if (r.sub === "hcl" && r.rest.length >= 2) hclDetaliu(el, r, r.rest[0], r.rest[1]);
      else if (r.sub === "sedinte" && r.rest[0]) sedintaDetaliu(el, r, r.rest[0]);
      else if (r.sub === "consilieri" && INTERN) { if (r.rest[0]) consilierProfil(el, r, decodeURIComponent(r.rest[0])); else consilieri(el, r); }
      else (r.sub === "sedinte" ? sedinte : r.sub === "proiecte" ? proiecte : hcl)(el, r);
    }
    else if (id === "cauta") cauta(el, r);
    else if (id === "litigii" && INTERN) litigii(el, r);
    else if (id === "primarie") {
      if (r.sub === "buget") buget(el, r);
      else if ((r.rest[0] || "cu") === "harta" && INTERN) harta(el, r);
      else registru(el, r, r.rest[0] === "ac" ? "ac" : "cu");
    }
    else if (id === "achizitii") (r.sub === "sicap" ? sicap : contracte)(el, r);
    else if (id === "texte") texte(el);
    else if (id === "arhiva") arhivaIntern(el, r);
    if (id === "acasa") { arhivaCard(); litNewsCard(); }
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
  window.addEventListener("hashchange", function () {
    var p = route().path; render();
    if (p !== ultimaPagina) window.scrollTo(0, 0);   // doar filtrele s-au schimbat: rămânem unde eram
    ultimaPagina = p;
  });
})();
