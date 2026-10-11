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
    prefs: { gran: "month", mode: "bars", hidden: {}, currency: "", remember: true, account: "", preset: "" },
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
  // Version 3: everything Spendscape keeps about the user's money (the
  // statements, their category changes and the column layouts they fixed)
  // is sealed in a vault locked with a password they choose, and nothing
  // about their money is kept without one. Only display choices stay
  // readable. Versions 1 and 2 kept it all readable: such data is loaded
  // and the user asked to lock it.
  var STORE_VERSION = 3;
  var Vault = kit.vault;

  var vault = null;        // the open vault { key, salt, iter }: in memory only
  var locked = null;       // a sealed vault waiting for its password
  var legacy = false;      // readable data from before version 3, not yet locked
  var keepAsked = false;   // asked on this visit whether to keep the statements
  var unkept = {};         // file id -> true: too big for this browser's storage
  var lastSaved = null;    // what was last written, so an unchanged state isn't written again
  var saveTimer = null, adopting = false, saving = null, saveAgain = false;

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function save() {
    if (adopting) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }

  // One save at a time; one asked for meanwhile runs next, with whatever
  // is current by then.
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (saving) { saveAgain = true; return saving; }
    // Resolves with the statements newly found too big to keep.
    saving = writeStore().then(null, function () { return []; }).then(function (news) {
      saving = null;
      news = news || [];
      if (saveAgain) {
        saveAgain = false;
        return saveNow().then(function (more) { return news.concat(more); });
      }
      return news;
    });
    return saving;
  }

  function tooBig(files) {
    return (files.length === 1 ? files[0].name + " is" : files.length + " statements are") +
      " too big to keep in this browser, so " + (files.length === 1 ? "it" : "they") + " will need adding again next time.";
  }

  function prefsJson() {
    var p = state.prefs;
    return JSON.stringify({ gran: p.gran, mode: p.mode, hidden: p.hidden, currency: p.currency, remember: p.remember, preset: p.preset });
  }

  function isEmpty(o) {
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) return false;
    return true;
  }

  // Display choices always; the statements, category changes and layouts
  // only sealed in the open vault. If the browser's storage is full, the
  // biggest statements are left out until the rest fit.
  function writeStore() {
    // Locked, or older readable data not yet locked: what is stored stays.
    if (locked || legacy) return Promise.resolve([]);
    var prefs = prefsJson();
    var envelope = function (sealed) {
      return '{"v":' + STORE_VERSION + ',"prefs":' + prefs + (sealed ? ',"vault":' + JSON.stringify(sealed) : "") + "}";
    };
    var kept = state.files.filter(function (f) { return !f.sample; });
    var nothing = !kept.length && isEmpty(state.rules) && isEmpty(state.overrides) && isEmpty(state.layouts);
    if (!vault || !state.prefs.remember || nothing) {
      var plain = envelope(null);
      if (plain !== lastSaved) {
        localStorage.setItem(STORE_KEY, plain);
        lastSaved = plain;
      }
      return Promise.resolve([]);
    }
    var head = '{"rules":' + JSON.stringify(state.rules) + ',"overrides":' + JSON.stringify(state.overrides) +
      ',"layouts":' + JSON.stringify(state.layouts) + ',"files":[';
    var parts = kept.map(storedForm), left = [], key = vault;
    function attempt() {
      var body = head + parts.join(",") + "]}", what = prefs + "\n" + body;
      if (what === lastSaved) return Promise.resolve();
      return Vault.seal(key, body).then(function (sealed) {
        // Locked again, or the password changed, while this was sealing.
        if (vault !== key) return;
        try {
          localStorage.setItem(STORE_KEY, envelope(sealed));
        } catch (e) {
          if (!parts.length) return;
          var big = 0;
          parts.forEach(function (part, i) { if (part.length > parts[big].length) big = i; });
          left.push(kept[big]);
          kept.splice(big, 1);
          parts.splice(big, 1);
          return attempt();
        }
        lastSaved = what;
        kept.forEach(function (f) { f.saved = true; });
      });
    }
    return attempt().then(function () {
      var news = left.filter(function (f) { return !unkept[f.id]; });
      unkept = {};
      left.forEach(function (f) { unkept[f.id] = true; });
      if (news.length) toast(tooBig(news), null, null, 8000);
      return news;
    });
  }

  // A file's stored form, worked out again only when the file changes, so
  // that saving after a change of view costs next to nothing.
  function storedForm(f) {
    var c = f._stored;
    if (!c || c.account !== f.account || c.mapping !== f.mapping || c.sign !== f.sign || c.read !== f.read || c.text !== f.text) {
      c = f._stored = { account: f.account, mapping: f.mapping, sign: f.sign, read: f.read, text: f.text, json: JSON.stringify(fileRecord(f)) };
    }
    return c.json;
  }

  function fileRecord(f) {
    if (f.format === "pdf") {
      return { id: f.id, name: f.name, account: f.account, pdf: {
        sign: f.sign, currency: f.currency, kind: f.pdf.kind, checks: f.pdf.checks,
        txns: f.read.map(function (t) { return [t.date, t.amount, t.desc]; })
      } };
    }
    return { name: f.name, text: f.text, account: f.account, mapping: f.format === "csv" || f.format === "tsv" ? f.mapping : null };
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
  function readBytes(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsArrayBuffer(file);
    });
  }

  var batch = null;   // { added, files, problems, dupFiles, queue, verified }

  function startBatch() {
    if (!batch) batch = { added: 0, files: 0, problems: [], dupFiles: 0, queue: [], verified: 0 };
    return batch;
  }

  // One import at a time: a PDF may stop to ask for its password, and the
  // review dialog shows one file at a time.
  var importing = Promise.resolve();

  function importFiles(list) {
    var files = [].slice.call(list || []);
    if (!files.length) return;
    if (locked) { toast("Unlock your statements first."); return; }
    importing = importing.then(function () {
      startBatch();
      return Promise.all(files.map(function (f) {
        if (f.size > MAX_FILE) return { name: f.name, error: "is too big to read here (25 MB at most)" };
        return readBytes(f).then(
          function (buf) {
            var pdf = kit.pdf ? kit.pdf.isPdf(buf) : /^%PDF-/.test(F.decodeBytes(buf.slice(0, 5)));
            return pdf ? { name: f.name, bytes: buf } : { name: f.name, text: F.decodeBytes(buf) };
          },
          function () { return { name: f.name, error: "couldn't be read" }; }
        );
      })).then(function (items) {
        // Exports are read at once; PDFs one after another.
        items.forEach(function (it) { if (!it.bytes) ingest(it); });
        return items.reduce(function (chain, it) {
          return it.bytes ? chain.then(function () { return readPdf(it); }) : chain;
        }, Promise.resolve());
      }).then(function () {
        // A file under review finishes the batch when its dialog closes.
        if (!$("dlg-map").open) continueBatch();
      });
    }).then(null, function () {
      batch = null;
      toast("Something went wrong while reading those files.");
    });
  }

  /* PDFs: pdf.js pulls the positioned text out (asking for the password
     of a locked file), then kit.pdf finds the statement in it. The file
     itself is let go once read. */
  function readPdf(item) {
    var b = startBatch();
    if (!kit.pdf) {
      b.problems.push(item.name + " is a PDF, and this browser is too old to read PDFs here.");
      return Promise.resolve();
    }
    toast("Reading " + item.name + "…", null, null, 120000);
    return openPdf(item.bytes, item.name, null).then(function (out) {
      if (!out) { b.problems.push(item.name + " was skipped."); return; }
      ingestPdf(item.name, kit.pdf.parse(out.pages, { name: item.name }), out);
    }, function (err) {
      b.problems.push(pdfProblem(item.name, err));
    }).then(function () { $("toast").hidden = true; });
  }

  function openPdf(bytes, name, password) {
    return kit.pdf.extract(bytes, password).then(function (out) {
      closePassword();
      return out;
    }, function (err) {
      var why = kit.pdf.passwordProblem(err);
      if (!why) { closePassword(); throw err; }
      return askPassword(name, why === "wrong").then(function (pw) {
        return pw == null ? null : openPdf(bytes, name, pw);
      });
    });
  }

  var passWait = null;

  // The dialog stays open while a password is tried, so a wrong one only
  // brings up the hint.
  function askPassword(name, wrong) {
    return new Promise(function (resolve) {
      passWait = resolve;
      $("toast").hidden = true;
      $("pass-intro").textContent = name + " is protected with a password. Type it to read the statement here. " +
        "It is used only to open this file, and isn't kept.";
      $("pass-wrong").hidden = !wrong;
      passBusy(false);
      $("pass-input").value = "";
      var dlg = $("dlg-pass");
      if (!dlg.open) dlg.showModal();
      $("pass-input").focus();
    });
  }

  function answerPassword(pw) {
    var done = passWait;
    if (!done) return;
    passWait = null;
    $("pass-input").value = "";
    if (pw == null) closePassword();
    else passBusy(true);
    done(pw);
  }

  function passBusy(on) {
    $("pass-input").disabled = on;
    $("pass-ok").disabled = on;
    $("pass-ok").textContent = on ? "Opening…" : "Open";
    if (on) $("pass-wrong").hidden = true;
  }

  function closePassword() {
    passBusy(false);
    if ($("dlg-pass").open) $("dlg-pass").close();
  }

  function pdfProblem(name, err) {
    if (err && err.name === "PdfReaderError") {
      return location.protocol === "file:"
        ? name + " is a PDF, and PDFs can only be read when Spendscape is opened from a web address, not from a file on this computer."
        : name + " is a PDF, and the PDF reader couldn't be loaded. Check your connection and try again.";
    }
    return name + " couldn't be read as a PDF" + (err && /invalid|corrupt|damaged|xref|missing pdf/i.test(String(err.name) + " " + String(err.message)) ? ": the file looks damaged" : "") + ".";
  }

  function ingestPdf(name, res, out) {
    var b = startBatch();
    if (!res.txns.length) {
      b.problems.push(res.issues.indexOf("no-text") >= 0
        ? name + " has no text in it (it looks like a scan or a photo), so there is nothing to read. The PDF statements on your bank's website have text, and so do CSV exports."
        : "No transactions were found in " + name + ".");
      return;
    }
    var id = "f" + hash(out.pages.map(function (p) { return p.items.map(function (i) { return i.str; }).join(" "); }).join("\n"));
    var known = state.files.some(function (f) { return f.id === id; }) || b.queue.some(function (f) { return f.id === id; });
    if (known) { b.dupFiles++; return; }
    var issues = res.issues.slice();
    if (out.truncated) issues.push("truncated");
    var file = {
      id: id, name: name, format: "pdf", account: res.account, text: null, rows: null, mapping: null,
      signature: "", delimiter: ",", currency: res.currency || null,
      read: res.txns, sign: "asis", raw: res.txns, skipped: res.skipped, issues: issues,
      pdf: { kind: res.pdf.kind, period: res.pdf.period, checks: res.pdf.checks }
    };
    // A statement that adds up goes straight in; one with doubts gets a look.
    if (issues.length) b.queue.push(file);
    else {
      addFile(file);
      if (file.pdf.checks.length) b.verified++;
    }
  }

  function withSign(txns, sign) {
    if (sign !== "flip") return txns;
    return txns.map(function (t) {
      return { date: t.date, amount: -t.amount, desc: t.desc, memo: t.memo, bankCat: t.bankCat, account: t.account };
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
        ? item.name + " is the text of a PDF. Drop the PDF file itself instead."
        : item.name + " isn't a format Spendscape can read. Try PDF, CSV, OFX, QFX or QIF.");
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
      issues: res.issues,
      sample: !!item.sample
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
      var next = batch.queue.shift();
      if (next.format === "pdf") openPdfReview(next, false);
      else openMapping(next, false);
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
    if (b.verified) msg.push(b.verified === 1 ? "The statement's own totals check out." : "All " + b.verified + " statements' own totals check out.");
    if (b.dupFiles) msg.push(b.dupFiles === 1 ? "That file is already in." : b.dupFiles + " files were already in.");
    msg = msg.concat(b.problems);
    if (msg.length) toast(msg.join(" "), null, null, b.problems.length ? 8000 : 4200);
    if (b.files) {
      saveNow();
      askToKeep();
    }
  }

  function loadSample() {
    var files = kit.sample.generate(new Date());
    startBatch();
    files.forEach(function (f) { f.sample = true; ingest(f); });
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
    $("locked").hidden = !locked;
    document.querySelector(".topbar-actions").hidden = !!locked;
    if (locked) {
      $("welcome").hidden = $("dash").hidden = true;
      renderFoot();
      return;
    }
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
    var mine = state.files.some(function (f) { return !f.sample; });
    n.textContent = locked || !mine ? "" : vault && state.prefs.remember
      ? "They are kept in this browser, locked with your password; change that from the ⋯ menu."
      : "They aren't kept after this tab closes.";
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
  var mapping = { file: null, map: null, existing: false, pdf: false, sign: "asis" };
  var MAP_ROLES = ["date", "desc", "memo", "amount", "type", "debit", "credit", "category"];
  var OPTIONAL = { memo: 1, type: 1, category: 1 };

  // The review dialog serves both spreadsheets (columns to pick) and PDFs
  // (totals checked, signs to confirm).
  function setReviewMode(pdf) {
    mapping.pdf = pdf;
    $("pdf-review").hidden = !pdf;
    document.querySelector("#dlg-map .map-grid").hidden = pdf;
  }

  function openMapping(file, existing) {
    setReviewMode(false);
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
    var res = F.applyMapping(mapping.file.rows, mapping.map);
    showPreview(res);
  }

  function showPreview(res) {
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

  var PDF_SAY = {
    "totals": "Some totals printed on the statement don't match what was read, so a row may be missing or misread. The checks are below.",
    "sign": "Spendscape had to guess which amounts are money in. Check that purchases show as money out.",
    "year": "The statement doesn't say which year it covers, so its dates are placed in the most recent one.",
    "truncated": "Only the first 80 pages were read."
  };

  function openPdfReview(file, existing) {
    setReviewMode(true);
    mapping.file = file;
    mapping.existing = existing;
    mapping.sign = file.sign || "asis";
    var info = file.pdf || {}, period = info.period && info.period.how === "range" ? info.period : null;
    $("map-title").textContent = existing ? "How " + file.name + " was read" : "Check " + file.name;
    $("map-intro").textContent = (info.kind === "card" ? "Read as a card statement" : info.kind === "bank" ? "Read as a bank statement" : "Read from the PDF") +
      (period ? ", " + A.formatDay(period.from) + " to " + A.formatDay(period.to) : "") +
      ". Make sure the preview looks right: spending should show as money out.";
    var notes = $("map-notes");
    clear(notes);
    (existing ? [] : file.issues).forEach(function (i) { if (PDF_SAY[i]) el("li", null, notes, PDF_SAY[i]); });
    var list = $("pdf-checks");
    clear(list);
    (info.checks || []).forEach(function (c) {
      var li = el("li", c.ok ? "is-ok" : "is-off", list);
      el("span", "mark", li, c.ok ? "✓" : "!").setAttribute("aria-label", c.ok ? "matches" : "doesn't match");
      el("span", null, li, checkText(c, file.currency));
    });
    list.hidden = !list.childNodes.length;
    $("map-remember").parentNode.hidden = true;
    syncPdfSign();
    var dlg = $("dlg-map");
    if (!dlg.open) dlg.showModal();
  }

  function checkText(c, cur) {
    var fmt = function (v) {
      try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || currency }).format(v); } catch (e) { return v.toFixed(2); }
    };
    var label = /[a-z]/.test(c.label) ? c.label : c.label.charAt(0) + c.label.slice(1).toLowerCase();
    if (c.kind === "balance") {
      return "Opening balance and these transactions come to the closing balance of " + fmt(c.expected) + (c.ok ? "" : ", but what was read comes to " + fmt(c.got));
    }
    if (c.kind === "columns") {
      var e = c.expected, g = c.got;
      return "Column totals: " + (e["in"] != null ? fmt(e["in"]) + " in" : "") + (e["in"] != null && e.out != null ? ", " : "") + (e.out != null ? fmt(e.out) + " out" : "") +
        (c.ok ? "" : ", but what was read comes to " + fmt(g["in"]) + " in, " + fmt(g.out) + " out");
    }
    return label + ": " + fmt(c.expected) + (c.ok ? "" : ", but what was read comes to " + fmt(c.got));
  }

  function syncPdfSign() {
    [].forEach.call($("pdf-sign").querySelectorAll("button"), function (b) {
      b.setAttribute("aria-checked", b.getAttribute("data-sign") === mapping.sign ? "true" : "false");
    });
    showPreview({ txns: withSign(mapping.file.read, mapping.sign), skipped: mapping.file.skipped });
  }

  function acceptPdf() {
    var file = mapping.file;
    file.sign = mapping.sign;
    file.raw = withSign(file.read, file.sign);
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

  function acceptMapping() {
    if (mapping.pdf) { acceptPdf(); return; }
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
      } else if (f.format === "pdf") {
        var look = el("button", "tool", actions, "Review");
        look.type = "button";
        look.addEventListener("click", function () { openPdfReview(f, true); });
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
        (f.skipped ? " · " + f.skipped + " rows skipped" : "") +
        (f.pdf && f.pdf.checks.length ? (f.pdf.checks.every(function (c) { return c.ok; }) ? " · totals check out" : " · totals differ") : "") +
        (f.sample ? " · sample data, not kept" : unkept[f.id] ? " · too big to keep in this browser" : ""));
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
    $("remember-toggle").checked = !!vault && state.prefs.remember;
    $("remember-toggle").disabled = !Vault.supported();
    $("menu-password").hidden = !vault || !state.prefs.remember;
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
  // At start: display choices at once; a vault waits for its password on
  // the lock screen; readable data from an older version is loaded and
  // the user asked to lock it.
  function restore() {
    var s = loadStore();
    applyPrefs(s);
    if (s.vault) { locked = s.vault; return; }
    if ((s.v || 1) >= STORE_VERSION) return;
    var files = state.prefs.remember && s.files ? s.files : [];
    if (!files.length && isEmpty(s.rules || {}) && isEmpty(s.overrides || {}) && isEmpty(s.layouts || {})) return;
    legacy = true;
    applyPayload({ rules: s.rules, overrides: s.overrides, layouts: s.layouts, files: files });
    rebuild();
    resetView();
  }

  function applyPrefs(s) {
    var p = s.prefs || {};
    if (p.gran) state.prefs.gran = p.gran;
    if (p.mode) state.prefs.mode = p.mode;
    if (p.hidden) state.prefs.hidden = p.hidden;
    if (p.currency) state.prefs.currency = p.currency;
    if (p.preset) state.prefs.preset = p.preset;
    // An "off" saved before version 2 was only the old default.
    state.prefs.remember = (s.v || 1) >= 2 ? p.remember !== false : true;
  }

  // What a vault (or an older readable store) holds, put to use. What only
  // this tab has stays: sample data, statements too big to keep, and any
  // not saved yet.
  function applyPayload(d) {
    var mine = state.files;
    state.rules = d.rules || {};
    state.overrides = d.overrides || {};
    state.layouts = d.layouts || {};
    state.files = [];
    (d.files || []).forEach(function (sf) {
      try { restoreFile(sf); } catch (e) { /* a damaged record is dropped */ }
    });
    mine.forEach(function (f) {
      if ((f.sample || unkept[f.id] || !f.saved) && !state.files.some(function (x) { return x.id === f.id; })) state.files.push(f);
    });
  }

  /* ── Lock screen ─────────────────────────────────────────────────── */
  function unlock() {
    var input = $("unlock-input"), pw = input.value, sealed = locked;
    if (!pw || !sealed) { input.focus(); return; }
    $("unlock-ok").disabled = input.disabled = true;
    $("unlock-ok").textContent = "Unlocking…";
    $("unlock-error").hidden = true;
    Vault.unlock(pw, sealed).then(function (r) {
      if (locked !== sealed) return;   // what is stored changed meanwhile: try again
      vault = r.vault;
      locked = null;
      keepAsked = true;
      applyPayload(JSON.parse(r.text));
      rebuild();
      resetView();
      lastSaved = prefsJson() + "\n" + r.text;
      render(true);
      saveNow();   // anything this tab added while locked
    }, function (err) {
      var e = $("unlock-error");
      e.textContent = err && err.name === "WrongPassword" ? "That password didn't unlock them. Try again." : "This browser couldn't unlock them.";
      e.hidden = false;
    }).then(function () {
      input.value = "";
      $("unlock-ok").disabled = input.disabled = false;
      $("unlock-ok").textContent = "Unlock";
      if (locked) input.focus();
    });
  }

  function startOver() {
    if (!window.confirm("Start over? This deletes the statements and category changes locked in this browser. It can't be undone.")) return;
    locked = vault = null;
    legacy = keepAsked = false;
    state.files = [];
    state.all = [];
    state.rules = {};
    state.overrides = {};
    state.layouts = {};
    unkept = {};
    lastSaved = null;
    state.view.range = null;
    render(true);
    saveNow();
    toast("Everything that was locked is deleted. Add your statements to start again.");
  }

  // Another tab locked with a password this one doesn't hold: lock here
  // too. Anything only this tab had waits for the unlock.
  function lockTab(sealed, why) {
    locked = sealed;
    vault = null;
    lastSaved = null;
    state.files = state.files.filter(function (f) { return !f.saved && !f.sample; });
    state.all = [];
    ["dlg-files", "dlg-map", "dlg-lock"].forEach(function (id) { if ($(id).open) $(id).close(); });
    closeMenu();
    closeCatPop(false);
    $("locked-text").textContent = why;
    render(true);
  }

  /* ── Choosing a password ─────────────────────────────────────────── */
  var lockMode = null;
  var LOCK_TEXT = {
    first: ["Keep your statements, locked",
      "Spendscape can keep these statements in this browser for next time, encrypted with a password you choose. You'll type it each time you open Spendscape.",
      "Don't keep them", "Lock and keep"],
    menu: ["Keep your statements, locked",
      "Your statements will be kept in this browser, encrypted with a password you choose. You'll type it each time you open Spendscape.",
      "Cancel", "Lock and keep"],
    legacy: ["Lock what Spendscape kept",
      "Spendscape now keeps statements and category changes only encrypted with a password you choose. Choose one to keep what this browser holds; otherwise it is removed.",
      "Remove it", "Lock and keep"],
    change: ["Change your password", "Your statements will be locked with the new password from now on.", "Cancel", "Change password"]
  };

  function openLockDialog(mode) {
    lockMode = mode;
    var t = LOCK_TEXT[mode];
    $("lock-title").textContent = t[0];
    $("lock-intro").textContent = t[1];
    $("lock-skip").textContent = t[2];
    $("lock-ok").textContent = t[3];
    $("lock-pass").value = $("lock-pass2").value = "";
    $("lock-error").hidden = true;
    lockBusy(false);
    var dlg = $("dlg-lock");
    if (!dlg.open) dlg.showModal();
    $("lock-pass").focus();
  }

  function lockBusy(on) {
    $("lock-pass").disabled = $("lock-pass2").disabled = $("lock-ok").disabled = $("lock-skip").disabled = on;
    if (on) $("lock-ok").textContent = "Locking…";
    else if (lockMode) $("lock-ok").textContent = LOCK_TEXT[lockMode][3];
  }

  function submitLock() {
    var a = $("lock-pass").value, b = $("lock-pass2").value, err = $("lock-error");
    var problem = a.length < 8 ? "Use at least 8 characters." : a !== b ? "The two passwords don't match." : "";
    if (problem) {
      err.textContent = problem;
      err.hidden = false;
      $(a.length < 8 ? "lock-pass" : "lock-pass2").focus();
      return;
    }
    var mode = lockMode;
    lockBusy(true);
    Vault.create(a).then(function (v) {
      $("lock-pass").value = $("lock-pass2").value = "";
      lockMode = null;
      $("dlg-lock").close();
      vault = v;
      legacy = false;
      keepAsked = true;
      state.prefs.remember = true;
      lastSaved = null;
      renderFoot();
      return saveNow().then(function (news) {
        var done = mode === "change" ? "Your password is changed." : "Your statements are kept in this browser, locked with your password.";
        toast(news.length ? done + " " + tooBig(news) : done, null, null, news.length ? 8000 : 0);
      });
    }, function () {
      lockBusy(false);
      err.textContent = "This browser couldn't lock them.";
      err.hidden = false;
    });
  }

  // "Don't keep them" / "Remove it" / "Cancel" (skip), or the dialog closed
  // (later: nothing kept for now, and asked again another time).
  function closeLock(skip) {
    var mode = lockMode;
    lockMode = null;
    $("lock-pass").value = $("lock-pass2").value = "";
    if ($("dlg-lock").open) $("dlg-lock").close();
    if (!skip) return;
    if (mode === "first") {
      state.prefs.remember = false;
      saveNow();
      toast("Your statements won't be kept after this tab closes. You can change that in the ⋯ menu.");
    } else if (mode === "legacy") {
      legacy = false;
      state.prefs.remember = false;
      lastSaved = null;
      saveNow();
      toast("What Spendscape kept in this browser is removed. It stays on screen until you close this tab.");
    }
    renderFoot();
  }

  // After statements come in: ask once a visit whether to keep them.
  function askToKeep() {
    if (vault || locked || legacy || keepAsked || !state.prefs.remember || !Vault.supported()) return;
    if (!state.files.some(function (f) { return !f.sample; })) return;
    keepAsked = true;
    openLockDialog("first");
  }

  /* ── Other tabs ──────────────────────────────────────────────────── */
  // Another Spendscape tab saved. Follow it, so this tab never writes an
  // older copy back over statements added or removed there.
  function onStoreChanged(cleared) {
    lastSaved = null;
    if (cleared) {
      // Another page on this site cleared all of its storage: put ours back.
      if (locked) {
        try { localStorage.setItem(STORE_KEY, '{"v":' + STORE_VERSION + ',"prefs":' + prefsJson() + ',"vault":' + JSON.stringify(locked) + "}"); } catch (e) { /* full */ }
        return Promise.resolve();
      }
      return saveNow();
    }
    var s = loadStore();
    applyPrefs(s);
    if (locked) {
      // Still locked here: the password will open whatever is stored now.
      if (s.vault) locked = s.vault;
      else { locked = null; rebuild(); }
      render(true);
      return Promise.resolve();
    }
    if (!s.vault) {
      if (legacy) legacy = false;
      if (!state.prefs.remember) {
        // The other tab stopped keeping statements: this one keeps showing
        // them until it closes.
        vault = null;
      } else if (vault) {
        // It holds nothing now (all removed, or started over).
        vault = null;
        keepAsked = false;
        applyPayload({});
      }
      adopt();
      return Promise.resolve();
    }
    if (vault && Vault.sameSalt(vault, s.vault)) {
      return Vault.open(vault, s.vault).then(function (text) {
        applyPayload(JSON.parse(text));
        lastSaved = prefsJson() + "\n" + text;
        adopt();
      }, function () {
        lockTab(s.vault, "Your statements were locked again in another tab. Type the password to open them here.");
      });
    }
    lockTab(s.vault, vault ? "The password was changed in another tab. Type the new one to open your statements here."
      : "Your statements were locked in another tab. Type the password to open them here.");
    legacy = false;
    return Promise.resolve();
  }

  function adopt() {
    rebuild();
    if (state.all.length) clampView(); else state.view.range = null;
    adopting = true;
    try { render(true); } finally { adopting = false; }
    if ($("dlg-files").open) renderFiles();
  }

  function restoreFile(sf) {
    if (sf.pdf) {
      var read = (sf.pdf.txns || []).map(function (r) { return { date: r[0], amount: r[1], desc: r[2], memo: "", bankCat: "", account: "" }; });
      state.files.push({
        id: sf.id || "f" + hash(JSON.stringify(sf.pdf.txns)), name: sf.name, format: "pdf", account: sf.account,
        text: null, rows: null, mapping: null, signature: "", delimiter: ",", currency: sf.pdf.currency || null,
        read: read, sign: sf.pdf.sign || "asis", raw: withSign(read, sf.pdf.sign), skipped: 0, issues: [],
        pdf: { kind: sf.pdf.kind || "unknown", period: null, checks: sf.pdf.checks || [] }, saved: true
      });
      return;
    }
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
      currency: res.currency || null, raw: res.txns, skipped: res.skipped, issues: [], saved: true
    });
  }

  /* ── Wiring ──────────────────────────────────────────────────────── */
  function wire() {
    // A save still waiting on its timer is made before the page goes away,
    // so a statement dropped in just before closing the tab is kept.
    var flush = function () { if (saveTimer) saveNow(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
    var following = Promise.resolve();
    window.addEventListener("storage", function (e) {
      if (e.key !== STORE_KEY && e.key !== null) return;
      following = following.then(function () { return onStoreChanged(e.key === null); }).then(null, function () { /* keep following */ });
    });
    $("unlock-form").addEventListener("submit", function (e) { e.preventDefault(); unlock(); });
    $("unlock-forgot").addEventListener("click", startOver);
    $("lock-form").addEventListener("submit", function (e) { e.preventDefault(); submitLock(); });
    $("lock-skip").addEventListener("click", function () { closeLock(true); });
    $("dlg-lock").addEventListener("cancel", function (e) { e.preventDefault(); closeLock(false); });
    $("dlg-lock").querySelector(".sheet-x").addEventListener("submit", function (e) { e.preventDefault(); closeLock(false); });
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
    // Keeping statements needs a password; stopping deletes the locked copy.
    $("remember-toggle").addEventListener("change", function () {
      if (this.checked && !vault) {
        this.checked = false;
        closeMenu();
        openLockDialog("menu");
        return;
      }
      state.prefs.remember = this.checked;
      if (!this.checked) {
        vault = null;
        legacy = false;
        keepAsked = true;
      }
      $("menu-password").hidden = !vault;
      lastSaved = null;
      saveNow();
      renderFoot();
      toast(this.checked ? "Your statements are kept in this browser, locked with your password."
        : "Your statements are no longer kept in this browser, and the locked copy is deleted. They stay on screen until you close this tab.");
    });
    $("menu-password").addEventListener("click", function () {
      closeMenu();
      openLockDialog("change");
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
      state.prefs = { gran: "month", mode: "bars", hidden: {}, currency: "", remember: true, account: "", preset: "" };
      unkept = {};
      lastSaved = null;
      vault = locked = null;
      legacy = keepAsked = false;
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
    $("pdf-sign").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      mapping.sign = b.getAttribute("data-sign");
      syncPdfSign();
    });
    radioKeys($("pdf-sign"));
    $("pass-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = $("pass-input").value;
      if (pw) answerPassword(pw);
      else $("pass-input").focus();
    });
    $("pass-skip").addEventListener("click", function () { answerPassword(null); });
    $("dlg-pass").addEventListener("cancel", function (e) { e.preventDefault(); answerPassword(null); });
    $("dlg-pass").querySelector(".sheet-x").addEventListener("submit", function (e) { e.preventDefault(); answerPassword(null); });
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
        files: state.files.map(function (f) {
          return { name: f.name, format: f.format, account: f.account, count: f.raw.length, mapping: f.mapping,
            sign: f.sign || null, checks: f.pdf ? f.pdf.checks.map(function (c) { return c.ok; }) : null };
        }),
        count: state.all.length,
        remember: state.prefs.remember,
        locked: !!locked,
        vault: !!vault,
        legacy: legacy,
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
  if (legacy) openLockDialog("legacy");
  else if (locked) $("unlock-input").focus();
})();
