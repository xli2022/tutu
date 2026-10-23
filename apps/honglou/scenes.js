/* ── 还泪记 · scenes ──────────────────────────────────────────────────────
   Every backdrop is a paper diorama: a few flat layers stacked at different
   depths, far ones washed in ink and blurred, near ones cut sharp. Each
   scene is a function returning { layers: [{ depth, svg }], fx } in stage
   units (1600 × 900, drawn with a 60-unit bleed so the layers can drift
   for parallax without showing an edge).                                  */
(function (kit) {
  "use strict";

  var P = kit.paint;
  var S = P.spline, path = P.path, g = P.g, tag = P.tag, shade = P.shade, mix = P.mix;

  var W = 1600, H = 900, BLEED = 60;
  var VB = (-BLEED) + " " + (-BLEED) + " " + (W + BLEED * 2) + " " + (H + BLEED * 2);
  var INK = "#24211f";

  function layer(depth, defs, body, cls) {
    return {
      depth: depth,
      svg: '<svg class="layer-art' + (cls ? " " + cls : "") + '" viewBox="' + VB + '" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        "<defs>" + defs.join("") + "</defs>" + body + "</svg>"
    };
  }

  function blur(defs, sd) {
    var fid = P.id("bl");
    defs.push(tag("filter", { id: fid, x: "-20%", y: "-20%", width: "140%", height: "140%" },
      tag("feGaussianBlur", { stdDeviation: sd })));
    return "url(#" + fid + ")";
  }

  /* ── Sky, hills, mist ──────────────────────────────────────────────── */
  function sky(defs, stops) {
    var gid = P.id("sky");
    defs.push(P.linear(gid, 0, 0, 0, 1, stops));
    return tag("rect", { x: -BLEED, y: -BLEED, width: W + BLEED * 2, height: H + BLEED * 2, fill: "url(#" + gid + ")" });
  }

  // An ink-wash ridge: dark along the crest, fading downward, soft-edged.
  function hills(defs, o) {
    var r = P.rng(o.seed);
    var pts = [], step = 40, x;
    for (x = -BLEED - 40; x <= W + BLEED + 40; x += step) {
      var n = P.fbm(x / o.scale, o.seed * 0.37, 4, o.seed);
      var peak = Math.max(0, P.fbm(x / (o.scale * 0.45), 3.1, 3, o.seed + 9));
      pts.push([x, o.y - (n * 0.6 + peak * 0.9) * o.amp - r() * 3]);
    }
    var d = S(pts, false) + "L" + (W + BLEED + 40) + " " + (o.y + o.depth) + "L" + (-BLEED - 40) + " " + (o.y + o.depth) + "Z";
    var gid = P.id("hl");
    defs.push(P.linear(gid, 0, 0, 0, 1, [[0, o.color, o.op], [0.45, o.color, o.op * 0.55], [1, o.color, 0]]));
    return path(d, "url(#" + gid + ")", { filter: o.blur ? blur(defs, o.blur) : null });
  }

  function mist(defs, y, h, color, op) {
    var gid = P.id("ms");
    defs.push(P.linear(gid, 0, 0, 0, 1, [[0, color, 0], [0.5, color, op], [1, color, 0]]));
    return tag("rect", { x: -BLEED, y: y - h / 2, width: W + BLEED * 2, height: h, fill: "url(#" + gid + ")" });
  }

  /* ── Trees and flowers ─────────────────────────────────────────────── */

  // Recursive ink branches. Collects twig tips and joints for blossoms.
  function branches(o) {
    var r = P.rng(o.seed), out = [], spots = [];
    function grow(x, y, ang, len, wid, depth) {
      var segs = 4, pts = [[x, y]], cx = x, cy = y, a = ang;
      for (var i = 1; i <= segs; i++) {
        a += (r() - 0.5) * (o.kink || 0.5);
        cx += Math.cos(a) * len / segs;
        cy += Math.sin(a) * len / segs;
        pts.push([cx, cy]);
        if (depth < 3) spots.push([cx, cy, depth]);
      }
      out.push(path(P.stroke(pts, wid, wid * 0.82, wid * 0.62), o.color || INK));
      if (depth <= 0 || wid < 1.2) { spots.push([cx, cy, -1]); return; }
      var kids = r() < (o.fork3 || 0.25) ? 3 : 2;
      for (var k = 0; k < kids; k++) {
        var spread = (o.spread || 0.55) * (k === 0 ? -1 : k === 1 ? 1 : (r() - 0.5));
        var lean = o.lean || 0;
        grow(cx, cy, a + spread * (0.6 + r() * 0.7) + lean, len * (0.6 + r() * 0.22), wid * 0.62, depth - 1);
      }
    }
    grow(o.x, o.y, o.angle, o.len, o.width, o.depth);
    return { ink: out.join(""), spots: spots };
  }

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
      tag("circle", { cx: P.n1(x), cy: P.n1(y), r: P.n1(rad * 0.24), fill: heart });
  }

  function blossoms(spots, o) {
    var r = P.rng(o.seed), out = [];
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      var n = s[2] < 0 ? o.tip : o.joint;
      for (var k = 0; k < n; k++) {
        var x = s[0] + (r() - 0.5) * o.scatter, y = s[1] + (r() - 0.5) * o.scatter;
        var rad = o.size * (0.65 + r() * 0.55);
        var col = r() < 0.3 ? o.colors[1] : o.colors[0];
        if (r() < 0.16) {
          out.push(tag("ellipse", { cx: P.n1(x), cy: P.n1(y), rx: P.n1(rad * 0.32), ry: P.n1(rad * 0.46), fill: o.bud, transform: "rotate(" + Math.round(r() * 180) + " " + P.n1(x) + " " + P.n1(y) + ")" }));
        } else {
          out.push(blossom(x, y, rad, r() * 6.28, col, o.heart));
        }
        if (o.leaf && r() < 0.22) {
          var a = r() * 6.28;
          out.push(path(P.leaf(x, y, a, rad * 1.6, rad * 0.5), o.leaf));
        }
      }
    }
    return out.join("");
  }

  function willow(defs, o) {
    var r = P.rng(o.seed), out = [];
    var tr = branches({ x: o.x, y: o.y, angle: -Math.PI / 2 + (o.lean || 0), len: o.h * 0.42, width: o.w, depth: 3, seed: o.seed, spread: 0.45, kink: 0.35, color: o.ink || INK });
    out.push(tr.ink);
    // Long hanging strands from the crown.
    for (var i = 0; i < o.strands; i++) {
      var s = tr.spots[Math.floor(r() * tr.spots.length)];
      var x0 = s[0], y0 = s[1], len = o.h * (0.35 + r() * 0.45), sw = (r() - 0.5) * 30;
      var spine = [[x0, y0], [x0 + sw * 0.3, y0 + len * 0.3], [x0 + sw * 0.7, y0 + len * 0.65], [x0 + sw, y0 + len]];
      out.push(path(S(spine, false), "none", { stroke: o.color, "stroke-width": 1 + r() * 0.8, opacity: 0.55 + r() * 0.35 }));
      for (var k = 1; k < 9; k++) {
        var t = k / 9, px = x0 + sw * t, py = y0 + len * t;
        out.push(path(P.leaf(px, py, Math.PI / 2 + (r() - 0.5) * 1.2, 9 + r() * 6, 3), o.color, { opacity: 0.75 }));
      }
    }
    return g({ "class": "sway-slow", style: "transform-origin:" + o.x + "px " + o.y + "px" }, out.join(""));
  }

  /* ── Rocks, ground, water ──────────────────────────────────────────── */

  // A Taihu rock: a pierced, eroded stone with a few dry-brush texture strokes.
  function rock(defs, o) {
    var r = P.rng(o.seed), pts = [], steps = 22;
    for (var i = 0; i < steps; i++) {
      var a = i / steps * Math.PI * 2;
      var rr = 1 + 0.28 * P.noise1(i * 0.7, o.seed) + (r() - 0.5) * 0.1;
      var x = o.x + Math.cos(a) * o.w / 2 * rr;
      var y = o.y - o.h / 2 + Math.sin(a) * o.h / 2 * rr * (Math.sin(a) > 0 ? 0.9 : 1);
      pts.push([x, Math.min(y, o.y)]);
    }
    var d = S(pts, true);
    var holes = "";
    for (var h = 0; h < (o.holes || 3); h++) {
      var hx = o.x + (r() - 0.5) * o.w * 0.5, hy = o.y - o.h * (0.3 + r() * 0.45);
      holes += P.blob(hx, hy, 6 + r() * o.w * 0.06, 0.35, o.seed + h * 7, 10);
    }
    var gid = P.id("rk");
    defs.push(P.linear(gid, 0, 0, 1, 1, [[0, shade(o.color, 0.18)], [1, shade(o.color, -0.18)]]));
    var tex = "";
    for (var t = 0; t < 7; t++) {
      var sx = o.x + (r() - 0.5) * o.w * 0.7, sy = o.y - r() * o.h * 0.85;
      tex += path(P.stroke([[sx, sy], [sx + 6 + r() * 10, sy + 14 + r() * 18], [sx + 2, sy + 30 + r() * 20]], 0.4, 2.2, 0.3), INK, { opacity: 0.35 });
    }
    return path(d + holes, "url(#" + gid + ")", { "fill-rule": "evenodd", stroke: shade(o.color, -0.4), "stroke-width": 1.4 }) + tex;
  }

  function grass(x, y, w, color, seed, n) {
    var r = P.rng(seed), out = "";
    for (var i = 0; i < (n || 14); i++) {
      var bx = x + r() * w, h = 14 + r() * 26, lean = (r() - 0.5) * 0.9;
      out += path(P.stroke([[bx, y], [bx + lean * h * 0.5, y - h * 0.55], [bx + lean * h, y - h]], 2.4, 1.6, 0.1), color, { opacity: 0.8 });
    }
    return out;
  }

  function water(defs, o) {
    var gid = P.id("wt");
    defs.push(P.linear(gid, 0, 0, 0, 1, [[0, o.top], [1, o.bottom]]));
    var out = path(S(o.far, false) + "L" + o.near[o.near.length - 1][0] + " " + o.near[o.near.length - 1][1] + S(o.near.slice().reverse(), false).replace(/^M/, "L") + "Z", "url(#" + gid + ")");
    var r = P.rng(o.seed), rip = "";
    for (var i = 0; i < o.ripples; i++) {
      var y = o.y0 + r() * (o.y1 - o.y0), x = r() * W, len = 30 + r() * 120;
      rip += path("M" + P.n1(x) + " " + P.n1(y) + "q" + P.n1(len / 2) + " " + P.n1(-2 - r() * 2) + " " + P.n1(len) + " 0", "none", { stroke: o.glint, "stroke-width": 1 + r(), opacity: 0.25 + r() * 0.35, "stroke-linecap": "round" });
    }
    return out + g({ "class": "shimmer" }, rip);
  }

  /* ── Architecture ──────────────────────────────────────────────────── */

  // 粉墙黛瓦: a whitewashed garden wall under a grey tiled cap.
  function wall(defs, o) {
    var out = "";
    var gid = P.id("wl");
    defs.push(P.linear(gid, 0, 0, 0, 1, [[0, shade(o.color, 0.05)], [1, shade(o.color, -0.1)]]));
    out += tag("rect", { x: o.x0, y: o.y, width: o.x1 - o.x0, height: o.h, fill: "url(#" + gid + ")" });
    // Cap: eaves line, tile courses, ridge.
    var cap = o.tile;
    out += path(poly([[o.x0 - 10, o.y + 4], [o.x1 + 10, o.y + 4], [o.x1 + 4, o.y - 14], [o.x0 - 4, o.y - 14]]), cap);
    out += tag("rect", { x: o.x0 - 4, y: o.y - 24, width: o.x1 - o.x0 + 8, height: 10, fill: shade(cap, -0.15) });
    var ends = "";
    for (var x = o.x0; x < o.x1; x += 16) {
      ends += tag("circle", { cx: x + 8, cy: o.y + 5, r: 5.2, fill: shade(cap, -0.08) });
      ends += path("M" + (x + 8) + " " + (o.y - 13) + "V" + (o.y + 1), "none", { stroke: shade(cap, -0.3), "stroke-width": 1, opacity: 0.5 });
    }
    out += ends;
    // Shadow under the eaves.
    var sg = P.id("ws");
    defs.push(P.linear(sg, 0, 0, 0, 1, [[0, INK, 0.28], [1, INK, 0]]));
    out += tag("rect", { x: o.x0, y: o.y + 8, width: o.x1 - o.x0, height: 26, fill: "url(#" + sg + ")" });
    if (o.windows) {
      for (var i = 0; i < o.windows.length; i++) out += lattice(defs, o.windows[i]);
    }
    return out;
  }

  function poly(pts) { return P.poly(pts, true); }

  // A leaking window (漏窗) with a lattice pattern.
  function lattice(defs, o) {
    var cid = P.id("lc");
    var shape = o.round ? tag("circle", { cx: o.x, cy: o.y, r: o.r }) :
      tag("rect", { x: o.x - o.r, y: o.y - o.r * 0.75, width: o.r * 2, height: o.r * 1.5, rx: 6 });
    defs.push(tag("clipPath", { id: cid }, shape));
    var bars = "", step = o.r / 3.2;
    for (var k = -6; k <= 6; k++) {
      bars += path("M" + (o.x + k * step - o.r * 2) + " " + (o.y - o.r * 2) + "l" + (o.r * 4) + " " + (o.r * 4), "none", { stroke: o.frame, "stroke-width": 3.2 });
      bars += path("M" + (o.x + k * step + o.r * 2) + " " + (o.y - o.r * 2) + "l" + (-o.r * 4) + " " + (o.r * 4), "none", { stroke: o.frame, "stroke-width": 3.2 });
    }
    var inner = o.round ? tag("circle", { cx: o.x, cy: o.y, r: o.r, fill: o.behind }) :
      tag("rect", { x: o.x - o.r, y: o.y - o.r * 0.75, width: o.r * 2, height: o.r * 1.5, rx: 6, fill: o.behind });
    var rim = o.round ? tag("circle", { cx: o.x, cy: o.y, r: o.r, fill: "none", stroke: o.frame, "stroke-width": 7 }) :
      tag("rect", { x: o.x - o.r, y: o.y - o.r * 0.75, width: o.r * 2, height: o.r * 1.5, rx: 6, fill: "none", stroke: o.frame, "stroke-width": 7 });
    return inner + g({ "clip-path": "url(#" + cid + ")" }, bars) + rim;
  }

  // A hip-and-gable roof with upturned eaves, seen from the front.
  function roof(o) {
    var x = o.x, y = o.y, w = o.w, h = o.h, c = o.color;
    var lift = o.lift == null ? h * 0.5 : o.lift;
    var d = S([[x - w / 2 - 18, y - lift, 0], [x - w / 2 + w * 0.08, y + 2], [x, y + 6], [x + w / 2 - w * 0.08, y + 2], [x + w / 2 + 18, y - lift, 0],
      [x + w / 2 - w * 0.06, y - h * 0.45], [x + w * 0.3, y - h, 0], [x - w * 0.3, y - h, 0], [x - w / 2 + w * 0.06, y - h * 0.45]], true);
    var lines = "";
    for (var i = 1; i < 14; i++) {
      var t = i / 14, lx = x - w * 0.42 + w * 0.84 * t;
      lines += path("M" + P.n1(lx) + " " + P.n1(y - h * 0.92) + "L" + P.n1(x + (lx - x) * 1.12) + " " + P.n1(y), "none", { stroke: shade(c, -0.3), "stroke-width": 1, opacity: 0.45 });
    }
    return path(d, c, { stroke: shade(c, -0.35), "stroke-width": 1.5 }) + lines +
      tag("rect", { x: P.n1(x - w * 0.32), y: P.n1(y - h - 6), width: P.n1(w * 0.64), height: 8, rx: 2, fill: shade(c, -0.25) });
  }

  // A low arched stone bridge with a railing.
  function bridge(defs, o) {
    var x = o.x, y = o.y, w = o.w, c = o.color;
    var deck = S([[x - w / 2 - 30, y + 26, 0], [x - w / 4, y + 2], [x, y - 6], [x + w / 4, y + 2], [x + w / 2 + 30, y + 26, 0],
      [x + w / 2 + 30, y + 44, 0], [x + w * 0.3, y + 44], [x + w * 0.22, y + 26], [x, y + 18], [x - w * 0.22, y + 26], [x - w * 0.3, y + 44], [x - w / 2 - 30, y + 44, 0]], true);
    var out = "";
    // Arch opening shadow.
    out += path(S([[x - w * 0.3, y + 44, 0], [x - w * 0.22, y + 26], [x, y + 18], [x + w * 0.22, y + 26], [x + w * 0.3, y + 44, 0]], true), shade(c, -0.55), { opacity: 0.5 });
    out += path(deck, c, { stroke: shade(c, -0.35), "stroke-width": 1.4, "fill-rule": "evenodd" });
    // Railing posts and rail.
    var rail = "";
    for (var i = 0; i <= 10; i++) {
      var t = i / 10, px = x - w / 2 + w * t, py = y - 6 + Math.pow((t - 0.5) * 2, 2) * 30;
      rail += tag("rect", { x: P.n1(px - 3), y: P.n1(py - 26), width: 6, height: 26, fill: shade(c, -0.12) });
    }
    rail += path(S([[x - w / 2, y + 2], [x, y - 28], [x + w / 2, y + 2]], false), "none", { stroke: shade(c, -0.2), "stroke-width": 5, "stroke-linecap": "round" });
    return out + rail;
  }

  /* ── 沁芳闸 · peach blossoms by the stream (spring) ───────────────────── */
  function qinfang(v) {
    var dusk = v === "dusk";
    var back = [], mid = [], near = [];
    var L = [];

    // Far: sky, hills, mist.
    L.push(layer(0.15, back,
      sky(back, dusk ? [[0, "#d9c3b0"], [0.55, "#ecd9c0"], [1, "#f1e3cb"]] : [[0, "#e4e1d3"], [0.6, "#efe9da"], [1, "#f4eddd"]]) +
      hills(back, { seed: 11, y: 330, amp: 120, scale: 520, depth: 260, color: "#7d8a8f", op: 0.55, blur: 4 }) +
      hills(back, { seed: 23, y: 380, amp: 80, scale: 360, depth: 200, color: "#5f6d70", op: 0.5, blur: 2 }) +
      mist(back, 400, 160, "#f2ecdd", 0.85)));

    // Middle: willows behind the wall, the wall, the bridge, the stream.
    var midBody =
      willow(mid, { x: 160, y: 420, h: 380, w: 12, seed: 5, strands: 26, color: "#8a9a6a" }) +
      willow(mid, { x: 1380, y: 420, h: 340, w: 10, seed: 9, strands: 22, color: "#94a370" }) +
      wall(mid, { x0: -BLEED, x1: W + BLEED, y: 352, h: 120, color: "#efe8da", tile: "#5d636b",
        windows: [{ x: 520, y: 412, r: 30, round: true, frame: "#6d6a63", behind: "#c9cdb8" }, { x: 1240, y: 412, r: 30, frame: "#6d6a63", behind: "#c9cdb8" }] }) +
      roof({ x: 980, y: 336, w: 220, h: 70, color: "#4f555c" }) +
      water(mid, { far: [[-BLEED, 486], [400, 478], [900, 492], [1300, 482], [W + BLEED, 488]], near: [[-BLEED, 640], [500, 652], [1000, 630], [W + BLEED, 646]],
        top: "#b8c9c0", bottom: "#d8e0d2", glint: "#ffffff", seed: 4, ripples: 70, y0: 500, y1: 630 }) +
      bridge(mid, { x: 900, y: 470, w: 360, color: "#cfc6b4" });
    L.push(layer(0.35, mid, midBody));

    // Near: the bank, a rock, the peach tree arching overhead.
    var bankG = P.id("bk");
    near.push(P.linear(bankG, 0, 0, 0, 1, [[0, "#d6d7b8"], [1, "#c4c39c"]]));
    var bank = path(S([[-BLEED, 642], [300, 628], [700, 650], [1100, 634], [W + BLEED, 646]], false) + "L" + (W + BLEED) + " " + (H + BLEED) + "L" + (-BLEED) + " " + (H + BLEED) + "Z", "url(#" + bankG + ")");
    var tree = branches({ x: 250, y: 900, angle: -1.25, len: 330, width: 34, depth: 5, seed: 31, spread: 0.6, kink: 0.55, lean: 0.12 });
    var flowers = blossoms(tree.spots.filter(function (s) { return s[1] < 640; }), {
      seed: 8, tip: 6, joint: 2, scatter: 46, size: 11, colors: ["#f3b7bd", "#e98e9a"], heart: "#b2434f", bud: "#c95767", leaf: "#93a86a"
    });
    var fallen = "";
    var rr = P.rng(77);
    for (var i = 0; i < 90; i++) {
      var fx = rr() * W, fy = 650 + rr() * 240;
      fallen += tag("ellipse", { cx: P.n1(fx), cy: P.n1(fy), rx: P.n1(3 + rr() * 3), ry: P.n1(1.6 + rr() * 1.6), fill: rr() < 0.5 ? "#f3b7bd" : "#e98e9a", opacity: 0.85, transform: "rotate(" + Math.round(rr() * 180) + " " + P.n1(fx) + " " + P.n1(fy) + ")" });
    }
    L.push(layer(0.6, near,
      bank + fallen +
      grass(-20, 900, 1640, "#8c9a5e", 3, 60) +
      rock(near, { x: 1290, y: 800, w: 230, h: 240, seed: 12, color: "#a9aba0", holes: 3 }) +
      g({ "class": "sway-slow", style: "transform-origin:250px 900px" }, tree.ink + flowers)));

    return { layers: L, fx: { petals: dusk ? 18 : 26 }, light: dusk ? "dusk" : "day" };
  }

  var SCENES = { qinfang: qinfang };

  function build(name, variant) {
    var s = SCENES[name];
    return s ? s(variant) : null;
  }

  kit.scenes = { SCENES: SCENES, build: build, W: W, H: H, BLEED: BLEED };
})(window.HonglouKit);
