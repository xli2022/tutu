/* ── Spendscape · charts ─────────────────────────────────────────────────
   Hand-rolled SVG charts, so the app stays dependency-free:

     Timeline   spending by category over time: stacked bars, flowing
                stacked area or trend lines, morphing between them
     Brush      the whole history in a strip, with a draggable window
     Cashflow   income up, spending down, net as a line
     Calendar   one square per day, shaded by spend
     Sankey     where the money went
     sparkline  a tiny trend line

   House style, after the data-viz checklist: thin marks, 2px lines, 4px
   rounded data ends square at the baseline, a 2px surface gap between
   stacked segments, hairline grid, text in text colours (never the series
   colour), a legend whenever there are two or more series, and a tooltip
   that lists every series at the hovered point with the value first.
   Labels from statements are untrusted, so text always goes in through
   textContent.                                                          */
(function (kit) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var motion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function calm() {
    return !!(motion && motion.matches);
  }

  /* ── DOM helpers ─────────────────────────────────────────────────── */
  function svgEl(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function div(cls, parent, text, tag) {
    var n = document.createElement(tag || "div");
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  function clear(n) {
    while (n.firstChild) n.removeChild(n.firstChild);
  }

  function r1(v) {
    return Math.round(v * 10) / 10;
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function sameKeys(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /* ── Numbers ─────────────────────────────────────────────────────── */
  function niceStep(span, count) {
    var raw = span / Math.max(1, count);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  function niceTicks(lo, hi, count) {
    if (!(hi > lo)) hi = lo + 1;
    var step = niceStep(hi - lo, count);
    var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
    var ticks = [];
    for (var v = a; v <= b + step / 2; v += step) ticks.push(Math.round(v / step) * step);
    return { lo: a, hi: b, ticks: ticks };
  }

  /* ── Motion ──────────────────────────────────────────────────────── */
  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function tween(ms, step, done) {
    var stopped = false, raf = 0, start = null;
    if (calm() || ms <= 0) {
      step(1);
      if (done) done();
      return { stop: function () {} };
    }
    function frame(now) {
      if (stopped) return;
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / ms);
      step(t);
      if (t < 1) raf = requestAnimationFrame(frame);
      else if (done) done();
    }
    raf = requestAnimationFrame(frame);
    return { stop: function () { stopped = true; cancelAnimationFrame(raf); } };
  }

  /* ── Curves ──────────────────────────────────────────────────────────
     Monotone cubic interpolation (as d3's curveMonotoneX): smooth, but it
     never overshoots, so a flowing area never dips below zero or invents a
     peak. Returns "x,y C ..." without the leading command.              */
  function slope3(h0, h1, s0, s1) {
    var p = (s0 * h1 + s1 * h0) / (h0 + h1);
    var sign = (s0 > 0 ? 1 : s0 < 0 ? -1 : 0) + (s1 > 0 ? 1 : s1 < 0 ? -1 : 0);
    return sign * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }

  function curve(xs, ys) {
    var n = xs.length;
    var out = r1(xs[0]) + "," + r1(ys[0]);
    if (n < 2) return out;
    var t = new Array(n), i;
    for (i = 1; i < n - 1; i++) {
      var h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i];
      t[i] = slope3(h0, h1, (ys[i] - ys[i - 1]) / h0, (ys[i + 1] - ys[i]) / h1);
    }
    var hs = xs[1] - xs[0], he = xs[n - 1] - xs[n - 2];
    var ss = (ys[1] - ys[0]) / hs, se = (ys[n - 1] - ys[n - 2]) / he;
    t[0] = n > 2 ? (3 * ss - t[1]) / 2 : ss;
    t[n - 1] = n > 2 ? (3 * se - t[n - 2]) / 2 : se;
    // Keep the end slopes inside the monotone band too.
    if (t[0] * ss < 0) t[0] = 0;
    if (t[n - 1] * se < 0) t[n - 1] = 0;
    for (i = 0; i < n - 1; i++) {
      var dx = (xs[i + 1] - xs[i]) / 3;
      out += "C" + r1(xs[i] + dx) + "," + r1(ys[i] + dx * t[i]) + " " +
        r1(xs[i + 1] - dx) + "," + r1(ys[i + 1] - dx * t[i + 1]) + " " +
        r1(xs[i + 1]) + "," + r1(ys[i + 1]);
    }
    return out;
  }

  // A rectangle with its top corners rounded: a bar's data end.
  function topRounded(x, y, w, h, r) {
    if (r <= 0.5) return "M" + r1(x) + "," + r1(y) + "h" + r1(w) + "v" + r1(h) + "h" + r1(-w) + "Z";
    return "M" + r1(x) + "," + r1(y + h) + "V" + r1(y + r) +
      "Q" + r1(x) + "," + r1(y) + " " + r1(x + r) + "," + r1(y) +
      "H" + r1(x + w - r) + "Q" + r1(x + w) + "," + r1(y) + " " + r1(x + w) + "," + r1(y + r) +
      "V" + r1(y + h) + "Z";
  }

  // The same for a bar hanging below the baseline.
  function bottomRounded(x, y, w, h, r) {
    if (r <= 0.5) return "M" + r1(x) + "," + r1(y) + "h" + r1(w) + "v" + r1(h) + "h" + r1(-w) + "Z";
    return "M" + r1(x) + "," + r1(y) + "V" + r1(y + h - r) +
      "Q" + r1(x) + "," + r1(y + h) + " " + r1(x + r) + "," + r1(y + h) +
      "H" + r1(x + w - r) + "Q" + r1(x + w) + "," + r1(y + h) + " " + r1(x + w) + "," + r1(y + h - r) +
      "V" + r1(y) + "Z";
  }

  /* ── Tooltip ─────────────────────────────────────────────────────────
     One floating card for every chart. Built from nodes, never markup.  */
  var tipEl = null;

  function tipNode() {
    if (!tipEl) {
      tipEl = div("viz-tip", document.body);
      tipEl.setAttribute("role", "status");
      tipEl.setAttribute("aria-live", "polite");
    }
    return tipEl;
  }

  function Tip(title, note) {
    this.root = document.createElement("div");
    var head = div("tip-title", this.root, title);
    if (note) div("tip-note", head, note, "span");
    this.body = div("tip-rows", this.root);
  }

  // Value first, label second, keyed by a short line of the series colour.
  Tip.prototype.row = function (color, value, label, opts) {
    opts = opts || {};
    var row = div("tip-row" + (opts.hot ? " is-hot" : "") + (opts.muted ? " is-muted" : ""), this.body);
    var key = div("tip-key" + (opts.dot ? " is-dot" : ""), row, null, "i");
    if (color) key.style.background = color;
    else key.className += " is-blank";
    div("tip-value", row, value, "b");
    div("tip-label", row, label, "span");
    return row;
  };

  Tip.prototype.total = function (value, label) {
    var row = div("tip-total", this.root);
    div("tip-value", row, value, "b");
    div("tip-label", row, label, "span");
  };

  Tip.prototype.line = function (text, cls) {
    div(cls || "tip-text", this.root, text);
  };

  Tip.prototype.hint = function (text) {
    div("tip-hint", this.root, text);
  };

  function showTip(tip, x, y) {
    var t = tipNode();
    clear(t);
    t.appendChild(tip.root);
    t.classList.add("on");
    var w = t.offsetWidth, h = t.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var left = x + 18;
    if (left + w > vw - 8) left = x - 18 - w;
    if (left < 8) left = Math.max(8, Math.min(vw - w - 8, x - w / 2));
    var top = clamp(y - h / 2, 8, Math.max(8, vh - h - 8));
    if (left < x && left + w > x && top < y && top + h > y) top = y + 22 + h > vh ? y - h - 22 : y + 22;
    t.style.transform = "translate(" + Math.round(left) + "px," + Math.round(top) + "px)";
  }

  function hideTip() {
    if (tipEl) tipEl.classList.remove("on");
  }

  // Hide the tooltip when the page scrolls under it.
  window.addEventListener("scroll", hideTip, { passive: true });

  function pointerIn(svg, e) {
    var r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, rect: r };
  }

  /* Period labels along the x axis, every `every`th one counted back from
     the newest. The year goes under the first label shown and under any
     label where the year changes, so a long axis still says when it is. */
  function axisLabels(g, d, every, cx, y) {
    var n = d.labels.length, lastYear = null;
    for (var i = 0; i < n; i++) {
      if ((n - 1 - i) % every) continue;
      var l = d.labels[i];
      var t = svgEl("text", { x: r1(cx(i)), y: y, "text-anchor": "middle", class: d.partial && d.partial[i] ? "is-partial" : null }, g);
      t.textContent = l.main;
      if (l.year && l.year !== lastYear) {
        var s = svgEl("text", { x: r1(cx(i)), y: y + 14, "text-anchor": "middle", class: "viz-sub" }, g);
        s.textContent = l.year;
      }
      lastYear = l.year;
    }
  }

  function observe(node, fn) {
    if (!window.ResizeObserver) {
      window.addEventListener("resize", fn);
      return;
    }
    var last = 0;
    new ResizeObserver(function (entries) {
      var w = Math.round(entries[0].contentRect.width);
      if (w && w !== last) {
        last = w;
        fn();
      }
    }).observe(node);
  }

  /* ════════════════════════════════════════════════════════════════════
     Timeline: spending by category over time
     ════════════════════════════════════════════════════════════════════

     update({
       keys:    period keys, oldest first,
       labels:  [{ main, sub }] axis labels per period,
       titles:  long label per period (tooltip title),
       partial: [bool] periods the data only partly covers,
       series:  [{ id, name, icon, color, values }] bottom of stack first,
       hidden:  { id: true },
       mode:    "bars" | "area" | "lines",
       selected: index or -1
     })

     opts: money(v), short(v), onSelect(i), onToggle(id), onSolo(id),
     onHover(id), height(width), hint                                    */
  function Timeline(host, opts) {
    var self = this;
    this.opts = opts || {};
    this.host = host;
    host.classList.add("viz-timeline");
    this.legendEl = div("viz-legend", host);
    this.plot = div("viz-plot", host);
    this.plot.tabIndex = 0;
    this.plot.setAttribute("role", "group");
    this.plot.setAttribute("aria-label", this.opts.label || "Chart. Use the left and right arrow keys to read each period, Enter to open it.");
    this.svg = svgEl("svg", { class: "viz-svg", "aria-hidden": "true" }, this.plot);
    this.gGrid = svgEl("g", { class: "viz-grid" }, this.svg);
    this.gBand = svgEl("g", { class: "viz-band" }, this.svg);
    this.gArea = svgEl("g", { class: "viz-areas" }, this.svg);
    this.gFills = svgEl("g", null, this.gArea);
    this.gEdges = svgEl("g", null, this.gArea);
    this.gBars = svgEl("g", { class: "viz-bars" }, this.svg);
    this.gDim = svgEl("g", { class: "viz-dim" }, this.svg);
    this.gCaps = svgEl("g", { class: "viz-caps" }, this.svg);
    this.gX = svgEl("g", { class: "viz-x" }, this.svg);
    this.cross = svgEl("line", { class: "viz-cross" }, this.svg);
    this.gDots = svgEl("g", { class: "viz-dots" }, this.svg);
    this.empty = svgEl("text", { class: "viz-empty", "text-anchor": "middle" }, this.svg);
    this.paths = {};
    this.geo = null;
    this.data = null;
    this.hoverIndex = -1;
    this.hot = null;
    this.anim = null;

    this.plot.addEventListener("pointermove", function (e) { self.onPointer(e); });
    this.plot.addEventListener("pointerleave", function () { self.clearHover(); });
    this.plot.addEventListener("click", function (e) {
      var i = self.indexAt(e);
      if (i >= 0 && self.opts.onSelect) self.opts.onSelect(i);
    });
    this.plot.addEventListener("keydown", function (e) { self.onKey(e); });
    this.plot.addEventListener("blur", function () { self.clearHover(); });
    observe(this.plot, function () {
      if (!self.data) return;
      self.measure();
      self.drawStatic();
      self.drawDim();
      self.draw(self.geo || self.target());
    });
  }

  Timeline.prototype.update = function (d) {
    var prevKeys = this.data && this.data.keys;
    var prevMode = this.data && this.data.mode;
    this.data = d;
    this.measure();
    this.renderLegend();
    this.syncPaths();
    this.svg.setAttribute("data-mode", d.mode);
    this.legendEl.setAttribute("data-mode", d.mode);
    this.drawStatic();
    var to = this.target();
    var same = this.geo && sameKeys(prevKeys, d.keys);
    var from = same ? this.geo : this.zero(to);
    this.animate(from, to, same ? 0 : 0.6, same ? (prevMode !== d.mode ? 640 : 480) : 820);
    this.drawDim();
    if (this.hoverIndex >= d.keys.length) this.clearHover();
  };

  Timeline.prototype.measure = function () {
    var w = Math.max(280, this.plot.clientWidth || 600);
    var ph = this.opts.height ? this.opts.height(w) : (w < 560 ? 210 : 290);
    var n = Math.max(1, this.data.keys.length);
    var left = w < 420 ? 44 : 54, right = 10, top = 24, bottom = 40;
    var pw = Math.max(40, w - left - right);
    var band = pw / n;
    this.L = {
      w: w, h: top + ph + bottom, left: left, top: top, pw: pw, ph: ph, band: band,
      barW: Math.max(2, Math.min(24, band * 0.62)), n: n
    };
    this.svg.setAttribute("viewBox", "0 0 " + w + " " + this.L.h);
    this.svg.setAttribute("width", w);
    this.svg.setAttribute("height", this.L.h);
  };

  Timeline.prototype.cx = function (i) {
    return this.L.left + this.L.band * (i + 0.5);
  };

  // Stack the visible series (or lay them side by side as lines).
  Timeline.prototype.target = function () {
    var d = this.data, n = d.keys.length, lines = d.mode === "lines";
    var base = [], i, max = 0;
    for (i = 0; i < n; i++) base.push(0);
    var g = { s: {} };
    d.series.forEach(function (s) {
      var on = !d.hidden[s.id];
      var v = s.values.map(function (x) { return on ? Math.max(0, x) : 0; });
      var y0, y1;
      if (lines) {
        y0 = v.slice();
        y1 = v.slice();
        v.forEach(function (x) { if (x > max) max = x; });
      } else {
        y0 = base.slice();
        y1 = base.map(function (b, j) { return b + v[j]; });
        base = y1;
      }
      g.s[s.id] = { y0: y0, y1: y1, v: v };
    });
    if (!lines) base.forEach(function (x) { if (x > max) max = x; });
    g.max = max;
    g.ticks = niceTicks(0, max || 1, this.L.ph < 240 ? 4 : 5);
    g.yMax = g.ticks.hi;
    return g;
  };

  Timeline.prototype.zero = function (to) {
    var g = { s: {}, max: to.max, ticks: to.ticks, yMax: to.yMax };
    for (var id in to.s) {
      var z = to.s[id].y0.map(function () { return 0; });
      g.s[id] = { y0: z, y1: z.slice(), v: to.s[id].v };
    }
    return g;
  };

  Timeline.prototype.animate = function (from, to, stagger, ms) {
    var self = this, n = this.data.keys.length;
    if (this.anim) this.anim.stop();
    var start = {};
    Object.keys(to.s).forEach(function (id) {
      var b = to.s[id];
      start[id] = from.s[id] && from.s[id].y0.length === n ? from.s[id] : { y0: b.y0.slice(), y1: b.y0.slice() };
    });
    var y0max = from.yMax || to.yMax;
    this.anim = tween(ms, function (t) {
      var e = easeInOut(t);
      var g = { s: {}, ticks: to.ticks, yMax: y0max + (to.yMax - y0max) * e, max: to.max };
      Object.keys(to.s).forEach(function (id) {
        var a = start[id], b = to.s[id], y0 = new Array(n), y1 = new Array(n);
        for (var i = 0; i < n; i++) {
          var ti = stagger ? easeOut(clamp(t * (1 + stagger) - stagger * (n > 1 ? i / (n - 1) : 0), 0, 1)) : e;
          y0[i] = a.y0[i] + (b.y0[i] - a.y0[i]) * ti;
          y1[i] = a.y1[i] + (b.y1[i] - a.y1[i]) * ti;
        }
        g.s[id] = { y0: y0, y1: y1, v: b.v };
      });
      self.geo = g;
      self.draw(g);
    }, function () {
      self.geo = to;
      self.draw(to);
      self.anim = null;
    });
  };

  // One fill, one edge and one bar path per series, reused across updates
  // so changes can tween.
  Timeline.prototype.syncPaths = function () {
    var self = this, want = {};
    this.data.series.forEach(function (s) {
      want[s.id] = true;
      var p = self.paths[s.id];
      if (!p) {
        p = self.paths[s.id] = {
          fill: svgEl("path", { class: "viz-fill" }),
          edge: svgEl("path", { class: "viz-edge" }),
          bar: svgEl("path", { class: "viz-bar" })
        };
      }
      p.fill.setAttribute("fill", s.color);
      p.edge.setAttribute("stroke", s.color);
      p.bar.setAttribute("fill", s.color);
      [p.fill, p.edge, p.bar].forEach(function (node) { node.setAttribute("data-id", s.id); });
      // Re-appending in stack order keeps paint order right; every edge
      // sits above every fill.
      self.gFills.appendChild(p.fill);
      self.gEdges.appendChild(p.edge);
      self.gBars.appendChild(p.bar);
    });
    Object.keys(this.paths).forEach(function (id) {
      if (want[id]) return;
      var p = self.paths[id];
      [p.fill, p.edge, p.bar].forEach(function (node) { node.parentNode.removeChild(node); });
      delete self.paths[id];
      if (self.geo) delete self.geo.s[id];
    });
  };

  Timeline.prototype.drawStatic = function () {
    var L = this.L, d = this.data, self = this;
    clear(this.gX);
    var n = d.keys.length;
    // Thin out the labels so they never collide.
    var widest = 0;
    d.labels.forEach(function (l) { widest = Math.max(widest, l.main.length); });
    var need = widest * 6.6 + 14;
    var every = Math.max(1, Math.ceil(need / L.band));
    axisLabels(this.gX, d, every, function (i) { return self.cx(i); }, L.top + L.ph + 18);
    svgEl("line", { x1: L.left, x2: L.left + L.pw, y1: L.top + L.ph + 0.5, y2: L.top + L.ph + 0.5, class: "viz-base" }, this.gX);
    var any = d.series.some(function (s) { return !d.hidden[s.id] && s.values.some(function (v) { return v > 0; }); });
    this.empty.setAttribute("x", L.left + L.pw / 2);
    this.empty.setAttribute("y", L.top + L.ph / 2);
    this.empty.textContent = any ? "" : (self.opts.emptyText || "No spending in this range");
  };

  Timeline.prototype.drawGrid = function (g) {
    var L = this.L, money = this.opts.short || String;
    clear(this.gGrid);
    // Nothing to measure: no scale to show either.
    if (!(g.max > 0)) return;
    var self = this;
    g.ticks.ticks.forEach(function (v) {
      if (v > g.yMax * 1.001) return;
      var y = r1(self.y(v, g)) + 0.5;
      if (v > 0) svgEl("line", { x1: L.left, x2: L.left + L.pw, y1: y, y2: y }, self.gGrid);
      var t = svgEl("text", { x: L.left - 8, y: y + 4, "text-anchor": "end" }, self.gGrid);
      t.textContent = money(v);
    });
  };

  Timeline.prototype.y = function (v, g) {
    return this.L.top + this.L.ph - (v / (g.yMax || 1)) * this.L.ph;
  };

  // Per period, the id of the highest visible segment: it owns the
  // rounded data end and the gap rule.
  Timeline.prototype.topmost = function (g) {
    var d = this.data, n = d.keys.length, out = new Array(n), self = this;
    d.series.forEach(function (s) {
      var gs = g.s[s.id];
      if (!gs) return;
      for (var i = 0; i < n; i++) {
        if (self.y(gs.y0[i], g) - self.y(gs.y1[i], g) > 0.5) out[i] = s.id;
      }
    });
    return out;
  };

  Timeline.prototype.draw = function (g) {
    var L = this.L, d = this.data, self = this, n = d.keys.length;
    if (!n) return;
    this.drawGrid(g);
    var xs = [];
    for (var i = 0; i < n; i++) xs.push(this.cx(i));
    // A single period still deserves a shape, not a dot.
    var single = n === 1;
    if (single) xs = [xs[0] - L.band * 0.3, xs[0] + L.band * 0.3];
    var tops = this.topmost(g);
    d.series.forEach(function (s) {
      var p = self.paths[s.id], gs = g.s[s.id];
      if (!p || !gs) return;
      var y1 = gs.y1.map(function (v) { return self.y(v, g); });
      var y0 = gs.y0.map(function (v) { return self.y(v, g); });
      if (single) { y1 = [y1[0], y1[0]]; y0 = [y0[0], y0[0]]; }
      var top = curve(xs, y1);
      var bottom = curve(xs.slice().reverse(), y0.slice().reverse());
      p.edge.setAttribute("d", "M" + top);
      p.fill.setAttribute("d", "M" + top + "L" + bottom + "Z");
      var bars = "";
      for (var j = 0; j < n; j++) {
        var yt = self.y(gs.y1[j], g), yb = self.y(gs.y0[j], g), h = yb - yt;
        if (h < 0.5) continue;
        var isTop = tops[j] === s.id;
        // The 2px surface gap: every segment but the top one gives up its
        // top two pixels to the one above it.
        if (!isTop) { yt += 2; h -= 2; if (h < 0.5) continue; }
        bars += topRounded(self.cx(j) - L.barW / 2, yt, L.barW, h, isTop ? Math.min(4, h, L.barW / 2) : 0);
      }
      p.bar.setAttribute("d", bars);
    });
    this.drawCaps(g, tops);
    if (this.hoverIndex >= 0) this.drawHover();
  };

  // Column totals on the caps, when there is room for them.
  Timeline.prototype.drawCaps = function (g) {
    var L = this.L, d = this.data, self = this, n = d.keys.length;
    clear(this.gCaps);
    if (d.mode !== "bars" || L.band < 34 || n > 24) return;
    var short = this.opts.short || String;
    for (var i = 0; i < n; i++) {
      var top = 0;
      d.series.forEach(function (s) { var gs = g.s[s.id]; if (gs && gs.y1[i] > top) top = gs.y1[i]; });
      if (top <= 0) continue;
      var t = svgEl("text", { x: r1(self.cx(i)), y: r1(self.y(top, g) - 7), "text-anchor": "middle" }, this.gCaps);
      t.textContent = short(top);
    }
  };

  // Dim periods that are partly outside the data, and every period but
  // the selected one when a period is open.
  Timeline.prototype.drawDim = function () {
    var L = this.L, d = this.data, n = d.keys.length;
    clear(this.gDim);
    clear(this.gBand);
    for (var i = 0; i < n; i++) {
      var o = 0;
      if (d.partial && d.partial[i]) o = 0.38;
      if (d.selected >= 0 && d.selected !== i) o = Math.max(o, 0.55);
      var x = L.left + L.band * i;
      if (o) svgEl("rect", { x: r1(x), y: L.top - 20, width: r1(L.band + 0.6), height: L.ph + 20, opacity: o }, this.gDim);
      if (d.selected === i) svgEl("rect", { x: r1(x + 2), y: L.top - 20, width: r1(L.band - 4), height: L.ph + 20, rx: 8, class: "is-selected" }, this.gBand);
    }
    this.hoverBand = svgEl("rect", { class: "is-hover", rx: 8, y: L.top - 20, height: L.ph + 20, width: 0 }, this.gBand);
  };

  Timeline.prototype.renderLegend = function () {
    var d = this.data, self = this;
    clear(this.legendEl);
    if (d.series.length < 2) {
      this.legendEl.hidden = true;
      return;
    }
    this.legendEl.hidden = false;
    d.series.forEach(function (s) {
      var b = div("viz-chip" + (d.hidden[s.id] ? " is-off" : ""), self.legendEl, null, "button");
      b.type = "button";
      b.setAttribute("aria-pressed", d.hidden[s.id] ? "false" : "true");
      b.title = d.hidden[s.id] ? "Show " + s.name : "Hide " + s.name + " (double-click to show only it)";
      var sw = div("viz-swatch", b, null, "span");
      sw.style.background = s.color;
      if (s.icon) div("viz-chip-icon", b, s.icon, "span");
      div("viz-chip-name", b, s.name, "span");
      var timer = null;
      b.addEventListener("click", function (e) {
        if (e.shiftKey || e.altKey) {
          if (self.opts.onSolo) self.opts.onSolo(s.id);
          return;
        }
        clearTimeout(timer);
        timer = setTimeout(function () { if (self.opts.onToggle) self.opts.onToggle(s.id); }, 230);
      });
      b.addEventListener("dblclick", function () {
        clearTimeout(timer);
        if (self.opts.onSolo) self.opts.onSolo(s.id);
      });
      b.addEventListener("pointerenter", function () { self.setHot(s.id); });
      b.addEventListener("pointerleave", function () { self.setHot(null); });
      b.addEventListener("focus", function () { self.setHot(s.id); });
      b.addEventListener("blur", function () { self.setHot(null); });
    });
  };

  Timeline.prototype.setHot = function (id) {
    if (this.hot === id) return;
    this.hot = id;
    this.svg.classList.toggle("has-hot", !!id);
    for (var k in this.paths) {
      var on = k === id;
      this.paths[k].fill.classList.toggle("is-hot", on);
      this.paths[k].edge.classList.toggle("is-hot", on);
      this.paths[k].bar.classList.toggle("is-hot", on);
    }
    if (this.opts.onHover) this.opts.onHover(id);
  };

  Timeline.prototype.highlight = function (id) {
    this.setHot(id);
  };

  Timeline.prototype.indexAt = function (e) {
    if (!this.data || !this.data.keys.length) return -1;
    var p = pointerIn(this.svg, e), L = this.L;
    if (p.x < L.left - 6 || p.x > L.left + L.pw + 6 || p.y > L.top + L.ph + 34) return -1;
    return clamp(Math.floor((p.x - L.left) / L.band), 0, this.data.keys.length - 1);
  };

  // Which series sits under the pointer at period i.
  Timeline.prototype.seriesAt = function (i, py) {
    var d = this.data, g = this.geo, self = this, best = null, dist = 16;
    if (!g) return null;
    d.series.forEach(function (s) {
      if (d.hidden[s.id]) return;
      var gs = g.s[s.id];
      if (!gs) return;
      if (d.mode === "lines") {
        var dd = Math.abs(self.y(gs.v[i], g) - py);
        if (dd < dist) { dist = dd; best = s.id; }
      } else if (py >= self.y(gs.y1[i], g) && py <= self.y(gs.y0[i], g) && gs.y1[i] > gs.y0[i]) {
        best = s.id;
      }
    });
    return best;
  };

  Timeline.prototype.onPointer = function (e) {
    var i = this.indexAt(e);
    if (i < 0) { this.clearHover(); return; }
    var p = pointerIn(this.svg, e);
    this.hoverIndex = i;
    this.setHot(this.seriesAt(i, p.y));
    this.drawHover();
    this.showTooltip(e.clientX, e.clientY);
  };

  Timeline.prototype.onKey = function (e) {
    var n = this.data ? this.data.keys.length : 0;
    if (!n) return;
    var i = this.hoverIndex < 0 ? (this.data.selected >= 0 ? this.data.selected : n - 1) : this.hoverIndex;
    if (e.key === "ArrowLeft") i = Math.max(0, i - 1);
    else if (e.key === "ArrowRight") i = Math.min(n - 1, i + 1);
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = n - 1;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (this.opts.onSelect) this.opts.onSelect(i);
      return;
    } else if (e.key === "Escape") {
      this.clearHover();
      if (this.data.selected >= 0 && this.opts.onSelect) this.opts.onSelect(this.data.selected);
      return;
    } else return;
    e.preventDefault();
    this.hoverIndex = i;
    this.drawHover();
    var r = this.svg.getBoundingClientRect();
    this.showTooltip(r.left + this.cx(i), r.top + this.L.top + this.L.ph / 3);
  };

  Timeline.prototype.drawHover = function () {
    var L = this.L, i = this.hoverIndex, d = this.data, g = this.geo, self = this;
    clear(this.gDots);
    if (i < 0 || !g) return;
    var x = this.cx(i);
    if (this.hoverBand) {
      this.hoverBand.setAttribute("x", r1(L.left + L.band * i + 2));
      this.hoverBand.setAttribute("width", r1(Math.max(0, L.band - 4)));
    }
    var showCross = d.mode !== "bars";
    this.cross.setAttribute("x1", r1(x) + 0.5);
    this.cross.setAttribute("x2", r1(x) + 0.5);
    this.cross.setAttribute("y1", L.top - 8);
    this.cross.setAttribute("y2", L.top + L.ph);
    this.cross.style.opacity = showCross ? 1 : 0;
    if (!showCross) return;
    d.series.forEach(function (s) {
      var gs = g.s[s.id];
      if (!gs || d.hidden[s.id]) return;
      var v = d.mode === "lines" ? gs.v[i] : gs.y1[i];
      if (d.mode !== "lines" && gs.y1[i] - gs.y0[i] <= 0) return;
      svgEl("circle", { cx: r1(x), cy: r1(self.y(v, g)), r: 4.5, fill: s.color, class: s.id === self.hot ? "is-hot" : null }, self.gDots);
    });
  };

  Timeline.prototype.clearHover = function () {
    this.hoverIndex = -1;
    if (this.hoverBand) this.hoverBand.setAttribute("width", 0);
    this.cross.style.opacity = 0;
    clear(this.gDots);
    this.setHot(null);
    hideTip();
  };

  Timeline.prototype.showTooltip = function (cx, cy) {
    var d = this.data, i = this.hoverIndex, money = this.opts.money || String, self = this;
    if (i < 0) return;
    var tip = new Tip(d.titles[i], d.partial && d.partial[i] ? "partial" : null);
    var rows = d.series.filter(function (s) { return !d.hidden[s.id]; })
      .map(function (s) { return { s: s, v: Math.max(0, s.values[i]) }; })
      .sort(function (a, b) { return b.v - a.v; });
    var total = 0;
    rows.forEach(function (r) {
      total += r.v;
      tip.row(r.s.color, money(r.v), (r.s.icon ? r.s.icon + " " : "") + r.s.name, { hot: r.s.id === self.hot, muted: !r.v });
    });
    if (rows.length > 1 && d.mode !== "lines") tip.total(money(total), "Total");
    if (d.partial && d.partial[i]) tip.line("Your statements only cover part of this period.", "tip-text is-note");
    if (this.opts.hint) tip.hint(d.selected === i ? "Click to close this period" : this.opts.hint);
    showTip(tip, cx, cy);
  };

  /* ════════════════════════════════════════════════════════════════════
     Brush: the whole history with a draggable window
     ════════════════════════════════════════════════════════════════════

     update({ from, to, values: weekly totals, starts: week start days,
              range: { from, to }, ticks: [{ day, label }] })
     opts: onChange(range), describe(range) -> label                      */
  function Brush(host, opts) {
    var self = this;
    this.opts = opts || {};
    this.host = host;
    host.classList.add("viz-brush");
    this.svg = svgEl("svg", { class: "viz-svg" }, host);
    this.gArea = svgEl("g", { class: "brush-area" }, this.svg);
    this.gTicks = svgEl("g", { class: "brush-ticks" }, this.svg);
    this.shadeL = svgEl("rect", { class: "brush-shade" }, this.svg);
    this.shadeR = svgEl("rect", { class: "brush-shade" }, this.svg);
    this.win = svgEl("rect", { class: "brush-window", rx: 8 }, this.svg);
    this.handleL = svgEl("rect", { class: "brush-handle", rx: 3, tabindex: 0, role: "slider", "aria-label": "Range start" }, this.svg);
    this.handleR = svgEl("rect", { class: "brush-handle", rx: 3, tabindex: 0, role: "slider", "aria-label": "Range end" }, this.svg);
    this.label = div("brush-label", host);
    this.drag = null;

    this.svg.addEventListener("pointerdown", function (e) { self.down(e); });
    this.svg.addEventListener("pointermove", function (e) { self.move(e); });
    this.svg.addEventListener("pointerup", function (e) { self.up(e); });
    this.svg.addEventListener("pointercancel", function (e) { self.up(e); });
    [this.handleL, this.handleR].forEach(function (h, k) {
      h.addEventListener("keydown", function (e) { self.key(e, k); });
    });
    observe(host, function () { if (self.data) self.draw(); });
  }

  Brush.prototype.update = function (d) {
    this.data = d;
    this.sel = { from: d.range.from, to: d.range.to };
    this.draw();
  };

  Brush.prototype.x = function (day) {
    var d = this.data, L = this.L;
    return L.left + ((day - d.from) / Math.max(1, d.to + 1 - d.from)) * L.pw;
  };

  Brush.prototype.day = function (x) {
    var d = this.data, L = this.L;
    return Math.round(d.from + ((x - L.left) / L.pw) * (d.to + 1 - d.from));
  };

  Brush.prototype.draw = function () {
    var d = this.data, self = this;
    var w = Math.max(240, this.host.clientWidth || 600), h = 74;
    this.L = { w: w, h: h, left: 8, pw: w - 16, top: 8, ph: 44 };
    var L = this.L;
    this.svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    this.svg.setAttribute("width", w);
    this.svg.setAttribute("height", h);
    clear(this.gArea);
    clear(this.gTicks);
    var max = 0;
    d.values.forEach(function (v) { if (v > max) max = v; });
    max = max || 1;
    if (d.values.length > 1) {
      var xs = d.starts.map(function (s) { return self.x(s + 3.5); });
      var ys = d.values.map(function (v) { return L.top + L.ph - Math.max(0, v) / max * L.ph; });
      var top = curve(xs, ys);
      svgEl("path", { d: "M" + r1(xs[0]) + "," + (L.top + L.ph) + "L" + top + "L" + r1(xs[xs.length - 1]) + "," + (L.top + L.ph) + "Z", class: "brush-fill" }, this.gArea);
      svgEl("path", { d: "M" + top, class: "brush-line" }, this.gArea);
    }
    svgEl("line", { x1: L.left, x2: L.left + L.pw, y1: L.top + L.ph + 0.5, y2: L.top + L.ph + 0.5, class: "brush-base" }, this.gTicks);
    var lastX = -100;
    (d.ticks || []).forEach(function (t) {
      var x = self.x(t.day);
      if (x - lastX < 46 || x > L.left + L.pw - 14) return;
      lastX = x;
      svgEl("line", { x1: r1(x) + 0.5, x2: r1(x) + 0.5, y1: L.top + L.ph, y2: L.top + L.ph + 4 }, self.gTicks);
      var tx = svgEl("text", { x: r1(x) + 3, y: L.top + L.ph + 15 }, self.gTicks);
      tx.textContent = t.label;
    });
    this.place();
  };

  Brush.prototype.place = function () {
    var L = this.L, a = this.x(this.sel.from), b = this.x(this.sel.to + 1);
    b = Math.max(b, a + 4);
    this.shadeL.setAttribute("x", L.left);
    this.shadeL.setAttribute("width", Math.max(0, a - L.left));
    this.shadeR.setAttribute("x", b);
    this.shadeR.setAttribute("width", Math.max(0, L.left + L.pw - b));
    [this.shadeL, this.shadeR].forEach(function (s) { s.setAttribute("y", L.top - 4); s.setAttribute("height", L.ph + 4); });
    this.win.setAttribute("x", r1(a));
    this.win.setAttribute("width", r1(b - a));
    this.win.setAttribute("y", L.top - 4);
    this.win.setAttribute("height", L.ph + 4);
    var hy = L.top + L.ph / 2 - 11;
    this.handleL.setAttribute("x", r1(a - 4));
    this.handleR.setAttribute("x", r1(b - 4));
    [this.handleL, this.handleR].forEach(function (hd) { hd.setAttribute("y", hy); hd.setAttribute("width", 8); hd.setAttribute("height", 22); });
    this.handleL.setAttribute("aria-valuetext", this.opts.describe ? this.opts.describe({ from: this.sel.from, to: this.sel.from }) : "");
    this.handleR.setAttribute("aria-valuetext", this.opts.describe ? this.opts.describe({ from: this.sel.to, to: this.sel.to }) : "");
    this.label.textContent = this.opts.describe ? this.opts.describe(this.sel) : "";
    var mid = (a + b) / 2;
    this.label.style.left = clamp(mid, 60, L.w - 60) + "px";
  };

  Brush.prototype.down = function (e) {
    var p = pointerIn(this.svg, e), L = this.L;
    var a = this.x(this.sel.from), b = this.x(this.sel.to + 1);
    var mode;
    if (Math.abs(p.x - a) <= 10) mode = "from";
    else if (Math.abs(p.x - b) <= 10) mode = "to";
    else if (p.x > a && p.x < b) mode = "move";
    else mode = "new";
    var day = clamp(this.day(p.x), this.data.from, this.data.to);
    if (mode === "new") this.sel = { from: day, to: day };
    this.drag = { mode: mode, startDay: day, sel: { from: this.sel.from, to: this.sel.to }, x: p.x, moved: false };
    this.svg.setPointerCapture(e.pointerId);
    this.host.classList.add("is-dragging");
    e.preventDefault();
    if (p.x < L.left - 4) this.drag = null;
  };

  Brush.prototype.move = function (e) {
    var p = pointerIn(this.svg, e);
    if (!this.drag) {
      var a = this.x(this.sel.from), b = this.x(this.sel.to + 1);
      this.svg.style.cursor = Math.abs(p.x - a) <= 10 || Math.abs(p.x - b) <= 10 ? "ew-resize" : p.x > a && p.x < b ? "grab" : "crosshair";
      return;
    }
    var d = this.data, dr = this.drag;
    var day = clamp(this.day(p.x), d.from, d.to);
    if (Math.abs(p.x - dr.x) > 2) dr.moved = true;
    var len = dr.sel.to - dr.sel.from;
    if (dr.mode === "move") {
      var shift = day - dr.startDay;
      var from = clamp(dr.sel.from + shift, d.from, d.to - len);
      this.sel = { from: from, to: from + len };
    } else if (dr.mode === "from") {
      this.sel = { from: Math.min(day, dr.sel.to - 6), to: dr.sel.to };
    } else if (dr.mode === "to") {
      this.sel = { from: dr.sel.from, to: Math.max(day, dr.sel.from + 6) };
    } else {
      this.sel = { from: Math.min(day, dr.startDay), to: Math.max(day, dr.startDay) };
    }
    this.place();
  };

  Brush.prototype.up = function () {
    if (!this.drag) return;
    var dr = this.drag;
    this.drag = null;
    this.host.classList.remove("is-dragging");
    if (dr.mode === "new" && !dr.moved) {
      // A click on the strip: centre the current window there.
      var len = dr.sel.to - dr.sel.from, d = this.data;
      var from = clamp(dr.startDay - Math.floor(len / 2), d.from, d.to - len);
      this.sel = { from: from, to: from + len };
    }
    if (this.sel.to - this.sel.from < 6) this.sel.to = Math.min(this.data.to, this.sel.from + 6);
    this.place();
    if (this.opts.onChange) this.opts.onChange({ from: this.sel.from, to: this.sel.to });
  };

  Brush.prototype.key = function (e, which) {
    var step = e.shiftKey ? 30 : 7, d = this.data;
    var delta = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : e.key === "ArrowRight" || e.key === "ArrowUp" ? step : 0;
    if (!delta) return;
    e.preventDefault();
    if (which === 0) this.sel.from = clamp(this.sel.from + delta, d.from, this.sel.to - 6);
    else this.sel.to = clamp(this.sel.to + delta, this.sel.from + 6, d.to);
    this.place();
    if (this.opts.onChange) this.opts.onChange({ from: this.sel.from, to: this.sel.to });
  };

  /* ════════════════════════════════════════════════════════════════════
     Cashflow: income above the line, spending below, net as a line
     ════════════════════════════════════════════════════════════════════

     update({ keys, labels, titles, partial, income, spent, net, selected })
     opts: money, short, onSelect(i), colors: { income, spent, net }      */
  function Cashflow(host, opts) {
    var self = this;
    this.opts = opts || {};
    this.host = host;
    host.classList.add("viz-cashflow");
    this.plot = div("viz-plot", host);
    this.plot.tabIndex = 0;
    this.plot.setAttribute("role", "group");
    this.plot.setAttribute("aria-label", "Income and spending chart. Use the left and right arrow keys to read each period.");
    this.svg = svgEl("svg", { class: "viz-svg", "aria-hidden": "true" }, this.plot);
    this.gGrid = svgEl("g", { class: "viz-grid" }, this.svg);
    this.gBand = svgEl("g", { class: "viz-band" }, this.svg);
    this.gBars = svgEl("g", { class: "viz-bars" }, this.svg);
    this.gDim = svgEl("g", { class: "viz-dim" }, this.svg);
    this.gLine = svgEl("g", { class: "viz-net" }, this.svg);
    this.gX = svgEl("g", { class: "viz-x" }, this.svg);
    this.hoverIndex = -1;
    this.plot.addEventListener("pointermove", function (e) {
      var i = self.indexAt(e);
      if (i < 0) { self.clearHover(); return; }
      self.hoverIndex = i;
      self.drawHover();
      self.showTooltip(e.clientX, e.clientY);
    });
    this.plot.addEventListener("pointerleave", function () { self.clearHover(); });
    this.plot.addEventListener("click", function (e) {
      var i = self.indexAt(e);
      if (i >= 0 && self.opts.onSelect) self.opts.onSelect(i);
    });
    this.plot.addEventListener("keydown", function (e) {
      var n = self.data ? self.data.keys.length : 0;
      if (!n) return;
      var i = self.hoverIndex < 0 ? n - 1 : self.hoverIndex;
      if (e.key === "ArrowLeft") i = Math.max(0, i - 1);
      else if (e.key === "ArrowRight") i = Math.min(n - 1, i + 1);
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (self.opts.onSelect) self.opts.onSelect(i); return; }
      else if (e.key === "Escape") { self.clearHover(); return; }
      else return;
      e.preventDefault();
      self.hoverIndex = i;
      self.drawHover();
      var r = self.svg.getBoundingClientRect();
      self.showTooltip(r.left + self.cx(i), r.top + self.L.top + self.L.ph / 2);
    });
    this.plot.addEventListener("blur", function () { self.clearHover(); });
    observe(this.plot, function () { if (self.data) self.render(1); });
  }

  Cashflow.prototype.update = function (d) {
    var self = this, same = this.data && sameKeys(this.data.keys, d.keys);
    this.data = d;
    if (this.anim) this.anim.stop();
    this.anim = tween(same ? 1 : 760, function (t) { self.render(t); });
  };

  Cashflow.prototype.cx = function (i) {
    return this.L.left + this.L.band * (i + 0.5);
  };

  Cashflow.prototype.render = function (t) {
    var d = this.data, self = this, n = d.keys.length;
    var w = Math.max(260, this.plot.clientWidth || 500);
    var ph = w < 520 ? 200 : 280;
    var left = w < 420 ? 44 : 54, top = 14, bottom = 38;
    var band = (w - left - 10) / Math.max(1, n);
    this.L = { w: w, left: left, top: top, ph: ph, pw: w - left - 10, band: band, barW: Math.max(2, Math.min(22, band * 0.56)) };
    var L = this.L;
    this.svg.setAttribute("viewBox", "0 0 " + w + " " + (top + ph + bottom));
    this.svg.setAttribute("width", w);
    this.svg.setAttribute("height", top + ph + bottom);

    var hi = 0, lo = 0;
    for (var i = 0; i < n; i++) {
      hi = Math.max(hi, d.income[i], d.net[i]);
      lo = Math.min(lo, -d.spent[i], d.net[i]);
    }
    var ticks = niceTicks(lo, hi || 1, ph < 200 ? 4 : 5);
    var Y = function (v) { return top + (ticks.hi - v) / (ticks.hi - ticks.lo) * ph; };
    this.Y = Y;
    clear(this.gGrid);
    var short = this.opts.short || String;
    ticks.ticks.forEach(function (v) {
      var y = r1(Y(v)) + 0.5;
      svgEl("line", { x1: L.left, x2: L.left + L.pw, y1: y, y2: y, class: v === 0 ? "is-zero" : null }, self.gGrid);
      var tx = svgEl("text", { x: L.left - 8, y: y + 4, "text-anchor": "end" }, self.gGrid);
      tx.textContent = (v < 0 ? "−" : "") + short(Math.abs(v));
    });

    clear(this.gBars);
    clear(this.gLine);
    var colors = this.opts.colors;
    var y0 = Y(0), incPath = "", outPath = "", pts = [];
    for (i = 0; i < n; i++) {
      var ti = easeOut(clamp(t * 1.6 - 0.6 * (n > 1 ? i / (n - 1) : 0), 0, 1));
      var x = this.cx(i) - L.barW / 2;
      var hi2 = (y0 - Y(d.income[i])) * ti, lo2 = (Y(-d.spent[i]) - y0) * ti;
      if (hi2 > 0.5) incPath += topRounded(x, y0 - hi2 - 1, L.barW, hi2, Math.min(4, hi2, L.barW / 2));
      if (lo2 > 0.5) outPath += bottomRounded(x, y0 + 1, L.barW, lo2, Math.min(4, lo2, L.barW / 2));
      pts.push([this.cx(i), y0 + (Y(d.net[i]) - y0) * ti]);
    }
    svgEl("path", { d: incPath, fill: colors.income }, this.gBars);
    svgEl("path", { d: outPath, fill: colors.spent }, this.gBars);
    if (n > 1) {
      svgEl("path", { d: "M" + curve(pts.map(function (p) { return p[0]; }), pts.map(function (p) { return p[1]; })), class: "net-line", stroke: colors.net }, this.gLine);
    }
    pts.forEach(function (p) {
      svgEl("circle", { cx: r1(p[0]), cy: r1(p[1]), r: 4, fill: colors.net, class: "net-dot" }, self.gLine);
    });

    clear(this.gX);
    var widest = 0;
    d.labels.forEach(function (l) { widest = Math.max(widest, l.main.length); });
    axisLabels(this.gX, d, Math.max(1, Math.ceil((widest * 6.6 + 14) / band)), function (j) { return self.cx(j); }, top + ph + 18);

    clear(this.gDim);
    clear(this.gBand);
    for (i = 0; i < n; i++) {
      var o = 0;
      if (d.partial && d.partial[i]) o = 0.38;
      if (d.selected >= 0 && d.selected !== i) o = Math.max(o, 0.55);
      if (o) svgEl("rect", { x: r1(L.left + band * i), y: top, width: r1(band + 0.6), height: ph, opacity: o }, this.gDim);
      if (d.selected === i) svgEl("rect", { x: r1(L.left + band * i + 2), y: top, width: r1(band - 4), height: ph, rx: 8, class: "is-selected" }, this.gBand);
    }
    this.hoverBand = svgEl("rect", { class: "is-hover", rx: 8, y: top, height: ph, width: 0 }, this.gBand);
    if (this.hoverIndex >= 0) this.drawHover();
  };

  Cashflow.prototype.indexAt = function (e) {
    if (!this.data || !this.L) return -1;
    var p = pointerIn(this.svg, e), L = this.L;
    if (p.x < L.left - 6 || p.x > L.left + L.pw + 6) return -1;
    return clamp(Math.floor((p.x - L.left) / L.band), 0, this.data.keys.length - 1);
  };

  Cashflow.prototype.drawHover = function () {
    var L = this.L, i = this.hoverIndex;
    if (!this.hoverBand || i < 0) return;
    this.hoverBand.setAttribute("x", r1(L.left + L.band * i + 2));
    this.hoverBand.setAttribute("width", r1(Math.max(0, L.band - 4)));
  };

  Cashflow.prototype.clearHover = function () {
    this.hoverIndex = -1;
    if (this.hoverBand) this.hoverBand.setAttribute("width", 0);
    hideTip();
  };

  Cashflow.prototype.showTooltip = function (x, y) {
    var d = this.data, i = this.hoverIndex, money = this.opts.money || String, c = this.opts.colors;
    var tip = new Tip(d.titles[i], d.partial && d.partial[i] ? "partial" : null);
    tip.row(c.income, money(d.income[i]), "Income");
    tip.row(c.spent, money(d.spent[i]), "Spending");
    var net = d.net[i];
    tip.total((net < 0 ? "−" : "+") + money(Math.abs(net)), net < 0 ? "Overspent" : "Saved");
    if (d.income[i] > 0) tip.line(Math.round(net / d.income[i] * 100) + "% of income kept", "tip-text");
    if (this.opts.hint) tip.hint(this.opts.hint);
    showTip(tip, x, y);
  };

  /* ════════════════════════════════════════════════════════════════════
     Calendar: one square per day, shaded by spend
     ════════════════════════════════════════════════════════════════════

     update({ from, to, data: { from, to }, days: { day: { spent, count,
              items } }, selected: day or null })
     opts: money, ramp: [5 colours, low to high], onPick(day),
     dayLabel(day), monthLabel(day), describe(t) -> label for an item    */
  function Calendar(host, opts) {
    var self = this;
    this.opts = opts || {};
    this.host = host;
    host.classList.add("viz-calendar");
    this.scroller = div("cal-scroll", host);
    this.svg = svgEl("svg", { class: "viz-svg", role: "grid", "aria-label": "Daily spending calendar" }, this.scroller);
    this.legend = div("cal-legend", host);
    this.svg.addEventListener("pointermove", function (e) {
      var cell = e.target.closest ? e.target.closest(".cal-day") : null;
      if (!cell) { self.unhover(); return; }
      self.hover(cell, e.clientX, e.clientY);
    });
    this.svg.addEventListener("pointerleave", function () { self.unhover(); });
    this.svg.addEventListener("click", function (e) {
      var cell = e.target.closest ? e.target.closest(".cal-day") : null;
      if (cell && self.opts.onPick) self.opts.onPick(+cell.getAttribute("data-day"));
    });
    this.svg.addEventListener("focusin", function (e) {
      var cell = e.target.closest ? e.target.closest(".cal-day") : null;
      if (!cell) return;
      var r = cell.getBoundingClientRect();
      self.hover(cell, r.right, r.top + r.height / 2);
    });
    this.svg.addEventListener("focusout", function () { self.unhover(); });
    this.svg.addEventListener("keydown", function (e) {
      var cell = e.target.closest ? e.target.closest(".cal-day") : null;
      if (!cell) return;
      var day = +cell.getAttribute("data-day"), next = null;
      if (e.key === "ArrowLeft") next = day - 7;
      else if (e.key === "ArrowRight") next = day + 7;
      else if (e.key === "ArrowUp") next = day - 1;
      else if (e.key === "ArrowDown") next = day + 1;
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (self.opts.onPick) self.opts.onPick(day);
        return;
      } else return;
      e.preventDefault();
      var target = self.svg.querySelector('[data-day="' + next + '"]');
      if (target) target.focus();
    });
    observe(host, function () { if (self.data) self.render(false); });
  }

  Calendar.prototype.update = function (d, animate) {
    var first = !this.data;
    this.data = d;
    this.render(animate !== false);
    if (first || this.lastTo !== d.to) {
      this.scroller.scrollLeft = this.scroller.scrollWidth;
      this.lastTo = d.to;
    }
  };

  // Thresholds that split the spending days into five even groups, so one
  // rent day does not wash every other day out to the lowest shade.
  Calendar.prototype.bins = function () {
    var vals = [];
    var days = this.data.days;
    for (var k in days) if (days[k].spent > 0 && +k >= this.data.from && +k <= this.data.to) vals.push(days[k].spent);
    vals.sort(function (a, b) { return a - b; });
    if (!vals.length) return [];
    var q = function (p) { return vals[Math.min(vals.length - 1, Math.floor(p * vals.length))]; };
    return [q(0.2), q(0.4), q(0.6), q(0.8)];
  };

  Calendar.prototype.shade = function (v, bins) {
    var ramp = this.opts.ramp;
    if (!(v > 0)) return null;
    for (var i = 0; i < bins.length; i++) if (v <= bins[i]) return ramp[i];
    return ramp[ramp.length - 1];
  };

  Calendar.prototype.render = function (animate) {
    var d = this.data, self = this;
    clear(this.svg);
    var start = d.from - ((d.from + 3) % 7);
    var weeks = Math.ceil((d.to - start + 1) / 7);
    var avail = Math.max(260, this.host.clientWidth || 600) - 36;
    var size = clamp(Math.floor(avail / weeks) - 3, 10, 22);
    var gap = size >= 13 ? 3 : 2;
    var step = size + gap;
    var left = 34, top = 20;
    var w = left + weeks * step + 4, h = top + 7 * step + 4;
    this.svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    this.svg.setAttribute("width", w);
    this.svg.setAttribute("height", h);

    var bins = this.bins();
    this.binsNow = bins;
    var monthLabel = this.opts.monthLabel || function () { return ""; };
    var lastMonth = null, lastLabelX = -100;
    ["Mon", "Wed", "Fri"].forEach(function (name, k) {
      var t = svgEl("text", { x: left - 8, y: top + (k * 2) * step + size - 2, "text-anchor": "end", class: "cal-wd" }, self.svg);
      t.textContent = name;
    });
    var cells = svgEl("g", { class: "cal-cells" + (animate && !calm() ? " is-entering" : "") }, this.svg);
    for (var wk = 0; wk < weeks; wk++) {
      for (var dow = 0; dow < 7; dow++) {
        var day = start + wk * 7 + dow;
        if (day < d.from || day > d.to) continue;
        var x = left + wk * step, y = top + dow * step;
        var p = kit.formats.ymd(day);
        if (p.m !== lastMonth && (p.d <= 7 || lastMonth === null) && x - lastLabelX > 30) {
          var ml = svgEl("text", { x: x, y: top - 7, class: "cal-month" }, self.svg);
          ml.textContent = monthLabel(day);
          lastLabelX = x;
          lastMonth = p.m;
        }
        var outside = d.data && (day < d.data.from || day > d.data.to);
        var info = d.days[day];
        var fill = outside ? null : this.shade(info && info.spent, bins);
        var cell = svgEl("rect", {
          x: x, y: y, width: size, height: size, rx: Math.max(2, size * 0.24),
          class: "cal-day" + (outside ? " is-outside" : fill ? "" : " is-zero") + (d.selected === day ? " is-selected" : ""),
          "data-day": day,
          tabindex: outside ? null : -1,
          style: fill ? "fill:" + fill + ";animation-delay:" + Math.round(wk * 9) + "ms" : "animation-delay:" + Math.round(wk * 9) + "ms"
        }, cells);
        if (!outside) cell.setAttribute("aria-label", (this.opts.dayLabel ? this.opts.dayLabel(day) : day) + ": " + (info ? (this.opts.money || String)(info.spent) : "nothing spent"));
      }
    }
    // Keyboard: the newest day in range is the way in.
    var tabbable = this.svg.querySelector(".cal-day.is-selected") || [].slice.call(this.svg.querySelectorAll(".cal-day:not(.is-outside)")).pop();
    if (tabbable) tabbable.setAttribute("tabindex", 0);
    this.renderLegend(bins);
  };

  Calendar.prototype.renderLegend = function (bins) {
    var money = this.opts.short || this.opts.money || String;
    clear(this.legend);
    div("cal-legend-text", this.legend, "Less", "span");
    var zero = div("cal-legend-cell is-zero", this.legend, null, "span");
    zero.title = "Nothing spent";
    var self = this;
    this.opts.ramp.forEach(function (c, i) {
      var s = div("cal-legend-cell", self.legend, null, "span");
      s.style.background = c;
      if (bins.length) {
        var lo = i === 0 ? 0 : bins[i - 1], hi = bins[i];
        s.title = hi == null ? "Over " + money(lo) : money(lo) + " – " + money(hi);
      }
    });
    div("cal-legend-text", this.legend, "More", "span");
  };

  Calendar.prototype.hover = function (cell, x, y) {
    var day = +cell.getAttribute("data-day");
    var info = this.data.days[day];
    var money = this.opts.money || String;
    if (this.hot) this.hot.classList.remove("is-hot");
    this.hot = cell;
    cell.classList.add("is-hot");
    var tip = new Tip(this.opts.dayLabel ? this.opts.dayLabel(day) : String(day));
    if (cell.classList.contains("is-outside")) {
      tip.line("Outside your statements", "tip-text is-note");
    } else if (!info) {
      tip.line("Nothing spent", "tip-text");
    } else {
      tip.total(money(info.spent), info.count === 1 ? "1 purchase" : info.count + " purchases");
      var describe = this.opts.describe || function (t) { return t.merchant; };
      info.items.slice(0, 4).forEach(function (t) {
        tip.row(null, money(-t.amount), describe(t), { muted: t.amount > 0 });
      });
      if (info.items.length > 4) tip.line("+ " + (info.items.length - 4) + " more", "tip-text");
      tip.hint("Click to list this day");
    }
    showTip(tip, x, y);
  };

  Calendar.prototype.unhover = function () {
    if (this.hot) this.hot.classList.remove("is-hot");
    this.hot = null;
    hideTip();
  };

  /* ════════════════════════════════════════════════════════════════════
     Sankey: where the money went
     ════════════════════════════════════════════════════════════════════

     update({ sources: [{ name, value }], deficit, targets: [{ id, name,
              icon, color, value }], saved })
     opts: money, onPick(id), colors: { source, saved, deficit }           */
  function Sankey(host, opts) {
    var self = this;
    this.opts = opts || {};
    this.host = host;
    host.classList.add("viz-sankey");
    this.svg = svgEl("svg", { class: "viz-svg", role: "img" }, host);
    this.svg.addEventListener("pointermove", function (e) {
      var n = e.target.closest ? e.target.closest("[data-flow]") : null;
      if (!n) { self.unhover(); return; }
      self.hover(n.getAttribute("data-flow"), e.clientX, e.clientY);
    });
    this.svg.addEventListener("pointerleave", function () { self.unhover(); });
    this.svg.addEventListener("click", function (e) {
      var n = e.target.closest ? e.target.closest("[data-flow]") : null;
      if (!n) return;
      var f = self.flows[n.getAttribute("data-flow")];
      if (f && f.id && self.opts.onPick) self.opts.onPick(f.id);
    });
    observe(host, function () { if (self.data) self.render(false); });
  }

  Sankey.prototype.update = function (d) {
    this.data = d;
    this.render(true);
  };

  Sankey.prototype.render = function (animate) {
    var d = this.data, self = this, money = this.opts.money || String, colors = this.opts.colors;
    clear(this.svg);
    this.flows = {};
    var w = Math.max(280, this.host.clientWidth || 600);
    var compact = w < 560;
    var left = d.sources.slice();
    if (d.deficit > 0) left.push({ name: "From savings", value: d.deficit, kind: "deficit" });
    var right = d.targets.slice();
    if (d.saved > 0) right.push({ id: "_saved", name: "Saved", value: d.saved, kind: "saved" });
    var total = 0;
    left.forEach(function (n) { total += n.value; });
    if (!(total > 0) || !right.length) {
      this.svg.setAttribute("viewBox", "0 0 " + w + " 80");
      this.svg.setAttribute("width", w);
      this.svg.setAttribute("height", 80);
      var t = svgEl("text", { x: w / 2, y: 44, "text-anchor": "middle", class: "viz-empty" }, this.svg);
      t.textContent = "Add statements with income to see where it went";
      return;
    }

    var h = Math.max(300, Math.min(560, right.length * 44 + 60));
    var nodeW = 10, padL = 14, padR = right.length > 9 ? 6 : 10;
    var labelL = compact ? 104 : 150, labelR = compact ? 132 : 190;
    var x0 = labelL, x2 = w - labelR - nodeW, x1 = Math.round((x0 + x2) / 2);
    var top = 10, avail = h - 20;
    var k = Math.min((avail - padL * (left.length - 1)) / total, (avail - padR * (right.length - 1)) / total);
    this.svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    this.svg.setAttribute("width", w);
    this.svg.setAttribute("height", h);
    this.svg.setAttribute("aria-label", "Money flow: " + money(total) + " in, split across " + right.length + " destinations.");

    function stack(nodes, pad) {
      var used = 0;
      nodes.forEach(function (n) { used += n.value * k; });
      used += pad * (nodes.length - 1);
      var y = top + (avail - used) / 2;
      nodes.forEach(function (n) {
        n.y = y;
        n.h = Math.max(1, n.value * k);
        y += n.h + pad;
      });
    }
    stack(left, padL);
    stack(right, padR);
    var mid = { y: top + (avail - total * k) / 2, h: total * k };

    var gLinks = svgEl("g", { class: "sk-links" + (animate && !calm() ? " is-entering" : "") }, this.svg);
    var gNodes = svgEl("g", { class: "sk-nodes" }, this.svg);
    var gLabels = svgEl("g", { class: "sk-labels" }, this.svg);

    function ribbon(xa, ya, xb, yb, hgt) {
      var xm = (xa + xb) / 2;
      return "M" + r1(xa) + "," + r1(ya) + "C" + r1(xm) + "," + r1(ya) + " " + r1(xm) + "," + r1(yb) + " " + r1(xb) + "," + r1(yb) +
        "L" + r1(xb) + "," + r1(yb + hgt) + "C" + r1(xm) + "," + r1(yb + hgt) + " " + r1(xm) + "," + r1(ya + hgt) + " " + r1(xa) + "," + r1(ya + hgt) + "Z";
    }

    var midY = mid.y, flowId = 0;
    left.forEach(function (n) {
      var id = "f" + flowId++;
      var color = n.kind === "deficit" ? colors.deficit : colors.source;
      svgEl("path", { d: ribbon(x0 + nodeW, n.y, x1, midY, n.h), fill: color, class: "sk-link", "data-flow": id, style: "animation-delay:0ms" }, gLinks);
      self.flows[id] = { name: n.name, value: n.value, share: n.value / total, side: "in", kind: n.kind };
      svgEl("rect", { x: x0, y: r1(n.y), width: nodeW, height: r1(n.h), rx: 2, fill: color, class: "sk-node", "data-flow": id }, gNodes);
      midY += n.h;
    });
    svgEl("rect", { x: x1, y: r1(mid.y), width: nodeW, height: r1(mid.h), rx: 2, class: "sk-node sk-mid" }, gNodes);
    midY = mid.y;
    right.forEach(function (n, i) {
      var id = "f" + flowId++;
      var color = n.kind === "saved" ? colors.saved : n.color;
      svgEl("path", { d: ribbon(x1 + nodeW, midY, x2, n.y, n.h), fill: color, class: "sk-link", "data-flow": id, style: "animation-delay:" + (120 + i * 45) + "ms" }, gLinks);
      self.flows[id] = { id: n.kind === "saved" ? null : n.id, name: n.name, icon: n.icon, value: n.value, share: n.value / total, side: "out", kind: n.kind, color: color };
      svgEl("rect", { x: x2, y: r1(n.y), width: nodeW, height: r1(n.h), rx: 2, fill: color, class: "sk-node", "data-flow": id }, gNodes);
      midY += n.h;
    });

    // Labels: centred on their node, but at least a line apart -- pushed
    // down first, then back up from the bottom edge if that overflowed.
    function place(nodes, minGap) {
      var ys = nodes.map(function (n) { return n.y + n.h / 2; });
      var i, last = ys.length - 1;
      for (i = 1; i <= last; i++) if (ys[i] < ys[i - 1] + minGap) ys[i] = ys[i - 1] + minGap;
      if (ys[last] > h - 10) {
        ys[last] = h - 10;
        for (i = last - 1; i >= 0; i--) if (ys[i] > ys[i + 1] - minGap) ys[i] = ys[i + 1] - minGap;
      }
      return ys;
    }
    var lineH = compact ? 13 : 15;
    var ly = place(left, lineH * 2.2);
    left.forEach(function (n, i) {
      var t = svgEl("text", { x: x0 - 8, y: r1(ly[i] - 2), "text-anchor": "end", class: "sk-name" }, gLabels);
      t.textContent = truncate(n.name, compact ? 14 : 20);
      var v = svgEl("text", { x: x0 - 8, y: r1(ly[i] + lineH - 2), "text-anchor": "end", class: "sk-value" }, gLabels);
      v.textContent = money(n.value);
    });
    var midLabel = svgEl("text", { x: x1 + nodeW / 2, y: r1(Math.max(12, mid.y - 4)), "text-anchor": "middle", class: "sk-value" }, gLabels);
    midLabel.textContent = money(total);
    var ry = place(right, compact ? lineH : lineH * 1.25);
    right.forEach(function (n, i) {
      var t = svgEl("text", { x: x2 + nodeW + 8, y: r1(ry[i] + 4), class: "sk-name" }, gLabels);
      var name = svgEl("tspan", null, t);
      name.textContent = (n.icon ? n.icon + " " : n.kind === "saved" ? "🐷 " : "") + truncate(n.name, compact ? 13 : 18);
      var val = svgEl("tspan", { class: "sk-value", dx: 6 }, t);
      val.textContent = compact ? (self.opts.short || money)(n.value) : money(n.value);
    });
  };

  function truncate(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  Sankey.prototype.hover = function (id, x, y) {
    var f = this.flows[id], money = this.opts.money || String;
    if (!f) return;
    this.svg.classList.add("has-hot");
    [].forEach.call(this.svg.querySelectorAll("[data-flow]"), function (n) {
      n.classList.toggle("is-hot", n.getAttribute("data-flow") === id);
    });
    var tip = new Tip((f.icon ? f.icon + " " : "") + f.name);
    tip.total(money(f.value), Math.round(f.share * 100) + "% of the money in");
    if (f.kind === "deficit") tip.line("Spending went past income by this much.", "tip-text");
    else if (f.kind === "saved") tip.line("Income left over after spending.", "tip-text");
    if (f.id) tip.hint("Click to focus on this category");
    showTip(tip, x, y);
  };

  Sankey.prototype.unhover = function () {
    this.svg.classList.remove("has-hot");
    [].forEach.call(this.svg.querySelectorAll(".is-hot"), function (n) { n.classList.remove("is-hot"); });
    hideTip();
  };

  /* ── Sparkline ───────────────────────────────────────────────────── */
  function sparkline(values, opts) {
    opts = opts || {};
    var w = opts.width || 96, h = opts.height || 28, pad = 4;
    var svg = svgEl("svg", { class: "spark", viewBox: "0 0 " + w + " " + h, width: w, height: h, "aria-hidden": "true" });
    if (!values || values.length < 2) return svg;
    var max = 0;
    values.forEach(function (v) { if (v > max) max = v; });
    max = max || 1;
    var xs = values.map(function (v, i) { return pad + (i / (values.length - 1)) * (w - pad * 2); });
    var ys = values.map(function (v) { return pad + (1 - Math.max(0, v) / max) * (h - pad * 2); });
    var top = curve(xs, ys);
    if (opts.area !== false) {
      svgEl("path", { d: "M" + r1(xs[0]) + "," + (h - pad) + "L" + top + "L" + r1(xs[xs.length - 1]) + "," + (h - pad) + "Z", fill: opts.color, class: "spark-fill" }, svg);
    }
    svgEl("path", { d: "M" + top, stroke: opts.color, class: "spark-line" }, svg);
    svgEl("circle", { cx: r1(xs[xs.length - 1]), cy: r1(ys[ys.length - 1]), r: 3, fill: opts.color, class: "spark-dot" }, svg);
    return svg;
  }

  // Charge history for a recurring payment: one tick per charge.
  function ticks(dates, from, to, opts) {
    opts = opts || {};
    var w = opts.width || 120, h = opts.height || 18;
    var svg = svgEl("svg", { class: "ticks", viewBox: "0 0 " + w + " " + h, width: w, height: h, "aria-hidden": "true" });
    svgEl("line", { x1: 2, x2: w - 2, y1: h / 2 + 0.5, y2: h / 2 + 0.5, class: "ticks-base" }, svg);
    dates.forEach(function (d) {
      if (d < from || d > to) return;
      var x = 2 + ((d - from) / Math.max(1, to - from)) * (w - 4);
      svgEl("circle", { cx: r1(x), cy: h / 2 + 0.5, r: 3, fill: opts.color, class: "ticks-dot" }, svg);
    });
    return svg;
  }

  kit.charts = {
    Timeline: Timeline,
    Brush: Brush,
    Cashflow: Cashflow,
    Calendar: Calendar,
    Sankey: Sankey,
    sparkline: sparkline,
    ticks: ticks,
    hideTip: hideTip,
    niceTicks: niceTicks,
    tween: tween,
    calm: calm
  };
})(window.SpendscapeKit = window.SpendscapeKit || {});
