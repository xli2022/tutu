/* ── 还泪记 · figures ─────────────────────────────────────────────────────
   The cast, cut from paper. Every figure stands in profile facing right in
   a 400 × 1000 box with the ground at y = 980; the stage mirrors a figure
   that should face left. A figure is built from layered pieces (back hair,
   skirt, robe, sleeve, face, front hair, ornaments), each a flat colour with
   a faint gradient, a darker cut edge and a few fold lines.               */
(function (kit) {
  "use strict";

  var P = kit.paint;
  var S = P.spline, path = P.path, g = P.g, shade = P.shade;

  var INK = "#1f2228";
  var SKIN = "#f6eadb";

  // A paper piece: fill, a soft top-to-bottom light, and a cut edge.
  function piece(d, fill, defs, opts) {
    opts = opts || {};
    var gid = P.id("pc");
    defs.push(P.linear(gid, 0, 0, 0, 1, [
      [0, shade(fill, opts.light == null ? 0.12 : opts.light)],
      [1, shade(fill, opts.dark == null ? -0.08 : opts.dark)]
    ]));
    return path(d, "url(#" + gid + ")", {
      stroke: opts.edge || shade(fill, -0.32),
      "stroke-width": opts.edgeW == null ? 1.3 : opts.edgeW,
      "stroke-linejoin": "round"
    });
  }

  // A fold or cut line: a tapered dark stroke.
  function fold(spine, w, color, op) {
    return path(P.stroke(spine, 0.2, w, 0.2), color || INK, { opacity: op == null ? 0.22 : op });
  }

  /* ── 黛玉 ───────────────────────────────────────────────────────────── */
  function daiyu(pose) {
    var defs = [], out = [];
    var robe = "#e4eaeb", trim = "#4c5d6b", skirt = "#cfdacb", skirtHem = "#8ea38b";

    // Silk scarf (披帛) trailing behind, drawn first so the body covers it.
    out.push(g({ "class": "sway-slow", style: "transform-origin:170px 300px" },
      piece(S([[176, 300], [150, 360], [124, 470], [104, 610], [92, 760], [84, 860, 0.5], [76, 900, 0], [96, 868, 0.5], [112, 760], [128, 612], [150, 470], [178, 372], [196, 318]], true),
        "#d7c3cf", defs, { light: 0.1 })));

    // Back hair and bun.
    out.push(piece(S([[150, 104], [140, 72], [152, 46], [180, 36], [204, 50], [206, 78], [190, 100]], true), INK, defs, { light: 0.12, dark: 0, edge: "#0f1115" }));
    // A hair loop rising from the bun.
    out.push(path(S([[166, 54], [170, 26], [192, 14], [214, 24], [214, 50], [198, 62], [192, 54], [204, 44], [202, 30], [190, 26], [178, 34], [176, 56]], true), INK, { stroke: "#0f1115", "stroke-width": 1 }));

    // Skirt.
    out.push(piece(S([[150, 640], [140, 760], [122, 880], [98, 958, 0.5], [104, 976, 0], [284, 978, 0], [286, 962, 0.5], [272, 860], [262, 760], [258, 640]], true), skirt, defs));
    out.push(path(S([[102, 950], [190, 960], [284, 956], [286, 978, 0], [104, 976, 0]], true), skirtHem, { opacity: 0.9 }));
    out.push(fold([[170, 700], [160, 820], [146, 950]], 2.2));
    out.push(fold([[214, 720], [218, 840], [222, 958]], 2));
    out.push(fold([[246, 700], [258, 830], [268, 950]], 1.8));

    // Outer robe (褙子).
    out.push(piece(S([[186, 262], [166, 282], [154, 312], [150, 390], [146, 480], [138, 600], [132, 700, 0.5], [146, 716, 0], [232, 720], [266, 708, 0], [256, 600], [244, 480], [238, 400], [242, 330], [232, 292], [214, 270]], true), robe, defs));
    // Front trim band.
    out.push(path(S([[214, 272], [232, 294], [242, 332], [238, 400], [244, 480], [256, 600], [266, 708, 0], [254, 712, 0], [244, 600], [232, 480], [226, 400], [230, 334], [222, 298], [206, 276]], true), trim));
    // Hem band.
    out.push(path(S([[132, 700, 0.5], [146, 716, 0], [232, 720], [266, 708, 0], [264, 694, 0], [232, 704], [146, 700], [134, 686, 0]], true), trim));
    out.push(fold([[170, 330], [164, 480], [158, 690]], 2.4));
    out.push(fold([[204, 420], [206, 560], [208, 700]], 1.8));

    // Face and neck.
    out.push(piece(S([[222, 106], [236, 124], [242, 144], [240, 156, 0.5], [254, 177, 0.35], [246, 184, 0.5], [247, 191, 0.5], [250, 195, 0.4], [245, 199, 0.3], [248, 204, 0.4], [243, 209, 0.5], [246, 217], [240, 225], [226, 230], [218, 242], [214, 276], [180, 280], [180, 240], [190, 200], [200, 140]], true), SKIN, defs, { light: 0.06, dark: -0.04, edge: "#c9b49c", edgeW: 1 }));
    // Inner collar, white, then the robe collar over it.
    out.push(path(S([[212, 262], [222, 274], [226, 290], [208, 284], [192, 272], [186, 262]], true), "#f7f4ee", { stroke: "#cfc6b6", "stroke-width": 1 }));

    // Hair over the head: hairline, temple lock, nape.
    out.push(piece(S([[226, 104], [234, 116], [222, 128], [214, 150], [208, 178], [200, 196], [190, 224], [172, 238], [152, 210], [144, 160], [150, 118], [176, 94], [206, 92]], true), INK, defs, { light: 0.14, dark: 0, edge: "#0f1115" }));
    // A loose lock over the shoulder.
    out.push(path(S([[176, 236], [170, 262], [176, 300], [172, 330, 0], [184, 296], [182, 260], [186, 236]], true), INK));

    // Brow, eye, lip, blush.
    defs.push(P.radial("blush", 0.5, 0.5, 0.5, [[0, "#e8828c", 0.5], [1, "#e8828c", 0]]));
    out.push(P.tag("ellipse", { cx: 232, cy: 186, rx: 13, ry: 9, fill: "url(#blush)" }));
    out.push(path(P.stroke([[222, 147], [231, 144.4], [241, 146.2]], 0.5, 2.2, 0.3), "#3a3f48", { opacity: 0.85 }));
    if (pose === "weep") {
      out.push(path(P.stroke([[228, 160], [234, 162.5], [240, 162]], 0.4, 2.2, 0.4), INK));
    } else {
      out.push(path(P.stroke([[227, 157.5], [234, 158.6], [240.5, 161]], 0.5, 2.6, 0.6), INK));
      out.push(path(S([[233, 159.5], [238.5, 161.2], [235, 162.4]], true), INK, { opacity: 0.7 }));
    }
    out.push(path(S([[246.5, 195], [249.5, 195.8], [246, 199], [248, 203], [244, 202]], true), "#b8424c", { opacity: 0.85 }));

    // Hairpin with a jade head, and a dangling step-shaker (步摇).
    out.push(path(P.stroke([[128, 86], [170, 74], [216, 62]], 1.5, 2.6, 1.2), "#c9a45c"));
    out.push(P.tag("circle", { cx: 218, cy: 61, r: 4.5, fill: "#7fb39b", stroke: "#4d7d68", "stroke-width": 1 }));
    out.push(g({ "class": "sway", style: "transform-origin:140px 84px" },
      path("M140 84 L136 128 M140 84 L144 122 M140 84 L140 136", "none", { stroke: "#c9a45c", "stroke-width": 0.8 }) +
      P.tag("circle", { cx: 136, cy: 130, r: 2.6, fill: "#f2ede4" }) +
      P.tag("circle", { cx: 144, cy: 124, r: 2.4, fill: "#f2ede4" }) +
      P.tag("circle", { cx: 140, cy: 139, r: 3, fill: "#9e2a2b" })));

    // The near sleeve and the hands, holding a handkerchief.
    out.push(piece(S([[188, 290], [210, 302], [222, 360], [236, 408], [260, 430], [268, 446, 0], [270, 520], [262, 588, 0.4], [230, 608], [196, 596], [178, 540], [176, 450], [180, 360]], true), robe, defs));
    out.push(path(S([[260, 430], [268, 446, 0], [270, 520], [262, 588, 0.4], [254, 584, 0.4], [258, 520], [256, 448, 0], [250, 432]], true), trim));
    out.push(fold([[200, 330], [214, 400], [236, 426]], 2));
    out.push(fold([[196, 470], [204, 540], [222, 590]], 2.2));
    out.push(path(S([[264, 436], [280, 437], [289, 447], [281, 456], [266, 452]], true), SKIN, { stroke: "#c9b49c", "stroke-width": 1 }));
    out.push(piece(S([[276, 448], [292, 470], [290, 520], [280, 548, 0], [272, 500], [270, 462]], true), "#f4f1ea", defs, { light: 0.04 }));
    out.push(path(S([[282, 530], [288, 524], [284, 540]], true), "#9e2a2b", { opacity: 0.8 }));

    // A silk cord with a jade disc and a crimson tassel at the waist.
    out.push(path("M236 412 C238 470 240 520 242 560", "none", { stroke: "#9e2a2b", "stroke-width": 1.6 }));
    out.push(P.tag("circle", { cx: 242, cy: 568, r: 9, fill: "#cfe0d4", stroke: "#7fa08e", "stroke-width": 1.2 }));
    out.push(P.tag("circle", { cx: 242, cy: 568, r: 3, fill: robe }));
    out.push(g({ "class": "sway", style: "transform-origin:242px 578px" },
      path(S([[238, 578], [246, 578], [250, 640, 0], [234, 640, 0]], true), "#9e2a2b")));

    return { defs: defs.join(""), body: out.join("") };
  }

  var CAST = {
    daiyu: { name: "黛玉", draw: daiyu }
  };

  function svg(who, pose) {
    var c = CAST[who];
    var art = c.draw(pose || "calm");
    return '<svg class="figure-art" viewBox="0 0 400 1000" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      "<defs>" + art.defs + "</defs>" + art.body + "</svg>";
  }

  kit.figures = { CAST: CAST, svg: svg };
})(window.HonglouKit);
