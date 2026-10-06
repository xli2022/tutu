/* ── Spendscape · analysis ───────────────────────────────────────────────
   Everything the dashboard shows, computed from resolved transactions:

     { id, date, amount, cat, kind, key, merchant, account, desc }

   `kind` comes from the category: "expense" is spending, "income" is
   income and "transfer" is neither. Spending is the net outflow of expense
   transactions, so a refund nets its category down rather than counting
   as income. Ranges are { from, to } in day numbers, both inclusive.
   Pure functions; the app decides what to draw.                         */
(function (kit) {
  "use strict";

  var DAY_MS = 864e5;
  var dayOf = kit.formats.dayOf, ymd = kit.formats.ymd;

  /* ── Periods ─────────────────────────────────────────────────────────
     A period key is an integer per granularity: the day number for days,
     the Monday's day number for weeks, y*12+m for months, y*4+q for
     quarters. */
  function keyOf(day, gran) {
    if (gran === "day") return day;
    if (gran === "week") return day - ((day + 3) % 7);
    var p = ymd(day);
    if (gran === "quarter") return p.y * 4 + Math.floor((p.m - 1) / 3);
    return p.y * 12 + p.m - 1;
  }

  function startOf(key, gran) {
    if (gran === "day" || gran === "week") return key;
    if (gran === "quarter") return dayOf(Math.floor(key / 4), (key % 4) * 3 + 1, 1);
    return dayOf(Math.floor(key / 12), (key % 12) + 1, 1);
  }

  function nextKey(key, gran) {
    return gran === "week" ? key + 7 : key + 1;
  }

  function endOf(key, gran) {
    return startOf(nextKey(key, gran), gran) - 1;
  }

  function keysBetween(from, to, gran) {
    var out = [];
    for (var k = keyOf(from, gran); startOf(k, gran) <= to; k = nextKey(k, gran)) out.push(k);
    return out;
  }

  var fmtCache = {};
  function dateFmt(opts) {
    var id = JSON.stringify(opts);
    if (!fmtCache[id]) {
      var o = { timeZone: "UTC" };
      for (var k in opts) o[k] = opts[k];
      fmtCache[id] = new Intl.DateTimeFormat(undefined, o);
    }
    return fmtCache[id];
  }

  function dateOf(day) {
    return new Date(day * DAY_MS);
  }

  function formatDay(day, opts) {
    return dateFmt(opts || { month: "short", day: "numeric", year: "numeric" }).format(dateOf(day));
  }

  // Short labels for axes, long ones for tooltips and headings.
  function periodLabel(key, gran, long) {
    var d = dateOf(startOf(key, gran));
    if (gran === "quarter") {
      var q = (key % 4) + 1, y = Math.floor(key / 4);
      return long ? "Q" + q + " " + y : "Q" + q + " ’" + String(y).slice(2);
    }
    if (gran === "week") {
      return long
        ? "Week of " + dateFmt({ month: "short", day: "numeric", year: "numeric" }).format(d)
        : dateFmt({ month: "short", day: "numeric" }).format(d);
    }
    if (gran === "day") {
      return long
        ? dateFmt({ weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(d)
        : dateFmt({ month: "short", day: "numeric" }).format(d);
    }
    return long ? dateFmt({ month: "long", year: "numeric" }).format(d) : dateFmt({ month: "short" }).format(d);
  }

  function rangeLabel(range) {
    var a = ymd(range.from), b = ymd(range.to);
    if (a.y === b.y && a.m === b.m) {
      return formatDay(range.from, { month: "long", year: "numeric" });
    }
    var sameYear = a.y === b.y;
    return formatDay(range.from, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }) +
      " – " + formatDay(range.to, { month: "short", day: "numeric", year: "numeric" });
  }

  /* ── Basics ──────────────────────────────────────────────────────── */
  function inRange(t, r) {
    return t.date >= r.from && t.date <= r.to;
  }

  function extent(txns) {
    if (!txns.length) return null;
    var lo = Infinity, hi = -Infinity;
    txns.forEach(function (t) {
      if (t.date < lo) lo = t.date;
      if (t.date > hi) hi = t.date;
    });
    return { from: lo, to: hi };
  }

  function zeros(n) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = 0;
    return a;
  }

  function median(values) {
    if (!values.length) return 0;
    var s = values.slice().sort(function (a, b) { return a - b; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function round2(v) {
    return Math.round(v * 100) / 100;
  }

  // The same stretch of time just before `range`, for "vs previous" deltas.
  function previousRange(range) {
    var len = range.to - range.from + 1;
    return { from: range.from - len, to: range.from - 1 };
  }

  // Calendar-aware variant for whole months: Jun-Aug before Sep-Nov.
  function previousMonths(range) {
    var a = ymd(range.from), b = ymd(range.to + 1);
    if (a.d !== 1 || b.d !== 1) return previousRange(range);
    var months = (b.y * 12 + b.m) - (a.y * 12 + a.m);
    var startKey = a.y * 12 + a.m - 1 - months;
    return { from: dayOf(Math.floor(startKey / 12), (startKey % 12) + 1, 1), to: range.from - 1 };
  }

  /* ── Totals ──────────────────────────────────────────────────────── */
  function totals(txns, range) {
    var out = { spent: 0, income: 0, count: 0, byCat: {}, countByCat: {} };
    txns.forEach(function (t) {
      if (!inRange(t, range)) return;
      if (t.kind === "expense") {
        out.spent -= t.amount;
        out.byCat[t.cat] = (out.byCat[t.cat] || 0) - t.amount;
        out.countByCat[t.cat] = (out.countByCat[t.cat] || 0) + 1;
        out.count++;
      } else if (t.kind === "income") {
        out.income += t.amount;
      }
    });
    out.spent = round2(out.spent);
    out.income = round2(out.income);
    out.net = round2(out.income - out.spent);
    return out;
  }

  // How many months of data a range really holds, so averages are not
  // dragged down by the part of the range before the first statement.
  function monthsCovered(range, data) {
    if (!data) return 0;
    var from = Math.max(range.from, data.from), to = Math.min(range.to, data.to);
    return to < from ? 0 : (to - from + 1) / 30.4375;
  }

  function covers(range, data) {
    return !!data && range.from >= data.from - 3 && range.to <= data.to + 3;
  }

  /* Headline numbers with deltas against the previous stretch of time,
     when the data reaches back that far. */
  function kpis(txns, range, data) {
    var now = totals(txns, range);
    var prevRange = previousMonths(range);
    var prev = covers(prevRange, data) ? totals(txns, prevRange) : null;
    var months = monthsCovered(range, data);
    var prevMonths = prev ? monthsCovered(prevRange, data) : 0;
    return {
      spent: now.spent,
      income: now.income,
      net: now.net,
      savingsRate: now.income > 0 ? now.net / now.income : null,
      perMonth: months >= 0.9 ? now.spent / months : null,
      months: months,
      count: now.count,
      byCat: now.byCat,
      countByCat: now.countByCat,
      prev: prev && {
        spent: prev.spent,
        income: prev.income,
        net: prev.net,
        perMonth: prevMonths >= 0.9 ? prev.spent / prevMonths : null,
        byCat: prev.byCat,
        range: prevRange
      }
    };
  }

  /* ── Series ──────────────────────────────────────────────────────── */
  // Net spend per category per period over the range.
  function categorySeries(txns, range, gran, filter) {
    var keys = keysBetween(range.from, range.to, gran);
    var index = {};
    keys.forEach(function (k, i) { index[k] = i; });
    var byCat = {};
    txns.forEach(function (t) {
      if (t.kind !== "expense" || !inRange(t, range)) return;
      if (filter && !filter(t)) return;
      var row = byCat[t.cat] || (byCat[t.cat] = zeros(keys.length));
      row[index[keyOf(t.date, gran)]] -= t.amount;
    });
    for (var c in byCat) byCat[c] = byCat[c].map(round2);
    return { keys: keys, byCat: byCat };
  }

  // Income, spending and net per period.
  function cashflow(txns, range, gran) {
    var keys = keysBetween(range.from, range.to, gran);
    var index = {};
    keys.forEach(function (k, i) { index[k] = i; });
    var income = zeros(keys.length), spent = zeros(keys.length);
    txns.forEach(function (t) {
      if (!inRange(t, range)) return;
      var i = index[keyOf(t.date, gran)];
      if (t.kind === "income") income[i] += t.amount;
      else if (t.kind === "expense") spent[i] -= t.amount;
    });
    return {
      keys: keys,
      income: income.map(round2),
      spent: spent.map(round2),
      net: income.map(function (v, i) { return round2(v - spent[i]); })
    };
  }

  // Share of each period that the data actually covers: a statement that
  // starts on the 14th leaves its first month half empty.
  function coverage(keys, gran, data) {
    return keys.map(function (k) {
      if (!data) return 0;
      var a = startOf(k, gran), b = endOf(k, gran);
      var from = Math.max(a, data.from), to = Math.min(b, data.to);
      return to < from ? 0 : (to - from + 1) / (b - a + 1);
    });
  }

  // Daily spend, for the calendar.
  function daily(txns, range, filter) {
    var days = {};
    txns.forEach(function (t) {
      if (t.kind !== "expense" || !inRange(t, range)) return;
      if (filter && !filter(t)) return;
      var d = days[t.date] || (days[t.date] = { spent: 0, count: 0, items: [] });
      d.spent -= t.amount;
      d.count++;
      d.items.push(t);
    });
    for (var k in days) {
      days[k].spent = round2(days[k].spent);
      days[k].items.sort(function (a, b) { return a.amount - b.amount; });
    }
    return days;
  }

  // Expense categories by all-time spend: the order that hands out colours,
  // so a category keeps its colour whatever range is on screen.
  function rankCategories(txns) {
    var sum = {};
    txns.forEach(function (t) {
      if (t.kind === "expense") sum[t.cat] = (sum[t.cat] || 0) - t.amount;
    });
    return Object.keys(sum)
      .filter(function (c) { return sum[c] > 0; })
      .sort(function (a, b) { return sum[b] - sum[a]; });
  }

  /* ── Merchants ───────────────────────────────────────────────────── */
  function merchants(txns, range, filter) {
    var by = {};
    txns.forEach(function (t) {
      if (t.kind !== "expense" || !inRange(t, range)) return;
      if (filter && !filter(t)) return;
      var m = by[t.key] || (by[t.key] = { key: t.key, name: t.merchant, total: 0, count: 0, cats: {} });
      m.total -= t.amount;
      m.count++;
      m.cats[t.cat] = (m.cats[t.cat] || 0) - t.amount;
    });
    return Object.keys(by).map(function (k) {
      var m = by[k], best = null;
      for (var c in m.cats) if (!best || m.cats[c] > m.cats[best]) best = c;
      return { key: m.key, name: m.name, total: round2(m.total), count: m.count, cat: best };
    }).filter(function (m) { return m.total > 0; })
      .sort(function (a, b) { return b.total - a.total; });
  }

  /* ── Recurring payments ──────────────────────────────────────────────
     A merchant that charges about the same amount at a steady rhythm.
     Looks at all the data, not just the range on screen, since a
     subscription only shows its rhythm over several charges.            */
  var CADENCES = [
    { id: "weekly",    days: 7,   slack: 2,  maxCv: 0.1 },
    { id: "biweekly",  days: 14,  slack: 3,  maxCv: 0.15 },
    { id: "monthly",   days: 30.4375, slack: 5, maxCv: 0.35 },
    { id: "quarterly", days: 91,  slack: 10, maxCv: 0.35 },
    { id: "yearly",    days: 365, slack: 15, maxCv: 0.35 }
  ];

  function recurring(txns, data) {
    var groups = {};
    txns.forEach(function (t) {
      if (t.kind !== "expense" || t.amount >= 0) return;
      (groups[t.key] || (groups[t.key] = [])).push(t);
    });
    var out = [];
    Object.keys(groups).forEach(function (key) {
      var list = groups[key].slice().sort(function (a, b) { return a.date - b.date; });
      if (list.length < 3) return;
      var gaps = [];
      for (var i = 1; i < list.length; i++) gaps.push(list[i].date - list[i - 1].date);
      var gap = median(gaps);
      var cad = null;
      CADENCES.forEach(function (c) {
        if (!cad && Math.abs(gap - c.days) <= c.slack) cad = c;
      });
      if (!cad) return;
      var steady = gaps.filter(function (g) { return Math.abs(g - cad.days) <= cad.slack * 1.6; }).length;
      if (steady / gaps.length < 0.7) return;

      var amounts = list.map(function (t) { return -t.amount; });
      var mean = amounts.reduce(function (s, v) { return s + v; }, 0) / amounts.length;
      var sd = Math.sqrt(amounts.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / amounts.length);
      var cv = mean ? sd / mean : 1;
      // Prices change, so judge the amount by the latest few charges.
      var recent = amounts.slice(-3);
      var recentMed = median(recent);
      var recentSteady = recent.every(function (v) { return Math.abs(v - recentMed) <= recentMed * 0.15; });
      if (cv > cad.maxCv && !recentSteady) return;

      var last = list[list.length - 1];
      var active = !data || data.to - last.date <= cad.days * 1.5 + cad.slack;
      out.push({
        key: key,
        name: last.merchant,
        cat: last.cat,
        cadence: cad.id,
        every: cad.days,
        amount: round2(recentMed),
        varies: cv > 0.08,
        count: list.length,
        first: list[0].date,
        last: last.date,
        next: Math.round(last.date + cad.days),
        dates: list.map(function (t) { return t.date; }),
        monthly: round2(recentMed * 30.4375 / cad.days),
        active: active
      });
    });
    return out.sort(function (a, b) {
      return (b.active - a.active) || (b.monthly - a.monthly);
    });
  }

  /* ── Money flow ──────────────────────────────────────────────────────
     Income on the left, where it went on the right. If spending beat
     income the gap is drawn as coming out of savings; if income won, the
     remainder goes to "Saved". */
  function flow(txns, range, colored) {
    var sources = {}, targets = {}, income = 0, spent = 0;
    var isColored = {};
    colored.forEach(function (c) { isColored[c] = true; });
    txns.forEach(function (t) {
      if (!inRange(t, range)) return;
      if (t.kind === "income") {
        income += t.amount;
        sources[t.key] = sources[t.key] || { name: t.merchant, value: 0 };
        sources[t.key].value += t.amount;
      } else if (t.kind === "expense") {
        spent -= t.amount;
        var id = isColored[t.cat] ? t.cat : "_other";
        targets[id] = (targets[id] || 0) - t.amount;
      }
    });
    var src = Object.keys(sources).map(function (k) { return sources[k]; })
      .filter(function (s) { return s.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });
    if (src.length > 4) {
      var rest = src.slice(3).reduce(function (s, x) { return s + x.value; }, 0);
      src = src.slice(0, 3).concat([{ name: "Other income", value: rest, other: true }]);
    }
    var tgt = Object.keys(targets).map(function (id) { return { id: id, value: targets[id] }; })
      .filter(function (t) { return t.value > 0; })
      .sort(function (a, b) {
        if (a.id === "_other") return 1;
        if (b.id === "_other") return -1;
        return b.value - a.value;
      });
    var positiveIncome = src.reduce(function (s, x) { return s + x.value; }, 0);
    var positiveSpend = tgt.reduce(function (s, x) { return s + x.value; }, 0);
    return {
      sources: src.map(function (s) { return { name: s.name, value: round2(s.value), other: !!s.other }; }),
      targets: tgt.map(function (t) { return { id: t.id, value: round2(t.value) }; }),
      saved: round2(Math.max(0, positiveIncome - positiveSpend)),
      deficit: round2(Math.max(0, positiveSpend - positiveIncome)),
      income: round2(income),
      spent: round2(spent)
    };
  }

  /* ── Insights ────────────────────────────────────────────────────────
     A few plain sentences about the range. `money` formats amounts and
     `catName` names a category; both come from the app. Each insight has
     an optional action the app can wire to a filter.                   */
  function insights(ctx) {
    var out = [];
    var k = ctx.kpis, money = ctx.money, catName = ctx.catName;
    var cats = Object.keys(k.byCat).filter(function (c) { return k.byCat[c] > 0; })
      .sort(function (a, b) { return k.byCat[b] - k.byCat[a]; });

    if (k.income > 0) {
      var rate = k.net / k.income;
      out.push(rate >= 0
        ? { icon: "🐷", title: "Kept " + Math.round(rate * 100) + "% of income", text: "You brought in " + money(k.income) + " and spent " + money(k.spent) + ", leaving " + money(k.net) + ".", tone: "good" }
        : { icon: "⚠️", title: "Spent more than earned", text: "Spending beat income by " + money(-k.net) + " over this stretch.", tone: "bad" });
    }

    // Rent usually tops the list, which surprises nobody; say what comes
    // after it too.
    if (cats.length && k.spent > 0) {
      var top = cats[0], share = function (c) { return Math.round(k.byCat[c] / k.spent * 100) + "%"; };
      var text = catName(top) + " took " + share(top) + " of your spending: " + money(k.byCat[top]) + ".";
      if (top === "housing" && cats[1]) {
        text = "Housing took " + share(top) + " of your spending. After that, " + catName(cats[1]) + " leads with " + share(cats[1]) + " (" + money(k.byCat[cats[1]]) + ").";
      }
      out.push({ icon: "🥇", title: catName(top) + " leads", text: text, action: { cat: top === "housing" && cats[1] ? cats[1] : top } });
    }

    if (k.prev) {
      var best = null;
      cats.concat(Object.keys(k.prev.byCat)).forEach(function (c) {
        var now = k.byCat[c] || 0, then = k.prev.byCat[c] || 0;
        var diff = now - then;
        if (then < 50 || Math.abs(diff) < 40) return;
        if (!best || Math.abs(diff) > Math.abs(best.diff)) best = { cat: c, diff: diff, pct: diff / then };
      });
      if (best) {
        var up = best.diff > 0;
        out.push({
          icon: up ? "📈" : "📉",
          title: catName(best.cat) + (up ? " is up" : " is down"),
          text: catName(best.cat) + " is " + (up ? "up " : "down ") + Math.abs(Math.round(best.pct * 100)) + "% on the stretch before (" +
            (up ? "+" : "\u2212") + money(Math.abs(best.diff)) + ").",
          tone: up ? "bad" : "good",
          action: { cat: best.cat }
        });
      }
    }

    var loose = ctx.txns.filter(function (t) { return t.cat === "uncategorized" && inRange(t, ctx.range); }).length;
    if (loose) {
      out.push({
        icon: "🏷️",
        title: loose + " to sort",
        text: loose === 1 ? "One transaction has no category yet. Give it one and the charts sharpen up." : loose + " transactions have no category yet. Give them one and the charts sharpen up.",
        action: { cat: "uncategorized" }
      });
    }

    if (ctx.months && ctx.months.keys.length >= 3) {
      var m = ctx.months, peak = 0;
      for (var i = 1; i < m.spent.length; i++) if (m.spent[i] > m.spent[peak]) peak = i;
      var full = m.spent.filter(function (v, j) { return m.coverage[j] > 0.95; });
      var avg = full.length ? full.reduce(function (s, v) { return s + v; }, 0) / full.length : 0;
      if (avg > 0 && m.coverage[peak] > 0.95 && m.spent[peak] > avg * 1.08) {
        out.push({
          icon: "🗓️",
          title: "Priciest month",
          text: periodLabel(m.keys[peak], "month", true) + " cost " + money(m.spent[peak]) + ", " +
            Math.round((m.spent[peak] / avg - 1) * 100) + "% above your monthly average.",
          action: { period: m.keys[peak], gran: "month" }
        });
      }
    }

    var subs = (ctx.recurring || []).filter(function (r) { return r.active; });
    if (subs.length >= 2) {
      var monthly = subs.reduce(function (s, r) { return s + r.monthly; }, 0);
      out.push({
        icon: "🔁",
        title: "Regular payments",
        text: subs.length + " bills and subscriptions add up to about " + money(monthly) + " a month, or " + money(monthly * 12) + " a year.",
        action: { scroll: "recurring" }
      });
    }

    var largest = null;
    ctx.txns.forEach(function (t) {
      if (t.kind === "expense" && inRange(t, ctx.range) && t.amount < 0 && t.cat !== "housing" && (!largest || t.amount < largest.amount)) largest = t;
    });
    if (largest) {
      out.push({
        icon: "💸",
        title: "Biggest one-off",
        text: largest.merchant + ", " + money(-largest.amount) + " on " + formatDay(largest.date, { month: "short", day: "numeric" }) + ".",
        action: { search: largest.merchant }
      });
    }

    // Weekends against weekdays, on going-out money only: groceries, rent
    // and bills land on fixed days and would swamp it.
    var fun = { dining: 1, shopping: 1, entertainment: 1, personal: 1 };
    var wkEnd = 0, wkDay = 0, nEnd = 0, nDay = 0;
    for (var d = ctx.range.from; d <= ctx.range.to; d++) {
      if (ctx.data && (d < ctx.data.from || d > ctx.data.to)) continue;
      if ((d + 4) % 7 === 0 || (d + 4) % 7 === 6) nEnd++; else nDay++;
    }
    ctx.txns.forEach(function (t) {
      if (t.kind !== "expense" || !fun[t.cat] || !inRange(t, ctx.range)) return;
      var dow = (t.date + 4) % 7;
      if (dow === 0 || dow === 6) wkEnd -= t.amount; else wkDay -= t.amount;
    });
    if (nEnd >= 4 && nDay >= 10 && wkDay > 0) {
      var ratio = (wkEnd / nEnd) / (wkDay / nDay);
      if (ratio > 1.15 || ratio < 0.87) {
        out.push({
          icon: ratio > 1 ? "🎉" : "💼",
          title: ratio > 1 ? "Weekend spender" : "Weekday spender",
          text: "On dining, shopping and fun you spend " + money(wkEnd / nEnd) + " a day at weekends against " + money(wkDay / nDay) + " on weekdays."
        });
      }
    }
    return out;
  }

  kit.analysis = {
    keyOf: keyOf,
    startOf: startOf,
    endOf: endOf,
    nextKey: nextKey,
    keysBetween: keysBetween,
    periodLabel: periodLabel,
    rangeLabel: rangeLabel,
    formatDay: formatDay,
    dateFmt: dateFmt,
    extent: extent,
    previousRange: previousMonths,
    totals: totals,
    kpis: kpis,
    categorySeries: categorySeries,
    cashflow: cashflow,
    coverage: coverage,
    daily: daily,
    rankCategories: rankCategories,
    merchants: merchants,
    recurring: recurring,
    flow: flow,
    insights: insights,
    median: median
  };
})(window.SpendscapeKit = window.SpendscapeKit || {});
