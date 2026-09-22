/* ── Sugarsnap ────────────────────────────────────────────────────────
   Tap a free candy off the pile and it flies into a seven-slot tray.
   Three of a kind in the tray pop. Fill all seven and you lose; clear
   the whole pile and you win.

   Tiles live in one absolutely-positioned layer so a single transform
   transition carries a piece from the board into its tray slot.        */
(function () {
  "use strict";

  var CAPACITY = 7;        // default tray size; a level may ask for fewer
  var FLY_MS = 340;        // keep in sync with .tile transition-duration
  var REVEAL_MS = 520;     // keep in sync with the reveal animations
  var MERGE_HIT_MS = 330;  // when the three meet and swell inside `merge`

  // Per-candy particle colours, so a burst is tinted like the candy that
  // made it. Index matches the #candy-N symbols.
  var CANDY_COLORS = [
    ["#ff8a9b", "#e8243f"], ["#ffbe6b", "#f2701a"],
    ["#ffe680", "#f5b813"], ["#9ff08a", "#34a43a"],
    ["#8fd4ff", "#1878d4"], ["#c9a6ff", "#7433d1"],
    ["#ffa8d8", "#e0328f"], ["#8ff0e2", "#12a596"],
    ["#c08557", "#5a2f16"], ["#ffffff", "#d0122c"]
  ];
  var SLOT_GAP = 6.4;      // keep in sync with .tray-slots gap
  var TRAY_CHROME = 30;    // tray padding + margin, in px

  /* Ten levels, tuned by simulation rather than by eye. The percentage on
     each row is how often a competent solver that never touches a power-up
     clears it, over hundreds of runs, so the ramp is measured rather than
     guessed.

     1-5 are pyramids: layers shrink on both axes, so every layer keeps an
     exposed fringe and there is always plenty of choice. From 6 on the rows
     stay constant, which stacks each column in line -- reaching the bottom of
     a column means peeling every layer above it in order, and that is what
     actually makes them hard. A pyramid stays around 95% however big it gets.
     Depth stops at six layers: at seven the free tiles shrink to a narrow
     stripe and the board stops reading as a pile.

     The last two levels take a tray slot away instead of stacking deeper,
     which is a far stronger squeeze than more tiles and keeps the board
     legible. */
  var LEVELS = [
    { name: "Sweet Start",         types:  4, layers: [{ c: 5, r: 3 }, { c: 4, r: 2 }] },                                        //  21, 100%
    { name: "Jelly Garden",        types:  5, layers: [{ c: 5, r: 4 }, { c: 4, r: 3 }] },                                        //  30, 100%
    { name: "Gummy Grove",         types:  6, layers: [{ c: 6, r: 4 }, { c: 5, r: 3 }, { c: 4, r: 2 }] },                        //  45, 100%
    { name: "Lollipop Lane",       types:  7, layers: [{ c: 6, r: 5 }, { c: 5, r: 4 }, { c: 4, r: 3 }] },                        //  60,  99%
    { name: "Caramel Court",       types:  8, layers: [{ c: 7, r: 5 }, { c: 6, r: 4 }, { c: 5, r: 3 }, { c: 4, r: 2 }],          //  81,  99%
      powers: { hint: 2 } },
    { name: "Marshmallow Mile",    types:  9, layers: [{ c: 7, r: 4 }, { c: 6, r: 4 }, { c: 5, r: 4 }, { c: 4, r: 4 }],          //  87,  85%
      powers: { hint: 2 } },
    { name: "Toffee Tower",        types: 10, layers: [{ c: 8, r: 4 }, { c: 7, r: 4 }, { c: 6, r: 4 }, { c: 5, r: 4 }],          // 102,  78%
      powers: { hint: 2 } },
    { name: "Liquorice Labyrinth", types: 10, layers: [{ c: 8, r: 4 }, { c: 7, r: 4 }, { c: 6, r: 4 }, { c: 5, r: 4 }, { c: 4, r: 4 }],  // 120, 64%
      powers: { undo: 2, shuffle: 1, hint: 2 } },
    { name: "Peppermint Peak",     types: 10, capacity: 6,                                                                        // 150,  39%
      layers: [{ c: 8, r: 5 }, { c: 7, r: 5 }, { c: 6, r: 5 }, { c: 5, r: 5 }, { c: 4, r: 5 }],
      powers: { undo: 2, shuffle: 1, hint: 2 } },
    { name: "Candy Castle",        types: 10, capacity: 6,                                                                        // 165,  30%
      layers: [{ c: 8, r: 5 }, { c: 7, r: 5 }, { c: 6, r: 5 }, { c: 5, r: 5 }, { c: 4, r: 5 }, { c: 3, r: 5 }],
      powers: { undo: 2, shuffle: 1, hint: 1 } }
  ];

  var POWER_START = { undo: 3, shuffle: 2, hint: 3 };
  var STORE_KEY = "tutu.sugarsnap.v1";

  /* ── DOM ─────────────────────────────────────────────────────────── */
  var playfield = document.getElementById("playfield");
  var boardArea = document.getElementById("board-area");
  var trayEl    = document.getElementById("tray");
  var slotsWrap = document.getElementById("tray-slots");
  var overlay   = document.getElementById("overlay");
  var sheetTitle   = document.getElementById("sheet-title");
  var sheetText    = document.getElementById("sheet-text");
  var sheetScore   = document.getElementById("sheet-score");
  var sheetScoreV  = document.getElementById("sheet-score-value");
  var sheetActions = document.getElementById("sheet-actions");
  var live = document.getElementById("live");
  var toastEl = document.getElementById("toast");

  var hudLevel = document.getElementById("hud-level");
  var hudName  = document.getElementById("hud-level-name");
  var hudScore = document.getElementById("hud-score");
  var hudLeft  = document.getElementById("hud-remaining");

  var powBtn = {
    undo:    document.getElementById("pow-undo"),
    shuffle: document.getElementById("pow-shuffle"),
    hint:    document.getElementById("pow-hint")
  };
  var powCount = {
    undo:    document.getElementById("count-undo"),
    shuffle: document.getElementById("count-shuffle"),
    hint:    document.getElementById("count-hint")
  };

  var slots = [];

  function buildSlots(n) {
    slotsWrap.innerHTML = "";
    slots = [];
    for (var i = 0; i < n; i++) {
      var slot = document.createElement("div");
      slot.className = "tray-slot";
      slotsWrap.appendChild(slot);
      slots.push(slot);
    }
  }

  /* ── State ───────────────────────────────────────────────────────── */
  var tiles = [];      // every tile of the current level
  var tray = [];       // tile ids currently in the tray, in slot order
  var history = [];    // one record per placement, for undo
  var extent = { w: 1, h: 1, minX: 0, minY: 0 };
  var levelIndex = 0;
  var score = 0;
  var combo = 0;
  var status = "idle"; // idle | playing | won | lost
  var powers = Object.assign({}, POWER_START);
  var size = 56, traySize = 56, boardOx = 0, boardOy = 0;
  var slotPos = [];
  var hintTimer = null;
  var capacity = CAPACITY;
  var pending = 0;         // placements still flying toward the tray
  var levelToken = 0;      // bumped per level, so stale effects self-cancel

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function byId(id) { return tiles[id]; }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function save(data) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
  }

  function say(msg) { if (live) live.textContent = msg; }

  var toastTimer = null;
  // say() alone only reaches a screen reader; a sighted player needs to see
  // that the button did something.
  function toast(msg) {
    say(msg);
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.hidden = true;
    void toastEl.offsetWidth;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  /* ── Board generation ────────────────────────────────────────────── */
  function buildPositions(level) {
    var W = 0, H = 0;
    level.layers.forEach(function (L) {
      if (L.c > W) W = L.c;
      if (L.r > H) H = L.r;
    });

    var pos = [];
    level.layers.forEach(function (L, i) {
      var ox = (W - L.c) / 2;
      var oy = (H - L.r) / 2;
      for (var r = 0; r < L.r; r++) {
        for (var c = 0; c < L.c; c++) pos.push({ layer: i, ux: ox + c, uy: oy + r });
      }
    });

    // Tile count must be a multiple of three. Trim the bottom-layer pieces
    // furthest from centre so the pile still reads as a tidy stack.
    var over = pos.length % 3;
    if (over) {
      var cx = W / 2, cy = H / 2;
      var bottom = [];
      pos.forEach(function (p, i) {
        if (p.layer === 0) {
          var dx = p.ux + 0.5 - cx, dy = p.uy + 0.5 - cy;
          bottom.push({ i: i, d: dx * dx + dy * dy });
        }
      });
      bottom.sort(function (a, b) { return b.d - a.d; });
      var kill = {};
      for (var k = 0; k < over; k++) kill[bottom[k].i] = true;
      pos = pos.filter(function (p, i) { return !kill[i]; });
    }
    return pos;
  }

  /* Type assignment by simulated solve: repeatedly take three currently
     uncovered positions and stamp them with one candy type. A board built
     this way is guaranteed clearable — whoever finds that order never needs
     more than three of the seven tray slots — while the types still land
     scattered across layers, so finding it stays a real puzzle. */
  function assignTypes(pos, palette) {
    var types = new Array(pos.length);
    var alive = pos.map(function (_, i) { return i; });
    var step = 0;

    function uncovered(list) {
      var out = [];
      for (var a = 0; a < list.length; a++) {
        var p = pos[list[a]], blocked = false;
        for (var b = 0; b < list.length; b++) {
          if (a === b) continue;
          var q = pos[list[b]];
          if (q.layer > p.layer &&
              Math.abs(q.ux - p.ux) < 0.95 && Math.abs(q.uy - p.uy) < 0.95) { blocked = true; break; }
        }
        if (!blocked) out.push(list[a]);
      }
      return out;
    }

    while (alive.length >= 3) {
      var free = uncovered(alive);
      // Near the end everything left is uncovered; the fallback only exists
      // for the rare geometry where fewer than three are exposed at once.
      var take = free.length >= 3 ? shuffle(free).slice(0, 3) : alive.slice(0, 3);
      var t = palette[step++ % palette.length];
      take.forEach(function (i) { types[i] = t; });
      alive = alive.filter(function (i) { return take.indexOf(i) < 0; });
    }
    return types;
  }

  function buildLevel(index) {
    clearPending();
    levelToken++;
    var level = LEVELS[index];
    var pos = buildPositions(level);

    var palette = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, level.types);
    var bag = assignTypes(pos, palette);

    playfield
      .querySelectorAll(".tile, .spark, .score-pop, .shockwave, .match-flash")
      .forEach(function (n) { n.remove(); });

    tiles = pos.map(function (p, i) {
      var tile = { id: i, type: bag[i], layer: p.layer, ux: p.ux, uy: p.uy, place: "board", el: null };
      tile.el = makeTile(tile);
      return tile;
    });

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pos.forEach(function (p) {
      if (p.ux < minX) minX = p.ux;
      if (p.ux + 1 > maxX) maxX = p.ux + 1;
      if (p.uy < minY) minY = p.uy;
      if (p.uy + 1 > maxY) maxY = p.uy + 1;
    });
    extent = { minX: minX, minY: minY, w: maxX - minX, h: maxY - minY };

    capacity = level.capacity || CAPACITY;
    buildSlots(capacity);
    tray = [];
    history = [];
    combo = 0;
    powers = Object.assign({}, POWER_START, level.powers || {});
    levelIndex = index;
    status = "playing";

    hudName.textContent = level.name;
    hudLevel.textContent = String(index + 1);
    layout();
    render();
    updateFree();
    updateHud();
  }

  // Drop any placement still waiting to resolve; its tiles are about to go.
  function clearPending() {
    history.forEach(function (r) {
      if (r.timer) { clearTimeout(r.timer); r.timer = null; }
    });
    pending = 0;
  }

  function makeTile(t) {
    var el = document.createElement("div");
    el.className = "tile";
    el.innerHTML =
      '<div class="tile-face"><svg viewBox="0 0 100 100"><use href="#candy-' + t.type + '"></use></svg></div>';
    el.addEventListener("click", function () { pick(t); });
    playfield.appendChild(el);
    return el;
  }

  function paint(t) {
    var use = t.el.querySelector("use");
    if (use) use.setAttribute("href", "#candy-" + t.type);
  }

  /* ── Layout ──────────────────────────────────────────────────────── */
  function layout() {
    var pf = playfield.getBoundingClientRect();
    if (!pf.width || !pf.height) return;

    // Seven tray slots have to fit the width; the board does not, so the two
    // sizes are solved separately and a tray-bound tile simply scales down.
    var byTray   = Math.min(84, (pf.width - (capacity - 1) * SLOT_GAP) / capacity);
    var byHeight = (pf.height - TRAY_CHROME - byTray) / extent.h;
    var byWidth  = pf.width / extent.w;
    size = Math.max(26, Math.min(84, byHeight, byWidth));
    traySize = Math.min(size, byTray);

    document.querySelector(".game").style.setProperty("--tile", size + "px");
    slots.forEach(function (el) {
      el.style.width = traySize + "px";
      el.style.height = traySize + "px";
    });

    // Reading these rects after the writes above forces the reflow we need.
    var ba = boardArea.getBoundingClientRect();
    var bw = extent.w * size, bh = extent.h * size;
    boardOx = (ba.left - pf.left) + (ba.width - bw) / 2 - extent.minX * size;
    boardOy = (ba.top - pf.top) + (ba.height - bh) / 2 - extent.minY * size;

    slotPos = slots.map(function (el) {
      var r = el.getBoundingClientRect();
      return { x: r.left - pf.left, y: r.top - pf.top };
    });
  }

  function posOf(t) {
    if (t.place === "tray") {
      var i = tray.indexOf(t.id);
      var p = slotPos[i] || slotPos[slotPos.length - 1] || { x: 0, y: 0 };
      return p;
    }
    return { x: boardOx + t.ux * size, y: boardOy + t.uy * size };
  }

  function render() {
    tiles.forEach(function (t) {
      if (t.place === "gone") return;
      var p = posOf(t);
      var sc = t.place === "tray" ? traySize / size : 1;
      t.el.style.setProperty("--tx", p.x + "px");
      t.el.style.setProperty("--ty", p.y + "px");
      t.el.style.setProperty("--ts", String(sc));
      t.el.style.transform =
        "translate3d(" + p.x + "px," + p.y + "px,0) scale(" + sc + ")";
      t.el.style.zIndex = t.place === "tray" ? 60 : 10 + t.layer;
    });
  }

  /* ── Free / blocked ──────────────────────────────────────────────── */
  function isFree(t) {
    for (var i = 0; i < tiles.length; i++) {
      var o = tiles[i];
      if (o === t || o.place !== "board" || o.layer <= t.layer) continue;
      if (Math.abs(o.ux - t.ux) < 0.95 && Math.abs(o.uy - t.uy) < 0.95) return false;
    }
    return true;
  }

  function updateFree() {
    tiles.forEach(function (t) {
      if (t.place !== "board") return;
      var free = isFree(t);
      t.el.classList.toggle("free", free);
      t.el.classList.toggle("locked", !free);
      // Only celebrate a genuine locked -> free flip, not the initial paint.
      if (free && t.wasFree === false) reveal(t);
      t.wasFree = free;
    });
  }

  // A candy coming out from under another one wakes up: it lifts, a shine
  // sweeps across it, and it glows for a beat. Kept gentle -- this fires
  // constantly, so it must not compete with a match.
  function reveal(t) {
    var c = CANDY_COLORS[t.type] || CANDY_COLORS[0];
    var token = levelToken;
    t.el.style.setProperty("--glow", c[0]);
    // Beat of delay so the candy that was covering this one has visibly
    // moved off before the one beneath lights up.
    setTimeout(function () {
      if (token !== levelToken || t.place !== "board") return;
      t.el.classList.remove("revealing");
      void t.el.offsetWidth;
      t.el.classList.add("revealing");
      setTimeout(function () { t.el.classList.remove("revealing"); }, REVEAL_MS);
    }, 120);
  }

  /* ── Playing a tile ──────────────────────────────────────────────── */
  function pick(t) {
    if (status !== "playing" || t.place !== "board" || !isFree(t)) return;
    // A full tray is full, even while a match is still landing.
    if (tray.length >= capacity) return;
    clearHints();

    t.place = "tray";
    // Slot the candy in beside its own kind, the way Sugarsnap groups them.
    var at = tray.length;
    for (var i = tray.length - 1; i >= 0; i--) {
      if (byId(tray[i]).type === t.type) { at = i + 1; break; }
    }
    tray.splice(at, 0, t.id);

    t.el.classList.remove("free", "locked");
    t.el.classList.add("in-tray", "landing");
    setTimeout(function () { t.el.classList.remove("landing"); }, 280);

    var record = { placed: t.id, cleared: [], score: 0 };
    history.push(record);

    render();
    updateFree();
    updateHud();

    // Let the candy actually reach the tray before it is allowed to pop.
    pending++;
    record.timer = setTimeout(function () {
      record.timer = null;
      land(record);
    }, FLY_MS);
  }

  // Runs once a placed candy has arrived in its slot.
  function land(record) {
    if (!resolve(record)) combo = 0;
    render();
    updateHud();
    pending--;
    checkEnd();
  }

  // Win and loss are only decided once nothing is still in the air, so a
  // triple that is mid-flight never reads as a full tray.
  function checkEnd() {
    if (pending > 0 || status !== "playing") return;
    if (tiles.every(function (x) { return x.place === "gone"; })) finish("won");
    else if (tray.length >= capacity) finish("lost");
  }

  function resolve(record) {
    var counts = {};
    tray.forEach(function (id) {
      var ty = byId(id).type;
      counts[ty] = (counts[ty] || 0) + 1;
    });

    var hit = null;
    for (var k in counts) { if (counts[k] >= 3) { hit = Number(k); break; } }
    if (hit === null) return false;

    var ids = [];
    for (var i = 0; i < tray.length && ids.length < 3; i++) {
      if (byId(tray[i]).type === hit) ids.push(tray[i]);
    }

    // The middle candy of the three is the point they collapse into.
    var where = posOf(byId(ids[1]));
    ids.forEach(function (id) {
      var t = byId(id);
      t.place = "gone";
      tray.splice(tray.indexOf(id), 1);
      t.el.style.setProperty("--mx", where.x + "px");
      t.el.style.setProperty("--my", where.y + "px");
      t.el.style.zIndex = 70;
      t.el.classList.remove("popping");
      void t.el.offsetWidth;          // restart the animation if replayed
      t.el.classList.add("popping");
    });

    combo++;
    var pts = 100 + (combo - 1) * 25;
    record.cleared = ids;
    record.score = pts;
    score += pts;

    // Hold the burst until the merge keyframes have actually brought the
    // three together, otherwise the candies pop before they touch.
    var token = levelToken;
    setTimeout(function () {
      if (token !== levelToken) return;   // level restarted mid-merge
      shockwave(where, hit);
      burst(where, hit);
      popScore(where, pts);
      trayEl.classList.remove("flash");
      void trayEl.offsetWidth;
      trayEl.classList.add("flash");
      setTimeout(function () { trayEl.classList.remove("flash"); }, 420);
      hudScore.classList.remove("bump");
      void hudScore.offsetWidth;
      hudScore.classList.add("bump");
    }, MERGE_HIT_MS);

    say("Matched three. " + tiles.filter(function (t) { return t.place !== "gone"; }).length + " candies left.");
    return true;
  }

  function finish(how) {
    status = how;
    var data = load();
    if (how === "won") {
      data.unlocked = Math.max(data.unlocked || 0, Math.min(levelIndex + 1, LEVELS.length - 1));
      data.best = Math.max(data.best || 0, score);
      save(data);
    }
    setTimeout(function () { showSheet(how); }, how === "won" ? 480 : 340);
  }

  /* ── Effects ─────────────────────────────────────────────────────── */
  var SPARK_COLORS = ["#ffe680", "#ffa8d8", "#8fd4ff", "#9ff08a", "#ffbe6b"];

  function burst(at, type) {
    var palette = (CANDY_COLORS[type] || CANDY_COLORS[0]).concat(["#fff", "#ffe680"]);
    var cx = at.x + traySize / 2;
    var cy = at.y + traySize / 2;

    for (var i = 0; i < 16; i++) {
      var el = document.createElement("span");
      el.className = "spark";
      var ang = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
      var dist = 38 + Math.random() * 52;
      var sz = 6 + Math.random() * 9;
      // A few shards instead of dots gives the burst some grain.
      if (i % 4 === 0) el.classList.add("spark-shard");
      el.style.background = palette[i % palette.length];
      el.style.width = sz + "px";
      el.style.height = sz + "px";
      el.style.setProperty("--sx", (cx - sz / 2) + "px");
      el.style.setProperty("--sy", (cy - sz / 2) + "px");
      el.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      el.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      el.style.setProperty("--spin", (Math.random() * 720 - 360) + "deg");
      el.style.animationDuration = (0.52 + Math.random() * 0.34) + "s";
      playfield.appendChild(el);
      (function (node) { setTimeout(function () { node.remove(); }, 900); })(el);
    }
  }

  // Expanding ring at the point the three candies collapse into.
  function shockwave(at, type) {
    var c = CANDY_COLORS[type] || CANDY_COLORS[0];
    var ring = document.createElement("span");
    ring.className = "shockwave";
    ring.style.borderColor = c[0];
    ring.style.width = ring.style.height = traySize + "px";
    ring.style.setProperty("--sx", at.x + "px");
    ring.style.setProperty("--sy", at.y + "px");
    playfield.appendChild(ring);
    setTimeout(function () { ring.remove(); }, 620);

    var flash = document.createElement("span");
    flash.className = "match-flash";
    flash.style.background = c[0];
    flash.style.width = flash.style.height = traySize + "px";
    flash.style.setProperty("--sx", at.x + "px");
    flash.style.setProperty("--sy", at.y + "px");
    playfield.appendChild(flash);
    setTimeout(function () { flash.remove(); }, 420);
  }

  function popScore(at, pts) {
    var el = document.createElement("span");
    el.className = "score-pop";
    el.textContent = "+" + pts;
    el.style.setProperty("--sx", at.x + "px");
    el.style.setProperty("--sy", at.y + "px");
    playfield.appendChild(el);
    setTimeout(function () { el.remove(); }, 950);
  }

  /* ── Power-ups ───────────────────────────────────────────────────── */
  function doUndo() {
    if (status !== "playing" || !powers.undo || !history.length || pending) return;
    clearHints();
    var rec = history.pop();

    rec.cleared.forEach(function (id) {
      var t = byId(id);
      t.place = "tray";
      t.el.classList.remove("popping");
      if (tray.indexOf(id) < 0) tray.push(id);
    });
    score -= rec.score;
    if (rec.score) combo = Math.max(0, combo - 1);

    var p = byId(rec.placed);
    var i = tray.indexOf(p.id);
    if (i >= 0) tray.splice(i, 1);
    p.place = "board";
    p.el.classList.remove("in-tray");

    sortTray();
    powers.undo--;
    render();
    updateFree();
    updateHud();
    say("Undid the last candy.");
  }

  function sortTray() {
    var order = [];
    tray.forEach(function (id) {
      var ty = byId(id).type;
      if (order.indexOf(ty) < 0) order.push(ty);
    });
    tray.sort(function (a, b) {
      return order.indexOf(byId(a).type) - order.indexOf(byId(b).type);
    });
  }

  function doShuffle() {
    if (status !== "playing" || !powers.shuffle) return;
    clearHints();
    var onBoard = tiles.filter(function (t) { return t.place === "board"; });
    var types = shuffle(onBoard.map(function (t) { return t.type; }));
    onBoard.forEach(function (t, i) {
      t.type = types[i];
      paint(t);
      t.el.classList.remove("landing");
      void t.el.offsetWidth;
      t.el.classList.add("landing");
    });
    powers.shuffle--;
    updateHud();
    toast("Board reshuffled.");
  }

  function doHint() {
    if (status !== "playing" || !powers.hint) return;
    clearHints();

    var trayCount = {};
    tray.forEach(function (id) {
      var ty = byId(id).type;
      trayCount[ty] = (trayCount[ty] || 0) + 1;
    });

    var groups = {};
    tiles.forEach(function (t) {
      if (t.place === "board" && isFree(t)) (groups[t.type] = groups[t.type] || []).push(t);
    });

    var pick3 = null;
    for (var ty in groups) {
      var need = Math.max(1, 3 - (trayCount[ty] || 0));
      if (groups[ty].length >= need) { pick3 = groups[ty].slice(0, need); break; }
    }
    if (!pick3) { toast("No triple to point at yet — try a shuffle."); return; }

    pick3.forEach(function (t) { t.el.classList.add("hinted"); });
    hintTimer = setTimeout(clearHints, 2400);
    powers.hint--;
    updateHud();
  }

  function clearHints() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    tiles.forEach(function (t) { t.el.classList.remove("hinted"); });
  }

  /* ── HUD ─────────────────────────────────────────────────────────── */
  function updateHud() {
    hudScore.textContent = String(score);
    hudLeft.textContent = String(tiles.filter(function (t) { return t.place !== "gone"; }).length);
    ["undo", "shuffle", "hint"].forEach(function (k) {
      powCount[k].textContent = String(powers[k]);
      powBtn[k].disabled =
        !powers[k] || status !== "playing" || pending > 0 || (k === "undo" && !history.length);
    });
    trayEl.classList.toggle("danger", tray.length >= capacity - 2 && status === "playing");
  }

  /* ── Overlay sheet ───────────────────────────────────────────────── */
  function button(label, cls, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn " + cls;
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  }

  function linkButton(label, cls, href) {
    var a = document.createElement("a");
    a.className = "btn " + cls;
    a.textContent = label;
    a.href = href;
    return a;
  }

  function showSheet(kind) {
    sheetActions.innerHTML = "";
    sheetScore.hidden = true;
    var data = load();

    if (kind === "intro") {
      sheetTitle.textContent = "Sugarsnap";
      sheetText.innerHTML =
        '<ul class="sheet-rules">' +
        '<li><span class="num">1</span><span>Tap any candy that is not covered — it flies into your tray.</span></li>' +
        '<li><span class="num">2</span><span>Three of a kind in the tray pop for points.</span></li>' +
        '<li><span class="num">3</span><span>Fill every tray slot and you are out. Clear the pile to win.</span></li>' +
        "</ul>";
      var start = data.unlocked ? data.unlocked : 0;
      sheetActions.appendChild(button(start ? "Continue — Level " + (start + 1) : "Play", "", function () {
        hideSheet(); buildLevel(start);
      }));
      if (start) {
        sheetActions.appendChild(button("Start from Level 1", "btn-ghost", function () {
          hideSheet(); buildLevel(0);
        }));
      }
    } else if (kind === "won") {
      var last = levelIndex >= LEVELS.length - 1;
      sheetTitle.textContent = last ? "Sweet victory!" : "Level cleared!";
      var next = last ? null : LEVELS[levelIndex + 1];
      // Flag a shrinking tray here rather than letting the player discover it
      // the hard way on their first tap.
      var squeeze = next && (next.capacity || CAPACITY) < capacity
        ? " The tray drops to <strong>" + (next.capacity || CAPACITY) + " slots</strong>."
        : "";
      sheetText.innerHTML = last
        ? "You cleared every level in the candy jar. <strong>Nicely done.</strong>"
        : "Pile cleared. <strong>" + next.name + "</strong> is unlocked." + squeeze;
      sheetScore.hidden = false;
      sheetScoreV.textContent = String(score);
      if (!last) {
        sheetActions.appendChild(button("Next level", "", function () {
          hideSheet(); buildLevel(levelIndex + 1);
        }));
      }
      sheetActions.appendChild(button("Replay level", "btn-blue", function () {
        hideSheet(); score = last ? 0 : score; buildLevel(levelIndex); updateHud();
      }));
      sheetActions.appendChild(linkButton("Back to tutu", "btn-ghost", "../../"));
      confetti();
    } else {
      sheetTitle.textContent = "Tray full";
      sheetText.innerHTML =
        "No room left for another candy. <strong>" +
        tiles.filter(function (t) { return t.place !== "gone"; }).length +
        "</strong> were still on the pile.";
      sheetScore.hidden = false;
      sheetScoreV.textContent = String(score);
      sheetActions.appendChild(button("Try again", "", function () {
        hideSheet(); score = 0; buildLevel(levelIndex); updateHud();
      }));
      sheetActions.appendChild(linkButton("Back to tutu", "btn-ghost", "../../"));
    }

    overlay.hidden = false;
  }

  function hideSheet() { overlay.hidden = true; }

  function confetti() {
    var host = document.getElementById("sheet-burst");
    host.innerHTML = "";
    for (var i = 0; i < 18; i++) {
      var el = document.createElement("span");
      el.className = "spark";
      el.style.background = SPARK_COLORS[i % SPARK_COLORS.length];
      el.style.setProperty("--sx", (20 + Math.random() * 360) + "px");
      el.style.setProperty("--sy", (10 + Math.random() * 40) + "px");
      el.style.setProperty("--dx", (Math.random() * 90 - 45) + "px");
      el.style.setProperty("--dy", (130 + Math.random() * 130) + "px");
      el.style.animationDuration = (0.9 + Math.random() * 0.7) + "s";
      host.appendChild(el);
    }
  }

  /* ── Wiring ──────────────────────────────────────────────────────── */
  powBtn.undo.addEventListener("click", doUndo);
  powBtn.shuffle.addEventListener("click", doShuffle);
  powBtn.hint.addEventListener("click", doHint);

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!tiles.length) return;
      layout();
      render();
    }, 90);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "z" || e.key === "Z") doUndo();
    else if (e.key === "s" || e.key === "S") doShuffle();
    else if (e.key === "h" || e.key === "H") doHint();
  });

  // Expose a tiny hook so the board can be driven from a test harness.
  window.Sugarsnap = {
    state: function () {
      return {
        status: status,
        score: score,
        tray: tray.slice(),
        level: levelIndex,
        remaining: tiles.filter(function (t) { return t.place !== "gone"; }).length,
        pending: pending,
        capacity: capacity,
        free: tiles.filter(function (t) { return t.place === "board" && isFree(t); }).map(function (t) { return t.id; }),
        types: tiles.map(function (t) { return t.type; }),
        board: tiles.map(function (t) {
          return { id: t.id, type: t.type, layer: t.layer, ux: t.ux, uy: t.uy, place: t.place };
        })
      };
    },
    pick: function (id) { pick(byId(id)); },
    start: function (i) { hideSheet(); buildLevel(i || 0); },
    undo: doUndo,
    shuffle: doShuffle,
    hint: doHint,
    // Resolve every in-flight placement at once. Only for tests that care
    // about board logic rather than animation timing.
    settle: function () {
      history.forEach(function (r) {
        if (r.timer) { clearTimeout(r.timer); r.timer = null; land(r); }
      });
    }
  };

  showSheet("intro");
})();
