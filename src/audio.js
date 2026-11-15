// Void Tarot — sound. Everything is synthesized with WebAudio; there are no audio files.
// VTAudio.start() must be called from a user gesture. VTAudio.play(name) is safe to call any time.
(function (root) {
  'use strict';
  var ctx = null, master = null, comp = null, noiseBuf = null, muted = false, droneGain = null, bellTimer = null;
  var MASTER = 0.42;

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    master.connect(comp); comp.connect(ctx.destination);
    var len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    drone();
  }
  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
  }

  // ---- building blocks ----
  function env(g, t, a, peak, d) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  // tone: oscillator with a pitch glide and a percussive envelope
  function tone(o) {
    var t = ctx.currentTime + (o.at || 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || o.d));
    env(g, t, o.a || 0.005, o.v || 0.2, o.d || 0.2);
    var out = g;
    if (o.lp) { var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; g.connect(f); out = f; }
    osc.connect(g); out.connect(o.dest || master);
    osc.start(t); osc.stop(t + (o.a || 0.005) + (o.d || 0.2) + 0.05);
    return osc;
  }
  // noise: filtered noise burst with an optional filter sweep
  function noise(o) {
    var t = ctx.currentTime + (o.at || 0), src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = o.type || 'bandpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.f, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || o.d));
    env(g, t, o.a || 0.005, o.v || 0.2, o.d || 0.2);
    src.connect(f); f.connect(g); g.connect(o.dest || master);
    src.start(t, Math.random()); src.stop(t + (o.a || 0.005) + (o.d || 0.2) + 0.05);
  }
  function notes(list, o) {
    list.forEach(function (f, i) {
      tone({ f: f, type: o.type || 'sine', v: o.v || 0.1, d: o.d || 0.4, a: o.a || 0.01, at: (o.at || 0) + i * (o.step || 0.08), lp: o.lp });
    });
  }

  var S = {
    hover: function () { tone({ f: 1900, v: 0.012, d: 0.03 }); },
    click: function () { tone({ f: 520, to: 320, v: 0.07, d: 0.07, type: 'triangle' }); noise({ f: 3000, v: 0.03, d: 0.03, type: 'highpass' }); },
    flick: function () { noise({ f: 2600, to: 5200, v: 0.07, d: 0.07, type: 'bandpass', q: 1.2 }); },
    flip: function () { noise({ f: 1500, to: 3800, v: 0.05, d: 0.09, q: 2 }); },
    place: function () { tone({ f: 170, to: 80, v: 0.16, d: 0.11 }); noise({ f: 1800, v: 0.05, d: 0.04, type: 'highpass' }); },
    unplace: function () { tone({ f: 110, to: 160, v: 0.08, d: 0.08 }); noise({ f: 2400, v: 0.03, d: 0.05, type: 'highpass' }); },
    shuffle: function () { for (var i = 0; i < 6; i++) noise({ f: 2200 + i * 200, v: 0.045, d: 0.05, at: i * 0.055, q: 1.5 }); },
    activate: function () { tone({ f: 330, to: 660, v: 0.06, d: 0.18, type: 'triangle' }); tone({ f: 990, v: 0.02, d: 0.25 }); },
    mod: function () { notes([392, 523, 784], { v: 0.05, d: 0.22, step: 0.05, type: 'triangle' }); noise({ f: 900, to: 4000, v: 0.03, d: 0.25, q: 3 }); },
    fire: function () {
      noise({ f: 500, to: 2200, v: 0.16, d: 0.38, q: 0.7, a: 0.03 });
      for (var i = 0; i < 5; i++) noise({ f: 3500 + Math.random() * 2500, v: 0.05, d: 0.02, at: 0.05 + Math.random() * 0.3, type: 'highpass' });
      tone({ f: 140, to: 60, v: 0.1, d: 0.3 });
    },
    water: function () {
      noise({ f: 900, to: 350, v: 0.1, d: 0.4, type: 'lowpass', a: 0.04 });
      for (var i = 0; i < 6; i++) { var f = 500 + Math.random() * 900; tone({ f: f, to: f * 1.9, v: 0.05, d: 0.06, at: i * 0.045 + Math.random() * 0.03 }); }
    },
    air: function () { noise({ f: 700, to: 5000, v: 0.13, d: 0.32, type: 'bandpass', q: 1.6, a: 0.06 }); noise({ f: 6000, v: 0.03, d: 0.3, type: 'highpass', a: 0.1 }); },
    earth: function () {
      noise({ f: 160, to: 60, v: 0.3, d: 0.42, type: 'lowpass' }); tone({ f: 74, to: 38, v: 0.26, d: 0.36 });
      for (var i = 0; i < 4; i++) noise({ f: 700 + Math.random() * 600, v: 0.05, d: 0.03, at: 0.08 + i * 0.06, q: 4 });
    },
    'void': function () {
      [110, 164.8, 220.6].forEach(function (f, i) { tone({ f: f, to: f * 0.98, type: 'sawtooth', v: 0.05, d: 0.55, a: 0.04, lp: 900 + i * 300 }); });
      tone({ f: 1318, to: 659, v: 0.03, d: 0.5 });
    },
    impact: function () { tone({ f: 130, to: 42, v: 0.26, d: 0.2 }); noise({ f: 900, to: 200, v: 0.14, d: 0.12, type: 'lowpass' }); },
    resist: function () { tone({ f: 240, to: 200, type: 'square', v: 0.04, d: 0.12, lp: 900 }); },
    explosion: function () {
      noise({ f: 2600, to: 70, v: 0.5, d: 1.05, type: 'lowpass', q: 0.5 });
      tone({ f: 95, to: 26, v: 0.5, d: 0.9 });
      tone({ f: 48, to: 30, v: 0.3, d: 1.1, type: 'triangle' });
      for (var i = 0; i < 8; i++) noise({ f: 2500 + Math.random() * 3000, v: 0.06, d: 0.03, at: 0.1 + Math.random() * 0.7, type: 'highpass' });
    },
    charge: function () {
      tone({ f: 90, to: 420, type: 'sawtooth', v: 0.05, d: 0.45, a: 0.08, lp: 2400 });
      for (var i = 0; i < 7; i++) noise({ f: 5000 + Math.random() * 3000, v: 0.05, d: 0.015, at: Math.random() * 0.45, type: 'highpass' });
    },
    zap: function () {
      var t = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      osc.type = 'sawtooth'; f.type = 'highpass'; f.frequency.value = 500;
      for (var i = 0; i < 26; i++) osc.frequency.setValueAtTime(120 + Math.random() * 2600, t + i * 0.017);
      env(g, t, 0.003, 0.2, 0.5);
      osc.connect(f); f.connect(g); g.connect(master); osc.start(t); osc.stop(t + 0.6);
      noise({ f: 5000, v: 0.3, d: 0.09, type: 'highpass' });
      noise({ f: 1800, to: 90, v: 0.3, d: 0.8, type: 'lowpass', at: 0.05 });
      tone({ f: 70, to: 32, v: 0.36, d: 0.7, at: 0.04 });
    },
    steam: function () { noise({ f: 5200, to: 1500, v: 0.11, d: 0.6, type: 'highpass', a: 0.03 }); },
    heal: function () { notes([523.25, 659.25, 783.99, 1046.5], { v: 0.06, d: 0.5, step: 0.07 }); },
    ward: function () { [392, 587.3, 881, 1175].forEach(function (f, i) { tone({ f: f, v: 0.05 - i * 0.008, d: 0.5 - i * 0.07, type: 'triangle' }); }); noise({ f: 300, v: 0.08, d: 0.08, type: 'lowpass' }); },
    block: function () { tone({ f: 420, to: 300, type: 'square', v: 0.07, d: 0.1, lp: 1800 }); noise({ f: 2200, v: 0.12, d: 0.07, q: 3 }); tone({ f: 110, to: 60, v: 0.16, d: 0.14 }); },
    seal: function () {
      [196, 293.7, 407, 571, 833].forEach(function (f, i) { tone({ f: f, v: 0.11 - i * 0.015, d: 1.6 - i * 0.2 }); });
      noise({ f: 4000, to: 800, v: 0.12, d: 0.3, type: 'highpass' });
      notes([587.3, 784, 1174.7, 1568], { v: 0.06, d: 0.6, step: 0.09, at: 0.12, type: 'triangle' });
    },
    sealNear: function () { tone({ f: 880, v: 0.03, d: 0.25 }); tone({ f: 1320, v: 0.02, d: 0.3, at: 0.05 }); },
    stun: function () { notes([1568, 1319, 1047, 784], { v: 0.04, d: 0.2, step: 0.06, type: 'triangle' }); },
    telegraph: function () { tone({ f: 46, to: 92, type: 'sawtooth', v: 0.16, d: 0.6, a: 0.25, lp: 500 }); noise({ f: 200, to: 900, v: 0.06, d: 0.6, a: 0.3, q: 2 }); },
    lunge: function () { noise({ f: 400, to: 2400, v: 0.14, d: 0.22, q: 1.2, a: 0.05 }); },
    hurt: function () { tone({ f: 160, to: 46, v: 0.34, d: 0.26 }); noise({ f: 1400, to: 200, v: 0.2, d: 0.18, type: 'lowpass' }); tone({ f: 233, to: 110, type: 'sawtooth', v: 0.05, d: 0.3, lp: 800 }); },
    curse: function () { notes([311, 293.7, 207.7], { type: 'sawtooth', v: 0.045, d: 0.4, step: 0.11, lp: 1100 }); },
    purge: function () { noise({ f: 3000, to: 600, v: 0.1, d: 0.4, q: 1 }); tone({ f: 660, to: 1320, v: 0.04, d: 0.3 }); },
    shadeHeal: function () { notes([311, 370, 440], { type: 'triangle', v: 0.05, d: 0.35, step: 0.07 }); },
    shatter: function () {
      for (var i = 0; i < 14; i++) noise({ f: 2500 + Math.random() * 5000, v: 0.09, d: 0.05 + Math.random() * 0.1, at: Math.random() * 0.5, q: 6 });
      noise({ f: 1200, to: 80, v: 0.3, d: 1.0, type: 'lowpass' }); tone({ f: 82, to: 30, v: 0.3, d: 1.0 });
      notes([2093, 1568, 1245, 932, 622], { v: 0.035, d: 0.7, step: 0.1, at: 0.15 });
    },
    victory: function () {
      notes([293.7, 440, 587.3, 740, 880, 1174.7], { v: 0.08, d: 1.3, step: 0.13, type: 'triangle' });
      [146.8, 220, 370].forEach(function (f) { tone({ f: f, v: 0.06, d: 2.4, a: 0.3, at: 0.5 }); });
    },
    defeat: function () {
      notes([220, 207.7, 164.8, 146.8, 110], { type: 'sawtooth', v: 0.06, d: 0.9, step: 0.26, lp: 700 });
      tone({ f: 55, to: 36, v: 0.24, d: 2.4, a: 0.2 });
    },
    reward: function () { notes([587.3, 880, 1174.7, 1760], { v: 0.06, d: 0.7, step: 0.08 }); },
    burn: function () { noise({ f: 800, to: 3000, v: 0.12, d: 0.7, q: 0.8, a: 0.05 }); tone({ f: 200, to: 60, v: 0.1, d: 0.6 }); },
    travel: function () { notes([220, 261.6, 329.6, 392], { v: 0.045, d: 0.5, step: 0.16, type: 'triangle' }); noise({ f: 500, to: 1500, v: 0.03, d: 0.8, a: 0.3, q: 1 }); },
    enter: function () { tone({ f: 55, to: 41, v: 0.3, d: 1.4, a: 0.05 }); noise({ f: 200, to: 2000, v: 0.08, d: 0.9, a: 0.5, q: 1 }); notes([146.8, 174.6, 220], { type: 'sawtooth', v: 0.035, d: 1.2, step: 0.02, lp: 900, a: 0.2 }); },
    draw: function () { tone({ f: 880, v: 0.03, d: 0.3 }); }
  };

  // ---- ambient: slow detuned drone with a breathing filter and rare bells ----
  function drone() {
    droneGain = ctx.createGain(); droneGain.gain.value = 0.0001;
    droneGain.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + 5);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 1.2;
    var lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.045; lg.gain.value = 170; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    [[55, 'sawtooth', 0.22], [55.4, 'sawtooth', 0.2], [82.41, 'sine', 0.3], [110.3, 'triangle', 0.14], [164.6, 'sine', 0.07]].forEach(function (v, i) {
      var o = ctx.createOscillator(), g = ctx.createGain(), l2 = ctx.createOscillator(), l2g = ctx.createGain();
      o.type = v[1]; o.frequency.value = v[0]; g.gain.value = v[2];
      l2.frequency.value = 0.02 + i * 0.013; l2g.gain.value = v[2] * 0.6; l2.connect(l2g); l2g.connect(g.gain); l2.start();
      o.connect(g); g.connect(lp); o.start();
    });
    lp.connect(droneGain); droneGain.connect(master);
    var scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
    (function bell() {
      bellTimer = setTimeout(function () {
        if (ctx.state === 'running') {
          var f = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.3 ? 2 : 1);
          tone({ f: f, v: 0.022, d: 3.2, a: 0.02 }); tone({ f: f * 2.76, v: 0.006, d: 1.6 }); tone({ f: f * 1.5, v: 0.008, d: 2.6, at: 0.4 });
        }
        bell();
      }, 5000 + Math.random() * 9000);
    })();
  }

  var played = {};
  function play(name) {
    played[name] = (played[name] || 0) + 1;
    if (!ctx || muted || ctx.state !== 'running' || !S[name]) return;
    try { S[name](); } catch (e) { if (root.console) console.error('audio ' + name + ': ' + e.message); }
  }

  root.VTAudio = {
    start: start, play: play, setMuted: setMuted,
    isMuted: function () { return muted; },
    names: function () { return Object.keys(S); },
    played: played,
    state: function () { return ctx ? ctx.state : 'none'; }
  };
})(this);
