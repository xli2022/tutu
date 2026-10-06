/* ── Spendscape ──────────────────────────────────────────────────────────
   Bank statements in, spending by category over time out.

   Files are read with FileReader and never leave the page. Parsing lives
   in formats.js, categorising in categories.js, the numbers in analysis.js
   and the drawing in charts.js; this file holds the state, wires the page
   together and remembers what the user asked it to.

   Filters, in the order they narrow things down:
     account   one account or all of them (top bar)
     range     the stretch of time every chart covers (presets or brush)
     focus     one category: every chart narrows to it
     period    a month/week/quarter opened from a chart: the details
               section below the divider narrows to it
     day       a day picked on the calendar: the transaction list only
     merchant  a merchant picked from a list: the transaction list only
     search    free text: the transaction list only                      */
(function () {
  "use strict";

  var kit = window.SpendscapeKit;
  var F = kit.formats, C = kit.categories, A = kit.analysis, V = kit.charts;

  var STORE_KEY = "tutu.spendscape.v1";

  // Categorical slots, in the order that passed the colour-vision checks
  // on the card surface. The top eight categories by spend take them; the
  // rest fold into "Everything else" in the stone grey.
  var PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
  var OTHER_COLOR = "#a39e93";
  var LONE_COLOR = "#c3b8ef";
  var FLOW_COLORS = { income: "#8fd4ff", spent: "#ffbe6b", net: "#fff7fb" };
  var SANKEY_COLORS = { source: "#b9aef0", saved: "#9ff08a", deficit: "#ff8a9b" };
  var HEAT = ["#622243", "#8f2e60", "#ba3f7f", "#e05b9e", "#f886bb"];
  var PRESET_MONTHS = { "3m": 3, "6m": 6, "12m": 12 };
  var CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "CHF", "JPY", "INR", "SEK", "NOK", "DKK", "PLN", "CZK", "SGD", "HKD", "MXN", "BRL", "ZAR"];
  var MAX_FILE = 25 * 1024 * 1024;

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  function clear(n) {
    while (n.firstChild) n.removeChild(n.firstChild);
  }

  function hash(s) {
    var h1 = 0x811c9dc5, h2 = 0x9747b28c;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ c, 0x5bd1e995);
      h2 ^= h2 >>> 15;
    }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  }

  function sum(a) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i];
    return s;
  }

  /* ── State ───────────────────────────────────────────────────────── */
  var state = {
    files: [],          // { id, name, format, account, text, rows, mapping, signature, currency, raw, skipped }
    all: [],            // resolved transactions, newest first
    rules: {},          // merchant key -> category, made by the user
    overrides: {},      // transaction id -> category, made by the user
    layouts: {},        // CSV header signature -> column mapping the user fixed
    prefs: { gran: "month", mode: "bars", hidden: {}, currency: "", remember: false, account: "", preset: "" },
    view: {
      range: null, preset: "12m", focus: null, period: null, day: null, merchant: null,
      search: "", sort: { key: "date", dir: -1 }, limit: 50, merchantsAll: false, catsAll: false,
      timelineTable: false, cashflowTable: false
    },
    colorOf: {},
    slots: [],          // categories holding a colour, in slot order
    undo: []
  };

  /* ── Storage ─────────────────────────────────────────────────────── */
  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }

  // Category changes and fixed layouts are always kept (they are small and
  // make the next visit better); the statements themselves only when the
  // user says so.
  function saveNow() {
    var p = state.prefs;
    var data = {
      v: 1,
      rules: state.rules,
      overrides: state.overrides,
      layouts: state.layouts,
      prefs: { gran: p.gran, mode: p.mode, hidden: p.hidden, currency: p.currency, remember: p.remember, preset: p.preset }
    };
    if (p.remember) {
      data.files = state.files.map(function (f) {
        return { name: f.name, text: f.text, account: f.account, mapping: f.format === "csv" || f.format === "tsv" ? f.mapping : null };
      });
    }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) {
      if (!data.files) return;
      p.remember = false;
      $("remember-toggle").checked = false;
      delete data.files;
      data.prefs.remember = false;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e2) { /* storage unavailable */ }
      toast("These statements are too big to keep on this device, so they won't be remembered.");
      renderFoot();
    }
  }

  /* ── Money ───────────────────────────────────────────────────────── */
  var currency = "USD";
  var nfCache = {};

  function nf(opts) {
    var id = currency + JSON.stringify(opts || {});
    if (!nfCache[id]) {
      var o = { style: "currency", currency: currency };
      for (var k in opts) o[k] = opts[k];
      try { nfCache[id] = new Intl.NumberFormat(undefined, o); }
      catch (e) { nfCache[id] = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }); }
    }
    return nfCache[id];
  }

  function money(v) { return nf().format(v); }

  // Whole units once amounts get big: "$1,235" reads faster than "$1,234.56".
  function moneyR(v) {
    return Math.abs(v) >= 100 ? nf({ maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(v) : money(v);
  }

  // Table cells: whole units, so a column of figures lines up.
  function whole(v) {
    return nf({ maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(v);
  }

  function short(v) {
    if (Math.abs(v) < 1000) return nf({ maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(v);
    try {
      return nf({ notation: "compact", maximumFractionDigits: Math.abs(v) < 10000 ? 1 : 0, minimumFractionDigits: 0 }).format(v);
    } catch (e) { return moneyR(v); }
  }

  function signed(v) {
    return (v < 0 ? "−" : "+") + moneyR(Math.abs(v));
  }

  function localeCurrency() {
    var lang = (navigator.language || "en-US").split("-");
    var region = (lang[1] || "").toUpperCase();
    var map = {
      US: "USD", GB: "GBP", UK: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD", IN: "INR", JP: "JPY", CH: "CHF",
      SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", SG: "SGD", HK: "HKD", MX: "MXN", BR: "BRL", ZA: "ZAR"
    };
    if (map[region]) return map[region];
    if (/^(IE|DE|FR|ES|IT|NL|BE|AT|PT|FI|GR|LU|SK|SI|EE|LV|LT|CY|MT|HR)$/.test(region)) return "EUR";
    return "USD";
  }

  function detectedCurrency() {
    var counts = {}, best = null;
    state.files.forEach(function (f) {
      if (f.currency) counts[f.currency] = (counts[f.currency] || 0) + f.raw.length;
    });
    for (var c in counts) if (!best || counts[c] > counts[best]) best = c;
    return best;
  }

  function updateCurrency() {
    var next = state.prefs.currency || detectedCurrency() || localeCurrency();
    if (next !== currency) {
      currency = next;
      nfCache = {};
    }
  }

  /* ── Files in ────────────────────────────────────────────────────── */
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(F.decodeBytes(r.result)); };
      r.onerror = function () { reject(r.error); };
      r.readAsArrayBuffer(file);
    });
  }

  var batch = null;   // { added, problems, dupFiles, queue }

  function startBatch() {
    if (!batch) batch = { added: 0, files: 0, problems: [], dupFiles: 0, queue: [] };
    return batch;
  }

  function importFiles(list) {
    var files = [].slice.call(list || []);
    if (!files.length) return;
    startBatch();
    Promise.all(files.map(function (f) {
      if (f.size > MAX_FILE) return { name: f.name, error: "is too big to read here (25 MB at most)" };
      return readFile(f).then(
        function (text) { return { name: f.name, text: text }; },
        function () { return { name: f.name, error: "couldn't be read" }; }
      );
    })).then(function (items) {
      items.forEach(ingest);
      continueBatch();
    });
  }

  function ingest(item) {
    var b = startBatch();
    if (item.error) { b.problems.push(item.name + " " + item.error + "."); return; }
    var res;
    try {
      res = F.read(item.name, item.text, state.layouts);
    } catch (e) {
      b.problems.push(item.name + " couldn't be read.");
      return;
    }
    if (res.issues.indexOf("unsupported") >= 0) {
      b.problems.push(res.format === "pdf"
        ? item.name + " is a PDF. Download a CSV, OFX or QIF export from your bank instead."
        : item.name + " isn't a format Spendscape can read. Try CSV, OFX, QFX or QIF.");
      return;
    }
    var id = "f" + hash(item.text);
    var known = state.files.some(function (f) { return f.id === id; }) ||
      b.queue.some(function (f) { return f.id === id; });
    if (known) { b.dupFiles++; return; }
    var file = {
      id: id,
      name: item.name,
      format: res.format,
      account: res.account,
      text: item.text,
      rows: res.rows || null,
      mapping: res.mapping || null,
      signature: res.signature || "",
      delimiter: res.delimiter || ",",
      currency: res.currency || null,
      raw: res.txns,
      skipped: res.skipped,
      issues: res.issues
    };
    var tabular = !!file.rows;
    if (!tabular && !res.txns.length) {
      b.problems.push("No transactions were found in " + item.name + ".");
      return;
    }
    // A spreadsheet we are unsure about gets a quick look from the user;
    // one whose layout they fixed before goes straight in.
    if (tabular && res.issues.length && !res.remembered) b.queue.push(file);
    else addFile(file);
  }

  function addFile(file) {
    state.files.push(file);
    batch.added += file.raw.length;
    batch.files++;
  }

  function continueBatch() {
    if (!batch) return;
    if (batch.queue.length) {
      openMapping(batch.queue.shift(), false);
      return;
    }
    var b = batch;
    batch = null;
    var before = state.all.length;
    rebuild();
    if (b.files) {
      if (!before) resetView();
      else clampView();
    }
    render(true);
    var gained = state.all.length - before;
    var msg = [];
    if (b.files) {
      msg.push("Added " + gained.toLocaleString() + " transaction" + (gained === 1 ? "" : "s") + " from " + b.files + " file" + (b.files === 1 ? "" : "s") + ".");
      var skipped = b.added - gained;
      if (skipped > 0) msg.push(skipped.toLocaleString() + " already-imported duplicates were skipped.");
    }
    if (b.dupFiles) msg.push(b.dupFiles === 1 ? "That file is already in." : b.dupFiles + " files were already in.");
    msg = msg.concat(b.problems);
    if (msg.length) toast(msg.join(" "), null, null, b.problems.length ? 8000 : 4200);
  }

  function loadSample() {
    var files = kit.sample.generate(new Date());
    startBatch();
    files.forEach(ingest);
    continueBatch();
  }

  /* Rebuild the resolved transaction list from the files. A transaction's
     id comes from its date, amount and description plus how many times
     that same trio has already appeared in its file, so re-importing an
     overlapping statement adds only what is new, while two identical
     coffees on one day both survive. */
  function rebuild() {
    var seen = {}, out = [];
    state.files.forEach(function (f) {
      var counts = {};
      f.raw.forEach(function (t) {
        var base = t.date + "|" + t.amount.toFixed(2) + "|" + t.desc.replace(/\s+/g, " ").toLowerCase();
        var n = counts[base] = (counts[base] || 0) + 1;
        var id = "t" + hash(base + "#" + n);
        if (seen[id]) return;
        seen[id] = true;
        var c = t._c || (t._c = C.classify(t));
        out.push({
          id: id, file: f.id, account: t.account || f.account,
          date: t.date, amount: t.amount, desc: t.desc, memo: t.memo || "", bankCat: t.bankCat || "",
          merchant: c.merchant, key: c.key, auto: c.cat, source: c.source
        });
      });
    });
    out.sort(function (a, b) { return b.date - a.date || a.amount - b.amount; });
    state.all = out;
    updateCurrency();
    recategorize(false);
    var accounts = accountsOf();
    if (state.prefs.account && accounts.indexOf(state.prefs.account) < 0) state.prefs.account = "";
  }

  // Apply the user's rules and overrides on top of the automatic picks.
  function recategorize(keepColors) {
    state.all.forEach(function (t) {
      var cat = state.overrides[t.id] || state.rules[t.key] || t.auto;
      if (!C.byId[cat]) cat = t.auto;
      t.cat = cat;
      t.kind = C.kindOf(cat);
      t.how = state.overrides[t.id] ? "you" : state.rules[t.key] ? "rule" : t.source;
    });
    assignColors(keepColors);
  }

  /* Colours go to the top eight categories by all-time spend, in slot
     order. After a re-file, categories that keep a colour keep the same
     one, so nothing on screen repaints; a newcomer takes a freed slot. */
  function assignColors(keep) {
    var ranks = A.rankCategories(state.all).slice(0, 8);
    var old = keep ? state.colorOf : {};
    var next = {}, used = {};
    ranks.forEach(function (c) { if (old[c]) { next[c] = old[c]; used[old[c]] = true; } });
    var free = PALETTE.filter(function (p) { return !used[p]; });
    ranks.forEach(function (c) { if (!next[c]) next[c] = free.shift(); });
    state.colorOf = next;
    state.slots = Object.keys(next).sort(function (a, b) { return PALETTE.indexOf(next[a]) - PALETTE.indexOf(next[b]); });
  }

  function colorFor(cat) {
    return state.colorOf[cat] || null;
  }

  function accountsOf() {
    var seen = {}, out = [];
    state.all.forEach(function (t) { if (!seen[t.account]) { seen[t.account] = true; out.push(t.account); } });
    return out.sort();
  }

  function baseTxns() {
    var acct = state.prefs.account;
    return acct ? state.all.filter(function (t) { return t.account === acct; }) : state.all;
  }

  /* ── Ranges ──────────────────────────────────────────────────────── */
  function presetRange(preset, ext) {
    if (!ext) return null;
    var end = F.ymd(ext.to), from;
    if (preset === "all") from = ext.from;
    else if (preset === "ytd") from = F.dayOf(end.y, 1, 1);
    else {
      var k = end.y * 12 + end.m - 1 - ((PRESET_MONTHS[preset] || 12) - 1);
      from = F.dayOf(Math.floor(k / 12), (k % 12) + 1, 1);
    }
    return { from: Math.max(from, ext.from), to: ext.to };
  }

  function resetView() {
    var ext = A.extent(baseTxns());
    var v = state.view;
    var preset = state.prefs.preset || "";
    if (!preset) preset = ext && ext.to - ext.from > 400 ? "12m" : "all";
    v.preset = preset;
    v.range = presetRange(preset, ext);
    v.focus = v.period = v.day = v.merchant = null;
    v.search = "";
    $("tx-search").value = "";
    v.limit = 50;
    if (ext && ext.to - ext.from < 75) state.prefs.gran = "week";
    else if (ext && ext.to - ext.from > 200 && state.prefs.gran === "week") state.prefs.gran = "month";
  }

  // Keep the view sensible after data or the account filter changes.
  function clampView() {
    var ext = A.extent(baseTxns()), v = state.view;
    if (!ext) return;
    if (v.preset !== "custom") v.range = presetRange(v.preset, ext);
    else v.range = { from: Math.max(ext.from, Math.min(v.range.from, ext.to)), to: Math.min(ext.to, Math.max(v.range.to, ext.from)) };
    if (v.range.to < v.range.from) v.range = presetRange("all", ext);
    checkPeriod();
  }

  function checkPeriod() {
    var v = state.view;
    if (v.period && (v.period.gran !== state.prefs.gran ||
        A.endOf(v.period.key, v.period.gran) < v.range.from || A.startOf(v.period.key, v.period.gran) > v.range.to)) {
      v.period = null;
    }
    if (v.day != null && (v.day < v.range.from || v.day > v.range.to)) v.day = null;
  }

  function scopeRange() {
    var v = state.view;
    if (!v.period) return v.range;
    return {
      from: Math.max(v.range.from, A.startOf(v.period.key, v.period.gran)),
      to: Math.min(v.range.to, A.endOf(v.period.key, v.period.gran))
    };
  }

  function focusIsExpense() {
    return !!state.view.focus && C.kindOf(state.view.focus) === "expense";
  }

  function catName(id) {
    if (id === "_other") return "Everything else";
    return C.byId[id] ? C.byId[id].name : id;
  }

  function catIcon(id) {
    return C.byId[id] ? C.byId[id].icon : "";
  }

  function labelsFor(keys, gran) {
    return keys.map(function (k) {
      return { main: A.periodLabel(k, gran), year: gran === "quarter" ? null : String(F.ymd(A.startOf(k, gran)).y) };
    });
  }

  /* ── Rendering ───────────────────────────────────────────────────── */
  var charts = {};

  function render(fresh) {
    var has = state.all.length > 0;
    $("welcome").hidden = has;
    $("dash").hidden = !has;
    $("btn-files").hidden = !state.files.length;
    $("files-count").textContent = String(state.files.length);
    document.querySelector(".files-word").textContent = state.files.length === 1 ? " file" : " files";
    $("btn-files").setAttribute("aria-label", state.files.length + (state.files.length === 1 ? " statement file" : " statement files") + ": manage");
    renderFoot();
    if (!has) { save(); return; }
    if (!state.view.range) resetView();

    var ctx = context();
    renderFilters(ctx);
    renderBrush(ctx);
    renderKpis(ctx);
    renderTimeline(ctx);
    renderCashflow(ctx);
    renderInsights(ctx);
    renderCalendar(ctx, fresh);
    renderScope(ctx);
    renderCategories(ctx);
    renderFlow(ctx, fresh);
    renderMerchants(ctx);
    renderRecurring(ctx);
    renderTransactions();
    save();
  }

  // Everything several sections need, computed once per render.
  function context() {
    var v = state.view, gran = state.prefs.gran;
    var txns = baseTxns();
    var data = A.extent(txns);
    var focus = focusIsExpense() ? v.focus : null;
    var series = A.categorySeries(txns, v.range, gran);
    var keys = series.keys;
    var cov = A.coverage(keys, gran, data);
    var selected = -1;
    if (v.period && v.period.gran === gran) selected = keys.indexOf(v.period.key);
    return {
      txns: txns,
      data: data,
      gran: gran,
      range: v.range,
      scope: scopeRange(),
      focus: focus,
      series: series,
      keys: keys,
      labels: labelsFor(keys, gran),
      titles: keys.map(function (k) { return A.periodLabel(k, gran, true); }),
      partial: cov.map(function (c) { return c < 0.97; }),
      coverage: cov,
      selected: selected,
      kpis: A.kpis(txns, v.range, data)
    };
  }

  function renderFoot() {
    var n = $("foot-memory");
    n.textContent = state.prefs.remember
      ? "You asked this device to remember them; clear that any time from the ⋯ menu."
      : state.all.length ? "Nothing is stored after you close the tab, apart from your category changes." : "";
  }

  /* Filter row */
  function renderFilters(ctx) {
    var v = state.view;
    [].forEach.call($("range-presets").querySelectorAll("button"), function (b) {
      b.setAttribute("aria-checked", b.getAttribute("data-range") === v.preset ? "true" : "false");
    });
    [].forEach.call($("gran").querySelectorAll("button"), function (b) {
      b.setAttribute("aria-checked", b.getAttribute("data-gran") === state.prefs.gran ? "true" : "false");
    });

    var accounts = accountsOf();
    $("account-wrap").hidden = accounts.length < 2;
    var sel = $("account-filter");
    clear(sel);
    var all = el("option", null, sel, "All accounts");
    all.value = "";
    accounts.forEach(function (a) {
      var o = el("option", null, sel, a);
      o.value = a;
    });
    sel.value = state.prefs.account;

    var host = $("active-filters");
    clear(host);
    function chip(text, onClear, label) {
      var b = el("button", "filter-chip", host);
      b.type = "button";
      b.setAttribute("aria-label", "Remove filter: " + (label || text));
      el("span", null, b, text);
      el("span", "x", b, "✕").setAttribute("aria-hidden", "true");
      b.addEventListener("click", onClear);
    }
    if (v.preset === "custom") chip(A.rangeLabel(v.range), function () { setPreset(state.prefs.preset || "12m"); }, "custom range");
    if (v.focus) chip(catIcon(v.focus) + " " + catName(v.focus), function () { setFocus(null); });
    if (v.period) chip(A.periodLabel(v.period.key, v.period.gran, true), function () { setPeriod(null); });
    if (v.day != null) chip(A.formatDay(v.day), function () { setDay(null); });
    if (v.merchant) chip(merchantName(v.merchant), function () { setMerchant(null); });
  }

  function merchantName(key) {
    for (var i = 0; i < state.all.length; i++) if (state.all[i].key === key) return state.all[i].merchant;
    return key;
  }

  /* Brush: weekly spending across the whole history. */
  function renderBrush(ctx) {
    if (!charts.brush) {
      charts.brush = new V.Brush($("brush"), {
        describe: function (r) { return r.from === r.to ? A.formatDay(r.from) : A.rangeLabel(r); },
        onChange: function (r) { setRange(r); }
      });
    }
    var data = ctx.data;
    var weeks = A.keysBetween(data.from, data.to, "week");
    var index = {};
    weeks.forEach(function (k, i) { index[k] = i; });
    var values = weeks.map(function () { return 0; });
    ctx.txns.forEach(function (t) {
      if (t.kind !== "expense") return;
      if (ctx.focus && t.cat !== ctx.focus) return;
      values[index[A.keyOf(t.date, "week")]] -= t.amount;
    });
    var ticks = A.keysBetween(data.from, data.to, "month").map(function (k) {
      var day = A.startOf(k, "month"), p = F.ymd(day);
      return { day: Math.max(day, data.from), label: p.m === 1 ? A.periodLabel(k, "month") + " ’" + String(p.y).slice(2) : A.periodLabel(k, "month") };
    });
    charts.brush.update({ from: data.from, to: data.to, starts: weeks, values: values, range: state.view.range, ticks: ticks });
  }

  /* KPI tiles */
  function renderKpis(ctx) {
    var host = $("kpis"), k = ctx.kpis;
    // Tile sparklines stay monthly whatever the chart below is grouped by:
    // fifty weekly wiggles in 84 pixels say nothing.
    var sparkGran = ctx.range.to - ctx.range.from > 75 ? "month" : "week";
    var flow = A.cashflow(ctx.txns, ctx.range, sparkGran);
    var catRows = sparkGran === ctx.gran ? ctx.series : A.categorySeries(ctx.txns, ctx.range, sparkGran);
    var prevLabel = "vs previous " + spanName(ctx.range);
    var tiles;
    if (ctx.focus) {
      var f = ctx.focus, mine = k.byCat[f] || 0, prev = k.prev ? k.prev.byCat[f] || 0 : null;
      var row = catRows.byCat[f] || catRows.keys.map(function () { return 0; });
      tiles = [
        { id: "spent", label: "Spent on " + catName(f), icon: catIcon(f), value: mine, fmt: moneyR, delta: deltaOf(mine, prev, true), spark: row, color: colorFor(f) || LONE_COLOR, glow: "rgba(255,168,216,.2)" },
        { id: "share", label: "Share of spending", icon: "🥧", value: k.spent ? mine / k.spent : 0, fmt: pct, note: "of " + moneyR(k.spent) + " spent", glow: "rgba(143,212,255,.18)" },
        { id: "count", label: "Transactions", icon: "🧾", value: k.countByCat[f] || 0, fmt: function (v) { return Math.round(v).toLocaleString(); }, note: k.countByCat[f] ? "about " + moneyR(mine / k.countByCat[f]) + " each" : "", glow: "rgba(255,230,128,.16)" },
        { id: "avg", label: "Per month", icon: "🗓️", value: k.months >= 0.9 ? mine / k.months : mine, fmt: moneyR, note: k.months >= 0.9 ? "over " + monthsText(k.months) : "in this stretch", glow: "rgba(159,240,138,.16)" }
      ];
    } else {
      tiles = [
        { id: "spent", label: "Spent", icon: "💸", value: k.spent, fmt: moneyR, delta: deltaOf(k.spent, k.prev && k.prev.spent, true), spark: flow.spent, color: FLOW_COLORS.spent, glow: "rgba(255,190,107,.2)" },
        { id: "income", label: "Income", icon: "💰", value: k.income, fmt: moneyR, delta: deltaOf(k.income, k.prev && k.prev.income, false), spark: flow.income, color: FLOW_COLORS.income, glow: "rgba(143,212,255,.2)" },
        { id: "net", label: k.net >= 0 ? "Saved" : "Overspent", icon: k.net >= 0 ? "🐷" : "⚠️", value: k.net, fmt: function (v) { return signed(v); }, note: k.savingsRate != null ? Math.round(k.savingsRate * 100) + "% of income" : "", glow: k.net >= 0 ? "rgba(159,240,138,.2)" : "rgba(255,138,155,.2)" },
        { id: "avg", label: "Spent per month", icon: "🗓️", value: k.perMonth != null ? k.perMonth : k.spent, fmt: moneyR, delta: k.perMonth != null && k.prev && k.prev.perMonth != null ? deltaOf(k.perMonth, k.prev.perMonth, true) : null, note: k.perMonth != null ? "over " + monthsText(k.months) : "less than a month of data", glow: "rgba(201,166,255,.22)" }
      ];
    }
    if (host.getAttribute("data-shape") !== (ctx.focus ? "focus" : "all")) {
      clear(host);
      host.setAttribute("data-shape", ctx.focus ? "focus" : "all");
    }
    tiles.forEach(function (t, i) {
      var tile = host.children[i];
      if (!tile) {
        tile = el("article", "kpi", host);
        tile.style.animationDelay = (i * 60) + "ms";
        el("p", "kpi-label", tile);
        var main = el("div", "kpi-main", tile);
        el("p", "kpi-value", main);
        el("p", "kpi-delta", tile);
      }
      tile.style.setProperty("--kpi-glow", t.glow);
      var label = tile.children[0];
      label.textContent = "";
      el("span", null, label, t.icon).setAttribute("aria-hidden", "true");
      el("span", null, label, t.label);
      var row = tile.children[1];
      countTo(row.children[0], t.value, t.fmt);
      var d = tile.children[2];
      clear(d);
      if (t.delta) {
        var arrow = el("span", (t.delta.up ? "up " : "down ") + (t.delta.tone ? "is-" + t.delta.tone : ""), d, (t.delta.up ? "▲ " : "▼ ") + t.delta.text);
        arrow.setAttribute("aria-label", (t.delta.up ? "up " : "down ") + t.delta.text);
        d.appendChild(document.createTextNode(" " + prevLabel));
      } else if (t.note) {
        d.textContent = t.note;
      }
      var old = row.querySelector(".spark");
      if (old) row.removeChild(old);
      if (t.spark && t.spark.length > 1) row.appendChild(V.sparkline(t.spark, { color: t.color, width: 84, height: 30 }));
    });
  }

  function pct(v) {
    return Math.round(v * 100) + "%";
  }

  function monthsText(m) {
    var n = Math.round(m);
    return n <= 1 ? "1 month" : n + " months";
  }

  function spanName(range) {
    var days = range.to - range.from + 1;
    if (days <= 8) return "week";
    if (days <= 32) return "month";
    var months = Math.round(days / 30.4);
    return months + " months";
  }

  // Spending going up is bad news; income going up is good news.
  function deltaOf(now, then, upIsBad) {
    if (then == null || !(Math.abs(then) > 0.5)) return null;
    var change = (now - then) / Math.abs(then);
    if (!isFinite(change)) return null;
    var up = change >= 0;
    var tone = Math.abs(change) < 0.02 ? "" : (up === upIsBad ? "bad" : "good");
    return { up: up, text: Math.abs(Math.round(change * 100)) + "%", tone: tone };
  }

  function countTo(node, value, fmt) {
    var from = node._v == null ? 0 : node._v;
    node._v = value;
    if (node._anim) node._anim.stop();
    if (from === value) { node.textContent = fmt(value); return; }
    node._anim = V.tween(750, function (t) {
      var e = 1 - Math.pow(1 - t, 3);
      node.textContent = fmt(from + (value - from) * e);
    });
  }

  /* Main chart */
  function renderTimeline(ctx) {
    if (!charts.timeline) {
      charts.timeline = new V.Timeline($("timeline"), {
        money: moneyR,
        short: short,
        hint: "Click to open this period",
        label: "Spending by category over time. Use the left and right arrow keys to read each period, Enter to open it.",
        onSelect: function (i) { togglePeriod(lastCtx.keys[i]); },
        onToggle: function (id) { toggleHidden(id); },
        onSolo: function (id) { soloSeries(id); },
        onHover: function (id) { hotCategory(id); }
      });
    }
    lastCtx = ctx;
    var byCat = ctx.series.byCat, n = ctx.keys.length;
    var zero = ctx.keys.map(function () { return 0; });
    var series = [];
    if (ctx.focus) {
      series.push({ id: ctx.focus, name: catName(ctx.focus), icon: catIcon(ctx.focus), color: colorFor(ctx.focus) || LONE_COLOR, values: byCat[ctx.focus] || zero });
    } else {
      var hidden = state.prefs.hidden;
      state.slots.forEach(function (c) {
        if (byCat[c] && sum(byCat[c]) > 0 || hidden[c]) series.push({ id: c, name: catName(c), icon: catIcon(c), color: state.colorOf[c], values: byCat[c] || zero });
      });
      var rest = Object.keys(byCat).filter(function (c) { return !state.colorOf[c]; });
      if (rest.length) {
        var other = zero.slice();
        rest.forEach(function (c) { for (var i = 0; i < n; i++) other[i] += byCat[c][i]; });
        if (sum(other) > 0 || hidden._other) series.push({ id: "_other", name: "Everything else", icon: "", color: OTHER_COLOR, values: other });
      }
    }
    var title = ctx.focus ? catIcon(ctx.focus) + " " + catName(ctx.focus) + " over time" : "Spending by category";
    $("timeline-title").textContent = title;
    var granName = { week: "Weekly", month: "Monthly", quarter: "Quarterly" }[ctx.gran];
    $("timeline-sub").textContent = granName + ", " + A.rangeLabel(ctx.range) + (ctx.partial.some(Boolean) ? " · faded periods are only partly covered" : "");
    [].forEach.call($("mode").querySelectorAll("button"), function (b) {
      b.setAttribute("aria-checked", b.getAttribute("data-mode") === state.prefs.mode ? "true" : "false");
    });
    var data = {
      keys: ctx.keys, labels: ctx.labels, titles: ctx.titles, partial: ctx.partial,
      series: series, hidden: ctx.focus ? {} : state.prefs.hidden, mode: state.prefs.mode, selected: ctx.selected
    };
    charts.timeline.update(data);
    var tableOn = state.view.timelineTable;
    $("timeline-table-btn").setAttribute("aria-pressed", tableOn ? "true" : "false");
    $("timeline-table").hidden = !tableOn;
    if (tableOn) periodTable($("timeline-table"), ctx, series.filter(function (s) { return !data.hidden[s.id]; }).map(function (s) {
      return { name: (s.icon ? s.icon + " " : "") + s.name, values: s.values };
    }), true);
  }
  var lastCtx = null;

  // The table twin of a period chart: one row per period, newest first.
  function periodTable(host, ctx, cols, withTotal) {
    clear(host);
    var t = el("table", null, host);
    var head = el("tr", null, el("thead", null, t));
    el("th", null, head, "Period").scope = "col";
    cols.forEach(function (c) { el("th", null, head, c.name).scope = "col"; });
    if (withTotal) el("th", null, head, "Total").scope = "col";
    var body = el("tbody", null, t);
    var totals = cols.map(function () { return 0; });
    for (var i = ctx.keys.length - 1; i >= 0; i--) {
      var tr = el("tr", null, body);
      el("th", null, tr, ctx.titles[i] + (ctx.partial[i] ? " (partial)" : "")).scope = "row";
      var rowTotal = 0;
      cols.forEach(function (c, j) {
        var v = c.values[i];
        rowTotal += v;
        totals[j] += v;
        el("td", null, tr, c.format ? c.format(v) : whole(v));
      });
      if (withTotal) el("td", null, tr, whole(rowTotal));
    }
    var foot = el("tr", "is-total", body);
    el("th", null, foot, "Total").scope = "row";
    cols.forEach(function (c, j) { el("td", null, foot, c.format ? c.format(totals[j]) : whole(totals[j])); });
    if (withTotal) el("td", null, foot, whole(sum(totals)));
  }

  /* Cash flow */
  function renderCashflow(ctx) {
    if (!charts.cashflow) {
      charts.cashflow = new V.Cashflow($("cashflow"), {
        money: moneyR,
        short: short,
        colors: FLOW_COLORS,
        hint: "Click to open this period",
        onSelect: function (i) { togglePeriod(lastCtx.keys[i]); }
      });
      var legend = $("cashflow-legend");
      [["Income", FLOW_COLORS.income, false], ["Spending", FLOW_COLORS.spent, false], ["Net", FLOW_COLORS.net, true]].forEach(function (x) {
        var li = el("li", null, legend);
        var key = el("span", "key" + (x[2] ? " is-line" : ""), li);
        key.style.background = x[1];
        el("span", null, li, x[0]);
      });
    }
    var flow = A.cashflow(ctx.txns, ctx.range, ctx.gran);
    charts.cashflow.update({
      keys: ctx.keys, labels: ctx.labels, titles: ctx.titles, partial: ctx.partial,
      income: flow.income, spent: flow.spent, net: flow.net, selected: ctx.selected
    });
    var tableOn = state.view.cashflowTable;
    $("cashflow-table-btn").setAttribute("aria-pressed", tableOn ? "true" : "false");
    $("cashflow-table").hidden = !tableOn;
    if (tableOn) {
      periodTable($("cashflow-table"), ctx, [
        { name: "Income", values: flow.income },
        { name: "Spending", values: flow.spent },
        { name: "Net", values: flow.net, format: function (v) { return (v < 0 ? "\u2212" : "+") + whole(Math.abs(v)); } }
      ], false);
    }
  }

  /* Insights */
  var insightsSig = "";
  function renderInsights(ctx) {
    var months = A.cashflow(ctx.txns, ctx.range, "month");
    var list = A.insights({
      kpis: ctx.kpis,
      money: moneyR,
      catName: catName,
      months: { keys: months.keys, spent: months.spent, coverage: A.coverage(months.keys, "month", ctx.data) },
      txns: ctx.txns,
      range: ctx.range,
      recurring: A.recurring(ctx.txns, ctx.data),
      data: ctx.data
    });
    $("insights-sub").textContent = A.rangeLabel(ctx.range);
    var sig = JSON.stringify(list) + currency;
    if (sig === insightsSig) return;
    insightsSig = sig;
    var host = $("insights");
    clear(host);
    list.slice(0, 6).forEach(function (ins, i) {
      var li = el("li", null, host);
      var box = el(ins.action ? "button" : "div", "insight" + (ins.tone ? " is-" + ins.tone : ""), li);
      if (ins.action) box.type = "button";
      box.style.animationDelay = (i * 70) + "ms";
      el("span", "insight-icon", box, ins.icon).setAttribute("aria-hidden", "true");
      var body = el("span", null, box);
      el("span", "insight-title", body, ins.title).style.display = "block";
      el("span", "insight-text", body, ins.text).style.display = "block";
      if (ins.action) {
        el("span", "insight-go", box, "›").setAttribute("aria-hidden", "true");
        box.addEventListener("click", function () { runAction(ins.action); });
      }
    });
  }

  function runAction(a) {
    if (a.cat) setFocus(a.cat, true);
    else if (a.period != null) {
      if (state.prefs.gran !== a.gran) { state.prefs.gran = a.gran; }
      state.view.period = { gran: a.gran, key: a.period };
      render();
      scrollToId("scope");
    } else if (a.search) {
      state.view.search = a.search;
      $("tx-search").value = a.search;
      state.view.limit = 50;
      render();
      scrollToId("card-transactions");
    } else if (a.scroll) scrollToId("card-" + a.scroll);
  }

  function scrollToId(id) {
    var n = $(id);
    if (!n) return;
    var top = n.getBoundingClientRect().top + window.pageYOffset - ($("filters").offsetHeight + 12);
    window.scrollTo({ top: top, behavior: V.calm() ? "auto" : "smooth" });
  }

  /* Calendar */
  var calendarSig = "";
  function renderCalendar(ctx, fresh) {
    if (!charts.calendar) {
      charts.calendar = new V.Calendar($("calendar"), {
        money: moneyR,
        short: short,
        ramp: HEAT,
        dayLabel: function (d) { return A.formatDay(d, { weekday: "short", month: "short", day: "numeric", year: "numeric" }); },
        monthLabel: function (d) { return A.formatDay(d, { month: "short" }); },
        describe: function (t) { return t.merchant; },
        onPick: function (d) { setDay(state.view.day === d ? null : d); }
      });
    }
    var filter = ctx.focus ? function (t) { return t.cat === ctx.focus; } : null;
    $("calendar-title").textContent = ctx.focus ? "Day by day: " + catName(ctx.focus) : "Day by day";
    var sig = [ctx.range.from, ctx.range.to, ctx.focus, state.prefs.account, currency].join("|");
    charts.calendar.update({
      from: ctx.range.from, to: ctx.range.to, data: ctx.data,
      days: A.daily(ctx.txns, ctx.range, filter), selected: state.view.day
    }, fresh || sig !== calendarSig);
    calendarSig = sig;
  }

  /* The divider between range-wide charts and the details below */
  function renderScope(ctx) {
    var p = $("scope-text");
    clear(p);
    p.appendChild(document.createTextNode(state.view.period ? "Details for " : "Details for the whole range: "));
    el("strong", null, p, state.view.period ? A.periodLabel(state.view.period.key, state.view.period.gran, true) : A.rangeLabel(ctx.range));
    $("scope-clear").hidden = !state.view.period;
  }

  /* Categories */
  function renderCategories(ctx) {
    var scope = ctx.scope, host = $("categories");
    var now = A.totals(ctx.txns, scope);
    var prevScope = state.view.period
      ? { from: A.startOf(state.view.period.key - (state.view.period.gran === "week" ? 7 : 1), state.view.period.gran), to: scope.from - 1 }
      : (ctx.kpis.prev ? ctx.kpis.prev.range : null);
    var prev = prevScope && prevScope.from >= ctx.data.from - 3 ? A.totals(ctx.txns, prevScope) : null;
    var cats = Object.keys(now.byCat).filter(function (c) { return now.byCat[c] > 0.005; })
      .sort(function (a, b) { return now.byCat[b] - now.byCat[a]; });
    var months = A.kpis(ctx.txns, scope, ctx.data).months;
    clear(host);
    host.classList.toggle("no-change", !prev);
    if (!cats.length) {
      el("p", "cat-note", host, "No spending in this stretch.");
      return;
    }
    var head = el("div", "cat-head", host);
    ["Category", "Spent", "Share", "Trend", "Change"].forEach(function (h) { el("span", null, head, h); });
    var list = el("ul", "cat-list", host);
    var max = now.byCat[cats[0]];
    var shown = state.view.catsAll || cats.length <= 11 ? cats : cats.slice(0, 10);
    shown.forEach(function (c, i) {
      var li = el("li", null, list);
      var row = el("button", "cat-row" + (state.view.focus === c ? " is-focus" : ""), li);
      row.type = "button";
      row.setAttribute("data-cat", c);
      row.setAttribute("aria-pressed", state.view.focus === c ? "true" : "false");
      var name = el("span", "cat-name", row);
      var dot = el("span", "cat-dot" + (colorFor(c) ? "" : " is-plain"), name);
      if (colorFor(c)) dot.style.background = colorFor(c);
      el("span", "cat-icon", name, catIcon(c)).setAttribute("aria-hidden", "true");
      var nm = el("span", "cat-name-text", name, catName(c) + " ");
      el("span", "cat-count", nm, "· " + (now.countByCat[c] || 0));
      el("span", "cat-amount", row, moneyR(now.byCat[c]));
      var share = el("span", "cat-share", row);
      var bar = el("span", "cat-bar", share);
      var fill = el("i", null, bar);
      fill.style.width = Math.max(2, now.byCat[c] / max * 100) + "%";
      fill.style.background = colorFor(c) || LONE_COLOR;
      fill.style.animationDelay = (i * 40) + "ms";
      el("span", "cat-pct", share, Math.round(now.byCat[c] / now.spent * 100) + "%");
      var spark = V.sparkline(ctx.series.byCat[c] || [], { color: colorFor(c) || LONE_COLOR, width: 96, height: 26 });
      row.appendChild(spark);
      var ch = el("span", "cat-change", row);
      if (prev) {
        var d = deltaOf(now.byCat[c], prev.byCat[c] || 0, true);
        if (d && d.text === "0%") ch.textContent = "same";
        else if (d) {
          ch.textContent = (d.up ? "▲" : "▼") + d.text;
          if (d.tone) ch.className += " is-" + d.tone;
        } else if (!prev.byCat[c]) ch.textContent = "new";
      }
      if (months >= 0.9) row.title = catName(c) + ": about " + moneyR(now.byCat[c] / months) + " a month";
      row.addEventListener("click", function () { setFocus(state.view.focus === c ? null : c); });
      row.addEventListener("pointerenter", function () { if (charts.timeline && !state.view.focus) charts.timeline.highlight(colorFor(c) ? c : "_other"); });
      row.addEventListener("pointerleave", function () { if (charts.timeline) charts.timeline.highlight(null); });
    });
    if (shown.length < cats.length || state.view.catsAll && cats.length > 11) {
      var more = el("button", "link-btn cat-more", host, state.view.catsAll ? "Show fewer" : "Show all " + cats.length + " categories");
      more.type = "button";
      more.addEventListener("click", function () { state.view.catsAll = !state.view.catsAll; render(); });
    }
    var total = el("div", "cat-total", host);
    el("span", null, total, "Total spending");
    el("span", "cat-amount", total, moneyR(now.spent));

    // Say what was left out of "spending", and let the user look at it.
    var nTransfers = 0;
    ctx.txns.forEach(function (t) {
      if (t.kind === "transfer" && t.date >= scope.from && t.date <= scope.to) nTransfers++;
    });
    var note = el("p", "cat-note", host);
    note.appendChild(document.createTextNode("Not counted as spending: "));
    var inc = el("button", null, note, "income (" + moneyR(now.income) + ")");
    inc.type = "button";
    inc.addEventListener("click", function () { setFocus("income", true); });
    note.appendChild(document.createTextNode(" and "));
    var tr = el("button", null, note, nTransfers + " transfer" + (nTransfers === 1 ? "" : "s") + " between your accounts or to people");
    tr.type = "button";
    tr.addEventListener("click", function () { setFocus("transfer", true); });
    note.appendChild(document.createTextNode(". Refunds net down their category."));
  }

  function hotCategory(id) {
    [].forEach.call($("categories").querySelectorAll(".cat-row"), function (r) {
      var c = r.getAttribute("data-cat");
      r.classList.toggle("is-hot", !!id && (c === id || (id === "_other" && !colorFor(c))));
    });
  }

  /* Where the money went */
  var flowSig = "";
  function renderFlow(ctx, fresh) {
    if (!charts.flow) {
      charts.flow = new V.Sankey($("flow"), {
        money: moneyR,
        short: short,
        colors: SANKEY_COLORS,
        onPick: function (id) { if (id && id !== "_other") setFocus(id, false); }
      });
    }
    var f = A.flow(ctx.txns, ctx.scope, state.slots);
    var data = {
      sources: f.sources,
      deficit: f.deficit,
      saved: f.saved,
      targets: f.targets.map(function (t) {
        return { id: t.id, name: t.id === "_other" ? "Other" : C.byId[t.id].short, icon: t.id === "_other" ? "" : catIcon(t.id), color: t.id === "_other" ? OTHER_COLOR : colorFor(t.id), value: t.value };
      })
    };
    var sig = JSON.stringify(data) + currency;
    if (sig === flowSig && !fresh) return;
    flowSig = sig;
    charts.flow.update(data);
  }

  /* Top merchants */
  function renderMerchants(ctx) {
    var filter = ctx.focus ? function (t) { return t.cat === ctx.focus; } : null;
    var list = A.merchants(ctx.txns, ctx.scope, filter);
    var host = $("merchants");
    clear(host);
    var limit = state.view.merchantsAll ? 30 : 10;
    $("merchants-title").textContent = ctx.focus ? "Top merchants: " + catName(ctx.focus) : "Top merchants";
    if (!list.length) el("li", "cat-note", host, "No spending in this stretch.");
    var max = list.length ? list[0].total : 1;
    list.slice(0, limit).forEach(function (m, i) {
      var li = el("li", null, host);
      var b = el("button", "merchant" + (state.view.merchant === m.key ? " is-active" : ""), li);
      b.type = "button";
      el("span", "m-rank", b, String(i + 1));
      var name = el("span", "m-name", b);
      el("span", null, name, catIcon(m.cat)).setAttribute("aria-hidden", "true");
      el("span", null, name, m.name);
      el("span", "m-amount", b, moneyR(m.total));
      var bar = el("span", "m-bar", b);
      var fill = el("i", null, bar);
      fill.style.width = Math.max(1.5, m.total / max * 100) + "%";
      fill.style.background = colorFor(m.cat) || LONE_COLOR;
      fill.style.animationDelay = (i * 40) + "ms";
      el("span", "m-meta", b, m.count === 1 ? "once" : m.count + " times");
      b.setAttribute("aria-label", (i + 1) + ". " + m.name + ", " + moneyR(m.total) + ", " + (m.count === 1 ? "once" : m.count + " times") + ". Show its transactions.");
      b.addEventListener("click", function () { setMerchant(state.view.merchant === m.key ? null : m.key, true); });
    });
    var more = $("merchants-more");
    more.hidden = list.length <= 10;
    more.textContent = state.view.merchantsAll ? "Show fewer" : "Show " + Math.min(30, list.length) + " merchants";
  }

  /* Regular payments */
  function renderRecurring(ctx) {
    var list = A.recurring(ctx.txns, ctx.data);
    var active = list.filter(function (r) { return r.active; });
    var ended = list.filter(function (r) { return !r.active; });
    var total = $("recurring-total");
    clear(total);
    var host = $("recurring");
    clear(host);
    if (!list.length) {
      el("li", "cat-note", host, "Nothing charges on a regular rhythm yet. A few months of statements help this find subscriptions.");
      return;
    }
    var monthly = active.reduce(function (s, r) { return s + r.monthly; }, 0);
    el("strong", null, total, moneyR(monthly));
    el("span", null, total, "a month across " + active.length + " active payment" + (active.length === 1 ? "" : "s") + " · " + moneyR(monthly * 12) + " a year");
    var from = ctx.data.to - 365;
    var cadence = { weekly: "Weekly", biweekly: "Every two weeks", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };
    active.concat(ended.slice(0, 4)).forEach(function (r) {
      var li = el("li", null, host);
      var b = el("button", "rec" + (r.active ? "" : " is-ended"), li);
      b.type = "button";
      el("span", "rec-icon", b, catIcon(r.cat)).setAttribute("aria-hidden", "true");
      var mid = el("span", null, b);
      el("span", "rec-name", mid, r.name).style.display = "block";
      var when = r.active
        ? cadence[r.cadence] + " · next around " + A.formatDay(r.next, { month: "short", day: "numeric" })
        : "Stopped after " + A.formatDay(r.last, { month: "short", year: "numeric" });
      el("span", "rec-when", mid, when).style.display = "block";
      b.appendChild(V.ticks(r.dates, from, ctx.data.to, { color: colorFor(r.cat) || LONE_COLOR, width: 110, height: 18 }));
      var amt = el("span", "rec-amount", b, (r.varies ? "~" : "") + money(r.amount));
      if (r.cadence !== "monthly") el("small", null, amt, "≈ " + moneyR(r.monthly) + "/mo");
      else el("small", null, amt, r.varies ? "varies" : "per month");
      b.addEventListener("click", function () { setMerchant(r.key, true); });
    });
  }

  /* Transactions */
  function txFilter() {
    var v = state.view, scope = scopeRange(), q = v.search.trim().toLowerCase();
    var num = q.replace(/[^\d.,\-]/g, "");
    var qNum = /\d/.test(num) && /^[\d.,\-\s$£€¥]+$/.test(q) ? parseFloat(num.replace(/,/g, "")) : null;
    return baseTxns().filter(function (t) {
      if (v.day != null) { if (t.date !== v.day) return false; }
      else if (t.date < scope.from || t.date > scope.to) return false;
      if (v.focus && t.cat !== v.focus) return false;
      if (v.merchant && t.key !== v.merchant) return false;
      if (q) {
        if (qNum != null && isFinite(qNum)) {
          if (Math.abs(Math.abs(t.amount) - Math.abs(qNum)) > 0.005 && String(Math.abs(t.amount)).indexOf(String(Math.abs(qNum))) !== 0) return false;
        } else {
          var hay = (t.merchant + " " + t.desc + " " + t.memo + " " + catName(t.cat) + " " + t.account).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
      }
      return true;
    });
  }

  function renderTransactions() {
    var v = state.view, rows = txFilter();
    var dir = v.sort.dir, key = v.sort.key;
    rows.sort(function (a, b) {
      var x, y;
      if (key === "amount") { x = a.amount; y = b.amount; }
      else if (key === "merchant") { x = a.merchant.toLowerCase(); y = b.merchant.toLowerCase(); }
      else if (key === "cat") { x = catName(a.cat); y = catName(b.cat); }
      else if (key === "account") { x = a.account; y = b.account; }
      else { x = a.date; y = b.date; }
      return (x < y ? -1 : x > y ? 1 : 0) * dir || (b.date - a.date);
    });
    [].forEach.call(document.querySelectorAll("#tx-table th"), function (th) {
      var b = th.querySelector("button");
      if (b.getAttribute("data-sort") === key) th.setAttribute("aria-sort", dir > 0 ? "ascending" : "descending");
      else th.removeAttribute("aria-sort");
    });
    var out = 0, inn = 0;
    rows.forEach(function (t) {
      if (t.kind === "transfer") return;
      if (t.amount < 0) out -= t.amount; else inn += t.amount;
    });
    $("tx-sub").textContent = rows.length.toLocaleString() + " transaction" + (rows.length === 1 ? "" : "s") +
      (rows.length ? " · " + moneyR(out) + " out · " + moneyR(inn) + " in" : "") +
      (v.day != null ? " on " + A.formatDay(v.day) : "");
    var multi = accountsOf().length > 1;
    $("tx-table").classList.toggle("hide-account", !multi);
    var body = $("tx-body");
    clear(body);
    var endYear = state.all.length ? F.ymd(state.all[0].date).y : 0;
    rows.slice(0, v.limit).forEach(function (t) {
      var tr = el("tr", null, body);
      tr.setAttribute("data-id", t.id);
      var y = F.ymd(t.date).y;
      var d = el("td", "tx-date", tr, A.formatDay(t.date, { month: "short", day: "numeric" }));
      if (y !== endYear) el("small", null, d, " " + y);
      var m = el("td", null, tr);
      el("span", "tx-merchant", m, t.merchant);
      var detail = t.desc + (t.memo ? " · " + t.memo : "");
      if (detail.replace(/\s+/g, " ").toLowerCase() !== t.merchant.toLowerCase()) el("span", "tx-desc", m, detail.replace(/\s+/g, " "));
      var c = el("td", null, tr);
      c.appendChild(catChip(t));
      el("td", "tx-account col-account", tr, t.account);
      var amt = el("td", "num", tr);
      el("span", "tx-amount" + (t.kind === "transfer" ? " is-transfer" : t.amount > 0 ? " is-in" : ""), amt, (t.amount > 0 ? "+" : "−") + money(Math.abs(t.amount)));
    });
    $("tx-empty").hidden = rows.length > 0;
    var more = $("tx-more");
    more.hidden = rows.length <= v.limit;
    more.textContent = "Show " + Math.min(200, rows.length - v.limit).toLocaleString() + " more (" + (rows.length - v.limit).toLocaleString() + " left)";
  }

  function catChip(t) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cat-chip" + (t.how === "you" || t.how === "rule" ? " is-user" : "") + (t.cat === "uncategorized" ? " is-loose" : "");
    b.setAttribute("aria-haspopup", "dialog");
    b.setAttribute("aria-label", "Category: " + catName(t.cat) + ". Change it.");
    b.title = t.how === "you" ? "You filed this one" : t.how === "rule" ? "Filed by your rule for " + t.merchant : t.how === "bank" ? "From your bank's category" : "Filed automatically. Click to change.";
    var dot = el("span", "cat-dot" + (colorFor(t.cat) ? "" : " is-plain"), b);
    if (colorFor(t.cat)) dot.style.background = colorFor(t.cat);
    el("span", null, b, catIcon(t.cat)).setAttribute("aria-hidden", "true");
    el("span", "cat-chip-name", b, catName(t.cat));
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      openCatPop(t, b);
    });
    return b;
  }

  /* ── Changing the view ───────────────────────────────────────────── */
  function setPreset(p) {
    state.view.preset = p;
    state.prefs.preset = p;
    state.view.range = presetRange(p, A.extent(baseTxns()));
    checkPeriod();
    state.view.limit = 50;
    render();
  }

  function setRange(r) {
    var ext = A.extent(baseTxns());
    var match = null;
    ["3m", "6m", "12m", "ytd", "all"].forEach(function (p) {
      var pr = presetRange(p, ext);
      if (!match && pr.from === r.from && pr.to === r.to) match = p;
    });
    state.view.preset = match || "custom";
    state.view.range = { from: r.from, to: r.to };
    checkPeriod();
    state.view.limit = 50;
    render();
  }

  function setGran(g) {
    state.prefs.gran = g;
    checkPeriod();
    render();
  }

  function setMode(m) {
    state.prefs.mode = m;
    render();
  }

  function setFocus(cat, scroll) {
    state.view.focus = cat;
    state.view.merchant = null;
    state.view.limit = 50;
    render();
    if (scroll) scrollToId(C.kindOf(cat || "uncategorized") === "expense" && cat ? "card-timeline" : "card-transactions");
  }

  function togglePeriod(key) {
    var v = state.view, gran = state.prefs.gran;
    v.period = v.period && v.period.key === key && v.period.gran === gran ? null : { gran: gran, key: key };
    checkPeriod();
    v.limit = 50;
    render();
  }

  function setPeriod(p) {
    state.view.period = p;
    render();
  }

  function setDay(d) {
    state.view.day = d;
    state.view.limit = 50;
    render();
    if (d != null) scrollToId("card-transactions");
  }

  function setMerchant(key, scroll) {
    state.view.merchant = key;
    state.view.limit = 50;
    render();
    if (scroll && key) scrollToId("card-transactions");
  }

  function toggleHidden(id) {
    var h = state.prefs.hidden;
    if (h[id]) delete h[id]; else h[id] = true;
    render();
  }

  // Show one series alone; asking again for the one already alone shows all.
  function soloSeries(id) {
    var h = state.prefs.hidden;
    var all = state.slots.concat(["_other"]);
    var alone = !h[id] && all.every(function (c) { return c === id || h[c]; });
    state.prefs.hidden = {};
    if (!alone) all.forEach(function (c) { if (c !== id) state.prefs.hidden[c] = true; });
    render();
  }

  /* ── Re-filing transactions ──────────────────────────────────────── */
  var pop = { t: null, anchor: null, active: 0 };

  function openCatPop(t, anchor) {
    closeMenu();
    pop.t = t;
    pop.anchor = anchor;
    var same = state.all.filter(function (x) { return x.key === t.key; }).length;
    $("cat-pop-title").textContent = "File “" + t.merchant + "” under…";
    $("cat-pop-search").value = "";
    $("cat-pop-all-wrap").hidden = same < 2;
    $("cat-pop-all").checked = same >= 2;
    $("cat-pop-all-text").textContent = "Also file the other " + (same - 1) + " “" + t.merchant + "” transaction" + (same === 2 ? "" : "s") + " here, and future ones";
    $("cat-pop-reset").hidden = !(state.overrides[t.id] || state.rules[t.key]);
    fillCatList("");
    var p = $("cat-pop");
    p.hidden = false;
    placePop(p, anchor);
    $("cat-pop-search").focus();
  }

  function placePop(p, anchor) {
    var r = anchor.getBoundingClientRect();
    var w = p.offsetWidth, h = p.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var left = Math.min(Math.max(8, r.left), vw - w - 8);
    var top = r.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
    p.style.left = left + "px";
    p.style.top = top + "px";
  }

  function fillCatList(q) {
    var host = $("cat-pop-list");
    clear(host);
    q = q.trim().toLowerCase();
    var opts = C.list.filter(function (c) { return !q || c.name.toLowerCase().indexOf(q) >= 0; });
    opts.forEach(function (c, i) {
      var b = el("button", "pop-opt", host);
      b.type = "button";
      b.setAttribute("role", "option");
      b.setAttribute("data-cat", c.id);
      b.setAttribute("aria-selected", pop.t && pop.t.cat === c.id ? "true" : "false");
      b.tabIndex = -1;
      el("span", null, b, c.icon).setAttribute("aria-hidden", "true");
      el("span", null, b, c.name);
      b.addEventListener("click", function () { chooseCat(c.id); });
    });
    pop.active = 0;
    markActive();
  }

  function markActive() {
    var opts = $("cat-pop-list").children;
    for (var i = 0; i < opts.length; i++) opts[i].classList.toggle("is-active", i === pop.active);
    if (opts[pop.active]) opts[pop.active].scrollIntoView({ block: "nearest" });
  }

  function closeCatPop(refocus) {
    if ($("cat-pop").hidden) return;
    $("cat-pop").hidden = true;
    if (refocus && pop.anchor && document.body.contains(pop.anchor)) pop.anchor.focus();
    pop.t = null;
  }

  function snapshot() {
    state.undo.push(JSON.stringify({ rules: state.rules, overrides: state.overrides }));
    if (state.undo.length > 30) state.undo.shift();
  }

  function undo() {
    var s = state.undo.pop();
    if (!s) return;
    var o = JSON.parse(s);
    state.rules = o.rules;
    state.overrides = o.overrides;
    recategorize(true);
    render();
    toast("Undone.");
  }

  function chooseCat(cat) {
    var t = pop.t;
    if (!t) return;
    var all = !$("cat-pop-all-wrap").hidden && $("cat-pop-all").checked;
    var keyboard = $("cat-pop").contains(document.activeElement);
    closeCatPop(true);
    if (!all && t.cat === cat) return;
    snapshot();
    var moved = 1;
    if (all) {
      state.rules[t.key] = cat;
      moved = 0;
      state.all.forEach(function (x) {
        if (x.key !== t.key) return;
        delete state.overrides[x.id];
        moved++;
      });
      if (state.rules[t.key] === t.auto) delete state.rules[t.key];
    } else {
      var base = state.rules[t.key] || t.auto;
      if (cat === base) delete state.overrides[t.id];
      else state.overrides[t.id] = cat;
    }
    recategorize(true);
    render();
    flashRow(t.id, keyboard);
    toast((moved === 1 ? "Filed under " : "Filed " + moved + " transactions under ") + catIcon(cat) + " " + catName(cat) + ".", "Undo", undo);
  }

  function resetCat() {
    var t = pop.t;
    if (!t) return;
    closeCatPop(true);
    snapshot();
    delete state.overrides[t.id];
    var hadRule = !!state.rules[t.key];
    if (hadRule) delete state.rules[t.key];
    recategorize(true);
    render();
    flashRow(t.id, true);
    toast(hadRule ? "Every “" + t.merchant + "” transaction is back to automatic." : "Back to automatic.", "Undo", undo);
  }

  // The list was redrawn under the popover: light up the row that changed
  // and, for keyboard users, put focus back on its new category chip.
  function flashRow(id, refocus) {
    var row = document.querySelector('#tx-body tr[data-id="' + id + '"]');
    if (!row) return;
    row.classList.add("flash-row");
    var chip = row.querySelector(".cat-chip");
    if (refocus && chip) chip.focus();
  }

  /* ── Column mapping dialog ───────────────────────────────────────── */
  var mapping = { file: null, map: null, existing: false };
  var MAP_ROLES = ["date", "desc", "memo", "amount", "type", "debit", "credit", "category"];
  var OPTIONAL = { memo: 1, type: 1, category: 1 };

  function openMapping(file, existing) {
    mapping.file = file;
    mapping.existing = existing;
    mapping.map = JSON.parse(JSON.stringify(file.mapping));
    var rows = file.rows, map = mapping.map;
    var header = map.headerRow >= 0 ? rows[map.headerRow] : null;
    var sample = rows.slice(map.headerRow + 1).filter(function (r) { return r.some(function (c) { return c; }); }).slice(0, 30);
    var width = 0;
    rows.forEach(function (r) { if (r.length > width) width = r.length; });
    MAP_ROLES.forEach(function (role) {
      var sel = $("map-" + role);
      clear(sel);
      if (OPTIONAL[role] || role === "amount" || role === "debit" || role === "credit") {
        var none = el("option", null, sel, "— none —");
        none.value = "-1";
      }
      for (var c = 0; c < width; c++) {
        var ex = "";
        for (var i = 0; i < sample.length && !ex; i++) if (sample[i][c]) ex = sample[i][c];
        var name = header && header[c] ? header[c] : "Column " + (c + 1);
        var o = el("option", null, sel, name + (ex && ex !== name ? "  ·  e.g. " + ex.slice(0, 28) : ""));
        o.value = String(c);
      }
    });
    $("map-title").textContent = existing ? "How " + file.name + " is read" : "Check " + file.name;
    $("map-intro").textContent = existing
      ? "Change which column is which, then save. Charts update straight away."
      : "Spendscape needs a hand with this one. Make sure the preview looks right: spending should show as money out.";
    var notes = $("map-notes");
    clear(notes);
    var say = {
      "no-date": "We couldn't find a date column. Pick it below.",
      "no-amount": "We couldn't find the amounts. Pick the column, or the money in and money out columns.",
      "no-desc": "We couldn't find a description column. Pick one so merchants can be recognised.",
      "date-order": "These dates could be day-first or month-first. Check the date order.",
      "sign": "We had to guess which amounts are spending. Check that purchases show as money out.",
      "skipped": "Quite a few rows couldn't be read. They may be headings or totals, or a column is off.",
      "empty": "No transactions could be read yet with these settings."
    };
    (existing ? [] : file.issues).forEach(function (i) { if (say[i]) el("li", null, notes, say[i]); });
    $("map-remember").checked = true;
    $("map-remember").parentNode.hidden = !file.signature;
    syncMapForm();
    var dlg = $("dlg-map");
    if (!dlg.open) dlg.showModal();
  }

  function syncMapForm() {
    var map = mapping.map;
    MAP_ROLES.forEach(function (role) { $("map-" + role).value = String(map[role]); });
    $("map-order").value = map.dateOrder;
    $("map-decimal").value = map.decimal;
    $("map-sign").value = map.amount >= 0 ? (map.sign || "asis") : "asis";
    var kind = map.amount >= 0 || (map.debit < 0 && map.credit < 0) ? "one" : "two";
    [].forEach.call($("map-amount-kind").querySelectorAll("button"), function (b) {
      b.setAttribute("aria-checked", b.getAttribute("data-kind") === kind ? "true" : "false");
    });
    [].forEach.call(document.querySelectorAll("#dlg-map .field[data-kind]"), function (f) {
      f.hidden = f.getAttribute("data-kind") !== kind;
    });
    $("map-type-wrap").hidden = kind !== "one" || map.sign !== "type";
    previewMapping();
  }

  function previewMapping() {
    var file = mapping.file, map = mapping.map;
    var res = F.applyMapping(file.rows, map);
    var host = $("map-preview");
    clear(host);
    var head = el("tr", null, el("thead", null, host));
    ["Date", "Description", "Category", "Amount"].forEach(function (h, i) {
      var th = el("th", i === 3 ? "num" : null, head, h);
      th.scope = "col";
    });
    var body = el("tbody", null, host);
    res.txns.slice(0, 8).forEach(function (t) {
      var tr = el("tr", null, body);
      el("td", "tx-date", tr, A.formatDay(t.date));
      var c = C.classify(t);
      var d = el("td", null, tr);
      el("span", "tx-merchant", d, c.merchant);
      el("span", "tx-desc", d, t.desc);
      el("td", null, tr, catIcon(c.cat) + " " + catName(c.cat));
      var a = el("td", "num", tr);
      el("span", "tx-amount" + (t.amount > 0 ? " is-in" : ""), a, (t.amount > 0 ? "+" : "−") + Math.abs(t.amount).toFixed(2));
    });
    var out = 0, nOut = 0, inn = 0, nIn = 0, lo = Infinity, hi = -Infinity;
    res.txns.forEach(function (t) {
      if (t.amount < 0) { out -= t.amount; nOut++; } else { inn += t.amount; nIn++; }
      if (t.date < lo) lo = t.date;
      if (t.date > hi) hi = t.date;
    });
    var count = $("map-count");
    clear(count);
    el("strong", null, count, res.txns.length.toLocaleString());
    count.appendChild(document.createTextNode(" transactions"));
    if (res.txns.length) {
      count.appendChild(document.createTextNode(", " + A.formatDay(lo) + " to " + A.formatDay(hi) + ". "));
      count.appendChild(document.createTextNode(nOut + " going out (" + out.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " in total), " +
        nIn + " coming in (" + inn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ")."));
    }
    if (res.skipped) count.appendChild(document.createTextNode(" " + res.skipped + " row" + (res.skipped === 1 ? "" : "s") + " skipped."));
    var ok = $("map-ok");
    ok.disabled = !res.txns.length;
    ok.textContent = mapping.existing ? "Save" : "Import " + res.txns.length.toLocaleString();
    mapping.result = res;
  }

  function onMapField(role, value) {
    var map = mapping.map;
    var c = +value;
    if (MAP_ROLES.indexOf(role) >= 0) {
      // One column, one job.
      MAP_ROLES.forEach(function (r) { if (r !== role && map[r] === c && c >= 0) map[r] = -1; });
      map[role] = c;
      // Re-derive date order, decimal mark and sign for the new columns.
      F.finishMapping(mapping.file.rows, map, { delimiter: mapping.file.delimiter });
    } else if (role === "order") map.dateOrder = value;
    else if (role === "decimal") map.decimal = value;
    else if (role === "sign") map.sign = value;
    syncMapForm();
  }

  function setAmountKind(kind) {
    var map = mapping.map;
    var prof = numericColumns();
    if (kind === "one") {
      if (map.amount < 0) map.amount = map.debit >= 0 ? map.debit : prof[0] != null ? prof[0] : -1;
      map.debit = map.credit = -1;
    } else {
      var pick = prof.filter(function (c) { return c !== map.date; });
      map.debit = map.amount >= 0 ? map.amount : pick[0] != null ? pick[0] : -1;
      map.credit = pick.filter(function (c) { return c !== map.debit; })[0];
      if (map.credit == null) map.credit = -1;
      map.amount = -1;
    }
    F.finishMapping(mapping.file.rows, map, { delimiter: mapping.file.delimiter });
    syncMapForm();
  }

  function numericColumns() {
    var rows = mapping.file.rows, map = mapping.map, out = [];
    var data = rows.slice(map.headerRow + 1, map.headerRow + 60);
    var width = 0;
    data.forEach(function (r) { if (r.length > width) width = r.length; });
    for (var c = 0; c < width; c++) {
      var n = 0, filled = 0;
      data.forEach(function (r) {
        if (!r[c]) return;
        filled++;
        if (F.parseAmount(r[c], map.decimal) != null) n++;
      });
      if (filled && n / filled > 0.8) out.push(c);
    }
    return out;
  }

  function acceptMapping() {
    var file = mapping.file, map = mapping.map, res = mapping.result;
    if (!res || !res.txns.length) return;
    file.mapping = map;
    file.raw = res.txns;
    file.skipped = res.skipped;
    if (file.signature && $("map-remember").checked) {
      var keep = { width: file.rows[map.headerRow].length, dateOrder: map.dateOrder, decimal: map.decimal, sign: map.sign };
      F.ROLES.forEach(function (r) { keep[r] = map[r]; });
      state.layouts[file.signature] = keep;
    }
    $("dlg-map").close("ok");
    if (mapping.existing) {
      rebuild();
      clampView();
      render(true);
      renderFiles();
      toast("Updated " + file.name + ".");
    } else {
      startBatch();
      addFile(file);
      continueBatch();
    }
  }

  function skipMapping() {
    var file = mapping.file;
    $("dlg-map").close("cancel");
    if (!mapping.existing && batch) {
      batch.problems.push(file.name + " was skipped.");
      continueBatch();
    }
  }

  /* ── Files dialog ────────────────────────────────────────────────── */
  function renderFiles() {
    var host = $("files-list");
    clear(host);
    state.files.forEach(function (f) {
      var li = el("li", "file", host);
      el("span", "file-badge", li, f.format.toUpperCase());
      var input = el("input", "file-account", li);
      input.value = f.account;
      input.setAttribute("aria-label", "Account name for " + f.name);
      input.title = "Click to rename";
      input.addEventListener("change", function () {
        var v = input.value.trim();
        if (!v || v === f.account) { input.value = f.account; return; }
        if (state.prefs.account === f.account) state.prefs.account = v;
        f.account = v;
        rebuild();
        render();
      });
      var actions = el("div", "file-actions", li);
      if (f.rows) {
        var cols = el("button", "tool", actions, "Columns");
        cols.type = "button";
        cols.addEventListener("click", function () { openMapping(f, true); });
      }
      var rm = el("button", "tool", actions, "Remove");
      rm.type = "button";
      rm.addEventListener("click", function () {
        state.files = state.files.filter(function (x) { return x !== f; });
        rebuild();
        if (state.all.length) clampView(); else state.view.range = null;
        render(true);
        renderFiles();
        if (!state.files.length) $("dlg-files").close();
      });
      var lo = Infinity, hi = -Infinity;
      f.raw.forEach(function (t) { if (t.date < lo) lo = t.date; if (t.date > hi) hi = t.date; });
      el("p", "file-meta", li, f.name + " · " + f.raw.length.toLocaleString() + " transactions" +
        (f.raw.length ? " · " + A.formatDay(lo) + " – " + A.formatDay(hi) : "") +
        (f.skipped ? " · " + f.skipped + " rows skipped" : ""));
    });
  }

  /* ── Settings menu ───────────────────────────────────────────────── */
  function openMenu() {
    closeCatPop(false);
    var m = $("menu"), btn = $("btn-menu");
    var sel = $("currency-select");
    clear(sel);
    var auto = el("option", null, sel, "Automatic (" + (detectedCurrency() || localeCurrency()) + ")");
    auto.value = "";
    CURRENCIES.forEach(function (c) {
      var o = el("option", null, sel, c);
      o.value = c;
    });
    sel.value = state.prefs.currency;
    $("remember-toggle").checked = state.prefs.remember;
    m.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    var r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + 8) + "px";
    m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, document.documentElement.clientWidth - m.offsetWidth - 8)) + "px";
    sel.focus();
  }

  function closeMenu() {
    if ($("menu").hidden) return;
    $("menu").hidden = true;
    $("btn-menu").setAttribute("aria-expanded", "false");
  }

  /* ── Export ──────────────────────────────────────────────────────── */
  // Spreadsheet apps run cells that start with = + - or @ as formulas, so
  // text fields from a statement get a leading apostrophe to stay text.
  function csvCell(v, isText) {
    var s = String(v == null ? "" : v);
    if (isText && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv(rows, name) {
    var lines = [["Date", "Merchant", "Description", "Memo", "Category", "Kind", "Account", "Amount"].join(",")];
    rows.forEach(function (t) {
      lines.push([
        F.isoOf(t.date), csvCell(t.merchant, true), csvCell(t.desc, true), csvCell(t.memo, true),
        csvCell(catName(t.cat), true), t.kind, csvCell(t.account, true), t.amount.toFixed(2)
      ].join(","));
    });
    var blob = new Blob(["\ufeff" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 1000);
  }

  /* ── Toast ───────────────────────────────────────────────────────── */
  var toastTimer = null;
  function toast(msg, actionLabel, action, ms) {
    var t = $("toast"), btn = $("toast-action");
    clearTimeout(toastTimer);
    t.hidden = true;
    void t.offsetWidth;
    $("toast-text").textContent = msg;
    btn.hidden = !actionLabel;
    btn.textContent = actionLabel || "";
    btn.onclick = action ? function () { t.hidden = true; action(); } : null;
    t.hidden = false;
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || (actionLabel ? 6500 : 3800));
  }

  /* ── Restore ─────────────────────────────────────────────────────── */
  function restore() {
    var s = loadStore();
    state.rules = s.rules || {};
    state.overrides = s.overrides || {};
    state.layouts = s.layouts || {};
    var p = s.prefs || {};
    if (p.gran) state.prefs.gran = p.gran;
    if (p.mode) state.prefs.mode = p.mode;
    if (p.hidden) state.prefs.hidden = p.hidden;
    if (p.currency) state.prefs.currency = p.currency;
    if (p.preset) state.prefs.preset = p.preset;
    state.prefs.remember = !!p.remember;
    if (!state.prefs.remember || !s.files || !s.files.length) return;
    s.files.forEach(function (sf) {
      var res, rows = null, map = sf.mapping;
      if (map) {
        var delim = F.detectDelimiter(sf.text);
        rows = F.parseDelimited(sf.text, delim);
        res = F.applyMapping(rows, map);
        res.format = delim === "\t" ? "tsv" : "csv";
        res.delimiter = delim;
        var full = F.read(sf.name, sf.text, null);
        res.currency = full.currency;
        res.signature = full.signature;
      } else {
        res = F.read(sf.name, sf.text, state.layouts);
        rows = res.rows || null;
        map = res.mapping || null;
      }
      state.files.push({
        id: "f" + hash(sf.text), name: sf.name, format: res.format, account: sf.account || res.account,
        text: sf.text, rows: rows, mapping: map, signature: res.signature || "", delimiter: res.delimiter || ",",
        currency: res.currency || null, raw: res.txns, skipped: res.skipped, issues: []
      });
    });
    rebuild();
    resetView();
  }

  /* ── Wiring ──────────────────────────────────────────────────────── */
  function wire() {
    var input = $("file-input");
    function pick() { input.value = ""; input.click(); }
    input.addEventListener("change", function () { importFiles(input.files); });
    $("btn-add").addEventListener("click", pick);
    $("files-add").addEventListener("click", function () { $("dlg-files").close(); pick(); });
    var dz = $("dropzone");
    dz.addEventListener("click", pick);
    dz.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
    });
    $("btn-sample").addEventListener("click", loadSample);
    $("btn-paste").addEventListener("click", function () { $("paste-text").value = ""; $("dlg-paste").showModal(); });
    $("paste-ok").addEventListener("click", function () {
      var text = $("paste-text").value;
      if (!text.trim()) return;
      $("dlg-paste").close();
      startBatch();
      ingest({ name: "Pasted rows", text: text });
      continueBatch();
    });

    // Drag and drop anywhere on the page.
    var depth = 0, overlay = $("drop-overlay");
    function hasFiles(e) {
      var types = e.dataTransfer && e.dataTransfer.types;
      return !!types && [].indexOf.call(types, "Files") >= 0;
    }
    window.addEventListener("dragenter", function (e) {
      if (!hasFiles(e)) return;
      depth++;
      overlay.hidden = false;
      dz.classList.add("is-over");
    });
    window.addEventListener("dragleave", function (e) {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) { overlay.hidden = true; dz.classList.remove("is-over"); }
    });
    window.addEventListener("dragover", function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    window.addEventListener("drop", function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      overlay.hidden = true;
      dz.classList.remove("is-over");
      importFiles(e.dataTransfer.files);
    });

    $("range-presets").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) setPreset(b.getAttribute("data-range"));
    });
    $("gran").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) setGran(b.getAttribute("data-gran"));
    });
    $("mode").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) setMode(b.getAttribute("data-mode"));
    });
    [$("range-presets"), $("gran"), $("mode"), $("map-amount-kind")].forEach(radioKeys);
    $("account-filter").addEventListener("change", function () {
      state.prefs.account = this.value;
      state.view.period = state.view.day = state.view.merchant = null;
      clampView();
      render(true);
    });
    $("timeline-table-btn").addEventListener("click", function () {
      state.view.timelineTable = !state.view.timelineTable;
      render();
    });
    $("cashflow-table-btn").addEventListener("click", function () {
      state.view.cashflowTable = !state.view.cashflowTable;
      render();
    });
    $("scope-clear").addEventListener("click", function () { setPeriod(null); });
    $("merchants-more").addEventListener("click", function () {
      state.view.merchantsAll = !state.view.merchantsAll;
      render();
    });

    var searchTimer = null;
    $("tx-search").addEventListener("input", function () {
      var v = this.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.view.search = v;
        state.view.limit = 50;
        renderTransactions();
      }, 120);
    });
    $("tx-table").querySelector("thead").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-sort]");
      if (!b) return;
      var key = b.getAttribute("data-sort"), s = state.view.sort;
      // Dates newest first; amounts biggest spending first (most negative);
      // text A to Z. A second click reverses.
      if (s.key === key) s.dir = -s.dir;
      else { s.key = key; s.dir = key === "date" ? -1 : 1; }
      renderTransactions();
    });
    $("tx-more").addEventListener("click", function () {
      state.view.limit += 200;
      renderTransactions();
    });
    $("tx-export").addEventListener("click", function () {
      exportCsv(txFilter(), "spendscape-transactions.csv");
    });

    // Category popover.
    $("cat-pop-search").addEventListener("input", function () { fillCatList(this.value); });
    $("cat-pop").addEventListener("keydown", function (e) {
      var opts = $("cat-pop-list").children, cols = 2;
      if (e.key === "Escape") { e.preventDefault(); closeCatPop(true); return; }
      if (e.target.id === "cat-pop-all") return;
      var move = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (move && opts.length && !(e.target.id === "cat-pop-search" && (e.key === "ArrowLeft" || e.key === "ArrowRight"))) {
        e.preventDefault();
        pop.active = Math.max(0, Math.min(opts.length - 1, pop.active + move));
        markActive();
      } else if (e.key === "Enter" && opts[pop.active]) {
        e.preventDefault();
        chooseCat(opts[pop.active].getAttribute("data-cat"));
      }
    });
    $("cat-pop-reset").addEventListener("click", resetCat);

    // Menu.
    $("btn-menu").addEventListener("click", function (e) {
      e.stopPropagation();
      if ($("menu").hidden) openMenu(); else closeMenu();
    });
    $("currency-select").addEventListener("change", function () {
      state.prefs.currency = this.value;
      updateCurrency();
      render();
    });
    $("remember-toggle").addEventListener("change", function () {
      state.prefs.remember = this.checked;
      saveNow();
      renderFoot();
      toast(this.checked ? "Your statements will be kept on this device until you clear them." : "Your statements won't be kept after this tab closes.");
    });
    $("menu-export").addEventListener("click", function () {
      closeMenu();
      if (!state.all.length) { toast("Add a statement first."); return; }
      exportCsv(state.all, "spendscape-all.csv");
    });
    $("menu-rules").addEventListener("click", function () {
      closeMenu();
      var n = Object.keys(state.rules).length + Object.keys(state.overrides).length;
      if (!n) { toast("You haven't changed any categories yet."); return; }
      if (!window.confirm("Forget all " + n + " of your category changes?")) return;
      snapshot();
      state.rules = {};
      state.overrides = {};
      recategorize(true);
      render();
      toast("Category changes forgotten.", "Undo", undo);
    });
    $("menu-clear").addEventListener("click", function () {
      closeMenu();
      if (!window.confirm("Remove every statement and forget all settings and category changes on this device?")) return;
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* nothing stored */ }
      state.files = [];
      state.all = [];
      state.rules = {};
      state.overrides = {};
      state.layouts = {};
      state.undo = [];
      state.prefs = { gran: "month", mode: "bars", hidden: {}, currency: "", remember: false, account: "", preset: "" };
      state.view.range = null;
      render();
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* nothing stored */ }
      clearTimeout(saveTimer);
      toast("Everything is cleared.");
    });

    // Files dialog.
    $("btn-files").addEventListener("click", function () { renderFiles(); $("dlg-files").showModal(); });
    $("files-clear").addEventListener("click", function () {
      if (!window.confirm("Remove all statements?")) return;
      state.files = [];
      rebuild();
      state.view.range = null;
      $("dlg-files").close();
      render();
    });

    // Mapping dialog.
    MAP_ROLES.forEach(function (role) {
      $("map-" + role).addEventListener("change", function () { onMapField(role, this.value); });
    });
    $("map-order").addEventListener("change", function () { onMapField("order", this.value); });
    $("map-decimal").addEventListener("change", function () { onMapField("decimal", this.value); });
    $("map-sign").addEventListener("change", function () { onMapField("sign", this.value); });
    $("map-amount-kind").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) setAmountKind(b.getAttribute("data-kind"));
    });
    $("map-ok").addEventListener("click", acceptMapping);
    $("map-cancel").addEventListener("click", skipMapping);
    $("dlg-map").addEventListener("cancel", function (e) { e.preventDefault(); skipMapping(); });
    $("dlg-map").querySelector(".sheet-x").addEventListener("submit", function (e) { e.preventDefault(); skipMapping(); });

    // Close floating things on outside clicks and Escape.
    document.addEventListener("pointerdown", function (e) {
      if (!$("cat-pop").hidden && !$("cat-pop").contains(e.target) && !e.target.closest(".cat-chip")) closeCatPop(false);
      if (!$("menu").hidden && !$("menu").contains(e.target) && e.target !== $("btn-menu") && !$("btn-menu").contains(e.target)) closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!$("menu").hidden) { closeMenu(); $("btn-menu").focus(); }
        V.hideTip();
      }
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && state.all.length) {
        e.preventDefault();
        $("tx-search").focus();
      }
    });
    window.addEventListener("resize", function () {
      if (!$("cat-pop").hidden && pop.anchor) placePop($("cat-pop"), pop.anchor);
      closeMenu();
    });
  }

  // Arrow keys move between the buttons of a radio-style segmented control.
  function radioKeys(group) {
    group.addEventListener("keydown", function (e) {
      var dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!dir) return;
      var buttons = [].slice.call(group.querySelectorAll("button"));
      var i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var next = buttons[(i + dir + buttons.length) % buttons.length];
      next.focus();
      next.click();
    });
  }

  /* ── Test hook ───────────────────────────────────────────────────── */
  window.Spendscape = {
    state: function () {
      return {
        files: state.files.map(function (f) { return { name: f.name, format: f.format, account: f.account, count: f.raw.length, mapping: f.mapping }; }),
        count: state.all.length,
        currency: currency,
        range: state.view.range && { from: F.isoOf(state.view.range.from), to: F.isoOf(state.view.range.to) },
        preset: state.view.preset,
        gran: state.prefs.gran,
        mode: state.prefs.mode,
        focus: state.view.focus,
        period: state.view.period,
        day: state.view.day,
        colors: state.colorOf,
        rules: state.rules,
        overrides: state.overrides
      };
    },
    txns: function () {
      return state.all.map(function (t) {
        return { id: t.id, date: F.isoOf(t.date), amount: t.amount, merchant: t.merchant, cat: t.cat, account: t.account, how: t.how };
      });
    },
    loadSample: loadSample,
    importText: function (name, text) {
      startBatch();
      ingest({ name: name, text: text });
      continueBatch();
    },
    setPreset: setPreset,
    setGran: setGran,
    setMode: setMode,
    setFocus: setFocus,
    togglePeriod: function (iso) {
      var p = iso.split("-");
      togglePeriod(A.keyOf(F.dayOf(+p[0], +p[1], +p[2]), state.prefs.gran));
    }
  };

  wire();
  restore();
  render(true);
})();
