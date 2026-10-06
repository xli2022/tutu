/* ── Spendscape · sample statements ─────────────────────────────────────
   Fifteen months of believable activity for two made-up accounts, ending
   today, written out as the CSV a bank would export. The demo goes through
   the real importer, so it exercises the same parsing, sign detection and
   categorising a real file does:

     sample-checking.csv  Chase-style: "Posting Date", signed amounts and a
                          running balance.
     sample-card.csv      Amex-style: purchases are positive, which the
                          importer has to notice and flip.

   Seeded, so every visit tells the same story.                           */
(function (kit) {
  "use strict";

  var DAY_MS = 864e5;

  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate(endDate) {
    var rand = rng(20240607);
    var pick = function (a) { return a[Math.floor(rand() * a.length)]; };
    var between = function (lo, hi) { return lo + rand() * (hi - lo); };
    var cents = function (v) { return Math.round(v * 100) / 100; };

    var end = endDate || new Date();
    var endDay = Math.floor(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) / DAY_MS);
    var startDate = new Date(Date.UTC(end.getFullYear(), end.getMonth() - 15, 1));
    var startDay = Math.floor(startDate.getTime() / DAY_MS);

    var checking = [], card = [];
    function chk(day, desc, amount) { if (day >= startDay && day <= endDay) checking.push({ day: day, desc: desc, amount: cents(amount) }); }
    function crd(day, desc, amount) { if (day >= startDay && day <= endDay) card.push({ day: day, desc: desc, amount: cents(amount) }); }

    function parts(day) {
      var d = new Date(day * DAY_MS);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
    }
    function dayOf(y, m, d) { return Math.floor(Date.UTC(y, m, d) / DAY_MS); }
    // Paydays that fall on a weekend move to the nearest weekday inside
    // the same month: forward on the 1st, back to Friday on the 15th.
    function weekday(day) {
      var p = parts(day), dow = p.dow;
      if (dow !== 0 && dow !== 6) return day;
      if (p.d === 1) return day + (dow === 6 ? 2 : 1);
      return dow === 6 ? day - 1 : day - 2;
    }

    var monthIndex = 0;
    for (var y = startDate.getUTCFullYear(), m = startDate.getUTCMonth(); dayOf(y, m, 1) <= endDay; m++) {
      if (m === 12) { m = 0; y++; }
      var first = dayOf(y, m, 1);
      var raise = monthIndex >= 9;
      var winter = m === 11 || m <= 1;
      var summer = m >= 5 && m <= 7;

      // ── Checking ──
      chk(weekday(first), "ACME ROBOTICS PAYROLL PPD ID: 9876543210", raise ? 2780 : 2650);
      chk(weekday(dayOf(y, m, 15)), "ACME ROBOTICS PAYROLL PPD ID: 9876543210", raise ? 2780 : 2650);
      chk(first, "OAKWOOD APARTMENTS RENT PPD ID: 4455667788", -2150);
      chk(dayOf(y, m, 3), "PG&E/EZ-PAY 4471236589", -(winter ? between(118, 156) : summer ? between(58, 76) : between(78, 104)));
      chk(dayOf(y, m, 6), "COMCAST CABLE COMM 800-266-2278", -89.99);
      chk(dayOf(y, m, 9), "VERIZON WIRELESS PAYMENTS", -72.4);
      chk(dayOf(y, m, 12), "GEICO *AUTO 800-841-3000", -128.5);
      chk(dayOf(y, m, 2), "PLANET FITNESS CLUB #0842", -24.99);
      chk(dayOf(y, m, 16), "ONLINE TRANSFER TO SAV XXXXXX4821 REF #IB0F5K", -400);
      chk(dayOf(y, m + 1, 0), "INTEREST PAYMENT", between(0.8, 2.6));
      if (rand() < 0.55) chk(dayOf(y, m, 5 + Math.floor(rand() * 20)), "ATM WITHDRAWAL #001234 24TH & MISSION", -pick([40, 60, 100]));
      if (rand() < 0.6) chk(dayOf(y, m, 3 + Math.floor(rand() * 24)), "VENMO PAYMENT 10" + Math.floor(rand() * 9e7), -pick([18, 25, 32, 45]));
      if (m === 3) chk(dayOf(y, m, 18), "IRS TREAS 310 TAX REF", 1240);
      if (m === 7) chk(dayOf(y, m, 22), "SF WATER DEPT UTILITY BILL", -96.3);

      // ── Card ──
      var last = Math.min(dayOf(y, m + 1, 0), endDay);
      for (var day = first; day <= last; day++) {
        var dow = parts(day).dow, weekend = dow === 0 || dow === 6;
        if ((dow === 6 || (dow === 0 && rand() < 0.35)) && rand() < 0.92) {
          crd(day, pick(["TRADER JOE S #552 QPS SAN FRANCISCO CA", "TRADER JOE S #552 QPS SAN FRANCISCO CA", "SAFEWAY #1234 SAN FRANCISCO CA"]), between(46, 118));
        }
        if (dow === 3 && rand() < 0.4) crd(day, "WHOLEFDS MKT 10234 SAN FRANCISCO CA", between(22, 64));
        if (!weekend && rand() < 0.62) crd(day, pick(["BLUE BOTTLE COFFEE 0432 OAKLAND CA", "BLUE BOTTLE COFFEE 0432 OAKLAND CA", "STARBUCKS STORE 05432 SAN FRANCISCO CA", "SQ *RITUAL COFFEE ROASTERS"]), between(4.5, 7.8));
        if (rand() < (weekend ? 0.5 : 0.22)) {
          crd(day, pick(["SQ *TARTINE BAKERY", "TST* NOPA RESTAURANT", "CHIPOTLE 1234", "DOORDASH*THAI HOUSE", "UBER *EATS PENDING", "TST* ZUNI CAFE", "SWEETGREEN SOMA"]), weekend ? between(28, 96) : between(13, 34));
        }
        if (rand() < (weekend ? 0.26 : 0.18)) crd(day, "UBER *TRIP HELP.UBER.COM", between(11, 38));
        if (rand() < 0.04) crd(day, "LYFT *RIDE SUN 3PM", between(14, 30));
        if (rand() < 0.09) crd(day, "CHEVRON 0091234 SAN FRANCISCO CA", between(44, 68));
        if (rand() < (m >= 10 ? 0.3 : 0.12)) crd(day, "AMAZON MKTP US*" + Math.floor(rand() * 1e9).toString(36).toUpperCase(), between(9, m >= 10 ? 160 : 85));
        if (rand() < 0.025) crd(day, "CVS/PHARMACY #01234", between(8, 46));
        if (rand() < 0.012) crd(day, pick(["GLOBEX INTERNATIONAL", "INITECH SERVICES 5512", "HOOLI MARKETPLACE"]), between(12, 90));
      }
      crd(dayOf(y, m, 4), "NETFLIX.COM", monthIndex >= 7 ? 17.99 : 15.49);
      crd(dayOf(y, m, 11), "SPOTIFY USA", monthIndex >= 11 ? 11.99 : 10.99);
      crd(dayOf(y, m, 14), "GOOGLE *GOOGLE ONE", 2.99);
      crd(dayOf(y, m, 21), "APPLE.COM/BILL", 0.99);
      crd(dayOf(y, m, 8), "CHEWY.COM", between(42, 51));
      crd(dayOf(y, m, 7 + Math.floor(rand() * 18)), "GREAT CLIPS #123", 28);
      crd(dayOf(y, m, 2 + Math.floor(rand() * 25)), "TARGET 00012345", between(24, 96));
      if (rand() < 0.4) crd(dayOf(y, m, 10 + Math.floor(rand() * 15)), "THE HOME DEPOT #6620", between(18, 140));
      if (rand() < 0.35) crd(dayOf(y, m, 4 + Math.floor(rand() * 20)), "AMC 0123 ONLINE", between(24, 46));
      if (rand() < 0.3) crd(dayOf(y, m, 1 + Math.floor(rand() * 26)), "AMAZON MKTP US*REFUND", -between(12, 60));
      if (m === 1) crd(dayOf(y, m, 12), "1-800-FLOWERS.COM", 84.99);
      if (m === 1 && rand() < 0.9) crd(dayOf(y, m, 20), "ANNUAL MEMBERSHIP FEE", 95);
      if (m === 6) {
        crd(dayOf(y, m, 2), "DELTA AIR LINES 0062345678901", 642.4);
        crd(dayOf(y, m, 5), "AIRBNB * HMQ4XZ", 688.12);
        crd(dayOf(y, m, 6), "HERTZ RENT-A-CAR", 214.3);
        crd(dayOf(y, m, 9), "SQ *SEASIDE OYSTER BAR", 126.5);
      }
      if (m === 11) {
        crd(dayOf(y, m, 10), "NORDSTROM #0372", 212.6);
        crd(dayOf(y, m, 14), "ETSY.COM - HANDMADE GIFTS", 76.2);
        crd(dayOf(y, m, 18), "UNITED AIRLINES 0162345678", 384.9);
        crd(dayOf(y, m, 27), "MARRIOTT SF UNION SQ", 318.0);
      }
      if (m === 4 && rand() < 0.95) crd(dayOf(y, m, 17), "IKEA EAST PALO ALTO", 349.0);
      if (m % 4 === 2) crd(dayOf(y, m, 23), "BANFIELD PET HOSP #0911", between(86, 140));
      monthIndex++;
    }

    // Pay the card in full each month: last month's charges, from checking.
    card.sort(function (a, b) { return a.day - b.day; });
    var owed = {};
    card.forEach(function (t) {
      var p = parts(t.day);
      var k = p.y * 12 + p.m;
      owed[k] = (owed[k] || 0) + t.amount;
    });
    Object.keys(owed).forEach(function (k) {
      var key = +k + 1, py = Math.floor(key / 12), pm = key % 12;
      var payDay = dayOf(py, pm, 20);
      if (payDay > endDay) return;
      var amt = cents(owed[k]);
      crd(payDay, "AUTOPAY PAYMENT - THANK YOU", -amt);
      chk(payDay, "AMEX EPAYMENT ACH PMT W4381", -amt);
    });

    checking.sort(function (a, b) { return a.day - b.day || b.amount - a.amount; });
    card.sort(function (a, b) { return a.day - b.day; });
    return [
      { name: "sample-checking.csv", text: checkingCsv(checking) },
      { name: "sample-card.csv", text: cardCsv(card) }
    ];
  }

  function mdy(day) {
    var d = new Date(day * DAY_MS);
    var mm = d.getUTCMonth() + 1, dd = d.getUTCDate();
    return (mm < 10 ? "0" : "") + mm + "/" + (dd < 10 ? "0" : "") + dd + "/" + d.getUTCFullYear();
  }

  function quote(s) {
    return '"' + String(s).replace(/"/g, '""') + '"';
  }

  // Newest first with a running balance, as checking exports usually are.
  function checkingCsv(rows) {
    var balance = 4820.55, withBal = rows.map(function (r) {
      balance = Math.round((balance + r.amount) * 100) / 100;
      return { r: r, bal: balance };
    });
    var lines = ["Posting Date,Description,Amount,Balance"];
    for (var i = withBal.length - 1; i >= 0; i--) {
      var x = withBal[i];
      lines.push([mdy(x.r.day), quote(x.r.desc), x.r.amount.toFixed(2), x.bal.toFixed(2)].join(","));
    }
    return lines.join("\n") + "\n";
  }

  // Card exports count a purchase as a positive charge.
  function cardCsv(rows) {
    var lines = ["Date,Description,Amount"];
    rows.forEach(function (r) {
      lines.push([mdy(r.day), quote(r.desc), r.amount.toFixed(2)].join(","));
    });
    return lines.join("\n") + "\n";
  }

  kit.sample = { generate: generate };
})(window.SpendscapeKit = window.SpendscapeKit || {});
