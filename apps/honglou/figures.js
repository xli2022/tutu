/* ── 还泪记 · figures ─────────────────────────────────────────────────────
   The cast, cut from paper. Every figure stands in profile facing right in
   a 400 × 1000 box with the ground at y = 980; the stage mirrors a figure
   that should face left.

   A woman is assembled from parts that each character configures:
     hair     the bun and its ornaments (high, side, double, phoenix, ...)
     face     one profile; the eyes are open, lowered or closed
     dress    skirt, a long or short outer garment, an optional vest,
              colours, a trim and a motif scattered over the cloth
     arm      the near arm's pose (clasp, forward, raise, shoulder, open,
              droop) with its sleeve, hand and whatever the hand holds
   Each piece is a flat colour with a faint top-to-bottom light and a
   darker cut edge; folds are tapered ink strokes. cast.js adds the man
   and the roster.                                                         */
(function (kit) {
  "use strict";

  var P = kit.paint;
  var S = P.spline, path = P.path, g = P.g, tag = P.tag, shade = P.shade, n1 = P.n1;

  var INK = "#1f2228";
  var SKIN = "#f6eadb";
  var NECK = [205, 266];   // the head turns about this point

  function F(defs) { return { defs: defs, out: [] }; }

  // A paper piece: fill, a soft top-to-bottom light, and a cut edge.
  function piece(ctx, d, fill, opts) {
    opts = opts || {};
    var gid = P.id("pc");
    ctx.defs.push(P.linear(gid, 0, 0, 0, 1, [
      [0, shade(fill, opts.light == null ? 0.12 : opts.light)],
      [1, shade(fill, opts.dark == null ? -0.08 : opts.dark)]
    ]));
    return path(d, "url(#" + gid + ")", {
      stroke: opts.edge || shade(fill, -0.32),
      "stroke-width": opts.edgeW == null ? 1.3 : opts.edgeW,
      "stroke-linejoin": "round",
      opacity: opts.op == null ? null : opts.op
    });
  }

  function fold(spine, w, color, op) {
    return path(P.stroke(spine, 0.2, w, 0.2), color || INK, { opacity: op == null ? 0.2 : op });
  }

  // Scatter a small motif over the region drawn by `d`, clipped to it.
  function motif(ctx, d, kind, color, seed, box, n) {
    var cid = P.id("mt");
    ctx.defs.push(tag("clipPath", { id: cid }, path(d)));
    var r = P.rng(seed), s = "";
    for (var i = 0; i < n; i++) {
      var x = box[0] + r() * (box[2] - box[0]), y = box[1] + r() * (box[3] - box[1]), a = r() * 6.28;
      s += MOTIFS[kind](x, y, a, r);
    }
    return g({ "clip-path": "url(#" + cid + ")", fill: color, opacity: 0.8 }, s);
  }

  var MOTIFS = {
    bamboo: function (x, y, a) { return path(P.leaf(x, y, a, 16, 4)) + path(P.leaf(x, y, a + 0.5, 13, 3.4)) + path(P.leaf(x, y, a - 0.5, 12, 3.2)); },
    blossom: function (x, y, a) {
      var d = "";
      for (var k = 0; k < 5; k++) { var b = a + k * 1.2566; d += P.blob(x + Math.cos(b) * 3.2, y + Math.sin(b) * 3.2, 2.6, 0.1, k, 6); }
      return path(d);
    },
    roundel: function (x, y) {
      return tag("circle", { cx: n1(x), cy: n1(y), r: 9, fill: "none", stroke: "currentColor", "stroke-width": 1.6 }) + tag("circle", { cx: n1(x), cy: n1(y), r: 3.2 });
    },
    butterfly: function (x, y, a) {
      return path(P.leaf(x, y, a - 0.7, 9, 6) + P.leaf(x, y, a + 0.7, 9, 6) + P.leaf(x, y, a - 2.3, 6, 4) + P.leaf(x, y, a + 2.3, 6, 4));
    },
    cloud: function (x, y) { return path("M" + n1(x - 8) + " " + n1(y) + "q4 -8 8 0q4 -8 8 0q-8 6 -16 0z"); },
    dots: function (x, y) { return tag("circle", { cx: n1(x), cy: n1(y), r: 1.8 }); }
  };

  /* ── Head ──────────────────────────────────────────────────────────── */

  var FACE = [[212, 104], [233, 120], [241, 140], [240.5, 153, 0.5], [252, 175, 0.35], [245.5, 182, 0.5], [246.5, 189, 0.5], [249, 193, 0.4], [244.5, 197, 0.3], [247, 201.5, 0.4], [242, 207, 0.5], [244.5, 214], [238, 223], [224, 229], [216, 240], [212, 270], [182, 274], [184, 238], [192, 200], [198, 140]];
  var FACE_OLD = [[212, 104], [232, 120], [240, 140], [239.5, 153, 0.5], [250, 176, 0.4], [244, 183, 0.5], [244, 190, 0.5], [245.5, 194, 0.4], [242, 198, 0.3], [244, 202, 0.4], [240, 208, 0.5], [242, 216], [234, 226], [222, 232], [215, 244], [212, 270], [182, 274], [184, 238], [192, 200], [198, 140]];
  var HAIR = [[228, 103], [236, 113], [226, 124], [217, 140], [212, 160], [210, 182], [204, 198], [196, 212], [188, 232], [172, 240], [152, 214], [143, 168], [148, 124], [166, 98], [192, 88], [214, 92]];

  function eyes(ctx, kind, colorBrow) {
    var o = "";
    o += path(P.stroke([[222.5, 145.5], [231.5, 142.8], [241, 144.6]], 0.5, 2.2, 0.3), colorBrow || "#3a3f48", { opacity: 0.85 });
    if (kind === "closed") {
      o += path(P.stroke([[228, 159.5], [234, 162.6], [240, 161.8]], 0.4, 2.3, 0.4), INK);
    } else if (kind === "open") {
      o += path(P.stroke([[228.5, 156.6], [234, 155.4], [240, 157.8]], 0.5, 2.5, 0.6), INK);
      o += tag("ellipse", { cx: 236.6, cy: 159.3, rx: 1.9, ry: 2.4, fill: INK });
      o += path(P.stroke([[231, 161.6], [235.5, 162.4], [239, 161.4]], 0.2, 0.9, 0.2), INK, { opacity: 0.5 });
    } else {
      o += path(P.stroke([[227, 157.5], [234, 158.6], [240.5, 161]], 0.5, 2.6, 0.6), INK);
      o += path(S([[233, 159.5], [238.5, 161.2], [235, 162.4]], true), INK, { opacity: 0.7 });
    }
    return o;
  }

  function faceFeatures(ctx, o) {
    var s = "";
    var bid = P.id("bl");
    ctx.defs.push(P.radial(bid, 0.5, 0.5, 0.5, [[0, o.blush || "#e8828c", o.old ? 0.25 : 0.5], [1, o.blush || "#e8828c", 0]]));
    s += tag("ellipse", { cx: 231, cy: 185, rx: 13, ry: 9, fill: "url(#" + bid + ")" });
    s += eyes(ctx, o.eyes || "down", o.brow);
    s += path(S([[246.5, 193.5], [249.2, 194.3], [245.5, 197.2], [247.6, 201.2], [243.6, 200.4]], true), o.lips || "#b8424c", { opacity: 0.85 });
    if (o.old) {
      s += path("M222 168q5 6 3 14M236 214q-4 4 -9 4", "none", { stroke: "#a58a74", "stroke-width": 1, opacity: 0.6 });
    }
    return s;
  }

  /* ── Hair styles: the bun (behind), then ornaments (in front) ──────── */
  var HAIRSTYLES = {
    // 黛玉: a high bun with a single loop, a jade pin and a step-shaker.
    high: function (ctx, h) {
      return {
        back: piece(ctx, S([[150, 104], [140, 72], [152, 46], [180, 36], [204, 50], [206, 78], [190, 100]], true), h.color, { light: 0.12, dark: 0, edge: shade(h.color, -0.4) }) +
          path(S([[166, 54], [170, 26], [192, 14], [214, 24], [214, 50], [198, 62], [192, 54], [204, 44], [202, 30], [190, 26], [178, 34], [176, 56]], true), h.color, { stroke: shade(h.color, -0.4), "stroke-width": 1 }),
        front: pin(128, 86, 216, 62, "#c9a45c", "#7fb39b") + shaker(140, 84, ["#f2ede4", "#f2ede4", "#9e2a2b"])
      };
    },
    // 宝钗: a smooth chignon at the back, a gold pin with a flower head.
    side: function (ctx, h) {
      return {
        back: piece(ctx, S([[162, 92], [136, 98], [116, 124], [118, 156], [138, 176], [164, 170], [176, 140]], true), h.color, { light: 0.14, dark: 0, edge: shade(h.color, -0.4) }) +
          piece(ctx, S([[170, 96], [164, 70], [182, 56], [204, 64], [206, 88], [190, 100]], true), h.color, { light: 0.14, dark: 0, edge: shade(h.color, -0.4) }),
        front: pin(112, 140, 186, 104, "#d8b45a", "#e9c46a") + flower(118, 134, 7, "#e9c46a", "#c98a2a") +
          tag("circle", { cx: 196, cy: 66, r: 3.4, fill: "#f2ede4" }) + tag("circle", { cx: 204, cy: 74, r: 3, fill: "#f2ede4" })
      };
    },
    // A maid's two small buns tied with ribbon.
    double: function (ctx, h) {
      return {
        back: piece(ctx, P.blob(188, 84, 19, 0.12, 3, 12), h.color, { light: 0.14, dark: 0, edge: shade(h.color, -0.4) }) +
          piece(ctx, P.blob(158, 100, 18, 0.12, 5, 12), h.color, { light: 0.14, dark: 0, edge: shade(h.color, -0.4) }),
        front: g({ "class": "sway", style: "transform-origin:150px 104px" },
          path(S([[150, 104], [140, 140], [134, 176, 0], [146, 140], [156, 106]], true), h.ribbon || "#8f7aa8") +
          path(S([[156, 106], [158, 146], [156, 186, 0], [166, 146], [162, 106]], true), shade(h.ribbon || "#8f7aa8", -0.12))) +
          tag("circle", { cx: 200, cy: 80, r: 3.6, fill: h.ribbon || "#8f7aa8" })
      };
    },
    // 凤姐: a tall jewelled bun under a golden phoenix with strings of pearls.
    phoenix: function (ctx, h) {
      var pearls = "";
      for (var i = 0; i < 4; i++) {
        pearls += path("M" + (128 + i * 9) + " 74v" + (34 + i * 5), "none", { stroke: "#c9a45c", "stroke-width": 0.8 });
        pearls += tag("circle", { cx: 128 + i * 9, cy: 110 + i * 5, r: 2.8, fill: "#f6f0e2" }) + tag("circle", { cx: 128 + i * 9, cy: 96 + i * 4, r: 2.2, fill: "#f6f0e2" });
      }
      return {
        back: piece(ctx, S([[150, 102], [138, 66], [150, 34], [184, 22], [212, 40], [212, 74], [194, 98]], true), h.color, { light: 0.12, dark: 0, edge: shade(h.color, -0.4) }),
        front: path(S([[136, 60], [160, 46], [190, 40], [214, 30], [226, 36], [214, 46], [196, 54], [168, 64]], true), "#d8b45a", { stroke: "#9a7a3a", "stroke-width": 1 }) +
          path(S([[136, 60], [114, 58], [100, 70], [118, 66], [104, 80], [126, 70]], true), "#d8b45a", { stroke: "#9a7a3a", "stroke-width": 1 }) +
          tag("circle", { cx: 222, cy: 36, r: 3, fill: "#b2343a" }) + g({ "class": "sway", style: "transform-origin:140px 74px" }, pearls) +
          flower(176, 52, 6, "#c8453a", "#f2d27a") + flower(200, 60, 5, "#e3b34a", "#b2343a")
      };
    },
    // 贾母: silver hair in a low bun, a dark brow band with a jade.
    elder: function (ctx, h) {
      return {
        back: piece(ctx, P.blob(150, 196, 26, 0.15, 9, 12), h.color, { light: 0.16, dark: 0, edge: shade(h.color, -0.35) }),
        front: path(S([[234, 112], [224, 108], [196, 104], [168, 110], [150, 122], [152, 132], [170, 122], [198, 116], [226, 120], [236, 122]], true), "#2c2a30") +
          tag("ellipse", { cx: 230, cy: 116, rx: 5, ry: 6.5, fill: "#7fb39b", stroke: "#c9a45c", "stroke-width": 1.2 })
      };
    },
    // 探春: a tall, upright bun with a jade comb and a rose.
    neat: function (ctx, h) {
      return {
        back: piece(ctx, S([[156, 100], [150, 60], [162, 30], [186, 22], [204, 40], [204, 76], [192, 98]], true), h.color, { light: 0.12, dark: 0, edge: shade(h.color, -0.4) }),
        front: path(S([[160, 66], [200, 54], [204, 62], [164, 74]], true), "#7fb39b", { stroke: "#4d7d68", "stroke-width": 1 }) + flower(152, 84, 9, "#c8453a", "#f2d27a") + pin(146, 90, 214, 70, "#c9a45c", "#c8453a")
      };
    },
    // 湘云: two loops on top, a crab-apple flower, ribbons that fly.
    lively: function (ctx, h) {
      return {
        back: path(S([[176, 70], [168, 40], [182, 18], [204, 22], [208, 50], [194, 72], [188, 60], [198, 46], [194, 32], [184, 32], [180, 50], [186, 72]], true), h.color, { stroke: shade(h.color, -0.4), "stroke-width": 1 }) +
          path(S([[150, 92], [128, 70], [130, 44], [152, 42], [162, 66], [160, 92], [152, 80], [152, 62], [142, 58], [140, 72], [152, 96]], true), h.color, { stroke: shade(h.color, -0.4), "stroke-width": 1 }) +
          piece(ctx, P.blob(170, 88, 22, 0.12, 4, 12), h.color, { light: 0.12, dark: 0, edge: shade(h.color, -0.4) }),
        front: flower(206, 76, 9, "#e8838f", "#f4d36a") + g({ "class": "sway", style: "transform-origin:150px 96px" },
          path(S([[150, 96], [126, 140], [112, 190, 0], [134, 142], [158, 100]], true), "#d6626e"))
      };
    },
    // 警幻 and 绛珠 in the dream: a towering loop bun crowned with gold.
    fairy: function (ctx, h) {
      return {
        back: path(S([[164, 70], [150, 30], [166, -4], [196, -10], [210, 18], [200, 62], [190, 56], [198, 22], [190, 6], [174, 10], [166, 34], [176, 70]], true), h.color, { stroke: shade(h.color, -0.4), "stroke-width": 1 }) +
          piece(ctx, S([[148, 104], [142, 72], [160, 52], [194, 54], [208, 80], [194, 100]], true), h.color, { light: 0.12, dark: 0, edge: shade(h.color, -0.4) }),
        front: path(S([[150, 70], [160, 48], [180, 40], [202, 46], [214, 64], [200, 60], [182, 56], [164, 64]], true), h.gold || "#d8b45a", { stroke: "#9a7a3a", "stroke-width": 1 }) +
          flower(166, 52, 6, h.accent || "#e0475a", "#ffd27a") + flower(200, 50, 5, h.accent || "#e0475a", "#ffd27a") +
          shaker(150, 76, ["#ffd27a", "#f2ede4", h.accent || "#e0475a"])
      };
    }
  };

  function pin(x0, y0, x1, y1, metal, head) {
    return path(P.stroke([[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2 - 2], [x1, y1]], 1.5, 2.6, 1.2), metal) +
      tag("circle", { cx: x1 + 2, cy: y1 - 1, r: 4.5, fill: head, stroke: shade(head, -0.3), "stroke-width": 1 });
  }

  function flower(x, y, r, petal, heart) {
    var d = "";
    for (var k = 0; k < 5; k++) { var a = k * 1.2566 - 1.57; d += P.blob(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, 0.08, k + 1, 7); }
    return path(d, petal, { stroke: shade(petal, -0.25), "stroke-width": 0.7 }) + tag("circle", { cx: x, cy: y, r: n1(r * 0.28), fill: heart });
  }

  // A step-shaker (步摇): strings of beads that swing as she moves.
  function shaker(x, y, beads) {
    var lines = "", dots = "";
    beads.forEach(function (c, i) {
      var dx = (i - 1) * 5, len = 40 + i * 7;
      lines += "M" + x + " " + y + "L" + (x + dx) + " " + (y + len);
      dots += tag("circle", { cx: x + dx, cy: y + len + 2, r: i === beads.length - 1 ? 3 : 2.5, fill: c });
    });
    return g({ "class": "sway", style: "transform-origin:" + x + "px " + y + "px" }, path(lines, "none", { stroke: "#c9a45c", "stroke-width": 0.8 }) + dots);
  }

  function head(ctx, o) {
    var h = o.hair, s = "";
    var style = HAIRSTYLES[h.style](ctx, h);
    s += style.back;
    s += piece(ctx, S(o.old ? FACE_OLD : FACE, true), o.skin || SKIN, { light: 0.06, dark: -0.04, edge: "#c9b49c", edgeW: 1 });
    s += piece(ctx, S(HAIR, true), h.color, { light: 0.14, dark: 0, edge: shade(h.color, -0.4) });
    if (h.lock !== false) s += path(S([[176, 236], [170, 262], [176, 300], [172, 330, 0], [184, 296], [182, 260], [186, 236]], true), h.color);
    s += faceFeatures(ctx, o.face || {});
    s += style.front;
    return s;
  }

  /* ── Dress ─────────────────────────────────────────────────────────── */
  var ROBE = {
    long: [[186, 262], [166, 282], [154, 312], [150, 390], [146, 480], [138, 600], [132, 712, 0.5], [146, 726, 0], [232, 730], [268, 718, 0], [258, 600], [246, 480], [240, 400], [244, 330], [234, 292], [214, 270]],
    short: [[186, 262], [166, 282], [154, 312], [151, 390], [148, 470], [144, 540, 0.5], [156, 552, 0], [236, 556], [258, 546, 0], [250, 480], [240, 400], [244, 330], [234, 292], [214, 270]],
    gown: [[186, 262], [166, 282], [154, 312], [150, 400], [140, 520], [124, 660], [108, 800, 0.5], [118, 818, 0], [250, 822], [288, 808, 0], [270, 660], [252, 520], [242, 410], [245, 330], [234, 292], [214, 270]],
    trailing: [[186, 262], [166, 282], [154, 312], [148, 420], [128, 600], [96, 800], [52, 960, 0.4], [60, 980, 0], [300, 982, 0], [306, 960, 0.4], [282, 820], [260, 620], [246, 440], [245, 330], [234, 292], [214, 270]]
  };
  var HEMS = { long: 718, short: 548, gown: 812, trailing: 975 };

  function dress(ctx, o) {
    var d = o.dress, s = "";
    // Silk scarf (披帛) trailing behind.
    if (d.scarf) {
      s += g({ "class": "sway-slow", style: "transform-origin:170px 300px" },
        piece(ctx, S([[176, 300], [150, 360], [124, 470], [104, 610], [92, 760], [84, 860, 0.5], [76, 900, 0], [96, 868, 0.5], [112, 760], [128, 612], [150, 470], [178, 372], [196, 318]], true), d.scarf, { light: 0.1 }));
    }
    // Skirt.
    var sk = S([[152, 470], [146, 560], [140, 660], [128, 780], [114, 890], [92, 958, 0.5], [100, 978, 0], [292, 980, 0], [296, 962, 0.5], [280, 870], [268, 760], [258, 640], [250, 540], [244, 470]], true);
    if (d.robe !== "trailing") {
      s += piece(ctx, sk, d.skirt);
      if (d.skirtMotif) s += motif(ctx, sk, d.skirtMotif, shade(d.skirt, -0.22), 7, [90, 820, 300, 980], 22);
      s += path(S([[96, 950], [190, 962], [294, 956], [292, 980, 0], [100, 978, 0]], true), d.skirtHem || shade(d.skirt, -0.25), { opacity: 0.9 });
      s += fold([[170, 700], [160, 820], [146, 950]], 2.2) + fold([[214, 740], [218, 850], [222, 958]], 2) + fold([[248, 720], [262, 840], [272, 950]], 1.8);
      // Shoe tip.
      s += path(S([[284, 976], [300, 968], [312, 972], [302, 980, 0], [284, 981, 0]], true), d.shoe || "#9e2a2b");
    }
    // Outer garment.
    var robe = S(ROBE[d.robe || "long"], true);
    s += piece(ctx, robe, d.color);
    if (d.motif) s += motif(ctx, robe, d.motif, d.motifColor || shade(d.color, -0.2), 11, [140, 300, 280, HEMS[d.robe || "long"]], d.motifN || 14);
    var hem = HEMS[d.robe || "long"];
    s += path(S([[214, 272], [232, 294], [242, 332], [238, 400], [244, 480], [256, 600], [266, hem, 0], [254, hem + 4, 0], [244, 600], [232, 480], [226, 400], [230, 334], [222, 298], [206, 276]], true), d.trim);
    s += fold([[170, 330], [164, 480], [158, hem - 20]], 2.4) + fold([[204, 420], [206, 540], [208, hem - 20]], 1.8);
    // Vest (比甲) over it.
    if (d.vest) {
      var vh = d.vestHem || hem + 40;
      var vest = S([[184, 268], [164, 286], [158, 330], [154, 420], [146, 560], [140, vh - 10, 0.5], [152, vh, 0], [234, vh + 2], [262, vh - 8, 0], [254, 560], [242, 420], [244, 332], [232, 294], [212, 272]], true);
      s += piece(ctx, vest, d.vest);
      if (d.vestMotif) s += motif(ctx, vest, d.vestMotif, d.vestMotifColor || shade(d.vest, 0.25), 13, [150, 300, 260, vh], 10);
      s += path(S([[212, 272], [232, 294], [244, 332], [242, 420], [254, 560], [262, vh - 8, 0], [252, vh - 4, 0], [244, 560], [232, 420], [232, 334], [222, 298], [204, 276]], true), d.vestTrim || shade(d.vest, -0.3));
    }
    // Collars.
    s += path(S([[212, 262], [222, 274], [226, 290], [208, 284], [192, 272], [186, 262]], true), d.collar || "#f7f4ee", { stroke: "#cfc6b6", "stroke-width": 1 });
    return s;
  }

  /* ── The near arm ──────────────────────────────────────────────────────
     A sleeve outline, the cuff along its opening, the hand, and what the
     hand holds. Coordinates are for a figure of standard build.           */
  var ARMS = {
    clasp: { sleeve: [[186, 288], [208, 298], [220, 350], [232, 404], [254, 426], [263, 430, 0], [268, 446, 0], [270, 528], [262, 592, 0.4], [232, 612], [198, 598], [178, 540], [174, 452], [178, 360]],
      cuff: [[263, 430, 0], [268, 446, 0], [270, 528], [262, 592, 0.4], [254, 588, 0.4], [258, 528], [256, 448, 0], [250, 434, 0]],
      hand: [[264, 436], [280, 437], [289, 447], [281, 456], [266, 452]], at: [284, 448] },
    forward: { sleeve: [[186, 288], [210, 298], [222, 352], [234, 384], [262, 382], [286, 380, 0], [292, 394, 0], [296, 470], [288, 530, 0.4], [252, 552], [214, 540], [184, 500], [176, 430], [178, 350]],
      cuff: [[286, 380, 0], [292, 394, 0], [296, 470], [288, 530, 0.4], [280, 526, 0.4], [284, 470], [282, 396, 0], [276, 384, 0]],
      hand: [[290, 384], [308, 382], [318, 390], [310, 400], [292, 398]], at: [312, 392] },
    raise: { sleeve: [[186, 288], [212, 300], [232, 340], [244, 300], [246, 252], [254, 238, 0], [268, 250, 0], [272, 330], [266, 420, 0.4], [240, 452], [210, 440], [190, 400], [180, 350]],
      cuff: [[254, 238, 0], [268, 250, 0], [272, 330], [266, 420, 0.4], [258, 416, 0.4], [262, 330], [258, 254, 0], [248, 244, 0]],
      hand: [[238, 196], [252, 192], [258, 206], [254, 232], [242, 236], [236, 214]], at: [248, 214] },
    shoulder: { sleeve: [[186, 288], [212, 300], [228, 350], [240, 340], [252, 324], [262, 322, 0], [272, 336, 0], [276, 410], [268, 480, 0.4], [238, 506], [206, 494], [188, 450], [180, 380]],
      cuff: [[262, 322, 0], [272, 336, 0], [276, 410], [268, 480, 0.4], [260, 476, 0.4], [264, 410], [262, 338, 0], [254, 326, 0]],
      hand: [[258, 312], [272, 306], [282, 316], [276, 330], [262, 330]], at: [270, 320] },
    droop: { sleeve: [[184, 292], [204, 302], [214, 360], [224, 420], [246, 452], [254, 456, 0], [258, 470, 0], [260, 552], [252, 618, 0.4], [224, 634], [194, 620], [176, 560], [172, 470], [176, 370]],
      cuff: [[254, 456, 0], [258, 470, 0], [260, 552], [252, 618, 0.4], [244, 614, 0.4], [248, 552], [246, 472, 0], [240, 460, 0]],
      hand: [[254, 462], [268, 464], [274, 474], [266, 480], [254, 476]], at: [266, 472] },
    open: { sleeve: [[186, 288], [214, 300], [236, 360], [262, 420], [300, 452], [318, 458, 0], [324, 476, 0], [334, 600], [344, 740], [320, 800, 0.4], [282, 760], [246, 660], [210, 560], [186, 460], [178, 360]],
      cuff: [[318, 458, 0], [324, 476, 0], [334, 600], [344, 740], [320, 800, 0.4], [314, 790, 0.4], [326, 740], [318, 600], [310, 478, 0], [304, 466, 0]],
      hand: [[312, 448], [328, 446], [336, 456], [328, 466], [314, 462]], at: [330, 456] }
  };

  function arm(ctx, o) {
    var a = ARMS[o.arm || "clasp"], d = o.dress, s = "";
    var behind = PROPS[o.prop] && PROPS[o.prop].behind ? PROPS[o.prop].behind(ctx, a, o) : "";
    s += behind;
    s += piece(ctx, S(a.sleeve, true), d.sleeve || d.color);
    s += path(S(a.cuff, true), d.cuff || d.trim);
    s += fold([[a.sleeve[1][0], a.sleeve[1][1] + 30], [a.sleeve[3][0], a.sleeve[3][1]], [a.sleeve[4][0] - 10, a.sleeve[4][1] + 6]], 2);
    s += fold([[a.sleeve[12] ? a.sleeve[12][0] + 16 : 196, a.sleeve[12] ? a.sleeve[12][1] - 20 : 470], [a.sleeve[10][0] - 6, a.sleeve[10][1] - 30]], 2.2);
    s += path(S(a.hand, true), o.skin || SKIN, { stroke: "#c9b49c", "stroke-width": 1 });
    if (PROPS[o.prop]) s += PROPS[o.prop].front(ctx, a, o);
    return s;
  }

  /* ── Things held ───────────────────────────────────────────────────── */
  var PROPS = {
    kerchief: { front: function (ctx, a) {
      var x = a.at[0], y = a.at[1];
      return piece(ctx, S([[x - 8, y], [x + 8, y + 22], [x + 6, y + 72], [x - 4, y + 100, 0], [x - 12, y + 52], [x - 14, y + 14]], true), "#f4f1ea", { light: 0.04 }) +
        path(S([[x - 4, y + 88], [x + 2, y + 82], [x - 2, y + 96]], true), "#9e2a2b", { opacity: 0.8 });
    } },
    // The handkerchief pressed to the eyes.
    tears: { front: function (ctx, a) {
      return piece(ctx, S([[236, 200], [258, 194], [262, 230], [258, 290], [246, 320, 0], [238, 262], [232, 222]], true), "#f4f1ea", { light: 0.04 });
    } },
    // A round silk fan (团扇) painted with a spray of flowers.
    fan: { front: function (ctx, a) {
      var x = a.at[0] + 8, y = a.at[1] - 40;
      return path("M" + (x - 6) + " " + (y + 40) + "L" + (x - 2) + " " + (y + 78), "none", { stroke: "#7a4a2a", "stroke-width": 4, "stroke-linecap": "round" }) +
        tag("ellipse", { cx: x, cy: y, rx: 36, ry: 40, fill: "#f6efe0", stroke: "#b08a4a", "stroke-width": 3 }) +
        flower(x - 6, y - 6, 9, "#e98e9a", "#f2d27a") + flower(x + 12, y + 10, 7, "#f3b7bd", "#f2d27a") +
        path(P.leaf(x - 18, y + 14, -0.6, 18, 6), "#93a86a");
    } },
    // The flower hoe over her shoulder, a silk bag hanging from it.
    hoe: { behind: function (ctx) {
      return path("M300 370L92 214", "none", { stroke: "#6b4a2a", "stroke-width": 6, "stroke-linecap": "round" }) +
        path(P.poly([[84, 198], [104, 210], [92, 236], [74, 226]], true), "#8a8f94", { stroke: "#5a5f64", "stroke-width": 1.5 }) +
        g({ "class": "sway", style: "transform-origin:118px 236px" },
          path("M118 236L116 262", "none", { stroke: "#9e2a2b", "stroke-width": 1.6 }) +
          piece(ctx, S([[100, 262], [134, 262], [140, 300], [130, 336], [106, 338], [96, 302]], true), "#e9d6c4", { light: 0.05 }) +
          path("M102 266Q118 274 134 266", "none", { stroke: "#9e2a2b", "stroke-width": 2 }) +
          tag("circle", { cx: 112, cy: 300, r: 4, fill: "#f3b7bd" }) + tag("circle", { cx: 124, cy: 310, r: 3.4, fill: "#e98e9a" }));
    }, front: function () { return ""; } },
    // A walking stick with a dragon's head grip.
    cane: { front: function (ctx, a) {
      var x = a.at[0] + 4, y = a.at[1];
      return path("M" + x + " " + (y - 30) + "L" + (x + 18) + " 980", "none", { stroke: "#6b4a2a", "stroke-width": 7, "stroke-linecap": "round" }) +
        path(S([[x - 10, y - 40], [x + 6, y - 52], [x + 18, y - 40], [x + 8, y - 26]], true), "#c9a45c", { stroke: "#8a6a2a", "stroke-width": 1 });
    } },
    // A rolled poem sheet (花笺).
    scroll: { front: function (ctx, a) {
      var x = a.at[0], y = a.at[1];
      return B.rectStr(x - 4, y - 46, 10, 92, "#f3e6c8") + B.rectStr(x - 6, y - 50, 14, 8, "#b23a32") + B.rectStr(x - 6, y + 42, 14, 8, "#b23a32");
    } }
  };

  var B = {
    rectStr: function (x, y, w, h, fill) { return tag("rect", { x: x, y: y, width: w, height: h, fill: fill, rx: 2 }); }
  };

  /* ── Pendants at the breast or waist ───────────────────────────────── */
  var PENDANTS = {
    tassel: function () {
      return path("M236 412C238 470 240 520 242 560", "none", { stroke: "#9e2a2b", "stroke-width": 1.6 }) +
        tag("circle", { cx: 242, cy: 568, r: 9, fill: "#cfe0d4", stroke: "#7fa08e", "stroke-width": 1.2 }) +
        g({ "class": "sway", style: "transform-origin:242px 578px" }, path(S([[238, 578], [246, 578], [250, 640, 0], [234, 640, 0]], true), "#9e2a2b"));
    },
    // 宝钗's golden locket (金锁), engraved on both faces.
    locket: function () {
      return path("M226 290C234 310 240 322 244 330", "none", { stroke: "#c9a45c", "stroke-width": 1.4 }) +
        path(S([[236, 330, 0], [254, 330, 0], [258, 342], [246, 358, 0], [232, 344]], true), "#e3c26a", { stroke: "#9a7a3a", "stroke-width": 1.2 }) +
        path("M240 338h10M240 344h8", "none", { stroke: "#9a7a3a", "stroke-width": 1 });
    },
    // 湘云's golden unicorn (金麒麟).
    qilin: function () {
      return path("M236 412C238 450 238 470 240 490", "none", { stroke: "#c8453a", "stroke-width": 1.6 }) +
        path(S([[230, 494], [240, 486], [254, 490], [258, 500], [250, 510], [236, 510], [228, 502]], true), "#e3c26a", { stroke: "#9a7a3a", "stroke-width": 1 }) +
        tag("circle", { cx: 252, cy: 494, r: 1.6, fill: "#5a3a1a" });
    },
    // 凤姐's ring of red gold (赤金盘螭璎珞圈).
    necklace: function () {
      return path(S([[194, 280], [210, 312], [236, 320], [244, 300]], false), "none", { stroke: "#d8b45a", "stroke-width": 4 }) +
        tag("circle", { cx: 230, cy: 324, r: 5, fill: "#c8453a", stroke: "#d8b45a", "stroke-width": 2 });
    },
    ribbon: function () {
      return g({ "class": "sway-slow", style: "transform-origin:236px 412px" }, path(S([[232, 410], [244, 410], [252, 520], [240, 600, 0], [236, 520]], true), "#7a6a9a"));
    }
  };

  /* ── Cloaks and shawls, over everything but the head ───────────────── */
  var WRAPS = {
    // 鹤氅: the crimson cloak lined with white fox she wears in snow.
    cloak: function (ctx, o) {
      var c = o.wrap.color || "#a8302f";
      return piece(ctx, S([[182, 258], [150, 290], [128, 420], [108, 600], [84, 800], [70, 940, 0.5], [84, 962, 0], [290, 966, 0], [298, 940, 0.5], [284, 780], [268, 600], [262, 440], [258, 330], [238, 282], [214, 262]], true), c) +
        path(S([[214, 262], [238, 282], [258, 330], [262, 440], [268, 600], [284, 780], [298, 940, 0.5], [290, 966, 0], [278, 962, 0], [284, 940, 0.5], [270, 780], [254, 600], [248, 440], [244, 334], [226, 290], [204, 270]], true), "#f4f1ea") +
        path(S([[180, 256], [216, 258], [240, 276], [226, 296], [196, 292], [170, 278]], true), "#f7f4ee", { stroke: "#d8d2c4", "stroke-width": 1 }) +
        fold([[180, 330], [160, 560], [130, 900]], 3, INK, 0.25) + fold([[230, 360], [232, 600], [244, 900]], 2.6, INK, 0.2) +
        piece(ctx, S([[244, 470], [262, 466], [270, 480], [262, 492], [246, 490]], true), o.skin || SKIN, { light: 0.04, edge: "#c9b49c", edgeW: 1 });
    },
    // A shawl over the shoulders, for illness.
    shawl: function (ctx, o) {
      var c = o.wrap.color || "#c9b8cf";
      var back = S([[188, 262], [164, 278], [148, 318], [138, 400], [134, 470], [146, 492, 0], [170, 478], [186, 430], [194, 360], [202, 300]], true);
      var front = S([[212, 268], [234, 284], [250, 320], [258, 380], [262, 450], [256, 520, 0], [238, 528, 0], [236, 470], [232, 400], [224, 336], [208, 296]], true);
      return piece(ctx, back, shade(c, -0.08)) + piece(ctx, front, c) +
        fold([[160, 320], [150, 400], [150, 470]], 2.2) + fold([[238, 320], [246, 410], [246, 500]], 2) +
        path("M140 488l-4 18M150 490l-2 20M246 528l2 18M252 524l4 18", "none", { stroke: shade(c, -0.3), "stroke-width": 1.4 });
    }
  };

  // A woman, assembled. spec: { hair, face, dress, arm, prop, pendant,
  // wrap, bow (degrees the head is lowered), scale, skin }.
  function woman(spec) {
    var ctx = F([]), s = "";
    s += dress(ctx, spec);
    if (spec.pendant && PENDANTS[spec.pendant]) s += PENDANTS[spec.pendant]();
    var bow = spec.bow || 0;
    s += g({ transform: bow ? "rotate(" + bow + " " + NECK[0] + " " + NECK[1] + ")" : null }, head(ctx, spec));
    if (!spec.wrap || spec.wrap.kind !== "cloak") s += arm(ctx, spec);
    if (spec.wrap) s += WRAPS[spec.wrap.kind](ctx, spec);
    return { defs: ctx.defs.join(""), body: s };
  }

  var CAST = {};

  function svg(who, pose) {
    var c = CAST[who];
    if (!c) return "";
    var spec = c.poses[pose] || c.poses.calm;
    var art = (c.build || woman)(typeof spec === "function" ? spec() : spec);
    return '<svg class="figure-art" viewBox="0 0 400 1000" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      "<defs>" + art.defs + "</defs>" + art.body + "</svg>";
  }

  kit.figures = {
    CAST: CAST, svg: svg, woman: woman,
    parts: { piece: piece, fold: fold, motif: motif, head: head, eyes: eyes, flower: flower, pin: pin, shaker: shaker, F: F, SKIN: SKIN, INK: INK, NECK: NECK, PROPS: PROPS, FACE: FACE, HAIR: HAIR, HAIRSTYLES: HAIRSTYLES }
  };
})(window.HonglouKit);
