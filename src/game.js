// Void Tarot — the shell: stage scaling, screen changes, card objects, tooltips, floating
// text, saving, keyboard. The screens themselves live in fight.js and journey.js.
(function (root) {
  'use strict';
  var Core = root.VTCore, FX = root.VTFX, AU = root.VTAudio, CARDS = Core.CARDS;
  var VT = root.VT = {};
  var W = 1440, H = 900, CW = 180, CH = 270;
  var params = new URLSearchParams(location.search);
  var SAVE_KEY = 'voidtarot.save.v1';

  VT.W = W; VT.H = H; VT.CW = CW; VT.CH = CH;
  VT.params = params;
  VT.TS = params.has('fast') ? (+params.get('fast') || 0.3) : 1;      // ?fast=0.3 plays everything at 30% duration
  VT.debug = params.has('chapter') || params.has('nosave');
  VT.errors = [];
  VT.screen = null;
  VT.run = null;
  VT.keys = {};
  root.addEventListener('error', function (e) { VT.errors.push(String(e.message)); });
  root.addEventListener('unhandledrejection', function (e) { VT.errors.push('rejection: ' + (e.reason && e.reason.stack || e.reason)); });

  // ---- small helpers ----
  function $(s, el) { return (el || document).querySelector(s); }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms * VT.TS); }); }
  function anim(el, frames, o) {
    if (typeof o === 'number') o = { duration: o };
    o.duration = Math.max(1, o.duration * VT.TS); if (o.delay) o.delay *= VT.TS;
    if (!o.easing) o.easing = 'cubic-bezier(.2,.7,.2,1)';
    var a = el.animate(frames, o);
    return a.finished.catch(function () {});
  }
  function roman(n) { return ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'][n]; }
  VT.$ = $; VT.h = h; VT.sleep = sleep; VT.anim = anim; VT.roman = roman;

  var GLYPH = {
    fire: '<path d="M8 2 L14.5 14 H1.5 Z"/>',
    water: '<path d="M1.5 2.5 H14.5 L8 14.5 Z"/>',
    air: '<path d="M8 2 L14.5 14 H1.5 Z"/><path d="M4.2 9 H11.8"/>',
    earth: '<path d="M1.5 2.5 H14.5 L8 14.5 Z"/><path d="M4.2 8 H11.8"/>',
    'void': '<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/>',
    ward: '<path d="M8 1.5 L14 4 V8.5 C14 11.5 11.5 13.6 8 15 C4.5 13.6 2 11.5 2 8.5 V4 Z"/>',
    heart: '<path d="M8 14 C2 9.5 1.5 6.5 3 4.3 C4.4 2.4 7 2.8 8 4.8 C9 2.8 11.6 2.4 13 4.3 C14.5 6.5 14 9.5 8 14 Z"/>',
    sword: '<path d="M3 13 L12.5 3.5 M12.5 3.5 H9.2 M12.5 3.5 V6.8 M3.4 9.6 L6.4 12.6"/>',
    curse: '<path d="M3 3 L13 13 M13 3 L3 13"/>'
  };
  function glyph(k, size) { return '<svg class="glyph" viewBox="0 0 16 16" width="' + (size || 16) + '" height="' + (size || 16) + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">' + GLYPH[k] + '</svg>'; }
  VT.glyph = glyph;
  VT.EL_COLOR = { fire: '#ff8a4a', water: '#5fb2ff', air: '#cdbcff', earth: '#d6a45c', 'void': '#b79cff' };

  // ---- stage ----
  var stage, curtain, tipEl, floats, cardsEl, overlay;
  function fit() {
    var s = Math.min(root.innerWidth / W, root.innerHeight / H);
    var ox = (root.innerWidth - W * s) / 2, oy = (root.innerHeight - H * s) / 2;
    stage.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + s + ')';
    VT.view = { s: s, ox: ox, oy: oy };
    FX.resize(s, ox, oy);
  }
  // centre of an element in stage coordinates
  VT.pos = function (el) {
    var r = el.getBoundingClientRect(), v = VT.view;
    return { x: (r.left + r.width / 2 - v.ox) / v.s, y: (r.top + r.height / 2 - v.oy) / v.s, w: r.width / v.s, h: r.height / v.s };
  };

  VT.go = async function (name, build) {
    VT.busy = true;
    curtain.classList.add('on');
    VT.hideTip();
    await sleep(420);
    var all = document.querySelectorAll('.screen');
    for (var i = 0; i < all.length; i++) { all[i].classList.remove('on'); all[i].innerHTML = ''; }
    cardsEl.innerHTML = ''; floats.innerHTML = ''; VT.closeOverlay(true);
    FX.clear(); FX.showGround(false); FX.setAura(false); FX.parallax(0);
    if (VT.leave) { VT.leave(); VT.leave = null; }
    VT.screen = name;
    document.body.setAttribute('data-screen', name);
    var el = $('#screen-' + name);
    build(el);
    el.classList.add('on');
    await sleep(60);
    curtain.classList.remove('on');
    VT.busy = false;
  };

  // ---- cards as objects ----
  function badgeHTML(inst) {
    var c = CARDS[inst.id];
    if (inst.rev) return '<div class="badge b-curse">' + glyph('curse', 15) + '</div>';
    if (c.kind === 'pip') return '<div class="badge">' + glyph(c.el, 15) + '<b>' + c.num + '</b></div>';
    if (c.kind === 'court') return '<div class="badge b-court">' + glyph(c.el, 15) + '<b>' + Core.COURT[c.rank].label + '</b></div>';
    return '<div class="badge b-trump"><b>' + c.rank + '</b></div>';
  }
  VT.badgeHTML = badgeHTML;
  VT.img = function (id) { return 'assets/cards/' + (id < 10 ? '0' : '') + id + '.jpg'; };
  VT.thumb = function (id) { return 'assets/thumbs/' + (id < 10 ? '0' : '') + id + '.jpg'; };
  VT.elOf = function (inst) { return inst.rev ? 'curse' : CARDS[inst.id].el; };

  VT.makeCard = function (inst, o) {
    o = o || {};
    var el = h('div', 'card el-' + VT.elOf(inst) + (inst.rev ? ' rev' : '') + (o.down ? ' down' : ''));
    el.innerHTML = '<div class="card-lift"><div class="card-flip">' +
      '<div class="card-face card-front"><div class="card-art" style="background-image:url(' + VT.img(inst.id) + ')"></div>' + badgeHTML(inst) + '<div class="card-key"></div><div class="card-glow"></div></div>' +
      '<div class="card-face card-back"></div></div></div>';
    el._inst = inst;
    el._p = { x: 0, y: 0, r: 0, s: 1 };
    (o.parent || cardsEl).appendChild(el);
    if (o.x != null) VT.moveCard(el, o.x, o.y, o.r || 0, o.s || 1, 0);
    return el;
  };
  VT.moveCard = function (el, x, y, r, s, dur, ease, delay) {
    el._p = { x: x, y: y, r: r, s: s };
    el.style.transition = dur ? 'transform ' + Math.round(dur * VT.TS) + 'ms ' + (ease || 'cubic-bezier(.22,.8,.24,1)') + ' ' + Math.round((delay || 0) * VT.TS) + 'ms' : 'none';
    el.style.transform = 'translate(' + (x - CW / 2) + 'px,' + (y - CH / 2) + 'px) rotate(' + r + 'deg) scale(' + s + ')';
    if (!dur) void el.offsetWidth;
  };
  VT.clearCards = function () { cardsEl.innerHTML = ''; };

  // ---- tooltip ----
  VT.tip = function (html, x, y, o) {
    o = o || {};
    tipEl.innerHTML = html;
    tipEl.className = 'on' + (o.cls ? ' ' + o.cls : '');
    tipEl.style.width = (o.w || 300) + 'px';
    var tw = (o.w || 300), th = tipEl.offsetHeight;
    var left = Math.max(12, Math.min(W - tw - 12, x - tw / 2));
    var top = o.below ? y : y - th;
    top = Math.max(10, Math.min(H - th - 10, top));
    tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
  };
  VT.hideTip = function () { if (tipEl) tipEl.className = ''; };
  VT.cardTipHTML = function (inst, ch, extra) {
    var d = Core.describe(inst, ch), c = CARDS[inst.id];
    var s = '<div class="tip-name">' + (inst.rev ? c.name + ', reversed' : c.name) + '</div>';
    s += '<div class="tip-type el-' + VT.elOf(inst) + '">' + d.type + (d.latin ? ' · <i>' + d.latin + '</i>' : '') + '</div>';
    d.lines.forEach(function (l) { s += '<p>' + l + '</p>'; });
    if (extra) s += extra;
    return s;
  };

  // ---- floating text, callouts, flashes ----
  VT.float = function (x, y, text, cls, o) {
    o = o || {};
    var el = h('div', 'float ' + (cls || ''), text);
    el.style.left = x + 'px'; el.style.top = y + 'px';
    floats.appendChild(el);
    var dy = o.dy != null ? o.dy : -90, dx = o.dx || 0;
    anim(el, [
      { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
      { transform: 'translate(-50%,-50%) translate(' + dx * 0.15 + 'px,' + dy * 0.2 + 'px) scale(1.25)', opacity: 1, offset: 0.14 },
      { transform: 'translate(-50%,-50%) translate(' + dx * 0.6 + 'px,' + dy * 0.7 + 'px) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) scale(0.95)', opacity: 0 }
    ], { duration: o.dur || 1300, delay: o.delay || 0, fill: 'both', easing: 'linear' }).then(function () { el.remove(); });
    return el;
  };
  VT.callout = function (big, small, cls, o) {
    o = o || {};
    var el = h('div', 'callout ' + (cls || ''), '<div class="callout-big">' + big + '</div>' + (small ? '<div class="callout-small">' + small + '</div>' : ''));
    el.style.left = (o.x || 720) + 'px'; el.style.top = (o.y || 330) + 'px';
    floats.appendChild(el);
    return anim(el, [
      { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0, letterSpacing: '0.02em', filter: 'blur(8px)' },
      { transform: 'translate(-50%,-50%) scale(1.12)', opacity: 1, letterSpacing: '0.16em', filter: 'blur(0px)', offset: 0.14 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, letterSpacing: '0.2em', filter: 'blur(0px)', offset: 0.75 },
      { transform: 'translate(-50%,-50%) scale(1.06)', opacity: 0, letterSpacing: '0.36em', filter: 'blur(6px)' }
    ], { duration: o.dur || 1500, fill: 'both', easing: 'linear' }).then(function () { el.remove(); });
  };
  VT.flash = function (color, alpha, ms) {
    var f = $('#flash'); f.style.background = color;
    anim(f, [{ opacity: alpha || 0.6 }, { opacity: 0 }], { duration: ms || 450, easing: 'ease-out' });
  };
  VT.hurtFlash = function (strength) {
    anim($('#hurt'), [{ opacity: Math.min(1, strength || 0.8) }, { opacity: 0 }], { duration: 650, easing: 'ease-out' });
  };

  // ---- overlay: deck viewer / card picker ----
  function gridSize(n, aw, ah) {
    var best = 40;
    for (var cols = 4; cols <= 20; cols++) {
      var rows = Math.ceil(n / cols), w = Math.min((aw - (cols - 1) * 10) / cols, ((ah - (rows - 1) * 10) / rows) / 1.5);
      if (w > best) best = w;
    }
    return Math.floor(Math.min(best, 150));
  }
  VT.thumbEl = function (inst, w) {
    var t = h('div', 'thumb el-' + VT.elOf(inst) + (inst.rev ? ' rev' : ''));
    t.style.width = w + 'px'; t.style.height = Math.round(w * 1.5) + 'px';
    t.innerHTML = '<div class="thumb-art" style="background-image:url(' + (w > 110 ? VT.img(inst.id) : VT.thumb(inst.id)) + ')"></div>' + (w >= 64 ? badgeHTML(inst) : '');
    t._inst = inst;
    return t;
  };
  VT.sortDeck = function (list) {
    return list.slice().sort(function (a, b) { return (a.rev ? 1 : 0) - (b.rev ? 1 : 0) || a.id - b.id; });
  };
  // groups: [{label, cards:[{id,rev}]}]; o.pick(inst, el) makes thumbs clickable
  VT.openOverlay = function (title, groups, o) {
    o = o || {};
    var n = 0; groups.forEach(function (g) { n += g.cards.length; });
    var w = gridSize(Math.max(n, 1), 1240, 640 - groups.length * 44 - (o.footer ? 70 : 0));
    overlay.innerHTML = '';
    var box = h('div', 'ov-box');
    box.appendChild(h('div', 'ov-title', title));
    if (o.sub) box.appendChild(h('div', 'ov-sub', o.sub));
    groups.forEach(function (g) {
      if (g.label) box.appendChild(h('div', 'ov-label', g.label + ' · ' + g.cards.length));
      var grid = h('div', 'ov-grid');
      VT.sortDeck(g.cards).forEach(function (inst, i) {
        var t = VT.thumbEl(inst, w);
        t.style.animationDelay = Math.min(i * 12, 500) * VT.TS + 'ms';
        t.addEventListener('mouseenter', function () {
          var p = VT.pos(t);
          AU.play('hover');
          VT.tip(VT.cardTipHTML(inst, VT.run ? VT.run.chapter : 0), p.x, p.y - p.h / 2 - 10);
        });
        t.addEventListener('mouseleave', VT.hideTip);
        if (o.pick) { t.classList.add('pickable'); t.addEventListener('click', function (e) { e.stopPropagation(); o.pick(inst, t); }); }
        grid.appendChild(t);
      });
      box.appendChild(grid);
    });
    var foot = h('div', 'ov-foot');
    if (o.footer) o.footer(foot);
    else { var b = h('button', 'btn', 'Close'); b.id = 'ov-close'; b.addEventListener('click', function () { AU.play('click'); VT.closeOverlay(); }); foot.appendChild(b); }
    box.appendChild(foot);
    overlay.appendChild(box);
    overlay.className = 'on';
    overlay._modal = !!o.modal;
    VT.overlayOpen = true;
  };
  VT.closeOverlay = function (force) {
    if (!overlay) return;
    if (overlay._modal && !force) return;
    overlay.className = ''; VT.overlayOpen = false; overlay._modal = false; VT.hideTip();
  };
  VT.showDeck = function () {
    if (VT.busy || VT.screen === 'title' || !VT.run) return;
    if (VT.overlayOpen) { VT.closeOverlay(); return; }
    AU.play('click');
    if (VT.screen === 'fight' && VT.Fight && VT.Fight.piles) {
      var p = VT.Fight.piles();
      VT.openOverlay('Your deck', [{ label: 'Draw pile', cards: p.draw }, { label: 'Discard pile', cards: p.discard }]);
    } else {
      VT.openOverlay('Your deck', [{ cards: VT.run.deck.map(function (id) { return { id: id }; }) }], { sub: VT.run.deck.length + ' cards. Hands are drawn from these.' });
    }
  };

  // ---- saving ----
  VT.save = function () {
    if (VT.debug || !VT.run) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(VT.run)); } catch (e) { /* private mode: play on without saving */ }
  };
  VT.load = function () {
    try { var r = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return r && r.v === 3 && r.deck && r.deck.length ? r : null; } catch (e) { return null; }
  };
  VT.wipe = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to wipe */ } };
  // ?chapter=N : a throwaway run that has already walked N chapters
  function debugRun(n, seed) {
    var run = Core.newRun(seed || 7);
    for (var i = 0; i < n; i++) {
      run.chapter = i;
      var o = Core.rewardOptions(run);
      if (i % 3 !== 2) run.deck.push(o[0]); else if (o[1] != null) run.deck.push(o[1]);
      run.seen = { all: 1 };
    }
    run.chapter = n; run.hp = Core.maxHp(n); run.phase = 'map';
    return run;
  }

  // ---- top bar ----
  function topbar() {
    var deck = $('#btn-deck'), mute = $('#btn-mute'), menu = $('#btn-menu');
    deck.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="6" width="11" height="15" rx="1.5"/><path d="M8 3.5 H18.5 A1.5 1.5 0 0 1 20 5 V18"/></svg><span id="deck-count"></span>';
    menu.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 5 H6 V19 H10 M11 12 H20 M16.5 8.5 L20 12 L16.5 15.5"/></svg>';
    function drawMute() {
      mute.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5 H7.5 L12 6 V18 L7.5 14.5 H4 Z"/>' +
        (AU.isMuted() ? '<path d="M16 9.5 L21 14.5 M21 9.5 L16 14.5"/>' : '<path d="M15.5 9 C17 10.6 17 13.4 15.5 15 M18 6.8 C20.8 9.6 20.8 14.4 18 17.2"/>') + '</svg>';
      mute.classList.toggle('off', AU.isMuted());
    }
    VT.toggleMute = function () {
      AU.setMuted(!AU.isMuted()); drawMute();
      try { localStorage.setItem('voidtarot.muted', AU.isMuted() ? '1' : '0'); } catch (e) { /* not stored */ }
      AU.play('click');
    };
    try { if (localStorage.getItem('voidtarot.muted') === '1') AU.setMuted(true); } catch (e) { /* default: sound on */ }
    drawMute();
    mute.addEventListener('click', VT.toggleMute);
    deck.addEventListener('click', VT.showDeck);
    menu.addEventListener('click', function () {
      if (VT.busy || VT.screen === 'title') return;
      AU.play('click'); VT.Journey.title();
    });
  }
  VT.setDeckCount = function () { var e = $('#deck-count'); if (e) e.textContent = VT.run ? VT.run.deck.length : ''; };

  VT.boot = function () {
    stage = $('#stage'); curtain = $('#curtain'); tipEl = $('#tip'); floats = $('#floats'); cardsEl = $('#cards'); overlay = $('#overlay');
    document.documentElement.style.setProperty('--ts', VT.TS);
    FX.init($('#bg'), $('#fx'), $('#shaker'));
    fit(); root.addEventListener('resize', fit);
    topbar();
    overlay.addEventListener('click', function (e) { if (e.target === overlay) VT.closeOverlay(); });

    // the first gesture wakes the sound
    var wake = function () { AU.start(); };
    root.addEventListener('pointerdown', wake, true); root.addEventListener('keydown', wake, true);

    // generic tooltips for anything with data-tip
    stage.addEventListener('mouseover', function (e) {
      var t = e.target.closest && e.target.closest('[data-tip]');
      if (!t || !t.getAttribute('data-tip')) return;
      var p = VT.pos(t), below = p.y < 300;
      VT.tip('<p>' + t.getAttribute('data-tip') + '</p>', p.x, below ? p.y + p.h / 2 + 10 : p.y - p.h / 2 - 10, { below: below, w: +t.getAttribute('data-tip-w') || 260, cls: 'small' });
    });
    stage.addEventListener('mouseout', function (e) {
      var t = e.target.closest && e.target.closest('[data-tip]');
      if (t) VT.hideTip();
    });
    stage.addEventListener('mouseover', function (e) { if (e.target.closest && e.target.closest('.btn')) AU.play('hover'); });

    root.addEventListener('keydown', function (e) {
      if (e.key === 'm' || e.key === 'M') { VT.toggleMute(); return; }
      if (VT.overlayOpen) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); var c = $('#ov-close'); if (c) c.click(); } return; }
      if (VT.busy) return;
      var k = VT.keys[VT.screen];
      if (k && k(e) !== false) e.preventDefault();
    });

    if (params.has('chapter')) {
      VT.run = debugRun(Math.max(0, Math.min(77, +params.get('chapter') || 0)), +params.get('seed') || 0);
      var scr = params.get('screen');
      if (scr === 'map') VT.Journey.map(); else if (scr === 'reward') VT.Journey.debugReward(); else if (scr === 'end') VT.Journey.end(); else VT.Fight.enter();
    } else {
      VT.Journey.title();
    }
  };
})(this);
