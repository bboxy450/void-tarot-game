// The chapter loop and content generation. No screen code: the page (ui.js) and
// the scripted player (tools/playthrough.js) both drive this.
if (typeof module !== 'undefined') { var CARDS = require('./cards.js'); var makeMachines = require('./machines.js'); var surfaceCast = makeMachines.surfaceCast; }

var TRUMPS = ['Fool', 'Magician', 'HighPriestess', 'Empress', 'Emperor', 'Hierophant', 'Lovers', 'Chariot', 'Strength', 'Hermit', 'Wheel',
  'Justice', 'HangedMan', 'Death', 'Temperance', 'Devil', 'Tower', 'Star', 'Moon', 'Sun', 'Judgement', 'World'];
var ELEMENT = { wands: 'Fire', cups: 'Water', swords: 'Air', pentacles: 'Earth' };
var TRUMP_ELEMENT = ['Air', 'Air', 'Water', 'Water', 'Fire', 'Earth', 'Air', 'Water', 'Fire', 'Earth', 'Fire',
  'Air', 'Water', 'Water', 'Fire', 'Earth', 'Fire', 'Air', 'Water', 'Fire', 'Fire', 'Earth'];
var ATTRIBUTE = { swords: 'Defence', pentacles: 'Resources', cups: 'Affection', wands: 'Population' };
var SECRETS = [
  ['Phrase', 'Aqua in vinum', 'water into wine'], ['Phrase', 'Solve et coagula', 'dissolve and bind'],
  ['Phrase', 'Fiat lux', 'let there be light'], ['Phrase', 'Memento mori', 'remember you will die'],
  ['Phrase', 'Igne natura renovatur integra', 'by fire nature is made whole'], ['Phrase', 'Quod est superius est sicut quod est inferius', 'as above, so below'],
  ['Phrase', 'Ora et labora', 'pray and work'], ['Phrase', 'Nosce te ipsum', 'know yourself'],
  ['Symbol', 'the ouroboros', 'a serpent eating its tail'], ['Symbol', 'the lemniscate', 'the figure of eight on its side'],
  ['Symbol', 'the pentagram', 'five points, one for each element and spirit'], ['Symbol', 'the rose cross', 'a rose at the heart of a cross'],
  ['Symbol', 'the eye in the triangle', 'what watches from the top'], ['Symbol', 'the caduceus', 'two serpents on a staff']
];
var cap = function (w) { return w[0].toUpperCase() + w.slice(1); };
var isTrump = function (c) { return c.suit === 'major'; };
var isPip = function (c) { return !isTrump(c) && c.n <= 10; };
var isCourt = function (c) { return !isTrump(c) && c.n > 10; };

function makeGame(seed) {
  var M = makeMachines();
  // own: card index -> { copies, power (+1 more, -1 less, 0 plain), el (element for this encounter, or null) }
  var G = { M: M, seed: seed, own: {}, known: false, reward: false, lessons: [], msg: '', ch: null, over: false, played: {}, edits: {}, spoken: 0 };
  var seen = {};

  var a = seed >>> 0;
  function rnd() { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function pick(list) { return list[Math.floor(rnd() * list.length)]; }
  function shuffle(list) { for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; } return list; }
  function draw(n, test, not) {
    var pool = CARDS.filter(function (c) { return (!test || test(c)) && (!not || not.indexOf(c) < 0); });
    return shuffle(pool).slice(0, n);
  }
  var yes = { o: 'accepted' };
  function refuse(text) { G.msg = text; return { o: 'rejected', reason: text }; }

  // ---- the deck (design section 7) ----
  G.deckList = function () {
    var out = [];
    Object.keys(G.own).forEach(function (i) { for (var k = 0; k < G.own[i].copies; k++) out.push(CARDS[i]); });
    return out;
  };
  G.deckSize = function () { return G.deckList().length; };
  function gain(c) { var o = G.own[c.i]; if (!o) G.own[c.i] = { copies: 1, power: 0, el: null }; else if (o.copies < 3) o.copies++; }
  // A hand from the player's own deck; what the deck cannot supply is borrowed from the full pack.
  function fromDeck(n, test) {
    var got = shuffle(G.deckList().filter(function (c) { return !test || test(c); })).slice(0, n);
    return got.length < n ? got.concat(draw(n - got.length, test, got)) : got;
  }
  G.element = function (c) { var o = G.own[c.i]; return (o && o.el) || (isTrump(c) ? TRUMP_ELEMENT[c.i] : ELEMENT[c.suit]); };
  // More or less power: the card counts one higher or one lower.
  G.value = function (c) {
    var o = G.own[c.i], top = isTrump(c) ? 21 : c.n > 10 ? 14 : 10;
    return Math.max(1, Math.min(top, c.n + (o ? o.power : 0)));
  };
  function revert() { Object.keys(G.own).forEach(function (i) { G.own[i].el = null; }); }
  G.edit = function (what, i) {
    var o = G.own[i], c = CARDS[i];
    if (!G.reward) return refuse('No change to the deck is offered now.');
    if (!o) return refuse('That card is not in your deck.');
    if (what === 'copy') { if (o.copies >= 3) return refuse('You already hold three of ' + c.title + '.'); o.copies++; G.msg = 'A second hand has painted another ' + c.title + '.'; }
    else if (what === 'remove') {
      if (G.deckSize() <= 8) return refuse('The deck is too thin to lose a card.');
      if (--o.copies === 0) delete G.own[i];
      G.msg = c.title + ' is left behind.';
    } else {
      if (o.power) return refuse(c.title + ' is already enchanted.');
      o.power = what === 'more' ? 1 : -1; G.msg = c.title + ' is enchanted with ' + what + ' power. It now counts ' + G.value(c) + '.';
    }
    G.reward = false; G.edits[what] = (G.edits[what] || 0) + 1;
    return yes;
  };
  G.skipEdit = function () { G.reward = false; G.msg = 'You leave the deck as it is.'; };

  function say(text, r) { G.msg = text + (r && r.o !== 'accepted' ? ' (' + r.reason + ')' : ''); return r; }

  // Playing a card teaches what it carries (design section 9).
  function learn(key, text) { if (!seen[key]) { seen[key] = 1; G.lessons.push(text); } }
  function teach(c) {
    var C = M.correspondences;
    if (isTrump(c)) {
      if (seen['t' + c.i]) return;
      var fx = C.send('PlayTrump', 'Trump.' + TRUMPS[c.i]).fx[0];
      return learn('t' + c.i, c.title + ' is ' + fx.replace(/.*\.(\w+)\)/, '$1'));
    }
    var suit = 'Suit.' + cap(c.suit);
    if (C.send('PlaySuit', suit).o === 'accepted') learn(suit, cap(c.suit) + ' are ' + ELEMENT[c.suit]);
    if (isCourt(c)) {
      var rank = 'Rank.' + cap(c.rank);
      var r = C.send('PlayRank', rank);
      if (r.o === 'accepted') learn(rank, cap(c.rank) + 's are ' + r.fx[0].replace(/.*\.(\w+)\)/, '$1'));
      if (!seen['c' + c.i]) learn('c' + c.i, c.title + ' reads as ' + C.send('ReadCourt', rank, suit).fx[0].replace(/Court\(Element\.(\w+), Element\.(\w+)\)/, '$1 of $2'));
    } else if (!seen['n' + c.n]) {
      learn('n' + c.n, 'The number ' + c.n + ' is ' + C.send('PlayNumber', c.n).fx[0].replace(/.*\.(\w+)\)/, '$1').toLowerCase());
    }
  }

  G.mode = function (n) { return n === 0 ? 'Trick' : ['Numeric', 'Elemental', 'Character', 'Trick'][(n - 1) % 4]; };

  G.startChapter = function () {
    var n = M.journey.s.chapter, card = CARDS[n], secret = n === 1 ? SECRETS[0] : pick(SECRETS);
    G.ch = {
      card: card, mode: G.mode(n), reading: null, enc: null, encDone: false,
      secret: { kind: secret[0], text: secret[1], gloss: secret[2], found: false },
      spellHand: fromDeck(5), laid: {}, modifier: null, spellCast: false,
      hidden: shuffle([card].concat(draw(5, null, [card]))).map(function (c) { return { card: c, up: false }; })
    };
    G.msg = n === 0 ? 'You are ten years old, in a castle. In the great hall the nobles are playing a game with painted cards.' : '';
  };

  G.visitPsychic = function () {
    var r = M.chapter.send('VisitPsychic');
    if (r.o === 'accepted') G.ch.reading = draw(3);
    return say('The psychic lays three cards.', r);
  };

  // ---- encounters (design section 4) ----
  G.openEncounter = function () {
    var ch = G.ch, r = M.encounter.send('Open', 'Mode.' + ch.mode, ch.mode === 'Trick');
    if (r.o !== 'accepted') return say('The encounter is already open.', r);
    if (!M.journey.s.gameSeen) M.journey.send('WatchNobles');
    G.played[ch.mode] = (G.played[ch.mode] || 0) + 1;
    deal();
    return r;
  };
  function deal() {
    var ch = G.ch, e;
    if (ch.mode === 'Trick') {
      var hand, leads;
      if (M.journey.s.chapter === 0) {        // the nobles deal, and deal kindly
        var lead = pick(CARDS.filter(function (c) { return isPip(c) && c.n >= 2 && c.n <= 6; }));
        var answer = pick(CARDS.filter(function (c) { return c.suit === lead.suit && c.n > lead.n && c.n <= 10; }));
        hand = [answer].concat(draw(4, null, [lead, answer]));
        leads = [lead].concat(draw(2, function (c) { return !isTrump(c); }, hand.concat([lead])));
      } else {
        hand = fromDeck(5);
        leads = draw(3, function (c) { return !isTrump(c); }, hand);
      }
      e = { hand: shuffle(hand), k: 0, taken: 0, tricks: leads.map(function (c, i) { return { lead: c, rival: i > 0 && rnd() < 0.5 ? 1 + Math.floor(rnd() * 15) : 0 }; }) };
      e.goal = 'The nobles lead three tricks. Take at least one. Follow the suit led if you can; if you cannot, you must trump.';
      ch.enc = e; startTrick();
    } else if (ch.mode === 'Numeric') {
      var cards = fromDeck(5, isPip), sums = [], sum;
      for (var mask = 1; mask < 32; mask++) {
        var bits = 0, tot = 0;
        for (var b = 0; b < 5; b++) if (mask & (1 << b)) { bits++; tot += G.value(cards[b]); }
        if (bits >= 2 && bits <= 3 && tot >= 5 && tot <= 15) sums.push(tot);
      }
      sum = sums.length ? pick(sums) : Math.min(15, G.value(cards[0]));
      M.numeric.send('Pose', sum);
      e = { hand: shuffle(cards), goal: 'Play cards that add up to exactly ' + sum + '.' };
      ch.enc = e;
    } else if (ch.mode === 'Elemental') {
      M.surface.reset(); revert();
      var want = pick(['Explode', 'Zap']);
      e = { want: want, spoken: false, hand: fromDeck(5),
        goal: want === 'Explode' ? 'Make an explosion: earth leaves oil, fire sets it off.' : 'Make the ground zap: water, then air to charge it, then air again.' };
      ch.enc = e;
    } else {
      var who = fromDeck(1, function (c) { return isCourt(c) || isTrump(c); })[0], pips, tries = 0;
      do { pips = tries++ < 30 ? fromDeck(4, isPip) : draw(4, isPip); } while (!pips.some(function (c) { return c.suit === 'swords' || c.suit === 'pentacles'; }));
      e = { hand: shuffle([who].concat(pips)), who: null, goal: 'Stand a character, attach cards to it, and win one of four ways.' };
      ch.enc = e;
    }
  }
  function finish(text) {
    M.encounter.send('Resolve'); M.chapter.send('ResolveEncounter'); revert();
    G.ch.encDone = true; G.msg = text;
    if (M.journey.s.chapter === 0) {
      ['wands', 'cups', 'swords', 'pentacles'].forEach(function (s) { CARDS.forEach(function (c) { if (c.suit === s && (c.n === 2 || c.n === 5)) gain(c); }); });
      G.msg += ' A noble lets you keep eight low cards: the Two and the Five of each suit. They are your deck.';
    }
  }
  function take(hand, i) { return hand.splice(i, 1)[0]; }

  function startTrick() {
    var t = G.ch.enc.tricks[G.ch.enc.k];
    if (t.rival) M.trick.send('RivalTrumps', t.rival);
  }
  G.playTrick = function (i) {
    var e = G.ch.enc, t = e.tricks[e.k], c = e.hand[i], T = M.trick, r;
    var canFollow = e.hand.some(function (x) { return x.suit === t.lead.suit; });
    var hasTrump = e.hand.some(function (x) { return isTrump(x) && x.i > 0; });
    if (c.i === 0) r = T.send('PlayFool');
    else if (c.suit === t.lead.suit) r = T.send('Follow', canFollow);
    else if (isTrump(c)) r = T.send('Trump', G.value(c), canFollow);
    else r = T.send('Discard', canFollow, hasTrump);
    if (r.o !== 'accepted') return say('The nobles stop you.', r);
    var took = T.s.contends && (isTrump(c) || G.value(c) > t.lead.n);
    take(e.hand, i); teach(c); T.send('Gather');
    e.k++; if (took) e.taken++;
    G.msg = c.i === 0 ? 'The Fool is excused: it takes nothing and comes home.' : took ? 'You take the trick with ' + c.title + '.' : c.title + ' does not take the trick.';
    if (e.k < 3) startTrick();
    else if (e.taken > 0) finish('You have learned the nobles\' game.');
    else { deal(); G.msg = 'You took no trick. The nobles deal again.'; }
    return r;
  };
  G.playNumber = function (i) {
    var e = G.ch.enc, c = e.hand[i], v = G.value(c), r = M.numeric.send('Play', v);
    if (r.o !== 'accepted') return say(c.title + ' is refused.', r);
    take(e.hand, i); teach(c); G.msg = c.title + ' adds ' + v + '.';
    if (M.numeric.s.total === M.numeric.s.target) { M.numeric.send('Leave'); finish('The sum is exact.'); }
    return r;
  };
  G.withdraw = function () {
    var r = M.numeric.send('Withdraw');
    if (r.o === 'accepted') { deal(); G.msg = 'You take the cards back. A new number is posed.'; return r; }
    return say('There is nothing to take back.', r);
  };
  G.castElement = function (i) {
    var e = G.ch.enc, c = e.hand[i], el = G.element(c), r = M.surface.send('Cast', 'Element.' + el);
    if (r.o !== 'accepted') return say(el + ' does nothing here.', r);
    take(e.hand, i); teach(c);
    G.msg = el + ' is cast.' + (r.fx.length ? ' ' + r.fx[0] + '!' : '');
    if (r.fx[0] === e.want) finish(e.want === 'Explode' ? 'Fire on oil: the ground explodes.' : 'Air across charged water: it zaps.');
    return r;
  };
  // Water to Wine: a discovered incantation turns one card to another element until the encounter ends.
  G.speak = function (i, el) {
    var e = G.ch.enc, c = e.hand[i];
    if (!G.known) return refuse('You know no incantation yet.');
    if (e.spoken) return refuse('The incantation has been spoken once already here.');
    if (!G.own[c.i]) return refuse(c.title + ' is borrowed. It will not listen.');
    if (G.element(c) === el) return refuse(c.title + ' is ' + el + ' already.');
    var was = G.element(c);
    G.own[c.i].el = el; e.spoken = true; G.spoken++;
    G.msg = '"Aqua in vinum." ' + c.title + ' turns from ' + was + ' to ' + el + ' until this encounter ends.';
    return yes;
  };
  G.redeal = function () { deal(); G.msg = 'You gather the cards and start again on fresh ground.'; return yes; };
  // The next step toward the goal from here: { cast: index }, { speak: [index, element] } or null.
  G.planElemental = function () {
    var e = G.ch.enc, now = e.hand.map(G.element);
    function firstCast(els) {
      var best = null;
      (function go(ground, used, first, depth) {
        for (var i = 0; i < els.length && best === null; i++) {
          if (used & (1 << i)) continue;
          var r = surfaceCast({ ground: ground }, 'Element.' + els[i]);
          if (r.o !== 'accepted') continue;
          var f = first < 0 ? i : first;
          if (r.fx[0] === e.want) { best = f; return; }
          if (depth < 3) go(r.patch.ground || ground, used | (1 << i), f, depth + 1);
        }
      })(M.surface.s.ground, 0, -1, 1);
      return best;
    }
    var c = firstCast(now);
    if (c !== null) return { cast: c };
    if (G.known && !e.spoken) for (var i = 0; i < e.hand.length; i++) {
      if (!G.own[e.hand[i].i]) continue;
      for (var k = 0; k < 4; k++) {
        var el = ['Fire', 'Water', 'Air', 'Earth'][k];
        var then = now.map(function (x, j) { return e.hand[j].i === e.hand[i].i ? el : x; });
        if (el !== now[i] && firstCast(then) !== null) return { speak: [i, el] };
      }
    }
    return null;
  };
  G.playCharacter = function (i) {
    var e = G.ch.enc, c = e.hand[i], r;
    if (isPip(c) && M.character.s.standing) {
      r = M.character.send('Attach', 'Attribute.' + ATTRIBUTE[c.suit]);
      if (r.o !== 'accepted') return say('The character already has ' + ATTRIBUTE[c.suit].toLowerCase() + '.', r);
      take(e.hand, i); teach(c); G.msg = c.title + ' gives ' + e.who.title + ' ' + ATTRIBUTE[c.suit].toLowerCase() + '.';
      return r;
    }
    r = M.character.send('Stand', isTrump(c) ? 'Class.Trump' : isCourt(c) ? 'Class.Court' : 'Class.Pip');
    if (r.o !== 'accepted') return say(c.title + ' cannot stand as a character now.', r);
    take(e.hand, i); teach(c); e.who = c; G.msg = c.title + ' stands as your character.';
    return r;
  };
  G.claim = function (way) {
    var r = M.character.send('Win', 'Victory.' + way);
    if (r.o !== 'accepted') return say('Not yet.', r);
    M.character.send('Leave'); finish('You win by ' + (way === 'Impenetrable' ? 'being impenetrable' : way.toLowerCase()) + '.');
    return r;
  };

  // ---- phrase or symbol, then the spell as a three-card row (design sections 3 and 6) ----
  G.search = function () {
    var s = G.ch.secret, r = M.chapter.send(s.kind === 'Phrase' ? 'UncoverPhrase' : 'UncoverSymbol');
    if (r.o === 'accepted') s.found = true;
    if (r.o === 'accepted' && s.text === 'Aqua in vinum' && !G.known) {
      G.known = true; G.lessons.push('Water to Wine: an incantation that turns a card to another element for one encounter');
    }
    return say(s.kind === 'Phrase' ? 'Scratched into the wall: "' + s.text + '".' : 'Half hidden, you find ' + s.text + '.', r);
  };
  function spellKnown() { return M.chapter.s.secret !== 'Secret.Hidden' ? null : say('You do not know the spell yet.', M.chapter.send('CastSpell')); }
  G.lay = function (i) {
    var ch = G.ch, S = M.spread, refused = spellKnown();
    if (refused) return refused;
    if (!S.s.open) S.send('Choose', 'Shape.Row');
    var slot = ['Left', 'Centre', 'Right'].filter(function (p) { return !ch.laid[p]; })[0] || 'Right';
    var modified = S.s.pending, r = S.send('Lay', 'Slot.' + slot);
    if (r.o !== 'accepted') return say('That position is taken.', r);
    var c = take(ch.spellHand, i); teach(c);
    ch.laid[slot] = { card: c, changed: modified };
    return say(c.title + ' is laid ' + slot.toLowerCase() + (modified ? ', changed by ' + ch.modifier.title : '') + '.', r);
  };
  G.layModifier = function (i) {
    var ch = G.ch, S = M.spread, refused = spellKnown();
    if (refused) return refused;
    if (!S.s.open) S.send('Choose', 'Shape.Row');
    var r = S.send('LayModifier');
    if (r.o !== 'accepted') return say('A modifier needs a card to follow it.', r);
    ch.modifier = take(ch.spellHand, i);
    return say(ch.modifier.title + ' waits to change the next card laid.', r);
  };
  G.cast = function () {
    var refused = spellKnown();
    if (refused) return refused;
    var r = M.spread.send('Cast');
    if (r.o !== 'accepted') return say('The row is not full.', r);
    M.chapter.send('CastSpell'); G.ch.spellCast = true;
    return say('"' + G.ch.secret.text + '." The spell resolves and the table clears.', r);
  };

  G.flip = function (i) {
    var h = G.ch.hidden[i]; h.up = true;
    if (h.card !== G.ch.card) { G.msg = h.card.title + '. Not the one.'; return; }
    return say('You found ' + h.card.title + '.', M.chapter.send('FindHiddenCard'));
  };

  G.advance = function () {
    var r = M.chapter.send('Advance');
    if (r.o !== 'accepted') return say('The chapter is not finished.', r);
    var won = G.ch.card;
    M.journey.send('CompleteChapter'); gain(won);
    if (M.journey.s.chapter < 78) { G.startChapter(); G.reward = true; G.msg = won.title + ' joins your deck. Before the next chapter you may change one thing about it.'; }
    else { G.over = true; G.ch = null; G.msg = 'The journey is complete.'; }
    return r;
  };

  // Resume a saved journey: replay it into the journey machine.
  G.resume = function (n, saved) {
    if (n > 0) M.journey.send('WatchNobles');
    for (var i = 0; i < n; i++) M.journey.send('CompleteChapter');
    if (saved) { G.own = saved.own; G.known = saved.known; revert(); }
    if (n >= 78) { G.over = true; return; }
    G.startChapter();
  };

  // A scripted player that finishes the current chapter. Used by tools/playthrough.js and ?auto=N.
  G.botEncounter = function () {
    var ch = G.ch, e, i, guard = 0;
    G.openEncounter();
    while (!ch.encDone && guard++ < 500) {
      e = ch.enc;
      if (ch.mode === 'Trick') {
        var lead = e.tricks[e.k].lead;
        var order = e.hand.map(function (c, j) { return j; }).sort(function (x, y) {
          var score = function (c) { return c.i === 0 ? -1 : c.suit === lead.suit ? 100 + c.n : isTrump(c) ? 50 + c.n : 0; };
          return score(e.hand[y]) - score(e.hand[x]);
        });
        for (i = 0; i < order.length; i++) if (G.playTrick(order[i]).o === 'accepted') break;
      } else if (ch.mode === 'Numeric') {
        var left = M.numeric.s.target - M.numeric.s.total, best = null;
        for (var mask = 1; mask < (1 << e.hand.length); mask++) {
          var sum = 0; for (i = 0; i < e.hand.length; i++) if (mask & (1 << i)) sum += G.value(e.hand[i]);
          if (sum === left) { best = mask; break; }
        }
        if (best === null) G.withdraw();
        else for (i = 0; i < e.hand.length; i++) if (best & (1 << i)) { G.playNumber(i); break; }
      } else if (ch.mode === 'Elemental') {
        var plan = G.planElemental();
        if (!plan) G.redeal(); else if (plan.speak) G.speak(plan.speak[0], plan.speak[1]); else G.castElement(plan.cast);
      } else {
        if (!M.character.s.standing) G.playCharacter(e.hand.findIndex(function (c) { return !isPip(c); }));
        else if (e.hand.length && !e.tried) { for (i = e.hand.length - 1; i >= 0; i--) G.playCharacter(i); e.tried = true; }
        else ['Affection', 'Resources', 'Attack', 'Impenetrable'].some(function (w) { return G.claim(w).o === 'accepted'; });
      }
    }
    if (!ch.encDone) throw new Error('bot could not finish ' + ch.mode + ' encounter in chapter ' + M.journey.s.chapter);
  };
  G.botChapter = function () {
    var ch = G.ch, start = M.journey.s.chapter;
    if (G.reward) {
      var what = ['copy', 'more', 'less', 'remove', 'skip'][start % 5], mine = Object.keys(G.own).map(Number);
      var target = what === 'remove' ? mine.filter(function (i) { return G.own[i].copies > 1; })[0]
        : what === 'copy' ? mine.filter(function (i) { return G.own[i].copies < 3; })[0]
        : mine.filter(function (i) { return !G.own[i].power && isPip(CARDS[i]); })[0];
      if (what === 'skip' || target === undefined || G.edit(what, target).o !== 'accepted') G.skipEdit();
    }
    G.cast();                                   // refused: the spell is not known yet
    G.visitPsychic(); G.botEncounter(); G.search();
    G.lay(0); G.layModifier(0); G.lay(0); G.lay(0); G.cast();
    for (var i = 0; i < 6 && !M.chapter.s.found; i++) G.flip(i);
    G.advance();
    if (M.journey.s.chapter !== start + 1) throw new Error('bot did not finish chapter ' + start + ' (' + ch.card.title + '): ' + G.msg);
  };

  return G;
}
if (typeof module !== 'undefined') module.exports = makeGame;
