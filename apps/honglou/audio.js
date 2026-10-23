/* ── 还泪记 · audio ───────────────────────────────────────────────────────
   Everything heard is made in the page with Web Audio; nothing is loaded.

   The music is a plucked string (Karplus-Strong: a burst of noise
   circulating in a short, slowly damped delay, which is how a real string
   rings) improvising on the five-note scale. Each mood picks a mode
   (宫商角徵羽), a register, a pace and how much it lingers; phrases wander
   step-wise, end on the mode's home note, and sometimes add an octave or a
   rolled glissando the way a 古筝 player would. A hall reverb is made from
   decaying noise. Rain and wind are filtered noise. The small sounds (a
   pearl landing in jade, a lot drawn, a scroll unrolled, a seal) are a
   few oscillators and noise bursts each.

   Audio starts only after the first click or key, as browsers require.  */
(function (kit) {
  "use strict";

  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master, musicBus, sfxBus, reverb, wet, ambBus;
  var vol = { music: 0.6, sfx: 0.7 };
  var mood = "off", wantMood = "off";
  var strings = {};
  var timer = 0, nextAt = 0, phrase = [], lastDeg = 0;
  var amb = null;

  // Modes as scale degrees in semitones above the tonic (宫 C, 商 D, 角 E,
  // 徵 G, 羽 A), each starting on its own home note.
  var MODES = {
    gong: [0, 2, 4, 7, 9],
    shang: [2, 4, 7, 9, 12],
    jue: [4, 7, 9, 12, 14],
    zhi: [7, 9, 12, 14, 16],
    yu: [9, 12, 14, 16, 19]
  };

  //          mode     tonic(midi) pace(s) rest  octave  gliss  ambience
  var MOODS = {
    title:  { mode: "yu", root: 50, pace: 1.1, rest: 0.35, oct: 0.25, gliss: 0.12, amb: null, gain: 0.8 },
    dream:  { mode: "gong", root: 55, pace: 0.95, rest: 0.3, oct: 0.3, gliss: 0.2, amb: null, gain: 0.75 },
    spring: { mode: "gong", root: 57, pace: 0.55, rest: 0.18, oct: 0.15, gliss: 0.06, amb: null, gain: 0.7 },
    summer: { mode: "shang", root: 55, pace: 0.6, rest: 0.22, oct: 0.15, gliss: 0.05, amb: null, gain: 0.65 },
    autumn: { mode: "zhi", root: 52, pace: 0.8, rest: 0.3, oct: 0.2, gliss: 0.06, amb: "wind", gain: 0.7 },
    night:  { mode: "yu", root: 48, pace: 1.0, rest: 0.4, oct: 0.2, gliss: 0.05, amb: null, gain: 0.65 },
    opera:  { mode: "zhi", root: 57, pace: 0.42, rest: 0.12, oct: 0.1, gliss: 0.04, amb: null, gain: 0.6 },
    sorrow: { mode: "yu", root: 50, pace: 0.95, rest: 0.38, oct: 0.15, gliss: 0.04, amb: null, gain: 0.7 },
    rain:   { mode: "yu", root: 47, pace: 1.3, rest: 0.5, oct: 0.15, gliss: 0.02, amb: "rain", gain: 0.6 },
    moon:   { mode: "jue", root: 52, pace: 1.15, rest: 0.42, oct: 0.3, gliss: 0.08, amb: null, gain: 0.65 },
    winter: { mode: "yu", root: 45, pace: 1.5, rest: 0.55, oct: 0.2, gliss: 0.02, amb: "wind", gain: 0.6 },
    last:   { mode: "yu", root: 45, pace: 2.0, rest: 0.6, oct: 0.1, gliss: 0, amb: "wind", gain: 0.55 },
    snow:   { mode: "gong", root: 50, pace: 1.6, rest: 0.55, oct: 0.35, gliss: 0.05, amb: "wind", gain: 0.55 }
  };

  function init() {
    if (ctx || !AC) return !!ctx;
    try { ctx = new AC(); } catch (e) { ctx = null; return false; }
    master = ctx.createGain();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); sfxBus = ctx.createGain(); ambBus = ctx.createGain();
    musicBus.connect(master); sfxBus.connect(master); ambBus.connect(master);
    reverb = ctx.createConvolver();
    reverb.buffer = impulse(3.2, 2.4);
    wet = ctx.createGain(); wet.gain.value = 0.42;
    reverb.connect(wet); wet.connect(master);
    applyVolume();
    return true;
  }

  function impulse(sec, decay) {
    var len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // One plucked string, rendered once per pitch and kept.
  function string(midi) {
    if (strings[midi]) return strings[midi];
    var sr = ctx.sampleRate, f = 440 * Math.pow(2, (midi - 69) / 12);
    var len = Math.floor(sr * 3.2), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    var period = sr / f, N = Math.floor(period), frac = period - N;
    var line = new Float32Array(N + 2);
    // A bright pluck near the bridge: noise, slightly smoothed.
    var prev = 0;
    for (var i = 0; i < line.length; i++) { var v = Math.random() * 2 - 1; prev = prev * 0.35 + v * 0.65; line[i] = prev; }
    var damp = 0.4965 + Math.min(0.0032, 0.0016 * (60 / midi)), idx = 0, last = 0;
    for (var n = 0; n < len; n++) {
      var a = line[idx], b = line[(idx + 1) % line.length];
      var out = a + (b - a) * frac;
      var nv = (out + last) * damp;
      last = out;
      line[idx] = nv;
      idx = (idx + 1) % line.length;
      d[n] = out * (n < 80 ? n / 80 : 1);
    }
    strings[midi] = buf;
    return buf;
  }

  function pluck(midi, at, gain, slide) {
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = string(Math.round(midi));
    if (slide) {
      // 吟猱: a press after the pluck bends the note and lets it waver.
      src.playbackRate.setValueAtTime(1, at);
      src.playbackRate.linearRampToValueAtTime(Math.pow(2, slide / 12), at + 0.35);
      src.playbackRate.setTargetAtTime(1, at + 0.6, 0.25);
    }
    g.gain.setValueAtTime(gain, at);
    g.gain.setTargetAtTime(0, at + 2.4, 0.5);
    src.connect(g); g.connect(musicBus); g.connect(reverb);
    src.start(at);
    src.stop(at + 3.4);
  }

  /* ── The player: phrases on the mode, scheduled just ahead ─────────── */
  function degreeToMidi(m, deg) {
    var scale = MODES[m.mode], oct = Math.floor(deg / 5), k = ((deg % 5) + 5) % 5;
    return m.root + scale[k] - scale[0] + oct * 12;
  }

  function makePhrase(m) {
    var notes = [], n = 4 + Math.floor(Math.random() * 5), deg = lastDeg;
    for (var i = 0; i < n; i++) {
      var step = [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)];
      deg = Math.max(-2, Math.min(9, deg + step));
      var dur = m.pace * [1, 1, 0.5, 1.5, 2][Math.floor(Math.random() * 5)];
      notes.push({ deg: deg, dur: dur });
    }
    // End on home, held.
    var home = Math.random() < 0.5 ? 0 : 5;
    notes.push({ deg: home, dur: m.pace * 3, end: true });
    lastDeg = home;
    return notes;
  }

  function schedule() {
    if (!ctx || mood === "off") return;
    var m = MOODS[mood];
    while (nextAt < ctx.currentTime + 0.4) {
      if (!phrase.length) {
        phrase = makePhrase(m);
        if (Math.random() < m.gliss) glissando(m, nextAt);
        nextAt += m.pace * (Math.random() < m.rest ? 2.5 : 0.6);
        continue;
      }
      var note = phrase.shift(), midi = degreeToMidi(m, note.deg);
      var gain = (note.end ? 0.32 : 0.24 + Math.random() * 0.1) * m.gain;
      pluck(midi, nextAt, gain, !note.end && Math.random() < 0.18 ? (Math.random() < 0.5 ? 1 : 2) : 0);
      if (Math.random() < m.oct) pluck(midi - 12, nextAt + 0.012, gain * 0.55, 0);
      if (note.end && Math.random() < 0.5) pluck(degreeToMidi(m, note.deg + 2), nextAt + 0.02, gain * 0.4, 0);
      nextAt += note.dur * (0.92 + Math.random() * 0.16);
    }
  }

  // 刮奏: a quick roll up the strings.
  function glissando(m, at) {
    var start = Math.floor(Math.random() * 3), n = 8 + Math.floor(Math.random() * 5);
    for (var i = 0; i < n; i++) pluck(degreeToMidi(m, start + i), at + i * 0.045, 0.12 * m.gain * (1 - i / n * 0.5), 0);
  }

  /* ── Ambience ──────────────────────────────────────────────────────── */
  function noiseBuffer(sec) {
    var len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function setAmbience(kind) {
    if (amb && amb.kind === kind) return;
    if (amb) {
      var old = amb;
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
      setTimeout(function () { try { old.src.stop(); } catch (e) { /* stopped */ } }, 4000);
      amb = null;
    }
    if (!kind) return;
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuffer(4); src.loop = true;
    if (kind === "rain") { f.type = "bandpass"; f.frequency.value = 2400; f.Q.value = 0.5; }
    else { f.type = "lowpass"; f.frequency.value = 480; f.Q.value = 1.2; }
    g.gain.value = 0;
    g.gain.setTargetAtTime(kind === "rain" ? 0.16 : 0.1, ctx.currentTime, 1.5);
    src.connect(f); f.connect(g); g.connect(ambBus);
    if (kind === "wind") {
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.08; lg.gain.value = 260;
      lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    }
    src.start();
    amb = { kind: kind, src: src, gain: g };
  }

  /* ── Small sounds ──────────────────────────────────────────────────── */
  function tone(type, f, at, dur, gain, to) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(sfxBus); g.connect(reverb);
    o.start(at); o.stop(at + dur + 0.05);
  }

  function burst(at, dur, gain, freq, q, type) {
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuffer(dur + 0.05);
    f.type = type || "bandpass"; f.frequency.value = freq; f.Q.value = q || 1;
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(at); src.stop(at + dur + 0.05);
  }

  var SFX = {
    // A pearl into jade: a bright bell with an inharmonic partial.
    pearl: function (t) { tone("sine", 1568, t, 1.6, 0.22); tone("sine", 1568 * 2.76, t, 0.7, 0.08); tone("sine", 2093, t + 0.12, 1.2, 0.1); },
    // A pearl lost: a dull drop, sliding down.
    drop: function (t) { tone("sine", 620, t, 0.5, 0.18, 260); burst(t, 0.08, 0.05, 900, 2); },
    chime: function (t) { [0, 0.18, 0.36].forEach(function (d, i) { tone("sine", [1046, 1318, 1568][i], t + d, 2.2, 0.12); tone("sine", [1046, 1318, 1568][i] * 2.76, t + d, 0.6, 0.04); }); },
    lots: function (t) { for (var i = 0; i < 6; i++) burst(t + i * 0.05 + Math.random() * 0.02, 0.05, 0.12, 1800 + Math.random() * 900, 6); },
    pick: function (t) { burst(t, 0.07, 0.22, 1200, 5); tone("triangle", 520, t, 0.12, 0.08); },
    page: function (t) { burst(t, 0.45, 0.07, 3200, 0.6, "highpass"); },
    scroll: function (t) { burst(t, 0.9, 0.05, 2600, 0.5, "highpass"); burst(t + 0.2, 0.6, 0.04, 1800, 0.8); },
    seal: function (t) { tone("sine", 140, t, 0.25, 0.25, 70); burst(t, 0.06, 0.08, 600, 1, "lowpass"); },
    brush: function (t) { burst(t, 0.35, 0.05, 4200, 0.7, "highpass"); },
    jade: function (t) { tone("sine", 2637, t, 0.5, 0.2); tone("sine", 3520, t + 0.03, 0.4, 0.12); burst(t, 0.12, 0.12, 5000, 3); for (var i = 1; i < 4; i++) tone("sine", 2637, t + i * 0.13, 0.25, 0.08 / i); },
    knock: function (t) { burst(t, 0.09, 0.3, 320, 4); burst(t + 0.26, 0.09, 0.3, 320, 4); },
    birds: function (t) { for (var i = 0; i < 10; i++) burst(t + i * 0.035, 0.05, 0.08, 700 + Math.random() * 300, 2); for (var k = 0; k < 4; k++) tone("sine", 3000 + Math.random() * 800, t + 0.3 + k * 0.12, 0.08, 0.04, 2200); },
    splash: function (t) { burst(t, 0.6, 0.18, 900, 0.7, "lowpass"); burst(t + 0.05, 0.3, 0.08, 2600, 1); }
  };

  /* ── Public ────────────────────────────────────────────────────────── */
  function applyVolume() {
    if (!ctx) return;
    musicBus.gain.setTargetAtTime(vol.music * 0.9, ctx.currentTime, 0.3);
    ambBus.gain.setTargetAtTime(vol.music, ctx.currentTime, 0.3);
    sfxBus.gain.setTargetAtTime(vol.sfx, ctx.currentTime, 0.1);
    wet.gain.setTargetAtTime(0.42 * Math.max(vol.music, vol.sfx * 0.6), ctx.currentTime, 0.3);
  }

  function startMood(m) {
    mood = m;
    if (!ctx) return;
    var spec = MOODS[m];
    setAmbience(spec ? spec.amb : null);
    if (!spec) return;
    phrase = [];
    lastDeg = 0;
    nextAt = Math.max(nextAt, ctx.currentTime + 0.6);
    if (!timer) timer = setInterval(schedule, 120);
  }

  kit.audio = {
    unlock: function () {
      if (!init()) return;
      if (ctx.state === "suspended") ctx.resume();
      if (mood !== wantMood) startMood(wantMood);
    },
    music: function (m) {
      m = MOODS[m] ? m : "off";
      wantMood = m;
      if (!ctx || ctx.state !== "running") return;
      if (m === mood) return;
      startMood(m);
    },
    sfx: function (name) {
      if (!ctx || ctx.state !== "running" || !SFX[name] || vol.sfx <= 0) return;
      SFX[name](ctx.currentTime + 0.01);
    },
    blip: function () { /* the page is quiet while ink spreads */ },
    volume: function (m, s) {
      vol.music = m; vol.sfx = s;
      applyVolume();
    }
  };
  document.addEventListener("visibilitychange", function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (wantMood !== "off" || vol.sfx > 0) ctx.resume();
  });
})(window.HonglouKit);
