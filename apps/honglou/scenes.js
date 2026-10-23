/* ── 还泪记 · scenes ──────────────────────────────────────────────────────
   Every backdrop is a paper diorama: a few flat layers stacked at different
   depths, far ones washed in ink and blurred, near ones cut sharp. A scene
   is a function of its variant returning
     { layers: [{ depth, svg, front?, glow? }], fx, light, dream }
   in stage units (1600 × 900, drawn with a 60-unit bleed so the layers can
   drift for parallax without showing an edge).

     front  the layer stands in front of the figures (keep it low or at
            the edges, never across a face)
     glow   lamplight, moonlight: laid over the night tint with "screen"
            so it reads as light rather than paint

   The vertical text page covers the right quarter of the stage, so what
   matters is composed in the left three quarters.                        */
(function (kit) {
  "use strict";

  var P = kit.paint, X = kit.scenery, B = kit.buildings;
  var S = P.spline, path = P.path, g = P.g, tag = P.tag, shade = P.shade, n1 = P.n1;

  var W = 1600, H = 900, BLEED = 60;
  var VB = (-BLEED) + " " + (-BLEED) + " " + (W + BLEED * 2) + " " + (H + BLEED * 2);
  var SCENES = {};

  function layer(depth, defs, body, opts) {
    opts = opts || {};
    return {
      depth: depth, front: !!opts.front, glow: !!opts.glow,
      svg: '<svg class="layer-art" viewBox="' + VB + '" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        "<defs>" + defs.join("") + "</defs>" + body + "</svg>"
    };
  }

  function ground(defs, line, top, bottom) {
    var last = line[line.length - 1], first = line[0];
    return path(S(line, false) + "L" + last[0] + " " + (H + BLEED) + "L" + first[0] + " " + (H + BLEED) + "Z",
      X.grad(defs, 0, 0, 0, 1, [[0, top], [1, bottom]]));
  }

  // Ribbons tied on branches for the flower-god festival.
  function ribbons(spots, seed) {
    var r = P.rng(seed), s = "", cols = ["#c8453a", "#e3b34a", "#5d8f6a", "#4f6fa3", "#c76b9a"];
    spots.forEach(function (p) {
      if (p[2] !== -1 || r() > 0.32) return;
      var c = cols[Math.floor(r() * cols.length)], len = 26 + r() * 40, sw = (r() - 0.5) * 16;
      s += path(S([[p[0], p[1]], [p[0] + sw * 0.4, p[1] + len * 0.5], [p[0] + sw, p[1] + len]], false), "none", { stroke: c, "stroke-width": 3.2, "stroke-linecap": "round", opacity: 0.9 });
    });
    return g({ "class": "sway", style: "transform-origin:50% 0;animation-duration:4.5s" }, s);
  }

  // Snow lying along branch spines: pale strokes on the upper edges.
  function snowOnBranches(spots, seed) {
    var r = P.rng(seed), s = "";
    spots.forEach(function (p) {
      if (r() > 0.6) return;
      var l = 6 + r() * 16;
      s += path("M" + n1(p[0] - l) + " " + n1(p[1] - 2) + "q" + n1(l) + " -5 " + n1(l * 2) + " 0", "none", { stroke: "#f8fbfe", "stroke-width": n1(2.5 + r() * 3), "stroke-linecap": "round" });
    });
    return s;
  }

  /* ── 沁芳闸: the stream under the peach trees ─────────────────────────
     day · dusk · festival (芒种, ribbons and butterflies) · winter        */
  SCENES.qinfang = function (v) {
    var winter = v === "winter", dusk = v === "dusk", fest = v === "festival";
    var L = [], d0 = [], d1 = [], d2 = [], d3 = [], df = [];

    var skyStops = winter ? [[0, "#d9dde0"], [0.6, "#e8eaea"], [1, "#efefec"]] :
      dusk ? [[0, "#cfae98"], [0.5, "#e8c9a6"], [1, "#f1dfc2"]] : [[0, "#e2e1d2"], [0.6, "#eee9d9"], [1, "#f4eddd"]];
    L.push(layer(0.12, d0,
      X.sky(d0, skyStops) +
      (dusk ? X.moon(d0, 1180, 170, 34, { color: "#f6d8b0", halo: "#ffd9a8" }) : "") +
      X.hills(d0, { seed: 11, y: 330, amp: 120, scale: 520, depth: 260, color: winter ? "#8b949a" : "#7d8a8f", op: 0.5, blur: 4 }) +
      X.hills(d0, { seed: 23, y: 380, amp: 80, scale: 360, depth: 200, color: winter ? "#6f7a80" : "#5f6d70", op: 0.45, blur: 2 }) +
      X.mist(d0, 400, 170, winter ? "#eef0f0" : "#f2ecdd", 0.85)));

    var wallCol = "#efe8da", tile = "#5d636b";
    L.push(layer(0.25, d1,
      X.willow(d1, { x: 250, y: 430, h: 360, w: 12, seed: 5, strands: winter ? 0 : 34, colors: ["#8fa36a", "#a3b47a", "#7f9460"] }) +
      B.roof({ x: 470, y: 338, w: 230, h: 72, color: "#4f555c", snow: winter }) +
      B.wall(d1, { x0: -BLEED, x1: W + BLEED, y: 356, h: 130, color: wallCol, tile: tile, snow: winter,
        gate: { x: 1010, y: 452, r: 62 },
        windows: [{ x: 640, y: 418, r: 30, shape: "round", frame: "#6d6a63", behind: winter ? "#dfe3e4" : "#c9cdb8" }, { x: 1340, y: 418, r: 28, shape: "hex", pattern: "grid", frame: "#6d6a63", behind: "#c9cdb8" }] })));

    var waterTop = winter ? "#d7dde0" : "#b8c9c0", waterBot = winter ? "#e6eaeb" : "#d8e0d2";
    var floating = "";
    if (!winter) floating = X.scatter({ seed: 61, n: 26, x0: 0, x1: 1500, y0: 520, y1: 640, r: 3.4, colors: ["#f3b7bd", "#ea94a0"] });
    L.push(layer(0.38, d2,
      X.water(d2, { far: [[-BLEED, 492], [400, 484], [900, 498], [1300, 488], [W + BLEED, 494]], near: [[-BLEED, 652], [500, 662], [1000, 640], [W + BLEED, 656]],
        top: waterTop, bottom: waterBot, glint: "#ffffff", seed: 4, ripples: winter ? 20 : 70, y0: 505, y1: 640 }) + floating +
      B.bridge(d2, { x: 760, y: 478, w: 380, color: "#cfc6b4", snow: winter }) +
      X.rock(d2, { x: 300, y: 520, w: 90, h: 80, seed: 21, color: "#a9a99c", holes: 0, snow: winter }) +
      (winter ? "" : X.reeds({ seed: 8, n: 9, x0: 1040, x1: 1180, y: 520, h: 70, color: "#8a9566", plume: "#d8d2b8" }))));

    var tree = X.branches({ x: -20, y: 905, angle: -1.32, len: 290, width: 40, depth: 5, seed: 31, spread: 0.52, kink: 0.5, lean: 0.06, up: 0.55 });
    var high = function (s) { return s[1] < 430; };
    var flowers = winter ? snowOnBranches(tree.spots, 3) : X.blossoms(tree.spots, {
      seed: 8, tip: 6, joint: 2, scatter: 46, size: 11, colors: ["#f3b7bd", "#e98e9a", "#f6c9cc"], heart: "#b2434f", bud: "#c95767", leaf: "#93a86a", filter: high
    });
    var groundTop = winter ? "#f1f2f1" : "#d8d8b9", groundBot = winter ? "#e1e4e6" : "#c4c39c";
    var petals = winter ? X.scatter({ seed: 77, n: 40, x0: 0, x1: 1600, y0: 680, y1: 890, r: 6, colors: ["#ffffff", "#e9eef2"], op: 0.9 }) :
      X.scatter({ seed: 77, n: 120, x0: 0, x1: 1600, y0: 660, y1: 895, r: 4.2, colors: ["#f3b7bd", "#e98e9a", "#f7d2d4"] });
    L.push(layer(0.55, d3,
      ground(d3, [[-BLEED, 650], [300, 636], [700, 656], [1100, 640], [W + BLEED, 652]], groundTop, groundBot) + petals +
      X.grass(-20, 900, 1640, winter ? "#b9bfb4" : "#8c9a5e", 3, winter ? 20 : 70) +
      X.rock(d3, { x: 1110, y: 790, w: 150, h: 260, seed: 12, color: "#a9aba0", holes: 2, snow: winter }) +
      g({ "class": "sway-slow", style: "transform-origin:20px 900px" }, tree.ink + flowers + (fest ? ribbons(tree.spots, 4) : ""))));

    L.push(layer(0.9, df,
      X.grass(-40, 912, 320, winter ? "#c9cec7" : "#6f7d48", 9, 18, 40) + X.grass(1000, 912, 640, winter ? "#c9cec7" : "#6f7d48", 10, 16, 36),
      { front: true }));

    return {
      layers: L,
      fx: winter ? { snow: 90 } : fest ? { butterflies: 2 } : { petals: dusk ? 16 : 26 },
      light: dusk ? "dusk" : winter ? "snow" : ""
    };
  };

  /* ── 花冢: the flower mound on the hillside ──────────────────────────── */
  SCENES.huazhong = function () {
    var L = [], d0 = [], d1 = [], d2 = [], d3 = [], df = [];
    L.push(layer(0.12, d0,
      X.sky(d0, [[0, "#d9c7b2"], [0.55, "#ecdcc4"], [1, "#f3e6cf"]]) +
      X.cloud(d0, { x: 900, y: 120, w: 520, h: 70, seed: 3, color: "#fff6e8", op: 0.7, blur: 14 }) +
      X.hills(d0, { seed: 41, y: 360, amp: 110, scale: 420, depth: 240, color: "#7c8580", op: 0.45, blur: 4 }) +
      X.mist(d0, 420, 180, "#f3e6cf", 0.85)));
    L.push(layer(0.24, d1,
      X.water(d1, { far: [[-BLEED, 470], [1700, 462]], near: [[-BLEED, 520], [1700, 500]], top: "#b9c6bd", bottom: "#d5dccf", glint: "#fff", seed: 9, ripples: 30, y0: 470, y1: 505 }) +
      B.pavilion(d1, { x: 980, y: 478, w: 120, h: 92, roof: "#545a60", pillar: "#8c3b30", rail: "#7b4a36" }) +
      X.willow(d1, { x: 1210, y: 500, h: 300, w: 10, seed: 15, strands: 30, colors: ["#8fa36a", "#a3b47a"] }) +
      X.willow(d1, { x: 760, y: 492, h: 240, w: 8, seed: 19, strands: 20, colors: ["#94a870", "#a8b880"] })));
    var slope = [[-BLEED, 530], [200, 548], [460, 600], [760, 650], [1100, 690], [W + BLEED, 700]];
    var mx = 600;
    var mound = path(S([[mx - 90, 676], [mx - 60, 640], [mx, 624], [mx + 60, 638], [mx + 92, 676]], false) + "Z", "#a58f6e") +
      path(S([[mx - 80, 652], [mx - 20, 632], [mx + 50, 640]], false), "none", { stroke: "#8a7458", "stroke-width": 2, opacity: 0.6 }) +
      X.scatter({ seed: 5, n: 40, x0: mx - 80, x1: mx + 80, y0: 628, y1: 672, r: 4, colors: ["#f3b7bd", "#e98e9a", "#f7d2d4"] }) +
      B.rect(mx - 14, 596, 28, 46, "#b8b2a4", { rx: 3 });
    L.push(layer(0.4, d2,
      ground(d2, slope, "#cfc9a0", "#b9b48a") + mound +
      X.grass(-40, 600, 600, "#8c9a5e", 12, 40, 30)));
    var tree = X.branches({ x: 120, y: 760, angle: -1.3, len: 260, width: 30, depth: 5, seed: 57, spread: 0.62, kink: 0.6, lean: 0.08 });
    L.push(layer(0.58, d3,
      ground(d3, [[-BLEED, 720], [500, 740], [1000, 728], [W + BLEED, 744]], "#d1cca2", "#bdb88e") +
      X.scatter({ seed: 9, n: 160, x0: 0, x1: 1600, y0: 730, y1: 900, r: 4.4, colors: ["#f3b7bd", "#e98e9a", "#f7d2d4", "#f0e2d0"] }) +
      g({ "class": "sway-slow", style: "transform-origin:120px 760px" }, tree.ink + X.blossoms(tree.spots, { seed: 12, tip: 5, joint: 2, scatter: 40, size: 10, colors: ["#f3b7bd", "#e98e9a", "#f8d6d8"], heart: "#b2434f", bud: "#c95767", leaf: "#93a86a", filter: function (s) { return s[1] < 470; } })) +
      X.rock(d3, { x: 1060, y: 820, w: 130, h: 170, seed: 33, color: "#a8a596", holes: 1 })));
    L.push(layer(0.9, df, X.grass(-40, 912, 1680, "#6f7d48", 14, 30, 34), { front: true }));
    return { layers: L, fx: { petals: 36 }, light: "dusk" };
  };

  /* ── 灵河: the river of the spirit, by the Stone of Three Lives ───────
     Gold on indigo, the way a sutra is written on blue paper (泥金磁青).
     dawn (the prologue) · night (the title) · bloom (the true ending)   */
  SCENES.linghe = function (v) {
    var night = v === "night", bloom = v === "bloom";
    var gold = "#d8b46a", L = [], d0 = [], d1 = [], d2 = [], d3 = [], dg = [], df = [];
    var skyStops = night ? [[0, "#0d1430"], [0.55, "#1b2a55"], [1, "#2c3f75"]] :
      bloom ? [[0, "#1d2550"], [0.5, "#4a3f6e"], [1, "#b98a6a"]] : [[0, "#18224a"], [0.55, "#34477e"], [1, "#a98a8e"]];
    var far = X.sky(d0, skyStops);
    if (night) far += X.stars({ seed: 4, n: 120, x: -40, y: -40, w: 1680, h: 460 });
    far += X.moon(d0, night ? 1330 : 1180, night ? 250 : 190, night ? 92 : 48, night ? {} : { color: "#f6dcc0", halo: "#ffd6b0" });
    far += X.hills(d0, { seed: 71, y: 420, amp: 150, scale: 380, depth: 240, color: "#0c1230", op: 0.75, blur: 1.5, ridge: gold, ridgeW: 1.4, ridgeOp: 0.55 });
    far += X.hills(d0, { seed: 73, y: 480, amp: 90, scale: 300, depth: 200, color: "#0a0f28", op: 0.85, blur: 0.5, ridge: gold, ridgeW: 1.2, ridgeOp: 0.5 });
    L.push(layer(0.1, d0, far + X.mist(d0, 480, 120, "#9fb0d8", 0.35)));

    var clouds = X.xiangyun(d1, 260, 150, 1.25, { drift: true, fill: "#2a3a70" }) + X.xiangyun(d1, 860, 90, 0.9, { flip: true, drift: true, fill: "#2a3a70" }) +
      X.xiangyun(d1, 620, 300, 0.7, { drift: true, fill: "#2a3a70" }) + X.xiangyun(d1, 1480, 120, 1, { flip: true, drift: true, fill: "#2a3a70" });
    L.push(layer(0.2, d1, clouds));

    var river = X.water(d2, { far: [[-BLEED, 548], [500, 540], [1000, 556], [W + BLEED, 546]], near: [[-BLEED, 690], [600, 676], [1100, 698], [W + BLEED, 684]],
      top: "#26386e", bottom: "#3d5590", glint: gold, seed: 13, ripples: 80, y0: 556, y1: 684 });
    L.push(layer(0.36, d2, river + X.mist(d2, 560, 60, "#c8d3f0", 0.25)));

    // The bank, the Stone, the crimson pearl grass.
    var bank = ground(d3, [[-BLEED, 690], [400, 676], [800, 700], [1200, 686], [W + BLEED, 696]], "#1c2550", "#121a3c");
    bank += path(S([[-BLEED, 690], [400, 676], [800, 700], [1200, 686], [W + BLEED, 696]], false), "none", { stroke: gold, "stroke-width": 1.6, opacity: 0.6 });
    var stone = path(S([[300, 760], [296, 690], [330, 610], [400, 570], [470, 572], [522, 616], [540, 700], [532, 760]], true),
      X.grad(d3, 0, 0, 1, 1, [[0, "#e9efe6"], [0.6, "#bccdc4"], [1, "#7f9a95"]]), { stroke: gold, "stroke-width": 2 });
    stone += path(S([[338, 640], [372, 606], [420, 594]], false), "none", { stroke: "#ffffff", "stroke-width": 3, opacity: 0.5 });
    ["三", "生", "石"].forEach(function (c, i) {
      stone += tag("text", { x: 432, y: 640 + i * 34, "text-anchor": "middle", "font-family": "Ma Shan Zheng, serif", "font-size": 30, fill: "#8a6a3a", opacity: 0.55 }, c);
    });
    var grass = "";
    var gr = P.rng(5), berries = bloom ? 16 : 9;
    for (var i = 0; i < 7; i++) {
      var bx = 590 + i * 16 + gr() * 10, bh = 90 + gr() * 80, lean = (gr() - 0.5) * 0.6;
      var tip = [bx + lean * bh * 0.6, 742 - bh];
      grass += path(S([[bx, 744], [bx + lean * bh * 0.2, 742 - bh * 0.5], tip], false), "none", { stroke: "#6f9a6a", "stroke-width": 2.2 });
      grass += path(P.leaf(bx + lean * 20, 742 - bh * 0.4, -Math.PI / 2 + lean + (i % 2 ? 0.8 : -0.8), 30, 7), "#5f8a5c");
    }
    for (var b = 0; b < berries; b++) {
      var px = 586 + gr() * 120, py = 600 + gr() * 110;
      grass += tag("circle", { cx: n1(px), cy: n1(py), r: n1(4 + gr() * 3.5), fill: X.rgrad(d3, [[0, "#ffd9d9"], [0.3, "#e0475a"], [1, "#7e1620"]], 0.38, 0.32, 0.7), "class": "pulse", style: "animation-delay:-" + (gr() * 3).toFixed(1) + "s" });
    }
    if (bloom) {
      for (var f = 0; f < 3; f++) grass += X.blossom(600 + f * 40, 600 - f * 16, 13, f, "#e0475a", "#ffd27a");
    }
    L.push(layer(0.55, d3, bank + stone + grass + X.reeds({ seed: 31, n: 10, x0: 1040, x1: 1240, y: 700, h: 120, color: "#4c5f86", plume: gold })));

    // Light: the pearls and the stone glow through the night tint.
    L.push(layer(0.55, dg,
      tag("ellipse", { cx: 650, cy: 660, rx: 140, ry: 110, fill: X.rgrad(dg, [[0, "#ff6a7a", 0.35], [1, "#ff6a7a", 0]]), "class": "pulse" }) +
      tag("ellipse", { cx: 420, cy: 660, rx: 190, ry: 150, fill: X.rgrad(dg, [[0, "#d7f0e6", 0.22], [1, "#d7f0e6", 0]]) }),
      { glow: true }));
    L.push(layer(0.85, df, X.xiangyun(df, -20, 860, 1.4, { drift: true, fill: "#141c44", fillOp: 0.8 }) + X.xiangyun(df, 1180, 880, 1.2, { flip: true, drift: true, fill: "#141c44", fillOp: 0.8 }), { front: true }));

    return { layers: L, fx: { motes: bloom ? 70 : 46 }, light: "", dream: true };
  };

  /* ── 凹晶馆: the hollow by the pond, mid-autumn night ─────────────────── */
  SCENES.aojing = function () {
    var L = [], d0 = [], d1 = [], d2 = [], d3 = [], dg = [], df = [];
    L.push(layer(0.1, d0,
      X.sky(d0, [[0, "#0f1730"], [0.6, "#1f2c52"], [1, "#2e3e66"]]) +
      X.stars({ seed: 9, n: 50, x: -40, y: -40, w: 1680, h: 300, color: "#f3ecd8" }) +
      X.moon(d0, 610, 175, 74, {}) +
      X.cloud(d0, { x: 900, y: 230, w: 420, h: 40, seed: 2, color: "#9aa8c8", op: 0.35, blur: 8 })));
    var hill = X.hills(d1, { seed: 91, x0: -100, x1: 520, y: 360, amp: 140, scale: 260, depth: 160, color: "#141b33", op: 0.95, blur: 0.5 });
    var lights = "";
    [[150, 270], [190, 262], [230, 274]].forEach(function (p) { lights += tag("circle", { cx: p[0], cy: p[1], r: 3, fill: "#ffd27a", "class": "flicker" }); });
    L.push(layer(0.22, d1, hill + B.pavilion(d1, { x: 190, y: 300, w: 90, h: 64, roof: "#1e2438", pillar: "#3a2a2a", rail: "#2c2424", stone: "#3a3f52" }) + lights +
      X.hills(d1, { seed: 93, x0: 900, x1: 1700, y: 420, amp: 70, scale: 300, depth: 120, color: "#151c34", op: 0.9 })));
    var reflection = "";
    var rr = P.rng(4);
    for (var i = 0; i < 26; i++) {
      var y = 470 + i * 15, w = 70 - i * 1.6 + rr() * 30;
      reflection += tag("ellipse", { cx: n1(610 + (rr() - 0.5) * 30), cy: y, rx: n1(w), ry: 2.6, fill: "#fff1c8", opacity: n1(0.65 - i * 0.02) });
    }
    L.push(layer(0.36, d2,
      X.water(d2, { far: [[-BLEED, 440], [800, 446], [W + BLEED, 438]], near: [[-BLEED, 820], [W + BLEED, 820]], top: "#1c2a4c", bottom: "#2c3e66", glint: "#c9d6f0", seed: 6, ripples: 90, y0: 450, y1: 800 }) +
      g({ "class": "shimmer" }, reflection) +
      X.lotus({ seed: 7, n: 14, x0: 900, x1: 1240, y: 640, h: 120, stem: "#4a4a3a", pod: "#6a5e44", leaf: ["#4a4636", "#5a5240", "#3e3a2e"] }) +
      X.lotus({ seed: 8, n: 8, x0: -20, x1: 160, y: 600, h: 100, stem: "#4a4a3a", pod: "#6a5e44", leaf: ["#4a4636", "#5a5240"] })));
    // The stone terrace of 凹晶馆 where they stand, its railing behind them.
    var terrace = B.rect(-BLEED, 812, W + BLEED * 2, 120, X.grad(d3, 0, 0, 0, 1, [[0, "#5a5f70"], [1, "#3a3e4c"]])) +
      B.railing({ x0: -BLEED, x1: W + BLEED, y: 812, h: 60, color: "#6a6f80", step: 70 });
    var hall = B.pillar(d3, 1060, 330, 812, 18, "#4a3030") + B.pillar(d3, 1420, 330, 812, 18, "#4a3030") +
      B.rect(1060, 330, 360, 26, "#3a2a2a") +
      B.lattice(d3, { x: 1240, y: 370, r: 150, w: 330, h: 40, shape: "rect", pattern: "grid", step: 22, frame: "#3a2a2a", behind: "#1a2238", rim: 5, bar: 2.4 }) +
      B.railing({ x0: 1060, x1: 1420, y: 812, h: 70, color: "#5a4a4a", step: 60 }) +
      B.lantern(d3, { x: 1240, y: 420, s: 0.8, color: "#b23a32", lit: true, cord: 30 }) +
      B.roof({ x: 1240, y: 330, w: 440, h: 110, color: "#262c40" });
    L.push(layer(0.55, d3, terrace + hall));
    L.push(layer(0.55, dg,
      tag("circle", { cx: 610, cy: 175, r: 260, fill: X.rgrad(dg, [[0, "#fff0c8", 0.3], [1, "#fff0c8", 0]]) }) +
      tag("ellipse", { cx: 610, cy: 640, rx: 120, ry: 200, fill: X.rgrad(dg, [[0, "#fff0c8", 0.18], [1, "#fff0c8", 0]]) }) +
      tag("circle", { cx: 1240, cy: 470, r: 140, fill: X.rgrad(dg, [[0, "#ffc070", 0.4], [1, "#ffc070", 0]]), "class": "flicker" }), { glow: true }));
    L.push(layer(0.9, df, X.reeds({ seed: 12, n: 16, x0: -40, x1: 160, y: 910, h: 230, color: "#2a3048", plume: "#8a90a8" }), { front: true }));
    return { layers: L, fx: {}, light: "night" };
  };

  /* ── 白茫茫: the ferry in the snow ───────────────────────────────────── */
  SCENES.snow = function () {
    var L = [], d0 = [], d1 = [], d2 = [], df = [];
    L.push(layer(0.1, d0,
      X.sky(d0, [[0, "#dde1e4"], [0.6, "#eceeef"], [1, "#f4f5f5"]]) +
      X.hills(d0, { seed: 101, y: 470, amp: 70, scale: 420, depth: 120, color: "#a9b0b5", op: 0.35, blur: 5 }) +
      X.mist(d0, 470, 120, "#f4f5f5", 0.9)));
    L.push(layer(0.25, d1,
      X.water(d1, { far: [[-BLEED, 512], [800, 508], [W + BLEED, 514]], near: [[-BLEED, 600], [700, 612], [W + BLEED, 598]], top: "#c3cad0", bottom: "#d6dbdf", glint: "#ffffff", seed: 3, ripples: 30, y0: 515, y1: 600 }) +
      X.reeds({ seed: 5, n: 18, x0: 980, x1: 1300, y: 512, h: 60, color: "#8a8f8f", plume: "#e9ecec" })));
    var shore = ground(d2, [[-BLEED, 606], [500, 616], [900, 604], [W + BLEED, 612]], "#f8f9f9", "#eceff1");
    L.push(layer(0.42, d2, shore +
      B.boat({ x: 600, y: 602, w: 260, snow: true }) +
      B.tiny({ x: 500, y: 590, s: 1.5, kneel: true, color: "#b3241f" }) +
      B.tiny({ x: 790, y: 646, s: 1.45, color: "#3a3532" }) + B.tiny({ x: 826, y: 648, s: 1.4, color: "#5a5048" }) +
      X.reeds({ seed: 9, n: 12, x0: 40, x1: 260, y: 640, h: 90, color: "#7d8282", plume: "#eef0f0" })));
    L.push(layer(0.85, df, X.reeds({ seed: 14, n: 10, x0: 1000, x1: 1180, y: 912, h: 160, color: "#8a8f8f", plume: "#f3f4f4" }), { front: true }));
    return { layers: L, fx: { snow: 120 }, light: "snow" };
  };

  function build(name, variant) {
    var s = SCENES[name];
    return s ? s(variant || "") : null;
  }

  kit.scenes = { SCENES: SCENES, build: build, layer: layer, ground: ground, ribbons: ribbons, snowOnBranches: snowOnBranches, W: W, H: H, BLEED: BLEED };
})(window.HonglouKit);
