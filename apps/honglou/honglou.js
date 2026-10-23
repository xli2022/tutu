/* ── 还泪记 ────────────────────────────────────────────────────────────────
   A visual novel of 红楼梦. You are 林黛玉, come down to the world to repay
   a debt of sweet dew with every tear of a lifetime: ten crimson pearls on
   a red string. A tear shed for 宝玉 is repaid (它落进玉里); one shed for
   anything else falls in vain. How the pearls are spent decides the end.

   This file wires the page: it runs the story through the engine, writes
   each line onto the manuscript page in ink, raises flower lots for the
   choices, and keeps settings, saves and what has been unlocked.

   Persistence: localStorage "tutu.honglou.v1" holds settings, unlocked
   chapters / poems / endings, the lines already read, nine save slots, the
   quick slot and the place to resume.                                    */
(function () {
  "use strict";

  var kit = window.HonglouKit;
  var P = kit.paint, E = kit.engine, S = kit.stage, STORY = kit.story;
  var A = kit.audio || null;

  var STORE_KEY = "tutu.honglou.v1";
  var SLOTS = 9;
  var LOG_MAX = 300;
  var CN_NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function hash(s) {
    var h1 = 0x811c9dc5, h2 = 0x9747b28c;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ c, 0x5bd1e995);
      h2 ^= h2 >>> 15;
    }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  }

  var app = $("app"), wrap = $("stage-wrap"), page = $("page"), live = $("live");
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Store ──────────────────────────────────────────────────────────── */
  var DEFAULTS = { speed: 55, auto: 50, music: 60, sfx: 70, layout: "vertical", notes: true, skipUnread: false };
  var store = load();

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { s = null; }
    if (!s || s.v !== 1) s = { v: 1 };
    s.settings = Object.assign({}, DEFAULTS, s.settings || {});
    s.unlocked = s.unlocked || {};
    s.unlocked.chapters = s.unlocked.chapters || {};
    s.unlocked.poems = s.unlocked.poems || {};
    s.unlocked.endings = s.unlocked.endings || {};
    s.seen = s.seen || {};
    s.slots = s.slots || [];
    return s;
  }

  var saveTimer = 0;
  function persist(now) {
    clearTimeout(saveTimer);
    if (!now) { saveTimer = setTimeout(function () { persist(true); }, 400); return; }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* full or blocked: play on */ }
  }

  /* ── Layout ─────────────────────────────────────────────────────────── */
  function layout() {
    var portrait = window.innerWidth / window.innerHeight < 1.05;
    app.classList.toggle("is-portrait", portrait);
    app.classList.toggle("is-horizontal", store.settings.layout === "horizontal");
    var sc = S.fit();
    var r = wrap.getBoundingClientRect();
    var sw = S.W * sc, sh = S.H * sc;
    var st = app.style;
    st.setProperty("--u", sc.toFixed(4) + "px");
    st.setProperty("--sx", (r.left + (r.width - sw) / 2).toFixed(1) + "px");
    st.setProperty("--sy", (r.top + (r.height - sh) / 2).toFixed(1) + "px");
    st.setProperty("--sw", sw.toFixed(1) + "px");
    st.setProperty("--sh", sh.toFixed(1) + "px");
    S.setMode(portrait || store.settings.layout === "horizontal" ? "full" : "vertical");
    trimPage();
  }

  /* ── Story ──────────────────────────────────────────────────────────── */
  var program = E.parse(STORY.text);
  var machine = new E.Machine(program, {
    line: function (c) { queue(function () { showLine(c); }); },
    choice: function (c, opts) { queue(function () { showChoices(c, opts); }); },
    block: function (c) { queue(function () { showBlock(c); }); },
    stage: function (c, st) { stageCommand(c, st); },
    tear: function (kind, v) {
      var snap = { pearls: v.pearls, repaid: v.repaid, vain: v.vain };
      queue(function () { return dropPearl(kind, snap); });
    },
    note: function (text) { pendingNotes.push(text); },
    restore: function (st, v) { restoreStage(st, v); }
  });

  // Stage work runs in order, so a line waits for its scene to be drawn.
  var stageQ = Promise.resolve();
  function queue(fn) {
    stageQ = stageQ.then(fn).catch(function (e) { console.error(e); });
    return stageQ;
  }

  var playing = false;     // in the story (not on the title screen)
  var mode = "";           // "line" | "choice" | "block" | ""
  var autoOn = false, skipOn = false, ctrlSkip = false;
  var backlog = [];
  var lineCount = 0;

  /* ── Lines on the page ──────────────────────────────────────────────── */
  var reveal = { para: null, timer: 0, done: true, cmd: null };
  var pendingNotes = [];
  var notesShown = [];

  function speed() {
    var s = store.settings.speed;
    return s >= 100 ? 0 : Math.round(95 - s * 0.85);
  }

  function chars(text, start) {
    var a = Array.from(text), out = "";
    for (var i = 0; i < a.length; i++) out += '<span class="ch" style="--i:' + (i + start) + '">' + esc(a[i]) + "</span>";
    return out;
  }

  function quoteSay(c) {
    var t = c.text;
    if (c.op === "say" && t.charAt(0) !== "「" && t.charAt(0) !== "『") t = "「" + t + "」";
    return t;
  }

  function makePara(c) {
    var p = el("p", "para para-" + c.op);
    var html = "";
    if (c.op === "say") html += '<span class="seal">' + esc(c.name) + "</span>";
    html += chars(quoteSay(c), 0) + '<span class="more"></span>';
    p.innerHTML = html;
    return p;
  }

  function pageAdd(p) {
    var old = page.querySelectorAll(".para");
    for (var i = 0; i < old.length; i++) old[i].classList.add("is-old");
    page.appendChild(p);
    if (app.classList.contains("is-horizontal")) {
      for (var k = 0; k < old.length; k++) old[k].remove();
      return;
    }
    trimPage();
  }

  // A full page turns: keep only the newest paragraph.
  // In vertical writing the newest paragraph is the leftmost column; once
  // it runs past the page's left edge the oldest paragraphs come off the
  // right. A paragraph that cannot fit even alone is set a little smaller.
  function trimPage() {
    page.scrollLeft = 0;
    page.scrollTop = 0;
    if (app.classList.contains("is-horizontal")) return;
    var paras = page.querySelectorAll(".para");
    if (!paras.length) return;
    var newest = paras[paras.length - 1];
    var i = 0;
    while (overflows(newest) && paras.length - i > 1) {
      paras[i].remove();
      i++;
    }
    var size = 1;
    while (overflows(newest) && size > 0.72) {
      size -= 0.07;
      newest.style.fontSize = size + "em";
    }
    page.scrollLeft = 0;
  }

  function overflows(p) {
    var box = page.getBoundingClientRect(), r = p.getBoundingClientRect();
    return r.left < box.left - 1 || r.bottom > box.bottom + 1;
  }

  function clearPage() { page.innerHTML = ""; }

  function showLine(c) {
    mode = "line";
    hideChoices();
    var who = c.op === "say" ? c.who : (c.op === "think" ? "daiyu" : null);
    S.speak(c.op === "say" ? who : null);
    var p = makePara(c);
    pageAdd(p);
    flushNotes();
    var plain = (c.op === "say" ? c.name + "：" : "") + quoteSay(c);
    live.textContent = plain;
    logPush({ kind: c.op, name: c.name || "", text: quoteSay(c) });

    var key = hash((c.name || "") + c.text);
    var seen = !!store.seen[key];
    store.seen[key] = 1;
    lineCount++;
    if (lineCount % 6 === 0) remember();

    var n = Array.from(quoteSay(c)).length;
    var spd = speed();
    reveal.para = p; reveal.cmd = c; reveal.done = false; reveal.seen = seen;
    p.style.setProperty("--spd", spd + "ms");
    clearTimeout(reveal.timer);
    if (skipping()) {
      if (!seen && !store.settings.skipUnread) {
        stopSkip("未读之处，停下快进");
      } else {
        finishReveal();
        return;
      }
    }
    if (spd === 0) { finishReveal(); return; }
    reveal.timer = setTimeout(finishReveal, n * spd + 650);
    if (A) A.blip();
  }

  function finishReveal() {
    if (reveal.done) return;
    clearTimeout(reveal.timer);
    reveal.done = true;
    if (reveal.para) reveal.para.classList.add("is-done");
    if (skipping()) {
      reveal.timer = setTimeout(advance, 45);
    } else if (autoOn) {
      var n = reveal.cmd ? Array.from(reveal.cmd.text).length : 10;
      var k = 1.7 - store.settings.auto / 100 * 1.3;
      reveal.timer = setTimeout(advance, (700 + n * 50) * k);
    }
  }

  function advance() {
    if (!playing || sheetOpen() || mode !== "line") return;
    if (!reveal.done) { finishReveal(); return; }
    clearTimeout(reveal.timer);
    mode = "";
    machine.next();
  }

  /* ── Red marginal notes (朱批) ──────────────────────────────────────── */
  function flushNotes() {
    var box = $("notes");
    notesShown.forEach(function (n) { n.age++; });
    notesShown = notesShown.filter(function (n) {
      if (n.age > 2 || pendingNotes.length) { fadeNote(n.el); return false; }
      return true;
    });
    while (pendingNotes.length) {
      var t = pendingNotes.shift();
      // Manuscript notes carry no punctuation; a pause is a small space.
      var m = t.replace(/[，。、；：？！]/g, "　").split("——");
      var n = el("span", "note", box);
      n.innerHTML = esc(m[0]) + (m[1] ? "<b>" + esc(m[1]) + "</b>" : "");
      notesShown.push({ el: n, age: 0 });
      (function (node) { setTimeout(function () { node.classList.add("is-on"); }, 500); })(n);
      logPush({ kind: "note", text: t });
    }
  }

  function fadeNote(node) {
    node.classList.remove("is-on");
    setTimeout(function () { node.remove(); }, 1000);
  }

  function clearNotes() {
    notesShown.forEach(function (n) { fadeNote(n.el); });
    notesShown = [];
  }

  /* ── Stage commands ─────────────────────────────────────────────────── */
  function stageCommand(c, st) {
    switch (c.op) {
      case "bg": {
        var trans = skipping() ? "cut" : c.trans;
        queue(function () {
          clearPage();
          clearNotes();
          S.clearFigures();
          return S.setScene(c.scene, c.variant, trans);
        });
        break;
      }
      case "show": case "hide": case "pose": case "move": {
        var figs = JSON.parse(JSON.stringify(st.figures));
        queue(function () {
          S.setFigures(figs, { instant: skipping() });
          if (c.op === "show" && !skipping()) return wait(260);
        });
        break;
      }
      case "fx":
        queue(function () { S.overrideFx(c.kind, c.amount); });
        break;
      case "music":
        if (A) A.music(c.mood);
        break;
      case "sound":
        queue(function () { if (A && !skipping()) A.sfx(c.name); });
        break;
      case "dream":
        queue(function () { S.setDream(c.on); });
        break;
      case "hud":
        queue(function () { app.classList.toggle("show-hud", c.on); });
        break;
      case "shake":
        queue(function () { if (!skipping()) S.shake(); });
        break;
      case "flash":
        queue(function () { if (!skipping()) S.flash(c.color); });
        break;
    }
  }

  function restoreStage(st, v) {
    queue(function () {
      clearPage();
      clearNotes();
      drawHud(v);
      app.classList.toggle("show-hud", !!st.hud);
      if (A) A.music(st.music || "off");
      return S.restore(st);
    });
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ── Tears ──────────────────────────────────────────────────────────── */
  var JADE_SLOTS = E.PEARLS;

  function drawHud(v) {
    var box = $("hud-pearls");
    box.innerHTML = "";
    for (var i = 0; i < E.PEARLS; i++) {
      var p = el("span", "pearl" + (i >= v.pearls ? " is-spent" : ""), box);
      p.dataset.i = i;
    }
    $("hud-jade").innerHTML = jadeSVG(v.repaid);
  }

  // The jade (宝玉) the repaid tears gather in: a pale bi disc with a ring
  // of seats, one for each pearl.
  function jadeSVG(repaid) {
    var s = '<svg viewBox="-50 -50 100 100"><defs>' +
      '<radialGradient id="jadeG" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#f4faf3"/><stop offset=".6" stop-color="#cfe2d3"/><stop offset="1" stop-color="#9fbea9"/></radialGradient>' +
      '<radialGradient id="pearlG" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#d9566a"/><stop offset="1" stop-color="#7e1620"/></radialGradient></defs>' +
      '<circle r="44" fill="url(#jadeG)" stroke="#86a893" stroke-width="1.5"/>' +
      '<circle r="15" fill="#2a2420" opacity=".55"/><circle r="15" fill="none" stroke="#86a893" stroke-width="1.5"/>' +
      '<circle r="30" fill="none" stroke="#a9c4b0" stroke-width=".8" stroke-dasharray="2 3"/>';
    for (var i = 0; i < JADE_SLOTS; i++) {
      var a = -Math.PI / 2 + i / JADE_SLOTS * Math.PI * 2;
      var x = (Math.cos(a) * 30).toFixed(1), y = (Math.sin(a) * 30).toFixed(1);
      s += i < repaid ? '<circle cx="' + x + '" cy="' + y + '" r="5.6" fill="url(#pearlG)" class="jade-pearl"/>' :
        '<circle cx="' + x + '" cy="' + y + '" r="3.2" fill="#b6cdbb" opacity=".8"/>';
    }
    return s + "</svg>";
  }

  function dropPearl(kind, v) {
    var pearls = $("hud-pearls").children;
    var idx = v.pearls;   // the pearl that just fell (counted from the top)
    var src = pearls[idx];
    var fast = skipping() || reducedMotion;
    if (A && !fast) A.sfx(kind === "repay" ? "pearl" : "drop");

    // A tear first, if she is on stage to shed it.
    var eye = S.eyePoint("daiyu");
    if (eye && !fast) {
      var t = el("span", "teardrop", app);
      var sc = S.scale(), rr = wrap.getBoundingClientRect();
      var offX = rr.left + (rr.width - S.W * sc) / 2, offY = rr.top + (rr.height - S.H * sc) / 2;
      t.style.left = (offX + eye.x * sc) + "px";
      t.style.top = (offY + eye.y * sc) + "px";
      setTimeout(function () { t.remove(); }, 1700);
    }

    var word = $("hud-word");
    word.textContent = kind === "repay" ? "还" : "枉";
    word.classList.toggle("is-vain", kind !== "repay");
    word.classList.add("is-on");
    setTimeout(function () { word.classList.remove("is-on"); }, fast ? 300 : 1800);
    logPush({ kind: "tear", text: kind === "repay" ? "泪落，还其一。" : "泪落，枉自一颗。" });

    if (!src || fast || !app.classList.contains("show-hud")) {
      drawHud(v);
      return fast ? null : wait(500);
    }
    var a = src.getBoundingClientRect();
    var jade = $("hud-jade").getBoundingClientRect();
    var fp = el("span", "falling-pearl", app);
    fp.style.left = (a.left + a.width / 2) + "px";
    fp.style.top = (a.top + a.height / 2) + "px";
    src.classList.add("is-spent");
    var anim;
    if (kind === "repay") {
      var slot = v.repaid - 1, ang = -Math.PI / 2 + slot / JADE_SLOTS * Math.PI * 2;
      var tx = jade.left + jade.width / 2 + Math.cos(ang) * jade.width * 0.3 - (a.left + a.width / 2);
      var ty = jade.top + jade.height / 2 + Math.sin(ang) * jade.height * 0.3 - (a.top + a.height / 2);
      anim = fp.animate([
        { transform: "translate(0,0) scale(1)" },
        { transform: "translate(" + (tx * 0.4 + 30) + "px," + (ty * 0.5) + "px) scale(1.25)", offset: 0.45 },
        { transform: "translate(" + tx + "px," + ty + "px) scale(.55)" }
      ], { duration: 1300, easing: "cubic-bezier(.4,0,.2,1)" });
    } else {
      var fall = window.innerHeight - a.top + 40;
      anim = fp.animate([
        { transform: "translate(0,0)", opacity: 1 },
        { transform: "translate(" + (14 + Math.random() * 30) + "px," + fall * 0.55 + "px)", opacity: 0.9, offset: 0.6 },
        { transform: "translate(" + (30 + Math.random() * 40) + "px," + fall + "px)", opacity: 0 }
      ], { duration: 1400, easing: "cubic-bezier(.5,0,.9,.5)" });
    }
    return new Promise(function (res) {
      anim.onfinish = function () {
        fp.remove();
        $("hud-jade").innerHTML = jadeSVG(v.repaid);
        res();
      };
    });
  }

  /* ── Choices: flower lots ───────────────────────────────────────────── */
  var FLOWERS = [
    // peach, lotus, plum, chrysanthemum: painted on the lot's head.
    { petal: "#f2a9b3", heart: "#b2434f", n: 5, long: 0.95 },
    { petal: "#f3c7cf", heart: "#d9b54a", n: 8, long: 1.25 },
    { petal: "#fbf3ee", heart: "#b2434f", n: 5, long: 0.85 },
    { petal: "#e9c46a", heart: "#a0702b", n: 14, long: 1.4 }
  ];

  function flowerSVG(i) {
    var f = FLOWERS[i % FLOWERS.length], d = "";
    for (var k = 0; k < f.n; k++) {
      var a = k / f.n * Math.PI * 2;
      d += P.leaf(32 + Math.cos(a) * 3, 32 + Math.sin(a) * 3, a, 24 * f.long, f.n > 8 ? 7 : 16);
    }
    return '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="#2d3a2f" opacity=".9"/>' +
      '<path d="' + d + '" fill="' + f.petal + '" stroke="' + P.shade(f.petal, -0.25) + '" stroke-width=".8"/>' +
      '<circle cx="32" cy="32" r="5" fill="' + f.heart + '"/></svg>';
  }

  var choiceOpts = [];
  function showChoices(c, opts) {
    mode = "choice";
    stopAuto();
    if (skipping()) stopSkip();
    S.speak(null);
    if (c.prompt) {
      var p = el("p", "para para-prompt is-done");
      p.textContent = c.prompt;
      pageAdd(p);
      live.textContent = c.prompt;
    }
    flushNotes();
    choiceOpts = opts;
    var box = $("choices"), sticks = $("sticks");
    sticks.innerHTML = "";
    opts.forEach(function (o, i) {
      var b = el("button", "stick", sticks);
      b.type = "button";
      b.style.setProperty("--k", i);
      b.innerHTML = '<span class="stick-flower" aria-hidden="true">' + flowerSVG(i) + '</span><span class="stick-text">' + esc(o.text) + '</span><span class="stick-key" aria-hidden="true">' + (i + 1) + "</span>";
      b.addEventListener("click", function (e) { e.stopPropagation(); pick(i); });
    });
    box.hidden = false;
    setTimeout(function () {
      var first = sticks.querySelector(".stick");
      if (first && document.activeElement === document.body) first.focus({ preventScroll: true });
    }, 600);
    if (A) A.sfx("lots");
  }

  function pick(i) {
    if (mode !== "choice" || !choiceOpts[i]) return;
    mode = "";
    var sticks = $("sticks").children;
    for (var k = 0; k < sticks.length; k++) sticks[k].classList.add(k === i ? "is-picked" : "is-dropped");
    logPush({ kind: "pick", text: choiceOpts[i].text });
    if (A) A.sfx("pick");
    setTimeout(function () {
      hideChoices();
      machine.choose(i);
    }, reducedMotion ? 0 : 650);
  }

  function hideChoices() { $("choices").hidden = true; $("sticks").innerHTML = ""; }

  /* ── Interludes ─────────────────────────────────────────────────────── */
  var inter = $("interlude");
  var interDone = null;

  function openInterlude(cls, html, onDone) {
    inter.className = "interlude " + cls;
    inter.innerHTML = html;
    inter.hidden = false;
    interDone = onDone;
  }

  function closeInterlude(then) {
    if (inter.hidden) { if (then) then(); return; }
    inter.classList.add("is-out");
    interDone = null;
    setTimeout(function () {
      inter.hidden = true;
      inter.className = "interlude";
      inter.innerHTML = "";
      if (then) then();
    }, reducedMotion ? 0 : 650);
  }

  inter.addEventListener("click", function (e) {
    if (e.target.closest("button")) return;
    if (interDone) interDone();
  });

  function showBlock(c) {
    mode = "block";
    hideChoices();
    switch (c.op) {
      case "chapter": return showChapter(c);
      case "card": return showCard(c);
      case "poem": return showPoem(c.id, function () { closeInterlude(function () { mode = ""; machine.next(); }); });
      case "ending": return showEnding(c.id);
      case "compose": return showCompose(c.id);
      case "wait":
        setTimeout(function () { mode = ""; machine.next(); }, skipping() ? 0 : c.ms);
        return;
    }
  }

  function chapterMeta(id) { return (STORY.chapters && STORY.chapters[id]) || {}; }

  function showChapter(c) {
    clearPage();
    clearNotes();
    S.speak(null);
    var meta = chapterMeta(c.id);
    // Unlock with the numbers as they stand now, so the chapter can be
    // replayed from here later.
    store.unlocked.chapters[c.id] = { vars: JSON.parse(JSON.stringify(machine.vars)), at: Date.now() };
    persist();
    var parts = c.title.split("·").map(function (s) { return s.trim(); });
    var couplet = (c.sub || "").split(/[\/　]+/).filter(Boolean);
    var html = '<div class="chapter-card">' +
      '<svg class="chapter-ink" viewBox="0 0 400 400" aria-hidden="true">' + enso(hash(c.id)) + "</svg>" +
      '<div class="chapter-num">' + esc(parts[0] || "") + "</div>" +
      '<h2 class="chapter-name">' + chars(parts[1] || "", 4) + "</h2>" +
      couplet.map(function (l, i) { return '<p class="chapter-couplet">' + chars(l, 10 + i * 9) + "</p>"; }).join("") +
      (meta.season ? '<span class="seal chapter-season">' + esc(meta.season) + "</span>" : "") +
      "</div>";
    openInterlude("interlude-paper", html, function () { closeInterlude(function () { mode = ""; machine.next(); }); });
    inter.querySelectorAll(".ch").forEach(function (n) { n.parentNode.style.setProperty("--spd", "90ms"); });
    remember(true);
    if (A) A.sfx("page");
    if (skipping() || autoOn) setTimeout(function () { if (interDone) interDone(); }, skipping() ? 300 : 3600);
  }

  // A brushed ink circle behind the chapter title.
  function enso(seed) {
    var r = P.rng(parseInt(seed.slice(0, 6), 36));
    var pts = [], n = 40, start = r() * 6.28;
    for (var i = 0; i <= n; i++) {
      var a = start + i / n * Math.PI * 1.86;
      var rad = 150 + P.noise1(i * 0.3, 5) * 8;
      pts.push([200 + Math.cos(a) * rad, 200 + Math.sin(a) * rad]);
    }
    return '<path d="' + P.stroke(pts, 3, 26, 1.5) + '" fill="#2a2420" opacity=".07"/>' +
      '<path d="' + P.stroke(pts.slice(4, 30), 1, 9, 0.5) + '" fill="#2a2420" opacity=".08"/>';
  }

  function showCard(c) {
    var text = c.text.split("/").map(function (s) { return s.trim(); }).join("\n");
    openInterlude("interlude-dark", '<p class="card-text">' + chars(text, 0) + "</p>", function () {
      closeInterlude(function () { mode = ""; machine.next(); });
    });
    logPush({ kind: "narr", text: text.replace(/\n/g, "") });
    if (skipping()) setTimeout(function () { if (interDone) interDone(); }, 200);
    else if (autoOn) setTimeout(function () { if (interDone) interDone(); }, 2500 + text.length * 90);
  }

  /* ── Poems on a hand scroll ─────────────────────────────────────────── */
  function poemPages(poem) {
    // Columns that fit across the screen, leaving room for the title.
    var u = S.scale();
    var colW = Math.max(18, u * 37) * 1.9;
    var room = Math.min(window.innerWidth * 0.86, u * 1500) - Math.max(80, u * 260);
    var per = Math.max(4, Math.floor(room / colW));
    var lines = poem.lines, pages = [], cur = [];
    for (var i = 0; i < lines.length; i++) {
      cur.push(lines[i]);
      var full = cur.length >= per;
      var stanzaEnd = lines[i + 1] === "";
      if (full || (stanzaEnd && cur.length >= per - 2)) { pages.push(cur); cur = []; if (stanzaEnd) i++; }
    }
    if (cur.length) pages.push(cur);
    return pages;
  }

  function showPoem(id, done) {
    var poem = STORY.poems[id];
    if (!poem) { done(); return; }
    store.unlocked.poems[id] = 1;
    persist();
    var pages = poemPages(poem), pi = 0;
    logPush({ kind: "narr", text: "〔" + poem.title + "〕" });
    if (A) A.sfx("scroll");

    function render() {
      var lines = pages[pi], idx = 0;
      var html = '<div class="scroll"><div class="roller"></div><div class="scroll-paper"><div class="scroll-inner">';
      if (pi === 0) html += '<h2 class="poem-title">' + esc(poem.title) + "</h2>" + (poem.by ? '<p class="poem-by">' + esc(poem.by) + "</p>" : "");
      lines.forEach(function (l) {
        if (l === "") { html += '<p class="poem-line is-gap"></p>'; return; }
        html += '<p class="poem-line">' + chars(l, idx) + "</p>";
        idx += Array.from(l).length + 3;
      });
      if (pi === pages.length - 1 && poem.seal) html += '<span class="seal poem-seal">' + esc(poem.seal) + "</span>";
      html += "</div>";
      if (poem.note && pi === pages.length - 1) html += '<p class="poem-note">' + esc(poem.note) + "</p>";
      html += '</div><div class="roller"></div></div>';
      if (pages.length > 1) html += '<p class="poem-pager">' + (pi + 1) + " / " + pages.length + "</p>";
      openInterlude("interlude-dark", html, next);
      var paper = inter.querySelector(".scroll-paper"), inner = inter.querySelector(".scroll-inner");
      // As tall as the longest column, not the whole screen.
      var u = S.scale(), lineFS = Math.max(18, u * 37), titleFS = Math.max(24, u * 54), pad = Math.max(20, u * 56);
      var longest = 0;
      lines.forEach(function (l) { longest = Math.max(longest, Array.from(l).length * lineFS * 1.08); });
      if (pi === 0) longest = Math.max(longest, Array.from(poem.title).length * titleFS * 1.12 + (poem.by ? Array.from(poem.by).length * Math.max(13, u * 24) * 1.1 + 30 : 0));
      inter.querySelector(".scroll").style.height = Math.min(window.innerHeight * 0.88, Math.max(u * 360, longest + pad * 2 + 20)) + "px";
      inter.querySelectorAll(".poem-line").forEach(function (n) { n.style.setProperty("--spd", "70ms"); });
      requestAnimationFrame(function () {
        paper.style.width = inner.scrollWidth + "px";
        var seal = inter.querySelector(".poem-seal");
        if (seal) setTimeout(function () { seal.classList.add("is-on"); if (A) A.sfx("seal"); }, reducedMotion ? 0 : 1100 + idx * 70);
      });
      if (autoOn) setTimeout(function () { if (interDone === next) next(); }, 2200 + idx * 140);
    }

    function next() {
      if (pi < pages.length - 1) { pi++; render(); if (A) A.sfx("scroll"); }
      else done();
    }
    render();
  }

  /* ── Endings ────────────────────────────────────────────────────────── */
  function showEnding(id) {
    var end = STORY.endings[id] || { name: id, text: [] };
    store.unlocked.endings[id] = { at: Date.now(), repaid: machine.vars.repaid, vain: machine.vars.vain };
    store.resume = null;
    persist(true);
    stopAuto(); stopSkip();
    var v = machine.vars, dots = "";
    for (var i = 0; i < v.repaid; i++) dots += '<span class="dot"></span>';
    for (var k = 0; k < v.vain; k++) dots += '<span class="dot is-vain"></span>';
    var poems = Object.keys(store.unlocked.poems).length, total = Object.keys(STORY.poems).length;
    var html = '<div class="ending">' +
      '<span class="seal ending-kind">' + esc(end.kind || "终") + "</span>" +
      '<h2 class="ending-name">' + chars(end.name, 0) + "</h2>" +
      '<p class="ending-text">' + chars(end.text.join("\n"), 8) + "</p>" +
      '<p class="ending-tally">还泪 ' + CN_NUM[v.repaid] + "　枉泪 " + CN_NUM[v.vain] + "<br>" + dots + "<br>诗稿 " + poems + " / " + total + "</p>" +
      '<div class="ending-actions"><button type="button" class="btn btn-light" data-end="home">回到卷首</button></div>' +
      "</div>";
    openInterlude("interlude-dark", html, null);
    inter.querySelector(".ending-text").style.whiteSpace = "pre-line";
    inter.querySelector('[data-end="home"]').addEventListener("click", function () {
      closeInterlude(function () { mode = ""; toTitle(); });
    });
    if (A) A.music(end.music || "dream");
  }

  /* ── Compose: build a poem couplet by couplet ───────────────────────── */
  function showCompose(id) {
    var spec = STORY.compose[id];
    var picked = [], picks = [];
    var counts = {};
    function render() {
      var step = picked.length;
      var sheet = '<div class="compose-sheet"><h3>' + esc(spec.title) + '</h3><span class="rule">' + esc(spec.rule) + "</span>";
      for (var i = 0; i < spec.slots; i++) {
        var c = picked[i];
        if (c) sheet += '<div class="slot is-filled">' + esc(c.lines[0]) + "</div><div class=\"slot is-filled\">" + esc(c.lines[1]) + "</div>";
        else sheet += '<div class="slot">' + "〇〇〇〇〇〇〇" + '</div><div class="slot">〇〇〇〇〇〇〇</div>';
      }
      sheet += "</div>";
      var pickHtml = "";
      if (step < spec.slots) {
        pickHtml = '<p class="compose-hint">' + esc(spec.prompts[step]) + '</p><div class="compose-pick">';
        spec.options[step].forEach(function (o, k) {
          pickHtml += '<button type="button" class="stick" style="--k:' + k + '" data-k="' + k + '"><span class="stick-text">' + esc(o.lines[0]) + "<br>" + esc(o.lines[1]) + "</span></button>";
        });
        pickHtml += "</div>";
      } else {
        pickHtml = '<p class="compose-hint">诗成。点击纸面，交卷。</p>';
      }
      openInterlude("interlude-dark compose-wrap", '<div class="compose">' + sheet + pickHtml + "</div>", step >= spec.slots ? finish : null);
      var cu = S.scale(), cfs = Math.max(18, cu * 36);
      inter.querySelector(".compose-sheet").style.setProperty("--sheet-h", Math.max(Array.from(spec.title).length * cfs * 1.3 + 40, 7 * cfs * 1.16) + Math.max(36, cu * 96) + "px");
      inter.querySelectorAll(".compose-pick .stick").forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          var o = spec.options[step][+b.dataset.k];
          picked.push(o);
          picks.push(+b.dataset.k);
          counts[o.from] = (counts[o.from] || 0) + 1;
          if (A) A.sfx("brush");
          render();
        });
      });
    }
    function finish() {
      var lines = [];
      picked.forEach(function (o) { lines.push(o.lines[0] + "，" + o.lines[1] + "。"); });
      STORY.poems[spec.result] = composedPoem(spec, picks);
      store.unlocked.poems[spec.result] = 1;
      store.composed = store.composed || {};
      store.composed[spec.result] = picks.slice();
      persist();
      var effects = [];
      Object.keys(spec.tally).forEach(function (k) { effects.push({ name: spec.tally[k], op: "=", n: counts[k] || 0 }); });
      logPush({ kind: "narr", text: lines.join("") });
      showPoem(spec.result, function () { closeInterlude(function () { mode = ""; machine.resume(effects); }); });
    }
    render();
  }

  /* ── Backlog ────────────────────────────────────────────────────────── */
  function logPush(item) {
    backlog.push(item);
    if (backlog.length > LOG_MAX) backlog.shift();
  }

  /* ── Auto and skip ──────────────────────────────────────────────────── */
  function skipping() { return skipOn || ctrlSkip; }

  function setAuto(on) {
    autoOn = on;
    toolOn("auto", on);
    if (on) { stopSkip(); if (mode === "line" && reveal.done) finishRevealAgain(); }
  }
  function stopAuto() { if (autoOn) setAuto(false); }

  function setSkip(on) {
    skipOn = on;
    toolOn("skip", on);
    if (on) { stopAuto(); if (mode === "line") { if (!reveal.done) finishReveal(); else advance(); } }
  }
  function stopSkip(msg) {
    var was = skipOn || ctrlSkip;
    skipOn = false; ctrlSkip = false;
    toolOn("skip", false);
    if (was && msg) toast(msg);
  }

  function finishRevealAgain() {
    reveal.done = false;
    finishReveal();
  }

  function toolOn(act, on) {
    var b = document.querySelector('.tools [data-act="' + act + '"]');
    if (b) { b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); }
  }

  /* ── Saving ─────────────────────────────────────────────────────────── */
  function snapshot() {
    var snap = machine.snapshot();
    var cmd = program.cmds[snap.pc] || {};
    var ch = program.chapters.filter(function (c) { return c.id === snap.chapter; })[0];
    return {
      at: Date.now(),
      chapter: snap.chapter,
      title: ch ? ch.title : "",
      text: cmd.text ? (cmd.name ? cmd.name + "：" : "") + cmd.text : (cmd.prompt || ""),
      snap: snap,
      log: backlog.slice(-60),
      hud: app.classList.contains("show-hud")
    };
  }

  // The place 续读 picks up from.
  function remember(now) {
    if (!playing) return;
    store.resume = snapshot();
    persist(now);
  }

  function loadSave(s) {
    if (!s || !s.snap || program.cmds[s.snap.pc] == null) { toast("此卷已不可读"); return; }
    closeSheet();
    closeInterlude();
    startPlaying();
    backlog = (s.log || []).slice();
    hideChoices();
    machine.restore(s.snap);
  }

  /* ── Sheets (menus) ─────────────────────────────────────────────────── */
  var sheetWrap = $("sheet-wrap"), sheetBody = $("sheet-body"), sheetTitle = $("sheet-title");
  var sheetReturn = null;

  function sheetOpen() { return !sheetWrap.hidden; }

  function openSheet(title, build) {
    stopAuto();
    sheetReturn = document.activeElement;
    sheetTitle.textContent = title;
    sheetBody.innerHTML = "";
    build(sheetBody);
    sheetWrap.hidden = false;
    var f = sheetWrap.querySelector("button:not([disabled]), input");
    if (f) f.focus({ preventScroll: true });
  }

  function closeSheet() {
    if (sheetWrap.hidden) return;
    sheetWrap.hidden = true;
    sheetBody.innerHTML = "";
    if (sheetReturn && sheetReturn.focus) sheetReturn.focus({ preventScroll: true });
  }

  $("sheet-close").addEventListener("click", closeSheet);
  sheetWrap.addEventListener("click", function (e) { if (e.target === sheetWrap) closeSheet(); });

  function when(t) {
    var d = new Date(t);
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate()) + "　" + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function slotCard(parent, s, label, onClick, disabled) {
    var b = el("button", "slot-card" + (s ? "" : " is-empty"), parent);
    b.type = "button";
    b.innerHTML = '<span class="seal slot-no">' + esc(label) + "</span>" +
      '<span class="slot-name">' + esc(s ? (s.title || "楔子") : "空白") + "</span>" +
      (s ? '<span class="slot-when">' + when(s.at) + '</span><span class="slot-text">' + esc(s.text || "") + "</span>" : '<span class="slot-when">尚未落笔</span>');
    if (disabled) b.disabled = true;
    else b.addEventListener("click", onClick);
    return b;
  }

  function openSave() {
    if (!playing) return;
    openSheet("存档", function (body) {
      var grid = el("div", "slots", body);
      for (var i = 0; i < SLOTS; i++) {
        (function (i) {
          slotCard(grid, store.slots[i], CN_NUM[i + 1], function () {
            function doSave() {
              store.slots[i] = snapshot();
              persist(true);
              closeSheet();
              toast("已存于第" + CN_NUM[i + 1] + "页");
            }
            if (store.slots[i]) confirmBox("覆盖第" + CN_NUM[i + 1] + "页的存档？", doSave); else doSave();
          });
        })(i);
      }
    });
  }

  function openLoad() {
    openSheet("读档", function (body) {
      var grid = el("div", "slots", body);
      slotCard(grid, store.resume, "续", function () { loadSave(store.resume); }, !store.resume);
      slotCard(grid, store.quick, "速", function () { loadSave(store.quick); }, !store.quick);
      for (var i = 0; i < SLOTS; i++) {
        (function (i) { slotCard(grid, store.slots[i], CN_NUM[i + 1], function () { loadSave(store.slots[i]); }, !store.slots[i]); })(i);
      }
    });
  }

  function confirmBox(msg, yes) {
    openSheet("确认", function (body) {
      var box = el("div", "confirm", body);
      el("p", "", box, msg);
      var row = el("div", "confirm-actions", box);
      var no = el("button", "btn", row, "罢了");
      var ok = el("button", "btn btn-solid", row, "是");
      no.type = ok.type = "button";
      no.addEventListener("click", closeSheet);
      ok.addEventListener("click", function () { closeSheet(); yes(); });
      ok.focus();
    });
  }

  function openConfig() {
    openSheet("设置", function (body) {
      var f = el("div", "config", body);
      function range(label, key, min, max) {
        var l = el("label", "", f, label);
        var inp = el("input", "", f);
        inp.type = "range"; inp.min = min; inp.max = max; inp.value = store.settings[key];
        inp.id = "cfg-" + key; l.htmlFor = inp.id;
        inp.addEventListener("input", function () {
          store.settings[key] = +inp.value;
          persist();
          if (A && (key === "music" || key === "sfx")) A.volume(store.settings.music / 100, store.settings.sfx / 100);
          if (key === "speed") applySpeed();
        });
      }
      function seg(label, key, opts) {
        el("span", "", f, label);
        var s = el("div", "seg", f);
        s.setAttribute("role", "group");
        s.setAttribute("aria-label", label);
        opts.forEach(function (o) {
          var b = el("button", store.settings[key] === o[0] ? "is-on" : "", s, o[1]);
          b.type = "button";
          b.setAttribute("aria-pressed", store.settings[key] === o[0] ? "true" : "false");
          b.addEventListener("click", function () {
            store.settings[key] = o[0];
            persist();
            Array.prototype.forEach.call(s.children, function (x) { x.classList.toggle("is-on", x === b); x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
            applySettings();
          });
        });
      }
      range("文字速度", "speed", 0, 100);
      range("自动速度", "auto", 0, 100);
      range("琴声", "music", 0, 100);
      range("音效", "sfx", 0, 100);
      seg("书写", "layout", [["vertical", "竖排"], ["horizontal", "横排"]]);
      seg("朱批", "notes", [[true, "显"], [false, "隐"]]);
      seg("快进", "skipUnread", [[false, "只过已读"], [true, "未读亦过"]]);
      var note = el("p", "config-note", f);
      note.innerHTML = "点击或空格翻页，↑ 回顾，A 自动，S 快进（按住 Ctrl 亦可），H 隐去文字，Q 速存，Esc 设置。";
      var row = el("div", "", f);
      row.style.gridColumn = "1 / -1";
      var wipe = el("button", "btn", row, "抹去全部存档与进度");
      wipe.type = "button";
      wipe.addEventListener("click", function () {
        confirmBox("抹去全部存档、诗稿与回目？此事不可追悔。", function () {
          var keep = store.settings;
          store = load();
          store.slots = []; store.unlocked = { chapters: {}, poems: {}, endings: {} }; store.seen = {}; store.resume = null; store.quick = null;
          store.settings = keep;
          try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
          persist(true);
          toast("已抹去");
          refreshTitle();
        });
      });
    });
  }

  function openLog() {
    if (!playing) return;
    openSheet("回顾", function (body) {
      var log = el("div", "log", body);
      if (!backlog.length) { el("p", "log-empty", log, "尚无可回顾之处。"); return; }
      backlog.forEach(function (b) {
        var p = el("p", b.kind === "think" ? "log-think" : b.kind === "pick" ? "log-pick" : "", log);
        if (b.kind === "say") p.innerHTML = '<span class="seal">' + esc(b.name) + "</span>" + esc(b.text);
        else if (b.kind === "pick") p.textContent = "〔择〕" + b.text;
        else if (b.kind === "note") { p.textContent = "〔批〕" + b.text; p.style.color = "var(--zhu)"; }
        else if (b.kind === "tear") { p.textContent = b.text; p.style.color = "var(--jiang)"; }
        else p.textContent = b.text;
      });
      requestAnimationFrame(function () { log.scrollLeft = -log.scrollWidth; });
      log.addEventListener("wheel", function (e) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { log.scrollLeft -= e.deltaY; e.preventDefault(); }
      }, { passive: false });
    });
  }

  function openPoems() {
    openSheet("诗稿", function (body) {
      var shelf = el("div", "shelf", body);
      var ids = Object.keys(STORY.poems).filter(function (id) { return !STORY.poems[id].hidden || store.unlocked.poems[id]; });
      ids.forEach(function (id) {
        var p = STORY.poems[id], got = !!store.unlocked.poems[id];
        var b = el("button", "shelf-item", shelf);
        b.type = "button";
        b.innerHTML = '<span class="t">' + esc(got ? p.title : "未得") + '</span><span class="s">' + esc(got ? (p.by || "") : "") + "</span>" + (got && p.seal ? '<span class="seal">' + esc(p.seal) + "</span>" : "");
        if (!got) b.disabled = true;
        else b.addEventListener("click", function () {
          var back = function () { closeInterlude(function () { mode = playing ? mode : ""; }); };
          closeSheet();
          showPoem(id, back);
        });
      });
      el("p", "shelf-foot", body, "已得 " + Object.keys(store.unlocked.poems).filter(function (k) { return STORY.poems[k]; }).length + " / " + ids.length + " 首。诗随故事而得。");
    });
  }

  function openChapters() {
    openSheet("回目", function (body) {
      var shelf = el("div", "shelf", body);
      program.chapters.forEach(function (c) {
        var meta = chapterMeta(c.id);
        if (meta.hidden && !store.unlocked.chapters[c.id]) return;
        var got = store.unlocked.chapters[c.id];
        var parts = c.title.split("·");
        var b = el("button", "shelf-item", shelf);
        b.type = "button";
        b.innerHTML = '<span class="t">' + esc(got ? (parts[1] || c.title).trim() : "未启") + '</span><span class="s">' + esc((parts[0] || "").trim()) + "</span>" + (meta.season ? '<span class="seal">' + esc(meta.season) + "</span>" : "");
        if (!got) b.disabled = true;
        else b.addEventListener("click", function () {
          closeSheet();
          beginStory(c.id, got.vars);
        });
      });
      var ends = Object.keys(STORY.endings).filter(function (k) { return store.unlocked.endings[k]; });
      el("p", "shelf-foot", body, "从某一折重读，泪珠之数仍如当时。已见结局 " + ends.length + " / " + Object.keys(STORY.endings).length + "。");
    });
  }

  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ── Title and starting ─────────────────────────────────────────────── */
  function refreshTitle() {
    $("btn-continue").disabled = !store.resume;
    var b = $("title-sound");
    var on = store.settings.music > 0 || store.settings.sfx > 0;
    b.textContent = on ? "声 · 开" : "声 · 关";
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function toTitle() {
    if (playing) remember(true);
    playing = false;
    mode = "";
    stopAuto(); stopSkip();
    clearTimeout(reveal.timer);
    hideChoices();
    closeSheet();
    closeInterlude();
    clearPage();
    clearNotes();
    app.classList.remove("show-hud", "is-hidden-ui");
    app.classList.add("is-title");
    machine.halted = true;
    machine.waiting = null;
    stageQ = Promise.resolve();
    S.clearFigures();
    S.setScene(STORY.titleScene[0], STORY.titleScene[1], "fade");
    if (A) A.music("title");
    refreshTitle();
    setTimeout(function () { var b = document.querySelector(".title-menu button"); if (b) b.focus({ preventScroll: true }); }, 1800);
  }

  function startPlaying() {
    playing = true;
    app.classList.remove("is-title", "is-hidden-ui");
    stageQ = Promise.resolve();
    clearPage();
  }

  function beginStory(label, vars) {
    startPlaying();
    backlog = [];
    drawHud(vars || E.freshVars());
    // The string of pearls is introduced in the prologue; from any later
    // chapter it is already in her hand.
    var fromChapter = !!label && label !== program.chapters[0].id;
    app.classList.toggle("show-hud", fromChapter);
    machine.start(label || null, vars || null);
    if (fromChapter) machine.stage.hud = true;
  }

  // A composed poem, rebuilt from the couplets picked for it.
  function composedPoem(spec, picks) {
    var lines = [], notes = [];
    picks.forEach(function (k, slot) {
      var o = spec.options[slot][k];
      lines.push(o.lines[0] + "，", o.lines[1] + "。");
      notes.push(spec.prompts[slot].split(" ")[0] + "·" + o.note);
    });
    return { title: spec.title, by: "潇湘妃子", seal: "潇湘", lines: lines, note: notes.join("　") };
  }

  $("title-menu").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (A) A.unlock();
    var act = b.dataset.act;
    if (act === "new") beginStory(null, null);
    else if (act === "continue") loadSave(store.resume);
    else if (act === "chapters") openChapters();
    else if (act === "poems") openPoems();
    else if (act === "config") openConfig();
  });

  $("title-sound").addEventListener("click", function () {
    if (A) A.unlock();
    var on = store.settings.music > 0 || store.settings.sfx > 0;
    if (on) { store.mutedFrom = { music: store.settings.music, sfx: store.settings.sfx }; store.settings.music = 0; store.settings.sfx = 0; }
    else {
      var m = store.mutedFrom || { music: DEFAULTS.music, sfx: DEFAULTS.sfx };
      store.settings.music = m.music || DEFAULTS.music; store.settings.sfx = m.sfx || DEFAULTS.sfx;
    }
    persist();
    if (A) A.volume(store.settings.music / 100, store.settings.sfx / 100);
    refreshTitle();
  });

  /* ── Input ──────────────────────────────────────────────────────────── */
  $("tools").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    e.stopPropagation();
    var act = b.dataset.act;
    if (act === "log") openLog();
    else if (act === "auto") setAuto(!autoOn);
    else if (act === "skip") setSkip(!skipOn);
    else if (act === "save") openSave();
    else if (act === "load") openLoad();
    else if (act === "config") openConfig();
    else if (act === "hide") hideUI(true);
    else if (act === "home") confirmBox("回到卷首？此处已记下，可从「续读」接着看。", toTitle);
  });

  function hideUI(on) { app.classList.toggle("is-hidden-ui", on); }

  function onTap(e) {
    if (A) A.unlock();
    if (!playing || sheetOpen() || !inter.hidden) return;
    if (e.target.closest && e.target.closest("button, a, input")) return;
    if (app.classList.contains("is-hidden-ui")) { hideUI(false); return; }
    if (skipOn) { setSkip(false); return; }
    if (mode === "line") advance();
  }
  wrap.addEventListener("click", onTap);
  $("panel").addEventListener("click", onTap);
  wrap.addEventListener("contextmenu", function (e) {
    if (!playing) return;
    e.preventDefault();
    hideUI(!app.classList.contains("is-hidden-ui"));
  });
  wrap.addEventListener("wheel", function (e) {
    if (!playing || sheetOpen() || !inter.hidden) return;
    if (e.deltaY < -20) openLog();
    else if (e.deltaY > 20 && mode === "line") advance();
  }, { passive: true });

  document.addEventListener("keydown", function (e) {
    if (A) A.unlock();
    var k = e.key;
    if (k === "Control") { if (playing && !sheetOpen()) { ctrlSkip = true; if (mode === "line") advance(); } return; }
    if (sheetOpen()) { if (k === "Escape") closeSheet(); return; }
    if (!inter.hidden) {
      if ((k === " " || k === "Enter" || k === "ArrowRight" || k === "ArrowDown") && interDone && !e.target.closest("button")) { e.preventDefault(); interDone(); }
      return;
    }
    if (!playing) { if (k === "Escape") openConfig(); return; }
    if (app.classList.contains("is-hidden-ui") && k !== "h" && k !== "H") { hideUI(false); e.preventDefault(); return; }
    if (mode === "choice") {
      var n = parseInt(k, 10);
      if (n >= 1 && n <= choiceOpts.length) { pick(n - 1); e.preventDefault(); }
      return;
    }
    if (k === " " || k === "Enter" || k === "ArrowRight" || k === "ArrowDown" || k === "PageDown") {
      if (e.target.closest && e.target.closest("button") && k !== "ArrowRight" && k !== "ArrowDown") return;
      e.preventDefault();
      if (skipOn) setSkip(false);
      advance();
    } else if (k === "ArrowUp" || k === "PageUp") { e.preventDefault(); openLog(); }
    else if (k === "Escape") openConfig();
    else if (k === "a" || k === "A") setAuto(!autoOn);
    else if (k === "s" || k === "S") setSkip(!skipOn);
    else if (k === "h" || k === "H") hideUI(!app.classList.contains("is-hidden-ui"));
    else if (k === "q" || k === "Q") { store.quick = snapshot(); persist(true); toast("已速存"); }
  });
  document.addEventListener("keyup", function (e) { if (e.key === "Control") ctrlSkip = false; });
  window.addEventListener("blur", function () { ctrlSkip = false; });
  document.addEventListener("visibilitychange", function () { if (document.hidden) remember(true); });
  window.addEventListener("pagehide", function () { remember(true); });

  /* ── Settings ───────────────────────────────────────────────────────── */
  function applySpeed() { app.style.setProperty("--spd", speed() + "ms"); }

  function applySettings() {
    app.classList.toggle("no-notes", !store.settings.notes);
    layout();
    applySpeed();
    if (A) A.volume(store.settings.music / 100, store.settings.sfx / 100);
  }

  /* ── Boot ───────────────────────────────────────────────────────────── */
  if (store.composed) {
    Object.keys(store.composed).forEach(function (id) {
      Object.keys(STORY.compose).forEach(function (k) {
        var spec = STORY.compose[k];
        if (spec.result === id && store.composed[id].length === spec.slots) STORY.poems[id] = composedPoem(spec, store.composed[id]);
      });
    });
  }
  document.documentElement.style.setProperty("--paper-img", "url(" + P.paperURL(256, 3, 0.8, true) + ")");
  S.mount(wrap);
  window.addEventListener("resize", layout);
  applySettings();
  drawHud(E.freshVars());
  toTitle();

  /* ── Test harness ───────────────────────────────────────────────────── */
  window.Honglou = {
    state: function () {
      return {
        playing: playing, mode: mode, pc: machine.pc, chapter: machine.chapter,
        vars: JSON.parse(JSON.stringify(machine.vars)), stage: JSON.parse(JSON.stringify(machine.stage)),
        line: reveal.cmd && mode === "line" ? reveal.cmd.text : null,
        choices: mode === "choice" ? choiceOpts.map(function (o) { return o.text; }) : null,
        block: mode === "block" && machine.waiting ? machine.waiting.op : null
      };
    },
    start: function (label, vars) { beginStory(label, vars); },
    advance: function () {
      if (mode === "line") { finishReveal(); advance(); }
      else if (mode === "block" && interDone) interDone();
    },
    choose: function (i) { pick(i); },
    settle: function () { return stageQ; },
    store: function () { return store; },
    program: program,
    toTitle: toTitle
  };
})();
