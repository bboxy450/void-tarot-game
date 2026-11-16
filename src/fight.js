// Void Tarot — the encounter screen. The rules in core.js return a list of events for
// everything that happens; this file lays out the table and plays those events back as
// motion, particles and sound.
(function (root) {
  'use strict';
  var VT = root.VT, Core = root.VTCore, FX = root.VTFX, AU = root.VTAudio, CARDS = Core.CARDS;
  var $ = VT.$, h = VT.h, sleep = VT.sleep, anim = VT.anim, glyph = VT.glyph;

  var SHADE = { x: 1100, y: 312, w: 310, h: 466 };
  var GROUND = { x: 1100, y: 592 };
  var DRAW = { x: 112, y: 782, s: 0.6 }, DISC = { x: 1328, y: 782, s: 0.6 };
  var PLAYER = { x: 190, y: 622 };
  var SLOT_Y = 304, SLOT_S = 0.95;
  var SLOT_NAMES = ['Past', 'Present', 'Future', 'Beyond'];
  var GROUND_TEXT = {
    bare: ['Bare ground', 'Nothing lies on the ground. Earth leaves oil, Water leaves it wet.'],
    oil: ['Oil', 'Fire will ignite the oil: an explosion.'],
    wet: ['Wet', 'Air will charge the water. Fire dries it.'],
    charged: ['Charged', 'Air again and the charged water strikes: a zap that shocks the Shade.']
  };
  var EL_PART = { fire: 'ember', water: 'drop', air: 'spark', earth: 'stone', 'void': 'void' };

  var f, run, scr, hand, spread, els, insts, pv, vis, purged, busy, hovered, sealWasHit, activeEl;
  var shadeEl, actEl, shadeCard, intentEl, sealEl, shadeBar, playerBar, hintEl;

  function slotX(i) { return f.slots === 3 ? 250 + i * 190 : 155 + i * 190; }
  function inSpread(u) { return spread.indexOf(u) >= 0; }

  // ------------------------------------------------------------------ build
  function enter() {
    run = VT.run;
    VT.go('fight', function (el) {
      scr = el;
      f = Core.startFight(run);
      hand = []; spread = []; els = {}; insts = {}; purged = {}; pv = null; hovered = null; sealWasHit = false; activeEl = null;
      vis = { draw: f.draw.length, discard: 0 };
      busy = true;
      var c = CARDS[f.ch], act = Core.ACTS[Core.actOf(f.ch)], s = '';
      s += '<div class="f-chapter">Chapter ' + (f.ch + 1) + ' of 78 · ' + act.name + '</div>';
      s += '<div class="f-hint" id="f-hint"></div>';
      for (var i = 0; i < f.slots; i++) {
        s += '<div class="slot" data-slot="' + i + '" style="left:' + (slotX(i) - 86) + 'px;top:' + (SLOT_Y - 129) + 'px"><div class="slot-ring"></div><div class="slot-num">' + VT.roman(i + 1) + '</div><div class="slot-name">' + SLOT_NAMES[i] + '</div><div class="slot-fore"></div></div>';
      }
      var mid = (slotX(0) + slotX(f.slots - 1)) / 2;
      s += '<div class="f-sum" id="f-sum" style="left:' + mid + 'px"></div>';
      s += '<button class="btn cast" id="btn-cast" style="left:' + mid + 'px">Cast</button>';
      s += '<div class="f-fore" id="f-fore" style="left:' + mid + 'px"></div>';
      s += '<div class="intent" id="intent" data-tip-w="280"><div class="intent-eye"></div><div class="intent-icon"></div><div class="intent-num"></div><div class="intent-label"></div><div class="intent-take"></div></div>';
      s += '<div class="seal" id="seal" data-tip-w="300"><svg class="seal-ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56"/><circle cx="60" cy="60" r="46"/><path d="M60 4 L74 46 L116 60 L74 74 L60 116 L46 74 L4 60 L46 46 Z"/></svg><div class="seal-num"></div><div class="seal-label">Seal</div></div>';
      s += '<div class="shade-name">' + c.name + '</div>';
      s += '<div class="bar shade-bar" id="shade-bar"><div class="bar-ghost"></div><div class="bar-fill"></div><div class="bar-pred"></div><div class="bar-text"></div></div>';
      s += '<div class="shade" id="shade"><div class="shade-bob"><div class="shade-act"><div class="shade-card" style="background-image:url(' + VT.img(f.ch) + ')"></div><div class="shade-ward"></div><div class="shade-stun">' + glyph('void', 30) + glyph('void', 22) + glyph('void', 26) + '</div></div></div></div>';
      s += '<div class="shade-status" id="shade-status"></div>';
      s += '<div class="ground-label" id="ground-label"></div>';
      s += '<div class="player" id="player"><div class="player-face"></div><div class="player-name">The Fool <span>age ' + Math.floor(Core.ageOf(f.ch)) + '</span></div>' +
        '<div class="bar player-bar" id="player-bar"><div class="bar-ghost"></div><div class="bar-fill"></div><div class="bar-text"></div></div><div class="player-status" id="player-status"></div></div>';
      s += '<div class="pile" id="pile-draw" data-tip="Draw pile. Click to look through your deck."><div class="pile-n"></div><div class="pile-name">Deck</div></div>';
      s += '<div class="pile" id="pile-disc" data-tip="Discard pile. It is shuffled back when the deck runs out."><div class="pile-n"></div><div class="pile-name">Discard</div></div>';
      el.innerHTML = s;

      shadeEl = $('#shade', el); actEl = $('.shade-act', el); shadeCard = $('.shade-card', el);
      intentEl = $('#intent', el); sealEl = $('#seal', el); shadeBar = $('#shade-bar', el); playerBar = $('#player-bar', el); hintEl = $('#f-hint', el);
      shadeEl.className = 'shade el-' + c.el;
      setBar(shadeBar, f.shade.hp, f.shade.max, true);
      setBar(playerBar, f.p.hp, f.p.max, true);
      setPiles(); setGroundLabel('bare'); setStatus({ sw: f.shade.ward, pw: 0, stun: false, weak: false });
      $('#btn-cast', el).addEventListener('click', doCast);
      $('#pile-draw', el).addEventListener('click', VT.showDeck);
      $('#pile-disc', el).addEventListener('click', VT.showDeck);
      FX.ground.x = GROUND.x; FX.ground.y = GROUND.y;
      FX.showGround(true, 'bare'); FX.setAura(true, SHADE.x, SHADE.y + 40);
      VT.setDeckCount();
      intro();
    });
  }

  async function intro() {
    var c = CARDS[f.ch];
    intentEl.style.opacity = 0; sealEl.style.opacity = 0;
    await sleep(380);
    AU.play('enter');
    FX.burst('void', SHADE.x, SHADE.y, 70, { speed: 420, rx: 100, ry: 160 });
    FX.ring(SHADE.x, SHADE.y, '120,140,255', 420, 900);
    anim(actEl, [
      { transform: 'translateY(-70px) scale(0.55) rotateY(88deg)', opacity: 0, filter: 'brightness(4) blur(6px)' },
      { transform: 'translateY(0) scale(1.06) rotateY(0deg)', opacity: 1, filter: 'brightness(1.8) blur(0px)', offset: 0.7 },
      { transform: 'none', opacity: 1, filter: 'brightness(1) blur(0px)' }
    ], { duration: 950, fill: 'backwards' });
    VT.callout(c.name, 'Shade of ' + c.kw.slice(0, 3).join(' · '), 'shade-intro', { x: 620, y: 300, dur: 1900 });
    await sleep(1250);
    intentEl.style.opacity = ''; sealEl.style.opacity = '';
    await play(Core.startTurn(f));
    busy = false;
  }

  // ------------------------------------------------------------------ small displays
  function setBar(bar, hp, max, instant) {
    var p = Math.max(0, Math.min(1, hp / max)) * 100;
    if (instant) bar.classList.add('instant');
    $('.bar-fill', bar).style.width = p + '%';
    $('.bar-ghost', bar).style.width = p + '%';
    $('.bar-text', bar).textContent = Math.max(0, hp) + ' / ' + max;
    bar._hp = hp; bar._max = max;
    if (instant) { void bar.offsetWidth; bar.classList.remove('instant'); }
  }
  function setPiles() {
    $('#pile-draw .pile-n').textContent = vis.draw; $('#pile-disc .pile-n').textContent = vis.discard;
    $('#pile-draw').classList.toggle('empty', vis.draw === 0); $('#pile-disc').classList.toggle('empty', vis.discard === 0);
  }
  function setGroundLabel(g) {
    var el = $('#ground-label');
    el.className = 'ground-label g-' + g;
    el.innerHTML = '<b>' + GROUND_TEXT[g][0] + '</b>' + (g === 'bare' ? '' : ' <span>' + GROUND_TEXT[g][1].split(':')[0].replace(/\.$/, '') + '</span>');
    el.setAttribute('data-tip', GROUND_TEXT[g][1]);
  }
  function chip(cls, icon, text, tip) { return '<div class="chip ' + cls + '" data-tip="' + tip + '">' + (icon ? glyph(icon, 14) : '') + '<span>' + text + '</span></div>'; }
  function setStatus(s) {
    var sh = f.shade, t = Core.traitOf(sh), a = '';
    if (s.sw > 0) a += chip('c-ward', 'ward', s.sw, 'Ward: absorbs this much of your damage, then is gone.');
    if (s.stun) a += chip('c-stun', 'void', sh.charm ? 'Charmed' : 'Stunned', 'It loses its next action.');
    if (s.weak) a += chip('c-weak', 'air', 'Shocked', 'Its next blow is halved.');
    if (t) a += chip('c-trait', sh.el, t.name, t.text);
    $('#shade-status').innerHTML = a;
    shadeEl.classList.toggle('warded', s.sw > 0);
    shadeEl.classList.toggle('stunned', !!s.stun);
    var p = '';
    if (s.pw > 0) p += chip('c-ward', 'ward', s.pw, 'Your ward: absorbs this much of the next blow. It fades at the start of your turn.');
    if (f.p.regen > 0) p += chip('c-regen', 'heart', '+' + f.p.regenAmt + ' × ' + f.p.regen, 'Regrowth: you heal at the start of your next turns.');
    if (f.p.extraDraw > 0) p += chip('c-draw', 'void', '+' + f.p.extraDraw + ' cards', 'You draw extra cards next turn.');
    $('#player-status').innerHTML = p;
  }
  function liveStatus() { setStatus({ sw: f.shade.ward, pw: f.p.ward, stun: f.shade.stun, weak: f.shade.weak }); }

  function setIntent(it) {
    var icon = { strike: 'sword', heavy: 'sword', flurry: 'sword', sear: 'fire', mend: 'heart', bulwark: 'ward', brace: 'ward', hex: 'curse' }[it.move];
    var num = it.dmg ? (it.hits > 1 ? it.dmg + '×' + it.hits : it.dmg) : it.ward ? it.ward : '';
    intentEl.className = 'intent i-' + it.move + (it.stunned ? ' i-stunned' : '');
    $('.intent-icon', intentEl).innerHTML = glyph(it.stunned ? 'void' : icon, it.move === 'heavy' ? 40 : 30);
    $('.intent-num', intentEl).textContent = it.stunned ? '' : num;
    $('.intent-label', intentEl).textContent = it.stunned ? 'Stunned' : Core.MOVE_TEXT[it.move][0];
    var tip = it.stunned ? 'It is stunned and will lose this action.' : Core.MOVE_TEXT[it.move][1];
    if (!it.stunned && it.dmg) tip += ' <b>' + it.total + ' damage</b>' + (it.weak ? ' (halved: shocked)' : '') + '.';
    if (!it.stunned && it.ward) tip += ' <b>' + it.ward + ' ward</b>.';
    if (!it.stunned && it.heal) tip += ' <b>Heals ' + it.heal + '</b>.';
    intentEl.setAttribute('data-tip', tip);
    anim(intentEl, [{ transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], 420);
  }
  function setSeal(n, immune) {
    sealEl.className = 'seal' + (n ? '' : ' none') + (immune ? ' wary' : '');
    $('.seal-num', sealEl).textContent = n || '–';
    $('.seal-label', sealEl).textContent = n ? (immune ? 'Seal · wary' : 'Seal') : 'No seal';
    sealEl.setAttribute('data-tip', n ? 'The Seal. Cast numbered cards that add up to exactly <b>' + n + '</b>: the whole cast is doubled' + (immune ? '. It was just stunned and cannot be stunned again this turn.' : ' and the Shade is stunned.') : 'No Seal this turn.');
    if (n) anim(sealEl, [{ transform: 'translate(-50%,-50%) scale(0.3) rotate(-180deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1 }], 600);
  }

  function hint(text, uids) {
    Object.keys(els).forEach(function (u) { els[u].classList.remove('hinted'); });
    if (!text) { hintEl.classList.remove('on'); return; }
    hintEl.innerHTML = text; hintEl.classList.add('on');
    (uids || []).forEach(function (u) { if (els[u]) els[u].classList.add('hinted'); });
  }
  function byId(id) { for (var i = 0; i < f.hand.length; i++) if (f.hand[i].id === id && !f.hand[i].rev) return f.hand[i].uid; return null; }
  function pickHint() {
    var seen = run.seen || (run.seen = {}), ch = f.ch, t = f.turn;
    function once(k) { if (seen.all || seen[k]) return false; seen[k] = 1; return true; }
    if (ch === 0 && t === 1 && once('oil')) return hint('<b>Earth leaves oil. Fire ignites it.</b> Lay the Three of Pentacles in the spread, then the Five of Wands, and cast.', [byId(66), byId(26)]);
    if (ch === 0 && t === 2 && once('seal')) return hint('<b>The Shade bears a Seal.</b> Cast numbered cards that add up to it exactly: the whole cast is doubled and the Shade is stunned.');
    if (ch === 1 && t === 1 && once('zap')) return hint('<b>Water wets the ground. Air charges it. Air again, and it strikes.</b> Cups, then Swords, then Swords.', [byId(38), byId(52), byId(54)]);
    if (ch === 1 && t === 2 && once('intent')) return hint('<b>The eye shows what the Shade will do next.</b> Pentacles raise a ward against the blow; Cups mend you.');
    if (ch === 2 && t === 1 && once('low')) return hint('<b>The Fool always returns to your hand.</b> And a low card is often the key: the Seal wants an exact sum, not a large one.');
    var court = null, curse = null, trump = null;
    f.hand.forEach(function (c) { if (c.rev) curse = c.uid; else if (CARDS[c.id].kind === 'court') court = c.uid; else if (c.id > 0 && CARDS[c.id].kind === 'trump') trump = c.uid; });
    if (curse && once('curse')) return hint('<b>A reversed card is a curse.</b> It does nothing. Lay it in the spread to purge it for this fight.', [curse]);
    if (court && once('court')) return hint('<b>Court cards bend the card laid after them.</b> It takes the court\'s element and is multiplied. Order matters.', [court]);
    if (trump && once('trump')) return hint('<b>Trumps are spells.</b> Hold the pointer over one to read what it will do right now.', [trump]);
    if (f.slots === 4 && once('four')) return hint('<b>Your spread has grown.</b> Four positions: Past, Present, Future, Beyond.');
    if (Core.traitOf(f.shade) && t === 1 && once('trait' + f.shade.trait)) return hint('<b>' + Core.traitOf(f.shade).name + '.</b> ' + Core.traitOf(f.shade).text);
    hint(null);
  }

  // ------------------------------------------------------------------ hand and spread
  function layoutHand(dur) {
    var list = hand.filter(function (u) { return !inSpread(u); }), n = list.length;
    var gap = Math.min(128, 720 / Math.max(1, n - 1));
    list.forEach(function (u, i) {
      var k = i - (n - 1) / 2, el = els[u];
      el.classList.add('inhand'); el.classList.remove('inspread');
      el.style.zIndex = 30 + i;
      el.style.setProperty('--hitw', (i === n - 1 ? VT.CW : Math.min(VT.CW, gap + 2)) + 'px');   // only the visible strip takes the pointer
      VT.moveCard(el, 720 + k * gap, 806 + k * k * 4.5, k * 3.4, 1, dur == null ? 380 : dur);
    });
    hand.forEach(function (u, i) { var k = $('.card-key', els[u]); if (k) k.textContent = i + 1; });
  }
  function layoutSpread(dur) {
    spread.forEach(function (u, i) {
      var el = els[u];
      el.classList.remove('inhand'); el.classList.add('inspread');
      el.style.removeProperty('--hitw');
      el.style.zIndex = 10 + i;
      VT.moveCard(el, slotX(i), SLOT_Y, 0, SLOT_S, dur == null ? 360 : dur);
    });
    var slots = scr.querySelectorAll('.slot');
    for (var i = 0; i < slots.length; i++) slots[i].classList.toggle('filled', i < spread.length);
  }
  function toggle(u) {
    if (busy || VT.overlayOpen || !els[u]) return;
    var i = spread.indexOf(u);
    if (i >= 0) { spread.splice(i, 1); AU.play('unplace'); }
    else if (spread.length < f.slots) { spread.push(u); AU.play('place'); FX.burst(EL_PART[VT.elOf(insts[u])] || 'void', slotX(spread.length - 1), SLOT_Y, 10, { speed: 160, rx: 70, ry: 110, life: 0.6 }); }
    else { AU.play('resist'); anim(els[u], [{ marginLeft: '0px' }, { marginLeft: '-9px' }, { marginLeft: '9px' }, { marginLeft: '0px' }], 220); return; }
    els[u].classList.remove('hinted');
    layoutHand(); layoutSpread(); refresh();
    if (hovered) showCardTip(hovered);
  }
  function clearSpread() {
    if (busy || !spread.length) return;
    spread = []; AU.play('unplace'); layoutHand(); layoutSpread(); refresh();
  }

  function addCard(inst, o) {
    var el = VT.makeCard(inst, o);
    el.setAttribute('data-uid', inst.uid);
    els[inst.uid] = el; insts[inst.uid] = inst;
    el.addEventListener('click', function () { toggle(inst.uid); });
    el.addEventListener('mouseenter', function () {
      if (busy && !el.classList.contains('inhand')) return;
      hovered = inst.uid; el.classList.add('hover'); if (!busy) AU.play('hover'); showCardTip(inst.uid);
    });
    el.addEventListener('mouseleave', function () { if (hovered === inst.uid) hovered = null; el.classList.remove('hover'); VT.hideTip(); });
    return el;
  }

  var COMBO_TEXT = { explosion: 'Explosion: the oil ignites', zap: 'Zap: the charged ground strikes, the Shade is shocked', charge: 'Charges the wet ground', steam: 'Dries the ground' };
  function slotText(sl) {
    var a = [];
    if (sl.purge) return 'Purged from this fight';
    if (sl.mod) a.push('The next card: ' + sl.text);
    else if (sl.text) a.push(sl.text);
    if (sl.dmg) a.push('<b>' + sl.dmg + ' damage</b>' + (sl.random ? ' (about)' : '') + (sl.resisted ? ' (resisted)' : ''));
    if (sl.ward) a.push('<b>' + sl.ward + ' ward</b>');
    if (sl.heal) a.push('<b>heal ' + sl.heal + '</b>');
    if (sl.curse) a.push('adds a curse to your deck');
    var s = a.join(', ');
    if (!sl.combo && sl.to && sl.to !== sl.from) s += (s ? '. ' : '') + { oil: 'Leaves <em class="combo-explosion">oil</em> on the ground', wet: 'Leaves the ground <em class="combo-charge">wet</em>', charged: 'Leaves the ground <em class="combo-zap">charged</em>', bare: 'Clears the ground' }[sl.to];
    if (sl.combo) s += (s ? '. ' : '') + '<em class="combo-' + sl.combo + '">' + COMBO_TEXT[sl.combo] + '</em>';
    return s || 'No effect right now';
  }
  function showCardTip(u) {
    var inst = insts[u], el = els[u];
    if (!inst || !el || !f || f.over) return;
    var c = CARDS[inst.id], i = spread.indexOf(u), extra = '', p = el._p;
    if (!busy) {
      if (i >= 0 && pv) {
        extra += '<div class="tip-now"><span>In this spread</span> ' + slotText(pv.slots[i]) + '</div>';
      } else if (spread.length < f.slots) {
        var q = Core.preview(f, spread.concat([u])), sl = q.slots[spread.length];
        if (!sl) return;
        extra += '<div class="tip-now"><span>Now</span> ' + slotText(sl) + (q.kills ? '. <em class="combo-kill">The Shade falls</em>' : '') + '</div>';
        if (!inst.rev && c.kind === 'court') extra += '<div class="tip-seal">Lay another card after it to empower that card instead.</div>';
        if (f.seal > 0 && !inst.rev && c.kind === 'pip') {
          extra += q.sealHit ? '<div class="tip-seal hit">Breaks the Seal: the sum is exactly ' + f.seal + '. Everything doubled.</div>'
            : '<div class="tip-seal' + (q.sum > f.seal ? ' over' : '') + '">Seal: the sum would be ' + q.sum + ' of ' + f.seal + (q.sum > f.seal ? ', too much' : '') + '.</div>';
        }
      } else extra += '<div class="tip-seal">The spread is full. Click a laid card to take it back.</div>';
    }
    var html = VT.cardTipHTML(inst, f.ch, extra);
    if (i >= 0) VT.tip(html, p.x, SLOT_Y + 138, { below: true });
    else VT.tip(html, p.x < 760 ? p.x + 132 + 150 : p.x - 132 - 150, 540, { below: true });
  }

  // Forecast: what the current spread will do, shown on the slots, the bars and the intent.
  function refresh() {
    pv = Core.preview(f, spread);
    var slots = scr.querySelectorAll('.slot');
    for (var i = 0; i < slots.length; i++) {
      var fe = $('.slot-fore', slots[i]), sl = pv.slots[i], s = '';
      if (sl) {
        if (sl.purge) s = '<i>purged</i>';
        else if (sl.mod) s = '<i class="el-' + sl.el + '">' + sl.text + ' →</i>';
        else {
          if (sl.dmg) s += '<b class="el-' + (sl.el || 'void') + '">' + glyph('sword', 13) + sl.dmg + (sl.random ? '?' : '') + '</b>';
          if (sl.ward) s += '<b class="f-ward">' + glyph('ward', 13) + sl.ward + '</b>';
          if (sl.heal) s += '<b class="f-heal">' + glyph('heart', 13) + sl.heal + '</b>';
          if (!s && sl.text) s = '<i>' + sl.text + '</i>';
        }
        if (sl.combo === 'explosion') s += '<em class="combo-explosion">Explosion</em>';
        if (sl.combo === 'zap') s += '<em class="combo-zap">Zap</em>';
        if (sl.combo === 'charge') s += '<em class="combo-charge">Charge</em>';
      }
      fe.innerHTML = s; fe.classList.toggle('on', !!s);
    }
    // the sum against the Seal
    var nums = [];
    spread.forEach(function (u) { var c = CARDS[insts[u].id]; if (!insts[u].rev && c.kind === 'pip') nums.push(c.num); });
    var sumEl = $('#f-sum'), hit = pv.sealHit;
    if (f.seal > 0 && (nums.length || hit)) {
      sumEl.innerHTML = (nums.length ? nums.join(' + ') + ' = <b>' + pv.sum + '</b>' : 'Blessed') + ' <span>' + (hit ? 'the Seal breaks' : pv.sum > f.seal ? 'over the Seal of ' + f.seal : 'Seal ' + f.seal) + '</span>';
      sumEl.className = 'f-sum on' + (hit ? ' hit' : pv.sum > f.seal ? ' over' : '');
    } else sumEl.className = 'f-sum';
    sealEl.classList.toggle('hit', hit);
    scr.classList.toggle('seal-hit', hit);
    if (hit && !sealWasHit) AU.play('sealNear');
    sealWasHit = hit;
    // totals
    var fore = $('#f-fore'), t = pv.total, a = [];
    if (pv.kills) a.push('<b class="gold">The Shade falls</b>');
    else if (t.dmg) a.push('<b>' + t.dmg + '</b> damage');
    if (t.ward) a.push('<b>' + t.ward + '</b> ward');
    if (t.heal) a.push('<b>' + t.heal + '</b> healed');
    fore.innerHTML = a.join(' · '); fore.classList.toggle('on', a.length > 0);
    var pred = $('.bar-pred', shadeBar), after = Math.max(0, pv.after.sh);
    pred.style.left = (after / f.shade.max * 100) + '%'; pred.style.width = ((f.shade.hp - after) / f.shade.max * 100) + '%';
    // what the Shade's answer will cost
    var it = Core.intentOf(f), take = $('.intent-take', intentEl);
    if (pv.kills) { take.textContent = ''; }
    else if (pv.stun && !it.stunned && !f.shade.stun) { take.textContent = 'will be stunned'; take.className = 'intent-take good'; }
    else if (it.total > 0 && !it.stunned) {
      var hurt = Math.max(0, it.total - pv.after.pw);
      take.textContent = hurt ? 'you take ' + hurt : 'fully warded'; take.className = 'intent-take ' + (hurt ? 'bad' : 'good');
    } else take.textContent = '';
    var btn = $('#btn-cast');
    btn.textContent = spread.length ? 'Cast' : 'Pass';
    btn.classList.toggle('ready', spread.length > 0);
    btn.classList.toggle('golden', hit);
  }
  function clearForecast() {
    var fo = scr.querySelectorAll('.slot-fore'); for (var i = 0; i < fo.length; i++) fo[i].classList.remove('on');
    $('#f-fore').classList.remove('on'); $('#f-sum').className = 'f-sum';
    $('.bar-pred', shadeBar).style.width = '0%'; $('.intent-take', intentEl).textContent = '';
    scr.classList.remove('seal-hit');
  }

  // ------------------------------------------------------------------ playing events
  async function play(evs) {
    for (var i = 0; i < evs.length; i++) {
      var fn = H[evs[i].t];
      if (fn) await fn(evs[i]);
    }
  }
  function deactivate() { if (activeEl) { activeEl.classList.remove('active'); activeEl.classList.add('spent'); activeEl = null; } }

  function groundChange(from, to) {
    if (from === to) return;
    FX.setGround(to); setGroundLabel(to);
    var x = GROUND.x, y = GROUND.y;
    anim($('#ground-label'), [{ transform: 'translateX(-50%) scale(1.5)', filter: 'brightness(2.5)' }, { transform: 'translateX(-50%) scale(1)', filter: 'brightness(1)' }], 500);
    if (to === 'oil') { FX.burst('dust', x, y, 22, { rx: 220, ry: 30, speed: 90 }); FX.burst('stone', x, y, 16, { rx: 200, ry: 20, dir: -Math.PI / 2, spread: 0.9, speed: 380, min: 160 }); FX.ring(x, y, '255,180,90', 300, 700, { flat: 0.18, w: 4 }); }
    else if (to === 'wet') { FX.burst('drop', x, y, 70, { rx: 220, ry: 26, dir: -Math.PI / 2, spread: 0.8, speed: 520, min: 200 }); FX.burst('mist', x, y, 14, { rx: 200, ry: 20, speed: 60 }); FX.ring(x, y, '120,190,255', 300, 800, { flat: 0.18, w: 4 }); }
    else if (to === 'charged') {
      AU.play('charge');
      FX.burst('spark', x, y, 90, { rx: 240, ry: 30, speed: 520, min: 120 });
      for (var i = 0; i < 4; i++) FX.lightning(x - 250 + Math.random() * 120, y + (Math.random() - 0.5) * 50, x + 130 + Math.random() * 120, y + (Math.random() - 0.5) * 50, { life: 0.4, w: 2, forks: 1, jag: 30 });
      VT.float(x, y - 40, 'Charged', 'f-combo el-air', { dy: -60, dur: 1100 });
    } else if (to === 'bare' && (from === 'wet' || from === 'charged')) { AU.play('steam'); FX.burst('steam', x, y, 40, { rx: 220, ry: 24, dir: -Math.PI / 2, spread: 0.5, speed: 240 }); VT.float(x, y - 40, 'Steam', 'f-combo', { dy: -60, dur: 1000 }); }
  }

  function hitShade(e, x, y) {
    var big = e.combo === 'explosion' || e.combo === 'zap' || e.execute, max = f.shade.max;
    var mag = Math.min(1, (e.dmg || 0) / max * 4);
    if (e.dmg > 0) {
      AU.play('impact');
      anim(actEl, [
        { transform: 'translate(0,0) rotate(0deg)', filter: 'brightness(1)' },
        { transform: 'translate(' + (18 + mag * 34) + 'px,' + (-6 - mag * 14) + 'px) rotate(' + (2 + mag * 5) + 'deg) scale(0.96)', filter: 'brightness(3.4) saturate(0.2)', offset: 0.18 },
        { transform: 'translate(-8px,2px) rotate(-1deg)', filter: 'brightness(1.3)', offset: 0.6 },
        { transform: 'translate(0,0) rotate(0deg)', filter: 'brightness(1)' }
      ], 460);
      FX.burst(EL_PART[e.el] || 'void', x, y, 26 + Math.round(mag * 50), { speed: 420 + mag * 300, rx: 40, ry: 60 });
      VT.float(SHADE.x + (Math.random() - 0.5) * 120, SHADE.y - 60 - Math.random() * 60, '' + e.dmg, 'f-dmg el-' + e.el + (big ? ' big' : ''), { dy: -120, dx: (Math.random() - 0.5) * 80, dur: big ? 1700 : 1300 });
      if (!big && !e.small) FX.shake(3 + mag * 6, 220);
    } else if (e.dmg === 0 && e.blocked) { AU.play('block'); }
    if (e.blocked) VT.float(SHADE.x + 110, SHADE.y + 60, 'warded ' + e.blocked, 'f-note', { dy: -50 });
    if (e.resisted) { AU.play('resist'); VT.float(SHADE.x - 110, SHADE.y + 90, 'resisted', 'f-note', { dy: -50 }); }
    setBar(shadeBar, e.s.sh, max);
  }

  var H = {
    draw: async function (e) {
      for (var i = 0; i < e.cards.length; i++) {
        var c = e.cards[i], el = addCard(c, { down: true, x: DRAW.x, y: DRAW.y, s: DRAW.s });
        hand.push(c.uid); vis.draw--; setPiles();
        AU.play('flick');
        layoutHand(460);
        (function (el) { setTimeout(function () { el.classList.remove('down'); }, 150 * VT.TS); })(el);
        await sleep(95);
      }
      await sleep(330);
    },
    reshuffle: async function (e) {
      AU.play('shuffle');
      var n = Math.min(7, e.n);
      for (var i = 0; i < n; i++) {
        var g = VT.makeCard({ id: 0 }, { down: true, x: DISC.x, y: DISC.y, s: DISC.s });
        g.classList.add('ghost'); g.style.zIndex = 5;
        VT.moveCard(g, DRAW.x, DRAW.y, -360, DRAW.s, 560, 'cubic-bezier(.4,0,.2,1)', i * 50);
        (function (g) { setTimeout(function () { g.remove(); }, (640 + i * 50) * VT.TS); })(g);
      }
      vis.discard = 0; setPiles();
      await sleep(520 + n * 50);
      vis.draw = e.n; setPiles();
      anim($('#pile-draw'), [{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], 300);
    },
    kept: async function (e) { hand = e.cards.map(function (c) { return c.uid; }); },
    regen: async function (e) {
      if (e.heal > 0) { AU.play('heal'); FX.burst('heal', PLAYER.x, PLAYER.y, 26, { rx: 110, ry: 14, speed: 120 }); VT.float(PLAYER.x + 60, PLAYER.y - 26, '+' + e.heal, 'f-heal', { dy: -60 }); }
      setBar(playerBar, e.s.ph, f.p.max);
      await sleep(350);
    },
    turn: async function (e) {
      setIntent(e.intent); setSeal(e.seal, e.immune); setStatus(e.s); liveStatus();
      setBar(playerBar, e.s.ph, f.p.max);
      scr.classList.add('yourturn');
      refresh(); pickHint();
      await sleep(200);
    },
    seal: async function (e) {
      AU.play('seal');
      spread.forEach(function (u) { if (els[u]) els[u].classList.add('sealed'); });
      var p = { x: 872, y: 392 };
      FX.burst('gold', p.x, p.y, 150, { speed: 620, min: 120 });
      FX.ring(p.x, p.y, '255,215,120', 380, 800, { w: 8 }); FX.ring(p.x, p.y, '255,240,200', 620, 1100, { w: 3 });
      VT.flash('#ffd98a', 0.32, 500); FX.shake(8, 350);
      anim(sealEl, [{ transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1, filter: 'brightness(1)' }, { transform: 'translate(-50%,-50%) scale(1.7) rotate(40deg)', opacity: 1, filter: 'brightness(4)', offset: 0.3 }, { transform: 'translate(-50%,-50%) scale(2.6) rotate(140deg)', opacity: 0, filter: 'brightness(4)' }], { duration: 700, fill: 'forwards' });
      spread.forEach(function (u, i) { FX.burst('gold', slotX(i), SLOT_Y, 26, { rx: 80, ry: 120, speed: 200 }); });
      if (e.stunned) { setStatus({ sw: e.s.sw, pw: e.s.pw, stun: true, weak: e.s.weak }); AU.play('stun'); }
      await VT.callout('Sigillum Fractum', e.stunned ? 'the Seal breaks · cast doubled · the Shade is stunned' : 'the Seal breaks · cast doubled', 'gold', { dur: 1450 });
    },
    activate: async function (e) {
      deactivate();
      var el = els[e.uid], inst = insts[e.uid];
      if (!el) return;
      activeEl = el; el.classList.add('active');
      AU.play('activate');
      if (!inst.rev && CARDS[inst.id].kind === 'trump') VT.float(slotX(e.i), SLOT_Y - 196, Core.TRUMPS[inst.id][0], 'f-latin', { dy: -16, dur: 1500 });
      FX.burst(EL_PART[VT.elOf(inst)] || 'void', slotX(e.i), SLOT_Y, 14, { rx: 80, ry: 120, speed: 140, life: 0.6 });
      await sleep(210);
    },
    purge: async function (e) {
      var el = els[e.uid]; purged[e.uid] = 1;
      AU.play('purge');
      FX.burst('ash', slotX(e.i), SLOT_Y, 60, { rx: 80, ry: 120, speed: 200 });
      VT.float(slotX(e.i), SLOT_Y - 150, 'Purged', 'f-note', { dy: -30 });
      if (el) { await anim(el, [{ opacity: 1, filter: 'brightness(1)' }, { opacity: 0, filter: 'brightness(4) blur(6px)' }], { duration: 420, fill: 'forwards' }); el.remove(); delete els[e.uid]; }
    },
    mod: async function (e) {
      AU.play('mod');
      var x = slotX(e.i), nx = e.text === 'Again' ? x : slotX(e.i + 1);
      VT.float(nx, SLOT_Y - 150, e.text, 'f-mod el-' + e.el, { dy: -26, dur: 1400 });
      if (e.pay) { VT.float(PLAYER.x + 60, PLAYER.y - 26, '−' + e.pay, 'f-hurt', { dy: -50 }); setBar(playerBar, e.s.ph, f.p.max); }
      if (nx !== x) {
        await FX.projectile(e.el, x, SLOT_Y, nx, SLOT_Y, 260 * VT.TS, { arc: -170, size: 0.7 });
        FX.burst(EL_PART[e.el] || 'void', nx, SLOT_Y, 30, { rx: 70, ry: 110, speed: 220 });
        var nu = spread[e.i + 1]; if (els[nu]) { els[nu].classList.add('charged-' + e.el); anim(els[nu], [{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], 400); }
      } else await sleep(240);
    },
    spell: async function (e) {
      var x0 = slotX(e.i), y0 = SLOT_Y, el = e.el, combo = e.combo;
      var onGround = combo === 'explosion' || combo === 'zap' || combo === 'charge' || combo === 'steam' || (e.to !== e.from && e.dmg == null);
      if (e.dmg != null) {
        AU.play(el);
        FX.burst(EL_PART[el] || 'void', x0, y0, 16, { speed: 260, rx: 30, ry: 30 });
        var tx = onGround ? GROUND.x : SHADE.x - 30 + Math.random() * 60, ty = onGround ? GROUND.y - 16 : SHADE.y - 40 + Math.random() * 90;
        await FX.projectile(el, x0, y0, tx, ty, (e.small ? 230 : 400) * VT.TS, { size: e.small ? 0.7 : 1.1, arc: e.small ? -60 : -150 });
        if (combo === 'explosion') {
          AU.play('explosion'); VT.flash('#ffb060', 0.62, 600); FX.shake(24, 750);
          FX.burst('flame', GROUND.x, GROUND.y - 30, 90, { rx: 230, ry: 40, dir: -Math.PI / 2, spread: 1.3, speed: 760, min: 150, size: 1.5 });
          FX.burst('ember', GROUND.x, GROUND.y - 20, 260, { rx: 200, ry: 30, speed: 980, min: 180, life: 1.4 });
          FX.burst('smoke', GROUND.x, GROUND.y - 80, 20, { rx: 200, ry: 100, speed: 120 });
          FX.ring(GROUND.x, GROUND.y, '255,170,80', 640, 800, { flat: 0.2, w: 10 }); FX.ring(SHADE.x, SHADE.y + 100, '255,220,150', 460, 650, { w: 8 });
          VT.callout('Explosio', 'the oil ignites', 'fire', { dur: 1350 });
        } else if (combo === 'zap') {
          AU.play('zap'); VT.flash('#dfe8ff', 0.66, 520); FX.shake(17, 600);
          for (var b = 0; b < 4; b++) FX.lightning(SHADE.x - 200 + Math.random() * 400, -30, GROUND.x - 120 + b * 80, GROUND.y, { life: 0.55 + b * 0.08, w: 3.5, jag: 90 });
          FX.lightning(GROUND.x - 260, GROUND.y, GROUND.x + 260, GROUND.y, { life: 0.6, w: 2.5, forks: 4, jag: 40 });
          FX.burst('spark', SHADE.x, SHADE.y + 80, 240, { rx: 150, ry: 220, speed: 900, min: 150, life: 1.5 });
          FX.ring(GROUND.x, GROUND.y, '170,200,255', 600, 700, { flat: 0.2, w: 8 });
          VT.callout('Fulmen', 'the charged water strikes', 'air', { dur: 1350 });
        }
        hitShade(e, onGround ? SHADE.x : tx, onGround ? SHADE.y + 60 : ty);
      } else if (el !== 'void' || e.ward || e.heal) {
        AU.play(el === 'void' ? 'void' : el);
      }
      if (e.to !== e.from) groundChange(e.from, e.to);
      if (e.ward) {
        AU.play(el === 'earth' ? 'earth' : 'ward');
        FX.burst('stone', x0, y0, 24, { dir: -Math.PI / 2, spread: 1.2, speed: 420, min: 140 });
        await FX.projectile('earth', x0, y0, PLAYER.x, PLAYER.y, 300 * VT.TS, { arc: 60, size: 0.8 });
        AU.play('ward');
        FX.burst('stone', PLAYER.x, PLAYER.y, 20, { rx: 110, ry: 10, dir: -Math.PI / 2, spread: 0.8, speed: 300, min: 100 });
        FX.burst('dust', PLAYER.x, PLAYER.y, 10, { rx: 110, ry: 10, speed: 50 });
        VT.float(PLAYER.x + 80, PLAYER.y - 30, '+' + e.ward + ' ward', 'f-wardtxt', { dy: -60 });
      }
      if (e.heal) {
        await FX.projectile('heal', x0, y0, PLAYER.x, PLAYER.y, 280 * VT.TS, { arc: 40, size: 0.7 });
        AU.play('heal');
        FX.burst('heal', PLAYER.x, PLAYER.y, 30, { rx: 110, ry: 12, speed: 140 });
        VT.float(PLAYER.x - 20, PLAYER.y - 30, '+' + e.heal, 'f-heal', { dy: -60 });
      }
      if (e.charm) { AU.play('stun'); FX.burst('void', SHADE.x, SHADE.y, 80, { rx: 150, ry: 220, speed: 160 }); VT.float(SHADE.x, SHADE.y - 150, 'Charmed', 'f-combo', { dy: -50 }); }
      if (e.execute) { VT.callout('Finis', 'the thread is cut', 'gold', { dur: 1200 }); FX.shake(14, 400); }
      if (e.shock) VT.float(SHADE.x, SHADE.y + 150, 'Shocked', 'f-combo el-air', { dy: -40, delay: 300 });
      setBar(playerBar, e.s.ph, f.p.max);
      setStatus(e.s);
      await sleep(combo === 'explosion' || combo === 'zap' ? 760 : e.small ? 160 : 330);
    },
    buff: async function (e) {
      AU.play('void');
      FX.burst('void', slotX(e.i), SLOT_Y, 40, { rx: 70, ry: 110, speed: 240 });
      await FX.projectile('void', slotX(e.i), SLOT_Y, PLAYER.x, PLAYER.y, 300 * VT.TS, { arc: 50, size: 0.7 });
      VT.float(PLAYER.x + 40, PLAYER.y - 30, e.text, 'f-mod el-void', { dy: -56, dur: 1500 });
      setStatus(e.s); await sleep(320);
    },
    curse: async function (e) {
      AU.play('curse');
      var el = VT.makeCard({ id: f.shade.id, rev: true }, { x: SHADE.x, y: SHADE.y, s: 0.5 });
      el.style.zIndex = 60;
      FX.burst('blood', SHADE.x, SHADE.y, 30, { speed: 240, rx: 60, ry: 80 });
      VT.float(DISC.x - 60, DISC.y - 150, 'A curse joins your deck', 'f-note bad', { dy: -30, dur: 1700 });
      await sleep(30);
      VT.moveCard(el, 900, 420, -8, 0.9, 380);
      await sleep(620);
      VT.moveCard(el, DISC.x, DISC.y, 12, DISC.s, 460, 'cubic-bezier(.5,0,.3,1)');
      await sleep(460);
      el.remove(); vis.discard++; setPiles();
    },
    death: async function () {
      deactivate();
      hint(null);
      AU.play('shatter');
      intentEl.style.opacity = 0; sealEl.style.opacity = 0; $('#shade-status').innerHTML = '';
      FX.setAura(false); FX.setGround('bare'); setGroundLabel('bare');
      await anim(actEl, [{ filter: 'brightness(1)', transform: 'scale(1)' }, { filter: 'brightness(5) saturate(0)', transform: 'scale(1.08)' }], { duration: 260, fill: 'forwards' });
      VT.flash('#bcd0ff', 0.5, 600); FX.shake(16, 500);
      shadeCard.style.visibility = 'hidden';
      var cols = 6, rows = 9, pw = SHADE.w / cols, ph = SHADE.h / rows;
      for (var r = 0; r < rows; r++) for (var q = 0; q < cols; q++) {
        var pc = h('div', 'shade-piece');
        pc.style.cssText = 'left:' + q * pw + 'px;top:' + r * ph + 'px;width:' + (pw + 0.5) + 'px;height:' + (ph + 0.5) + 'px;background-image:url(' + VT.img(f.ch) + ');background-size:' + SHADE.w + 'px ' + SHADE.h + 'px;background-position:-' + q * pw + 'px -' + r * ph + 'px';
        actEl.appendChild(pc);
        var dx = (q - (cols - 1) / 2) * (60 + Math.random() * 110), dy = (r - (rows - 1) / 2) * (40 + Math.random() * 60) + 80 + Math.random() * 240;
        anim(pc, [{ transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, filter: 'brightness(3)' }, { transform: 'translate(' + dx * 0.6 + 'px,' + (dy * 0.3 - 60) + 'px) rotate(' + (Math.random() - 0.5) * 300 + 'deg) scale(0.9)', opacity: 1, filter: 'brightness(2.6)', offset: 0.55 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + (Math.random() - 0.5) * 900 + 'deg) scale(0.4)', opacity: 0, filter: 'brightness(1.8)' }], { duration: 1200 + Math.random() * 900, fill: 'forwards', easing: 'cubic-bezier(.2,.6,.4,1)' });
      }
      actEl.style.filter = 'none'; actEl.getAnimations().forEach(function (a) { a.cancel(); });
      FX.burst('shard', SHADE.x, SHADE.y, 110, { rx: 140, ry: 220, speed: 620, min: 100 });
      FX.burst('void', SHADE.x, SHADE.y, 160, { rx: 140, ry: 220, speed: 420 });
      FX.ring(SHADE.x, SHADE.y, '150,170,255', 620, 1000, { w: 8 });
      setBar(shadeBar, 0, f.shade.max);
      await sleep(1500);
    },
    shadeHeal: async function (e) {
      AU.play('shadeHeal');
      FX.burst('heal', SHADE.x, SHADE.y + 100, 40, { rx: 140, ry: 140, speed: 140 });
      VT.float(SHADE.x, SHADE.y - 120, '+' + e.heal, 'f-heal', { dy: -60 });
      if (e.trait) VT.float(SHADE.x, GROUND.y - 50, 'Tideborn', 'f-note', { dy: -30 });
      setBar(shadeBar, e.s.sh, f.shade.max);
      await sleep(480);
    },
    stunned: async function (e) {
      AU.play('stun');
      VT.float(SHADE.x, SHADE.y - 100, e.charm ? 'Charmed' : 'Stunned', 'f-combo', { dy: -60, dur: 1300 });
      anim(actEl, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(0deg)' }], 700);
      FX.burst('gold', SHADE.x, SHADE.y - 180, 30, { rx: 120, ry: 20, speed: 120 });
      await sleep(800);
      setStatus(e.s);
    },
    shadeMove: async function (e) {
      var mv = e.move, heavy = mv === 'heavy', out = 'translate(-390px,104px) rotate(-11deg) scale(1.3)', back = 'translate(0px,0px) rotate(0deg) scale(1)';
      intentEl.classList.add('acting');
      scr.classList.remove('yourturn');
      if (heavy) {
        AU.play('telegraph'); shadeEl.classList.add('rage');
        FX.burst('blood', SHADE.x, SHADE.y, 50, { rx: 150, ry: 220, speed: 120 });
        back = 'translate(52px,-30px) rotate(5deg) scale(1.12)';
        await anim(actEl, [{ transform: 'translate(0px,0px) rotate(0deg) scale(1)' }, { transform: back }], { duration: 620, fill: 'forwards', easing: 'cubic-bezier(.3,0,.3,1)' });
        await sleep(120);
      } else if (e.hits.length) await sleep(160);
      for (var i = 0; i < e.hits.length; i++) {
        var hit = e.hits[i], last = i === e.hits.length - 1;
        if (hit.blast) {
          AU.play('explosion'); VT.flash('#ffb060', 0.5, 500); FX.shake(18, 600);
          FX.burst('flame', GROUND.x, GROUND.y - 30, 70, { rx: 230, ry: 40, dir: Math.PI * 1.1, spread: 1.2, speed: 760, min: 150, size: 1.4 });
          FX.burst('ember', GROUND.x, GROUND.y, 160, { rx: 200, ry: 30, dir: Math.PI, spread: 1.4, speed: 1000, min: 200 });
          VT.callout('Explosio', 'it sears the oil beneath you', 'fire', { dur: 1200 });
          FX.setGround('bare'); setGroundLabel('bare');
          await sleep(200);
        } else {
          AU.play('lunge');
          await anim(actEl, [{ transform: back }, { transform: out }], { duration: heavy ? 190 : 170, fill: 'forwards', easing: 'cubic-bezier(.7,0,.9,.5)' });
        }
        if (hit.dmg > 0) {
          AU.play('hurt'); FX.shake(heavy ? 22 : mv === 'flurry' ? 8 : 12, heavy ? 520 : 320); VT.hurtFlash(heavy ? 1 : 0.65);
          FX.burst('blood', 640, 470, heavy ? 70 : 34, { speed: 520, rx: 60, ry: 60 });
          FX.burst('blood', PLAYER.x, PLAYER.y, 20, { rx: 110, ry: 10, speed: 200 });
          VT.float(PLAYER.x + 40 + i * 34, PLAYER.y - 34, '−' + hit.dmg, 'f-hurt' + (heavy ? ' big' : ''), { dy: -80, dur: 1400 });
          anim($('#player'), [{ transform: 'translate(0,0)' }, { transform: 'translate(-10px,4px)' }, { transform: 'translate(8px,-2px)' }, { transform: 'translate(0,0)' }], 300);
        }
        if (hit.blocked > 0) {
          AU.play('block');
          FX.burst('stone', 640, 470, 24, { speed: 460, rx: 40, ry: 40 }); FX.ring(640, 470, '214,164,92', 180, 420, { w: 5 });
          VT.float(PLAYER.x + 150, PLAYER.y - 70 - i * 20, hit.dmg > 0 ? 'ward broken' : 'warded ' + hit.blocked, 'f-wardtxt', { dy: -50 });
        }
        setBar(playerBar, hit.s.ph, f.p.max);
        setStatus({ sw: hit.s.sw, pw: hit.s.pw, stun: false, weak: hit.s.weak });
        if (!hit.blast) await anim(actEl, [{ transform: out }, { transform: 'translate(0px,0px) rotate(0deg) scale(1)' }], { duration: last ? 380 : 170, fill: 'forwards', easing: 'cubic-bezier(.2,.7,.3,1)' });
        back = 'translate(0px,0px) rotate(0deg) scale(1)';
        if (f.p.hp <= 0 && hit.s.ph <= 0) break;
      }
      shadeEl.classList.remove('rage');
      actEl.getAnimations().forEach(function (a) { a.cancel(); });
      if (e.to && e.from && FX.ground.state !== 'bare') {
        AU.play('fire'); FX.burst('flame', GROUND.x, GROUND.y - 10, 40, { rx: 220, ry: 30, dir: -Math.PI / 2, spread: 0.6, speed: 380 });
        groundChange(e.from, 'bare');
      }
      if (e.heal) { AU.play('shadeHeal'); FX.burst('heal', SHADE.x, SHADE.y + 100, 40, { rx: 140, ry: 140, speed: 140 }); VT.float(SHADE.x, SHADE.y - 120, '+' + e.heal, 'f-heal', { dy: -60 }); }
      if (e.ward) { AU.play('ward'); FX.ring(SHADE.x, SHADE.y, '160,190,255', 330, 600, { w: 6 }); FX.burst('gust', SHADE.x, SHADE.y, 30, { rx: 150, ry: 220, speed: 100 }); VT.float(SHADE.x + 80, SHADE.y - 150, '+' + e.ward + ' ward', 'f-wardtxt', { dy: -50 }); }
      setBar(shadeBar, e.s.sh, f.shade.max); setBar(playerBar, e.s.ph, f.p.max); setStatus(e.s);
      intentEl.classList.remove('acting');
      if (e.curse && f.p.hp > 0) await H.curse({});
      await sleep(e.hits.length ? 260 : 560);
    },
    discard: async function (e) {
      e.cards.forEach(function (c, i) {
        var el = els[c.uid]; if (!el) return;
        el.classList.remove('inhand', 'hover', 'hinted'); el.style.zIndex = 5;
        setTimeout(function () { AU.play('flick'); el.classList.add('down'); VT.moveCard(el, DISC.x, DISC.y, 14, DISC.s, 420, 'cubic-bezier(.5,0,.3,1)'); }, i * 55 * VT.TS);
        setTimeout(function () { el.remove(); vis.discard++; setPiles(); }, (i * 55 + 440) * VT.TS);
        delete els[c.uid];
      });
      hand = hand.filter(function (u) { return els[u]; });
      VT.hideTip(); hovered = null;
      await sleep(e.cards.length * 55 + 470);
    },
    defeat: async function () { /* handled by the turn loop */ }
  };

  // ------------------------------------------------------------------ the turn loop
  async function doCast() {
    if (busy || VT.busy || VT.overlayOpen || !f || f.over) return;
    busy = true;
    AU.play('click');
    VT.hideTip(); hint(null); clearForecast();
    scr.classList.add('casting');
    var uids = spread.slice();
    if (uids.length) anim($('#btn-cast'), [{ transform: 'translateX(-50%) scale(1)' }, { transform: 'translateX(-50%) scale(0.92)' }, { transform: 'translateX(-50%) scale(1)' }], 200);
    else VT.float(440, SLOT_Y, 'You wait', 'f-note', { dy: -40 });
    var ev = Core.cast(f, uids);
    await play(ev);
    deactivate();
    // the spread leaves the table
    var back = 0;
    uids.forEach(function (u, i) {
      var el = els[u]; if (!el || purged[u]) return;
      el.classList.remove('active', 'spent', 'sealed', 'inspread', 'charged-fire', 'charged-water', 'charged-air', 'charged-earth');
      if (insts[u].id === 0 && !insts[u].rev) { back++; return; }
      el.style.zIndex = 5;
      setTimeout(function () { AU.play('flick'); el.classList.add('down'); VT.moveCard(el, DISC.x, DISC.y, 14, DISC.s, 460, 'cubic-bezier(.5,0,.3,1)'); }, i * 70 * VT.TS);
      setTimeout(function () { el.remove(); vis.discard++; setPiles(); }, (i * 70 + 480) * VT.TS);
      delete els[u];
    });
    spread = [];
    hand = hand.filter(function (u) { return els[u]; });
    layoutSpread(); layoutHand();
    if (back && !f.over) VT.float(720, 640, 'The Fool returns to your hand', 'f-note', { dy: -30, dur: 1500 });
    scr.classList.remove('casting');
    await sleep(uids.length ? 520 : 200);
    if (f.over === 'win') return victory();
    await play(Core.shadeTurn(f));
    if (f.over === 'lose') return defeat();
    await play(Core.startTurn(f));
    busy = false;
    if (hovered) showCardTip(hovered);
  }

  async function victory() {
    AU.play('victory');
    scr.classList.remove('yourturn');
    Object.keys(els).forEach(function (u, i) {
      var el = els[u]; el.classList.remove('inhand', 'hover');
      VT.moveCard(el, DRAW.x, DRAW.y, -10, DRAW.s, 520, null, i * 50); el.classList.add('down');
    });
    FX.burst('gold', 720, 380, 200, { rx: 400, ry: 100, speed: 520 });
    await VT.callout('Umbra Cadit', CARDS[f.ch].name + ' is unmade', 'gold', { dur: 2100, y: 360 });
    Core.winFight(run, f);
    VT.save();
    VT.Journey.reward({ turns: f.turn, seals: f.stats.seals, combos: f.stats.combos });
  }
  async function defeat() {
    AU.play('defeat');
    scr.classList.add('lost');
    Core.loseFight(run); VT.save();
    await sleep(900);
    var d = h('div', 'defeat', '<div class="defeat-big">You fall into the void</div><div class="defeat-small">The void does not keep you. ' + CARDS[f.ch].name + ' still bars the road.</div><div class="defeat-btns"><button class="btn big" id="btn-retry">Rise again</button><button class="btn" id="btn-tomap">Return to the road</button></div>');
    scr.appendChild(d);
    $('#btn-retry', d).addEventListener('click', function () { if (!VT.busy) { AU.play('click'); enter(); } });
    $('#btn-tomap', d).addEventListener('click', function () { if (!VT.busy) { AU.play('click'); VT.Journey.map(); } });
    void d.offsetWidth; d.classList.add('on');
  }

  VT.keys.fight = function (e) {
    if (!f) return false;
    if (f.over) { if (f.over === 'lose' && (e.key === 'Enter' || e.key === ' ')) { var b = $('#btn-retry'); if (b) b.click(); return; } return false; }
    if (e.key >= '1' && e.key <= '9') { var u = hand[+e.key - 1]; if (u != null) toggle(u); return; }
    if (e.key === 'Enter' || e.key === ' ') { doCast(); return; }
    if (e.key === 'Escape') { clearSpread(); return; }
    if (e.key === 'Backspace') { if (spread.length && !busy) toggle(spread[spread.length - 1]); return; }
    if (e.key === 'd' || e.key === 'D') { VT.showDeck(); return; }
    return false;
  };

  VT.Fight = {
    enter: enter,
    piles: function () { return f ? { draw: f.draw, discard: f.discard.concat(f.hand) } : null; },
    debug: function () { return f ? { hand: f.hand.map(function (c) { return c.uid; }), keep: f.keep.map(function (c) { return c.uid; }), turn: f.turn } : null; },
    // for the driver in tools/drive.js and for debugging from the console
    state: function () {
      if (!f || VT.screen !== 'fight') return null;
      return {
        busy: !!busy || !!VT.busy, over: f.over, turn: f.turn, chapter: f.ch, hand: hand.slice(), spread: spread.slice(), seal: f.seal, ground: f.ground,
        shade: f.shade.hp, hp: f.p.hp, suggest: busy || f.over ? [] : Core.suggest(f, Core.thoughtful)
      };
    }
  };
})(this);
