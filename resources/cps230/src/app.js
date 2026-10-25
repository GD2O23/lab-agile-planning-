(function () {
  "use strict";

  var DATA = window.CPS230_DATA || { paragraphs: [], glossary: [], sources: [], synonyms: {}, built: "" };
  var paragraphs = DATA.paragraphs;
  var sourceById = {};
  DATA.sources.forEach(function (s) { sourceById[s.id] = s; });

  // Browser storage can be blocked; the app must still work without it.
  function load(key, fallback) {
    try { var v = localStorage.getItem("cps230." + key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem("cps230." + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // ---- Context (entity type and SFI) ----
  var ctx = load("context", { entity: "", sfi: "" });
  $("entity").value = ctx.entity;
  $("sfi").value = ctx.sfi;
  function onContext() {
    ctx = { entity: $("entity").value, sfi: $("sfi").value };
    save("context", ctx);
    runSearch();
    renderReader();
  }
  $("entity").addEventListener("change", onContext);
  $("sfi").addEventListener("change", onContext);

  function appliesToContext(p) {
    if (ctx.entity && p.entities && p.entities.length && p.entities.indexOf(ctx.entity) < 0) return false;
    if (ctx.sfi === "non-SFI" && p.sfiOnly) return false;
    return true;
  }

  // ---- Connection status ----
  function updateNet() {
    $("net").textContent = navigator.onLine ? "Online: source links available" : "Offline: using bundled text";
  }
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
  updateNet();

  // ---- Citation helpers ----
  function citation(p) {
    var name = p.source === "CPG230" ? "CPG 230" : "CPS 230";
    return name + ", para " + p.para;
  }
  function sourceLink(p) {
    var s = sourceById[p.source];
    return s && s.links && s.links[0] ? s.links[0].url : "";
  }
  function citeHtml(p) {
    var url = sourceLink(p);
    return '<div class="cite"><strong>' + esc(citation(p)) + "</strong>" +
      (p.heading && p.heading.length ? "<span>" + esc(p.heading.join(" › ")) + "</span>" : "") +
      (p.strength ? '<span class="tag ' + esc(p.strength) + '">' + esc(p.strength) + "</span>" : "") +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">Official source</a>' : "") +
      '<button class="linkbtn" data-copy="' + esc(citation(p)) + '">Copy citation</button>' +
      '<button class="linkbtn" data-open="' + esc(p.id) + '">Open in context</button></div>';
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.dataset.copy) {
      if (navigator.clipboard) navigator.clipboard.writeText(t.dataset.copy + ". Source: APRA").catch(function () {});
      t.textContent = "Copied";
      setTimeout(function () { t.textContent = "Copy citation"; }, 1500);
    } else if (t.dataset.open) {
      showTab("read");
      focusPara(t.dataset.open);
    } else if (t.dataset.tab) {
      showTab(t.dataset.tab);
    }
  });

  // ---- Tabs ----
  function showTab(name) {
    document.querySelectorAll(".tabs button").forEach(function (b) {
      b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false");
    });
    document.querySelectorAll(".panel").forEach(function (p) { p.hidden = p.id !== "tab-" + name; });
    save("tab", name);
  }

  // ---- Search ----
  function expandQuery(q) {
    var lower = q.toLowerCase().trim();
    var terms = lower.split(/\s+/).filter(Boolean);
    var extra = [];
    Object.keys(DATA.synonyms).forEach(function (k) {
      if (k.charAt(0) === "_") return;
      if (lower === k || terms.indexOf(k) >= 0 || (k.indexOf(" ") > 0 && lower.indexOf(k) >= 0)) {
        extra = extra.concat(DATA.synonyms[k]);
      }
    });
    return { terms: terms, synonyms: extra };
  }

  function score(p, q) {
    var hay = (p.text + " " + (p.heading || []).join(" ")).toLowerCase();
    var s = 0;
    var all = true;
    q.terms.forEach(function (t) {
      var n = hay.split(t).length - 1;
      if (!n) all = false;
      s += n * 2;
    });
    if (!all) s = 0;
    q.synonyms.forEach(function (t) { if (hay.indexOf(t.toLowerCase()) >= 0) s += 3; });
    if (q.terms.length > 1 && hay.indexOf(q.terms.join(" ")) >= 0) s += 5;
    return s;
  }

  function highlight(text, words) {
    var safe = esc(text);
    words = words.filter(function (w) { return w.length > 1; }).sort(function (a, b) { return b.length - a.length; });
    if (!words.length) return safe;
    var re = new RegExp("(" + words.map(function (w) { return escRe(esc(w)); }).join("|") + ")", "gi");
    return safe.replace(re, "<mark>$1</mark>");
  }

  function search(qText, filters) {
    var q = expandQuery(qText);
    if (!q.terms.length) return { q: q, hits: [] };
    var hits = paragraphs.filter(function (p) {
      if (filters.source && p.source !== filters.source) return false;
      if (filters.strength && p.strength !== filters.strength) return false;
      return appliesToContext(p);
    }).map(function (p) { return { p: p, s: score(p, q) }; })
      .filter(function (h) { return h.s > 0; })
      .sort(function (a, b) { return b.s - a.s; });
    return { q: q, hits: hits };
  }

  function runSearch() {
    var qText = $("q").value;
    var r = search(qText, { source: $("f-source").value, strength: $("f-strength").value });
    $("expanded").textContent = r.q.synonyms.length ? "Also searching: " + r.q.synonyms.join(", ") : "";
    if (!paragraphs.length) {
      $("results").innerHTML = '<li class="empty">The official CPS 230 and CPG 230 text has not been loaded into this build yet.</li>';
      return;
    }
    if (!r.q.terms.length) { $("results").innerHTML = ""; return; }
    if (!r.hits.length) { $("results").innerHTML = '<li class="empty">No matches. Try a different word.</li>'; return; }
    var words = r.q.terms.concat(r.q.synonyms);
    $("results").innerHTML = r.hits.slice(0, 100).map(function (h) {
      return "<li>" + citeHtml(h.p) + "<div>" + highlight(h.p.text, words) + "</div></li>";
    }).join("");
  }
  var timer;
  $("q").addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(runSearch, 80); });
  $("f-source").addEventListener("change", runSearch);
  $("f-strength").addEventListener("change", runSearch);

  // ---- Reader ----
  function renderReader() {
    if (!paragraphs.length) {
      $("reader").innerHTML = '<p class="empty">The official text has not been loaded into this build yet.</p>';
      $("toc").innerHTML = "";
      return;
    }
    var seen = {};
    $("toc").innerHTML = paragraphs.filter(function (p) {
      var key = p.source + "|" + (p.heading || [])[0];
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).map(function (p) {
      return '<button data-open="' + esc(p.id) + '">' + esc((p.source === "CPG230" ? "CPG 230: " : "CPS 230: ") + ((p.heading || [])[0] || "Paragraph " + p.para)) + "</button>";
    }).join("");
    $("reader").innerHTML = paragraphs.filter(appliesToContext).map(function (p) {
      return '<div class="para" id="p-' + esc(p.id) + '">' + citeHtml(p) + "<div>" + esc(p.text) + "</div></div>";
    }).join("");
  }
  function focusPara(id) {
    document.querySelectorAll(".para.focus").forEach(function (el) { el.classList.remove("focus"); });
    var el = $("p-" + id);
    if (el) { el.classList.add("focus"); el.scrollIntoView({ block: "center" }); }
  }

  // ---- Glossary ----
  function renderGlossary() {
    $("glossary").innerHTML = DATA.glossary.length
      ? DATA.glossary.map(function (g) {
          return "<dt>" + esc(g.term) + "</dt><dd>" + esc(g.definition) +
            (g.para ? ' <span class="cite">(' + esc(g.source === "CPG230" ? "CPG 230" : "CPS 230") + ", para " + esc(g.para) + ")</span>" : "") + "</dd>";
        }).join("")
      : '<p class="empty">Glossary arrives with the official text.</p>';
  }

  // ---- Sources ----
  function renderSources() {
    $("sources").innerHTML = DATA.sources.map(function (s) {
      return '<div class="source-card"><strong>' + esc(s.title) + "</strong><br>" +
        esc(s.publisher) + " · " + esc(s.type) +
        (s.version ? " · Version: " + esc(s.version) : "") +
        (s.effective ? " · Effective: " + esc(s.effective) : "") +
        "<ul>" + s.links.map(function (l) {
          return '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + "</a> <code>" + esc(l.url) + "</code></li>";
        }).join("") + "</ul>" +
        (s.verified ? "" : '<div class="warn">Link and version not yet checked against APRA.</div>') +
        "</div>";
    }).join("");
  }

  $("stamp").textContent = "Build " + (DATA.built || "dev") + " · " +
    DATA.sources.filter(function (s) { return s.id !== "APRA-ORM"; }).map(function (s) {
      return s.id.replace(/(\D+)(\d+)/, "$1 $2") + " " + (s.version || "");
    }).join(" · ");

  renderSources();
  renderGlossary();
  renderReader();
  runSearch();
  showTab(load("tab", "search"));

  window.CPS230 = { search: search, expandQuery: expandQuery, setContext: function (c) { ctx = c; } };
})();
