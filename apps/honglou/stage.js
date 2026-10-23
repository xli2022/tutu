/* ── 还泪记 · stage ───────────────────────────────────────────────────────
   Draws what the story says is on stage: the paper diorama of the current
   scene, the figures standing in it, falling petals or rain, and the moves
   between scenes. The stage is a fixed 1600 × 900 box scaled to fit, so
   every position below is in stage units.

   Scene changes are a pop-up book turning its page: the old cut-outs fold
   flat, front first, and the new ones stand up from the back. Figures fold
   up from the page as they enter, too. The ink transition (a blot of ink
   spreading over the page and drying away) is kept for the dream and for
   moments that should feel like a cut.                                    */
(function (kit) {
  "use strict";

  var P = kit.paint;
  var W = 1600, H = 900;
  var FIG_H = 860, FIG_ASPECT = 0.4, GROUND = 892;
  var POS = { ll: 0.13, l: 0.29, cl: 0.4, c: 0.5, cr: 0.6, r: 0.71, rr: 0.87 };
  var PANEL_W = 420;   // stage units the vertical text panel takes on the right

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var els = {}, cur = { scene: "", variant: "", layers: [], figures: {} };
  var mode = "vertical";
  var scale = 1;

  function div(cls, parent) {
    var d = document.createElement("div");
    d.className = cls;
    if (parent) parent.appendChild(d);
    return d;
  }

  function wait(ms) { return new Promise(function (res) { setTimeout(res, reduced ? Math.min(ms, 60) : ms); }); }

  /* ── Mount and fit ─────────────────────────────────────────────────── */
  function mount(wrap) {
    els.wrap = wrap;
    els.stage = div("stage", wrap);
    els.back = div("scene scene-back", els.stage);
    els.figs = div("figures", els.stage);
    els.front = div("scene scene-front", els.stage);
    els.fx = document.createElement("canvas");
    els.fx.className = "fx";
    els.stage.appendChild(els.fx);
    els.tint = div("tint", els.stage);
    els.grain = div("grain", els.stage);
    els.grain.style.backgroundImage = "url(" + P.paperURL(512, 7, 1) + ")";
    els.vignette = div("vignette", els.stage);
    els.ink = document.createElement("canvas");
    els.ink.className = "ink";
    els.stage.appendChild(els.ink);
    els.flash = div("flash", els.stage);

    wrap.addEventListener("pointermove", onPointer);
    wrap.addEventListener("pointerleave", function () { target.x = 0; target.y = 0; });
    window.addEventListener("resize", fit);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) lastT = 0; });
    fit();
    requestAnimationFrame(frame);
  }

  function fit() {
    var r = els.wrap.getBoundingClientRect();
    scale = Math.min(r.width / W, r.height / H) || 1;
    els.stage.style.transform = "translate(" + ((r.width - W * scale) / 2) + "px," + ((r.height - H * scale) / 2) + "px) scale(" + scale + ")";
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = Math.round(W * scale * dpr), ch = Math.round(H * scale * dpr);
    [els.fx, els.ink].forEach(function (c) {
      if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    });
    pxScale = scale * dpr;
    return scale;
  }
  var pxScale = 1;

  /* ── Parallax ──────────────────────────────────────────────────────── */
  var target = { x: 0, y: 0 }, look = { x: 0, y: 0 };
  function onPointer(e) {
    if (e.pointerType === "touch") return;
    var r = els.wrap.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }

  function applyParallax(t) {
    var idleX = Math.sin(t / 7000) * 0.25, idleY = Math.cos(t / 9000) * 0.15;
    look.x += ((target.x || idleX) - look.x) * 0.04;
    look.y += ((target.y || idleY) - look.y) * 0.04;
    for (var i = 0; i < cur.layers.length; i++) {
      var l = cur.layers[i];
      if (l.folding) continue;
      var k = l.depth * 40;
      l.el.style.transform = "translate3d(" + (-look.x * k).toFixed(2) + "px," + (-look.y * k * 0.4).toFixed(2) + "px,0)";
    }
    var fk = 0.55 * 40;
    els.figs.style.transform = "translate3d(" + (-look.x * fk).toFixed(2) + "px," + (-look.y * fk * 0.4).toFixed(2) + "px,0)";
  }

  /* ── Scenes ────────────────────────────────────────────────────────── */
  function buildLayers(name, variant) {
    var sc = kit.scenes.build(name, variant);
    if (!sc) return null;
    var made = [];
    sc.layers.forEach(function (l, i) {
      var el = div("layer" + (l.front ? " layer-front" : ""), l.front ? els.front : els.back);
      el.style.setProperty("--shadow", (4 + l.depth * 14).toFixed(1) + "px");
      el.style.zIndex = i;
      el.innerHTML = l.svg;
      made.push({ el: el, depth: l.depth, front: !!l.front });
    });
    sc.layersMade = made;
    return sc;
  }

  // Draw a scene. trans: "fold" | "ink" | "fade" | "cut".
  function setScene(name, variant, trans) {
    if (name === cur.scene && variant === cur.variant) return Promise.resolve();
    var old = cur.layers;
    var hadScene = !!cur.scene;
    cur.scene = name;
    cur.variant = variant;
    if (reduced && trans !== "cut") trans = "fade";
    if (!hadScene) trans = trans === "ink" ? "ink" : "fade";

    function install() {
      var sc = buildLayers(name, variant);
      cur.layers = sc ? sc.layersMade : [];
      setFx(sc && sc.fx ? sc.fx : {});
      els.tint.className = "tint" + (sc && sc.light ? " tint-" + sc.light : "");
      els.stage.classList.toggle("is-dream", !!(sc && sc.dream));
      return cur.layers;
    }

    if (trans === "cut") {
      old.forEach(function (l) { l.el.remove(); });
      install();
      return Promise.resolve();
    }
    if (trans === "ink") {
      return inkCover().then(function () {
        old.forEach(function (l) { l.el.remove(); });
        install();
        return inkClear();
      });
    }
    if (trans === "fade") {
      old.forEach(function (l) { l.el.classList.add("is-leaving"); });
      var fresh = install();
      fresh.forEach(function (l) { l.el.classList.add("is-arriving"); });
      // Force a frame between the two states so the fade runs.
      void els.stage.offsetWidth;
      fresh.forEach(function (l) { l.el.classList.remove("is-arriving"); });
      return wait(700).then(function () { old.forEach(function (l) { l.el.remove(); }); });
    }
    // fold: front layers lie down first, then the new page stands up.
    var n = old.length;
    old.forEach(function (l, i) {
      l.folding = true;
      l.el.style.transitionDelay = ((n - 1 - i) * 70) + "ms";
      l.el.classList.add("is-folding");
    });
    return wait(380 + n * 70).then(function () {
      old.forEach(function (l) { l.el.remove(); });
      var fresh = install();
      fresh.forEach(function (l) { l.folding = true; l.el.classList.add("is-flat"); });
      void els.stage.offsetWidth;
      fresh.forEach(function (l, i) {
        l.el.style.transitionDelay = (i * 90) + "ms";
        l.el.classList.remove("is-flat");
      });
      return wait(560 + fresh.length * 90).then(function () {
        fresh.forEach(function (l) { l.folding = false; l.el.style.transitionDelay = ""; });
      });
    });
  }

  /* ── Ink blot transition ───────────────────────────────────────────── */
  var inkSeed = 1;
  function inkFrame(cx, progress, seed, alpha) {
    var c = els.ink, x = c.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    x.setTransform(pxScale, 0, 0, pxScale, 0, 0);
    var maxR = Math.hypot(W, H) * 0.62;
    var r = maxR * progress;
    var cy = H * 0.45;
    // Several feathered rings make a soft, wet edge.
    for (var ring = 0; ring < 6; ring++) {
      var rr = r * (1 - ring * 0.045);
      x.beginPath();
      for (var i = 0; i <= 64; i++) {
        var a = i / 64 * Math.PI * 2;
        var wob = 1 + 0.16 * P.noise2(Math.cos(a) * 2.2 + seed, Math.sin(a) * 2.2 + ring * 0.3, seed) + 0.05 * P.noise2(a * 6, seed, seed + 3);
        var px = cx + Math.cos(a) * rr * wob, py = cy + Math.sin(a) * rr * wob * 0.86;
        if (i) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.closePath();
      x.fillStyle = "rgba(28,24,22," + (alpha * (ring === 5 ? 1 : 0.18)) + ")";
      x.fill();
    }
  }

  function animate(ms, fn) {
    return new Promise(function (res) {
      var t0 = performance.now();
      function step(t) {
        var k = Math.min(1, (t - t0) / ms);
        fn(k);
        if (k < 1) requestAnimationFrame(step); else res();
      }
      requestAnimationFrame(step);
    });
  }

  function inkCover() {
    inkSeed = (inkSeed * 7 + 3) % 97;
    var cx = W * (0.3 + Math.random() * 0.25);
    els.ink.style.opacity = 1;
    inkCx = cx;
    return animate(reduced ? 1 : 720, function (k) { inkFrame(cx, 0.05 + Math.pow(k, 1.4) * 1.05, inkSeed, 1); });
  }
  var inkCx = W / 2;

  function inkClear() {
    return animate(reduced ? 1 : 820, function (k) {
      inkFrame(inkCx, 1.1, inkSeed, 1);
      els.ink.style.opacity = String(1 - k);
    }).then(function () {
      var x = els.ink.getContext("2d");
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, els.ink.width, els.ink.height);
      els.ink.style.opacity = 0;
    });
  }

  /* ── Figures ───────────────────────────────────────────────────────── */
  function artWidth() { return mode === "vertical" ? W - PANEL_W : W; }

  function placeFigure(f, pos, face) {
    var cast = kit.figures.CAST[f.who] || {};
    var h = FIG_H * (cast.scale || 1), w = h * FIG_ASPECT;
    var fx = (POS[pos] != null ? POS[pos] : +pos || 0.5) * artWidth();
    f.el.style.width = w + "px";
    f.el.style.height = h + "px";
    f.el.style.left = (fx - w / 2) + "px";
    f.el.style.top = (GROUND - h * 0.98) + "px";
    var flip = face ? face === "l" : (POS[pos] != null ? POS[pos] : 0.5) > 0.55;
    f.el.classList.toggle("is-flipped", flip);
    f.pos = pos; f.face = face; f.flip = flip; f.x = fx; f.w = w; f.h = h;
  }

  function figureArt(who, pose) {
    var d = document.createElement("div");
    d.className = "fig-pose";
    d.innerHTML = kit.figures.svg(who, pose);
    return d;
  }

  // Bring the figures on stage in line with the story's list.
  function setFigures(list, opts) {
    opts = opts || {};
    var instant = opts.instant || reduced;
    Object.keys(cur.figures).forEach(function (who) {
      if (!list[who]) exitFigure(who, instant);
    });
    Object.keys(list).forEach(function (who) {
      var want = list[who], f = cur.figures[who];
      if (!kit.figures.CAST[who]) return;
      if (!f) {
        f = { who: who, el: div("fig is-entering"), pose: want.pose };
        f.el.dataset.who = who;
        f.el.appendChild(figureArt(who, want.pose));
        els.figs.appendChild(f.el);
        placeFigure(f, want.pos, want.face);
        cur.figures[who] = f;
        if (instant) f.el.classList.remove("is-entering");
        else {
          void f.el.offsetWidth;
          f.el.classList.remove("is-entering");
        }
        return;
      }
      if (f.pose !== want.pose) {
        var old = f.el.querySelector(".fig-pose:last-child");
        var art = figureArt(who, want.pose);
        art.classList.add("is-new");
        f.el.appendChild(art);
        void art.offsetWidth;
        art.classList.remove("is-new");
        f.pose = want.pose;
        if (old) setTimeout(function () { old.remove(); }, instant ? 0 : 420);
      }
      if (f.pos !== want.pos || f.face !== want.face) placeFigure(f, want.pos, want.face);
    });
  }

  function exitFigure(who, instant) {
    var f = cur.figures[who];
    if (!f) return;
    delete cur.figures[who];
    if (instant) { f.el.remove(); return; }
    f.el.classList.add("is-leaving");
    setTimeout(function () { f.el.remove(); }, 520);
  }

  function clearFigures() {
    Object.keys(cur.figures).forEach(function (w) { exitFigure(w, true); });
  }

  function speak(who) {
    Object.keys(cur.figures).forEach(function (w) {
      var f = cur.figures[w];
      f.el.classList.toggle("is-speaking", w === who);
      f.el.classList.toggle("is-quiet", !!who && w !== who);
    });
  }

  // Where a figure's eye is, in stage units, for a falling tear.
  function eyePoint(who) {
    var f = cur.figures[who];
    if (!f) return null;
    var cast = kit.figures.CAST[who] || {};
    var e = cast.eye || [236, 162];
    var x = e[0] / 400 * f.w, y = e[1] / 1000 * f.h;
    if (f.flip) x = f.w - x;
    return { x: f.x - f.w / 2 + x + look.x * -22, y: GROUND - f.h * 0.98 + y };
  }

  function setMode(m) {
    mode = m;
    Object.keys(cur.figures).forEach(function (w) {
      var f = cur.figures[w];
      placeFigure(f, f.pos, f.face);
    });
  }

  /* ── Particles ─────────────────────────────────────────────────────── */
  var parts = [], fxKind = "none", fxWant = 0;
  var lastT = 0;

  var FX = {
    petals: {
      n: 26,
      spawn: function (p, fresh) {
        p.x = Math.random() * (W + 200) - 100; p.y = fresh ? Math.random() * H : -20;
        p.vx = 14 + Math.random() * 22; p.vy = 26 + Math.random() * 30;
        p.r = 5 + Math.random() * 5; p.a = Math.random() * 6.3; p.va = (Math.random() - 0.5) * 2;
        p.ph = Math.random() * 6.3; p.c = Math.random() < 0.5 ? "#f3b7bd" : "#ea94a0";
      },
      step: function (p, dt, t) {
        p.x += (p.vx + Math.sin(t / 900 + p.ph) * 18) * dt; p.y += p.vy * dt; p.a += p.va * dt;
        return p.y < H + 30 && p.x < W + 120;
      },
      draw: function (x, p, t) {
        x.save(); x.translate(p.x, p.y); x.rotate(p.a);
        x.scale(Math.cos(t / 500 + p.ph), 1);
        x.fillStyle = p.c;
        x.beginPath();
        x.moveTo(0, -p.r); x.quadraticCurveTo(p.r * 0.9, -p.r * 0.2, 0, p.r);
        x.quadraticCurveTo(-p.r * 0.9, -p.r * 0.2, 0, -p.r);
        x.fill(); x.restore();
      }
    },
    rain: {
      n: 140,
      spawn: function (p, fresh) {
        p.x = Math.random() * (W + 300) - 100; p.y = fresh ? Math.random() * H : -40 - Math.random() * 200;
        p.v = 900 + Math.random() * 500; p.l = 16 + Math.random() * 22; p.o = 0.18 + Math.random() * 0.3;
      },
      step: function (p, dt) { p.x -= p.v * 0.18 * dt; p.y += p.v * dt; return p.y < H + 40; },
      draw: function (x, p) {
        x.strokeStyle = "rgba(225,232,240," + p.o + ")"; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x + p.l * 0.18, p.y - p.l); x.stroke();
      }
    },
    snow: {
      n: 110,
      spawn: function (p, fresh) {
        p.x = Math.random() * (W + 200) - 100; p.y = fresh ? Math.random() * H : -20;
        p.z = Math.random(); p.r = 1.2 + p.z * 3.6; p.vy = 18 + p.z * 46; p.ph = Math.random() * 6.3;
      },
      step: function (p, dt, t) { p.y += p.vy * dt; p.x += Math.sin(t / 1400 + p.ph) * 14 * dt - 6 * dt; return p.y < H + 20; },
      draw: function (x, p) {
        x.fillStyle = "rgba(255,255,255," + (0.45 + p.z * 0.5) + ")";
        x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.3); x.fill();
      }
    },
    fireflies: {
      n: 18,
      spawn: function (p) {
        p.x = Math.random() * W; p.y = 380 + Math.random() * 460; p.ph = Math.random() * 6.3;
        p.vx = (Math.random() - 0.5) * 20; p.vy = (Math.random() - 0.5) * 12; p.life = 6 + Math.random() * 8;
      },
      step: function (p, dt, t) {
        p.x += (p.vx + Math.sin(t / 1300 + p.ph) * 10) * dt; p.y += (p.vy + Math.cos(t / 1700 + p.ph) * 8) * dt;
        p.life -= dt; return p.life > 0;
      },
      draw: function (x, p, t) {
        var o = (0.5 + 0.5 * Math.sin(t / 380 + p.ph)) * Math.min(1, p.life);
        var gr = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
        gr.addColorStop(0, "rgba(255,240,170," + o + ")"); gr.addColorStop(1, "rgba(255,230,140,0)");
        x.fillStyle = gr; x.beginPath(); x.arc(p.x, p.y, 14, 0, 6.3); x.fill();
      }
    },
    catkins: {
      n: 30,
      spawn: function (p, fresh) {
        p.x = fresh ? Math.random() * W : -20; p.y = 120 + Math.random() * 640; p.ph = Math.random() * 6.3;
        p.vx = 20 + Math.random() * 26; p.r = 2 + Math.random() * 2.5;
      },
      step: function (p, dt, t) { p.x += p.vx * dt; p.y += Math.sin(t / 1100 + p.ph) * 12 * dt - 3 * dt; return p.x < W + 30; },
      draw: function (x, p) {
        x.fillStyle = "rgba(255,255,250,.75)";
        x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.3); x.fill();
        x.fillStyle = "rgba(255,255,250,.25)";
        x.beginPath(); x.arc(p.x, p.y, p.r * 2.4, 0, 6.3); x.fill();
      }
    },
    leaves: {
      n: 16,
      spawn: function (p, fresh) {
        p.x = Math.random() * (W + 200) - 100; p.y = fresh ? Math.random() * H : -30;
        p.vx = -10 + Math.random() * 40; p.vy = 40 + Math.random() * 40; p.a = Math.random() * 6.3;
        p.va = (Math.random() - 0.5) * 3; p.ph = Math.random() * 6.3; p.r = 9 + Math.random() * 7;
        p.c = ["#c58b3a", "#b4652f", "#d9a95b", "#9c4f2c"][Math.floor(Math.random() * 4)];
      },
      step: function (p, dt, t) { p.x += (p.vx + Math.sin(t / 800 + p.ph) * 30) * dt; p.y += p.vy * dt; p.a += p.va * dt; return p.y < H + 30; },
      draw: function (x, p, t) {
        x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.scale(1, Math.cos(t / 420 + p.ph));
        x.fillStyle = p.c; x.beginPath();
        x.moveTo(-p.r, 0); x.quadraticCurveTo(0, -p.r * 0.6, p.r, 0); x.quadraticCurveTo(0, p.r * 0.6, -p.r, 0);
        x.fill(); x.restore();
      }
    },
    embers: {
      n: 40,
      spawn: function (p, fresh) {
        p.x = 520 + (Math.random() - 0.5) * 180; p.y = fresh ? 500 + Math.random() * 300 : 760;
        p.vy = -(40 + Math.random() * 70); p.vx = (Math.random() - 0.5) * 30; p.life = 2 + Math.random() * 3;
        p.ash = Math.random() < 0.4; p.ph = Math.random() * 6.3;
      },
      step: function (p, dt, t) { p.x += (p.vx + Math.sin(t / 300 + p.ph) * 14) * dt; p.y += p.vy * dt; p.life -= dt; return p.life > 0; },
      draw: function (x, p) {
        var o = Math.min(1, p.life);
        x.fillStyle = p.ash ? "rgba(70,62,58," + o * 0.7 + ")" : "rgba(255,170,90," + o + ")";
        x.beginPath(); x.arc(p.x, p.y, p.ash ? 2.4 : 1.6, 0, 6.3); x.fill();
      }
    },
    motes: {
      n: 46,
      spawn: function (p, fresh) {
        p.x = Math.random() * W; p.y = fresh ? Math.random() * H : H + 10; p.vy = -(8 + Math.random() * 18);
        p.ph = Math.random() * 6.3; p.r = 0.8 + Math.random() * 2.2;
      },
      step: function (p, dt, t) { p.y += p.vy * dt; p.x += Math.sin(t / 2000 + p.ph) * 8 * dt; return p.y > -10; },
      draw: function (x, p, t) {
        var o = 0.35 + 0.45 * Math.sin(t / 600 + p.ph);
        x.fillStyle = "rgba(240,210,140," + Math.max(0, o) + ")";
        x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.3); x.fill();
      }
    }
  };

  function setFx(fx) {
    // fx: { petals: 26 } or a kind name and amount
    var kind = "none", amount = 0;
    for (var k in fx) { if (FX[k]) { kind = k; amount = fx[k]; } }
    fxKind = kind;
    fxWant = reduced ? 0 : (FX[kind] ? (amount || FX[kind].n) : 0);
    parts = parts.filter(function () { return false; });
    seedParts();
  }

  function overrideFx(kind, amount) {
    if (kind === "none" || !FX[kind]) { fxKind = "none"; fxWant = 0; parts = []; return; }
    var o = {}; o[kind] = amount || FX[kind].n;
    setFx(o);
  }

  function seedParts() {
    var sys = FX[fxKind];
    if (!sys) return;
    for (var i = 0; i < fxWant; i++) { var p = {}; sys.spawn(p, true); parts.push(p); }
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    if (!reduced) applyParallax(t);
    var c = els.fx, x = c.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    var sys = FX[fxKind];
    if (!sys) return;
    x.setTransform(pxScale, 0, 0, pxScale, 0, 0);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      if (!sys.step(p, dt, t)) {
        if (parts.length <= fxWant) sys.spawn(p, false); else { parts.splice(i, 1); continue; }
      }
      sys.draw(x, p, t);
    }
  }

  /* ── Moments ───────────────────────────────────────────────────────── */
  function shake() {
    if (reduced) return;
    els.stage.classList.remove("is-shaking");
    void els.stage.offsetWidth;
    els.stage.classList.add("is-shaking");
  }

  function flash(color) {
    els.flash.style.background = color || "#fff";
    els.flash.classList.remove("is-on");
    void els.flash.offsetWidth;
    els.flash.classList.add("is-on");
  }

  function setDream(on) { els.stage.classList.toggle("is-dreaming", !!on); }

  // Redraw everything at once, for loading a saved place.
  function restore(st) {
    cur.scene = "";
    return setScene(st.bg, st.variant, "fade").then(function () {
      clearFigures();
      setFigures(st.figures || {}, { instant: true });
      if (st.fx && st.fx !== "auto") overrideFx(st.fx, st.fxAmount);
      setDream(st.dream);
    });
  }

  kit.stage = {
    mount: mount, fit: fit, setScene: setScene, setFigures: setFigures, clearFigures: clearFigures,
    speak: speak, eyePoint: eyePoint, setMode: setMode, overrideFx: overrideFx,
    shake: shake, flash: flash, setDream: setDream, restore: restore,
    el: function () { return els.stage; },
    scale: function () { return scale; },
    W: W, H: H, PANEL_W: PANEL_W
  };
})(window.HonglouKit);
