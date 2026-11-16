// Void Tarot — everything between encounters: the title, the road of seventy-eight
// chapters, the reward, the altar where a card is burned, and the ending.
(function (root) {
  'use strict';
  var VT = root.VT, Core = root.VTCore, FX = root.VTFX, AU = root.VTAudio, CARDS = Core.CARDS;
  var $ = VT.$, h = VT.h, sleep = VT.sleep, anim = VT.anim;

  function age(ch) { return Math.floor(Core.ageOf(ch)); }
  function chapterLabel(i) { var c = CARDS[i]; return c.kind === 'trump' ? c.rank + ' · ' + c.name : c.name; }
  var SIGIL = '<svg class="sigil" viewBox="-200 -200 400 400"><circle r="196"/><circle r="180"/><circle r="120"/><circle r="64"/>' +
    '<path d="M0 -180 L156 90 L-156 90 Z"/><path d="M0 180 L156 -90 L-156 -90 Z"/><path d="M-180 0 H180 M0 -180 V180"/>' +
    (function () { var s = ''; for (var i = 0; i < 72; i++) { var a = i / 72 * Math.PI * 2, r0 = i % 6 ? 186 : 180; s += '<path d="M' + (Math.cos(a) * r0).toFixed(1) + ' ' + (Math.sin(a) * r0).toFixed(1) + ' L' + (Math.cos(a) * 196).toFixed(1) + ' ' + (Math.sin(a) * 196).toFixed(1) + '"/>'; } return s; })() + '</svg>';

  // ------------------------------------------------------------------ title
  function title() {
    var saved = VT.debug ? null : VT.load();
    VT.go('title', function (el) {
      var s = '<div class="t-sigil">' + SIGIL + '</div><div class="t-fan" id="t-fan"></div>';
      s += '<h1 class="t-title">Void Tarot</h1><div class="t-sub">The Fool\'s Journey</div>';
      s += '<div class="t-lore">Long before the cards told fortunes, nobles played them for tricks.<br>You are ten years old, and tonight the castle deals you in.</div>';
      s += '<div class="t-btns">';
      if (saved && saved.chapter < 78) s += '<button class="btn big" id="btn-continue">Continue <small>chapter ' + (saved.chapter + 1) + ' · age ' + age(saved.chapter) + '</small></button><button class="btn" id="btn-new">Start over</button>';
      else s += '<button class="btn big" id="btn-new">Begin the journey</button>';
      s += '</div>';
      el.innerHTML = s;
      var fan = $('#t-fan', el), ids = [16, 13, 2, 18, 0, 19, 10, 21, 15], n = ids.length;
      ids.forEach(function (id, i) {
        var k = i - (n - 1) / 2;
        var c = VT.makeCard({ id: id }, { down: true, parent: fan, x: 720, y: 1150, s: 1.1 });
        c.classList.add('t-card'); c.style.zIndex = 10 - Math.abs(k);
        $('.card-lift', c).style.animationDelay = (-i * 0.9) + 's';
        setTimeout(function () {
          VT.moveCard(c, 720 + k * 150, 742 + k * k * 9, k * 5.5, 1.12, 900, 'cubic-bezier(.2,.8,.2,1)');
          AU.play('flick');
          setTimeout(function () { c.classList.remove('down'); }, 380 * VT.TS);
        }, (700 + Math.abs(k) * 150) * VT.TS);
      });
      var go = function (fresh) {
        if (VT.busy) return;
        AU.start(); AU.play('click');
        if (fresh) { VT.wipe(); VT.run = Core.newRun(+VT.params.get('seed') || 0); VT.save(); map({ first: true }); }
        else { VT.run = saved; resume(); }
      };
      var bn = $('#btn-new', el), bc = $('#btn-continue', el), armed = false;
      bn.addEventListener('click', function () {
        if (saved && saved.chapter < 78 && !armed) { armed = true; bn.innerHTML = 'Burn the old journey? <small>click again</small>'; bn.classList.add('danger'); AU.play('click'); return; }
        go(true);
      });
      if (bc) bc.addEventListener('click', function () { go(false); });
      VT.keys.title = function (e) { if (e.key === 'Enter' || e.key === ' ') { (bc || bn).click(); return; } return false; };
      VT.setDeckCount();
    });
  }
  function resume() {
    var p = VT.run.phase;
    if (p === 'reward' && VT.run.offer) reward(null);
    else if (p === 'altar') reward(null, true);
    else if (p === 'travel') travel();
    else if (p === 'end' || VT.run.chapter >= 78) end();
    else map();
  }

  // ------------------------------------------------------------------ the road
  var NX = 196;
  function nodeX(i) { return 300 + i * NX; }
  function nodeY(i) { return 468 + 104 * Math.sin(i * 0.82) + 30 * Math.sin(i * 0.31 + 1); }

  function map(o) {
    o = o || {};
    var run = VT.run, ch = run.chapter, from = o.arrive ? ch - 1 : ch;
    VT.go('map', function (el) {
      var total = nodeX(77) + 1300, s = '', i;
      s += '<div class="map-world" id="map-world" style="width:' + total + 'px">';
      Core.ACTS.forEach(function (a, k) {
        var x = nodeX(a.from) - 110;
        s += '<div class="act' + (ch >= a.from ? ' reached' : '') + '" style="left:' + x + 'px"><div class="act-name">' + a.name + '</div><div class="act-sub">' + a.sub + '</div></div>';
      });
      var d = 'M' + nodeX(0) + ' ' + nodeY(0), dd = d;
      for (i = 1; i < 78; i++) {
        var seg = ' C' + (nodeX(i - 1) + NX / 2) + ' ' + nodeY(i - 1) + ' ' + (nodeX(i) - NX / 2) + ' ' + nodeY(i) + ' ' + nodeX(i) + ' ' + nodeY(i);
        d += seg; if (i <= ch) dd += seg;
      }
      s += '<svg class="map-path" width="' + total + '" height="900"><path class="p-all" d="' + d + '"/><path class="p-done" id="p-done" d="' + dd + '"/></svg>';
      for (i = 0; i < 78; i++) {
        var st = i < ch ? 'done' : i === ch ? 'here' : 'ahead';
        s += '<div class="node n-' + st + ' el-' + CARDS[i].el + '" data-i="' + i + '" style="left:' + nodeX(i) + 'px;top:' + nodeY(i) + 'px"><div class="node-art" style="background-image:url(' + VT.thumb(i) + ')"></div>' +
          (i % 6 === 0 ? '<div class="node-age">age ' + age(i) + '</div>' : '') + '</div>';
      }
      s += '<div class="wisp" id="wisp" style="left:' + nodeX(from) + 'px;top:' + nodeY(from) + 'px"><i></i></div>';
      s += '</div>';
      s += '<div class="m-hud"><div class="m-age"><b id="m-age">' + age(from) + '</b><span>years old</span></div><div class="m-who"><div class="m-name">The Fool</div><div class="m-chap">Chapter ' + (ch + 1) + ' of 78 · ' + Core.ACTS[Core.actOf(ch)].name + '</div>' +
        '<div class="bar m-life"><div class="bar-fill" style="width:' + (run.hp / Core.maxHp(ch) * 100) + '%"></div><div class="bar-text">' + run.hp + ' / ' + Core.maxHp(ch) + '</div></div></div></div>';
      var c = CARDS[ch], sh = Core.shadeOf(ch), tr = Core.traitOf(sh);
      s += '<div class="m-panel" id="m-panel"><div class="m-card el-' + c.el + '"><div class="m-card-art" style="background-image:url(' + VT.img(ch) + ')"></div></div>' +
        '<div class="m-title">' + chapterLabel(ch) + '</div><div class="m-kw">Shade of ' + c.kw.slice(0, 3).join(' · ') + '</div>' +
        '<div class="m-stats"><span>' + VT.glyph('heart', 14) + ' ' + sh.max + ' life</span><span>' + VT.glyph('sword', 14) + ' strikes for ' + Math.round(sh.atk) + '</span></div>' +
        (tr ? '<div class="m-trait"><b>' + tr.name + '.</b> ' + tr.text + '</div>' : '') +
        (run.scars ? '<div class="m-trait dim">You have fallen ' + run.scars + (run.scars === 1 ? ' time' : ' times') + ' on this road.</div>' : '') +
        '<button class="btn big" id="btn-enter">Face the Shade</button></div>';
      s += '<div class="m-deck" id="m-deck"><div class="m-deck-label">Your deck · ' + run.deck.length + ' cards</div><div class="m-deck-fan" id="m-deck-fan"></div></div>';
      s += '<div class="m-help">drag the road to look ahead</div>';
      el.innerHTML = s;

      var fan = $('#m-deck-fan', el), shown = VT.sortDeck(run.deck.map(function (id) { return { id: id }; })).slice(0, 16);
      shown.forEach(function (inst) { fan.appendChild(VT.thumbEl(inst, 62)); });
      if (run.deck.length > shown.length) fan.appendChild(h('div', 'm-deck-more', '+' + (run.deck.length - shown.length)));
      $('#m-deck', el).addEventListener('click', VT.showDeck);
      var world = $('#map-world', el), cam = 0, maxCam = total - VT.W;
      function setCam(x, ms) {
        cam = Math.max(0, Math.min(maxCam, x));
        world.style.transition = ms ? 'transform ' + ms * VT.TS + 'ms cubic-bezier(.4,0,.2,1)' : 'none';
        world.style.transform = 'translateX(' + (-cam) + 'px)';
        FX.parallax(cam);
      }
      setCam(nodeX(from) - 470);
      // look ahead by dragging or with the wheel
      var drag = null;
      el.addEventListener('pointerdown', function (e) { if (e.target.closest('.m-panel') || e.target.closest('.btn') || e.target.closest('.m-deck')) return; drag = { x: e.clientX, cam: cam, moved: false }; });
      var mv = function (e) { if (!drag) return; var dx = (e.clientX - drag.x) / VT.view.s; if (Math.abs(dx) > 4) drag.moved = true; setCam(drag.cam - dx); VT.hideTip(); };
      var up = function () { drag = null; };
      root.addEventListener('pointermove', mv); root.addEventListener('pointerup', up);
      var wheel = function (e) { if (VT.screen !== 'map' || VT.overlayOpen) return; setCam(cam + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY)); };
      root.addEventListener('wheel', wheel, { passive: true });
      VT.leave = function () { root.removeEventListener('pointermove', mv); root.removeEventListener('pointerup', up); root.removeEventListener('wheel', wheel); };

      world.addEventListener('mouseover', function (e) {
        var n = e.target.closest('.node'); if (!n || drag) return;
        var i = +n.getAttribute('data-i'), cc = CARDS[i], shd = Core.shadeOf(i), t = Core.traitOf(shd), p = VT.pos(n);
        VT.tip('<div class="tip-name">' + chapterLabel(i) + '</div><div class="tip-type el-' + cc.el + '">Chapter ' + (i + 1) + ' · age ' + age(i) + (i < ch ? ' · won' : '') + '</div><p>Shade of ' + cc.kw.slice(0, 3).join(', ') + '. ' + shd.max + ' life.</p>' + (t ? '<p><b>' + t.name + '.</b> ' + t.text + '</p>' : ''), p.x, p.y - p.h / 2 - 12, { w: 270 });
      });
      world.addEventListener('mouseout', function (e) { if (e.target.closest('.node')) VT.hideTip(); });

      var enter = function () { if (VT.busy || VT.overlayOpen) return; AU.play('click'); VT.Fight.enter(); };
      $('#btn-enter', el).addEventListener('click', enter);
      VT.keys.map = function (e) {
        if (e.key === 'Enter' || e.key === ' ') { enter(); return; }
        if (e.key === 'ArrowRight') { setCam(cam + 340, 300); return; }
        if (e.key === 'ArrowLeft') { setCam(cam - 340, 300); return; }
        if (e.key === 'd' || e.key === 'D') { VT.showDeck(); return; }
        return false;
      };
      VT.setDeckCount();

      // arriving: the wisp walks to the next chapter and the Fool grows older
      var panel = $('#m-panel', el), wisp = $('#wisp', el);
      if (o.arrive) {
        panel.classList.add('wait');
        var here = el.querySelector('.node.n-here'); here.classList.remove('n-here'); here.classList.add('n-ahead');
        setTimeout(function () {
          AU.play('travel');
          wisp.style.transition = 'left ' + 1300 * VT.TS + 'ms cubic-bezier(.45,0,.3,1), top ' + 1300 * VT.TS + 'ms cubic-bezier(.45,0,.3,1)';
          wisp.style.left = nodeX(ch) + 'px'; wisp.style.top = nodeY(ch) + 'px';
          setCam(nodeX(ch) - 470, 1300);
          setTimeout(function () {
            here.classList.add('n-here'); here.classList.remove('n-ahead');
            var a = $('#m-age', el); if (a && a.textContent !== String(age(ch))) { a.textContent = age(ch); anim(a, [{ transform: 'scale(1.7)', color: '#fff' }, { transform: 'scale(1)' }], 700); AU.play('reward'); }
            var p = VT.pos(here); FX.burst('gold', p.x, p.y, 50, { speed: 260 }); FX.ring(p.x, p.y, '255,215,120', 130, 700);
            panel.classList.remove('wait');
            var actNow = Core.ACTS[Core.actOf(ch)];
            if (actNow.from === ch) VT.callout(actNow.name, actNow.sub, 'gold', { x: 520, y: 200, dur: 2600 });
          }, 1350 * VT.TS);
        }, 900 * VT.TS);
      } else if (o.first) {
        setTimeout(function () { VT.callout('The Castle', 'you are ten · the nobles deal you in', 'gold', { x: 520, y: 200, dur: 2800 }); }, 700 * VT.TS);
      }
    });
  }

  // ------------------------------------------------------------------ reward and altar
  function reward(stats, straightToAltar) {
    var run = VT.run, ch = run.chapter;
    VT.go('reward', function (el) {
      var offer = run.offer || [], s = '';
      var line = stats ? 'Won in ' + stats.turns + (stats.turns === 1 ? ' turn' : ' turns') + (stats.seals ? ' · ' + stats.seals + (stats.seals === 1 ? ' Seal' : ' Seals') + ' broken' : '') + (stats.combos ? ' · ' + stats.combos + (stats.combos === 1 ? ' combo' : ' combos') : '') + ' · ' : '';
      s += '<div class="r-title">' + (straightToAltar ? 'The Altar' : 'The Shade yields') + '</div>';
      s += '<div class="r-sub">' + (straightToAltar ? '' : line + 'you rest and stand at ' + run.hp + ' of ' + Core.maxHp(ch) + ' life') + '</div>';
      s += '<div class="r-ask" id="r-ask">' + (straightToAltar ? '' : offer.length ? 'Take one card into your deck' : 'Every card of the deck is already yours') + '</div>';
      offer.forEach(function (id, i) { s += '<div class="r-desc" id="r-desc-' + i + '" style="left:' + (720 + (i - (offer.length - 1) / 2) * 330) + 'px"></div>'; });
      s += '<button class="btn" id="btn-skip">' + (offer.length ? 'Take nothing' : 'Walk on') + '</button>';
      el.innerHTML = s;
      VT.setDeckCount();
      if (straightToAltar) { $('#btn-skip', el).style.display = 'none'; setTimeout(altar, 600 * VT.TS); return; }
      var cards = [], chosen = false;
      function pick(id, i) {
        if (chosen || VT.busy) return;
        chosen = true;
        VT.hideTip();
        $('#btn-skip', el).classList.add('gone'); $('#r-ask', el).classList.add('gone');
        cards.forEach(function (c, k) {
          $('#r-desc-' + k, el).classList.remove('on');
          if (k === i) {
            AU.play('reward');
            var p = c._p; FX.burst('gold', p.x, p.y, 90, { rx: 100, ry: 150, speed: 320 }); FX.ring(p.x, p.y, '255,215,120', 300, 700);
            c.classList.add('taken'); c.style.zIndex = 50;
            setTimeout(function () { VT.moveCard(c, 1296, 38, 20, 0.12, 700, 'cubic-bezier(.5,0,.4,1)'); }, 450 * VT.TS);
            setTimeout(function () { c.remove(); var b = $('#btn-deck'); anim(b, [{ transform: 'scale(1.5)', filter: 'brightness(2.5)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], 500); AU.play('place'); VT.setDeckCount(); }, 1150 * VT.TS);
          } else {
            anim(c, [{ opacity: 1, filter: 'brightness(1) blur(0px)' }, { opacity: 0, filter: 'brightness(0.3) blur(6px)' }], { duration: 500, fill: 'forwards' });
          }
        });
        Core.takeReward(run, id); VT.save();
        setTimeout(function () { if (run.phase === 'altar') altar(); else travel(); }, (id == null ? 600 : 1500) * VT.TS);
      }
      offer.forEach(function (id, i) {
        var x = 720 + (i - (offer.length - 1) / 2) * 330, inst = { id: id };
        var c = VT.makeCard(inst, { down: true, x: 720, y: 1100, s: 0.8 });
        c.classList.add('r-card'); c.setAttribute('data-offer', i);
        cards.push(c);
        var d = Core.describe(inst, ch + 1), desc = $('#r-desc-' + i, el);
        desc.innerHTML = '<div class="tip-name">' + CARDS[id].name + (id === ch ? ' <span class="r-own">this Shade\'s card</span>' : '') + '</div><div class="tip-type el-' + CARDS[id].el + '">' + d.type + (d.latin ? ' · <i>' + d.latin + '</i>' : '') + '</div>' + d.lines.map(function (l) { return '<p>' + l + '</p>'; }).join('');
        setTimeout(function () { AU.play('flick'); VT.moveCard(c, x, 388, 0, 1.3, 700, 'cubic-bezier(.2,.8,.2,1)'); }, (350 + i * 170) * VT.TS);
        setTimeout(function () { AU.play('flip'); c.classList.remove('down'); desc.classList.add('on'); FX.burst(id === ch ? 'gold' : 'void', x, 388, 30, { rx: 110, ry: 170, speed: 160 }); }, (1050 + i * 260) * VT.TS);
        c.addEventListener('mouseenter', function () { if (!chosen) { c.classList.add('hover'); AU.play('hover'); desc.classList.add('lit'); } });
        c.addEventListener('mouseleave', function () { c.classList.remove('hover'); desc.classList.remove('lit'); });
        c.addEventListener('click', function () { pick(id, i); });
      });
      $('#btn-skip', el).addEventListener('click', function () { AU.play('click'); pick(null, -1); });
      VT.keys.reward = function (e) {
        if (e.key >= '1' && e.key <= '3' && offer[+e.key - 1] != null) { pick(offer[+e.key - 1], +e.key - 1); return; }
        if (e.key === 'Escape') { pick(null, -1); return; }
        return false;
      };
    });
  }

  function altar() {
    var run = VT.run, sel = null, selEl = null, done = false;
    var t = $('.r-title'); if (t) t.textContent = 'The Altar';
    var sub = $('.r-sub'); if (sub) sub.textContent = '';
    VT.openOverlay('The Altar', [{ cards: run.deck.map(function (id) { return { id: id }; }) }], {
      modal: true,
      sub: 'You may burn one card out of your deck for good. A thin deck finds its best cards more often.',
      pick: function (inst, el) {
        if (done) return;
        if (selEl) selEl.classList.remove('sel');
        sel = inst; selEl = el; el.classList.add('sel'); AU.play('place');
        var b = $('#btn-burn'); b.disabled = false; b.textContent = 'Burn ' + CARDS[inst.id].name;
      },
      footer: function (foot) {
        var burn = h('button', 'btn danger', 'Choose a card to burn'); burn.id = 'btn-burn'; burn.disabled = true;
        var keep = h('button', 'btn', 'Keep them all'); keep.id = 'btn-keep';
        burn.addEventListener('click', function () {
          if (done || !sel) return; done = true;
          AU.play('burn');
          var p = VT.pos(selEl); FX.burst('flame', p.x, p.y, 40, { rx: 30, ry: 50, dir: -Math.PI / 2, spread: 0.6, speed: 300 }); FX.burst('ash', p.x, p.y, 70, { rx: 30, ry: 50, speed: 200 });
          anim(selEl, [{ filter: 'brightness(1)', transform: 'scale(1.08)', opacity: 1 }, { filter: 'brightness(4) sepia(1) saturate(6) hue-rotate(-20deg)', transform: 'scale(1.1)', opacity: 1, offset: 0.4 }, { filter: 'brightness(0)', transform: 'scale(0.7)', opacity: 0 }], { duration: 800, fill: 'forwards' });
          Core.removeCard(run, sel.id); VT.save();
          setTimeout(function () { VT.closeOverlay(true); travel(); }, 950 * VT.TS);
        });
        keep.addEventListener('click', function () { if (done) return; done = true; AU.play('click'); VT.closeOverlay(true); travel(); });
        foot.appendChild(burn); foot.appendChild(keep);
      }
    });
  }

  function travel() {
    var run = VT.run;
    if (run.phase !== 'travel') run.phase = 'travel';
    Core.advance(run); VT.save();
    if (run.phase === 'end') end(); else map({ arrive: true });
  }

  // ------------------------------------------------------------------ the end
  function end() {
    var run = VT.run;
    VT.go('end', function (el) {
      el.innerHTML = '<div class="t-sigil">' + SIGIL + '</div><h1 class="t-title e-title">The World Turns</h1>' +
        '<div class="t-sub">The Fool lays down the deck, aged ' + age(77) + '</div>' +
        '<div class="t-lore">Seventy-eight shades unmade. ' + run.deck.length + ' cards carried home. ' + (run.scars ? 'Fallen ' + run.scars + (run.scars === 1 ? ' time' : ' times') + ', risen each time.' : 'Never once fallen.') + '<br>The nobles are long gone from the castle. The game was never theirs.</div>' +
        '<div class="t-btns"><button class="btn big" id="btn-again">Begin again</button></div><div class="t-fan" id="t-fan"></div>';
      var fan = $('#t-fan', el), ids = [0, 21, 19, 17, 20];
      ids.forEach(function (id, i) {
        var k = i - 2, c = VT.makeCard({ id: id }, { down: true, parent: fan, x: 720, y: 1150, s: 1.1 });
        c.classList.add('t-card'); c.style.zIndex = 10 - Math.abs(k);
        setTimeout(function () { VT.moveCard(c, 720 + k * 190, 760 + k * k * 10, k * 6, 1.1, 900); setTimeout(function () { c.classList.remove('down'); }, 400 * VT.TS); }, (600 + i * 160) * VT.TS);
      });
      AU.play('victory');
      var timer = setInterval(function () { if (VT.screen !== 'end') return clearInterval(timer); FX.burst('gold', Math.random() * 1440, -10, 4, { dir: Math.PI / 2, spread: 0.5, speed: 160, life: 2.2 }); }, 120);
      $('#btn-again', el).addEventListener('click', function () { if (VT.busy) return; AU.play('click'); VT.wipe(); VT.run = Core.newRun(0); VT.save(); map({ first: true }); });
      VT.keys.end = function () { return false; };
    });
  }

  VT.Journey = {
    title: title, map: map, reward: reward, end: end,
    debugReward: function () { VT.run.offer = Core.rewardOptions(VT.run); VT.run.phase = 'reward'; reward({ turns: 4, seals: 1, combos: 2 }); }
  };
})(this);
