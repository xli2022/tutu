/* ── 还泪记 · paint ───────────────────────────────────────────────────────
   The drawing kit every picture in the game is made from: seeded random
   numbers, smooth noise, splines through hand-placed points, a small SVG
   string builder, colour mixing and the rice-paper textures.

   Scenes and figures are pure functions of this kit, so a picture comes out
   the same on every visit and nothing is downloaded but the code itself.  */
(function () {
  "use strict";

  var kit = window.HonglouKit = window.HonglouKit || {};

  /* ── Numbers ───────────────────────────────────────────────────────── */

  // mulberry32: small, fast, and good enough for brushwork.
  function rng(seed) {
    var s = seed | 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(ix, iy, seed) {
    var h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296 * 2 - 1;
  }

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

  // Value noise in [-1, 1], smooth in both directions.
  function noise2(x, y, seed) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = fade(x - ix), fy = fade(y - iy);
    var a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
    var c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  }

  function noise1(x, seed) { return noise2(x, 0.5, seed); }

  // Fractal sum of octaves, roughly in [-1, 1].
  function fbm(x, y, octaves, seed) {
    var sum = 0, amp = 0.5, f = 1, norm = 0;
    for (var i = 0; i < octaves; i++) {
      sum += amp * noise2(x * f, y * f, seed + i * 101);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function n1(v) { return Math.round(v * 10) / 10; }

  /* ── Paths ─────────────────────────────────────────────────────────────
     spline() threads a smooth curve through hand-placed points, which is
     far easier to draw with than raw Bézier handles: move a point, the
     curve follows. A point is [x, y] or [x, y, k], where k scales the
     tangent there: 1 is the default, 0 makes a sharp corner (a cut, a
     sleeve's edge), and values in between pull the curve tighter.        */
  function spline(pts, closed) {
    var n = pts.length;
    if (n < 2) return "";
    var d = "M" + n1(pts[0][0]) + " " + n1(pts[0][1]);
    var segs = closed ? n : n - 1;
    function P(i) {
      if (closed) return pts[(i + n) % n];
      return pts[clamp(i, 0, n - 1)];
    }
    function k(p) { return p.length > 2 ? p[2] : 1; }
    for (var i = 0; i < segs; i++) {
      var p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      var k1 = k(p1) / 6, k2 = k(p2) / 6;
      var c1x = p1[0] + (p2[0] - p0[0]) * k1, c1y = p1[1] + (p2[1] - p0[1]) * k1;
      var c2x = p2[0] - (p3[0] - p1[0]) * k2, c2y = p2[1] - (p3[1] - p1[1]) * k2;
      d += "C" + n1(c1x) + " " + n1(c1y) + " " + n1(c2x) + " " + n1(c2y) + " " + n1(p2[0]) + " " + n1(p2[1]);
    }
    return closed ? d + "Z" : d;
  }

  // Straight polyline / polygon.
  function poly(pts, closed) {
    var d = "";
    for (var i = 0; i < pts.length; i++) d += (i ? "L" : "M") + n1(pts[i][0]) + " " + n1(pts[i][1]);
    return closed ? d + "Z" : d;
  }

  // A tapered brush stroke along a spine: wide in the middle, fine at the
  // ends, the way a loaded brush lays down a leaf or a stem.
  function stroke(spine, w0, w1, w2) {
    var n = spine.length, left = [], right = [];
    for (var i = 0; i < n; i++) {
      var p = spine[i], a = spine[Math.max(0, i - 1)], b = spine[Math.min(n - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
      var t = n === 1 ? 0 : i / (n - 1);
      var w = t < 0.5 ? lerp(w0, w1, t * 2) : lerp(w1, w2, (t - 0.5) * 2);
      var nx = -dy / len * w / 2, ny = dx / len * w / 2;
      left.push([p[0] + nx, p[1] + ny]);
      right.unshift([p[0] - nx, p[1] - ny]);
    }
    return spline(left.concat(right), true);
  }

  // A leaf: a pointed blade from base (x, y) along angle a.
  function leaf(x, y, a, len, wid) {
    var c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
    function at(t, w) { return [x + c * len * t + px * w, y + s * len * t + py * w]; }
    return spline([
      [x, y, 0], at(0.25, wid * 0.42), at(0.6, wid * 0.5), [x + c * len, y + s * len, 0],
      at(0.6, -wid * 0.46), at(0.25, -wid * 0.38)
    ], true);
  }

  // A rough, hand-cut closed outline around a circle-ish blob.
  function blob(cx, cy, r, rough, seed, steps) {
    steps = steps || 18;
    var pts = [];
    for (var i = 0; i < steps; i++) {
      var a = i / steps * Math.PI * 2;
      var rr = r * (1 + rough * noise1(i * 0.9 + seed * 13.1, seed));
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return spline(pts, true);
  }

  /* ── SVG strings ───────────────────────────────────────────────────── */
  function attrs(a) {
    var s = "";
    for (var k in a) {
      if (!Object.prototype.hasOwnProperty.call(a, k) || a[k] == null || a[k] === false) continue;
      s += " " + k + '="' + a[k] + '"';
    }
    return s;
  }

  function tag(name, a, inner) {
    return "<" + name + attrs(a || {}) + (inner == null ? "/>" : ">" + inner + "</" + name + ">");
  }

  function path(d, fill, extra) {
    var a = { d: d, fill: fill || "none" };
    if (extra) for (var k in extra) a[k] = extra[k];
    return tag("path", a);
  }

  function g(a, inner) { return tag("g", a, inner); }

  var uid = 0;
  function id(prefix) { return (prefix || "h") + (++uid).toString(36); }

  function linear(gid, x1, y1, x2, y2, stops) {
    var s = "";
    for (var i = 0; i < stops.length; i++) {
      var st = stops[i];
      s += tag("stop", { offset: st[0], "stop-color": st[1], "stop-opacity": st.length > 2 ? st[2] : null });
    }
    return tag("linearGradient", { id: gid, x1: x1, y1: y1, x2: x2, y2: y2 }, s);
  }

  function radial(gid, cx, cy, r, stops, units) {
    var s = "";
    for (var i = 0; i < stops.length; i++) {
      var st = stops[i];
      s += tag("stop", { offset: st[0], "stop-color": st[1], "stop-opacity": st.length > 2 ? st[2] : null });
    }
    return tag("radialGradient", { id: gid, cx: cx, cy: cy, r: r, gradientUnits: units || null }, s);
  }

  /* ── Colour ────────────────────────────────────────────────────────── */
  function rgb(hex) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function hex(c) {
    function p(v) { v = clamp(Math.round(v), 0, 255); return (v < 16 ? "0" : "") + v.toString(16); }
    return "#" + p(c[0]) + p(c[1]) + p(c[2]);
  }

  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return hex([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]);
  }

  // shade(c, +0.2) lightens toward white, shade(c, -0.2) darkens toward ink.
  function shade(c, t) { return t >= 0 ? mix(c, "#ffffff", t) : mix(c, "#1a1612", -t); }

  function rgba(c, a) {
    var x = rgb(c);
    return "rgba(" + x[0] + "," + x[1] + "," + x[2] + "," + a + ")";
  }

  /* ── Paper ─────────────────────────────────────────────────────────────
     A tileable sheet of rice paper as a grey map around 50%: lighter
     fibres, darker flecks and a slow mottle where the pulp lay thicker.
     Laid over the stage with soft-light it gives every colour underneath
     the tooth of handmade paper without tinting it.                      */
  function paperCanvas(size, seed, strength, sheet) {
    var cv = document.createElement("canvas");
    cv.width = cv.height = size;
    var cx = cv.getContext("2d");
    var img = cx.createImageData(size, size), d = img.data;
    var str = strength == null ? 1 : strength;
    var r = rng(seed || 7);
    var period = 8;   // mottle cells across one tile, so it wraps
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var u = x / size * period, v = y / size * period;
        // Tileable mottle: blend the noise with its wrapped copies.
        var m = tileNoise(u, v, period, seed);
        var grain = (r() - 0.5) * 26;
        // A sheet for multiply sits just under white; an overlay map
        // sits around mid grey so it can both lighten and darken.
        var val = sheet ? 247 + m * 12 * str + grain * 0.3 * str : 128 + m * 22 * str + grain * str;
        var i = (y * size + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = val;
        d[i + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);

    // Fibres: short curved hairs, mostly light, a few dark.
    cx.lineCap = "round";
    var fibres = Math.round(size * size / 380);
    for (var f = 0; f < fibres; f++) {
      var fx = r() * size, fy = r() * size, ang = r() * Math.PI * 2;
      var len = 6 + r() * 34, bend = (r() - 0.5) * 0.9;
      var light = r() < (sheet ? 0.45 : 0.78);
      cx.strokeStyle = light ? "rgba(255,255,255," + (0.08 + r() * 0.16) * str + ")" : "rgba(" + (sheet ? "150,120,80," : "40,30,20,") + (0.06 + r() * 0.12) * str + ")";
      cx.lineWidth = 0.4 + r() * 0.9;
      for (var ox = -1; ox <= 1; ox++) {
        for (var oy = -1; oy <= 1; oy++) {
          var sx = fx + ox * size, sy = fy + oy * size;
          if (sx < -60 || sx > size + 60 || sy < -60 || sy > size + 60) continue;
          cx.beginPath();
          cx.moveTo(sx, sy);
          cx.quadraticCurveTo(
            sx + Math.cos(ang + bend) * len * 0.5, sy + Math.sin(ang + bend) * len * 0.5,
            sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
          cx.stroke();
        }
      }
    }
    // Flecks of bark and grit.
    var flecks = Math.round(size * size / 2600);
    for (var k = 0; k < flecks; k++) {
      cx.fillStyle = "rgba(60,45,30," + (0.1 + r() * 0.25) * str + ")";
      cx.beginPath();
      cx.arc(r() * size, r() * size, 0.4 + r() * 1.1, 0, Math.PI * 2);
      cx.fill();
    }
    return cv;
  }

  function tileNoise(u, v, p, seed) {
    // Bilinear blend of four shifted samples makes the noise wrap at p.
    var a = fbm(u, v, 4, seed), b = fbm(u - p, v, 4, seed);
    var c = fbm(u, v - p, 4, seed), d = fbm(u - p, v - p, 4, seed);
    var tx = u / p, ty = v / p;
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }

  var paperCache = {};
  // overlay map (sheet false) for soft-light over the stage; a light sheet
  // (sheet true) to multiply into paper-coloured backgrounds.
  function paperURL(size, seed, strength, sheet) {
    var key = size + ":" + seed + ":" + strength + ":" + !!sheet;
    if (!paperCache[key]) {
      try {
        paperCache[key] = paperCanvas(size, seed, strength, sheet).toDataURL("image/png");
      } catch (e) {
        paperCache[key] = "";
      }
    }
    return paperCache[key];
  }

  kit.paint = {
    rng: rng, noise1: noise1, noise2: noise2, fbm: fbm,
    lerp: lerp, clamp: clamp, n1: n1,
    spline: spline, poly: poly, stroke: stroke, leaf: leaf, blob: blob,
    tag: tag, path: path, g: g, id: id, linear: linear, radial: radial,
    rgb: rgb, hex: hex, mix: mix, shade: shade, rgba: rgba,
    paperCanvas: paperCanvas, paperURL: paperURL
  };
})();
