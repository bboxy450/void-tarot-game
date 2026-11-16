#!/usr/bin/env node
// Balance check. Plays whole campaigns with two bots and prints, per stretch of
// chapters, how often the first attempt at a chapter is won.
//   node tools/sim.js [runs=8] [seed=1]
// greedy     = lays whatever deals the most damage right now, ignores the Shade.
// thoughtful = one-turn lookahead that also weighs the blow that is coming.
// Exit 0 when the balance targets below hold.
var Core = require('../src/core.js');
if (process.env.VT_T) Object.assign(Core.T, JSON.parse(process.env.VT_T));
var RUNS = +process.argv[2] || 8, SEED = +process.argv[3] || 1;

var lostCards = 0;
function greedy(p) { return (p.kills ? 1e6 : 0) + p.total.dmg + p.total.ward * 0.01; }

function playFight(run, score) {
  var f = Core.startFight(run), guard = 0, n0 = f.draw.length, purged = 0;
  while (!f.over && guard++ < 200) {
    Core.startTurn(f);
    var pick = Core.suggest(f, score);
    f.hand.forEach(function (c) { if (c.rev && pick.indexOf(c.uid) >= 0) purged++; });
    Core.cast(f, pick);
    if (!f.over) Core.shadeTurn(f);
    // every card instance ever made is in exactly one pile, or was purged
    if (f.draw.length + f.discard.length + f.hand.length + f.keep.length !== f.uid - 1 - purged) lostCards++;
  }
  if (!f.over) f.over = 'lose';
  return f;
}
function pickReward(run, smart) {
  var o = run.offer;
  if (!smart) return o[0];
  var best = o[0], bs = -1;
  o.forEach(function (id) {
    var c = Core.CARDS[id], s = c.kind === 'trump' ? 6 : c.kind === 'court' ? 5 : c.num;
    if (run.deck.length > 26 && c.kind === 'pip' && c.num < 6) s = 0;
    if (s > bs) { bs = s; best = id; }
  });
  return bs <= 0 ? null : best;
}
function campaign(seed, score, smart) {
  var run = Core.newRun(seed), first = [], tries = [], turns = [];
  while (run.chapter < 78) {
    var ch = run.chapter, n = 0, f;
    do { f = playFight(run, score); n++; if (f.over !== 'win') Core.loseFight(run); } while (f.over !== 'win' && n < 30);
    first[ch] = n === 1 ? 1 : 0; tries[ch] = n; turns[ch] = f.turn;
    Core.winFight(run, f);
    Core.takeReward(run, pickReward(run, smart));
    if (run.phase === 'altar' && smart) {
      var low = null;
      run.deck.forEach(function (id) { var c = Core.CARDS[id]; if (c.kind === 'pip' && (low == null || c.num < Core.CARDS[low].num)) low = id; });
      if (low != null && run.deck.length > 14) Core.removeCard(run, low);
    }
    Core.advance(run);
  }
  return { first: first, tries: tries, turns: turns, deck: run.deck.length };
}
function table(name, score, smart) {
  var R = [], t0 = Date.now();
  for (var i = 0; i < RUNS; i++) R.push(campaign(SEED * 1000 + i + 1, score, smart));
  var bands = [[0, 2], [3, 9], [10, 21], [22, 35], [36, 49], [50, 63], [64, 77]], out = [];
  console.log('\n' + name + ' bot, ' + RUNS + ' campaigns (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
  console.log('chapters   first-try win   avg tries   avg turns');
  bands.forEach(function (b) {
    var w = 0, n = 0, tr = 0, tu = 0;
    R.forEach(function (r) { for (var c = b[0]; c <= b[1]; c++) { w += r.first[c]; tr += r.tries[c]; tu += r.turns[c]; n++; } });
    out.push(w / n);
    console.log((b[0] + '-' + b[1]).padEnd(11) + (100 * w / n).toFixed(1).padStart(8) + '%' + (tr / n).toFixed(2).padStart(15) + (tu / n).toFixed(1).padStart(12));
  });
  var line = '';
  for (var c = 0; c < 78; c++) { var w2 = 0; R.forEach(function (r) { w2 += r.first[c]; }); line += Math.min(9, Math.floor(10 * w2 / RUNS)); }
  console.log('per chapter (tenths, 9 = 90%+): ' + line);
  var losses = 0; R.forEach(function (r) { r.tries.forEach(function (t) { losses += t - 1; }); });
  console.log('losses per campaign: ' + (losses / RUNS).toFixed(1) + ', final deck ' + (R.reduce(function (a, r) { return a + r.deck; }, 0) / RUNS).toFixed(0));
  return { bands: out, losses: losses / RUNS };
}
var g = table('greedy', greedy, false);
var t = table('thoughtful', Core.thoughtful, true);
var checks = [
  ['first three chapters nearly unlosable for greedy (>= 97%)', g.bands[0] >= 0.97],
  ['greedy loses fights in the middle game (10-49 below 90%)', (g.bands[2] + g.bands[3] + g.bands[4]) / 3 < 0.90],
  ['greedy loses fights in the late game (50-77 below 85%)', (g.bands[5] + g.bands[6]) / 2 < 0.85],
  ['greedy is not walled (every band >= 35%)', Math.min.apply(null, g.bands) >= 0.35],
  ['thoughtful play wins (every band >= 85%)', Math.min.apply(null, t.bands) >= 0.85],
  ['thoughtful beats greedy overall', t.losses < g.losses],
  ['no card is ever lost or duplicated in a fight', lostCards === 0]
];
var ok = true;
console.log('');
checks.forEach(function (c) { console.log((c[1] ? 'PASS  ' : 'FAIL  ') + c[0]); if (!c[1]) ok = false; });
process.exit(ok ? 0 : 1);
