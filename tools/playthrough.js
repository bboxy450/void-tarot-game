#!/usr/bin/env node
// Plays the whole campaign without a screen. Usage: node tools/playthrough.js [seed ...]
var makeGame = require('../src/game.js');
var seeds = process.argv.slice(2).map(Number); if (!seeds.length) seeds = [1];
seeds.forEach(function (seed) {
  var G = makeGame(seed);
  G.startChapter();
  for (var i = 0; i < 78; i++) G.botChapter();
  var j = G.M.journey.s, fail = [];
  if (!(G.over && j.chapter === 78 && j.age === 36)) fail.push('journey ended at ' + JSON.stringify(j));
  ['Trick', 'Numeric', 'Elemental', 'Character'].forEach(function (m) { if (!G.played[m]) fail.push('never played ' + m); });
  ['copy', 'remove', 'more', 'less'].forEach(function (e) { if (!G.edits[e]) fail.push('never made edit ' + e); });
  if (!G.spoken) fail.push('incantation never spoken');
  if (Object.keys(G.own).some(function (i) { return G.own[i].el; })) fail.push('a card kept a changed element');
  if (fail.length) { console.error('FAIL seed ' + seed + ': ' + fail.join('; ')); process.exit(1); }
  console.log('ok seed ' + seed + ': 78 chapters, age ' + j.age + ', deck ' + G.deckSize() + ' cards (' + Object.keys(G.own).length + ' different), encounters ' +
    JSON.stringify(G.played) + ', edits ' + JSON.stringify(G.edits) + ', incantation spoken ' + G.spoken + ' times');
});
