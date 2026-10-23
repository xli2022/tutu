/* ── 还泪记 · buildings ───────────────────────────────────────────────────
   Garden architecture and the furniture of a room, as paper cut-outs:
   whitewashed walls under grey tiles (粉墙黛瓦), moon gates and lattice
   windows, roofs with lifted eaves, gatehouses, pavilions and bridges;
   inside, lattice doors, lacquered pillars, lanterns, screens, desks,
   candles, braziers and bed curtains. Same conventions as scenery.js.   */
(function (kit) {
  "use strict";

  var P = kit.paint, X = kit.scenery;
  var S = P.spline, path = P.path, g = P.g, tag = P.tag, shade = P.shade, n1 = P.n1;
  var INK = X.INK;
  var B = {};

  function rect(x, y, w, h, fill, extra) {
    var a = { x: n1(x), y: n1(y), width: n1(w), height: n1(h), fill: fill };
    if (extra) for (var k in extra) a[k] = extra[k];
    return tag("rect", a);
  }
  B.rect = rect;

  /* ── Walls, windows, gates ─────────────────────────────────────────── */

  // A tiled cap along a wall top, from x0 to x1 at y.
  B.cap = function (x0, x1, y, tile, snow) {
    var out = path(P.poly([[x0 - 12, y + 5], [x1 + 12, y + 5], [x1 + 4, y - 14], [x0 - 4, y - 14]], true), tile);
    out += rect(x0 - 4, y - 25, x1 - x0 + 8, 11, shade(tile, -0.18));
    var ends = "";
    for (var x = x0; x < x1; x += 16) {
      ends += tag("circle", { cx: n1(x + 8), cy: n1(y + 6), r: 5.2, fill: shade(tile, -0.1) });
      ends += path("M" + n1(x + 8) + " " + n1(y - 13) + "V" + n1(y + 1), "none", { stroke: shade(tile, -0.32), "stroke-width": 1, opacity: 0.5 });
    }
    out += ends;
    if (snow) out += path(S([[x0 - 6, y - 24], [(x0 + x1) / 2, y - 31], [x1 + 6, y - 24], [x1 + 6, y - 14], [x0 - 6, y - 14]], true), "#f7fafd") + rect(x0 - 8, y - 15, x1 - x0 + 16, 9, "#eef3f8");
    return out;
  };

  // 粉墙黛瓦, optionally pierced by a moon gate and lattice windows.
  B.wall = function (defs, o) {
    var fill = X.grad(defs, 0, 0, 0, 1, [[0, shade(o.color, 0.05)], [1, shade(o.color, -0.12)]]);
    var d = "M" + o.x0 + " " + o.y + "H" + o.x1 + "V" + (o.y + o.h) + "H" + o.x0 + "Z";
    var inside = "";
    if (o.gate) {
      var gt = o.gate;
      d += "M" + n1(gt.x + gt.r) + " " + n1(gt.y) + "A" + gt.r + " " + gt.r + " 0 1 0 " + n1(gt.x - gt.r) + " " + n1(gt.y) + "A" + gt.r + " " + gt.r + " 0 1 0 " + n1(gt.x + gt.r) + " " + n1(gt.y) + "Z";
      inside = tag("circle", { cx: gt.x, cy: gt.y, r: gt.r + 7, fill: "none", stroke: shade(o.color, -0.25), "stroke-width": 10 }) +
        tag("circle", { cx: gt.x, cy: gt.y, r: gt.r + 1, fill: "none", stroke: shade(o.color, -0.45), "stroke-width": 2, opacity: 0.6 });
    }
    var out = path(d, fill, { "fill-rule": "evenodd" }) + inside;
    out += B.cap(o.x0, o.x1, o.y, o.tile, o.snow);
    out += rect(o.x0, o.y + 8, o.x1 - o.x0, 26, X.grad(defs, 0, 0, 0, 1, [[0, INK, 0.26], [1, INK, 0]]));
    out += rect(o.x0, o.y + o.h - 16, o.x1 - o.x0, 16, shade(o.color, -0.3), { opacity: 0.5 });
    (o.windows || []).forEach(function (w) { out += B.lattice(defs, w); });
    return out;
  };

  function shapePath(o) {
    var x = o.x, y = o.y, r = o.r;
    if (o.shape === "round") return "M" + (x + r) + " " + y + "A" + r + " " + r + " 0 1 0 " + (x - r) + " " + y + "A" + r + " " + r + " 0 1 0 " + (x + r) + " " + y + "Z";
    if (o.shape === "hex") {
      var pts = [];
      for (var i = 0; i < 6; i++) { var a = Math.PI / 6 + i * Math.PI / 3; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 1.05]); }
      return P.poly(pts, true);
    }
    if (o.shape === "fan") {
      var r0 = r * 0.42, a0 = -Math.PI * 0.82, a1 = -Math.PI * 0.18, cy = y + r * 0.62;
      return "M" + n1(x + Math.cos(a0) * r) + " " + n1(cy + Math.sin(a0) * r) + "A" + r + " " + r + " 0 0 1 " + n1(x + Math.cos(a1) * r) + " " + n1(cy + Math.sin(a1) * r) +
        "L" + n1(x + Math.cos(a1) * r0) + " " + n1(cy + Math.sin(a1) * r0) + "A" + r0 + " " + r0 + " 0 0 0 " + n1(x + Math.cos(a0) * r0) + " " + n1(cy + Math.sin(a0) * r0) + "Z";
    }
    var w = o.w || r * 2, h = o.h || r * 1.5;
    return "M" + (x - w / 2) + " " + (y - h / 2) + "h" + w + "v" + h + "h" + (-w) + "Z";
  }

  // A window or leaking window: whatever is behind (`behind` fill or a
  // `view` SVG string clipped to the opening), then lattice, then frame.
  B.lattice = function (defs, o) {
    var cid = P.id("lc"), d = shapePath(o);
    defs.push(tag("clipPath", { id: cid }, path(d)));
    var r = o.r, bars = "", step = o.step || r / 3.2, sw = o.bar || 3.2;
    var pat = o.pattern || "diag";
    if (pat === "diag") {
      for (var k = -8; k <= 8; k++) {
        bars += "M" + n1(o.x + k * step - r * 2) + " " + n1(o.y - r * 2) + "l" + n1(r * 4) + " " + n1(r * 4);
        bars += "M" + n1(o.x + k * step + r * 2) + " " + n1(o.y - r * 2) + "l" + n1(-r * 4) + " " + n1(r * 4);
      }
    } else if (pat === "grid") {
      for (var gx = -8; gx <= 8; gx++) bars += "M" + n1(o.x + gx * step) + " " + n1(o.y - r * 2) + "V" + n1(o.y + r * 2);
      for (var gy = -8; gy <= 8; gy++) bars += "M" + n1(o.x - r * 2) + " " + n1(o.y + gy * step) + "H" + n1(o.x + r * 2);
    } else if (pat === "ice") {
      // 冰裂纹: cracked-ice polygons.
      var rr = P.rng(o.seed || 9);
      for (var c = 0; c < 26; c++) {
        var cx0 = o.x + (rr() - 0.5) * r * 2.2, cy0 = o.y + (rr() - 0.5) * r * 2.2, a = rr() * 6.28, l = r * (0.4 + rr() * 0.7);
        bars += "M" + n1(cx0) + " " + n1(cy0) + "l" + n1(Math.cos(a) * l) + " " + n1(Math.sin(a) * l);
      }
    }
    var inner = o.view ? g({ "clip-path": "url(#" + cid + ")" }, o.view) : path(d, o.behind || "#cdd2bf");
    if (o.paper) inner += path(d, o.paper, { opacity: o.paperOp || 0.6 });
    if (o.shadow) inner += g({ "clip-path": "url(#" + cid + ")", opacity: 0.35 }, o.shadow);
    return inner + g({ "clip-path": "url(#" + cid + ")" }, path(bars, "none", { stroke: o.frame, "stroke-width": sw, "stroke-linecap": "square" })) +
      path(d, "none", { stroke: o.frame, "stroke-width": o.rim || 8 });
  };

  // A roof seen from the front, with lifted eave corners.
  B.roof = function (o) {
    var x = o.x, y = o.y, w = o.w, h = o.h, c = o.color;
    var lift = o.lift == null ? h * 0.5 : o.lift;
    var d = S([[x - w / 2 - 20, y - lift, 0], [x - w / 2 + w * 0.08, y + 2], [x, y + 6], [x + w / 2 - w * 0.08, y + 2], [x + w / 2 + 20, y - lift, 0],
      [x + w / 2 - w * 0.06, y - h * 0.45], [x + w * 0.3, y - h, 0], [x - w * 0.3, y - h, 0], [x - w / 2 + w * 0.06, y - h * 0.45]], true);
    var lines = "";
    for (var i = 1; i < 16; i++) {
      var lx = x - w * 0.42 + w * 0.84 * (i / 16);
      lines += "M" + n1(lx) + " " + n1(y - h * 0.92) + "L" + n1(x + (lx - x) * 1.12) + " " + n1(y);
    }
    var out = path(d, c, { stroke: shade(c, -0.35), "stroke-width": 1.5 }) + path(lines, "none", { stroke: shade(c, -0.3), "stroke-width": 1, opacity: 0.45 });
    out += rect(x - w * 0.32, y - h - 7, w * 0.64, 9, shade(c, -0.25), { rx: 2 });
    out += path(S([[x - w * 0.32, y - h - 3], [x - w * 0.36, y - h - 18], [x - w * 0.31, y - h - 22], [x - w * 0.3, y - h - 12]], false), "none", { stroke: shade(c, -0.3), "stroke-width": 5, "stroke-linecap": "round" });
    out += path(S([[x + w * 0.32, y - h - 3], [x + w * 0.36, y - h - 18], [x + w * 0.31, y - h - 22], [x + w * 0.3, y - h - 12]], false), "none", { stroke: shade(c, -0.3), "stroke-width": 5, "stroke-linecap": "round" });
    if (o.snow) out += path(S([[x - w * 0.3, y - h - 6], [x, y - h - 12], [x + w * 0.3, y - h - 6], [x + w / 2 - w * 0.06, y - h * 0.45 - 4], [x + w * 0.2, y - h * 0.5], [x - w * 0.2, y - h * 0.5], [x - w / 2 + w * 0.06, y - h * 0.45 - 4]], true), "#f6f9fc", { opacity: 0.95 });
    return out;
  };

  B.pillar = function (defs, x, y0, y1, w, color) {
    var fill = X.grad(defs, 0, 0, 1, 0, [[0, shade(color, -0.35)], [0.35, shade(color, 0.12)], [0.6, color], [1, shade(color, -0.45)]]);
    return rect(x - w / 2, y0, w, y1 - y0, fill) + rect(x - w / 2 - 5, y1 - 14, w + 10, 14, "#8d877c", { rx: 2 });
  };

  B.railing = function (o) {
    var out = rect(o.x0, o.y - o.h, o.x1 - o.x0, 7, o.color, { rx: 2 }) + rect(o.x0, o.y - 10, o.x1 - o.x0, 10, shade(o.color, -0.15));
    for (var x = o.x0; x <= o.x1; x += o.step || 46) out += rect(x - 3.5, o.y - o.h, 7, o.h, shade(o.color, -0.1));
    var lat = "";
    for (var x2 = o.x0; x2 < o.x1; x2 += o.step || 46) lat += "M" + n1(x2 + 6) + " " + n1(o.y - o.h * 0.62) + "h" + n1((o.step || 46) - 12);
    return out + path(lat, "none", { stroke: shade(o.color, -0.2), "stroke-width": 3 });
  };

  // A small pavilion (亭) on a stone base.
  B.pavilion = function (defs, o) {
    var x = o.x, y = o.y, w = o.w, h = o.h;
    var out = rect(x - w / 2 - 14, y - 16, w + 28, 16, o.stone || "#b9b2a3") + rect(x - w / 2 - 8, y - 24, w + 16, 9, shade(o.stone || "#b9b2a3", 0.1));
    out += B.pillar(defs, x - w / 2 + 12, y - h, y - 24, 12, o.pillar || "#8c3b30") + B.pillar(defs, x + w / 2 - 12, y - h, y - 24, 12, o.pillar || "#8c3b30");
    out += B.railing({ x0: x - w / 2 + 4, x1: x + w / 2 - 4, y: y - 24, h: h * 0.28, color: o.rail || "#7b4a36", step: w / 6 });
    out += rect(x - w / 2 + 4, y - h - 4, w - 8, 12, shade(o.pillar || "#8c3b30", -0.2));
    out += B.roof({ x: x, y: y - h, w: w * 1.18, h: h * 0.5, color: o.roof || "#4f555c", snow: o.snow });
    return out;
  };

  // A gatehouse (门楼) with two leaves and brass knockers; `glow` lights
  // the crack between the leaves from inside.
  B.gate = function (defs, o) {
    var x = o.x, y = o.y, w = o.w, h = o.h;
    var out = "";
    out += rect(x - w / 2 - 26, y - h - 30, w + 52, h + 30, o.wall || "#e9e2d2");
    var door = X.grad(defs, 0, 0, 0, 1, [[0, shade(o.door, 0.08)], [1, shade(o.door, -0.2)]]);
    out += rect(x - w / 2, y - h, w / 2 - 1.5, h, door) + rect(x + 1.5, y - h, w / 2 - 1.5, h, door);
    for (var i = 1; i < 5; i++) {
      out += path("M" + n1(x - w / 2 + 6) + " " + n1(y - h + i * h / 5) + "h" + n1(w / 2 - 14) + "M" + n1(x + 8) + " " + n1(y - h + i * h / 5) + "h" + n1(w / 2 - 14), "none", { stroke: shade(o.door, -0.35), "stroke-width": 1.4, opacity: 0.6 });
    }
    out += tag("circle", { cx: n1(x - 14), cy: n1(y - h * 0.48), r: 7, fill: "none", stroke: "#c9a45c", "stroke-width": 2.4 }) + tag("circle", { cx: n1(x + 14), cy: n1(y - h * 0.48), r: 7, fill: "none", stroke: "#c9a45c", "stroke-width": 2.4 });
    out += tag("circle", { cx: n1(x - 14), cy: n1(y - h * 0.48 - 8), r: 4.5, fill: "#c9a45c" }) + tag("circle", { cx: n1(x + 14), cy: n1(y - h * 0.48 - 8), r: 4.5, fill: "#c9a45c" });
    if (o.glow) {
      out += rect(x - 2, y - h, 4, h, "#ffd58a", { opacity: 0.95, "class": "flicker" });
      out += tag("ellipse", { cx: x, cy: n1(y - h * 0.5), rx: 40, ry: n1(h * 0.55), fill: X.rgrad(defs, [[0, "#ffcf7a", 0.45], [1, "#ffcf7a", 0]]), "class": "flicker" });
    }
    out += rect(x - w / 2 - 10, y - 10, w + 20, 10, "#9a9384") + rect(x - w / 2 - 22, y, w + 44, 8, "#b1aa9c");
    out += B.roof({ x: x, y: y - h - 26, w: w + 90, h: 64, color: o.tile || "#4f555c", snow: o.snow });
    return out;
  };

  // A low arched stone bridge with a railing.
  B.bridge = function (defs, o) {
    var x = o.x, y = o.y, w = o.w, c = o.color;
    var deck = S([[x - w / 2 - 30, y + 26, 0], [x - w / 4, y + 2], [x, y - 6], [x + w / 4, y + 2], [x + w / 2 + 30, y + 26, 0],
      [x + w / 2 + 30, y + 44, 0], [x + w * 0.3, y + 44], [x + w * 0.22, y + 26], [x, y + 18], [x - w * 0.22, y + 26], [x - w * 0.3, y + 44], [x - w / 2 - 30, y + 44, 0]], true);
    var out = path(S([[x - w * 0.3, y + 44, 0], [x - w * 0.22, y + 26], [x, y + 18], [x + w * 0.22, y + 26], [x + w * 0.3, y + 44, 0]], true), shade(c, -0.55), { opacity: 0.5 });
    out += path(deck, c, { stroke: shade(c, -0.35), "stroke-width": 1.4 });
    var rail = "";
    for (var i = 0; i <= 10; i++) {
      var t = i / 10, px = x - w / 2 + w * t, py = y - 6 + Math.pow((t - 0.5) * 2, 2) * 30;
      rail += rect(px - 3, py - 26, 6, 26, shade(c, -0.12));
    }
    rail += path(S([[x - w / 2, y + 2], [x, y - 28], [x + w / 2, y + 2]], false), "none", { stroke: shade(c, -0.2), "stroke-width": 5, "stroke-linecap": "round" });
    if (o.snow) rail += path(S([[x - w / 2, y - 1], [x, y - 32], [x + w / 2, y - 1]], false), "none", { stroke: "#f7fafd", "stroke-width": 4, "stroke-linecap": "round" });
    return out + rail;
  };

  /* ── Rooms ─────────────────────────────────────────────────────────── */

  // A row of lattice doors (隔扇): lattice above, panels below.
  B.doors = function (defs, o) {
    var out = "", n = o.n, pw = (o.x1 - o.x0) / n, h = o.y1 - o.y0;
    for (var i = 0; i < n; i++) {
      var x = o.x0 + i * pw;
      out += rect(x + 2, o.y0, pw - 4, h, o.wood);
      var lx = x + 10, ly = o.y0 + 12, lw = pw - 20, lh = h * 0.56;
      out += rect(lx, ly, lw, lh, o.paper, { opacity: o.paperOp || 1 });
      if (o.glow) out += rect(lx, ly, lw, lh, o.glow, { opacity: 0.55, "class": "flicker" });
      var bars = "";
      var step = lw / 5;
      for (var k = 1; k < 5; k++) bars += "M" + n1(lx + k * step) + " " + n1(ly) + "v" + n1(lh);
      for (var q = 1; q < 8; q++) bars += "M" + n1(lx) + " " + n1(ly + q * lh / 8) + "h" + n1(lw);
      out += path(bars, "none", { stroke: shade(o.wood, -0.1), "stroke-width": 2.4 });
      out += rect(lx, ly, lw, lh, "none", { stroke: shade(o.wood, -0.3), "stroke-width": 4 });
      out += rect(lx, ly + lh + 14, lw, 22, shade(o.wood, 0.08), { stroke: shade(o.wood, -0.3), "stroke-width": 1.5 });
      out += rect(lx, ly + lh + 50, lw, h - lh - 70, shade(o.wood, 0.05), { stroke: shade(o.wood, -0.3), "stroke-width": 1.5 });
      out += tag("ellipse", { cx: n1(x + pw / 2), cy: n1(ly + lh + 50 + (h - lh - 70) / 2), rx: n1(lw * 0.28), ry: n1((h - lh - 70) * 0.3), fill: "none", stroke: shade(o.wood, -0.25), "stroke-width": 1.5 });
    }
    return out;
  };

  // A horizontal name board (匾额) with gilt characters.
  B.plaque = function (defs, o) {
    var out = rect(o.x - o.w / 2 - 8, o.y - o.h / 2 - 8, o.w + 16, o.h + 16, "#5a3c22", { rx: 3 });
    out += rect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, o.color || "#1f2a3a", { rx: 2 });
    out += rect(o.x - o.w / 2 + 5, o.y - o.h / 2 + 5, o.w - 10, o.h - 10, "none", { stroke: "#c9a45c", "stroke-width": 1.5 });
    var chars = Array.from(o.text), step = (o.w - 40) / chars.length;
    chars.forEach(function (c, i) {
      out += tag("text", { x: n1(o.x + o.w / 2 - 20 - step * (i + 0.5)), y: n1(o.y + o.h * 0.2), "text-anchor": "middle", "font-family": "Ma Shan Zheng, serif", "font-size": n1(o.h * 0.58), fill: "#d8b46a" }, c);
    });
    return out;
  };

  // A palace lantern (宫灯) hanging from (x, y).
  B.lantern = function (defs, o) {
    var x = o.x, y = o.y, s = o.s || 1, c = o.color || "#b23a32";
    var out = path("M" + x + " " + n1(y - (o.cord || 60)) + "V" + y, "none", { stroke: "#3a2b20", "stroke-width": 1.6 });
    if (o.lit) out += tag("circle", { cx: x, cy: n1(y + 46 * s), r: n1(110 * s), fill: X.rgrad(defs, [[0, "#ffcf7a", 0.42], [1, "#ffcf7a", 0]]), "class": "flicker" });
    out += path(P.poly([[x - 22 * s, y], [x + 22 * s, y], [x + 30 * s, y + 10 * s], [x - 30 * s, y + 10 * s]], true), "#5a3c22");
    var body = X.grad(defs, 0, 0, 1, 0, [[0, shade(c, -0.3)], [0.5, o.lit ? shade(c, 0.35) : c], [1, shade(c, -0.3)]]);
    out += path(S([[x - 30 * s, y + 10 * s, 0], [x - 36 * s, y + 46 * s], [x - 30 * s, y + 82 * s, 0], [x + 30 * s, y + 82 * s, 0], [x + 36 * s, y + 46 * s], [x + 30 * s, y + 10 * s, 0]], true), body);
    out += path("M" + n1(x - 12 * s) + " " + n1(y + 10 * s) + "V" + n1(y + 82 * s) + "M" + n1(x + 12 * s) + " " + n1(y + 10 * s) + "V" + n1(y + 82 * s), "none", { stroke: "#5a3c22", "stroke-width": n1(2.4 * s) });
    out += path(P.poly([[x - 30 * s, y + 82 * s], [x + 30 * s, y + 82 * s], [x + 22 * s, y + 92 * s], [x - 22 * s, y + 92 * s]], true), "#5a3c22");
    out += path("M" + n1(x - 14 * s) + " " + n1(y + 92 * s) + "v" + n1(34 * s) + "M" + n1(x) + " " + n1(y + 92 * s) + "v" + n1(40 * s) + "M" + n1(x + 14 * s) + " " + n1(y + 92 * s) + "v" + n1(34 * s), "none", { stroke: c, "stroke-width": n1(3 * s) });
    return g({ "class": "sway", style: "transform-origin:" + x + "px " + n1(y - (o.cord || 60)) + "px;animation-duration:" + (5 + (x % 3)) + "s" }, out);
  };

  // A folding screen (屏风) painted with distant ink hills.
  B.screen = function (defs, o) {
    var out = "", pw = o.w / o.panels;
    for (var i = 0; i < o.panels; i++) {
      var x = o.x - o.w / 2 + i * pw;
      out += rect(x, o.y - o.h, pw - 3, o.h, o.frame || "#4a2e1f");
      out += rect(x + 8, o.y - o.h + 10, pw - 19, o.h - 44, o.silk || "#e8dcc0");
    }
    var hills = X.hills(defs, { seed: o.seed || 5, x0: o.x - o.w / 2 + 8, x1: o.x + o.w / 2 - 11, y: o.y - o.h * 0.42, amp: o.h * 0.22, scale: o.w * 0.5, depth: o.h * 0.4, color: "#55606a", op: 0.55 });
    var cid = P.id("sc");
    var clip = "";
    for (var k = 0; k < o.panels; k++) clip += rect(o.x - o.w / 2 + k * pw + 8, o.y - o.h + 10, pw - 19, o.h - 44, "#000");
    defs.push(tag("clipPath", { id: cid }, clip));
    out += g({ "clip-path": "url(#" + cid + ")" }, hills);
    return out;
  };

  // A writing desk with books, a brush pot and an inkstone.
  B.desk = function (defs, o) {
    var x = o.x, y = o.y, w = o.w, h = o.h || 120, c = o.wood || "#5a3a26";
    var out = rect(x - w / 2, y - h, w, 14, shade(c, 0.12), { rx: 3 });
    out += path(S([[x - w / 2 + 14, y - h + 14], [x - w / 2 + 18, y], [x - w / 2 + 28, y], [x - w / 2 + 28, y - h + 14]], true), c);
    out += path(S([[x + w / 2 - 14, y - h + 14], [x + w / 2 - 18, y], [x + w / 2 - 28, y], [x + w / 2 - 28, y - h + 14]], true), c);
    out += rect(x - w / 2 + 14, y - h + 14, w - 28, 14, shade(c, -0.15));
    if (o.books !== false) {
      out += rect(x - w * 0.42, y - h - 18, 70, 9, "#3f5a78") + rect(x - w * 0.42 + 4, y - h - 27, 64, 9, "#8a4b3a") + rect(x - w * 0.42 + 2, y - h - 35, 66, 8, "#c9b48a");
      out += rect(x + w * 0.12, y - h - 34, 24, 34, "#6b6a5a", { rx: 3 });
      out += path("M" + n1(x + w * 0.12 + 6) + " " + n1(y - h - 34) + "l-6 -40M" + n1(x + w * 0.12 + 13) + " " + n1(y - h - 34) + "l2 -46M" + n1(x + w * 0.12 + 19) + " " + n1(y - h - 34) + "l8 -38", "none", { stroke: "#2b2622", "stroke-width": 2.4 });
      out += rect(x + w * 0.28, y - h - 7, 40, 7, "#2b2b2e", { rx: 2 });
      out += rect(x - w * 0.12, y - h - 3, 90, 3, "#f4ecda");
    }
    return out;
  };

  // A candle on a stand; the flame flickers.
  B.candle = function (defs, o) {
    var x = o.x, y = o.y;
    var out = "";
    if (o.lit !== false) out += tag("circle", { cx: x, cy: n1(y - 64), r: o.glow || 160, fill: X.rgrad(defs, [[0, "#ffd28a", 0.5], [0.4, "#ffc070", 0.16], [1, "#ffc070", 0]]), "class": "flicker" });
    out += rect(x - 16, y - 8, 32, 8, "#6b4a2a") + rect(x - 3, y - 40, 6, 32, "#6b4a2a") + rect(x - 12, y - 46, 24, 6, "#6b4a2a");
    out += rect(x - 6, y - 74, 12, 28, "#efe6d6");
    if (o.lit !== false) out += g({ "class": "flame", style: "transform-origin:" + x + "px " + n1(y - 76) + "px" },
      path(S([[x, y - 98], [x + 5, y - 84], [x + 3.5, y - 77], [x - 3.5, y - 77], [x - 5, y - 84]], true), "#ffcf6a") +
      path(S([[x, y - 90], [x + 2.5, y - 82], [x, y - 78], [x - 2.5, y - 82]], true), "#fff4cf"));
    return out;
  };

  // A bronze brazier (火盆) with embers.
  B.brazier = function (defs, o) {
    var x = o.x, y = o.y, w = o.w || 110;
    var out = "";
    if (o.lit !== false) out += tag("ellipse", { cx: x, cy: n1(y - 50), rx: n1(w * 1.6), ry: n1(w * 1.1), fill: X.rgrad(defs, [[0, "#ff9a4a", 0.35], [1, "#ff9a4a", 0]]), "class": "flicker" });
    out += path(P.poly([[x - w * 0.36, y], [x - w * 0.3, y - 20], [x + w * 0.3, y - 20], [x + w * 0.36, y]], true), "#4b3a2a");
    out += path(S([[x - w / 2, y - 52, 0], [x - w * 0.42, y - 22], [x + w * 0.42, y - 22], [x + w / 2, y - 52, 0]], true), "#7a5a34", { stroke: "#4a3420", "stroke-width": 2 });
    out += tag("ellipse", { cx: x, cy: n1(y - 52), rx: n1(w / 2), ry: 9, fill: o.lit !== false ? "#ff7a2a" : "#3a302a", "class": o.lit !== false ? "flicker" : null });
    if (o.lit !== false) out += tag("ellipse", { cx: x, cy: n1(y - 53), rx: n1(w * 0.3), ry: 5, fill: "#ffd27a", "class": "flicker" });
    return out;
  };

  // Bed curtains (帐子) between posts; `sleeper` adds a figure lying
  // behind the gauze.
  B.bed = function (defs, o) {
    var out = rect(o.x0, o.y1 - 70, o.x1 - o.x0, 70, o.wood || "#5a2e22");
    out += rect(o.x0 - 10, o.y0, 16, o.y1 - o.y0, o.wood || "#5a2e22") + rect(o.x1 - 6, o.y0, 16, o.y1 - o.y0, o.wood || "#5a2e22");
    out += rect(o.x0 - 14, o.y0 - 16, o.x1 - o.x0 + 28, 22, shade(o.wood || "#5a2e22", 0.1));
    if (o.sleeper) {
      var sy = o.y1 - 82;
      out += path(S([[o.x0 + 60, sy], [o.x0 + 70, sy - 34], [o.x0 + 110, sy - 40], [o.x0 + 250, sy - 30], [o.x1 - 70, sy - 26], [o.x1 - 40, sy - 6], [o.x1 - 50, sy + 4], [o.x0 + 60, sy + 4]], true), "#3a2a3a", { opacity: 0.55 });
      out += tag("circle", { cx: n1(o.x0 + 92), cy: n1(sy - 46), r: 24, fill: "#3a2a3a", opacity: 0.55 });
    }
    var gauze = X.grad(defs, 0, 0, 0, 1, [[0, o.curtain || "#e9b9b0", 0.78], [1, o.curtain || "#e9b9b0", 0.5]]);
    var mid = (o.x0 + o.x1) / 2;
    out += path(S([[o.x0 + 6, o.y0 + 6], [o.x0 + (mid - o.x0) * (o.open ? 0.45 : 1), o.y0 + 6], [o.x0 + (mid - o.x0) * (o.open ? 0.32 : 0.92), o.y1 - 70], [o.x0 + 6, o.y1 - 70]], true), gauze);
    out += path(S([[o.x1 - 6, o.y0 + 6], [o.x1 - (o.x1 - mid) * (o.open ? 0.45 : 1), o.y0 + 6], [o.x1 - (o.x1 - mid) * (o.open ? 0.32 : 0.92), o.y1 - 70], [o.x1 - 6, o.y1 - 70]], true), gauze);
    var folds = "";
    for (var i = 0; i < 12; i++) {
      var fx = o.x0 + 20 + i * (o.x1 - o.x0 - 40) / 11;
      folds += "M" + n1(fx) + " " + n1(o.y0 + 10) + "q8 " + n1((o.y1 - o.y0) * 0.4) + " 0 " + n1(o.y1 - o.y0 - 80);
    }
    out += path(folds, "none", { stroke: shade(o.curtain || "#e9b9b0", -0.2), "stroke-width": 1.5, opacity: 0.4 });
    out += path("M" + n1(o.x0 + 40) + " " + n1(o.y0 + 40) + "q-6 40 4 80M" + n1(o.x1 - 40) + " " + n1(o.y0 + 40) + "q6 40 -4 80", "none", { stroke: "#c9a45c", "stroke-width": 3 });
    return out;
  };

  // A parrot (鹦哥) on a stand, as she kept under her eaves.
  B.parrot = function (o) {
    var x = o.x, y = o.y;
    var out = path("M" + n1(x - 40) + " " + y + "h80M" + x + " " + y + "v120", "none", { stroke: "#5a3c22", "stroke-width": 4, "stroke-linecap": "round" });
    out += rect(x - 26, y + 120, 52, 8, "#5a3c22", { rx: 3 });
    out += path(S([[x - 6, y - 4], [x - 16, y - 30], [x - 12, y - 58], [x + 2, y - 70], [x + 14, y - 62], [x + 12, y - 40], [x + 6, y - 6]], true), o.color || "#6f9a4e");
    out += path(S([[x - 12, y - 30], [x - 30, y + 30], [x - 18, y + 34], [x - 4, y - 8]], true), shade(o.color || "#6f9a4e", -0.2));
    out += tag("circle", { cx: n1(x + 6), cy: n1(y - 60), r: 2.4, fill: "#1a1a1a" });
    out += path(S([[x + 14, y - 62], [x + 22, y - 58], [x + 14, y - 50]], true), "#c94a3a");
    return out;
  };

  // A boat at a ferry, low in the water.
  B.boat = function (o) {
    var x = o.x, y = o.y, w = o.w;
    var out = path(S([[x - w / 2, y - 14, 0], [x - w * 0.4, y + 8], [x + w * 0.4, y + 8], [x + w / 2, y - 18, 0]], true), o.color || "#4a3a2e");
    out += path(S([[x - w * 0.18, y - 12, 0], [x - w * 0.16, y - 52], [x, y - 64], [x + w * 0.16, y - 52], [x + w * 0.18, y - 12, 0]], true), o.cabin || "#3a2f28");
    if (o.snow) out += path(S([[x - w * 0.17, y - 50], [x, y - 66], [x + w * 0.17, y - 50], [x, y - 58]], true), "#f7fafd");
    return out;
  };

  // Tiny standing or kneeling figures for far-off scenes.
  B.tiny = function (o) {
    var x = o.x, y = o.y, s = o.s || 1, c = o.color || "#2a2622";
    if (o.kneel) {
      return path(S([[x - 10 * s, y], [x - 12 * s, y - 14 * s], [x - 4 * s, y - 24 * s], [x + 8 * s, y - 20 * s], [x + 12 * s, y - 6 * s], [x + 14 * s, y]], true), c) +
        tag("circle", { cx: n1(x + 6 * s), cy: n1(y - 27 * s), r: n1(4.4 * s), fill: o.head || "#e8dccb" });
    }
    return path(S([[x - 7 * s, y], [x - 6 * s, y - 26 * s], [x - 3 * s, y - 34 * s], [x + 3 * s, y - 34 * s], [x + 6 * s, y - 26 * s], [x + 8 * s, y]], true), c) +
      tag("circle", { cx: x, cy: n1(y - 39 * s), r: n1(4.6 * s), fill: o.head || "#e8dccb" });
  };

  // Two pots of white crab-apple (白海棠), the poetry club's subject.
  B.haitang = function (defs, o) {
    var x = o.x, y = o.y, s = o.s || 1;
    var out = path(P.poly([[x - 34 * s, y - 50 * s], [x + 34 * s, y - 50 * s], [x + 26 * s, y], [x - 26 * s, y]], true), "#3f6f7a") +
      rect(x - 38 * s, y - 56 * s, 76 * s, 8 * s, "#2f5a64", { rx: 2 });
    var br = X.branches({ x: x, y: y - 52 * s, angle: -Math.PI / 2, len: 70 * s, width: 5 * s, depth: 3, seed: o.seed || 3, spread: 0.7, kink: 0.6, moss: false });
    out += br.ink + X.blossoms(br.spots, { seed: (o.seed || 3) + 1, tip: 3, joint: 1, scatter: 18 * s, size: 9 * s, colors: ["#fbf8f2", "#f3eee6"], heart: "#d8b24a", bud: "#e9d9c9", leaf: "#6d8a52", leafRate: 0.4, buds: 0.1 });
    return out;
  };

  kit.buildings = B;
})(window.HonglouKit);
