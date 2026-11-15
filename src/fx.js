// Void Tarot — canvas effects: the starfield and nebula behind everything, the pool of
// ground under the Shade, and the particles, bolts and shockwaves in front.
// All coordinates are stage coordinates (1440 x 900); resize() maps them to the window.
(function (root) {
  'use strict';
  var bg, fx, bctx, fctx, shaker;
  var view = { s: 1, ox: 0, oy: 0, dpr: 1, w: 1440, h: 900 };
  var parts = [], back = [], bolts = [], rings = [], heads = [];
  var stars = [], nebA, nebB, sprites = {};
  var ground = { on: false, state: 'bare', prev: 'bare', k: 1, x: 1100, y: 566, rx: 285, ry: 50 };
  var aura = { on: false, x: 0, y: 0, hue: 225 };
  var shakeMag = 0, shakeEnd = 0, shakeDur = 1, sx = 0, sy = 0;
  var par = 0, parTarget = 0, T = 0, last = 0, shoot = null;
  var TAU = Math.PI * 2;
  function rnd(a, b) { return a + Math.random() * (b - a); }

  var KIND = {
    ember: { col: ['255,150,60', '255,200,90', '255,90,40'], grav: -90, drag: 1.6, life: [0.5, 1.2], size: [3, 9], glow: true },
    flame: { col: ['255,120,40', '255,70,30', '255,190,80'], grav: -160, drag: 2.5, life: [0.25, 0.6], size: [14, 34], glow: true },
    drop: { col: ['90,170,255', '150,210,255', '60,120,255'], grav: 620, drag: 0.4, life: [0.5, 1.0], size: [2, 5], streak: true },
    mist: { col: ['90,160,255', '140,200,255'], grav: -20, drag: 2, life: [0.4, 0.9], size: [10, 26], glow: true },
    spark: { col: ['210,225,255', '170,150,255', '255,255,255'], grav: 0, drag: 3.5, life: [0.15, 0.45], size: [1.5, 3.5], streak: true },
    gust: { col: ['200,215,255', '160,180,255'], grav: 0, drag: 1.2, life: [0.3, 0.7], size: [8, 20], glow: true },
    stone: { col: ['150,112,66', '110,84,52', '190,150,90'], grav: 900, drag: 0.3, life: [0.6, 1.2], size: [4, 11], poly: true },
    dust: { col: ['170,140,100', '130,105,80'], grav: -30, drag: 2.2, life: [0.5, 1.2], size: [14, 36], glow: true, dim: 0.35 },
    'void': { col: ['150,110,255', '100,130,255', '220,190,255'], grav: -30, drag: 1.5, life: [0.5, 1.2], size: [3, 10], glow: true, swirl: 3 },
    heal: { col: ['140,255,170', '220,255,160', '120,230,200'], grav: -120, drag: 1.2, life: [0.6, 1.3], size: [3, 8], glow: true },
    gold: { col: ['255,215,120', '255,240,190', '255,180,70'], grav: 120, drag: 1.4, life: [0.6, 1.5], size: [2, 7], glow: true },
    blood: { col: ['255,60,70', '200,30,60'], grav: 300, drag: 1.5, life: [0.3, 0.8], size: [3, 8], glow: true },
    shard: { col: ['120,160,255', '200,220,255', '60,90,200'], grav: 500, drag: 0.5, life: [0.8, 1.6], size: [5, 14], poly: true, lit: true },
    smoke: { col: ['30,40,90', '50,40,110', '20,30,70'], grav: -26, drag: 0.6, life: [1.6, 3.2], size: [26, 60], glow: true, dim: 0.5 },
    steam: { col: ['200,220,255', '230,240,255'], grav: -110, drag: 1.2, life: [0.6, 1.4], size: [16, 40], glow: true, dim: 0.3 },
    ash: { col: ['255,120,60', '90,80,90'], grav: -60, drag: 1, life: [0.6, 1.4], size: [2, 5], glow: true }
  };

  function sprite(col) {
    if (sprites[col]) return sprites[col];
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(' + col + ',1)'); gr.addColorStop(0.25, 'rgba(' + col + ',0.55)');
    gr.addColorStop(0.6, 'rgba(' + col + ',0.14)'); gr.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (sprites[col] = c);
  }

  function nebula(colors) {
    var c = document.createElement('canvas'); c.width = 640; c.height = 400;
    var g = c.getContext('2d');
    for (var i = 0; i < 16; i++) {
      var x = rnd(0, 640), y = rnd(0, 400), r = rnd(80, 240), col = colors[i % colors.length];
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(' + col + ',' + rnd(0.10, 0.22).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
      g.fillStyle = gr; g.fillRect(0, 0, 640, 400);
    }
    return c;
  }

  function init(bgCanvas, fxCanvas, shakeEl) {
    bg = bgCanvas; fx = fxCanvas; shaker = shakeEl;
    bctx = bg.getContext('2d'); fctx = fx.getContext('2d');
    for (var i = 0; i < 300; i++) stars.push({ x: Math.random(), y: Math.random(), z: rnd(0.15, 1), p: rnd(0, TAU), sp: rnd(0.4, 2.2), r: Math.random() < 0.06 ? rnd(1.6, 2.6) : rnd(0.5, 1.4), hue: Math.random() < 0.2 ? '255,225,180' : '190,210,255' });
    nebA = nebula(['30,60,170', '70,40,160', '20,90,150', '40,30,120']);
    nebB = nebula(['90,50,170', '20,50,140', '150,110,60', '30,100,160']);
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function resize(s, ox, oy) {
    var dpr = Math.min(root.devicePixelRatio || 1, 1.5);
    view.s = s; view.ox = ox; view.oy = oy; view.dpr = dpr; view.w = root.innerWidth; view.h = root.innerHeight;
    [bg, fx].forEach(function (c) {
      c.width = Math.round(view.w * dpr); c.height = Math.round(view.h * dpr);
      c.style.width = view.w + 'px'; c.style.height = view.h + 'px';
    });
  }
  function stageT(c) { var k = view.s * view.dpr; c.setTransform(k, 0, 0, k, (view.ox + sx * view.s) * view.dpr, (view.oy + sy * view.s) * view.dpr); }

  // ---- spawning ----
  function burst(kind, x, y, n, o) {
    o = o || {};
    var K = KIND[kind], list = o.back ? back : parts;
    for (var i = 0; i < n; i++) {
      var a = o.dir != null ? o.dir + rnd(-1, 1) * (o.spread != null ? o.spread : 0.5) : rnd(0, TAU);
      var sp = rnd(o.min != null ? o.min : 40, o.speed || 260);
      var life = rnd(K.life[0], K.life[1]) * (o.life || 1);
      list.push({
        k: K, x: x + rnd(-1, 1) * (o.rx || 0), y: y + rnd(-1, 1) * (o.ry || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: life, max: life, size: rnd(K.size[0], K.size[1]) * (o.size || 1), col: K.col[(Math.random() * K.col.length) | 0],
        rot: rnd(0, TAU), vr: rnd(-8, 8), grav: o.grav != null ? o.grav : K.grav, ph: rnd(0, TAU)
      });
    }
    if (list.length > 2600) list.splice(0, list.length - 2600);
  }
  var TRAIL = { fire: ['ember', 'flame'], water: ['drop', 'mist'], air: ['spark', 'gust'], earth: ['stone', 'dust'], 'void': ['void', 'void'], heal: ['heal', 'heal'], gold: ['gold', 'gold'], blood: ['blood', 'blood'] };
  var HEADCOL = { fire: '255,150,60', water: '90,170,255', air: '210,225,255', earth: '190,150,90', 'void': '150,110,255', heal: '140,255,170', gold: '255,215,120', blood: '255,60,70' };
  // A glowing head that flies an arc from A to B and sheds a trail. Resolves on arrival.
  function projectile(el, x0, y0, x1, y1, dur, o) {
    o = o || {};
    return new Promise(function (res) {
      var arc = o.arc != null ? o.arc : -140;
      heads.push({ el: el, x0: x0, y0: y0, x1: x1, y1: y1, cx: (x0 + x1) / 2 + rnd(-40, 40), cy: Math.min(y0, y1) + arc, t: 0, dur: Math.max(0.05, dur / 1000), size: o.size || 1, done: res });
    });
  }
  function lightning(x0, y0, x1, y1, o) {
    o = o || {};
    bolts.push({ x0: x0, y0: y0, x1: x1, y1: y1, life: o.life || 0.45, max: o.life || 0.45, w: o.w || 3, col: o.col || '200,220,255', seed: 0, pts: null, forks: o.forks != null ? o.forks : 3, jag: o.jag || 60 });
  }
  function ring(x, y, col, r, dur, o) { rings.push({ x: x, y: y, col: col || '255,200,120', r: r || 300, t: 0, dur: (dur || 600) / 1000, flat: (o && o.flat) || 1, w: (o && o.w) || 6 }); }
  function shake(mag, ms) { shakeMag = Math.max(shakeMag, mag); shakeDur = ms / 1000; shakeEnd = T + shakeDur; }

  function setGround(state) { if (state === ground.state) return; ground.prev = ground.state; ground.state = state; ground.k = 0; }
  function showGround(on, state) { ground.on = on; if (state) { ground.state = ground.prev = state; ground.k = 1; } }
  function setAura(on, x, y) { aura.on = on; aura.x = x; aura.y = y; }
  function clear() { parts.length = 0; back.length = 0; bolts.length = 0; rings.length = 0; heads.forEach(function (h) { h.done(); }); heads.length = 0; }

  // ---- drawing ----
  function drawParts(c, list, dt) {
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i], K = p.k;
      p.life -= dt;
      if (p.life <= 0) { list[i] = list[list.length - 1]; list.pop(); continue; }
      var dr = Math.max(0, 1 - K.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vy += p.grav * dt;
      if (K.swirl) { p.vx += Math.cos(T * K.swirl + p.ph) * 60 * dt; p.vy += Math.sin(T * K.swirl + p.ph) * 60 * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      var f = p.life / p.max, a = Math.min(1, f * 1.6) * (K.dim || 1);
      if (K.poly) {
        c.globalCompositeOperation = K.lit ? 'lighter' : 'source-over';
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = 'rgba(' + p.col + ',' + a.toFixed(3) + ')';
        c.beginPath(); c.moveTo(-p.size, -p.size * 0.5); c.lineTo(p.size * 0.7, -p.size * 0.8); c.lineTo(p.size, p.size * 0.5); c.lineTo(-p.size * 0.4, p.size * 0.9); c.closePath(); c.fill();
        c.restore();
      } else if (K.streak) {
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = 'rgba(' + p.col + ',' + a.toFixed(3) + ')'; c.lineWidth = p.size; c.lineCap = 'round';
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); c.stroke();
      } else {
        c.globalCompositeOperation = K === KIND.smoke ? 'source-over' : 'lighter';
        var s = p.size * (K === KIND.smoke || K === KIND.steam || K === KIND.dust ? (1.6 - f * 0.6) : (0.5 + f * 0.5)) * 2.2;
        c.globalAlpha = a;
        c.drawImage(sprite(p.col), p.x - s, p.y - s, s * 2, s * 2);
        c.globalAlpha = 1;
      }
    }
    c.globalCompositeOperation = 'source-over';
  }

  function jag(x0, y0, x1, y1, amp, depth, out) {
    if (depth === 0) { out.push([x1, y1]); return; }
    var mx = (x0 + x1) / 2 + rnd(-amp, amp), my = (y0 + y1) / 2 + rnd(-amp, amp);
    jag(x0, y0, mx, my, amp / 2, depth - 1, out); jag(mx, my, x1, y1, amp / 2, depth - 1, out);
  }
  function drawBolts(c, dt) {
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (var i = bolts.length - 1; i >= 0; i--) {
      var b = bolts[i]; b.life -= dt;
      if (b.life <= 0) { bolts.splice(i, 1); continue; }
      var seed = Math.floor(b.life * 22);
      if (seed !== b.seed || !b.pts) {
        b.seed = seed; b.pts = [[[b.x0, b.y0]]]; jag(b.x0, b.y0, b.x1, b.y1, b.jag, 5, b.pts[0]);
        for (var k = 0; k < b.forks; k++) {
          var m = b.pts[0][(rnd(4, b.pts[0].length - 4)) | 0], fk = [[m[0], m[1]]];
          jag(m[0], m[1], m[0] + rnd(-150, 150), m[1] + rnd(-60, 130), 30, 3, fk); b.pts.push(fk);
        }
      }
      var f = b.life / b.max, a = Math.min(1, f * 2) * (0.6 + 0.4 * Math.random());
      for (var pass = 0; pass < 2; pass++) {
        b.pts.forEach(function (pts, pi) {
          c.strokeStyle = pass ? 'rgba(255,255,255,' + a.toFixed(3) + ')' : 'rgba(' + b.col + ',' + (a * 0.45).toFixed(3) + ')';
          c.lineWidth = (pass ? b.w : b.w * 4.5) * (pi ? 0.5 : 1);
          c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
          for (var q = 1; q < pts.length; q++) c.lineTo(pts[q][0], pts[q][1]);
          c.stroke();
        });
      }
    }
    c.globalCompositeOperation = 'source-over';
  }
  function drawRings(c, dt) {
    c.globalCompositeOperation = 'lighter';
    for (var i = rings.length - 1; i >= 0; i--) {
      var r = rings[i]; r.t += dt;
      var f = r.t / r.dur;
      if (f >= 1) { rings.splice(i, 1); continue; }
      var e = 1 - Math.pow(1 - f, 3);
      c.save(); c.translate(r.x, r.y); c.scale(1, r.flat);
      c.strokeStyle = 'rgba(' + r.col + ',' + ((1 - f) * 0.9).toFixed(3) + ')'; c.lineWidth = r.w * (1 - f) + 1;
      c.beginPath(); c.arc(0, 0, r.r * e, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(' + r.col + ',' + ((1 - f) * 0.25).toFixed(3) + ')'; c.lineWidth = r.w * 5 * (1 - f) + 1;
      c.beginPath(); c.arc(0, 0, r.r * e, 0, TAU); c.stroke();
      c.restore();
    }
    c.globalCompositeOperation = 'source-over';
  }
  function drawHeads(c, dt) {
    for (var i = heads.length - 1; i >= 0; i--) {
      var h = heads[i]; h.t += dt / h.dur;
      var t = Math.min(1, h.t), e = t * t * (3 - 2 * t), u = 1 - e;
      var x = u * u * h.x0 + 2 * u * e * h.cx + e * e * h.x1, y = u * u * h.y0 + 2 * u * e * h.cy + e * e * h.y1;
      var tr = TRAIL[h.el] || TRAIL['void'];
      burst(tr[0], x, y, Math.ceil(5 * h.size), { speed: 90, rx: 6, ry: 6, life: 0.7 });
      if (Math.random() < 0.7) burst(tr[1], x, y, 1, { speed: 40, life: 0.6, size: h.size });
      c.globalCompositeOperation = 'lighter';
      var s = 46 * h.size;
      c.drawImage(sprite(HEADCOL[h.el] || HEADCOL['void']), x - s, y - s, s * 2, s * 2);
      c.drawImage(sprite('255,255,255'), x - s * 0.35, y - s * 0.35, s * 0.7, s * 0.7);
      c.globalCompositeOperation = 'source-over';
      if (h.t >= 1) { heads.splice(i, 1); h.done(); }
    }
  }

  function pseudo(n) { var x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
  function drawGroundState(c, st, al) {
    if (al <= 0.01) return;
    var R = ground.rx, i, a, ph;
    c.save(); c.translate(ground.x, ground.y); c.scale(1, ground.ry / ground.rx); c.globalAlpha = al;
    if (st === 'bare') {
      var g0 = c.createRadialGradient(0, 0, 0, 0, 0, R); g0.addColorStop(0, 'rgba(50,70,160,0.20)'); g0.addColorStop(1, 'rgba(30,40,110,0)');
      c.fillStyle = g0; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(120,150,230,0.42)'; c.lineWidth = 1.5;
      [0.94, 0.82, 0.5].forEach(function (k) { c.beginPath(); c.arc(0, 0, R * k, 0, TAU); c.stroke(); });
      for (i = 0; i < 36; i++) {
        a = i / 36 * TAU + T * 0.08;
        c.beginPath(); c.moveTo(Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82); c.lineTo(Math.cos(a) * R * (i % 3 ? 0.87 : 0.94), Math.sin(a) * R * (i % 3 ? 0.87 : 0.94)); c.stroke();
      }
      c.strokeStyle = 'rgba(160,180,255,0.3)';
      c.beginPath();
      for (i = 0; i <= 6; i++) { a = i / 6 * TAU * 2 - T * 0.05; var px = Math.cos(a) * R * 0.5, py = Math.sin(a) * R * 0.5; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      c.stroke();
    } else if (st === 'oil') {
      var g1 = c.createRadialGradient(0, 0, 0, 0, 0, R);
      g1.addColorStop(0, 'rgba(6,3,10,0.98)'); g1.addColorStop(0.75, 'rgba(22,12,10,0.95)'); g1.addColorStop(0.93, 'rgba(70,44,14,0.75)'); g1.addColorStop(1, 'rgba(40,24,8,0)');
      c.fillStyle = g1; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
      c.globalCompositeOperation = 'lighter';
      var hues = ['190,90,255', '255,170,60', '60,220,200', '255,90,160', '120,140,255'];
      for (i = 0; i < 7; i++) {
        var bx = Math.cos(T * (0.21 + i * 0.05) + i * 2.1) * R * 0.55, by = Math.sin(T * (0.17 + i * 0.04) + i * 1.3) * R * 0.5, br = R * (0.3 + 0.1 * Math.sin(T * 0.5 + i));
        var g2 = c.createRadialGradient(bx, by, 0, bx, by, br); g2.addColorStop(0, 'rgba(' + hues[i % 5] + ',0.20)'); g2.addColorStop(1, 'rgba(' + hues[i % 5] + ',0)');
        c.fillStyle = g2; c.beginPath(); c.arc(bx, by, br, 0, TAU); c.fill();
      }
      c.strokeStyle = 'rgba(255,190,90,0.38)'; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, R * 0.9, T * 0.3, T * 0.3 + 1.9); c.stroke();
      c.beginPath(); c.arc(0, 0, R * 0.74, -T * 0.2 + 3, -T * 0.2 + 4.2); c.stroke();
      for (i = 0; i < 7; i++) {
        ph = (T * 0.35 + i * 0.143) % 1; var n = Math.floor(T * 0.35 + i * 0.143) * 7 + i;
        a = pseudo(n) * TAU; var d = Math.sqrt(pseudo(n + 0.5)) * R * 0.8;
        c.strokeStyle = 'rgba(255,200,120,' + ((1 - ph) * 0.6).toFixed(3) + ')'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, 2 + ph * 12, 0, TAU); c.stroke();
      }
    } else {
      var ch = st === 'charged';
      var g3 = c.createRadialGradient(0, 0, 0, 0, 0, R), pulse = ch ? 0.12 * Math.sin(T * 9) : 0;
      g3.addColorStop(0, ch ? 'rgba(90,200,255,' + (0.62 + pulse) + ')' : 'rgba(40,110,230,0.58)');
      g3.addColorStop(0.7, ch ? 'rgba(50,120,255,0.5)' : 'rgba(24,70,180,0.48)'); g3.addColorStop(1, 'rgba(20,50,160,0)');
      c.fillStyle = g3; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
      c.globalCompositeOperation = 'lighter';
      for (i = 0; i < 5; i++) {
        ph = (T * 0.32 + i * 0.2) % 1;
        c.strokeStyle = 'rgba(150,215,255,' + ((1 - ph) * 0.55).toFixed(3) + ')'; c.lineWidth = 2;
        c.beginPath(); c.arc(Math.cos(i * 2.4) * R * 0.25, Math.sin(i * 1.7) * R * 0.25, ph * R * 0.8, 0, TAU); c.stroke();
      }
      for (i = 0; i < 10; i++) {
        var gl = 0.5 + 0.5 * Math.sin(T * 2.2 + i * 1.9); a = pseudo(i) * TAU; var gd = pseudo(i + 9) * R * 0.85;
        c.fillStyle = 'rgba(210,235,255,' + (gl * 0.5).toFixed(3) + ')';
        c.fillRect(Math.cos(a) * gd - 6, Math.sin(a) * gd, 12, 1.5);
      }
      if (ch) {
        var seed = Math.floor(T * 16);
        for (i = 0; i < 4; i++) {
          if (pseudo(seed + i * 3.3) < 0.35) continue;
          var a0 = pseudo(seed + i) * TAU, a1 = a0 + 1.5 + pseudo(seed + i + 0.3) * 3, r0 = R * (0.2 + 0.7 * pseudo(seed + i + 0.6)), r1 = R * (0.2 + 0.7 * pseudo(seed + i + 0.9));
          var pts = [[Math.cos(a0) * r0, Math.sin(a0) * r0]]; jag(pts[0][0], pts[0][1], Math.cos(a1) * r1, Math.sin(a1) * r1, 42, 4, pts);
          for (var pass = 0; pass < 2; pass++) {
            c.strokeStyle = pass ? 'rgba(255,255,255,0.95)' : 'rgba(120,190,255,0.4)'; c.lineWidth = pass ? 2 : 9;
            c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (var q = 1; q < pts.length; q++) c.lineTo(pts[q][0], pts[q][1]); c.stroke();
          }
        }
      }
    }
    c.restore(); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }

  function drawSky(c) {
    var W = view.w, H = view.h, k = view.dpr;
    c.setTransform(k, 0, 0, k, 0, 0);
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#02030a'); g.addColorStop(0.55, '#050818'); g.addColorStop(1, '#020208');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter';
    var sc = Math.max(W / 560, H / 340);
    c.globalAlpha = 0.75 + 0.2 * Math.sin(T * 0.11);
    c.drawImage(nebA, -40 * sc + Math.sin(T * 0.021) * 36 * sc - par * 0.02, -30 * sc + Math.cos(T * 0.017) * 24 * sc, 640 * sc, 400 * sc);
    c.globalAlpha = 0.5 + 0.4 * Math.sin(T * 0.07 + 2);
    c.drawImage(nebB, -40 * sc - Math.sin(T * 0.016 + 1) * 38 * sc - par * 0.04, -30 * sc - Math.cos(T * 0.013) * 26 * sc, 640 * sc, 400 * sc);
    c.globalAlpha = 1;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i], x = ((s.x * W - (T * 3 + par * 0.25) * s.z) % W + W) % W, y = s.y * H;
      var tw = 0.45 + 0.55 * Math.sin(T * s.sp + s.p), a = tw * (0.25 + s.z * 0.75);
      if (s.r > 1.5) { var q = s.r * 5; c.globalAlpha = a; c.drawImage(sprite(s.hue), x - q, y - q, q * 2, q * 2); c.globalAlpha = 1; }
      c.fillStyle = 'rgba(' + s.hue + ',' + a.toFixed(3) + ')';
      c.fillRect(x, y, s.r, s.r);
    }
    if (!shoot && Math.random() < 0.0016) shoot = { x: rnd(0.1, 0.9) * W, y: rnd(0, 0.4) * H, vx: rnd(-700, -400), vy: rnd(160, 320), t: 0 };
    if (shoot) {
      shoot.t += 0.016; var sa = Math.max(0, 1 - shoot.t / 0.8), x1 = shoot.x + shoot.vx * shoot.t, y1 = shoot.y + shoot.vy * shoot.t;
      var lg = c.createLinearGradient(x1, y1, x1 - shoot.vx * 0.18, y1 - shoot.vy * 0.18); lg.addColorStop(0, 'rgba(220,230,255,' + sa + ')'); lg.addColorStop(1, 'rgba(220,230,255,0)');
      c.strokeStyle = lg; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - shoot.vx * 0.18, y1 - shoot.vy * 0.18); c.stroke();
      if (sa <= 0) shoot = null;
    }
    c.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
    par += (parTarget - par) * Math.min(1, dt * 5);
    if (T < shakeEnd) { var m = shakeMag * (shakeEnd - T) / shakeDur; sx = rnd(-m, m); sy = rnd(-m, m); }
    else if (sx || sy || shakeMag) { sx = sy = 0; shakeMag = 0; }
    if (shaker) shaker.style.transform = sx || sy ? 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)' : '';

    drawSky(bctx);
    stageT(bctx);
    if (aura.on && Math.random() < 0.5) burst('smoke', aura.x, aura.y, 1, { back: true, rx: 150, ry: 200, speed: 26, dir: -Math.PI / 2, spread: 0.8 });
    drawParts(bctx, back, dt);
    if (ground.on) {
      ground.k = Math.min(1, ground.k + dt / 0.55);
      if (ground.k < 1) drawGroundState(bctx, ground.prev, 1 - ground.k);
      drawGroundState(bctx, ground.state, ground.k);
      if (ground.state === 'charged' && Math.random() < 0.5) { var a = rnd(0, TAU), d = Math.sqrt(Math.random()); burst('spark', ground.x + Math.cos(a) * ground.rx * d, ground.y + Math.sin(a) * ground.ry * d, 1, { dir: -Math.PI / 2, spread: 0.7, speed: 320, min: 120 }); }
      if (ground.state === 'wet' && Math.random() < 0.06) { var a2 = rnd(0, TAU), d2 = Math.sqrt(Math.random()); burst('drop', ground.x + Math.cos(a2) * ground.rx * d2, ground.y + Math.sin(a2) * ground.ry * d2, 1, { dir: -Math.PI / 2, spread: 0.3, speed: 190, min: 120 }); }
    }

    fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, fx.width, fx.height);
    stageT(fctx);
    drawHeads(fctx, dt); drawParts(fctx, parts, dt); drawRings(fctx, dt); drawBolts(fctx, dt);
  }

  root.VTFX = {
    init: init, resize: resize, burst: burst, projectile: projectile, lightning: lightning, ring: ring, shake: shake,
    setGround: setGround, showGround: showGround, setAura: setAura, clear: clear, ground: ground,
    parallax: function (x) { parTarget = x; },
    count: function () { return parts.length + back.length; }
  };
})(this);
