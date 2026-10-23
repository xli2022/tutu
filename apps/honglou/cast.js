/* ── 还泪记 · cast ────────────────────────────────────────────────────────
   Who is who, dressed as the novel dresses them where it says:
     宝玉  束发嵌宝紫金冠, 二龙抢珠金抹额, 大红箭袖 under a 石青 jacket
           of eight roundels with a fringed hem, black boots with white
           soles, the jade on a five-coloured cord, a braid hung with pearls
     宝钗  蜜合色 jacket, 玫瑰紫 vest, 葱黄 skirt, and her golden locket
     凤姐  a red jacket with gold butterflies, a 石青 coat, a jade-green
           skirt, the five-phoenix pin hung with pearls, a ring of red gold
     黛玉  moon-white, bamboo at the hem, a crimson tassel; a crimson cloak
           lined with white fox in the snow
   and the rest in keeping with them. figures.js assembles the women; the
   one man is built here.                                                  */
(function (kit) {
  "use strict";

  var P = kit.paint, FG = kit.figures, Q = FG.parts;
  var S = P.spline, path = P.path, g = P.g, tag = P.tag, shade = P.shade;
  var piece = Q.piece, fold = Q.fold, INK = Q.INK;

  function merge(base, over) {
    var o = JSON.parse(JSON.stringify(base));
    for (var k in over) {
      if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k]) && o[k] && typeof o[k] === "object") {
        for (var j in over[k]) o[k][j] = over[k][j];
      } else o[k] = over[k];
    }
    return o;
  }

  /* ── 宝玉 ───────────────────────────────────────────────────────────── */
  var ROBE = [[186, 262], [166, 282], [156, 320], [154, 420], [150, 560], [146, 760], [144, 930, 0.5], [154, 944, 0], [262, 946, 0], [272, 930, 0.5], [262, 760], [254, 560], [248, 430], [250, 330], [236, 290], [214, 270]];
  var JACKET = [[184, 266], [162, 286], [154, 330], [152, 430], [148, 560], [142, 690, 0.5], [154, 702, 0], [252, 704, 0], [264, 690, 0.5], [256, 560], [248, 430], [250, 334], [236, 292], [212, 270]];
  var MAN_HAIR = [[228, 103], [236, 113], [226, 124], [218, 140], [214, 160], [212, 178], [204, 192], [194, 208], [186, 228], [172, 236], [152, 212], [143, 168], [148, 124], [166, 98], [192, 88], [214, 92]];
  var MAN_ARMS = {
    rest: { sleeve: [[184, 288], [212, 296], [226, 360], [232, 420], [244, 500], [252, 516, 0], [246, 530, 0], [222, 528, 0], [216, 500], [204, 430], [190, 370], [178, 330]],
      cuff: [[242, 498], [258, 512, 0], [252, 534, 0], [218, 532, 0], [218, 512]], hand: [[226, 532], [244, 532], [250, 550], [240, 560], [228, 554]] },
    book: { sleeve: [[184, 288], [212, 296], [224, 360], [230, 396], [262, 392], [276, 388, 0], [280, 414, 0], [264, 422], [230, 426], [208, 420], [192, 380], [178, 330]],
      cuff: [[270, 384], [286, 380, 0], [290, 418, 0], [272, 424, 0], [266, 404]], hand: [[284, 392], [300, 390], [306, 402], [298, 412], [286, 410]] },
    limp: { sleeve: [[184, 290], [210, 298], [220, 380], [226, 470], [234, 536, 0], [206, 544, 0], [198, 470], [186, 380], [176, 330]],
      cuff: [[232, 520], [240, 540, 0], [206, 548, 0], [200, 528]], hand: [[206, 548], [228, 546], [232, 566], [222, 576], [208, 570]] },
    ewer: { sleeve: [[184, 288], [212, 296], [226, 352], [236, 380], [262, 370], [276, 364, 0], [282, 392, 0], [266, 402], [232, 410], [208, 404], [192, 370], [178, 330]],
      cuff: [[270, 360], [288, 356, 0], [292, 396, 0], [272, 402, 0], [266, 382]], hand: [[284, 368], [300, 366], [306, 378], [298, 388], [286, 386]] }
  };

  function crown() {
    return path(S([[172, 86], [168, 66], [180, 50], [192, 40, 0], [204, 50], [214, 64], [210, 86]], true), "#d8b45a", { stroke: "#9a7a3a", "stroke-width": 1.2 }) +
      path(S([[178, 76], [186, 58], [192, 50], [198, 58], [206, 76]], false), "none", { stroke: "#9a7a3a", "stroke-width": 1 }) +
      tag("ellipse", { cx: 192, cy: 70, rx: 6, ry: 7.5, fill: "#7a3a8e", stroke: "#4a2a5a", "stroke-width": 1 }) +
      tag("circle", { cx: 189.5, cy: 67.5, r: 1.8, fill: "#e9c9f0", opacity: 0.8 });
  }

  function headband() {
    return path(S([[236, 116], [226, 112], [198, 108], [170, 114], [150, 128], [152, 138], [172, 126], [200, 120], [228, 124], [238, 124]], true), "#c9a45c", { stroke: "#8a6a2a", "stroke-width": 1 }) +
      path("M170 118q14 -6 28 -4M206 116q12 -2 24 4", "none", { stroke: "#8a2a22", "stroke-width": 1.6 }) +
      tag("circle", { cx: 233, cy: 120, r: 4.4, fill: "#f6f0e2", stroke: "#c9a45c", "stroke-width": 1 });
  }

  function hat() {
    return path(S([[96, 132, 0], [204, 40, 0], [314, 132, 0], [300, 140], [205, 126], [110, 140]], true), "#c2a868", { stroke: "#7a6a3a", "stroke-width": 1.6 }) +
      path("M140 120L204 46M170 128L204 46M238 128L204 46M268 120L204 46", "none", { stroke: "#8a7a4a", "stroke-width": 1, opacity: 0.7 }) +
      path("M206 130Q214 190 222 236", "none", { stroke: "#6a5a3a", "stroke-width": 1.4 });
  }

  // 蓑衣: a cape of straw, shaggy in layers.
  function strawCape(ctx) {
    var s = piece(ctx, S([[176, 248], [140, 300], [118, 420], [104, 560], [96, 700, 0.5], [150, 716], [230, 720], [286, 700, 0.5], [278, 560], [266, 420], [256, 310], [232, 262]], true), "#b9a46a", { light: 0.08 });
    var strands = "", r = P.rng(4);
    for (var row = 0; row < 7; row++) {
      var y = 300 + row * 62;
      for (var i = 0; i < 14; i++) {
        var x = 108 + i * 13 + (r() - 0.5) * 6 + (row % 2) * 6;
        strands += "M" + x.toFixed(1) + " " + y + "l" + ((r() - 0.5) * 6).toFixed(1) + " " + (50 + r() * 22).toFixed(1);
      }
    }
    return s + path(strands, "none", { stroke: "#7a6a3a", "stroke-width": 1.4, opacity: 0.55 });
  }

  function braid() {
    var s = "", y = 236;
    for (var i = 0; i < 9; i++) {
      s += tag("ellipse", { cx: 176 - i * 2.2, cy: y + i * 30, rx: 9 - i * 0.4, ry: 17, fill: "#1f2228", stroke: "#0f1115", "stroke-width": 1 });
    }
    s += tag("circle", { cx: 156, cy: 516, r: 4, fill: "#f6f0e2" }) + tag("circle", { cx: 156, cy: 528, r: 4, fill: "#f6f0e2" });
    s += path(S([[150, 534], [162, 534], [168, 590, 0], [144, 590, 0]], true), "#b23a32");
    return g({ "class": "sway-slow", style: "transform-origin:180px 236px" }, s);
  }

  function man(spec) {
    var ctx = Q.F([]), s = "";
    var robe = spec.robe || "#b23a32", jacket = spec.jacket || "#2f4f6f";
    if (spec.celestial) {
      s += g({ "class": "sway-slow", style: "transform-origin:170px 300px" },
        piece(ctx, S([[176, 300], [140, 380], [110, 520], [86, 700], [70, 880, 0.5], [60, 930, 0], [84, 890, 0.5], [104, 700], [130, 520], [160, 380], [196, 318]], true), "#d8b45a", { light: 0.15 }));
    }
    if (!spec.celestial) s += braid();
    // Boots, robe, jacket.
    s += path(S([[244, 944], [252, 978], [306, 980, 0], [300, 966], [270, 956], [262, 944]], true), "#1f1f22") + path("M252 976L306 978", "none", { stroke: "#f4f1ea", "stroke-width": 3 });
    s += path(S([[160, 944], [156, 978], [206, 980, 0], [204, 948]], true), "#1f1f22") + path("M156 977L206 979", "none", { stroke: "#f4f1ea", "stroke-width": 3 });
    s += piece(ctx, S(ROBE, true), robe);
    if (!spec.celestial) s += Q.motif(ctx, S(ROBE, true), "butterfly", shade(robe, 0.35), 3, [146, 700, 272, 944], 10);
    s += fold([[176, 720], [170, 830], [166, 930]], 2.2) + fold([[226, 720], [232, 830], [236, 930]], 2);
    if (spec.cape) s += strawCape(ctx);
    else if (!spec.celestial) {
      s += piece(ctx, S(JACKET, true), jacket);
      s += Q.motif(ctx, S(JACKET, true), "roundel", "#d8b45a", 21, [150, 330, 260, 690], 7);
      var fringe = "";
      for (var x = 152; x < 254; x += 7) fringe += "M" + x + " 704v14";
      s += path(fringe, "none", { stroke: "#d8b45a", "stroke-width": 2 });
      s += path(S([[214, 272], [234, 294], [244, 334], [242, 430], [250, 560], [258, 690, 0], [248, 696, 0], [240, 560], [232, 430], [232, 334], [222, 298], [206, 276]], true), shade(jacket, -0.3));
      // 宫绦: the sash with its long tassels.
      s += path(P.poly([[150, 424], [252, 424], [252, 438], [150, 438]], true), "#c9a45c");
      s += g({ "class": "sway", style: "transform-origin:250px 438px" }, path(S([[244, 438], [256, 438], [264, 600, 0], [240, 600, 0]], true), "#5d8f6a") + path("M246 600v26M252 600v30M258 600v26", "none", { stroke: "#c8453a", "stroke-width": 2 }));
    } else {
      s += path(S([[214, 272], [234, 294], [244, 334], [242, 430], [254, 600], [268, 930, 0], [256, 936, 0], [244, 600], [232, 430], [232, 334], [222, 298], [206, 276]], true), "#c9a45c");
    }
    s += path(S([[212, 262], [222, 274], [226, 290], [208, 284], [192, 272], [186, 262]], true), "#f7f4ee", { stroke: "#cfc6b6", "stroke-width": 1 });
    // The jade, on a five-coloured cord.
    if (spec.jade !== false && !spec.cape) {
      s += path("M200 276C212 300 226 318 238 334", "none", { stroke: "#c8453a", "stroke-width": 1.6 }) + path("M202 278C214 302 228 320 240 334", "none", { stroke: "#5d8f6a", "stroke-width": 1 });
      s += tag("ellipse", { cx: 242, cy: 346, rx: 8.5, ry: 12, fill: "#f2f4ea", stroke: "#a9c4b0", "stroke-width": 1.4 });
      s += tag("ellipse", { cx: 240, cy: 342, rx: 3, ry: 4, fill: "#ffffff", opacity: 0.8 });
    }
    // Head.
    var bow = spec.bow || 0, hs = "";
    hs += piece(ctx, S(Q.FACE, true), Q.SKIN, { light: 0.06, dark: -0.04, edge: "#c9b49c", edgeW: 1 });
    hs += piece(ctx, S(MAN_HAIR, true), "#1f2228", { light: 0.14, dark: 0, edge: "#0f1115" });
    if (!spec.hat) hs += piece(ctx, P.blob(190, 84, 18, 0.1, 2, 12), "#1f2228", { light: 0.14, dark: 0, edge: "#0f1115" });
    var bid = P.id("mb");
    ctx.defs.push(P.radial(bid, 0.5, 0.5, 0.5, [[0, "#e8a08c", 0.3], [1, "#e8a08c", 0]]));
    hs += tag("ellipse", { cx: 231, cy: 186, rx: 13, ry: 9, fill: "url(#" + bid + ")" });
    hs += path(P.stroke([[221, 145.5], [231, 141.8], [242, 144.2]], 0.8, 3.2, 0.6), "#24262c");
    hs += Q.eyes(ctx, spec.eyes || "open").replace(/^<path[^>]*>/, "");
    hs += path(S([[246.5, 193.5], [249.2, 194.3], [245.5, 197.2], [247.6, 201.2], [243.6, 200.4]], true), "#b5545a", { opacity: 0.8 });
    if (spec.smile) hs += path("M243 199q2 2 4 0", "none", { stroke: "#7a3a3a", "stroke-width": 1 });
    if (spec.hat) hs += hat();
    else if (spec.celestial) hs += Q.flower(192, 66, 9, "#f2f4ea", "#d8b45a") + path("M176 78L208 70", "none", { stroke: "#d8b45a", "stroke-width": 3 });
    else hs += crown() + headband();
    s += g({ transform: bow ? "rotate(" + bow + " " + Q.NECK[0] + " " + Q.NECK[1] + ")" : null }, hs);
    // The near arm.
    var a = MAN_ARMS[spec.arm || "rest"];
    s += piece(ctx, S(a.sleeve, true), spec.cape ? "#b9a46a" : spec.sleeve || robe);
    s += path(S(a.cuff, true), spec.cuff || shade(robe, -0.25));
    s += path(S(a.hand, true), Q.SKIN, { stroke: "#c9b49c", "stroke-width": 1 });
    if (spec.arm === "book") {
      s += path(S([[284, 380, 0], [318, 370, 0], [354, 382, 0], [354, 418, 0], [318, 406, 0], [284, 414, 0]], true), "#f4ecd8", { stroke: "#3f5a78", "stroke-width": 3 });
      s += path("M318 372V404M290 388h22M290 396h22M324 384h24M324 392h24", "none", { stroke: "#9a8a6a", "stroke-width": 1 });
    }
    if (spec.arm === "ewer") {
      s += path(S([[300, 338], [312, 330], [320, 344], [324, 372], [314, 392], [298, 392], [290, 372], [294, 346]], true), "#eef3ec", { stroke: "#a9c4b0", "stroke-width": 1.4 });
      s += path("M310 330q8 -24 24 -30", "none", { stroke: "#6f9a6a", "stroke-width": 2 }) + path(P.leaf(334, 300, -0.4, 22, 6), "#6f9a6a");
    }
    return { defs: ctx.defs.join(""), body: s };
  }

  /* ── The roster ────────────────────────────────────────────────────── */
  var DAI = {
    hair: { style: "high", color: "#1f2228" }, face: { eyes: "down" },
    dress: { robe: "long", color: "#e4eaeb", trim: "#4c5d6b", skirt: "#cfdacb", skirtHem: "#8ea38b", skirtMotif: "bamboo", scarf: "#d7c3cf", shoe: "#9e2a2b" },
    arm: "clasp", prop: "kerchief", pendant: "tassel"
  };
  var CHAI = {
    hair: { style: "side", color: "#1f2228" }, face: { eyes: "down" },
    dress: { robe: "short", color: "#e8d6ad", trim: "#b99a5a", vest: "#8e4c6b", vestHem: 760, vestMotif: "roundel", vestMotifColor: "#d8b45a", skirt: "#d6cf8c", skirtHem: "#a9a05a", shoe: "#7a3a4a" },
    arm: "clasp", pendant: "locket"
  };

  var C = FG.CAST;
  C.daiyu = { name: "黛玉", eye: [236, 162], poses: {
    calm: DAI,
    sad: merge(DAI, { bow: 6 }),
    weep: merge(DAI, { arm: "raise", prop: "tears", face: { eyes: "closed" }, bow: 4 }),
    hoe: merge(DAI, { arm: "shoulder", prop: "hoe" }),
    ill: merge(DAI, { bow: 8, arm: "droop", prop: null, wrap: { kind: "shawl", color: "#c9b8cf" }, face: { eyes: "down", blush: "#d9a0a8" }, skin: "#f3ebe2" }),
    cloak: merge(DAI, { bow: 4, wrap: { kind: "cloak", color: "#a8302f" } }),
    xian: { hair: { style: "fairy", color: "#1f2228", accent: "#e0475a" }, face: { eyes: "down" }, pendant: "tassel",
      dress: { robe: "trailing", color: "#f3f0ea", trim: "#c94450", scarf: "#e7b9c0", sleeve: "#f3f0ea", cuff: "#c94450" }, arm: "open" }
  } };
  C.baochai = { name: "宝钗", poses: { calm: CHAI, fan: merge(CHAI, { arm: "forward", prop: "fan" }) } };
  C.jiamu = { name: "贾母", scale: 0.96, poses: { calm: {
    hair: { style: "elder", color: "#a9a6a2", lock: false }, old: true, face: { eyes: "down", lips: "#9a5a5a", old: true }, skin: "#f1e3d1",
    dress: { robe: "gown", color: "#6b4a3a", trim: "#3a2a22", motif: "roundel", motifColor: "#c9a45c", motifN: 10, skirt: "#5a5a62", skirtHem: "#3a3a42", shoe: "#3a2a22" },
    arm: "forward", prop: "cane", bow: 5 } } };
  C.fengjie = { name: "凤姐", poses: { calm: {
    hair: { style: "phoenix", color: "#1f2228" }, face: { eyes: "open", lips: "#c0303a" },
    dress: { robe: "short", color: "#b3302c", trim: "#d8b45a", motif: "butterfly", motifColor: "#e3c26a", motifN: 16, vest: "#2f4f6f", vestHem: 600, vestMotif: "cloud", vestMotifColor: "#8fb0c8", skirt: "#5d8f6a", skirtMotif: "blossom", skirtHem: "#3f6f4a", shoe: "#b3302c" },
    arm: "forward", prop: "kerchief", pendant: "necklace" } } };
  C.tanchun = { name: "探春", poses: { calm: {
    hair: { style: "neat", color: "#1f2228" }, face: { eyes: "open" },
    dress: { robe: "long", color: "#d98e73", trim: "#8a3a2a", motif: "blossom", motifColor: "#f3c7b0", skirt: "#efe0c9", skirtHem: "#c9a98a", shoe: "#8a3a2a" },
    arm: "clasp", prop: "scroll" } } };
  C.xiangyun = { name: "湘云", poses: { calm: {
    hair: { style: "lively", color: "#1f2228" }, face: { eyes: "open", lips: "#c8404a" },
    dress: { robe: "short", color: "#d6626e", trim: "#8a2a32", motif: "blossom", motifColor: "#f2a9b3", skirt: "#f1e6dc", skirtMotif: "blossom", skirtHem: "#d9b9a9", shoe: "#d6626e", scarf: "#e9d39a" },
    arm: "forward", pendant: "qilin" } } };
  C.zijuan = { name: "紫鹃", scale: 0.95, poses: { calm: {
    hair: { style: "double", color: "#1f2228", ribbon: "#8f7aa8" }, face: { eyes: "down" },
    dress: { robe: "short", color: "#a593bf", trim: "#5e4a7a", vest: "#6e5a8e", vestHem: 640, skirt: "#e6e0ea", skirtHem: "#b8acc8", shoe: "#5e4a7a" },
    arm: "clasp", pendant: "ribbon" } } };
  C.jinghuan = { name: "警幻", scale: 1.04, poses: { calm: {
    hair: { style: "fairy", color: "#1f2228", gold: "#d8b45a", accent: "#7fb3c9" }, face: { eyes: "down" },
    dress: { robe: "trailing", color: "#efe3c4", trim: "#b8913a", motif: "cloud", motifColor: "#c9a45c", motifN: 18, scarf: "#9fb6d8", sleeve: "#efe3c4", cuff: "#b8913a" },
    arm: "open" } } };
  C.baoyu = { name: "宝玉", scale: 1.03, eye: [236, 160], build: man, poses: {
    calm: { arm: "rest" },
    book: { arm: "book", bow: 5, eyes: "down" },
    rain: { arm: "rest", cape: true, hat: true },
    dazed: { arm: "limp", bow: 9, jade: false, smile: true },
    shenying: { arm: "ewer", celestial: true, robe: "#f3f0ea", sleeve: "#f3f0ea", cuff: "#c9a45c", jade: false }
  } };
})(window.HonglouKit);
