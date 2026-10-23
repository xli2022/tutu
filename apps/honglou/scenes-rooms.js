/* ── 还泪记 · scenes: courts and rooms ────────────────────────────────────
   荣庆堂 (the grandmother's hall), 怡红院 from the gate and from inside,
   潇湘馆 in the snow and its study in four kinds of weather, and the open
   hall where the poetry club meets. Conventions as in scenes.js.         */
(function (kit) {
  "use strict";

  var P = kit.paint, X = kit.scenery, B = kit.buildings, SC = kit.scenes;
  var S = P.spline, path = P.path, g = P.g, tag = P.tag, shade = P.shade, n1 = P.n1;
  var layer = SC.layer, ground = SC.ground;
  var W = 1600, H = 900, BLEED = 60;

  function wallBand(defs, y0, y1, color) {
    return B.rect(-BLEED, y0, W + BLEED * 2, y1 - y0, X.grad(defs, 0, 0, 0, 1, [[0, shade(color, 0.04)], [1, shade(color, -0.08)]]));
  }

  // Floorboards or tiles in perspective, vanishing toward (vx, horizon).
  function floor(defs, y0, color, vx, tiles) {
    var out = B.rect(-BLEED, y0, W + BLEED * 2, H + BLEED - y0, X.grad(defs, 0, 0, 0, 1, [[0, shade(color, -0.1)], [1, shade(color, 0.06)]]));
    var lines = "";
    for (var i = -12; i <= 12; i++) lines += "M" + n1(vx + i * 40) + " " + y0 + "L" + n1(vx + i * 260) + " " + (H + BLEED);
    if (tiles) for (var k = 1; k < 7; k++) { var yy = y0 + Math.pow(k / 7, 1.6) * (H + BLEED - y0); lines += "M" + (-BLEED) + " " + n1(yy) + "H" + (W + BLEED); }
    return out + path(lines, "none", { stroke: shade(color, -0.3), "stroke-width": 1.2, opacity: 0.35 });
  }

  // A heavy valance across the top, like the curtain over a stage.
  function valance(defs, color) {
    var out = B.rect(-BLEED, -BLEED, W + BLEED * 2, BLEED + 26, X.grad(defs, 0, 0, 0, 1, [[0, shade(color, -0.3)], [1, color]]));
    var scal = "";
    for (var x = -BLEED; x < W + BLEED; x += 80) scal += "M" + x + " 26q40 26 80 0";
    out += path(scal + "V-" + BLEED + "H-" + BLEED + "Z", color);
    var tass = "";
    for (var x2 = -BLEED + 80; x2 < W + BLEED; x2 += 160) tass += B.rect(x2 - 3, 26, 6, 30, "#c9a45c") + tag("circle", { cx: x2, cy: 60, r: 6, fill: "#c9a45c" });
    return out + tass;
  }

  // The paulownia's big heart-shaped leaves.
  function heartLeaf(x, y, s, rot, color) {
    var pts = [[0, 0, 0], [-0.55, -0.35], [-0.6, -0.85], [-0.22, -1.05], [0, -0.82, 0], [0.22, -1.05], [0.6, -0.85], [0.55, -0.35]];
    var c = Math.cos(rot), sn = Math.sin(rot);
    var tp = pts.map(function (p) { return [x + (p[0] * c - p[1] * sn) * s, y + (p[0] * sn + p[1] * c) * s].concat(p.length > 2 ? [p[2]] : []); });
    return path(S(tp, true), color, { stroke: shade(color, -0.3), "stroke-width": 1 }) +
      path("M" + n1(x) + " " + n1(y) + "L" + n1(x + (0 * c - (-0.8) * sn) * s) + " " + n1(y + (0 * sn + (-0.8) * c) * s), "none", { stroke: shade(color, -0.25), "stroke-width": 1.2 });
  }

  // A hanging scroll's painting: one ink plum branch in flower.
  function plum(x, y) {
    var br = X.branches({ x: x - 10, y: y, angle: -1.3, len: 62, width: 5, depth: 4, seed: 23, spread: 0.55, kink: 0.6, moss: false, up: 0.5 });
    return br.ink + X.blossoms(br.spots, { seed: 2, tip: 2, joint: 1, scatter: 10, size: 6, colors: ["#c8453a", "#d96a5a"], heart: "#f2d27a", bud: "#a8352a", buds: 0.3 });
  }

  /* ── 荣庆堂: the grandmother's hall ─────────────────────────────────── */
  SC.SCENES.rongfu = function (v) {
    var night = v === "night";
    var L = [], d0 = [], d1 = [], d2 = [], d3 = [], dg = [], df = [];
    var paper = night ? "#2b3552" : "#f0e2bf";
    L.push(layer(0.08, d0,
      wallBand(d0, -BLEED, 760, "#cbb48a") +
      B.rect(-BLEED, 96, W + BLEED * 2, 46, "#2f5a64") + B.rect(-BLEED, 104, W + BLEED * 2, 8, "#c9a45c") + B.rect(-BLEED, 128, W + BLEED * 2, 6, "#c9a45c") +
      B.doors(d0, { x0: 70, x1: 1150, y0: 150, y1: 740, n: 8, wood: "#6b3a26", paper: paper, glow: night ? null : "#fff2c8" }) +
      B.plaque(d0, { x: 610, y: 66, w: 340, h: 72, text: "荣庆堂" })));
    L.push(layer(0.2, d1,
      B.screen(d1, { x: 610, y: 730, w: 560, h: 380, panels: 6, seed: 7 }) +
      B.rect(390, 650, 440, 70, "#5a2e1e", { rx: 4 }) + B.rect(380, 640, 460, 16, "#7a3e26", { rx: 3 }) +
      B.rect(560, 616, 100, 26, "#7a4a2a", { rx: 3 }) + B.rect(430, 610, 70, 34, "#a33a2e", { rx: 8 }) + B.rect(720, 610, 70, 34, "#a33a2e", { rx: 8 }) +
      B.lantern(d1, { x: 250, y: 60, s: 1.05, lit: night, cord: 40 }) + B.lantern(d1, { x: 970, y: 60, s: 1.05, lit: night, cord: 40 })));
    L.push(layer(0.34, d2,
      B.pillar(d2, 40, -BLEED, 770, 46, "#9a2f26") + B.pillar(d2, 1170, -BLEED, 770, 46, "#9a2f26") +
      B.rect(126, 640, 40, 120, "#4a2a1a") + B.haitang(d2, { x: 146, y: 640, s: 0.9, seed: 4 }) +
      B.rect(1040, 640, 40, 120, "#4a2a1a") + B.haitang(d2, { x: 1060, y: 640, s: 0.9, seed: 6 })));
    L.push(layer(0.5, d3,
      floor(d3, 760, "#3a3230", 610, true) +
      path(P.poly([[300, 790], [920, 790], [1060, 920], [160, 920]], true), "#8e2f2a", { opacity: 0.85 }) +
      path(P.poly([[330, 802], [890, 802], [1010, 912], [210, 912]], true), "none", { stroke: "#c9a45c", "stroke-width": 3, opacity: 0.7 })));
    if (night) {
      L.push(layer(0.2, dg,
        tag("circle", { cx: 250, cy: 150, r: 220, fill: X.rgrad(dg, [[0, "#ffc070", 0.4], [1, "#ffc070", 0]]), "class": "flicker" }) +
        tag("circle", { cx: 970, cy: 150, r: 220, fill: X.rgrad(dg, [[0, "#ffc070", 0.4], [1, "#ffc070", 0]]), "class": "flicker" }), { glow: true }));
    }
    L.push(layer(0.8, df, valance(df, "#7a2a22"), { front: true }));
    return { layers: L, fx: {}, light: night ? "night" : "" };
  };

  /* ── 怡红院 from outside: banana on one side, crab-apple on the other ── */
  SC.SCENES.yihong = function (v) {
    var night = v === "night";
    var L = [], d0 = [], d1 = [], d2 = [], d3 = [], dg = [], df = [];
    L.push(layer(0.1, d0,
      X.sky(d0, night ? [[0, "#101833"], [0.6, "#1f2c50"], [1, "#2c3a60"]] : [[0, "#c9dbe0"], [0.6, "#e6ead8"], [1, "#efe9d5"]]) +
      (night ? X.stars({ seed: 3, n: 40, x: -40, y: -40, w: 1680, h: 260 }) + X.moon(d0, 1040, 130, 40, {}) : X.cloud(d0, { x: 420, y: 110, w: 520, h: 70, seed: 6, color: "#ffffff", op: 0.7, blur: 12 })) +
      X.hills(d0, { seed: 61, y: 340, amp: 60, scale: 300, depth: 140, color: night ? "#0f1630" : "#8c9890", op: night ? 0.9 : 0.35, blur: 3 })));
    var crab = X.branches({ x: 1010, y: 420, angle: -1.75, len: 150, width: 16, depth: 5, seed: 42, spread: 0.7, kink: 0.6 });
    L.push(layer(0.22, d1,
      B.roof({ x: 640, y: 236, w: 520, h: 90, color: night ? "#262c40" : "#545a60" }) + B.rect(420, 236, 440, 120, night ? "#2a2a38" : "#d9cdb5") +
      X.banana({ x: 210, y: 420, h: 420, w: 22, seed: 5, color: night ? "#2f4a33" : "#6f9a4e", stem: night ? "#2a3a26" : "#7a8a4e" }) +
      X.banana({ x: 330, y: 430, h: 330, w: 18, seed: 9, color: night ? "#27402c" : "#5f8a44", stem: night ? "#2a3a26" : "#7a8a4e", angles: [-2.3, -1.8, -1.3, -0.85] }) +
      g({ "class": "sway-slow", style: "transform-origin:1010px 420px" }, crab.ink +
        X.blossoms(crab.spots, { seed: 3, tip: 4, joint: 2, scatter: 30, size: 8.5, colors: night ? ["#b56a7a", "#9e5466"] : ["#e8838f", "#d9606f", "#f2a9b3"], heart: "#f4d36a", bud: "#b3404f", leaf: night ? "#2f4a33" : "#7a9a52", leafRate: 0.4 }))));
    var gateGlow = night;
    L.push(layer(0.36, d2,
      B.wall(d2, { x0: -BLEED, x1: W + BLEED, y: 410, h: 330, color: night ? "#7a7c8c" : "#efe8da", tile: night ? "#2a2f40" : "#5d636b" }) +
      B.gate(d2, { x: 640, y: 740, w: 160, h: 220, door: "#5a2a22", glow: gateGlow, wall: night ? "#6e7080" : "#e9e2d2", tile: night ? "#262c40" : "#4f555c" }) +
      B.plaque(d2, { x: 640, y: 480, w: 150, h: 40, text: "怡红快绿", color: "#2a2a30" }) +
      B.lantern(d2, { x: 545, y: 500, s: 0.62, lit: night, cord: 22 }) + B.lantern(d2, { x: 735, y: 500, s: 0.62, lit: night, cord: 22 })));
    L.push(layer(0.5, d3,
      ground(d3, [[-BLEED, 740], [W + BLEED, 740]], night ? "#3a3d4a" : "#cfc8b4", night ? "#2a2c36" : "#b9b29c") +
      path(P.poly([[560, 742], [720, 742], [880, 910], [400, 910]], true), night ? "#4a4c58" : "#ddd6c4") +
      X.grass(-40, 746, 520, night ? "#2a3a2a" : "#7f8f56", 4, 26) + X.grass(800, 746, 860, night ? "#2a3a2a" : "#7f8f56", 6, 30)));
    if (night) {
      L.push(layer(0.36, dg,
        tag("ellipse", { cx: 640, cy: 640, rx: 120, ry: 170, fill: X.rgrad(dg, [[0, "#ffcf7a", 0.38], [1, "#ffcf7a", 0]]), "class": "flicker" }) +
        tag("circle", { cx: 545, cy: 545, r: 90, fill: X.rgrad(dg, [[0, "#ffb060", 0.35], [1, "#ffb060", 0]]), "class": "flicker" }) +
        tag("circle", { cx: 735, cy: 545, r: 90, fill: X.rgrad(dg, [[0, "#ffb060", 0.35], [1, "#ffb060", 0]]), "class": "flicker" }), { glow: true }));
    }
    L.push(layer(0.88, df, X.grass(-40, 912, 1680, night ? "#1f2a22" : "#6f7d48", 13, 26, 34), { front: true }));
    return { layers: L, fx: night ? { fireflies: 10 } : {}, light: night ? "night" : "" };
  };

  /* ── 怡红院 within: the bed curtains, a round window onto banana leaves ─ */
  SC.SCENES.yihong_in = function (v) {
    var winter = v === "winter";
    var L = [], d0 = [], d1 = [], d2 = [], d3 = [], dg = [];
    var view = X.sky(d0, winter ? [[0, "#cfd6dc"], [1, "#eef1f2"]] : [[0, "#e8b98a"], [1, "#f3d9b4"]]) +
      (winter ? X.grove({ seed: 4, n: 4, x0: 220, x1: 460, y: 560, h: 420, w: 12, culm: "#7d8a72", leaf: ["#5f7360", "#6d806a"], snow: true, still: true }) :
        X.banana({ x: 300, y: 560, h: 420, w: 18, seed: 3, color: "#6f9a4e", still: true }));
    L.push(layer(0.08, d0,
      wallBand(d0, -BLEED, 760, "#d9c6ad") +
      B.rect(-BLEED, -BLEED, W + BLEED * 2, BLEED + 60, "#6b2a22") + B.rect(-BLEED, 52, W + BLEED * 2, 8, "#c9a45c") +
      B.lattice(d0, { x: 330, y: 360, r: 160, shape: "round", pattern: "ice", seed: 7, frame: "#5a2a22", view: view, rim: 14, bar: 3 }) +
      B.rect(560, 160, 120, 300, "#efe6d2", { stroke: "#5a2a22", "stroke-width": 6 }) + plum(600, 430)));
    L.push(layer(0.2, d1,
      B.bed(d1, { x0: 720, x1: 1180, y0: 120, y1: 760, curtain: winter ? "#d9b3ad" : "#e9a9a0", sleeper: !winter, open: winter }) +
      B.lantern(d1, { x: 600, y: 70, s: 0.9, lit: true, cord: 10 })));
    L.push(layer(0.36, d2,
      B.desk(d2, { x: 220, y: 790, w: 300, h: 120 }) +
      (winter ? B.brazier(d2, { x: 560, y: 830, w: 120 }) : "")));
    L.push(layer(0.5, d3, floor(d3, 760, "#5a3a2a", 560, false)));
    L.push(layer(0.3, dg,
      tag("circle", { cx: 600, cy: 160, r: 260, fill: X.rgrad(dg, [[0, "#ffc070", 0.32], [1, "#ffc070", 0]]), "class": "flicker" }) +
      (winter ? tag("ellipse", { cx: 560, cy: 780, rx: 240, ry: 160, fill: X.rgrad(dg, [[0, "#ff9a4a", 0.3], [1, "#ff9a4a", 0]]), "class": "flicker" }) : "") +
      tag("circle", { cx: 330, cy: 360, r: 220, fill: X.rgrad(dg, [[0, winter ? "#e8f0ff" : "#ffd9a0", 0.22], [1, "#ffffff", 0]]) }), { glow: true }));
    return { layers: L, fx: {}, light: winter ? "candle" : "dusk" };
  };

  /* ── 潇湘馆 in the snow: thousands of bamboo, a small house ──────────── */
  SC.SCENES.xiaoxiang = function () {
    var L = [], d0 = [], d1 = [], d2 = [], d3 = [], df = [];
    L.push(layer(0.1, d0,
      X.sky(d0, [[0, "#c3cad0"], [0.7, "#dde1e4"], [1, "#e9ebec"]]) +
      X.grove({ seed: 2, n: 22, x0: -40, x1: 1640, y: 470, h: 520, w: 10, culm: "#a7b0a6", leaf: ["#9aa69a", "#a9b3a8"], snow: true, still: true }) +
      X.mist(d0, 470, 160, "#e9ebec", 0.8)));
    var house = B.rect(520, 340, 420, 230, "#e9e4da") + B.roof({ x: 730, y: 340, w: 500, h: 96, color: "#5a6068", snow: true }) +
      B.lattice(d1, { x: 620, y: 440, r: 56, shape: "round", pattern: "ice", seed: 3, frame: "#5a4a3a", behind: "#4a4238", rim: 7, bar: 2.4 }) +
      B.rect(770, 400, 90, 170, "#4a2e22") + B.rect(812, 400, 6, 170, "#2a1a14") +
      B.rect(500, 562, 460, 18, "#b8b2a4") + B.rect(490, 578, 480, 14, "#a9a294");
    L.push(layer(0.24, d1, house + B.parrot({ x: 990, y: 430 })));
    L.push(layer(0.38, d2,
      X.grove({ seed: 11, n: 8, x0: -40, x1: 420, y: 640, h: 560, w: 15, culm: "#6f8a52", leaf: ["#4a6a42", "#5a7a4c"], snow: true }) +
      X.grove({ seed: 13, n: 6, x0: 1040, x1: 1460, y: 640, h: 520, w: 14, culm: "#6f8a52", leaf: ["#4a6a42", "#5a7a4c"], snow: true })));
    var pathStones = "";
    var pr = P.rng(8);
    for (var i = 0; i < 9; i++) {
      var t = i / 8, px = 815 - Math.sin(t * 2.6) * 160 * t, py = 600 + t * 300;
      pathStones += tag("ellipse", { cx: n1(px), cy: n1(py), rx: n1(26 + t * 40), ry: n1(7 + t * 12), fill: "#a9a59a", opacity: 0.9 });
      pathStones += tag("ellipse", { cx: n1(px), cy: n1(py - 3), rx: n1(22 + t * 36), ry: n1(4 + t * 8), fill: "#f6f8fa" });
      if (pr() < 0.3) pathStones += "";
    }
    L.push(layer(0.52, d3,
      ground(d3, [[-BLEED, 600], [W + BLEED, 600]], "#f2f4f5", "#e2e6ea") + pathStones +
      X.rock(d3, { x: 330, y: 800, w: 120, h: 150, seed: 5, color: "#9da0a0", holes: 1, snow: true })));
    L.push(layer(0.9, df, X.bamboo({ x: -30, y: 930, h: 980, w: 22, lean: 0.06, seed: 77, culm: "#5f7a48", leaf: ["#3e5c37", "#4f6f43"], snow: true, from: 0.2, leafSize: 1.25 }), { front: true }));
    return { layers: L, fx: { snow: 100 }, light: "snow" };
  };

  /* ── 潇湘馆 within: a round window of bamboo, a desk, a candle ────────
     day · night (bamboo shadows on the window paper) · rain · winter    */
  SC.SCENES.xiaoxiang_in = function (v) {
    var night = v === "night", rain = v === "rain", winter = v === "winter", day = !night && !rain && !winter;
    var L = [], d0 = [], d1 = [], d2 = [], d3 = [], dg = [];
    var skyStops = day ? [[0, "#dfe9df"], [1, "#f1f2e6"]] : rain ? [[0, "#5a6470"], [1, "#7d8690"]] : winter ? [[0, "#c9d0d6"], [1, "#e9edf0"]] : [[0, "#1a2340"], [1, "#2c3a5a"]];
    var view = X.sky(d0, skyStops) +
      X.grove({ seed: 21, n: 7, x0: 280, x1: 680, y: 620, h: 520, w: 13, culm: night ? "#2a3a30" : rain ? "#4a5a48" : "#6f8a52", leaf: night ? ["#1f2c24", "#26342a"] : rain ? ["#3a4a3a", "#465646"] : ["#4a6a42", "#5a7a4c", "#3e5c37"], snow: winter, still: true });
    if (rain) {
      var drops = "";
      var rr = P.rng(5);
      for (var i = 0; i < 70; i++) { var x = 260 + rr() * 440, y = 150 + rr() * 440; drops += "M" + n1(x) + " " + n1(y) + "l-5 28"; }
      view += g({ "class": "rainfall" }, path(drops, "none", { stroke: "#dfe6ee", "stroke-width": 1.3, opacity: 0.55 }));
    }
    if (night) view += X.moon(d0, 560, 220, 30, {});
    var shadow = "";
    if (night) {
      shadow = X.bamboo({ x: 380, y: 620, h: 560, w: 12, seed: 4, culm: "#141a24", leaf: ["#141a24"], still: true }) + X.bamboo({ x: 560, y: 640, h: 520, w: 10, seed: 6, culm: "#141a24", leaf: ["#141a24"], still: true });
    }
    L.push(layer(0.08, d0,
      wallBand(d0, -BLEED, 760, "#d6d8c8") +
      B.rect(-BLEED, -BLEED, W + BLEED * 2, BLEED + 50, "#4a3a2c") +
      B.lattice(d0, { x: 470, y: 380, r: 190, shape: "round", pattern: "ice", seed: 11, frame: "#4a3a2c", view: view, paper: night ? "#e9e1c6" : null, paperOp: 0.82, shadow: shadow, rim: 16, bar: 3 }) +
      B.rect(260, 160, 420, 34, "#b39a6a") + path((function () { var d = ""; for (var k = 0; k < 9; k++) d += "M260 " + (164 + k * 3.4) + "H680"; return d; })(), "none", { stroke: "#8a7448", "stroke-width": 1, opacity: 0.7 }) +
      B.rect(110, 180, 90, 330, "#efe8d6", { stroke: "#5a4a3a", "stroke-width": 4 }) +
      X.bamboo({ x: 155, y: 480, h: 260, w: 5, seed: 9, culm: "#3a3a36", leaf: ["#2e2e2a", "#3a3a36"], still: true, leafSize: 0.6 })));
    var shelf = B.rect(880, 200, 300, 540, "#5a3a26");
    [[260, 2], [380, 1], [500, 3], [620, 2]].forEach(function (row, i) {
      shelf += B.rect(890, row[0], 280, 10, "#3e2818");
      shelf += B.rect(900 + i * 20, row[0] - 60, 54, 60, "#3f5a78") + B.rect(960 + i * 10, row[0] - 48, 44, 48, "#8a4b3a") + B.rect(1060, row[0] - 70, 36, 70, "#c9b48a");
      shelf += tag("ellipse", { cx: 1130, cy: row[0] - 30, rx: 18, ry: 30, fill: i % 2 ? "#5d8f86" : "#e6e1d2" });
    });
    L.push(layer(0.2, d1, shelf));
    var lit = !day;
    L.push(layer(0.36, d2,
      B.desk(d2, { x: 470, y: 790, w: 440, h: 130 }) +
      B.candle(d2, { x: 650, y: 660, lit: lit, glow: 10 }) +
      (winter ? B.brazier(d2, { x: 790, y: 860, w: 130 }) : "")));
    L.push(layer(0.5, d3, floor(d3, 760, "#6a5038", 500, false)));
    if (lit) {
      L.push(layer(0.36, dg,
        tag("circle", { cx: 650, cy: 590, r: 300, fill: X.rgrad(dg, [[0, "#ffcf7a", 0.45], [0.5, "#ffb860", 0.12], [1, "#ffb860", 0]]), "class": "flicker" }) +
        (winter ? tag("ellipse", { cx: 790, cy: 800, rx: 260, ry: 170, fill: X.rgrad(dg, [[0, "#ff8a3a", 0.32], [1, "#ff8a3a", 0]]), "class": "flicker" }) : ""), { glow: true }));
    }
    return { layers: L, fx: {}, light: day ? "" : rain ? "rain" : "candle" };
  };

  /* ── The open hall of the poetry club, autumn ────────────────────────── */
  SC.SCENES.qiushuang = function () {
    var L = [], d0 = [], d1 = [], d2 = [], d3 = [], df = [];
    L.push(layer(0.1, d0,
      X.sky(d0, [[0, "#c6d6dd"], [0.6, "#e6e6d8"], [1, "#efe7d2"]]) +
      X.hills(d0, { seed: 81, y: 400, amp: 100, scale: 380, depth: 220, color: "#7f8a86", op: 0.4, blur: 4 }) +
      X.mist(d0, 430, 150, "#efe7d2", 0.8)));
    var tung = X.branches({ x: 300, y: 640, angle: -1.5, len: 230, width: 26, depth: 4, seed: 64, spread: 0.7, kink: 0.4, up: 0.4 });
    var leaves = "";
    var lr = P.rng(9);
    tung.spots.forEach(function (s) {
      if (s[1] > 420 || lr() < 0.35) return;
      leaves += heartLeaf(s[0] + (lr() - 0.5) * 30, s[1] + (lr() - 0.5) * 30, 34 + lr() * 18, (lr() - 0.5) * 1.6, ["#c9a24a", "#d8b45a", "#b9883a", "#a7a04a"][Math.floor(lr() * 4)]);
    });
    L.push(layer(0.24, d1,
      X.water(d1, { far: [[-BLEED, 560], [W + BLEED, 552]], near: [[-BLEED, 690], [W + BLEED, 690]], top: "#b4c3bd", bottom: "#cfd8cd", glint: "#fff", seed: 7, ripples: 40, y0: 562, y1: 680 }) +
      X.lotus({ seed: 3, n: 16, x0: 520, x1: 1000, y: 650, h: 110, stem: "#6a6248", pod: "#8a7a52", leaf: ["#9a8a5a", "#8a7a4a", "#a79a6a"] }) +
      tung.ink + leaves +
      X.banana({ x: 1000, y: 650, h: 360, w: 18, seed: 12, color: "#7d9a52", torn: true, angles: [-2.2, -1.7, -1.25, -0.8] })));
    var hall = B.pillar(d2, 60, -BLEED, 780, 44, "#9a2f26") + B.pillar(d2, 1140, -BLEED, 780, 44, "#9a2f26") +
      B.rect(-BLEED, -BLEED, W + BLEED * 2, BLEED + 34, "#2f5a64") + B.rect(-BLEED, 20, W + BLEED * 2, 8, "#c9a45c") +
      B.lattice(d2, { x: 600, y: 64, r: 600, w: 1080, h: 64, shape: "rect", pattern: "grid", step: 26, frame: "#7a3e2a", behind: "rgba(0,0,0,0)", rim: 6, bar: 3 }) +
      B.railing({ x0: 82, x1: 1118, y: 760, h: 74, color: "#7b4a36", step: 74 });
    L.push(layer(0.38, d2, hall));
    L.push(layer(0.52, d3, floor(d3, 772, "#9a9284", 600, true)));
    var table = B.rect(260, 800, 680, 18, "#6b3a26", { rx: 3 }) + B.rect(276, 818, 648, 120, "#4e2a1c") +
      B.rect(430, 784, 160, 16, "#f2ead6") + B.rect(452, 776, 120, 10, "#f6efdc") +
      B.haitang(df, { x: 330, y: 802, s: 1, seed: 3 }) + B.haitang(df, { x: 860, y: 802, s: 1, seed: 8 }) +
      B.rect(640, 788, 44, 12, "#2b2b2e", { rx: 2 }) + path("M700 796l60 -8", "none", { stroke: "#2b2622", "stroke-width": 4, "stroke-linecap": "round" });
    L.push(layer(0.85, df, table, { front: true }));
    return { layers: L, fx: { leaves: 12 }, light: "" };
  };
})(window.HonglouKit);
