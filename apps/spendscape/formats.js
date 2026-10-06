/* ── Spendscape · statement formats ─────────────────────────────────────
   Turns the text of a bank export into plain transactions:

     { date, amount, desc, memo, bankCat, account }

   `date` is a UTC day number (days since 1970-01-01) so bucketing never
   trips over time zones, and `amount` is signed from the account holder's
   side: negative is money out, positive is money in.

   Reads CSV/TSV with any delimiter and any column order, with or without
   a header row, plus OFX/QFX and QIF. Banks disagree about almost
   everything -- date order, decimal commas, which sign a purchase gets --
   so each of those is inferred from the data and reported back, and the
   app lets the user overrule any of it.

   Pure functions only: no DOM, no storage.                              */
(function (kit) {
  "use strict";

  var DAY_MS = 864e5;

  /* ── Small helpers ───────────────────────────────────────────────── */
  function stripAccents(s) {
    return s.normalize ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : s;
  }

  function norm(s) {
    return stripAccents(String(s || "").toLowerCase())
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function cell(row, i) {
    return i >= 0 && i < row.length ? row[i] : "";
  }

  function isBlankRow(row) {
    for (var i = 0; i < row.length; i++) if (String(row[i]).trim()) return false;
    return true;
  }

  function collapse(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  // Descriptions keep their runs of spaces: banks pad the merchant and the
  // location apart with them, and the merchant cleaner cuts there.
  function tidy(s) {
    return String(s || "").replace(/[\t\r\n\u00a0]+/g, " ").trim();
  }

  function round2(v) {
    return Math.round(v * 100) / 100;
  }

  function decodeEntities(s) {
    return s
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
      .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); })
      .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&amp;/gi, "&");
  }

  /* ── Dates ───────────────────────────────────────────────────────── */
  function dayOf(y, m, d) {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200)) return null;
    var t = Date.UTC(y, m - 1, d);
    var dt = new Date(t);
    if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return Math.round(t / DAY_MS);
  }

  function ymd(day) {
    var dt = new Date(day * DAY_MS);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  function isoOf(day) {
    var p = ymd(day);
    return p.y + "-" + (p.m < 10 ? "0" : "") + p.m + "-" + (p.d < 10 ? "0" : "") + p.d;
  }

  function fullYear(y) {
    if (y >= 100) return y;
    var now = new Date().getUTCFullYear();
    return 2000 + y > now + 5 ? 1900 + y : 2000 + y;
  }

  // English plus the common European abbreviations, keyed by their first
  // three letters with accents stripped.
  var MONTHS = {
    jan: 1, ene: 1, gen: 1,
    feb: 2, fev: 2,
    mar: 3, mrz: 3, maa: 3,
    apr: 4, avr: 4, abr: 4,
    may: 5, mai: 5, mag: 5, mei: 5,
    jun: 6, giu: 6,
    jul: 7, lug: 7,
    aug: 8, aou: 8, ago: 8,
    sep: 9, set: 9,
    oct: 10, okt: 10, ott: 10, out: 10,
    nov: 11,
    dec: 12, dez: 12, dic: 12
  };

  function monthFromName(s) {
    var n = stripAccents(String(s).toLowerCase());
    if (n.indexOf("juin") === 0) return 6;
    if (n.indexOf("juil") === 0) return 7;
    return MONTHS[n.slice(0, 3)] || 0;
  }

  var NUMERIC_DATE = /^(\d{1,2})\s*[-\/.]\s*(\d{1,2})\s*[-\/.']\s*(\d{4}|\d{2})(?!\d)/;

  /* One date string to a day number. `order` ("MDY" or "DMY") only matters
     for all-numeric dates that could be read either way, like 03/04/2025;
     year-first, compact and month-name forms carry their own order. */
  function parseDate(raw, order) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s) return null;
    var m;

    if ((m = /^(\d{4})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{1,2})(?!\d)/.exec(s))) {
      return dayOf(+m[1], +m[2], +m[3]);
    }
    // Compact 20250304, optionally with a time and zone as OFX writes them.
    if ((m = /^(\d{4})(\d{2})(\d{2})(?:\d{4,6})?(?:\.\d+)?(?:\s*\[.*\])?$/.exec(s))) {
      return dayOf(+m[1], +m[2], +m[3]);
    }
    if ((m = NUMERIC_DATE.exec(s))) {
      var a = +m[1], b = +m[2], y = fullYear(+m[3]);
      return order === "DMY" ? dayOf(y, b, a) : dayOf(y, a, b);
    }

    s = s.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, "");
    if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.]*([a-zÀ-ÿ]{3,})\.?[\s\-\/.,]*(\d{4}|\d{2})(?!\d)/i.exec(s))) {
      var mo = monthFromName(m[2]);
      if (mo) return dayOf(fullYear(+m[3]), mo, +m[1]);
    }
    if ((m = /^([a-zÀ-ÿ]{3,})\.?[\s\-\/.]*(\d{1,2})(?:st|nd|rd|th)?,?[\s\-\/.,]*(\d{4}|\d{2})(?!\d)/i.exec(s))) {
      var mo2 = monthFromName(m[1]);
      if (mo2) return dayOf(fullYear(+m[3]), mo2, +m[2]);
    }
    return null;
  }

  function localeOrder() {
    var lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
    return /^en(-US|-PH)?$/i.test(lang) ? "MDY" : "DMY";
  }

  /* Settle MDY vs DMY for a whole column. A value above 12 in either slot
     decides it outright. Failing that, statements are sorted, so the reading
     that keeps consecutive rows in order wins; failing that, the locale. */
  function inferDateOrder(values) {
    var aBig = 0, bBig = 0, triples = [];
    values.forEach(function (v) {
      var m = NUMERIC_DATE.exec(String(v || "").trim());
      if (!m) return;
      var a = +m[1], b = +m[2];
      if (a > 12) aBig++;
      if (b > 12) bBig++;
      triples.push([a, b, fullYear(+m[3])]);
    });
    if (!triples.length) return { order: "MDY", ambiguous: false, by: "none" };
    if (aBig > bBig) return { order: "DMY", ambiguous: false, by: "values" };
    if (bBig > aBig) return { order: "MDY", ambiguous: false, by: "values" };

    function disorder(order) {
      var asc = 0, desc = 0, bad = 0, prev = null;
      triples.forEach(function (t) {
        var d = order === "DMY" ? dayOf(t[2], t[1], t[0]) : dayOf(t[2], t[0], t[1]);
        if (d == null) { bad++; return; }
        if (prev != null) {
          if (d < prev) asc++;
          else if (d > prev) desc++;
        }
        prev = d;
      });
      return bad * 4 + Math.min(asc, desc);
    }
    var mdy = disorder("MDY"), dmy = disorder("DMY");
    if (mdy !== dmy) return { order: mdy < dmy ? "MDY" : "DMY", ambiguous: true, by: "order" };
    return { order: localeOrder(), ambiguous: true, by: "locale" };
  }

  /* ── Amounts ─────────────────────────────────────────────────────── */
  var CURRENCY_CODES = "USD|EUR|GBP|CAD|AUD|NZD|CHF|JPY|INR|SEK|NOK|DKK|PLN|CZK|HUF|SGD|HKD|MXN|BRL|ZAR|CNY|RMB|KRW|TRY|ILS|AED|SAR|PHP|THB|IDR|MYR|NGN|RON|BGN";
  var CURRENCY_WORDS = new RegExp("(^|[\\s\\d])(" + CURRENCY_CODES + "|US|CA|AU|NZ|HK|kr|Kr|zł|Kč|Fr|Ft|lei|RM|Rp|R)\\.?(?=$|[\\s\\d-])", "g");
  // Longest first, so "R$" is read as reais before "$" claims it.
  var CURRENCY_SIGNS = [["r$", "BRL"], ["us$", "USD"], ["$", "USD"], ["£", "GBP"], ["€", "EUR"], ["¥", "JPY"], ["₹", "INR"], ["₩", "KRW"], ["₺", "TRY"], ["₪", "ILS"], ["₱", "PHP"], ["฿", "THB"], ["₦", "NGN"], ["zł", "PLN"], ["kč", "CZK"]];

  /* One amount string to a number, or null when it is not a number at all.
     Copes with currency signs and codes, thousands separators of every kind,
     decimal commas, (parentheses) and trailing minus for negatives, and CR/DR
     suffixes. `decimal` is the column's decimal mark when known. Any other
     letters mean it is text ("CHECK 1234"), not an amount. */
  function parseAmount(raw, decimal) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s) return null;
    var neg = false, m;

    s = s.replace(/[−‒–—]/g, "-");
    if ((m = /^\((.*)\)$/.exec(s))) { neg = true; s = m[1].trim(); }
    if ((m = /^(.*\d)\s*(CR|DR|DB)\.?$/i.exec(s))) {
      s = m[1];
      if (m[2].toUpperCase() !== "CR") neg = !neg;
    }
    // Drop currency codes and symbols wherever they sit: "$-1.00", "-$1.00",
    // "EUR 1,00", "1.00 USD", "12,50 €".
    s = s.replace(/[$£€¥₹₩₽₺₪₱₫฿₦¢]/g, " ").replace(CURRENCY_WORDS, "$1 ").trim();
    if (/[A-Za-zÀ-ɏ]/.test(s)) return null;
    if ((m = /^\((.*)\)$/.exec(s))) { neg = !neg; s = m[1].trim(); }
    if (s.charAt(0) === "-" || s.charAt(0) === "+") {
      if (s.charAt(0) === "-") neg = !neg;
      s = s.slice(1).trim();
    }
    if (s.charAt(s.length - 1) === "-") { neg = !neg; s = s.slice(0, -1).trim(); }
    s = s.replace(/[\s\u00a0\u202f'\u2019]/g, "");
    if (!/^[\d.,]*\d[\d.,]*$/.test(s)) return null;

    var dec = decimal || guessDecimal(s);
    if (dec === ",") {
      s = s.replace(/\./g, "");
      var last = s.lastIndexOf(",");
      if (last >= 0) s = s.slice(0, last).replace(/,/g, "") + "." + s.slice(last + 1);
    } else {
      s = s.replace(/,/g, "");
      // A stray second dot ("1.234.56") is a thousands mark gone wrong.
      var dots = s.split(".");
      if (dots.length > 2) s = dots.slice(0, -1).join("") + "." + dots[dots.length - 1];
    }
    var v = parseFloat(s);
    if (!isFinite(v)) return null;
    return neg ? -v : v;
  }

  function guessDecimal(s) {
    var d = s.lastIndexOf("."), c = s.lastIndexOf(",");
    if (d >= 0 && c >= 0) return d > c ? "." : ",";
    if (c >= 0) return /,\d{1,2}$/.test(s) ? "," : ".";
    return ".";
  }

  // Decide the decimal mark for a whole column. Only values that say it
  // outright vote: "1,234.56", "12,50", "3.5". "1.234" says nothing.
  function inferDecimal(values) {
    var dot = 0, comma = 0;
    values.forEach(function (v) {
      var s = String(v || "").replace(/[^\d.,]/g, "");
      var d = s.lastIndexOf("."), c = s.lastIndexOf(",");
      if (d >= 0 && c >= 0) {
        if (d > c) dot++; else comma++;
      } else if (c >= 0) {
        if (/,\d{1,2}$/.test(s)) comma++;
      } else if (d >= 0) {
        if (/\.\d{1,2}$/.test(s) || /\.\d{4,}$/.test(s)) dot++;
      }
    });
    return comma > dot ? "," : ".";
  }

  function currencyIn(values) {
    var counts = {};
    var codeRe = new RegExp("\\b(" + CURRENCY_CODES + ")\\b");
    values.forEach(function (v) {
      var s = String(v || "");
      var code = codeRe.exec(s.toUpperCase());
      if (code) {
        counts[code[1]] = (counts[code[1]] || 0) + 1;
        return;
      }
      var low = s.toLowerCase();
      for (var i = 0; i < CURRENCY_SIGNS.length; i++) {
        if (low.indexOf(CURRENCY_SIGNS[i][0]) >= 0 && /\d/.test(s)) {
          counts[CURRENCY_SIGNS[i][1]] = (counts[CURRENCY_SIGNS[i][1]] || 0) + 1;
          return;
        }
      }
    });
    var best = null, n = 0;
    for (var k in counts) if (counts[k] > n) { best = k; n = counts[k]; }
    return best;
  }

  /* ── Sign evidence ───────────────────────────────────────────────── */
  // Descriptions that say which way money moved, whatever sign the bank
  // gave them. Used to tell "purchases are negative" from "purchases are
  // positive" files, and to give unsigned amounts a direction.
  var IN_HINT = /\b(payroll|salary|direct dep|dir dep|deposit|refund|returned|interest (paid|earned|credit|payment)|dividend|payment.{0,16}thank|thank you|payment received|cash ?back|reversal|credit adj|transfer from|from savings|reimburse|wages|paycheck|tax refund)/i;
  var OUT_HINT = /\b(purchase|pos\b|debit card|card purchase|withdrawal|atm\b|fee\b|amazon|amzn|uber|lyft|starbucks|walmart|target|costco|restaurant|cafe|coffee|grocery|market|netflix|spotify|shell|chevron|exxon|mcdonald|doordash|transfer to|bill pay|rent\b|mortgage|insurance)/i;

  function hintDirection(text) {
    if (IN_HINT.test(text)) return 1;
    if (OUT_HINT.test(text)) return -1;
    return 0;
  }

  function typeDirection(v) {
    var s = norm(v);
    if (!s) return 0;
    if (/^(d|dr|db|debit|debits|withdrawal|withdrawals|withdraw|out|outgoing|sale|purchase|pos|atm|fee|charge|check|cheque|ach debit|direct debit|standing order|bill payment|af)\b/.test(s)) return -1;
    if (/^(c|cr|credit|credits|deposit|deposits|in|incoming|refund|return|interest|dividend|income|salary|payroll|ach credit|direct deposit|bij)\b/.test(s)) return 1;
    return 0;
  }

  /* ── Delimited text ──────────────────────────────────────────────── */
  // RFC 4180 with the usual real-world slack: a quote only opens a field at
  // its start, doubled quotes escape, and newlines inside quotes are kept.
  function parseDelimited(text, delim) {
    var rows = [], row = [], field = "", inQ = false, i = 0, n = text.length, start = 0;
    while (i < n) {
      var c = text.charCodeAt(i);
      if (inQ) {
        if (c === 34) {
          if (text.charCodeAt(i + 1) === 34) { field += text.slice(start, i + 1); i += 2; start = i; continue; }
          field += text.slice(start, i);
          inQ = false; i++; start = i;
          continue;
        }
        i++;
        continue;
      }
      if (c === 34 && (field + text.slice(start, i)).trim() === "") {
        field = ""; inQ = true; i++; start = i;
        continue;
      }
      var ch = text.charAt(i);
      if (ch === delim) {
        row.push(field + text.slice(start, i));
        field = ""; i++; start = i;
        continue;
      }
      if (c === 10 || c === 13) {
        row.push(field + text.slice(start, i));
        rows.push(row);
        row = []; field = "";
        if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
        i++; start = i;
        continue;
      }
      i++;
    }
    var tail = field + text.slice(start, n);
    if (tail !== "" || row.length) { row.push(tail); rows.push(row); }
    for (var r = 0; r < rows.length; r++) {
      for (var k = 0; k < rows[r].length; k++) rows[r][k] = rows[r][k].trim();
    }
    return rows;
  }

  function detectDelimiter(text) {
    var sample = text.slice(0, 30000);
    var best = ",", bestScore = 0;
    [",", ";", "\t", "|"].forEach(function (d) {
      var rows = parseDelimited(sample, d).filter(function (r) { return !isBlankRow(r); }).slice(0, 60);
      if (!rows.length) return;
      var counts = {};
      rows.forEach(function (r) { counts[r.length] = (counts[r.length] || 0) + 1; });
      var mode = 0, modeN = 0;
      for (var k in counts) if (counts[k] > modeN || (counts[k] === modeN && +k > mode)) { mode = +k; modeN = counts[k]; }
      if (mode < 2) return;
      var consistency = modeN / rows.length;
      var score = consistency * consistency * Math.min(mode, 12);
      if (score > bestScore) { bestScore = score; best = d; }
    });
    return best;
  }

  /* ── Column roles ────────────────────────────────────────────────── */
  // Header patterns per role, matched against the normalised header text,
  // strongest first. English plus the usual European bank headings.
  var ROLE_PATTERNS = {
    date: [
      [/^(transaction|trans|txn|purchase|operation)? ?date$/, 10],
      [/^(datum|fecha|data|date operation|date de l operation|buchungstag|transaktionsdatum|boekingsdatum)$/, 9],
      [/^(posting|post|posted|booking|value|effective|settlement|processed|process|clearing) ?date$/, 7],
      [/^(valuta|wertstellung|valutadatum)$/, 6],
      [/^(when|day)$/, 6],
      [/\bdate\b|datum|fecha/, 5]
    ],
    // Payee-style columns hold cleaner names than free-text descriptions, so
    // they edge ahead; the description then still feeds the categoriser as
    // the memo.
    desc: [
      [/^(payee|payee name|merchant|merchant name|name|beneficiary|counterparty|counter party|recipient|beguenstigter zahlungspflichtiger|name zahlungsbeteiligter|auftraggeber empfaenger|empfaenger|naam)$/, 11],
      [/^(description|transaction description|details|transaction details|narrative|narration|particulars|description 1|libelle|libelle operation|concepto|omschrijving|naam omschrijving|beschreibung|buchungstext|verwendungszweck)$/, 10],
      [/^(transaction|merchant description|payee description|title|item|what|where|who|shop|store)$/, 7],
      [/descr|detail|narrat|payee|merchant|beschreibung|libelle|concepto|omschrijving|empfaenger|auftraggeber|counterparty/, 6]
    ],
    memo: [
      [/^(memo|notes|note|reference|ref|remarks|additional info|additional information|extended description|description 2|original description|purpose|verwendungszweck|mededelingen)$/, 8],
      [/memo|referen|remark/, 4]
    ],
    amount: [
      [/^(amount|transaction amount|amt|value|net amount|sum|betrag|umsatz|montant|importe|bedrag|kwota|belopp|valor|amount \w{3}|amount in \w{3}|betrag \w{3}|amount \w{3} \w*)$/, 10],
      [/^(how much|cost|price|total|sum total)$/, 7],
      [/amount|betrag|montant|importe|bedrag/, 6]
    ],
    debit: [
      [/^(debit|debits|debit amount|withdrawal|withdrawals|withdrawal amount|money out|paid out|out|outflow|outgoing|spent|charge|charges|soll|ausgang|sortie|debit \w{3}|cargo|af)$/, 10],
      [/debit|withdraw|money out|paid out|outflow/, 6]
    ],
    credit: [
      [/^(credit|credits|credit amount|deposit|deposits|deposit amount|money in|paid in|in|inflow|incoming|received|haben|eingang|entree|credit \w{3}|abono|bij)$/, 10],
      [/credit|deposit|money in|paid in|inflow/, 6]
    ],
    type: [
      [/^(type|transaction type|trans type|txn type|dr cr|cr dr|debit credit|credit debit|d c|c d|debit credit indicator|credit debit indicator|direction|sign|af bij)$/, 9],
      [/\btype\b|indicator/, 4]
    ],
    category: [
      [/^(category|categories|transaction category|category name|spending category|kategorie|categorie|categoria)$/, 10],
      [/categor/, 6]
    ],
    balance: [
      [/^(balance|running balance|running bal|bal|available balance|current balance|ledger balance|closing balance|saldo|solde|kontostand|balance \w{3})$/, 10],
      [/balance|saldo|solde/, 6]
    ],
    currency: [[/^(currency|currency code|ccy|curr|waehrung|wahrung|devise|moneda|valuta code)$/, 10]],
    account: [[/^(account|account name|account number|acct|account no|konto|compte|cuenta)$/, 8]]
  };
  var ROLES = ["date", "desc", "memo", "amount", "debit", "credit", "type", "category", "balance", "currency", "account"];

  function roleScore(header, role) {
    var h = norm(header);
    if (!h) return 0;
    var list = ROLE_PATTERNS[role];
    for (var i = 0; i < list.length; i++) if (list[i][0].test(h)) return list[i][1];
    return 0;
  }

  function looksLikeHeader(row) {
    var hits = 0, filled = 0, valueLike = 0;
    row.forEach(function (c) {
      if (!String(c).trim()) return;
      filled++;
      if (parseDate(c, "MDY") != null || parseAmount(c) != null) valueLike++;
      for (var r = 0; r < ROLES.length; r++) {
        if (roleScore(c, ROLES[r]) >= 6) { hits++; break; }
      }
    });
    return filled >= 2 && hits >= 2 && valueLike === 0 ? hits : 0;
  }

  function findHeaderRow(rows) {
    var limit = Math.min(rows.length, 40), i;
    for (i = 0; i < limit; i++) if (looksLikeHeader(rows[i])) return i;
    // Headings we have no name for still look like headings: a row of
    // plain words sitting on top of rows that hold dates and numbers.
    var first = -1;
    for (i = 0; i < limit && first < 0; i++) if (!isBlankRow(rows[i])) first = i;
    if (first < 0) return -1;
    var top = rows[first], filled = 0, valueLike = 0;
    top.forEach(function (c) {
      if (!String(c).trim()) return;
      filled++;
      if (parseDate(c, "MDY") != null || parseAmount(c) != null) valueLike++;
    });
    if (filled < 2 || valueLike) return -1;
    var below = rows.slice(first + 1, first + 11).filter(function (r) { return !isBlankRow(r); });
    var dated = below.filter(function (r) {
      return r.some(function (c) { return parseDate(c, "MDY") != null || parseDate(c, "DMY") != null; });
    }).length;
    return below.length && dated / below.length >= 0.6 ? first : -1;
  }

  // What the values in each column look like, from a sample of data rows.
  function profileColumns(data, width) {
    var step = Math.max(1, Math.floor(data.length / 500));
    var cols = [];
    for (var c = 0; c < width; c++) {
      var p = { filled: 0, dates: 0, nums: 0, decimals: 0, negs: 0, len: 0, distinct: {}, nDistinct: 0, values: [] };
      for (var r = 0; r < data.length; r += step) {
        var v = String(cell(data[r], c)).trim();
        if (!v) continue;
        p.filled++;
        p.values.push(v);
        if (parseDate(v, "MDY") != null || parseDate(v, "DMY") != null) p.dates++;
        var num = parseAmount(v);
        // A date like 2025.03.04 parses as a number too; it is a date.
        if (num != null && !/^\d{1,4}[-\/.]\d{1,2}[-\/.]\d{1,4}/.test(v)) {
          p.nums++;
          if (/[.,]\d{1,2}(\s*(CR|DR))?\)?\s*$/i.test(v.replace(/[^\d.,()CRD\s-]/gi, ""))) p.decimals++;
          if (num < 0) p.negs++;
        }
        p.len += v.length;
        if (!p.distinct[v]) { p.distinct[v] = 1; p.nDistinct++; }
      }
      var sampled = Math.ceil(data.length / step);
      p.fillRate = sampled ? p.filled / sampled : 0;
      p.dateRate = p.filled ? p.dates / p.filled : 0;
      p.numRate = p.filled ? p.nums / p.filled : 0;
      p.decRate = p.nums ? p.decimals / p.nums : 0;
      p.avgLen = p.filled ? p.len / p.filled : 0;
      p.variety = p.filled ? p.nDistinct / p.filled : 0;
      p.texty = p.filled && p.numRate < 0.5 && p.dateRate < 0.5 ? p.avgLen * (0.35 + p.variety) : 0;
      delete p.distinct;
      cols.push(p);
    }
    return cols;
  }

  function emptyMapping() {
    var m = { headerRow: -1, dateOrder: "MDY", decimal: ".", sign: "asis" };
    ROLES.forEach(function (r) { m[r] = -1; });
    return m;
  }

  /* Work out which column is which. Header names go first, checked against
     what the column actually holds; anything still missing is found from
     the values alone, which is also how headerless files are read. */
  function inferMapping(rows, hints) {
    var map = emptyMapping();
    map.headerRow = findHeaderRow(rows);
    var header = map.headerRow >= 0 ? rows[map.headerRow] : null;
    var data = rows.slice(map.headerRow + 1).filter(function (r) { return !isBlankRow(r); });
    var width = 0;
    data.forEach(function (r) { if (r.length > width) width = r.length; });
    if (header && header.length > width) width = header.length;
    var prof = profileColumns(data, width);
    var used = {};

    if (header) {
      var pairs = [];
      header.forEach(function (h, c) {
        ROLES.forEach(function (role) {
          var s = roleScore(h, role);
          if (!s) return;
          var p = prof[c];
          // Check the name against the contents before trusting it.
          if (role === "date" && p.dateRate < 0.6) return;
          if ((role === "amount" || role === "balance") && p.numRate < 0.6) return;
          if ((role === "debit" || role === "credit") && p.filled && p.numRate < 0.6) return;
          if (role === "desc" || role === "memo") {
            // A column that barely varies ("DEBIT", "CARD PAYMENT") names
            // the kind of row, not the merchant.
            if (p.filled > 20 && p.variety < 0.05) return;
            if (role === "desc") s += Math.min(2, p.texty / 10) * Math.min(1, p.fillRate * 1.5);
          }
          if (role === "type" && p.nDistinct > 12) return;
          pairs.push({ c: c, role: role, s: s });
        });
      });
      pairs.sort(function (a, b) { return b.s - a.s; });
      pairs.forEach(function (p) {
        if (used[p.c] || map[p.role] >= 0) return;
        map[p.role] = p.c;
        used[p.c] = true;
      });
      // The runner-up description column is still useful text for the
      // categoriser, so keep it as the memo when there is no memo column --
      // as long as it reads like text rather than a DEBIT/CREDIT flag.
      if (map.memo < 0) {
        pairs.forEach(function (p) {
          var q = prof[p.c];
          if (q.variety < 0.5 || q.nDistinct < Math.min(4, q.filled)) return;
          if (map.memo < 0 && p.role === "desc" && !used[p.c] && p.s >= 6) {
            map.memo = p.c;
            used[p.c] = true;
          }
        });
      }
    }

    if (map.date < 0) {
      var bestDate = -1, bestRate = 0.6;
      prof.forEach(function (p, c) { if (!used[c] && p.dateRate >= bestRate && p.fillRate > 0.5) { bestRate = p.dateRate; bestDate = c; } });
      if (bestDate >= 0) { map.date = bestDate; used[bestDate] = true; }
    }

    if (map.amount < 0 && map.debit < 0 && map.credit < 0) {
      var numeric = [];
      prof.forEach(function (p, c) {
        if (used[c] || p.numRate < 0.85 || p.filled === 0 || p.dateRate > 0.5) return;
        numeric.push(c);
      });
      // Reference numbers and cheque numbers are numeric too, but they are
      // whole numbers; money columns mostly carry cents.
      var money = numeric.filter(function (c) { return prof[c].decRate >= 0.3; });
      if (!money.length) money = numeric;
      var bal = map.balance >= 0 ? -1 : findBalance(data, money);
      if (bal >= 0) { map.balance = bal; used[bal] = true; money = money.filter(function (c) { return c !== bal; }); }
      if (money.length === 1) {
        map.amount = money[0];
      } else if (money.length >= 2) {
        var pair = complementaryPair(data, money);
        if (pair) { map.debit = pair[0]; map.credit = pair[1]; }
        else map.amount = money[0];
      }
      [map.amount, map.debit, map.credit].forEach(function (c) { if (c >= 0) used[c] = true; });
    } else if (map.amount < 0 && (map.debit < 0 || map.credit < 0)) {
      // Only one of a debit/credit pair was named; the other is the
      // remaining money column that fills the gaps.
      var known = map.debit >= 0 ? map.debit : map.credit;
      var other = -1;
      prof.forEach(function (p, c) {
        if (other < 0 && !used[c] && c !== map.balance && p.numRate >= 0.85 && p.filled) {
          if (complementaryPair(data, [known, c])) other = c;
        }
      });
      if (other >= 0) {
        if (map.debit < 0) map.debit = other; else map.credit = other;
        used[other] = true;
      } else {
        map.amount = known;
        map.debit = map.credit = -1;
      }
    }

    if (map.desc < 0) {
      var bestText = -1, bestScore = 0;
      prof.forEach(function (p, c) { if (!used[c] && p.texty > bestScore) { bestScore = p.texty; bestText = c; } });
      if (bestText >= 0) { map.desc = bestText; used[bestText] = true; }
    }

    finishMapping(rows, map, hints);
    return map;
  }

  // A running balance moves by exactly each row's amount. Find a column
  // whose steps match another column's values, either sign, either order.
  function findBalance(data, cols) {
    if (cols.length < 2) return -1;
    var found = -1;
    cols.forEach(function (b) {
      if (found >= 0) return;
      cols.forEach(function (a) {
        if (found >= 0 || a === b) return;
        if (balanceAgreement(data, a, b, ".") > 0.6) found = b;
      });
    });
    return found;
  }

  // Share of row-to-row balance steps that one amount explains, best of
  // the four sign/order readings; and which sign won.
  function balanceAgreement(data, a, b, decimal, wantSign) {
    var amts = [], bals = [];
    data.forEach(function (r) {
      var x = parseAmount(cell(r, a), decimal), y = parseAmount(cell(r, b), decimal);
      if (x != null && y != null) { amts.push(x); bals.push(y); }
    });
    if (amts.length < 4) return 0;
    var v = { ascAs: 0, ascFlip: 0, descAs: 0, descFlip: 0 };
    for (var i = 1; i < amts.length; i++) {
      var step = bals[i] - bals[i - 1];
      if (Math.abs(step - amts[i]) < 0.006) v.ascAs++;
      if (Math.abs(step + amts[i]) < 0.006) v.ascFlip++;
      if (Math.abs(-step - amts[i - 1]) < 0.006) v.descAs++;
      if (Math.abs(-step + amts[i - 1]) < 0.006) v.descFlip++;
    }
    var n = amts.length - 1;
    var asis = Math.max(v.ascAs, v.descAs) / n, flip = Math.max(v.ascFlip, v.descFlip) / n;
    if (wantSign) return asis >= 0.6 && asis > flip ? 1 : flip >= 0.6 && flip > asis ? -1 : 0;
    return Math.max(asis, flip);
  }

  // Two money columns where each row fills one or the other: debit and
  // credit. The one that holds the rows with spending words is the debit.
  function complementaryPair(data, cols) {
    for (var i = 0; i < cols.length; i++) {
      for (var j = i + 1; j < cols.length; j++) {
        var a = cols[i], b = cols[j], either = 0, both = 0, rows = 0, aOut = 0, bOut = 0;
        data.forEach(function (r) {
          var x = parseAmount(cell(r, a)), y = parseAmount(cell(r, b));
          var hasX = x != null && x !== 0, hasY = y != null && y !== 0;
          rows++;
          if (hasX && hasY) both++;
          else if (hasX || hasY) {
            either++;
            var dir = hintDirection(r.join(" "));
            if (dir < 0) { if (hasX) aOut++; else bOut++; }
          }
        });
        if (rows && either / rows > 0.8 && both / rows < 0.05) return bOut > aOut ? [b, a] : [a, b];
      }
    }
    return null;
  }

  /* Date order, decimal mark and amount sign, from the columns chosen. */
  function finishMapping(rows, map, hints) {
    var data = rows.slice(map.headerRow + 1).filter(function (r) { return !isBlankRow(r); });
    var moneyCols = [map.amount, map.debit, map.credit, map.balance].filter(function (c) { return c >= 0; });
    var moneyValues = [];
    data.forEach(function (r) { moneyCols.forEach(function (c) { moneyValues.push(cell(r, c)); }); });
    map.decimal = inferDecimal(moneyValues);

    var dateInfo = inferDateOrder(data.map(function (r) { return cell(r, map.date); }));
    if (dateInfo.by === "locale") {
      // Nothing in the dates themselves decides it. Decimal commas,
      // semicolon-separated files and pound/euro amounts all come from
      // places that write the day first.
      var cur = currencyIn(moneyValues);
      if (map.decimal === "," || (hints && hints.delimiter === ";") || cur === "GBP" || cur === "EUR") {
        dateInfo = { order: "DMY", ambiguous: true, by: "hints" };
      } else if (cur === "USD") {
        dateInfo = { order: "MDY", ambiguous: true, by: "hints" };
      }
    }
    map.dateOrder = dateInfo.order;
    map.dateAmbiguous = dateInfo.ambiguous && dateInfo.by === "locale";

    var sign = decideSign(data, map);
    map.sign = sign.sign;
    map.signConfident = sign.confident;
    map.signBy = sign.by;
  }

  /* Which way does this file sign its amounts? With debit/credit columns
     there is nothing to decide. With one column: if nothing is negative the
     amounts are unsigned, and direction comes from a type column or the
     descriptions; otherwise the descriptions, the running balance and the
     plain majority (most rows on a statement are spending) vote. */
  function decideSign(data, map) {
    if (map.amount < 0) return { sign: "asis", confident: map.debit >= 0 || map.credit >= 0, by: "columns" };
    var pos = 0, neg = 0, kw = 0, kwN = 0, typed = 0, filled = 0;
    data.forEach(function (r) {
      var v = parseAmount(cell(r, map.amount), map.decimal);
      if (v == null || v === 0) return;
      filled++;
      if (v > 0) pos++; else neg++;
      var dir = hintDirection(cell(r, map.desc) + " " + cell(r, map.memo));
      if (dir) { kwN++; kw += dir * (v > 0 ? 1 : -1); }
      if (map.type >= 0 && typeDirection(cell(r, map.type))) typed++;
    });
    if (!filled) return { sign: "asis", confident: false, by: "none" };
    if (!neg) {
      if (map.type >= 0 && typed / filled >= 0.8) return { sign: "type", confident: true, by: "type" };
      return { sign: "guess", confident: false, by: "unsigned" };
    }
    var score = 0;
    if (kwN) score += 3 * (kw / kwN) * Math.min(1, kwN / 4);
    if (map.balance >= 0) score += 1.5 * balanceAgreement(data, map.amount, map.balance, map.decimal, true);
    var share = pos / filled;
    if (share > 0.65) score -= 1;
    else if (share < 0.4) score += 1;
    return { sign: score >= 0 ? "asis" : "flip", confident: Math.abs(score) >= 1.5, by: "evidence" };
  }

  /* Rows to transactions under a mapping. */
  function applyMapping(rows, map) {
    var txns = [], skipped = 0, zero = 0;
    for (var i = map.headerRow + 1; i < rows.length; i++) {
      var r = rows[i];
      if (isBlankRow(r)) continue;
      var date = parseDate(cell(r, map.date), map.dateOrder);
      var desc = tidy(cell(r, map.desc));
      var memo = map.memo >= 0 ? tidy(cell(r, map.memo)) : "";
      var amount = rowAmount(r, map, desc + " " + memo);
      if (date == null || amount == null) { skipped++; continue; }
      if (amount === 0) { zero++; continue; }
      txns.push({
        date: date,
        amount: amount,
        desc: desc || memo || "(no description)",
        memo: memo === desc ? "" : memo,
        bankCat: map.category >= 0 ? collapse(cell(r, map.category)) : "",
        account: map.account >= 0 ? collapse(cell(r, map.account)) : ""
      });
    }
    return { txns: txns, skipped: skipped, zero: zero };
  }

  function rowAmount(r, map, text) {
    if (map.amount >= 0) {
      var v = parseAmount(cell(r, map.amount), map.decimal);
      if (v == null) return null;
      if (map.sign === "flip") v = -v;
      else if (map.sign === "type" || map.sign === "guess") {
        var dir = map.sign === "type" && map.type >= 0 ? typeDirection(cell(r, map.type)) : 0;
        if (!dir) dir = IN_HINT.test(text) ? 1 : -1;
        v = Math.abs(v) * dir;
      }
      return round2(v);
    }
    var d = map.debit >= 0 ? parseAmount(cell(r, map.debit), map.decimal) : null;
    var c = map.credit >= 0 ? parseAmount(cell(r, map.credit), map.decimal) : null;
    if (d == null && c == null) return null;
    return round2((c ? Math.abs(c) : 0) - (d ? Math.abs(d) : 0));
  }

  function headerSignature(rows, map) {
    if (map.headerRow < 0) return "";
    return rows[map.headerRow].map(norm).join("|");
  }

  /* ── File-level readers ──────────────────────────────────────────── */
  function sniff(text, name) {
    var head = text.slice(0, 2000);
    var ext = String(name || "").toLowerCase().split(".").pop();
    if (/^%PDF/.test(head)) return "pdf";
    if (/^PK\u0003\u0004/.test(head)) return "zip";
    if (/OFXHEADER|<OFX>|<STMTTRN>/i.test(head) || ((ext === "ofx" || ext === "qfx") && /<STMTTRN>/i.test(text))) return "ofx";
    if (/^\s*!(Type|Account|Option)/im.test(head) || ext === "qif") return "qif";
    return "csv";
  }

  function readCSV(text, name, saved) {
    var delim = detectDelimiter(text);
    var rows = parseDelimited(text, delim);
    var map = inferMapping(rows, { delimiter: delim });
    var sig = headerSignature(rows, map);
    var remembered = false;
    if (saved && sig && saved[sig]) {
      var s = saved[sig];
      // Only reuse a remembered layout if it still fits this file.
      if (s.width === rows[map.headerRow].length) {
        ROLES.forEach(function (r) { if (r in s) map[r] = s[r]; });
        ["dateOrder", "decimal", "sign"].forEach(function (k) { if (s[k]) map[k] = s[k]; });
        map.dateAmbiguous = false;
        map.signConfident = true;
        remembered = true;
      }
    }
    var res = applyMapping(rows, map);
    var issues = [];
    if (map.date < 0) issues.push("no-date");
    if (map.amount < 0 && map.debit < 0 && map.credit < 0) issues.push("no-amount");
    if (map.desc < 0) issues.push("no-desc");
    if (map.dateAmbiguous) issues.push("date-order");
    if (!map.signConfident) issues.push("sign");
    var total = res.txns.length + res.skipped;
    if (total && res.skipped / total > 0.2) issues.push("skipped");
    if (!res.txns.length) issues.push("empty");

    var currencyValues = [];
    if (map.currency >= 0) rows.slice(map.headerRow + 1, map.headerRow + 200).forEach(function (r) { currencyValues.push(cell(r, map.currency)); });
    var headerText = map.headerRow >= 0 ? rows[map.headerRow].join(" ") : "";
    var currency = currencyIn(currencyValues) ||
      currencyIn(rows.slice(map.headerRow + 1, map.headerRow + 200).map(function (r) {
        return [cell(r, map.amount), cell(r, map.debit), cell(r, map.credit)].join(" ");
      })) ||
      currencyIn([headerText.toUpperCase()]);

    return {
      format: delim === "\t" ? "tsv" : "csv",
      delimiter: delim,
      rows: rows,
      mapping: map,
      signature: sig,
      remembered: remembered,
      txns: res.txns,
      skipped: res.skipped,
      issues: issues,
      currency: currency,
      account: accountFromName(name)
    };
  }

  function ofxTag(block, tag) {
    var m = new RegExp("<" + tag + ">\\s*([^<\\r\\n]*)", "i").exec(block);
    return m ? decodeEntities(m[1].trim()) : "";
  }

  function readOFX(text, name) {
    var txns = [], skipped = 0;
    var chunks = text.split(/<STMTTRN>/i).slice(1);
    var outTypes = /^(DEBIT|PAYMENT|POS|ATM|FEE|SRVCHG|CHECK|DIRECTDEBIT|REPEATPMT|CASH)$/i;
    var unsigned = true;
    var raw = chunks.map(function (chunk) {
      var block = chunk.split(/<\/STMTTRN>/i)[0];
      var amount = parseAmount(ofxTag(block, "TRNAMT"));
      if (amount != null && amount < 0) unsigned = false;
      return {
        type: ofxTag(block, "TRNTYPE"),
        date: parseDate(ofxTag(block, "DTUSER") || ofxTag(block, "DTPOSTED")),
        amount: amount,
        name: ofxTag(block, "NAME"),
        memo: ofxTag(block, "MEMO")
      };
    });
    raw.forEach(function (t) {
      if (t.date == null || t.amount == null) { skipped++; return; }
      if (!t.amount) return;
      var amount = t.amount;
      // The spec says TRNAMT is signed; a few banks forget. Fall back on
      // the transaction type when nothing in the file is negative.
      if (unsigned && outTypes.test(t.type)) amount = -amount;
      var desc = tidy(t.name || t.memo) || "(no description)";
      var memo = tidy(t.memo);
      txns.push({ date: t.date, amount: round2(amount), desc: desc, memo: memo === desc ? "" : memo, bankCat: "", account: "" });
    });

    var org = ofxTag(text, "ORG");
    var acct = ofxTag(text, "ACCTID");
    var isCard = /<CCSTMTRS>/i.test(text);
    var label = org || accountFromName(name);
    if (acct) label += " ··" + acct.replace(/\s/g, "").slice(-4);
    else if (isCard) label += " card";
    return {
      format: "ofx",
      txns: txns,
      skipped: skipped,
      issues: txns.length ? [] : ["empty"],
      currency: ofxTag(text, "CURDEF").toUpperCase() || null,
      account: label
    };
  }

  function readQIF(text, name) {
    var lines = text.split(/\r\n|\r|\n/);
    var records = [], cur = {}, section = "", accountName = "", inAccount = false;
    var skipSection = false;
    lines.forEach(function (line) {
      if (!line.trim()) return;
      var c = line.charAt(0), v = line.slice(1).trim();
      if (c === "!") {
        var h = line.toLowerCase();
        if (h.indexOf("!account") === 0) { inAccount = true; return; }
        if (h.indexOf("!type:") === 0) {
          section = h.slice(6).trim();
          skipSection = !/^(bank|cash|ccard|oth a|oth l)/.test(section);
          inAccount = false;
        }
        return;
      }
      if (c === "^") {
        if (inAccount) inAccount = false;
        else if (!skipSection && (cur.D || cur.T)) records.push(cur);
        cur = {};
        return;
      }
      if (inAccount) {
        if (c === "N") accountName = v;
        return;
      }
      if (c === "D") cur.D = v;
      else if ((c === "T" || c === "U") && cur.T == null) cur.T = v;
      else if (c === "P") cur.P = v;
      else if (c === "M") cur.M = v;
      else if (c === "L") cur.L = v;
    });
    if (!skipSection && (cur.D || cur.T)) records.push(cur);

    // Quicken writes 1/ 5'25 for 2025-01-05: drop the padding spaces.
    var dates = records.map(function (r) { return String(r.D || "").replace(/\s+/g, ""); });
    var order = inferDateOrder(dates).order;
    var decimal = inferDecimal(records.map(function (r) { return r.T; }));
    var txns = [], skipped = 0;
    records.forEach(function (r, i) {
      var date = parseDate(dates[i], order);
      var amount = parseAmount(r.T, decimal);
      if (date == null || amount == null) { skipped++; return; }
      if (!amount) return;
      var desc = tidy(r.P || r.M) || "(no description)";
      var memo = tidy(r.M);
      var cat = collapse(r.L);
      // [Account Name] in the category slot marks a transfer.
      if (/^\[.*\]$/.test(cat)) cat = "Transfer";
      txns.push({ date: date, amount: round2(amount), desc: desc, memo: memo === desc ? "" : memo, bankCat: cat, account: "" });
    });
    return {
      format: "qif",
      txns: txns,
      skipped: skipped,
      issues: txns.length ? [] : ["empty"],
      currency: null,
      account: accountName || accountFromName(name)
    };
  }

  // "Chase1234_Activity_20250304.CSV" -> "Chase1234". Good enough as a
  // starting label; the user can rename it.
  function accountFromName(name) {
    var base = String(name || "").replace(/\.[a-z0-9]{2,4}$/i, "");
    var words = base.split(/[\s_\-.()\[\]]+/).filter(function (w) {
      if (!w) return false;
      if (/^\d+$/.test(w)) return false;
      if (/^(export|exported|transactions?|statements?|activity|download(ed)?|history|data|csv|file|report|stmt|txns?|copy|all|from|to|ofx|qfx|qif)$/i.test(w)) return false;
      return true;
    });
    var label = words.join(" ").trim();
    if (!label) return "Imported account";
    return label.replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); });
  }

  /* Bytes to text. UTF-8 unless the bytes say otherwise: a UTF-16 byte
     order mark, or invalid UTF-8, which in bank exports nearly always means
     Windows-1252. */
  function decodeBytes(buf) {
    var bytes = new Uint8Array(buf);
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\ufeff/, "");
    } catch (e) {
      return new TextDecoder("windows-1252").decode(bytes);
    }
  }

  /* Entry point. `saved` maps header signatures to layouts the user fixed
     by hand before, so a bank's export only needs fixing once. */
  function read(name, text, saved) {
    var kind = sniff(text, name);
    if (kind === "pdf" || kind === "zip") return { format: kind, txns: [], skipped: 0, issues: ["unsupported"], account: accountFromName(name) };
    if (kind === "ofx") return readOFX(text, name);
    if (kind === "qif") return readQIF(text, name);
    return readCSV(text, name, saved);
  }

  kit.formats = {
    read: read,
    readCSV: readCSV,
    decodeBytes: decodeBytes,
    parseDelimited: parseDelimited,
    detectDelimiter: detectDelimiter,
    inferMapping: inferMapping,
    finishMapping: finishMapping,
    applyMapping: applyMapping,
    headerSignature: headerSignature,
    parseDate: parseDate,
    parseAmount: parseAmount,
    inferDateOrder: inferDateOrder,
    dayOf: dayOf,
    ymd: ymd,
    isoOf: isoOf,
    ROLES: ROLES
  };
})(window.SpendscapeKit = window.SpendscapeKit || {});
