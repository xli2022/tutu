/* ── 还泪记 · engine ──────────────────────────────────────────────────────
   Reads the story (story.js) and plays it. Two halves:

   parse(text)  turns the line-based script into a flat list of commands
                plus a label table. The script format:

                  ## id | 第一折 · 初见 | 回目        a chapter (also a label)
                  :: label                          a jump target
                  @bg qinfang dusk                  a stage command
                  黛玉：……                           a line (speaker from CAST)
                  （……）                             黛玉's unspoken thought
                  ……                                narration
                  ? prompt                          a choice; its options follow:
                  * [heart>=3] 「……」 -> label | heart+1, gate

   Machine      runs the commands. It owns the story state (the pearls and
                other numbers, flags, the stage as the script last left it)
                and stops at anything the reader has to see or answer,
                handing it to the page through the hooks it was given.

   Nothing here touches the DOM; the page draws what the Machine reports. */
(function (kit) {
  "use strict";

  /* ── Speakers ───────────────────────────────────────────────────────
     The name written before "：" in the script, and the figure (if any)
     that speaks it. A line whose prefix is not listed is narration, so
     prose like 宝玉笑道：…… is never mistaken for a speaker.             */
  var SPEAKERS = {
    "黛玉": "daiyu", "宝玉": "baoyu", "宝钗": "baochai", "紫鹃": "zijuan",
    "凤姐": "fengjie", "贾母": "jiamu", "湘云": "xiangyun", "探春": "tanchun",
    "李纨": "liwan", "晴雯": "qingwen", "袭人": "xiren", "雪雁": "xueyan",
    "警幻": "jinghuan", "僧": "seng", "道": "dao", "傻大姐": "shadajie",
    "鹦哥": "yingge", "绛珠": "daiyu", "神瑛": "baoyu", "妙玉": "", "莺儿": "",
    "迎春": "", "香菱": "", "众人": "", "丫鬟": "", "婆子": "", "说书人": ""
  };

  function ParseError(msg, line) {
    this.message = "story.js line " + line + ": " + msg;
    this.line = line;
  }

  /* ── Conditions and effects ─────────────────────────────────────── */

  // "heart>=3 & handkerchief | orchid>2" -> function(vars) -> bool.
  // & (or a comma) binds tighter than |.
  function compileCond(src) {
    var ors = src.split("|").map(function (part) {
      return part.split(/[&,]/).map(function (atom) {
        atom = atom.trim();
        var m = atom.match(/^(!?)([\w一-鿿]+)\s*(>=|<=|==|!=|>|<)?\s*(-?\d+)?$/);
        if (!m) throw new Error("bad condition: " + atom);
        var neg = m[1] === "!", name = m[2], op = m[3], num = m[4] == null ? null : +m[4];
        return function (v) {
          var x = +(v[name] || 0);
          var r;
          if (!op) r = x !== 0;
          else if (op === ">=") r = x >= num;
          else if (op === "<=") r = x <= num;
          else if (op === ">") r = x > num;
          else if (op === "<") r = x < num;
          else if (op === "==") r = x === num;
          else r = x !== num;
          return neg ? !r : r;
        };
      });
    });
    return function (v) {
      return ors.some(function (ands) { return ands.every(function (f) { return f(v); }); });
    };
  }

  // "heart+1, orchid-1, gate, !grudge, pearls=10" -> [{ name, op, n }].
  function parseEffects(src) {
    if (!src || !src.trim()) return [];
    return src.split(",").map(function (atom) {
      atom = atom.trim();
      var m = atom.match(/^(!?)([\w一-鿿]+)\s*([+\-=])?\s*(-?\d+)?$/);
      if (!m) throw new Error("bad effect: " + atom);
      if (m[1]) return { name: m[2], op: "=", n: 0 };
      if (!m[3]) return { name: m[2], op: "=", n: 1 };
      return { name: m[2], op: m[3], n: m[4] == null ? 1 : +m[4] };
    });
  }

  function applyEffects(vars, effects) {
    for (var i = 0; i < effects.length; i++) {
      var e = effects[i], cur = +(vars[e.name] || 0);
      vars[e.name] = e.op === "+" ? cur + e.n : e.op === "-" ? cur - e.n : e.n;
    }
  }

  /* ── Parser ─────────────────────────────────────────────────────── */
  function parse(text) {
    var lines = text.split(/\r?\n/);
    var cmds = [], labels = {}, chapters = [];
    var choice = null;

    function push(c, ln) { c.ln = ln; cmds.push(c); return c; }
    function closeChoice(ln) {
      if (choice && !choice.options.length) throw new ParseError("a choice with no options", ln);
      choice = null;
    }

    for (var i = 0; i < lines.length; i++) {
      var ln = i + 1;
      var raw = lines[i].replace(/\s+$/, "");
      var line = raw.trim();
      if (!line || /^#(\s|$)/.test(line) || line.indexOf("//") === 0) { continue; }

      try {
        if (line.charAt(0) === "*" && choice) {
          choice.options.push(parseOption(line.slice(1).trim()));
          continue;
        }
        if (choice) closeChoice(ln);

        if (line.indexOf("##") === 0) {
          var parts = line.slice(2).split("|").map(function (s) { return s.trim(); });
          var id = parts[0];
          if (labels[id] != null) throw new ParseError("duplicate label " + id, ln);
          labels[id] = cmds.length;
          chapters.push({ id: id, title: parts[1] || "", sub: parts[2] || "", index: cmds.length });
          push({ op: "chapter", id: id, title: parts[1] || "", sub: parts[2] || "" }, ln);
        } else if (line.indexOf("::") === 0) {
          var name = line.slice(2).trim();
          if (labels[name] != null) throw new ParseError("duplicate label " + name, ln);
          labels[name] = cmds.length;
        } else if (line.charAt(0) === "@") {
          push(parseCommand(line.slice(1)), ln);
        } else if (line.charAt(0) === "?") {
          choice = push({ op: "choice", prompt: line.slice(1).trim(), options: [] }, ln);
        } else if (/^（[\s\S]*）$/.test(line)) {
          push({ op: "think", text: line.slice(1, -1) }, ln);
        } else {
          var m = line.match(/^([一-鿿]{1,4})：([\s\S]+)$/);
          if (m && Object.prototype.hasOwnProperty.call(SPEAKERS, m[1])) {
            push({ op: "say", name: m[1], who: SPEAKERS[m[1]], text: m[2] }, ln);
          } else {
            push({ op: "narr", text: line }, ln);
          }
        }
      } catch (e) {
        if (e instanceof ParseError) throw e;
        throw new ParseError(e.message, ln);
      }
    }
    if (choice) closeChoice(lines.length);

    // Every jump must land somewhere.
    cmds.forEach(function (c) {
      var targets = c.op === "choice" ? c.options.map(function (o) { return o.target; }) : [c.target];
      targets.forEach(function (t) {
        if (t && labels[t] == null) throw new ParseError("no label called " + t, c.ln);
      });
    });
    return { cmds: cmds, labels: labels, chapters: chapters };
  }

  // [cond] text -> target | effects   (cond, target and effects optional)
  function parseOption(s) {
    var cond = null, m = s.match(/^\[([^\]]+)\]\s*/);
    if (m) { cond = m[1]; s = s.slice(m[0].length); }
    var effects = "", bar = s.lastIndexOf("|");
    if (bar >= 0) { effects = s.slice(bar + 1); s = s.slice(0, bar); }
    var target = null, arrow = s.lastIndexOf("->");
    if (arrow >= 0) { target = s.slice(arrow + 2).trim(); s = s.slice(0, arrow); }
    return {
      text: s.trim(), cond: cond, test: cond ? compileCond(cond) : null,
      target: target || null, effects: parseEffects(effects)
    };
  }

  function parseCommand(s) {
    var sp = s.indexOf(" ");
    var op = sp < 0 ? s : s.slice(0, sp);
    var rest = sp < 0 ? "" : s.slice(sp + 1).trim();
    var a = rest ? rest.split(/\s+/) : [];
    switch (op) {
      case "bg":    return { op: "bg", scene: a[0], variant: a[1] || "", trans: a[2] || "ink" };
      case "show":  return { op: "show", who: a[0], pose: a[1] || "calm", pos: a[2] || "c", face: a[3] || "" };
      case "pose":  return { op: "pose", who: a[0], pose: a[1] || "calm" };
      case "move":  return { op: "move", who: a[0], pos: a[1] || "c", face: a[2] || "" };
      case "hide":  return { op: "hide", who: a[0] || "all" };
      case "fx":    return { op: "fx", kind: a[0] || "none", amount: a[1] ? +a[1] : null };
      case "music": return { op: "music", mood: a[0] || "off" };
      case "sound": return { op: "sound", name: a[0] };
      case "tear":  return { op: "tear", kind: a[0] === "repay" ? "repay" : "vain", n: a[1] ? +a[1] : 1 };
      case "set":   return { op: "set", effects: parseEffects(rest) };
      case "if": {
        var arrow = rest.lastIndexOf("->");
        if (arrow < 0) throw new Error("@if needs -> label");
        var cond = rest.slice(0, arrow).trim();
        return { op: "if", cond: cond, test: compileCond(cond), target: rest.slice(arrow + 2).trim() };
      }
      case "goto":  return { op: "goto", target: a[0] };
      case "poem":  return { op: "poem", id: a[0] };
      case "note":  return { op: "note", text: rest };
      case "card":  return { op: "card", text: rest };
      case "wait":  return { op: "wait", ms: +(a[0] || 600) };
      case "ending": return { op: "ending", id: a[0] };
      case "compose": return { op: "compose", id: a[0] };
      case "dream": return { op: "dream", on: a[0] !== "off" };
      case "hud":   return { op: "hud", on: a[0] !== "off" };
      case "shake": return { op: "shake" };
      case "flash": return { op: "flash", color: a[0] || "#fff" };
      default: throw new Error("unknown command @" + op);
    }
  }

  /* ── Machine ────────────────────────────────────────────────────────
     hooks: {
       line(cmd)          a say/narr/think line to show; the page calls
                          next() when the reader is done with it
       choice(cmd, opts)  options whose condition holds; page calls choose(i)
       block(cmd)         poem/card/chapter/ending/compose/wait: page calls
                          next() (compose passes its result to resume())
       stage(cmd, state)  a stage change to draw (bg/show/hide/pose/move/
                          fx/music/sound/dream/hud/shake/flash)
       tear(kind, state)  a pearl falls; state has the new counts
       note(text)         a red marginal note for the next line
     }                                                                     */
  var PEARLS = 10;

  function freshVars() {
    return { pearls: PEARLS, repaid: 0, vain: 0, heart: 0, orchid: 0 };
  }

  function freshStage() {
    return { bg: "", variant: "", figures: {}, fx: "auto", fxAmount: null, music: "off", dream: false, hud: false };
  }

  function Machine(program, hooks) {
    this.prog = program;
    this.hooks = hooks;
    this.pc = 0;
    this.vars = freshVars();
    this.stage = freshStage();
    this.chapter = "";
    this.waiting = null;   // the command the page is showing
    this.halted = true;
  }

  Machine.prototype.start = function (label, vars) {
    this.pc = label ? this.prog.labels[label] : 0;
    if (this.pc == null) throw new Error("no label " + label);
    this.vars = vars ? JSON.parse(JSON.stringify(vars)) : freshVars();
    this.stage = freshStage();
    this.halted = false;
    this.run();
  };

  Machine.prototype.snapshot = function () {
    return {
      pc: this.waitingPc != null ? this.waitingPc : this.pc,
      vars: JSON.parse(JSON.stringify(this.vars)),
      stage: JSON.parse(JSON.stringify(this.stage)),
      chapter: this.chapter
    };
  };

  // Resume at a saved line: redraw the stage as it was, then show the line.
  Machine.prototype.restore = function (snap) {
    this.vars = JSON.parse(JSON.stringify(snap.vars));
    this.stage = JSON.parse(JSON.stringify(snap.stage));
    this.chapter = snap.chapter || "";
    this.pc = snap.pc;
    this.halted = false;
    this.hooks.restore(this.stage, this.vars);
    this.run();
  };

  Machine.prototype.next = function () {
    if (!this.waiting) return;
    this.waiting = null;
    this.waitingPc = null;
    this.run();
  };

  Machine.prototype.choose = function (i) {
    var w = this.waiting;
    if (!w || w.op !== "choice") return;
    var opt = w.visible[i];
    if (!opt) return;
    applyEffects(this.vars, opt.effects);
    this.waiting = null;
    this.waitingPc = null;
    if (opt.target) this.pc = this.prog.labels[opt.target];
    this.run();
  };

  Machine.prototype.resume = function (effects) {
    if (effects) applyEffects(this.vars, effects);
    this.next();
  };

  Machine.prototype.run = function () {
    var cmds = this.prog.cmds, guard = 0;
    while (!this.halted && this.pc < cmds.length) {
      if (++guard > 5000) throw new Error("story loops without stopping near line " + cmds[this.pc].ln);
      var c = cmds[this.pc++];
      if (this.exec(c)) return;   // waiting on the reader
    }
    if (this.pc >= cmds.length) this.halted = true;
  };

  // Returns true when the command waits for the reader.
  Machine.prototype.exec = function (c) {
    var h = this.hooks, st = this.stage, v = this.vars;
    switch (c.op) {
      case "chapter":
        this.chapter = c.id;
        return this.wait(c, function () { h.block(c); });
      case "say": case "narr": case "think":
        return this.wait(c, function () { h.line(c); });
      case "choice": {
        var visible = c.options.filter(function (o) { return !o.test || o.test(v); });
        var w = { op: "choice", cmd: c, visible: visible };
        this.waitingPc = this.pc - 1;
        this.waiting = w;
        h.choice(c, visible);
        return true;
      }
      case "poem": case "card": case "ending": case "compose": case "wait":
        return this.wait(c, function () { h.block(c); });
      case "note":
        h.note(c.text);
        return false;
      case "set":
        applyEffects(v, c.effects);
        return false;
      case "if":
        if (c.test(v)) this.pc = this.prog.labels[c.target];
        return false;
      case "goto":
        this.pc = this.prog.labels[c.target];
        return false;
      case "tear": {
        for (var i = 0; i < c.n; i++) {
          if (v.pearls <= 0) break;
          v.pearls--;
          if (c.kind === "repay") v.repaid++; else v.vain++;
          h.tear(c.kind, v);
        }
        return false;
      }
      case "bg":
        st.bg = c.scene; st.variant = c.variant;
        st.figures = {};
        st.fx = "auto"; st.fxAmount = null;
        h.stage(c, st);
        return false;
      case "show":
        st.figures[c.who] = { pose: c.pose, pos: c.pos, face: c.face };
        h.stage(c, st);
        return false;
      case "pose":
        if (st.figures[c.who]) st.figures[c.who].pose = c.pose;
        h.stage(c, st);
        return false;
      case "move":
        if (st.figures[c.who]) { st.figures[c.who].pos = c.pos; if (c.face) st.figures[c.who].face = c.face; }
        h.stage(c, st);
        return false;
      case "hide":
        if (c.who === "all") st.figures = {}; else delete st.figures[c.who];
        h.stage(c, st);
        return false;
      case "fx":
        st.fx = c.kind; st.fxAmount = c.amount;
        h.stage(c, st);
        return false;
      case "music":
        st.music = c.mood;
        h.stage(c, st);
        return false;
      case "dream":
        st.dream = c.on;
        h.stage(c, st);
        return false;
      case "hud":
        st.hud = c.on;
        h.stage(c, st);
        return false;
      case "sound": case "shake": case "flash":
        h.stage(c, st);
        return false;
      default:
        return false;
    }
  };

  Machine.prototype.wait = function (c, show) {
    this.waiting = c;
    this.waitingPc = this.pc - 1;
    show();
    return true;
  };

  kit.engine = {
    parse: parse, Machine: Machine, SPEAKERS: SPEAKERS, PEARLS: PEARLS,
    compileCond: compileCond, parseEffects: parseEffects, applyEffects: applyEffects,
    freshVars: freshVars
  };
})(window.HonglouKit);
