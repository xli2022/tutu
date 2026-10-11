/* ── Spendscape · PDF statements ─────────────────────────────────────────
   Reads the transaction table out of a PDF statement.

   A PDF is laid out for printing, not for computers, so this works from
   where the words sit on the page rather than from any one bank's format:

     1. pdf.js (vendor/pdfjs, loaded only when a PDF arrives) turns each
        page into positioned bits of text;
     2. the bits become lines and the lines become cells;
     3. column headings ("Credits", "Withdrawals/Subtractions", "Amount",
        "Balance"...), section headings ("Other Credits", "Checks Paid",
        "Daily Ending Balance"...), printed signs and the kind of
        statement (bank or card) decide what each number means;
     4. the statement's own "Total ..." lines and opening and closing
        balances check the result.

   parse() is pure, so it can be tested without a browser. extract() is
   the only part that touches pdf.js, and it switches off everything that
   could reach the network or evaluate code.                             */
(function (kit) {
  "use strict";

  var F = kit.formats;

  /* ── Text patterns ───────────────────────────────────────────────── */
  var MONTH = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  var MONTH_NO = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var FULL_DATE = "(?:\\d{1,2}[/.-]\\d{1,2}[/.-](?:\\d{4}|\\d{2})|\\d{4}[-/]\\d{2}[-/]\\d{2}|\\d{1,2}-(?:" + MONTH + ")-(?:\\d{4}|\\d{2})|(?:" + MONTH + ")\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:" + MONTH + ")\\.?,?\\s+\\d{4})";
  var RANGE_RE = new RegExp("(" + FULL_DATE + ")\\s*(?:to|through|thru|until|-|–|—)\\s*(" + FULL_DATE + ")", "i");
  // "Aug 15 - Sep 14, 2026" and "1 August to 31 August 2026": the year
  // is only written once, at the end.
  var RANGE_SHORT_MDY = new RegExp("((?:" + MONTH + ")\\.?\\s+\\d{1,2})\\s*(?:to|through|thru|-|–|—)\\s*((?:" + MONTH + ")\\.?\\s+\\d{1,2},?\\s+\\d{4})", "i");
  var RANGE_SHORT_DMY = new RegExp("(\\d{1,2}\\s+(?:" + MONTH + "))\\.?\\s*(?:to|through|thru|-|–|—)\\s*(\\d{1,2}\\s+(?:" + MONTH + ")\\.?,?\\s+\\d{4})", "i");
  var FULL_DATE_RE = new RegExp(FULL_DATE, "gi");

  var CUR = "[$£€¥₹]|(?:US|CA|AU|NZ|HK|S)\\$|USD|EUR|GBP|CAD|AUD|NZD|CHF|JPY|INR|SEK|NOK|DKK|PLN|SGD|HKD|MXN|ZAR|kr|zł";
  // A whole amount: (1,234.56) -$1,234.56 1.234,56 € 45.67- 500.00 CR
  var MONEY_RE = new RegExp("^(\\()?\\s*([-+])?\\s*(" + CUR + ")?\\s*([-+])?\\s*((?:\\d{1,3}(?:[,.'\\u00a0\\u202f ]\\d{3})+|\\d+)[.,]\\d{2})\\s*(\\))?\\s*(?:" + CUR + ")?\\s*(CR|DR|-)?$", "i");
  // The same at the end of a longer text.
  var TRAILING_MONEY = new RegExp("^(.*\\S)\\s+(\\(?[-+]?(?:" + CUR + ")?\\s?[-+]?\\d[\\d,.'\\u00a0]*[.,]\\d{2}\\)?(?:\\s?(?:" + CUR + "))?(?:\\s?(?:CR|DR|-))?)$", "i");

  // A row date: 8/16, 08/16, 08/16/26, 08/28/26*, 2026-08-16, 16.08.,
  // 16.08.2026, Aug 16, 16 Aug, 16 Aug 2026, Aug 16, 2026.
  function dateToken(text) {
    var s = String(text).trim(), m;
    if ((m = /^(\d{4})[-/](\d{2})[-/](\d{2})(?![\d])/.exec(s))) return { a: +m[2], b: +m[3], y: +m[1], ymd: true, len: m[0].length };
    var re0 = new RegExp("^(\\d{1,2})-(" + MONTH + ")-(\\d{4}|\\d{2})(?=$|\\s)", "i");
    if ((m = re0.exec(s))) return { day: +m[1], month: MONTH_NO[m[2].toLowerCase().slice(0, 3)], y: +m[3], len: m[0].length };
    if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\*?(?=$|\s)/.exec(s))) return { a: +m[1], b: +m[2], y: m[3] ? +m[3] : null, len: m[0].length };
    if ((m = /^(\d{1,2})[.-](\d{1,2})[.-](\d{4}|\d{2})(?=$|\s)/.exec(s))) return { a: +m[1], b: +m[2], y: +m[3], len: m[0].length };
    if ((m = /^(\d{1,2})\.(\d{1,2})\.(?=$|\s)/.exec(s))) return { a: +m[1], b: +m[2], y: null, dmy: true, len: m[0].length };
    var re1 = new RegExp("^(\\d{1,2})\\s+(" + MONTH + ")\\.?(?:,?\\s+(\\d{4}))?(?=$|\\s)", "i");
    if ((m = re1.exec(s))) return { day: +m[1], month: MONTH_NO[m[2].toLowerCase().slice(0, 3)], y: m[3] ? +m[3] : null, len: m[0].length };
    var re2 = new RegExp("^(" + MONTH + ")\\.?\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?(?=$|\\s|,)", "i");
    if ((m = re2.exec(s))) return { day: +m[2], month: MONTH_NO[m[1].toLowerCase().slice(0, 3)], y: m[3] ? +m[3] : null, len: m[0].length };
    return null;
  }

  function plausible(t) {
    if (t.month) return t.day >= 1 && t.day <= 31;
    return t.a >= 1 && t.a <= 31 && t.b >= 1 && t.b <= 31 && (t.a <= 12 || t.b <= 12);
  }

  function norm(s) {
    return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[()$£€:#.,*]/g, " ").replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
  }

  /* ── Column headings ─────────────────────────────────────────────── */
  var HEAD_ROLES = [
    ["date", /^(trans(action)?( date)?|date( of)?( transaction)?|tran date|posting date|post(ed)?( date)?|date posted|value date|booking date|date paid|effective date|process(ed)? date|date)$/],
    ["in", /^(deposits?|credits?|additions|deposits?\/additions|deposits?\/credits|deposits? and (other )?(additions|credits)|payments? and (other )?credits|money in( gbp| eur| usd)?|paid in( gbp| eur)?|receipts|credit amount|amount credited)$/],
    ["out", /^(withdrawals?|debits?|subtractions|withdrawals?\/subtractions|withdrawals?\/debits|checks?\/debits|charges|purchases|money out( gbp| eur| usd)?|paid out( gbp| eur)?|withdrawn|payments|debit amount|amount debited)$/],
    ["amount", /^(amount|amt|transaction amount|amount usd|amount gbp|amount eur)$/],
    ["balance", /balance/],
    ["desc", /description|details|merchant|payee|narrative|particulars|^memo$|^transaction$/],
    ["aux", /reference|^ref|check( number| no| num)?$|^chk|card( ending( in)?)?|ending in|^number$|category|^type$|instances|^no$/]
  ];
  var HEAD_WORDS = /^(date|dates|trans|transaction|transactions|tran|post|posting|posted|value|booking|effective|process|processed|of|description|details|detail|merchant|name|names|or|payee|narrative|particulars|memo|deposits?|credits?|additions|withdrawals?|debits?|subtractions|charges?|purchases|money|in|out|paid|amount|amounts|amt|balance|daily|ending|running|ledger|reference|ref|number|no|check|checks|card|type|category|withdrawn|receipts|payments?|usd|gbp|eur|and|\/|-)$/;

  function headRole(label) {
    var n = norm(label);
    for (var i = 0; i < HEAD_ROLES.length; i++) if (HEAD_ROLES[i][1].test(n)) return HEAD_ROLES[i][0];
    return null;
  }

  function headerish(line) {
    if (line.money.length || line.cells.length > 12) return false;
    var words = norm(line.text).split(/[\s\/]+/).filter(Boolean);
    if (!words.length) return false;
    var unknown = words.filter(function (w) { return !HEAD_WORDS.test(w); }).length;
    return unknown <= Math.floor(words.length / 4);
  }

  /* Stack the cells of one to three heading lines into columns ("Trans"
     over "Date", "Ending daily" over "balance") and name each column. */
  function buildHeader(lines) {
    var cols = [];
    lines.forEach(function (line) {
      line.cells.forEach(function (c) {
        var hit = null;
        cols.forEach(function (col) {
          var overlap = Math.min(col.x1, c.x1) - Math.max(col.x0, c.x0);
          if (!hit && (overlap > -2 || Math.abs(col.x1 - c.x1) < 3 || Math.abs(col.x0 - c.x0) < 3)) hit = col;
        });
        if (hit) {
          hit.label += " " + c.text;
          hit.x0 = Math.min(hit.x0, c.x0);
          hit.x1 = Math.max(hit.x1, c.x1);
        } else cols.push({ label: c.text, x0: c.x0, x1: c.x1 });
      });
    });
    cols.sort(function (a, b) { return a.x0 - b.x0; });
    var roles = {};
    cols.forEach(function (col) {
      col.role = headRole(col.label);
      col.check = col.role === "aux" && /check|chk/.test(norm(col.label));
      col.post = col.role === "date" && /post/.test(norm(col.label));
      if (col.role) roles[col.role] = (roles[col.role] || 0) + 1;
    });
    var money = (roles["in"] || 0) + (roles.out || 0) + (roles.amount || 0);
    if (!money || !(roles.date || roles.desc)) return null;
    var groups = groupsOf(cols);
    return { cols: cols, groups: groups, multi: !!groups || (roles.date || 0) > 2 || (roles.amount || 0) > 2 };
  }

  /* A table printed two or three times side by side ("Date  Check #
     Amount  Date  Check #  Amount") repeats its columns: one group per
     copy, each owning the page from halfway to its neighbours. */
  function groupsOf(cols) {
    var named = cols.filter(function (c) { return c.role; });
    var starts = [];
    named.forEach(function (c, i) { if (c.role === named[0].role) starts.push(i); });
    if (named.length < 4 || starts.length < 2) return null;
    var roles = function (a, b) { return named.slice(a, b).map(function (c) { return c.role; }).join(); };
    var one = roles(starts[0], starts[1]);
    for (var g = 1; g < starts.length; g++) if (roles(starts[g], starts[g + 1] || named.length) !== one) return null;
    return starts.map(function (st, g) {
      var end = g + 1 < starts.length ? starts[g + 1] : named.length;
      return {
        cols: named.slice(st, end),
        x0: g ? (named[st - 1].x1 + named[st].x0) / 2 : -Infinity,
        x1: end < named.length ? (named[end - 1].x1 + named[end].x0) / 2 : Infinity
      };
    });
  }

  /* ── Sections ────────────────────────────────────────────────────── */
  var SECTION_SKIP = /\b(daily\b.*\bbalances?|ledger balances?|balances? by date|balance summary|account summary|summary of|interest charge calculation|year.to.date|totals? year|annual percentage|rewards)\b|^(important|news|messages?|notices?|disclosures?|how to|apr)\b|\bsummary$/i;
  var CONTINUED = /\s*[-–—(:]*\s*\(?\b(cont(inued|'d|d)?)\b.*$/i;
  var SECTION_IN = /^(other )?credits?\b|\b(deposits?|additions|payments?,? (and |& )?(other )?credits|payments? received|refunds?|money in|paid in|incoming|interest (paid|earned)|dividends?)\b/i;
  var SECTION_OUT = /\b(withdrawals?|subtractions|debits?|purchases?|charges?|checks? paid|fees?|interest charged|card (transactions|purchases|activity)|atm|cash advances?|balance transfers?|money out|paid out|spending|electronic (payments|withdrawals)|bill payments?)\b|^checks?$/i;
  // Titles over a whole transaction table, after a summary: back to
  // reading rows, with no direction implied.
  var SECTION_NEUTRAL = /(^|:\s*)(transaction (history|details?|activity|list)|transactions|account activity|activity( details)?|statement activity|your transactions)$/i;
  var TOTAL_ROW = /^totals?\b|:\s*totals?\b/i;

  // A section title: a few words, not a sentence.
  function sectionOf(text, kind) {
    var t = text.replace(CONTINUED, "").trim();
    if (!t || t.split(/\s+/).length > 8 || /[.!?]$/.test(t)) return null;
    if (SECTION_NEUTRAL.test(t)) return "neutral";
    if (SECTION_SKIP.test(t)) return "skip";
    if (/^payments?$/i.test(t)) return kind === "card" ? "in" : null;
    var isIn = SECTION_IN.test(t), isOut = SECTION_OUT.test(t);
    if (isIn && !isOut) return "in";
    if (isOut && !isIn) return "out";
    if (isIn && isOut) return /^(payments?|other credits|credits|deposits)/i.test(t) ? "in" : "out";
    return null;
  }

  var BALANCE_ROW = /^(beginning|opening|previous|starting|start|ending|closing|end|new|daily|average|available|current)\b.*\bbalance\b|balance (forward|brought forward|carried forward|b\/f|c\/f)|^balance$/i;

  /* ── Lines and cells ─────────────────────────────────────────────── */
  function toLines(pages) {
    var lines = [];
    pages.forEach(function (page, p) {
      var items = [];
      (page.items || []).forEach(function (it) {
        if (!it.str || !it.str.trim()) return;
        var h = Math.max(4, it.h || 8), w = Math.max(0, it.w || 0);
        // A whole line in one run, its columns padded with spaces (as
        // typewriter-style statements are): cut it at the runs of spaces,
        // placing each piece by its share of the characters.
        if (/\S\s{2,}\S/.test(it.str)) {
          var per = w / it.str.length, re = /\S+(?: \S+)*/g, m;
          while ((m = re.exec(it.str))) items.push({ s: m[0], x0: it.x + m.index * per, x1: it.x + (m.index + m[0].length) * per, y: it.y, h: h });
          return;
        }
        items.push({ s: it.str, x0: it.x, x1: it.x + w, y: it.y, h: h });
      });
      items.sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; });
      var cur = null;
      items.forEach(function (it) {
        if (cur && Math.abs(it.y - cur.y) <= Math.max(1.5, Math.min(it.h, cur.h) * 0.45)) {
          cur.items.push(it);
          cur.h = Math.max(cur.h, it.h);
        } else {
          cur = { page: p, y: it.y, h: it.h, items: [it] };
          lines.push(cur);
        }
      });
    });
    lines.forEach(function (line) {
      line.items.sort(function (a, b) { return a.x0 - b.x0; });
      var cells = [], c = null;
      line.items.forEach(function (it) {
        var gap = c ? it.x0 - c.x1 : Infinity;
        // An amount is its own column even when a long description crowds
        // it, unless all that came before is its currency sign.
        var apart = c && moneyOf(it.s) && (gap < -1 || gap > 0.4 * it.h) && !/^[-+(]?\s*([$£€¥]|[A-Z]{3})?\s*$/.test(c.text);
        if (c && !apart && gap <= Math.max(1, 0.8 * it.h)) {
          c.text += (gap > 0.12 * it.h && !/\s$/.test(c.text) && !/^\s/.test(it.s) ? " " : "") + it.s;
          c.x1 = Math.max(c.x1, it.x1);
        } else {
          c = { text: it.s, x0: it.x0, x1: it.x1, h: it.h };
          cells.push(c);
        }
      });
      cells.forEach(function (cell) { cell.text = cell.text.replace(/\s+/g, " ").trim(); });
      cells = cells.filter(function (cell) { return cell.text; });
      // No amount found as its own piece, yet up to two may end the text
      // of a dated, balance or total line ("08/16 PURCHASE 45.67 1,234.56"
      // as one run of text).
      var lead = cells.length ? cells[0].text : "";
      if ((dateToken(lead) || BALANCE_ROW.test(lead) || TOTAL_ROW.test(lead)) && !cells.some(function (cell) { return moneyOf(cell.text); })) {
        var at = cells.length - 1;
        for (var k = 0; k < 2; k++) {
          var src = cells[at], mm = TRAILING_MONEY.exec(src.text);
          if (!mm || !moneyOf(mm[2])) break;
          var share = (src.x1 - src.x0) / src.text.length;
          cells.splice(at, 1,
            { text: mm[1], x0: src.x0, x1: src.x0 + mm[1].length * share, h: src.h },
            { text: mm[2], x0: src.x1 - mm[2].length * share, x1: src.x1, h: src.h });
        }
      }
      line.cells = cells;
      line.text = line.cells.map(function (cell) { return cell.text; }).join("  ");
      line.money = [];
      line.cells.forEach(function (cell, i) {
        var mo = moneyOf(cell.text);
        // A sign printed apart from its number: "-" then "1,000.00".
        if (mo && i > 0 && /^[-−]$/.test(line.cells[i - 1].text) && cell.x0 - line.cells[i - 1].x1 < 2 * cell.h) {
          mo.printed = mo.printed || -1;
          line.cells[i - 1].sign = true;
        }
        // ...or after it: "500.00" then "CR", "45.67" then "-".
        var next = line.cells[i + 1];
        if (mo && next && next.x0 - cell.x1 < 2 * cell.h) {
          if (/^(CR|DR)$/i.test(next.text) && !mo.tag) { mo.tag = next.text.toUpperCase(); next.sign = true; }
          else if (/^[-−]$/.test(next.text)) { mo.printed = mo.printed || -1; next.sign = true; }
        }
        if (mo) { cell.money = mo; line.money.push(cell); }
      });
    });
    return lines;
  }

  function moneyOf(text) {
    var m = MONEY_RE.exec(String(text).replace(/[−–—]/g, "-").trim());
    if (!m) return null;
    var printed = 0;
    if (m[1] && m[6]) printed = -1;
    else if (m[2] === "-" || m[4] === "-" || m[7] === "-") printed = -1;
    else if (m[2] === "+" || m[4] === "+") printed = 1;
    var tag = m[7] && m[7] !== "-" ? m[7].toUpperCase() : "";
    if (m[1] && !m[6]) return null;
    return { raw: m[5], printed: printed, tag: tag, symbol: m[3] || "" };
  }

  /* ── Statement-wide facts ────────────────────────────────────────── */
  function kindOf(text) {
    var card = (text.match(/credit card|card ?member|minimum payment|payment due|new balance|credit (limit|line|access line)|available credit|cash advances?|annual percentage rate|american express|\bvisa\b|mastercard|statement closing date|previous balance/gi) || []).length;
    var bank = (text.match(/checking|savings|\bdeposits?\b|withdrawals?|routing|daily (ending )?balance|overdraft|sort code|money in|paid in/gi) || []).length;
    if (card > bank) return "card";
    if (bank > card) return "bank";
    return "unknown";
  }

  var BANKS = ["Wells Fargo", "Chase", "Bank of America", "Citibank", "Citi", "Capital One", "American Express", "Discover", "U.S. Bank", "US Bank", "PNC",
    "Truist", "TD Bank", "Ally", "USAA", "Navy Federal", "Charles Schwab", "Schwab", "Fidelity", "SoFi", "Chime", "Marcus", "Goldman Sachs", "Apple Card",
    "Synchrony", "Barclays", "Barclaycard", "HSBC", "Santander", "Lloyds", "NatWest", "Halifax", "Nationwide", "Monzo", "Starling", "Revolut", "RBC",
    "Royal Bank", "TD Canada Trust", "Scotiabank", "BMO", "CIBC", "Commonwealth Bank", "Westpac", "ANZ", "NAB", "ING", "Deutsche Bank", "Sparkasse",
    "BNP Paribas", "Credit Agricole", "Rabobank", "ABN AMRO", "N26", "Wise", "Citizens", "Fifth Third", "KeyBank", "Regions", "Huntington", "M&T", "First Republic"];

  // The bank is the one named first outside the transactions, written as
  // it brands itself or in capitals ("regions" in small print is not a bank).
  function accountLabel(text, kind, fallback) {
    var bank = null, at = Infinity;
    BANKS.forEach(function (name) {
      var re = new RegExp("\\b" + name.replace(/[.&]/g, "\\$&") + "(?![\\w])", "gi"), m;
      while ((m = re.exec(text)) && m.index < at) {
        if (m[0] === name || m[0] === name.toUpperCase()) {
          if (m.index < at || name.length > bank.length) { bank = name; at = m.index; }
          break;
        }
      }
    });
    // Not one we know by name: the letterhead's "... Bank" or "... Credit
    // Union", near the top.
    if (!bank) {
      var head = text.split("\n").slice(0, 20).join("\n");
      var lh = /\b((?:[A-Z][A-Za-z&'.-]*\s+){1,4}(?:Bank|Credit Union|Building Society|Savings Bank|Savings and Loan))\b/.exec(head) ||
               /\b((?:[A-Z][A-Z&'.-]*\s+){1,4}(?:BANK|CREDIT UNION|BUILDING SOCIETY|SAVINGS BANK))\b/.exec(head);
      if (lh && !/^(your|the|our|online|mobile|member|by|from|to|at|with|of)\b/i.test(lh[1])) {
        bank = lh[1].replace(/\s+/g, " ").trim();
        if (bank === bank.toUpperCase()) bank = bank.toLowerCase().replace(/\b([a-z])/g, function (c) { return c.toUpperCase(); });
      }
    }
    var m = /(?:account|card|acct)\b[^\n\d]{0,30}?(?:ending(?: in)?|number|no\.?|#)\s*:?\s*[x*••\s-]*(\d[\d\s-]{2,}\d)\b/i.exec(text);
    var last4 = m ? m[1].replace(/\D/g, "").slice(-4) : "";
    var label = bank || fallback;
    if (kind === "card" && bank && !/card/i.test(label)) label += " card";
    return label + (last4 ? " ··" + last4 : "");
  }

  // "DMY" or "MDY" when the numbers settle it ("31/08", "08/31"), else null.
  function dateOrder(tokens) {
    var aBig = 0, bBig = 0;
    tokens.forEach(function (t) {
      if (t.month || t.ymd) return;
      if (t.dmy) aBig++;
      if (t.a > 12) aBig++;
      if (t.b > 12) bBig++;
    });
    if (aBig > bBig) return "DMY";
    if (bBig > aBig) return "MDY";
    return null;
  }

  function fullDay(t, order, period) {
    var month, day;
    if (t.month) { month = t.month; day = t.day; }
    else if (t.ymd) { month = t.a; day = t.b; }
    else if (order === "DMY") { month = t.b; day = t.a; }
    else { month = t.a; day = t.b; }
    if (t.y) return F.dayOf(t.y < 100 ? 2000 + t.y : t.y, month, day);
    // No year on the row: take the one that puts the date inside the
    // statement period, so December rows on a January statement land in
    // the year before.
    var ref = period ? period.to : Math.floor(Date.now() / 864e5) + 31;
    var y = F.ymd(ref).y;
    var d = F.dayOf(y, month, day);
    if (d != null && d > ref + 20) d = F.dayOf(y - 1, month, day);
    return d;
  }

  // The statement period, from a printed range or failing that (unless
  // rangeOnly) the statement date.
  function findPeriod(lines, order, rangeOnly) {
    var i, m, text;
    var parse = function (s) { return F.parseDate(s.replace(/(\d)(st|nd|rd|th)\b/gi, "$1"), order); };
    for (i = 0; i < lines.length; i++) {
      text = lines[i].text.replace(/\s{2,}/g, " ");
      if ((m = RANGE_RE.exec(text))) {
        var a = parse(m[1]), b = parse(m[2]);
        if (a != null && b != null && b >= a && b - a < 400) return { from: a, to: b, how: "range" };
      }
      if ((m = RANGE_SHORT_MDY.exec(text)) || (m = RANGE_SHORT_DMY.exec(text))) {
        var to = parse(m[2]);
        var yr = /(\d{4})\s*$/.exec(m[2]);
        if (to != null && yr) {
          var from = parse(m[1] + " " + yr[1]);
          if (from != null && from > to) from = parse(m[1] + " " + (+yr[1] - 1));
          if (from != null) return { from: from, to: to, how: "range" };
        }
      }
    }
    if (rangeOnly) return null;
    // No range: the statement date, or failing that the latest full date
    // printed anywhere, closes the period.
    var best = null;
    for (i = 0; i < lines.length; i++) {
      text = lines[i].text.replace(/\s{2,}/g, " ");
      if (/\bdue\b|pay(ment)? by|expir|effective|valid (until|through)|since/i.test(text)) continue;
      FULL_DATE_RE.lastIndex = 0;
      while ((m = FULL_DATE_RE.exec(text))) {
        var d = parse(m[0]);
        if (d == null) continue;
        var strong = /statement|closing|period|as of|ending|date:/i.test(text);
        if (!best || (strong && !best.strong) || (strong === best.strong && d > best.d)) best = { d: d, strong: strong };
      }
    }
    return best ? { from: best.d - 34, to: best.d, how: "date" } : null;
  }

  /* ── The parser ──────────────────────────────────────────────────── */
  function parse(pages, opts) {
    opts = opts || {};
    var lines = toLines(pages);
    var allText = lines.map(function (l) { return l.text; }).join("\n");
    var kind = kindOf(allText);
    // Currency: from the amounts themselves, else from headings and
    // balance lines ("Money in (£)", "Balance in USD").
    var moneyText = [], labelText = [];
    lines.forEach(function (l) {
      l.money.forEach(function (c) { moneyText.push(c.text); });
      if ((!l.money.length && headerish(l)) || /balance|total/i.test(l.text)) labelText.push(l.text + " 0");
    });
    var currency = F.currencyIn(moneyText) || F.currencyIn(labelText);
    var decimal = (function () {
      var dot = 0, comma = 0;
      lines.forEach(function (l) {
        l.money.forEach(function (c) {
          if (/,\d{2}$/.test(c.money.raw)) comma++;
          else if (/\.\d{2}$/.test(c.money.raw)) dot++;
        });
      });
      return comma > dot ? "," : ".";
    })();
    var hints = { dmy: currency === "GBP" || currency === "EUR" || decimal === "," };

    // Day-first or month-first, once for the whole file: the statement
    // period if it only makes sense one way, else the dates on lines with
    // amounts, else any other date printed, else the currency.
    var rowTokens = [], textTokens = [];
    lines.forEach(function (l) {
      for (var i = 0; l.money.length && i < Math.min(4, l.cells.length); i++) {
        var t = dateToken(l.cells[i].text);
        if (t && plausible(t)) rowTokens.push(t);
      }
      FULL_DATE_RE.lastIndex = 0;
      var m;
      while ((m = FULL_DATE_RE.exec(l.text))) {
        var ft = dateToken(m[0]);
        if (ft && plausible(ft)) textTokens.push(ft);
      }
    });
    var mdy = findPeriod(lines, "MDY", true), dmy = findPeriod(lines, "DMY", true);
    var order = mdy && !dmy ? "MDY" : dmy && !mdy ? "DMY" : null;
    order = order || dateOrder(rowTokens) || dateOrder(textTokens) || (hints.dmy ? "DMY" : "MDY");
    var period = findPeriod(lines, order);

    var header = null, section = null, sectionName = "", last = null, lastLine = null;
    var rows = [], checks = [], sectionRows = {}, skipped = 0, sectionCount = 0;
    var balances = { open: null, close: null };

    markChrome(lines, kind);
    var sectionIds = {};

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      if (line.page !== (lastLine && lastLine.page)) last = null;
      if (line.chrome) continue;

      var first = line.cells[0] ? line.cells[0].text : "";

      // A wrapped description: no date, no money, just below a row and
      // starting under its description. A larger or more distant line that
      // reads like a section title is a title.
      if (last && !line.money.length && line.page === lastLine.page && lastLine.y - line.y < 2.1 * Math.max(line.h, lastLine.h) &&
          line.cells[0].x0 >= last.descX - 8 && last.more.length < 3 && !/^(page \d|continued|sheet seq)/i.test(first) && !headerRow(lines, li, kind) &&
          !(sectionOf(first, kind) && (line.h > lastLine.h * 1.15 || lastLine.y - line.y > 1.8 * lastLine.h))) {
        last.more.push(line.text.replace(/\s{2,}/g, " "));
        lastLine = line;
        continue;
      }

      // Column headings, possibly stacked over two or three lines.
      var hb = headerRow(lines, li, kind);
      if (hb) {
        header = hb.header;
        if (section === "skip" && !header.multi) section = null;
        li = hb.end - 1;
        last = null;
        continue;
      }

      // Section headings and totals.
      if (!line.money.length && line.cells.length <= 3 && first.length <= 70 && /[a-z]/i.test(first) && !dateLead(line)) {
        var sec = sectionOf(first, kind);
        if (sec) {
          // "Withdrawals and other subtractions - continued" on the next
          // page carries on that section and its total; "Transactions
          // (continued)" carries on whatever came before.
          var name = first.replace(CONTINUED, "").trim().toLowerCase();
          var cont = CONTINUED.test(first) && /\bcont/i.test(first);
          last = null;
          if (cont && sec === "neutral") { if (section === "skip") section = null; continue; }
          if (cont && sectionIds[name] != null) {
            sectionCount = sectionIds[name];
          } else if (name !== sectionName || section !== (sec === "neutral" ? null : sec)) {
            sectionCount = Math.max.apply(null, [sectionCount].concat(Object.keys(sectionIds).map(function (k) { return sectionIds[k]; }))) + 1;
          }
          section = sec === "neutral" ? null : sec;
          sectionName = name;
          sectionIds[name] = sectionCount;
          continue;
        }
      }
      if (TOTAL_ROW.test(first) && line.money.length) {
        if (section !== "skip") checks.push(totalCheck(line, header, sectionCount, sectionName));
        last = null;
        continue;
      }
      // Opening and closing balances, each label with the amount after it
      // (a summary box can put "Previous Balance" and "New Balance" side
      // by side on one line).
      if (line.money.length && !dateLead(line)) {
        line.cells.forEach(function (c, i) {
          var label = c.text.replace(/^[=+\-–—•·\s]+/, "");
          if (c.money || !BALANCE_ROW.test(label)) return;
          for (var j = i + 1; j < line.cells.length; j++) {
            var nx = line.cells[j];
            if (nx.money) { noteBalance(balances, label, nx.money, decimal, kind); break; }
            if (BALANCE_ROW.test(nx.text)) break;
          }
        });
      }
      // Skipped matter ends at a title or headings, or where three dated,
      // described amounts line up: a list of transactions with no title.
      if (section === "skip" && !(line.money.length && rowRun(lines, li, header, decimal, kind) >= 3)) { last = null; continue; }
      if (section === "skip") section = null;

      // A table printed side by side is read one copy at a time.
      var found = [];
      (header && header.groups ? splitLine(line, header) : [{ line: line, header: header }]).forEach(function (part) {
        var row = readRow(part.line, part.header, decimal, kind, false);
        if (row) found.push(row);
      });
      // Interest and fee lines are often printed without a date
      // ("INTEREST CHARGE ON PURCHASES  12.34"): they fall on the
      // closing date.
      if (!found.length && header && !header.groups && (section === "in" || section === "out") && /interest|fee/i.test(sectionName)) {
        var undated = readRow(line, header, decimal, kind, true);
        if (undated && undated.value > 0.004) found.push(undated);
      }
      var took = null;
      found.forEach(function (row) {
        if (BALANCE_ROW.test(row.desc) || /^(start|end) balance$/i.test(row.desc)) {
          if (row.balance != null || row.amount != null) noteBalance(balances, row.desc, row.amountMoney || row.balanceMoney, decimal, kind);
          return;
        }
        if (row.amount == null) return;
        row.section = section;
        row.sectionId = sectionCount;
        // Column headings or a titled section vouch for a row.
        row.anchored = !!header || section === "in" || section === "out";
        row.date = row.token ? fullDay(row.token, order, period) : period ? period.to : null;
        if (row.date == null) { skipped++; return; }
        rows.push(row);
        took = row;
      });
      if (found.length) line.used = true;
      // Only a lone row can have its description wrap onto the next line.
      last = took && found.length === 1 ? took : null;
      if (took) lastLine = line;
    }

    // Noise that looks like a row: dated outside the statement (a payment
    // due date on the coupon, an offer's end date), or, with no column
    // headings or section to vouch for it, lined up with no other row.
    var outside = 0;
    rows = rows.filter(function (r) {
      var out = period && (r.date > period.to + 5 || (period.how === "range" && r.date < period.from - 45));
      if (out) outside++;
      return !out;
    });
    var loose = rows.filter(function (r) { return !r.anchored; }), lone = 0;
    rows = rows.filter(function (r) {
      var keep = r.anchored || loose.some(function (o) { return o !== r && Math.abs(o.dateX - r.dateX) < 3 && Math.abs(o.amountX - r.amountX) < 3; });
      if (!keep) lone++;
      return keep;
    });
    rows.forEach(function (r) { (sectionRows[r.sectionId] = sectionRows[r.sectionId] || []).push(r); });

    // Which way each amount went. Whether the statement is a card's or a
    // bank's decides what printed signs mean, so if the opening and
    // closing balances disagree with that reading, try the other.
    directions(rows, kind, balances.open);
    var closing = balanceCheck(rows, kind, balances);
    if (closing && !closing.ok && rows.some(function (r) { return r.how === "sign" || r.how === "kind"; })) {
      var other = kind === "card" ? "bank" : "card";
      directions(rows, other, balances.open);
      var alt = balanceCheck(rows, other, balances);
      if (alt.ok) { kind = other; closing = alt; }
      else directions(rows, kind, balances.open);
    }

    // Check the totals the statement prints against what was read.
    checks.forEach(function (c) {
      if (c.kind === "section") {
        var list = sectionRows[c.sectionId] || [];
        var got = list.reduce(function (s, r) { return s + Math.abs(r.amount); }, 0);
        c.got = Math.round(got * 100) / 100;
        c.ok = Math.abs(c.got - c.expected) < 0.015;
      } else if (c.kind === "columns") {
        c.got = { "in": 0, out: 0 };
        rows.forEach(function (r) { if (r.col === "in") c.got["in"] += r.value; else if (r.col === "out") c.got.out += r.value; });
        c.ok = (c.expected["in"] == null || Math.abs(c.got["in"] - c.expected["in"]) < 0.015) &&
               (c.expected.out == null || Math.abs(c.got.out - c.expected.out) < 0.015);
      }
    });
    checks = checks.filter(function (c) { return c.kind !== "section" || (sectionRows[c.sectionId] || []).length || c.expected > 0.005; });
    if (closing) checks.push(closing);

    var issues = [];
    if (!rows.length) issues.push(lines.length ? "empty" : "no-text");
    if (checks.some(function (c) { return !c.ok; })) issues.push("totals");
    // Directions that were only guessed from the wording, and that no
    // running balance or closing balance confirms.
    if (rows.some(function (r) { return r.how === "guess" && !r.verified; }) && !(closing && closing.ok)) issues.push("sign");
    if (!period) issues.push("year");

    var txns = rows.map(function (r) {
      var desc = (r.desc + (r.more.length ? " " + r.more.join(" ") : "")).replace(/\s+/g, " ").trim();
      return { date: r.date, amount: Math.round(r.amount * 100) / 100, desc: desc || "(no description)", memo: "", bankCat: "", account: "" };
    });
    var pageCount = pages.length;
    return {
      format: "pdf",
      txns: txns,
      skipped: skipped,
      issues: issues,
      currency: currency,
      account: accountLabel(lines.filter(function (l) { return !l.used; }).map(function (l) { return l.text; }).join("\n"), kind, pdfName(opts.name)),
      pdf: { kind: kind, period: period, checks: checks, pages: pageCount, order: order, noise: outside + lone }
    };
  }

  // How many transaction-shaped lines, lined up, start at line i (up to
  // three; a page break may fall between them).
  function rowRun(lines, i, header, decimal, kind) {
    var first = null, n = 0;
    for (var j = i; j < lines.length && n < 3; j++) {
      if (lines[j].chrome || !lines[j].money.length) continue;
      var r = readRow(lines[j], header, decimal, kind, false);
      if (!r || r.dateX == null || r.amountX == null) break;
      if (first && (Math.abs(r.dateX - first.dateX) > 3 || Math.abs(r.amountX - first.amountX) > 3)) break;
      first = first || r;
      n++;
    }
    return n;
  }

  /* Running heads and feet: the same words (numbers aside) at the same
     height near the top or bottom of more than one page, like "Page 2 of
     4", the account number or the period. They are skipped, so they can
     neither end a section nor pass for one. Column headings and the
     titles of money-in or money-out sections count even when repeated. */
  function markChrome(lines, kind) {
    var pages = {}, byText = {};
    lines.forEach(function (l) {
      var p = pages[l.page] = pages[l.page] || { top: -Infinity, bottom: Infinity };
      p.top = Math.max(p.top, l.y);
      p.bottom = Math.min(p.bottom, l.y);
    });
    lines.forEach(function (l, i) {
      if (l.money.length || !l.cells.length) return;
      var p = pages[l.page], band = Math.max(40, 0.15 * (p.top - p.bottom));
      if (l.y < p.top - band && l.y > p.bottom + band) return;
      var sec = sectionOf(l.cells[0].text, kind);
      if (sec === "in" || sec === "out" || headerRow(lines, i, kind)) return;
      var key = l.text.toLowerCase().replace(/\d+/g, "#");
      (byText[key] = byText[key] || []).push(l);
    });
    Object.keys(byText).forEach(function (key) {
      var same = byText[key];
      same.forEach(function (l) {
        if (same.some(function (o) { return o.page !== l.page && Math.abs(o.y - l.y) <= 3; })) l.chrome = true;
      });
    });
  }

  function directions(rows, kind, open) {
    rows.forEach(function (r) {
      var v = r.value;
      r.verified = false;
      if (r.col === "in") { r.amount = v; r.how = "column"; return; }
      if (r.col === "out") { r.amount = -v; r.how = "column"; return; }
      if (r.tag === "CR") { r.amount = v; r.how = "sign"; return; }
      if (r.tag === "DR") { r.amount = -v; r.how = "sign"; return; }
      if (r.printed) {
        // A bank prints money out as negative; a card prints payments and
        // credits as negative and purchases as plain numbers.
        r.amount = (kind === "card" ? -r.printed : r.printed) * v;
        r.how = "sign";
        return;
      }
      if (r.section === "in" || r.section === "out") { r.amount = r.section === "in" ? v : -v; r.how = "section"; return; }
      if (r.typeDir) { r.amount = r.typeDir * v; r.how = "type"; return; }
      if (kind === "card") { r.amount = -v; r.how = "kind"; return; }
      r.amount = /\b(deposit|payroll|salary|refund|interest paid|dividend|transfer from|credit)\b/i.test(r.desc) ? v : -v;
      r.how = "guess";
    });
    // A running balance settles each direction it covers. A card's
    // balance is what is owed, so it moves the other way.
    var grow = kind === "card" ? -1 : 1, prev = open;
    rows.forEach(function (r) {
      if (r.balance != null && prev != null && r.how !== "column") {
        if (Math.abs(prev + grow * r.amount - r.balance) < 0.01) r.verified = true;
        else if (Math.abs(prev - grow * r.amount - r.balance) < 0.01) { r.amount = -r.amount; r.verified = true; }
      }
      if (r.balance != null) prev = r.balance;
    });
  }

  function balanceCheck(rows, kind, balances) {
    if (balances.open == null || balances.close == null || !rows.length) return null;
    var net = rows.reduce(function (s, r) { return s + r.amount; }, 0);
    // A bank balance grows with money in; a card balance is what is
    // owed, so it grows with money out.
    var expectClose = kind === "card" ? balances.open - net : balances.open + net;
    return { kind: "balance", label: "Opening and closing balance", expected: balances.close, got: Math.round(expectClose * 100) / 100, ok: Math.abs(expectClose - balances.close) < 0.015 };
  }

  // "Statement_09_14_26_586K_PDF.pdf" says nothing about the account.
  function pdfName(name) {
    var base = String(name || "").replace(/\.pdf$/i, "").split(/[\s_\-.()\[\]]+/).filter(function (w) {
      return w && !/\d/.test(w) && !/^pdf$/i.test(w);
    }).join(" ");
    var label = F.accountFromName(base);
    return label === "Imported account" ? "PDF statement" : label;
  }

  /* A line under a side-by-side header, cut into one line per copy. */
  function splitLine(line, header) {
    return header.groups.map(function (g) {
      var cells = line.cells.filter(function (c) { var mid = (c.x0 + c.x1) / 2; return mid >= g.x0 && mid < g.x1; });
      return {
        line: { page: line.page, y: line.y, h: line.h, cells: cells, money: cells.filter(function (c) { return c.money; }), text: cells.map(function (c) { return c.text; }).join("  ") },
        header: { cols: g.cols }
      };
    });
  }

  /* The column-heading block starting at line i, as {header, end}, or
     null. A line that is just a section title ("DEPOSITS AND ADDITIONS"
     over "DATE  DESCRIPTION  AMOUNT") is not part of it. */
  function headerRow(lines, i, kind) {
    var line = lines[i];
    if (!headerish(line) || titleLine(line, lines[i + 1], kind)) return null;
    var block = [line], j = i + 1;
    while (j < lines.length && j < i + 3 && lines[j].page === line.page && line.y - lines[j].y < 3.2 * line.h &&
           Math.abs(lines[j].h - line.h) <= 0.3 * Math.max(lines[j].h, line.h) && headerish(lines[j]) &&
           !titleLine(lines[j], lines[j - 1], kind) && !titleLine(lines[j], lines[j + 1], kind)) block.push(lines[j++]);
    var header = buildHeader(block);
    return header ? { header: header, end: j } : null;
  }

  // A section title rather than column labels: a lone cell that reads
  // like a section, or a section-like cell spanning several columns of
  // the line next to it.
  function titleLine(line, other, kind) {
    var c = line.cells[0];
    if (!c) return false;
    var spans = other && other.page === line.page ? other.cells.filter(function (n) { return n.x1 > c.x0 + 2 && n.x0 < c.x1 - 2; }).length : 0;
    if (line.cells.length === 1) return !!sectionOf(c.text, kind) || spans >= 2;
    return !!sectionOf(c.text, kind) && spans >= 2;
  }

  function dateLead(line) {
    for (var i = 0; i < Math.min(3, line.cells.length); i++) {
      var t = dateToken(line.cells[i].text);
      if (t && plausible(t)) return true;
    }
    return false;
  }

  function amountValue(mo, decimal) {
    var v = F.parseAmount(mo.raw, decimal);
    return v == null ? null : Math.abs(v);
  }

  function noteBalance(balances, label, mo, decimal, kind) {
    if (!mo) return;
    var v = balanceValue(mo, decimal, kind);
    if (v == null) return;
    if (/^(beginning|opening|previous|starting|start)\b|brought forward|b\/f|^balance forward/i.test(label)) { if (balances.open == null) balances.open = v; }
    else if (/^(ending|closing|end|new)\b|carried forward|c\/f/i.test(label)) balances.close = v;
  }

  // A balance below zero: printed negative, or marked DR on a bank
  // account (overdrawn) or CR on a card (in credit).
  function balanceValue(mo, decimal, kind) {
    var v = amountValue(mo, decimal);
    if (v == null) return null;
    var below = mo.printed < 0 || (kind === "card" ? mo.tag === "CR" : mo.tag === "DR");
    return below ? -v : v;
  }

  function nearestColumn(cell, header, roles) {
    var best = null, bestD = Infinity;
    header.cols.forEach(function (col) {
      if (roles.indexOf(col.role) < 0) return;
      var d = Math.min(Math.abs(cell.x1 - col.x1), Math.abs((cell.x0 + cell.x1) / 2 - (col.x0 + col.x1) / 2), Math.abs(cell.x0 - col.x0));
      if (d < bestD) { bestD = d; best = col; }
    });
    return bestD <= 70 ? best : null;
  }

  // The heading column nearest to the span x0..x1: overlapping ones
  // first, then by distance between centres.
  function columnAt(x0, x1, header) {
    var best = null, bestScore = Infinity, mid = (x0 + x1) / 2;
    header.cols.forEach(function (col) {
      var gap = Math.max(0, col.x0 - x1, x0 - col.x1);
      var score = gap * 1000 + Math.abs(mid - (col.x0 + col.x1) / 2);
      if (score < bestScore) { bestScore = score; best = col; }
    });
    return best && Math.max(0, best.x0 - x1, x0 - best.x1) <= 12 ? best : null;
  }

  function under(cell, col) {
    return cell.x1 > col.x0 - 6 && cell.x0 < col.x1 + 6;
  }

  /* One line as a transaction row, or null. */
  function readRow(line, header, decimal, kind, undated) {
    var cells = line.cells;
    if (!cells.length || !line.money.length) return null;
    var dateCells = [];
    var dated = header && header.cols.some(function (k) { return k.role === "date"; });
    cells.forEach(function (c, i) {
      if (c.money) return;
      var t = dateToken(c.text);
      if (!t || !plausible(t)) return;
      // Under headings, the date itself (not the text after it) must sit
      // in a date column: closer to it than to any other column.
      var col = null;
      if (dated) {
        var share = (c.x1 - c.x0) / Math.max(1, c.text.length);
        col = columnAt(c.x0, c.x0 + t.len * share, header);
        if (!col || col.role !== "date") return;
      } else if (i > 2) return;
      dateCells.push({ cell: c, token: t, col: col, index: i });
    });
    if (!dateCells.length && !undated) return null;
    if (dateCells.length && undated) return null;
    // Daily balance tables pair several dates with several amounts and
    // say nothing else.
    var bare = cells.filter(function (c) { var t = !c.money && dateToken(c.text); return t && t.len === c.text.length; }).length;
    var words = cells.filter(function (c) { var t = dateToken(c.text); return !c.money && !c.sign && !(t && t.len === c.text.length); }).length;
    if (bare >= 2 && line.money.length >= 2 && !words) return null;
    var pick = dateCells.filter(function (d) { return d.col && !d.col.post; })[0] || dateCells[0] || null;

    // Money: which column is each amount in?
    var amountCell = null, balanceCell = null, col = null;
    if (header) {
      line.money.forEach(function (c) {
        var k = nearestColumn(c, header, ["in", "out", "amount", "balance"]);
        if (!k) return;
        if (k.role === "balance") { if (!balanceCell) balanceCell = c; }
        else if (!amountCell) { amountCell = c; col = k.role; }
      });
    } else {
      var money = line.money.slice();
      if (money.length >= 2) { balanceCell = money[money.length - 1]; amountCell = money[money.length - 2]; }
      else amountCell = money[0];
      col = "amount";
    }

    // Description: what is left, minus reference and card-number columns.
    var parts = [], descX = Infinity, checkNo = "", typeDir = 0;
    cells.forEach(function (c, i) {
      if (c.money || c.sign) return;
      if (dateCells.some(function (d) { return d.cell === c; })) {
        var rest = c.text.slice(dateCells.filter(function (d) { return d.cell === c; })[0].token.len).trim();
        if (rest) { parts.push(rest); descX = Math.min(descX, c.x0); }
        return;
      }
      if (header) {
        var aux = header.cols.filter(function (k) { return k.role === "aux" && under(c, k) && !header.cols.some(function (o) { return o.role === "desc" && under(c, o) && c.x0 >= o.x0 - 2; }); })[0];
        if (aux) {
          if (aux.check && /^\d+\b/.test(c.text)) checkNo = /^\d+/.exec(c.text)[0];
          if (/type|category/.test(norm(aux.label))) typeDir = /^(credit|deposit|cr)\b/i.test(c.text) ? 1 : /^(debit|withdrawal|dr)\b/i.test(c.text) ? -1 : 0;
          return;
        }
        if (amountCell && c.x0 > amountCell.x1) return;
      } else {
        // Before the date: a card or check number. Right after it:
        // reference codes like 1234567AB12CD34EF.
        if (pick && i < pick.index) return;
        if (!parts.length && /^[A-Z0-9]{10,}$/.test(c.text) && /\d/.test(c.text)) return;
      }
      parts.push(c.text);
      descX = Math.min(descX, c.x0);
    });
    var desc = parts.join(" ").replace(/\s*\^$/, "").replace(/\s+/g, " ").trim();
    if (checkNo && (!desc || /^check$/i.test(desc))) desc = "Check " + checkNo;
    // A transaction says what it was: a dated amount with no words is a
    // table of figures, not a purchase.
    if (!/[a-z]{2}/i.test(desc)) return null;
    if (undated && (!amountCell || col === "balance")) return null;
    if (descX === Infinity) {
      var dcol = header && header.cols.filter(function (k) { return k.role === "desc"; })[0];
      descX = dcol ? dcol.x0 : pick ? pick.cell.x1 : cells[0].x0;
    }

    var row = { token: pick ? pick.token : null, desc: desc, descX: descX, more: [], typeDir: typeDir, amount: null, balance: null,
      dateX: pick ? pick.cell.x0 : null, amountX: amountCell ? amountCell.x1 : null };
    if (amountCell) {
      row.value = amountValue(amountCell.money, decimal);
      row.printed = amountCell.money.printed;
      row.tag = amountCell.money.tag;
      row.col = col;
      row.amount = row.value;
      row.amountMoney = amountCell.money;
    }
    if (balanceCell) {
      row.balance = balanceValue(balanceCell.money, decimal, kind);
      row.balanceMoney = balanceCell.money;
    }
    return row;
  }

  // "Total ..." lines: one amount checks the section above; amounts under
  // in/out columns check those columns.
  function totalCheck(line, header, sectionId, sectionName) {
    var label = line.cells[0].text;
    if (header && line.money.length >= 1) {
      var expected = {}, any = false;
      line.money.forEach(function (c) {
        var k = nearestColumn(c, header, ["in", "out", "amount", "balance"]);
        if (k && (k.role === "in" || k.role === "out")) { expected[k.role] = Math.abs(F.parseAmount(c.money.raw) || 0); any = true; }
      });
      if (any && (expected["in"] != null && expected.out != null)) return { kind: "columns", label: label, expected: expected };
    }
    var mo = line.money[line.money.length - 1].money;
    return { kind: "section", label: label || sectionName, sectionId: sectionId, expected: Math.abs(F.parseAmount(mo.raw) || 0) };
  }

  /* ── pdf.js ──────────────────────────────────────────────────────────
     Loaded on first use from vendor/pdfjs next to this script. Nothing it
     might fetch is configured (no CMaps, standard fonts, WebAssembly or
     colour profiles), the document is handed over as bytes, and code
     evaluation is off. */
  var here = (typeof document !== "undefined" && document.currentScript && document.currentScript.src) || "";
  var BASE = here ? here.replace(/[^\/]*$/, "") + "vendor/pdfjs/" : "vendor/pdfjs/";
  var engine = null;

  function load() {
    if (!engine) {
      engine = import(BASE + "pdf.min.js").then(function (lib) {
        lib.GlobalWorkerOptions.workerSrc = BASE + "pdf.worker.min.js";
        return lib;
      });
      engine.catch(function () { engine = null; });
    }
    return engine;
  }

  var MAX_PAGES = 80;

  // Positioned text of each page: { pages: [{ items: [{str, x, y, w, h}] }],
  // truncated }. Rejects with a PdfReaderError if pdf.js can't be loaded,
  // or with pdf.js's own error (PasswordException for a locked file).
  function extract(bytes, password) {
    return load().then(function (lib) {
      // pdf.js takes over the buffer it is given, so each try gets a copy.
      var task = lib.getDocument({
        data: new Uint8Array(bytes.slice(0)),
        password: password || undefined,
        isEvalSupported: false,
        useSystemFonts: false,
        disableFontFace: true,
        useWorkerFetch: false,
        useWasm: false,
        isOffscreenCanvasSupported: false,
        isImageDecoderSupported: false,
        enableXfa: false,
        disableRange: true,
        disableStream: true,
        disableAutoFetch: true,
        stopAtErrors: false,
        verbosity: 0
      });
      return task.promise.then(function (doc) {
        var pages = [], n = Math.min(doc.numPages, MAX_PAGES), chain = Promise.resolve();
        function readPage(p) {
          return doc.getPage(p).then(function (page) {
            return page.getTextContent().then(function (tc) {
              pages.push({
                items: tc.items.filter(function (it) { return typeof it.str === "string"; }).map(function (it) {
                  return { str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) || 8 };
                })
              });
              page.cleanup();
            });
          });
        }
        for (var p = 1; p <= n; p++) chain = chain.then(readPage.bind(null, p));
        return chain.then(function () {
          task.destroy();
          return { pages: pages, truncated: doc.numPages > MAX_PAGES };
        });
      }, function (err) {
        task.destroy();
        throw err;
      });
    }, function (cause) {
      var err = new Error("The PDF reader couldn't be loaded.");
      err.name = "PdfReaderError";
      err.cause = cause;
      throw err;
    });
  }

  // "need" or "wrong" for password errors, null for anything else.
  function passwordProblem(err) {
    if (!err || err.name !== "PasswordException") return null;
    return err.code === 2 ? "wrong" : "need";
  }

  function isPdf(bytes) {
    var head = new Uint8Array(bytes, 0, Math.min(1024, bytes.byteLength));
    for (var i = 0; i + 4 < head.length; i++) {
      if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) return true;
    }
    return false;
  }

  kit.pdf = {
    parse: parse,
    extract: extract,
    passwordProblem: passwordProblem,
    isPdf: isPdf,
    toLines: toLines
  };
})(window.SpendscapeKit = window.SpendscapeKit || {});
