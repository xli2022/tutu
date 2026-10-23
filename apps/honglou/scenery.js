/* ── 还泪记 · scenery ─────────────────────────────────────────────────────
   The pieces scenes are cut from: skies and ink-wash hills, clouds both
   soft and gilded, trees, bamboo, banana leaves, reeds, rocks and water;
   then walls, roofs, lattices, lanterns and the furniture of a room.

   Every generator returns an SVG string in stage units (1600 × 900 with a
   60-unit bleed) and takes a seed, so a scene looks the same each time.
   Gradients and filters a piece needs are pushed onto the `defs` array
   the scene passes in.                                                    */
(function (kit) {
  "use strict";

  var P = kit.paint;
  var S = P.spline, path = P.path, g = P.g, tag = P.tag, shade = P.shade, n1 = P.n1;

  var W = 1600, H = 900, BLEED = 60;
  var INK = "#24211f";
  var X = {};

  function blurF(defs, sd) {
    var fid = P.id("bl");
    defs.push(tag("filter", { id: fid, x: "-30%", y: "-30%", width: "160%", height: "160%" },
      tag("feGaussianBlur", { stdDeviation: sd })));
    return "url(#" + fid + ")";
  }
  X.blur = blurF;

  function grad(defs, x1, y1, x2, y2, stops) {
    var gid = P.id("gr");
    defs.push(P.linear(gid, x1, y1, x2, y2, stops));
    return "url(#" + gid + ")";
  }
  X.grad = grad;

  function rgrad(defs, stops, cx, cy, r) {
    var gid = P.id("rg");
    defs.push(P.radial(gid, cx == null ? 0.5 : cx, cy == null ? 0.5 : cy, r == null ? 0.5 : r, stops));
    return "url(#" + gid + ")";
  }
  X.rgrad = rgrad;

  /* ── Sky and distance ──────────────────────────────────────────────── */
  X.sky = function (defs, stops) {
    return tag("rect", { x: -BLEED, y: -BLEED, width: W + BLEED * 2, height: H + BLEED * 2, fill: grad(defs, 0, 0, 0, 1, stops) });
  };

  // An ink-wash ridge: dark along the crest, fading downward, soft-edged.
  X.hills = function (defs, o) {
    var r = P.rng(o.seed), pts = [], x;
    var x0 = o.x0 == null ? -BLEED - 40 : o.x0, x1 = o.x1 == null ? W + BLEED + 40 : o.x1;
    for (x = x0; x <= x1; x += 36) {
      var n = P.fbm(x / o.scale, o.seed * 0.37, 4, o.seed);
      var peak = Math.max(0, P.fbm(x / (o.scale * 0.45), 3.1, 3, o.seed + 9));
      pts.push([x, o.y - (n * 0.6 + peak * 0.9) * o.amp - r() * 3]);
    }
    var d = S(pts, false) + "L" + x1 + " " + (o.y + o.depth) + "L" + x0 + " " + (o.y + o.depth) + "Z";
    var fill = grad(defs, 0, 0, 0, 1, [[0, o.color, o.op], [0.45, o.color, o.op * 0.55], [1, o.color, 0]]);
    var out = path(d, fill, { filter: o.blur ? blurF(defs, o.blur) : null });
    if (o.ridge) out += path(S(pts, false), "none", { stroke: o.ridge, "stroke-width": o.ridgeW || 1.6, opacity: o.ridgeOp || 0.8 });
    return out;
  };

  X.mist = function (defs, y, h, color, op) {
    return tag("rect", { x: -BLEED, y: y - h / 2, width: W + BLEED * 2, height: h, fill: grad(defs, 0, 0, 0, 1, [[0, color, 0], [0.5, color, op], [1, color, 0]]) });
  };

  // A soft cloud of overlapping blurred ellipses.
  X.cloud = function (defs, o) {
    var r = P.rng(o.seed), s = "";
    for (var i = 0; i < (o.n || 6); i++) {
      s += tag("ellipse", { cx: n1(o.x + (r() - 0.5) * o.w), cy: n1(o.y + (r() - 0.5) * o.h * 0.5), rx: n1(o.w * (0.18 + r() * 0.2)), ry: n1(o.h * (0.3 + r() * 0.25)), fill: o.color, opacity: o.op || 0.6 });
    }
    return g({ filter: blurF(defs, o.blur || 10) }, s);
  };

  function spiral(cx, cy, rad, turns, dir, start) {
    var pts = [], steps = 26;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps, a = start + dir * t * turns * Math.PI * 2, rr = rad * (1 - t * 0.8);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return S(pts, false);
  }

  // 祥云: an auspicious cloud of three curls and a trailing tail, drawn
  // as gold line work over a faint body, for the dream.
  X.xiangyun = function (defs, x, y, s, o) {
    o = o || {};
    var color = o.color || "#d8b46a", w = (o.w || 2.2) * Math.max(0.6, s), dir = o.flip ? -1 : 1;
    function X1(v) { return x + v * s * dir; }
    var body = tag("ellipse", { cx: n1(x), cy: n1(y + 2 * s), rx: n1(62 * s), ry: n1(20 * s), fill: o.fill || "#3a4f86", opacity: o.fillOp == null ? 0.55 : o.fillOp });
    var line = { stroke: color, "stroke-width": n1(w), "stroke-linecap": "round", fill: "none" };
    var curls = [[-30, 2, 15, -1], [0, -10, 21, 1], [32, 1, 14, 1]];
    var out = body;
    curls.forEach(function (c) {
      out += path(spiral(X1(c[0]), y + c[1] * s, c[2] * s, 1.55, c[3] * dir, Math.PI / 2), "none", line);
    });
    out += path(S([[X1(46), y + 16 * s], [X1(10), y + 21 * s], [X1(-30), y + 19 * s], [X1(-70), y + 14 * s], [X1(-98), y + 3 * s], [X1(-104), y - 9 * s], [X1(-95), y - 15 * s], [X1(-87), y - 8 * s]], false), "none", line);
    return g({ "class": o.drift ? "drift" : null }, out);
  };

  X.moon = function (defs, x, y, rad, o) {
    o = o || {};
    var halo = rgrad(defs, [[0, o.halo || "#fff3d2", 0.45], [0.4, o.halo || "#fff3d2", 0.12], [1, o.halo || "#fff3d2", 0]]);
    var face = rgrad(defs, [[0, o.light || "#fffaf0"], [0.75, o.color || "#f3e7c8"], [1, shade(o.color || "#f3e7c8", -0.08)]], 0.42, 0.4, 0.62);
    var spots = "";
    var r = P.rng(o.seed || 3);
    for (var i = 0; i < 5; i++) {
      spots += tag("ellipse", { cx: n1(x + (r() - 0.5) * rad), cy: n1(y + (r() - 0.5) * rad), rx: n1(rad * (0.12 + r() * 0.16)), ry: n1(rad * (0.08 + r() * 0.12)), fill: "#c9b994", opacity: 0.18 });
    }
    return tag("circle", { cx: x, cy: y, r: n1(rad * 3.2), fill: halo }) +
      tag("circle", { cx: x, cy: y, r: rad, fill: face }) + spots;
  };

  X.stars = function (o) {
    var r = P.rng(o.seed), s = "";
    for (var i = 0; i < o.n; i++) {
      s += tag("circle", { cx: n1(o.x + r() * o.w), cy: n1(o.y + r() * o.h), r: n1(0.6 + r() * 1.6), fill: o.color || "#fff6dc", opacity: n1(0.35 + r() * 0.6), "class": r() < 0.4 ? "twinkle" : null, style: "animation-delay:" + (r() * 4).toFixed(1) + "s" });
    }
    return s;
  };

  /* ── Trees ─────────────────────────────────────────────────────────────
     Ink branches, recursively forked; thick limbs get dry-brush bark and
     the moss dots (点苔) a painter puts at the joints. Twig tips and
     joints are returned so blossoms and leaves can be hung on them.     */
  X.branches = function (o) {
    var r = P.rng(o.seed), out = [], moss = [], spots = [];
    var ink = o.color || INK;
    function grow(x, y, ang, len, wid, depth) {
      var segs = 4, pts = [[x, y]], cx = x, cy = y, a = ang;
      for (var i = 1; i <= segs; i++) {
        a += (r() - 0.5) * (o.kink || 0.5);
        if (o.up) a += (-Math.PI / 2 - a) * o.up * 0.15;
        cx += Math.cos(a) * len / segs;
        cy += Math.sin(a) * len / segs;
        pts.push([cx, cy]);
        if (depth < 3) spots.push([cx, cy, depth]);
      }
      out.push(path(P.stroke(pts, wid, wid * 0.82, wid * 0.62), ink));
      if (wid > 9) {
        for (var b = 0; b < 3; b++) {
          var t = 0.2 + r() * 0.6, k = Math.floor(t * segs), px = pts[k][0], py = pts[k][1];
          out.push(path(P.stroke([[px - wid * 0.2, py], [px + (r() - 0.5) * wid * 0.3, py + 10 + r() * 14]], 0.3, wid * 0.16, 0.2), o.bark || "#6b5d50", { opacity: 0.55 }));
        }
        if (r() < 0.8) moss.push([pts[2][0] + (r() - 0.5) * wid, pts[2][1] + (r() - 0.5) * wid, wid]);
      }
      if (depth <= 0 || wid < 1.2) { spots.push([cx, cy, -1]); return; }
      var kids = r() < (o.fork3 || 0.25) ? 3 : 2;
      for (var k2 = 0; k2 < kids; k2++) {
        var spread = (o.spread || 0.55) * (k2 === 0 ? -1 : k2 === 1 ? 1 : (r() - 0.5));
        grow(cx, cy, a + spread * (0.6 + r() * 0.7) + (o.lean || 0), len * (0.6 + r() * 0.22), wid * 0.62, depth - 1);
      }
    }
    grow(o.x, o.y, o.angle, o.len, o.width, o.depth);
    var dots = "";
    if (o.moss !== false) {
      moss.forEach(function (m) {
        for (var i = 0; i < 3; i++) {
          dots += tag("ellipse", { cx: n1(m[0] + (r() - 0.5) * m[2] * 1.4), cy: n1(m[1] + (r() - 0.5) * m[2]), rx: n1(1.4 + r() * 2.2), ry: n1(1.2 + r() * 1.4), fill: o.mossColor || "#3c4a2e", opacity: 0.85 });
        }
      });
    }
    return { ink: out.join("") + dots, spots: spots };
  };

  // A five-petalled blossom, cut from paper.
  function blossom(x, y, rad, rot, petal, heart) {
    var d = "";
    for (var i = 0; i < 5; i++) {
      var a = rot + i * Math.PI * 2 / 5;
      var c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
      var tip = [x + c * rad, y + s * rad];
      d += S([[x + c * rad * 0.2, y + s * rad * 0.2, 0],
        [x + c * rad * 0.62 + px * rad * 0.46, y + s * rad * 0.62 + py * rad * 0.46],
        [tip[0] + px * rad * 0.16, tip[1] + py * rad * 0.16, 0.6],
        [tip[0] - px * rad * 0.16, tip[1] - py * rad * 0.16, 0.6],
        [x + c * rad * 0.62 - px * rad * 0.46, y + s * rad * 0.62 - py * rad * 0.46]], true);
    }
    return path(d, petal, { stroke: shade(petal, -0.18), "stroke-width": 0.7 }) +
      tag("circle", { cx: n1(x), cy: n1(y), r: n1(rad * 0.24), fill: heart });
  }
  X.blossom = blossom;

  X.blossoms = function (spots, o) {
    var r = P.rng(o.seed), out = [];
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      if (o.filter && !o.filter(s)) continue;
      var n = s[2] < 0 ? o.tip : o.joint;
      for (var k = 0; k < n; k++) {
        var x = s[0] + (r() - 0.5) * o.scatter, y = s[1] + (r() - 0.5) * o.scatter;
        var rad = o.size * (0.65 + r() * 0.55);
        var col = o.colors[Math.floor(r() * o.colors.length)];
        if (r() < (o.buds == null ? 0.16 : o.buds)) {
          out.push(tag("ellipse", { cx: n1(x), cy: n1(y), rx: n1(rad * 0.32), ry: n1(rad * 0.46), fill: o.bud, transform: "rotate(" + Math.round(r() * 180) + " " + n1(x) + " " + n1(y) + ")" }));
        } else {
          out.push(blossom(x, y, rad, r() * 6.28, col, o.heart));
        }
        if (o.leaf && r() < (o.leafRate || 0.22)) {
          out.push(path(P.leaf(x, y, r() * 6.28, rad * 1.6, rad * 0.5), o.leaf));
        }
      }
    }
    return out.join("");
  };

  // Leaves hung on twigs (autumn foliage, crab-apple leaves...).
  X.foliage = function (spots, o) {
    var r = P.rng(o.seed), out = [];
    spots.forEach(function (s) {
      if (o.filter && !o.filter(s)) return;
      var n = s[2] < 0 ? o.tip : o.joint;
      for (var k = 0; k < n; k++) {
        var x = s[0] + (r() - 0.5) * o.scatter, y = s[1] + (r() - 0.5) * o.scatter;
        out.push(path(P.leaf(x, y, (o.angle == null ? r() * 6.28 : o.angle + (r() - 0.5) * 1.6), o.len * (0.7 + r() * 0.5), o.wid * (0.7 + r() * 0.5)), o.colors[Math.floor(r() * o.colors.length)], { opacity: o.op || 1 }));
      }
    });
    return out.join("");
  };

  X.willow = function (defs, o) {
    var r = P.rng(o.seed), out = [];
    var tr = X.branches({ x: o.x, y: o.y, angle: -Math.PI / 2 + (o.lean || 0), len: o.h * 0.42, width: o.w, depth: 3, seed: o.seed, spread: 0.5, kink: 0.35, color: o.ink || INK, moss: false });
    out.push(tr.ink);
    var tops = tr.spots.filter(function (s) { return s[2] <= 1; });
    for (var i = 0; i < o.strands; i++) {
      var s = tops[Math.floor(r() * tops.length)];
      var x0 = s[0] + (r() - 0.5) * 20, y0 = s[1], len = o.h * (0.3 + r() * 0.5), sw = (r() - 0.5) * 24 + (o.wind || 0);
      var spine = [[x0, y0], [x0 + sw * 0.15, y0 + len * 0.3], [x0 + sw * 0.55, y0 + len * 0.66], [x0 + sw, y0 + len]];
      var col = o.colors ? o.colors[Math.floor(r() * o.colors.length)] : o.color;
      out.push(path(S(spine, false), "none", { stroke: col, "stroke-width": n1(0.9 + r() * 0.7), opacity: 0.7 }));
      var leaves = "";
      for (var k = 2; k < 14; k++) {
        var t = k / 14, px = x0 + sw * t * t, py = y0 + len * t;
        leaves += path(P.leaf(px, py, Math.PI / 2 + (r() - 0.5) * 1.4, 7 + r() * 6, 2.6), col);
      }
      out.push(g({ opacity: n1(0.65 + r() * 0.35) }, leaves));
    }
    return g({ "class": "sway-slow", style: "transform-origin:" + o.x + "px " + o.y + "px" }, out.join(""));
  };

  /* ── Bamboo ────────────────────────────────────────────────────────────
     Segmented culms with dark nodes; side shoots at the upper nodes end in
     drooping leaf clusters of three and four blades, the 个 and 介 every
     painter of bamboo learns first.                                       */
  X.bamboo = function (o) {
    var r = P.rng(o.seed), out = [], leaves = [];
    var n = o.nodes || Math.max(5, Math.round(o.h / 64));
    var tipx = o.x + Math.sin(o.lean || 0) * o.h, tipy = o.y - Math.cos(o.lean || 0) * o.h;
    var bend = (r() - 0.5) * o.h * 0.07;
    var culm = o.culm || "#6f8a52", dark = shade(culm, -0.38);
    function at(t) { return [o.x + (tipx - o.x) * t + Math.sin(t * Math.PI) * bend, o.y + (tipy - o.y) * t]; }
    for (var i = 0; i < n; i++) {
      var t0 = i / n, t1 = (i + 1) / n - 0.008;
      var a = at(t0), b = at(t1), m = at((t0 + t1) / 2);
      var w0 = o.w * (1 - t0 * 0.5), w1 = o.w * (1 - t1 * 0.5);
      out.push(path(P.stroke([a, m, b], w0, (w0 + w1) / 2 * 0.96, w1), culm));
      out.push(path(P.stroke([[a[0] - w0 * 0.12, a[1]], [m[0] - w0 * 0.14, m[1]], [b[0] - w1 * 0.12, b[1]]], w0 * 0.18, w0 * 0.22, w1 * 0.18), shade(culm, 0.25), { opacity: 0.55 }));
      out.push(path("M" + n1(b[0] - w1 * 0.62) + " " + n1(b[1] + 1) + "q" + n1(w1 * 0.62) + " " + n1(-3) + " " + n1(w1 * 1.24) + " 0", "none", { stroke: dark, "stroke-width": n1(Math.max(1, w1 * 0.16)), "stroke-linecap": "round" }));
    }
    var leaf = o.leaf || ["#3e5c37", "#4f6f43", "#5f7f4c"];
    function cluster(x, y, side, size) {
      var k = r() < 0.5 ? 3 : 4;
      var base = Math.PI / 2 + side * (0.45 + r() * 0.5);
      for (var q = 0; q < k; q++) {
        var la = base + (q - (k - 1) / 2) * 0.34 + (r() - 0.5) * 0.15;
        var ll = (32 + r() * 26) * size, lw = (5.5 + r() * 3) * size;
        leaves.push(path(P.leaf(x, y, la, ll, lw), leaf[Math.floor(r() * leaf.length)]));
        if (o.snow && q === 0) leaves.push(path(P.leaf(x, y - 1, la - 0.08, ll * 0.7, lw * 0.6), "#f8fbff", { opacity: 0.9 }));
      }
    }
    var from = Math.floor(n * (o.from == null ? 0.38 : o.from));
    for (var j = from; j <= n; j++) {
      var p = at(Math.min(1, j / n));
      for (var side = -1; side <= 1; side += 2) {
        if (j < n && r() < 0.35) continue;
        var ang = -Math.PI / 2 + (o.lean || 0) + side * (0.55 + r() * 0.55);
        var len = (26 + r() * 64) * (1 - j / n * 0.35) * (o.reach || 1);
        var e = [p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len];
        var mid = [(p[0] + e[0]) / 2 + side * 4, (p[1] + e[1]) / 2 - 4];
        out.push(path(P.stroke([p, mid, e], 2.2, 1.5, 0.7), dark));
        cluster(e[0], e[1], side, o.leafSize || 1);
        if (r() < 0.6) cluster(mid[0], mid[1], side, (o.leafSize || 1) * 0.85);
      }
    }
    var cls = o.still ? null : "sway-slow";
    return g({ "class": cls, style: cls ? "transform-origin:" + n1(o.x) + "px " + n1(o.y) + "px;animation-delay:-" + (r() * 6).toFixed(1) + "s" : null }, out.join("") + leaves.join(""));
  };

  // A grove: many culms at different depths, the far ones paler.
  X.grove = function (o) {
    var r = P.rng(o.seed), s = "";
    for (var i = 0; i < o.n; i++) {
      var x = o.x0 + r() * (o.x1 - o.x0);
      s += X.bamboo({ x: x, y: o.y + (r() - 0.5) * (o.jitter || 20), h: o.h * (0.75 + r() * 0.35), w: o.w * (0.8 + r() * 0.4), lean: (r() - 0.5) * (o.lean || 0.14), seed: o.seed * 31 + i * 7, culm: o.culm, leaf: o.leaf, snow: o.snow, leafSize: o.leafSize, reach: o.reach, still: o.still });
    }
    return s;
  };

  /* ── Banana (芭蕉), reeds, lotus ───────────────────────────────────── */
  X.banana = function (o) {
    var r = P.rng(o.seed), out = [];
    var top = [o.x + (o.lean || 0) * o.h * 0.4, o.y - o.h * 0.42];
    out.push(path(P.stroke([[o.x, o.y], [(o.x + top[0]) / 2, (o.y + top[1]) / 2], top], o.w, o.w * 0.86, o.w * 0.7), o.stem || "#7a8a4e"));
    var col = o.color || "#6f9a4e";
    var angles = o.angles || [-2.5, -2.05, -1.62, -1.2, -0.75];
    angles.forEach(function (a0, i) {
      var len = o.h * (0.5 + r() * 0.3) * (i === 2 ? 1.08 : 1);
      var a = a0 + (r() - 0.5) * 0.15;
      var droop = 0.5 + r() * 0.35;
      var bx = top[0], by = top[1] + i * 3;
      var spine = [];
      for (var k = 0; k <= 10; k++) {
        var t = k / 10;
        var ang = a + droop * t * t * (Math.cos(a) > 0 ? 1 : -1);
        var px = bx + Math.cos(a) * len * t * 0.55 + Math.cos(ang) * len * t * 0.45;
        var py = by + Math.sin(a) * len * t * 0.55 + Math.sin(ang) * len * t * 0.45 + t * t * len * 0.18;
        spine.push([px, py]);
      }
      var left = [], right = [], wid = len * (o.wide || 0.16);
      for (var q = 0; q < spine.length; q++) {
        var t2 = q / (spine.length - 1);
        var p0 = spine[Math.max(0, q - 1)], p1 = spine[Math.min(spine.length - 1, q + 1)];
        var dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
        var w = wid * Math.sin(Math.min(1, t2 * 1.15) * Math.PI) * (t2 < 0.15 ? t2 / 0.15 : 1);
        var torn = o.torn && q > 2 && q < 9 && r() < 0.35 ? 0.55 : 1;
        left.push([spine[q][0] - dy / l * w * torn, spine[q][1] + dx / l * w * torn]);
        right.unshift([spine[q][0] + dy / l * w, spine[q][1] - dx / l * w]);
      }
      var shadeCol = i % 2 ? shade(col, -0.08) : shade(col, 0.06);
      out.push(path(S(left.concat(right), true), shadeCol, { stroke: shade(col, -0.3), "stroke-width": 1 }));
      out.push(path(S(spine, false), "none", { stroke: shade(col, 0.35), "stroke-width": 2.2, opacity: 0.8 }));
      var veins = "";
      for (var v = 2; v < 10; v++) {
        var sp = spine[v], lp = left[v];
        veins += "M" + n1(sp[0]) + " " + n1(sp[1]) + "L" + n1(lp[0] * 0.9 + sp[0] * 0.1) + " " + n1(lp[1] * 0.9 + sp[1] * 0.1);
      }
      out.push(path(veins, "none", { stroke: shade(col, -0.22), "stroke-width": 0.8, opacity: 0.5 }));
    });
    return g({ "class": o.still ? null : "sway-slow", style: "transform-origin:" + n1(o.x) + "px " + n1(o.y) + "px" }, out.join(""));
  };

  X.reeds = function (o) {
    var r = P.rng(o.seed), s = "";
    for (var i = 0; i < o.n; i++) {
      var x = o.x0 + r() * (o.x1 - o.x0), h = o.h * (0.6 + r() * 0.5), lean = (r() - 0.3) * 0.5;
      var tip = [x + lean * h * 0.5, o.y - h];
      s += path(S([[x, o.y], [x + lean * h * 0.12, o.y - h * 0.5], tip], false), "none", { stroke: o.color, "stroke-width": n1(1 + r()), opacity: 0.85 });
      var plume = "";
      for (var k = 0; k < 9; k++) {
        var a = Math.PI * 0.35 + lean + (r() - 0.5) * 1.1, l = 10 + r() * 16;
        plume += "M" + n1(tip[0]) + " " + n1(tip[1] + k * 2.5) + "q" + n1(Math.cos(a) * l * 0.5) + " " + n1(Math.sin(a) * l * 0.2) + " " + n1(Math.cos(a) * l) + " " + n1(Math.sin(a) * l);
      }
      s += path(plume, "none", { stroke: o.plume, "stroke-width": 1.4, opacity: 0.8, "stroke-linecap": "round" });
      s += path(P.leaf(x + lean * h * 0.05, o.y - h * 0.3, -Math.PI / 2 + lean + (r() < 0.5 ? -0.7 : 0.7), h * 0.35, 4), o.color, { opacity: 0.7 });
    }
    return g({ "class": "sway-slow", style: "transform-origin:" + n1((o.x0 + o.x1) / 2) + "px " + o.y + "px" }, s);
  };

  // Withered autumn lotus: bent stems, crumpled brown leaves, seed pods.
  X.lotus = function (o) {
    var r = P.rng(o.seed), s = "";
    for (var i = 0; i < o.n; i++) {
      var x = o.x0 + r() * (o.x1 - o.x0), h = o.h * (0.5 + r() * 0.6);
      var bend = (r() - 0.5) * 0.9;
      var top = [x + bend * h * 0.5, o.y - h];
      var broken = r() < 0.35;
      var tip = broken ? [top[0] + 30 * (bend > 0 ? 1 : -1), top[1] + 40] : top;
      s += path(S([[x, o.y], [x + bend * h * 0.1, o.y - h * 0.6], top].concat(broken ? [tip] : []), false), "none", { stroke: o.stem, "stroke-width": 2, opacity: 0.85 });
      if (r() < 0.45) {
        s += path(S([[tip[0] - 9, tip[1] - 2], [tip[0], tip[1] - 9], [tip[0] + 9, tip[1] - 2], [tip[0] + 6, tip[1] + 6], [tip[0] - 6, tip[1] + 6]], true), o.pod, { stroke: shade(o.pod, -0.3), "stroke-width": 1 });
      } else {
        var lw = 30 + r() * 30, rot = (r() - 0.5) * 1.2;
        var pts = [];
        for (var k = 0; k < 12; k++) {
          var a = k / 12 * Math.PI * 2;
          var rr = lw * (0.7 + r() * 0.45) * (k % 3 === 0 && r() < 0.5 ? 0.6 : 1);
          pts.push([tip[0] + Math.cos(a + rot) * rr, tip[1] + Math.sin(a + rot) * rr * 0.45 + (Math.sin(a + rot) > 0 ? lw * 0.15 : 0)]);
        }
        s += path(S(pts, true), o.leaf[Math.floor(r() * o.leaf.length)], { stroke: shade(o.leaf[0], -0.35), "stroke-width": 1, opacity: 0.92 });
        var veins = "";
        for (var v = 0; v < 6; v++) {
          var p = pts[v * 2];
          veins += "M" + n1(tip[0]) + " " + n1(tip[1]) + "L" + n1(p[0]) + " " + n1(p[1]);
        }
        s += path(veins, "none", { stroke: shade(o.leaf[0], -0.35), "stroke-width": 0.7, opacity: 0.5 });
      }
    }
    return s;
  };

  /* ── Rocks, ground, water ──────────────────────────────────────────── */

  // A Taihu rock: tall, waisted, pierced at uneven heights, with
  // contour strokes and moss. Holes never pair up side by side, so a
  // rock does not look back at you.
  X.rock = function (defs, o) {
    var r = P.rng(o.seed), pts = [], steps = 30;
    for (var i = 0; i < steps; i++) {
      var a = i / steps * Math.PI * 2, ny = Math.sin(a);
      var waist = 1 - 0.2 * Math.exp(-Math.pow((ny + 0.05) * 2.4, 2));
      var rr = 1 + 0.3 * P.noise1(i * 0.55 + o.seed * 0.7, o.seed) + (r() - 0.5) * 0.12;
      pts.push([o.x + Math.cos(a) * o.w / 2 * rr * waist, Math.min(o.y, o.y - o.h / 2 + ny * o.h / 2 * (0.94 + r() * 0.1))]);
    }
    var holes = "", rims = "", n = o.holes == null ? 2 : o.holes;
    for (var h = 0; h < n; h++) {
      var hy = o.y - o.h * (0.3 + 0.5 * (h + 0.3 + r() * 0.4) / Math.max(1, n));
      var hx = o.x + (h % 2 ? 0.16 : -0.14) * o.w + (r() - 0.5) * o.w * 0.12;
      var hr = o.w * (h === 0 ? 0.12 : 0.07) * (0.8 + r() * 0.4);
      var hp = [], hs = 9;
      for (var k = 0; k < hs; k++) {
        var ha = k / hs * Math.PI * 2, q = hr * (0.75 + r() * 0.5);
        hp.push([hx + Math.cos(ha) * q * 0.85, hy + Math.sin(ha) * q * 1.35]);
      }
      var hd = S(hp, true);
      holes += hd;
      rims += path(S(hp.slice(5).concat(hp.slice(0, 2)), false), "none", { stroke: shade(o.color, 0.3), "stroke-width": 2, opacity: 0.6 });
    }
    var fill = grad(defs, 0, 0, 1, 1, [[0, shade(o.color, 0.22)], [0.55, o.color], [1, shade(o.color, -0.25)]]);
    var tex = "";
    for (var t = 0; t < 7; t++) {
      var ty = o.y - o.h * (0.15 + r() * 0.7), tx = o.x + (r() - 0.5) * o.w * 0.6, tl = o.w * (0.15 + r() * 0.2);
      tex += path("M" + n1(tx) + " " + n1(ty) + "q" + n1(tl * 0.5) + " " + n1(-6 - r() * 8) + " " + n1(tl) + " " + n1(2 + r() * 6), "none", { stroke: shade(o.color, -0.45), "stroke-width": n1(1 + r() * 1.2), opacity: 0.45, "stroke-linecap": "round" });
    }
    for (var m = 0; m < 7; m++) {
      tex += tag("ellipse", { cx: n1(o.x + (r() - 0.5) * o.w * 0.7), cy: n1(o.y - o.h * (0.75 + r() * 0.2)), rx: n1(1.5 + r() * 2), ry: n1(1.2 + r()), fill: "#3c4a2e", opacity: 0.8 });
    }
    var snow = "";
    if (o.snow) {
      var topPts = pts.filter(function (p) { return p[1] < o.y - o.h * 0.6; }).sort(function (a, b) { return a[0] - b[0]; });
      if (topPts.length > 1) snow = path(S(topPts, false), "none", { stroke: "#fbfdff", "stroke-width": 8, "stroke-linecap": "round", opacity: 0.95 });
    }
    return path(S(pts, true) + holes, fill, { "fill-rule": "evenodd", stroke: shade(o.color, -0.45), "stroke-width": 1.4 }) + rims + tex + snow;
  };

  X.grass = function (x, y, w, color, seed, n, hmax) {
    var r = P.rng(seed), out = "";
    for (var i = 0; i < (n || 14); i++) {
      var bx = x + r() * w, h = 12 + r() * (hmax || 26), lean = (r() - 0.5) * 0.9;
      out += path(P.stroke([[bx, y], [bx + lean * h * 0.5, y - h * 0.55], [bx + lean * h, y - h]], 2.4, 1.6, 0.1), color, { opacity: 0.8 });
    }
    return out;
  };

  // Scattered fallen things: petals, leaves, snow lumps.
  X.scatter = function (o) {
    var r = P.rng(o.seed), s = "";
    for (var i = 0; i < o.n; i++) {
      var x = o.x0 + r() * (o.x1 - o.x0), y = o.y0 + r() * (o.y1 - o.y0);
      s += tag("ellipse", { cx: n1(x), cy: n1(y), rx: n1(o.r * (0.6 + r() * 0.8)), ry: n1(o.r * (0.3 + r() * 0.4)), fill: o.colors[Math.floor(r() * o.colors.length)], opacity: o.op || 0.85, transform: "rotate(" + Math.round(r() * 180) + " " + n1(x) + " " + n1(y) + ")" });
    }
    return s;
  };

  // A body of water between a far and a near shoreline, with ripples.
  X.water = function (defs, o) {
    var near = o.near.slice().reverse();
    var d = S(o.far, false) + "L" + n1(near[0][0]) + " " + n1(near[0][1]) + S(near, false).replace(/^M[^C]*/, "") + "Z";
    var out = path(d, grad(defs, 0, 0, 0, 1, [[0, o.top], [1, o.bottom]]));
    var r = P.rng(o.seed), rip = "";
    for (var i = 0; i < o.ripples; i++) {
      var y = o.y0 + r() * (o.y1 - o.y0), x = (o.x0 == null ? 0 : o.x0) + r() * ((o.x1 == null ? W : o.x1) - (o.x0 == null ? 0 : o.x0)), len = 30 + r() * 110;
      rip += path("M" + n1(x) + " " + n1(y) + "q" + n1(len / 2) + " " + n1(-2 - r() * 2) + " " + n1(len) + " 0", "none", { stroke: o.glint, "stroke-width": n1(0.8 + r()), opacity: n1(0.2 + r() * 0.35), "stroke-linecap": "round" });
    }
    return out + g({ "class": "shimmer" }, rip);
  };

  X.W = W; X.H = H; X.BLEED = BLEED; X.INK = INK;
  kit.scenery = X;
})(window.HonglouKit);
