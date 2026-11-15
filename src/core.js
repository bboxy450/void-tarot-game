// Void Tarot — rules. No DOM in this file; it runs in the browser and in Node.
// Everything that happens in a fight is returned as a list of events which the
// screen layer plays back as animation.
(function (root, factory) {
  var isNode = typeof module !== 'undefined' && module.exports;
  var cards = isNode ? require('./cards.js') : root.VT_CARDS;
  var Core = factory(cards);
  if (isNode) module.exports = Core; else root.VTCore = Core;
})(this, function (CARDS) {
  'use strict';

  // ---- tunables (the simulation in tools/sim.js is used to set these) ----
  var T = {
    hpBase: 30, hpPer: 7.0, hpQuad: 0.060,
    atkBase: 5, atkPer: 0.55,
    playerHp: 46, playerHpPer: 0.75,
    winHeal: 0.14, retryFloor: 0.7,
    removeEvery: 3, minDeck: 8, sDiv: 26
  };

  var ELEMENTS = ['fire', 'water', 'air', 'earth'];
  var EL_NAME = { fire: 'Fire', water: 'Water', air: 'Air', earth: 'Earth', 'void': 'Void' };
  var COURT = {
    page: { mult: 1.5, weak: 2, label: '×1.5' },
    knight: { mult: 2, weak: 3, label: '×2' },
    queen: { mult: 2, weak: 3, label: '×2', heal: true },
    king: { mult: 3, weak: 4, label: '×3' }
  };
  var START_DECK = [0, 23, 24, 26, 37, 38, 40, 51, 52, 54, 65, 66, 68];
  var ACTS = [
    { from: 0, name: 'The Castle', sub: 'where nobles play for names' },
    { from: 22, name: 'The Burning Road', sub: 'Wands · Fire' },
    { from: 36, name: 'The Drowned Coast', sub: 'Cups · Water' },
    { from: 50, name: 'The Storm Heights', sub: 'Swords · Air' },
    { from: 64, name: 'The Deep Earth', sub: 'Pentacles · Earth' }
  ];

  // ---- helpers ----
  function rnd(st) {
    st.rng = (st.rng + 0x6D2B79F5) | 0;
    var t = st.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rint(st, n) { return Math.floor(rnd(st) * n); }
  function shuffle(st, a) {
    for (var i = a.length - 1; i > 0; i--) { var j = rint(st, i + 1); var x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function S(ch) { return 1 + ch / T.sDiv; }
  function R(x) { return Math.max(1, Math.round(x)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Cheap copy of a fight for previews. Card instances are never mutated, so they are shared.
  function fork(f) {
    var g = {}, k;
    for (k in f) g[k] = f[k];
    g.shade = {}; for (k in f.shade) g.shade[k] = f.shade[k];
    g.p = {}; for (k in f.p) g.p[k] = f.p[k];
    g.stats = { seals: 0, combos: 0, dealt: 0 };
    g.draw = f.draw.slice(); g.discard = f.discard.slice(); g.hand = f.hand.slice(); g.keep = f.keep.slice();
    return g;
  }

  function maxHp(ch) { return Math.round(T.playerHp + ch * T.playerHpPer); }
  function ageOf(ch) { return 10 + ch * 26 / 77; }
  function slotsOf(ch) { return ch >= 22 ? 4 : 3; }
  function handSizeOf(ch) { return ch >= 22 ? 6 : 5; }
  function actOf(ch) { var a = 0; for (var i = 0; i < ACTS.length; i++) if (ch >= ACTS[i].from) a = i; return a; }

  // ---- the Shades ----
  var SUIT_SPECIAL = { wands: 'sear', cups: 'mend', swords: 'flurry', pentacles: 'bulwark', major: 'hex' };
  var TRAITS = {
    wands: { key: 'fireborn', name: 'Fireborn', text: 'Fire deals half damage to it.' },
    cups: { key: 'tideborn', name: 'Tideborn', text: 'Mends itself while the ground is wet or charged.' },
    swords: { key: 'stormborn', name: 'Stormborn', text: 'Air deals half damage to it.' },
    pentacles: { key: 'stoneskin', name: 'Stoneskin', text: 'Raises a ward of stone every turn.' }
  };

  function shadeOf(ch) {
    var c = CARDS[ch];
    var hp = T.hpBase + T.hpPer * ch + T.hpQuad * ch * ch;
    var atk = T.atkBase + T.atkPer * ch;
    var sp = SUIT_SPECIAL[c.suit];
    var pattern;
    if (ch === 0) { pattern = ['strike']; hp = 24; atk = 3; }
    else if (ch === 1) { pattern = ['strike', 'strike', 'heavy']; hp = 30; atk = 3; }
    else if (ch === 2) { pattern = ['strike', 'brace', 'heavy']; hp = 36; atk = 4; }
    else if (c.kind === 'trump') {
      var pats = [
        ['strike', 'strike', 'heavy'],
        ['strike', 'brace', 'heavy'],
        ['strike', 'hex', 'strike', 'heavy'],
        ['strike', 'heavy', 'brace', 'hex']
      ];
      pattern = pats[ch < 7 ? ch % 2 : ch % 4];
      if (ch === 21) { hp *= 1.3; pattern = ['strike', 'hex', 'heavy', 'brace', 'heavy']; }
    } else if (c.kind === 'pip') {
      pattern = [
        ['strike', sp, 'strike', 'heavy'],
        [sp, 'strike', 'heavy'],
        ['strike', 'strike', sp, 'heavy'],
        ['strike', sp, 'heavy', 'brace']
      ][c.num % 4];
    } else {
      if (c.rank === 'page') { pattern = ['strike', sp, 'heavy']; hp *= 1.1; }
      else if (c.rank === 'knight') { pattern = ['heavy', 'strike', sp, 'strike']; hp *= 1.15; }
      else if (c.rank === 'queen') { pattern = [sp, 'hex', 'heavy', 'strike']; hp *= 1.2; }
      else { pattern = ['brace', 'heavy', sp, 'hex', 'heavy']; hp *= 1.35; atk *= 1.1; }
    }
    var trait = TRAITS[c.suit] || null;
    return {
      id: ch, name: c.name, suit: c.suit, el: c.el, hp: Math.round(hp), max: Math.round(hp), atk: atk,
      pattern: pattern, pi: 0, ward: 0, stun: false, charm: false, immune: false, weak: false,
      trait: trait ? trait.key : null,
      resist: c.suit === 'wands' ? 'fire' : c.suit === 'swords' ? 'air' : null
    };
  }
  function traitOf(sh) { for (var k in TRAITS) if (TRAITS[k].key === sh.trait) return TRAITS[k]; return null; }

  function intentOf(f) {
    var sh = f.shade, mv = sh.pattern[sh.pi % sh.pattern.length], a = sh.atk;
    var w = sh.weak ? 0.5 : 1;
    var it = { move: mv, dmg: 0, hits: 1, ward: 0, heal: 0, curse: false, stunned: sh.stun, weak: sh.weak };
    if (mv === 'strike') it.dmg = R(a * w);
    else if (mv === 'heavy') it.dmg = R(a * 2 * w);
    else if (mv === 'flurry') { it.dmg = R(a * 0.45 * w); it.hits = 3; }
    else if (mv === 'sear') it.dmg = R(a * 0.9 * w);
    else if (mv === 'mend') { it.dmg = R(a * 0.5 * w); it.heal = R(sh.max * 0.10); }
    else if (mv === 'bulwark') { it.dmg = R(a * 0.6 * w); it.ward = R(a * 1.2); }
    else if (mv === 'brace') it.ward = R(a * 1.6);
    else if (mv === 'hex') { it.dmg = R(a * 0.6 * w); it.curse = true; }
    it.total = it.dmg * it.hits;
    return it;
  }
  var MOVE_TEXT = {
    strike: ['Strike', 'It will strike you.'],
    heavy: ['Heavy blow', 'A heavy blow is coming. Ward yourself, or stun it by breaking the Seal.'],
    flurry: ['Flurry', 'Three quick cuts.'],
    sear: ['Sear', 'It strikes and burns the ground away. If the ground is oil, the blast hits you.'],
    mend: ['Mend', 'It strikes weakly and knits itself back together.'],
    bulwark: ['Bulwark', 'It strikes weakly and raises a ward.'],
    brace: ['Brace', 'It raises a ward against your next cast.'],
    hex: ['Hex', 'It strikes and shuffles a reversed card, a curse, into your deck.']
  };

  // ---- trumps: name of the incantation and what it says on the card ----
  var TRUMPS = [
    ['Stultus', function (s) { return 'Deal ' + R(3 * s) + '. The Fool returns to your hand instead of being discarded.'; }],
    ['Iterum', function () { return 'The next card is cast twice.'; }],
    ['Praevide', function () { return 'Draw 2 extra cards next turn.'; }],
    ['Floreat', function (s) { return 'Heal ' + R(3 * s) + ' at the start of each of your next 3 turns.'; }],
    ['Imperium', function (s) { return 'Gain ' + R(9 * s) + ' ward.'; }],
    ['Benedictio', function (s) { return 'The Seal breaks, whatever your numbers are. Gain ' + R(3 * s) + ' ward.'; }],
    ['Vinculum', function (s) { return 'Charm the Shade: it loses its next action. Heal ' + R(3 * s) + '.'; }],
    ['Impetus', function (s) { return 'Strike once for every card in the spread, ' + R(3 * s) + ' each.'; }],
    ['Fortitudo', function (s) { return 'Gain ' + R(3 * s) + ' ward, then deal damage equal to your ward.'; }],
    ['Solitudo', function (s) { return 'Cast alone: deal ' + R(12 * s) + ' and heal ' + R(4 * s) + '. In company: deal ' + R(4 * s) + '.'; }],
    ['Rota', function (s) { return 'Deal 1 to ' + R(12 * s) + ' at random. The ground becomes oil, wet or charged.'; }],
    ['Talio', function (s) { return 'Deal damage equal to the blow the Shade intends (at least ' + R(4 * s) + ').'; }],
    ['Suspensio', function (s) { return 'Pay ' + R(3 * s) + ' life. The next card is tripled.'; }],
    ['Finis', function (s) { return 'If the Shade is at a quarter of its life or less, it dies. Otherwise deal ' + R(6 * s) + '.'; }],
    ['Temperantia', function (s) { return 'Heal ' + R(5 * s) + ' and gain ' + R(5 * s) + ' ward.'; }],
    ['Pactum', function (s) { return 'Deal ' + R(13 * s) + '. A curse is shuffled into your deck.'; }],
    ['Ruina', function (s) { return 'Detonate the ground. Oil ' + R(14 * s) + ', charged ' + R(16 * s) + ' and shock, wet ' + R(8 * s) + ', bare ' + R(6 * s) + '.'; }],
    ['Stella', function (s) { return 'Heal a third of your missing life (at least ' + R(4 * s) + ').'; }],
    ['Umbra', function (s) { return 'Cast the card before it again. First in the spread: deal ' + R(3 * s) + '.'; }],
    ['Sol', function (s) { return 'Fire ' + R(7 * s) + ' (it ignites oil). Heal ' + R(2 * s) + '.'; }],
    ['Resurgat', function () { return 'Deal 3 for every card in your discard pile.'; }],
    ['Mundus', function (s) { return 'Earth, Fire, Water and Air at ' + R(3 * s) + ', one after another.'; }]
  ];

  function describe(card, ch) {
    var s = S(ch || 0);
    if (card.rev) {
      return { type: 'Reversed · Curse', latin: 'Maledictum', lines: ['A dead card. Lay it in the spread to purge it for this fight.'] };
    }
    var c = CARDS[card.id];
    if (c.kind === 'pip') {
      var n = c.num, t = '';
      if (c.el === 'fire') t = 'Deal ' + n + '. On oil: explosion. Dries wet ground.';
      if (c.el === 'water') t = 'Deal ' + Math.ceil(n / 2) + ', heal ' + Math.ceil(n / 2) + '. Leaves the ground wet.';
      if (c.el === 'air') t = 'Deal ' + R(n * 0.75) + '. Charges wet ground. On charged ground: zap.';
      if (c.el === 'earth') t = 'Gain ' + n + ' ward. Leaves oil on the ground.';
      return { type: EL_NAME[c.el] + ' ' + n, latin: null, lines: [t, 'Counts ' + n + ' toward the Seal.'] };
    }
    if (c.kind === 'court') {
      var k = COURT[c.rank];
      return {
        type: EL_NAME[c.el] + ' ' + c.rank.charAt(0).toUpperCase() + c.rank.slice(1) + ' · ' + k.label, latin: null,
        lines: ['Laid before a card: that card becomes ' + EL_NAME[c.el] + ' and is cast ' + k.label + (k.heal ? ', and you heal a little' : '') + '.',
          'Laid last: a weak ' + EL_NAME[c.el] + ' ' + k.weak + '.']
      };
    }
    return { type: 'Trump ' + c.rank, latin: TRUMPS[c.id][0], lines: [TRUMPS[c.id][1](s)] };
  }

  // ---- campaign ----
  function newRun(seed) {
    seed = (seed | 0) || ((Math.random() * 2147483647) | 0) || 1;
    return {
      v: 3, seed: seed, rng: seed, chapter: 0, deck: START_DECK.slice(), hp: maxHp(0),
      scars: 0, phase: 'map', offer: null, removed: 0, seen: {}
    };
  }
  function isAltar(ch) { return ch % T.removeEvery === T.removeEvery - 1; }

  function rewardOptions(run) {
    var ch = run.chapter, own = {}, opts = [], pool = [];
    run.deck.forEach(function (id) { own[id] = 1; });
    if (!own[ch]) opts.push(ch);
    for (var i = 0; i < 78; i++) {
      if (own[i] || i === ch) continue;
      var c = CARDS[i], w = 0;
      if (c.kind === 'pip') w = 3;
      else if (c.kind === 'court') w = ch >= 2 ? 1.2 : 0;
      else w = i < ch ? 1.5 : 0;           // a trump you passed by may return
      if (w) pool.push([i, w]);
    }
    while (opts.length < 3 && pool.length) {
      var tot = 0, k;
      for (k = 0; k < pool.length; k++) tot += pool[k][1];
      var r = rnd(run) * tot;
      for (k = 0; k < pool.length; k++) { r -= pool[k][1]; if (r <= 0) break; }
      k = Math.min(k, pool.length - 1);
      opts.push(pool[k][0]); pool.splice(k, 1);
    }
    return opts;
  }
  function winFight(run, f) {
    var m = maxHp(run.chapter);
    run.hp = Math.min(m, Math.max(1, f.p.hp) + Math.round(m * T.winHeal));
    run.offer = rewardOptions(run);
    run.phase = 'reward';
  }
  function loseFight(run) {
    run.scars++;
    run.hp = Math.max(run.hp, Math.ceil(maxHp(run.chapter) * T.retryFloor));
  }
  function takeReward(run, id) {
    if (id != null && run.offer && run.offer.indexOf(id) >= 0) run.deck.push(id);
    run.offer = null;
    run.phase = isAltar(run.chapter) && run.deck.length > T.minDeck ? 'altar' : 'travel';
  }
  function removeCard(run, id) {
    var i = run.deck.indexOf(id);
    if (i >= 0 && run.deck.length > T.minDeck) { run.deck.splice(i, 1); run.removed++; }
  }
  function advance(run) {
    var before = maxHp(run.chapter);
    run.chapter++;
    run.phase = run.chapter >= 78 ? 'end' : 'map';
    if (run.chapter < 78) run.hp = Math.min(maxHp(run.chapter), run.hp + (maxHp(run.chapter) - before));
  }

  // ---- fights ----
  function startFight(run) {
    var ch = run.chapter;
    var f = {
      ch: ch, rng: (rnd(run) * 4294967296) | 0, turn: 0, slots: slotsOf(ch), handSize: handSizeOf(ch),
      shade: shadeOf(ch),
      p: { hp: run.hp, max: maxHp(ch), ward: 0, regen: 0, regenAmt: 0, extraDraw: 0 },
      ground: 'bare', draw: [], discard: [], hand: [], keep: [], seal: 0, over: null, uid: 1, stats: { seals: 0, combos: 0, dealt: 0 }
    };
    run.deck.forEach(function (id) { f.draw.push({ uid: f.uid++, id: id }); });
    shuffle(f, f.draw);
    if (ch < 3) stackTutorial(f);
    if (f.shade.trait === 'stoneskin') f.shade.ward = R(f.shade.atk * 0.5);
    return f;
  }
  // The first three fights open with a hand that shows a combo.
  function stackTutorial(f) {
    var want = f.ch === 0 ? [66, 26, 24, 38, 52] : f.ch === 1 ? [38, 52, 54, 68, 23] : [65, 26, 37, 51, 0];
    var top = [];
    want.forEach(function (id) {
      for (var i = 0; i < f.draw.length; i++) if (f.draw[i].id === id) { top.push(f.draw.splice(i, 1)[0]); break; }
    });
    f.draw = f.draw.concat(top.reverse());       // draw pops from the end
  }
  function snap(f) {
    return { sh: f.shade.hp, sw: f.shade.ward, ph: f.p.hp, pw: f.p.ward, g: f.ground, stun: f.shade.stun, weak: f.shade.weak };
  }
  function push(f, ev, e) { e.s = snap(f); ev.push(e); return e; }

  function drawCards(f, n, ev) {
    var got = [];
    for (var i = 0; i < n; i++) {
      if (!f.draw.length) {
        if (!f.discard.length) break;
        f.draw = shuffle(f, f.discard); f.discard = [];
        if (got.length) { push(f, ev, { t: 'draw', cards: got }); got = []; }
        push(f, ev, { t: 'reshuffle', n: f.draw.length });
      }
      got.push(f.draw.pop());
    }
    if (got.length) push(f, ev, { t: 'draw', cards: got });
    got.forEach(function (c) { f.hand.push(c); });
  }

  function rollSeal(f) {
    var nums = [];
    f.hand.forEach(function (c) { if (!c.rev && CARDS[c.id].kind === 'pip') nums.push(CARDS[c.id].num); });
    if (!nums.length) return 0;
    shuffle(f, nums);
    var k = nums.length === 1 ? 1 : nums.length === 2 ? 2 : (rnd(f) < 0.5 ? 2 : 3);
    k = Math.min(k, f.slots);
    var s = 0;
    for (var i = 0; i < k; i++) s += nums[i];
    return s;
  }

  function startTurn(f) {
    var ev = [];
    f.turn++;
    f.p.ward = 0;
    if (f.p.regen > 0) {
      var h = Math.min(f.p.regenAmt, f.p.max - f.p.hp);
      f.p.hp += h; f.p.regen--;
      push(f, ev, { t: 'regen', heal: h, left: f.p.regen });
    }
    f.hand = f.keep; f.keep = [];
    if (f.hand.length) push(f, ev, { t: 'kept', cards: f.hand.slice() });
    drawCards(f, f.handSize + f.p.extraDraw, ev);
    f.p.extraDraw = 0;
    f.seal = (f.ch === 0 && f.turn === 1) ? 0 : rollSeal(f);   // the very first cast teaches oil and fire only
    push(f, ev, { t: 'turn', seal: f.seal, intent: intentOf(f), immune: f.shade.immune, turn: f.turn });
    return ev;
  }

  function hitShade(f, amt, el) {
    var sh = f.shade, resisted = false;
    amt = Math.max(0, Math.round(amt));
    if (el && sh.resist === el) { amt = Math.ceil(amt / 2); resisted = true; }
    var blocked = Math.min(sh.ward, amt);
    sh.ward -= blocked;
    var d = Math.min(sh.hp, amt - blocked);
    sh.hp -= d;
    f.stats.dealt += d;
    return { dmg: amt - blocked, blocked: blocked, resisted: resisted };
  }
  function healP(f, amt) { var h = Math.max(0, Math.min(Math.round(amt), f.p.max - f.p.hp)); f.p.hp += h; return h; }

  // One spell event: anything a card does to the board in one beat.
  function spell(f, ev, i, o) {
    var e = { t: 'spell', i: i, el: o.el || 'void', from: f.ground };
    if (o.dmg != null) {
      var r = hitShade(f, o.dmg, o.el === 'void' ? null : o.el);
      e.dmg = r.dmg; e.blocked = r.blocked; e.resisted = r.resisted;
    }
    if (o.heal) e.heal = healP(f, o.heal);
    if (o.ward) { f.p.ward += Math.round(o.ward); e.ward = Math.round(o.ward); }
    if (o.ground) f.ground = o.ground;
    if (o.weak) { f.shade.weak = true; e.shock = true; }
    if (o.combo) { e.combo = o.combo; if (o.combo === 'explosion' || o.combo === 'zap') f.stats.combos++; }
    if (o.note) e.note = o.note;
    if (o.small) e.small = true;
    e.to = f.ground;
    return push(f, ev, e);
  }

  function castElement(f, ev, i, el, n, G, extra) {
    var s = S(f.ch), g = f.ground, o = { el: el };
    n = R(n);
    if (el === 'fire') {
      if (g === 'oil') { o.dmg = 2 * n + R(5 * s) * G; o.combo = 'explosion'; o.ground = 'bare'; }
      else { o.dmg = n; if (g !== 'bare') { o.ground = 'bare'; o.combo = 'steam'; } }
    } else if (el === 'water') {
      o.dmg = Math.ceil(n / 2); o.heal = Math.ceil(n / 2);
      if (g !== 'charged') o.ground = 'wet';
    } else if (el === 'air') {
      var a = R(n * 0.75);
      if (g === 'charged') { o.dmg = 2 * a + R(8 * s) * G; o.combo = 'zap'; o.ground = 'bare'; o.weak = true; }
      else if (g === 'wet') { o.dmg = a; o.ground = 'charged'; o.combo = 'charge'; }
      else o.dmg = a;
    } else if (el === 'earth') {
      o.ward = n; o.ground = 'oil';
    } else {
      o.dmg = n;
    }
    if (extra && extra.heal) o.heal = (o.heal || 0) + extra.heal;
    return spell(f, ev, i, o);
  }

  function castTrump(f, ev, i, id, m, G, ctx) {
    var s = S(f.ch), p = f.p, sh = f.shade, e;
    switch (id) {
      case 0: spell(f, ev, i, { dmg: R(3 * s * m) }); break;
      case 2: p.extraDraw += 2; push(f, ev, { t: 'buff', i: i, kind: 'draw', n: 2, text: '+2 cards next turn' }); break;
      case 3: p.regen = 3; p.regenAmt = Math.max(p.regenAmt, R(3 * s * m)); push(f, ev, { t: 'buff', i: i, kind: 'regen', n: p.regenAmt, text: 'Regrowth ' + p.regenAmt }); break;
      case 4: spell(f, ev, i, { el: 'earth', ward: R(9 * s * m), note: 'ward' }); break;
      case 5: spell(f, ev, i, { ward: R(3 * s * m), note: 'ward' }); break;
      case 6: sh.stun = true; sh.charm = true; e = spell(f, ev, i, { heal: R(3 * s * m), note: 'charm' }); e.charm = true; break;
      case 7: for (var k = 0; k < ctx.count && sh.hp > 0; k++) spell(f, ev, i, { dmg: R(3 * s * m), small: k > 0 }); break;
      case 8: spell(f, ev, i, { el: 'earth', ward: R(3 * s), note: 'ward' }); spell(f, ev, i, { dmg: p.ward * m }); break;
      case 9:
        if (ctx.count === 1) spell(f, ev, i, { dmg: R(12 * s * m), heal: R(4 * s) });
        else spell(f, ev, i, { dmg: R(4 * s * m) });
        break;
      case 10:
        var top = R(12 * s), roll = f.preview ? Math.ceil(top / 2) : 1 + rint(f, top);
        var gr = f.preview ? f.ground : ['oil', 'wet', 'charged'][rint(f, 3)];
        e = spell(f, ev, i, { dmg: roll * m, ground: gr }); e.random = true; break;
      case 11: spell(f, ev, i, { dmg: Math.max(intentOf(f).total, R(4 * s)) * m }); break;
      case 13:
        if (sh.hp <= Math.floor(sh.max * 0.25)) { e = spell(f, ev, i, { dmg: sh.hp + sh.ward }); e.execute = true; }
        else spell(f, ev, i, { dmg: R(6 * s * m) });
        break;
      case 14: spell(f, ev, i, { el: 'water', heal: R(5 * s * m), ward: R(5 * s * m), note: 'ward' }); break;
      case 15:
        spell(f, ev, i, { dmg: R(13 * s * m) });
        f.discard.push({ uid: f.uid++, id: sh.id, rev: true });
        push(f, ev, { t: 'curse', i: i, self: true });
        break;
      case 16:
        if (f.ground === 'oil') spell(f, ev, i, { el: 'fire', dmg: R(14 * s * m), combo: 'explosion', ground: 'bare' });
        else if (f.ground === 'charged') spell(f, ev, i, { el: 'air', dmg: R(16 * s * m), combo: 'zap', ground: 'bare', weak: true });
        else if (f.ground === 'wet') spell(f, ev, i, { el: 'water', dmg: R(8 * s * m), combo: 'steam', ground: 'bare' });
        else spell(f, ev, i, { el: 'earth', dmg: R(6 * s * m) });
        break;
      case 17: spell(f, ev, i, { el: 'water', heal: Math.max(R(4 * s), Math.round((p.max - p.hp) / 3)) * m }); break;
      case 19: castElement(f, ev, i, 'fire', R(7 * s * m), G, { heal: R(2 * s) }); break;
      case 20: spell(f, ev, i, { dmg: Math.max(1, 3 * f.discard.length) * m }); break;
      case 21:
        var n = R(3 * s * m), order = ['earth', 'fire', 'water', 'air'];
        for (var q = 0; q < 4 && sh.hp > 0; q++) castElement(f, ev, i, order[q], n, G);
        break;
      default: spell(f, ev, i, { dmg: R(2 * s * m) });
    }
  }

  // Resolve a spread (array of card instances, left to right) against the fight.
  function resolve(f, spread) {
    var ev = [], s = S(f.ch), sum = 0, hiero = false, i;
    for (i = 0; i < spread.length; i++) {
      var c0 = spread[i];
      if (c0.rev) continue;
      if (CARDS[c0.id].kind === 'pip') sum += CARDS[c0.id].num;
      if (c0.id === 5) hiero = true;
    }
    var sealHit = hiero || (f.seal > 0 && sum === f.seal);
    var G = sealHit ? 2 : 1;
    if (sealHit) {
      var stunned = !f.shade.immune;
      if (stunned) f.shade.stun = true;
      f.stats.seals++;
      push(f, ev, { t: 'seal', stunned: stunned, sum: sum });
    }
    var pend = { mult: 1, el: null, rep: 1, heal: 0 };
    var ctx = { count: spread.length, last: null };
    function live(j) { for (var k = j + 1; k < spread.length; k++) if (!spread[k].rev) return true; return false; }

    for (i = 0; i < spread.length && f.shade.hp > 0; i++) {
      var card = spread[i];
      push(f, ev, { t: 'activate', i: i, uid: card.uid });
      if (card.rev) { push(f, ev, { t: 'purge', i: i, uid: card.uid }); continue; }
      var c = CARDS[card.id], next = live(i);
      if (c.kind === 'court' && next) {
        var k = COURT[c.rank];
        pend.mult += k.mult - 1; pend.el = c.el;
        if (k.heal) pend.heal += R(2 * s);
        push(f, ev, { t: 'mod', i: i, el: c.el, text: EL_NAME[c.el] + ' ' + k.label });
        continue;
      }
      if (c.id === 1 && next) { pend.rep *= 2; push(f, ev, { t: 'mod', i: i, el: 'void', text: 'Twice' }); continue; }
      if (c.id === 12 && next) {
        var pay = Math.min(R(3 * s), f.p.hp - 1);
        f.p.hp -= pay; pend.mult += 2;
        push(f, ev, { t: 'mod', i: i, el: 'void', text: '×3', pay: pay });
        continue;
      }
      var m = pend.mult * G, rep = pend.rep, run;
      if (c.kind === 'pip') {
        run = (function (el, n, heal) { return function () { castElement(f, ev, i, el, n, G, { heal: heal }); }; })(pend.el || c.el, c.num * m, pend.heal);
      } else if (c.kind === 'court') {
        run = (function (el, n, heal) { return function () { castElement(f, ev, i, el, n, G, { heal: heal }); }; })(pend.el || c.el, COURT[c.rank].weak * m, pend.heal);
      } else if (c.id === 18) {
        run = ctx.last || (function (mm) { return function () { spell(f, ev, i, { dmg: R(3 * s * mm) }); }; })(m);
        if (ctx.last) push(f, ev, { t: 'mod', i: i, el: 'void', text: 'Again' });
      } else if (c.id === 1 || c.id === 12) {
        run = (function (mm) { return function () { spell(f, ev, i, { dmg: R(2 * s * mm) }); }; })(m);
      } else {
        run = (function (id, mm) { return function () { castTrump(f, ev, i, id, mm, G, ctx); }; })(c.id, m);
      }
      for (var r = 0; r < rep && f.shade.hp > 0; r++) run();
      if (c.id !== 18) ctx.last = run;
      pend = { mult: 1, el: null, rep: 1, heal: 0 };
    }
    if (f.shade.hp <= 0) { f.over = 'win'; push(f, ev, { t: 'death' }); }
    return { ev: ev, sealHit: sealHit, sum: sum };
  }

  function pick(f, uids) {
    var out = [];
    uids.forEach(function (u) {
      for (var i = 0; i < f.hand.length; i++) if (f.hand[i].uid === u) { out.push(f.hand[i]); break; }
    });
    return out;
  }

  function cast(f, uids) {
    var spread = pick(f, uids).slice(0, f.slots);
    f.hand = f.hand.filter(function (c) { return spread.indexOf(c) < 0; });
    var r = resolve(f, spread);
    spread.forEach(function (c) {
      if (c.rev) return;                          // purged
      if (c.id === 0) f.keep.push(c); else f.discard.push(c);
    });
    return r.ev;
  }

  // What would this spread do? Runs the real rules on a copy.
  function preview(f, uids) {
    var g = fork(f);
    g.preview = true;
    var spread = pick(g, uids).slice(0, g.slots);
    var r = resolve(g, spread);
    var slots = spread.map(function () { return { dmg: 0, heal: 0, ward: 0, combo: null, text: '', el: null, random: false, purge: false }; });
    var tot = { dmg: 0, heal: 0, ward: 0 };
    r.ev.forEach(function (e) {
      var sl = slots[e.i];
      if (!sl) return;
      if (e.t === 'spell') {
        sl.el = e.el;
        if (e.dmg) { sl.dmg += e.dmg; tot.dmg += e.dmg; }
        if (e.heal) { sl.heal += e.heal; tot.heal += e.heal; }
        if (e.ward) { sl.ward += e.ward; tot.ward += e.ward; }
        if (e.combo && (e.combo === 'explosion' || e.combo === 'zap' || !sl.combo)) sl.combo = e.combo;
        if (e.random) sl.random = true;
        if (e.charm) sl.text = 'Charm';
        if (e.execute) sl.text = 'Execute';
        if (e.resisted) sl.resisted = true;
      } else if (e.t === 'mod') { sl.text = e.text; sl.el = e.el; sl.mod = true; }
      else if (e.t === 'buff') sl.text = e.text;
      else if (e.t === 'purge') { sl.text = 'Purged'; sl.purge = true; }
      else if (e.t === 'curse') sl.curse = true;
    });
    return {
      slots: slots, total: tot, sealHit: r.sealHit, sum: r.sum, seal: f.seal, kills: g.shade.hp <= 0,
      ground: g.ground, stun: g.shade.stun, after: { sh: g.shade.hp, ph: g.p.hp, pw: g.p.ward }
    };
  }

  function hitPlayer(f, amt) {
    var blocked = Math.min(f.p.ward, amt);
    f.p.ward -= blocked;
    var d = Math.min(f.p.hp, amt - blocked);
    f.p.hp -= d;
    return { dmg: d, blocked: blocked };
  }

  function shadeTurn(f) {
    var ev = [], sh = f.shade, it = intentOf(f), mv = it.move;
    if (f.over) return ev;
    sh.ward = 0;
    if (sh.trait === 'tideborn' && (f.ground === 'wet' || f.ground === 'charged') && sh.hp < sh.max) {
      var th = Math.min(sh.max - sh.hp, R(sh.max * 0.05));
      sh.hp += th;
      push(f, ev, { t: 'shadeHeal', heal: th, trait: true });
    }
    if (sh.stun) {
      sh.stun = false; sh.immune = true;
      push(f, ev, { t: 'stunned', charm: sh.charm, move: mv });
      sh.charm = false;
    } else {
      sh.immune = false;
      var e = { t: 'shadeMove', move: mv, hits: [] };
      for (var h = 0; h < it.hits && it.dmg > 0; h++) {
        var r = hitPlayer(f, it.dmg);
        r.s = snap(f);
        e.hits.push(r);
      }
      if (mv === 'sear' && f.ground !== 'bare') {
        e.from = f.ground;
        if (f.ground === 'oil') { var x = hitPlayer(f, R(sh.atk * 0.6)); x.blast = true; f.ground = 'bare'; x.s = snap(f); e.hits.push(x); }
        f.ground = 'bare';
        e.to = 'bare';
      }
      if (it.heal) { var hh = Math.min(sh.max - sh.hp, it.heal); sh.hp += hh; e.heal = hh; }
      if (it.ward) { sh.ward = it.ward; e.ward = it.ward; }
      if (it.curse) { f.discard.push({ uid: f.uid++, id: sh.id, rev: true }); e.curse = true; }
      push(f, ev, e);
    }
    sh.weak = false;
    if (sh.trait === 'stoneskin') sh.ward += R(sh.atk * 0.5);
    sh.pi++;
    var gone = f.hand; f.hand = [];
    gone.forEach(function (c) { f.discard.push(c); });
    push(f, ev, { t: 'discard', cards: gone });
    if (f.p.hp <= 0) { f.over = 'lose'; push(f, ev, { t: 'defeat' }); }
    return ev;
  }

  // Every ordered way to lay up to `slots` cards from the hand. Used by the
  // bots in tools/ and by the debug autoplayer.
  function options(f) {
    var out = [[]], hand = f.hand;
    function rec(cur, used) {
      if (cur.length) out.push(cur.slice());
      if (cur.length >= f.slots) return;
      for (var i = 0; i < hand.length; i++) {
        if (used[i]) continue;
        used[i] = 1; cur.push(hand[i].uid); rec(cur, used); cur.pop(); used[i] = 0;
      }
    }
    rec([], {});
    return out;
  }
  function suggest(f, score) {
    var best = null, bestS = -1e9;
    options(f).forEach(function (o) {
      var p = preview(f, o), sc = score(p, f, o);
      if (sc > bestS) { bestS = sc; best = o; }
    });
    return best || [];
  }
  function thoughtful(p, f) {
    if (p.kills) return 1e6;
    var inc = p.stun ? 0 : intentOf(f).total;
    var taken = Math.max(0, inc - p.total.ward);
    var hpAfter = p.after.ph - taken;
    var sc = p.total.dmg * 1.0 - taken * (hpAfter < f.p.max * 0.5 ? 2.2 : 1.3);
    sc += (p.after.ph - f.p.hp) * 0.9;
    if (hpAfter <= 0) sc -= 1e4;
    if (p.ground === 'oil' || p.ground === 'charged') sc += 3 + f.ch * 0.1;
    if (f.shade.trait === 'tideborn' && (p.ground === 'wet' || p.ground === 'charged')) sc -= f.shade.max * 0.04;
    return sc;
  }

  return {
    T: T, CARDS: CARDS, ELEMENTS: ELEMENTS, EL_NAME: EL_NAME, COURT: COURT, ACTS: ACTS, TRUMPS: TRUMPS, MOVE_TEXT: MOVE_TEXT,
    S: S, maxHp: maxHp, ageOf: ageOf, slotsOf: slotsOf, handSizeOf: handSizeOf, actOf: actOf,
    shadeOf: shadeOf, traitOf: traitOf, intentOf: intentOf, describe: describe,
    newRun: newRun, isAltar: isAltar, rewardOptions: rewardOptions, winFight: winFight, loseFight: loseFight,
    takeReward: takeReward, removeCard: removeCard, advance: advance,
    startFight: startFight, startTurn: startTurn, cast: cast, preview: preview, shadeTurn: shadeTurn,
    options: options, suggest: suggest, thoughtful: thoughtful, rnd: rnd, clone: clone
  };
});
