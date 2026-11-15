#!/usr/bin/env node
// Plays the whole campaign without a screen and writes each rule machine's Den trace.
// Usage: node tools/playthrough.js [out-dir] [seed]
var fs = require('fs'), path = require('path');
var makeGame = require('../src/game.js');
var out = process.argv[2] || '/tmp/vtg-traces', seed = Number(process.argv[3] || 1);

var G = makeGame(seed);
G.startChapter();
for (var i = 0; i < 78; i++) G.botChapter();

var j = G.M.journey.s;
if (!(G.over && j.chapter === 78 && j.age === 36 && G.deck.length === 78)) {
  console.error('FAIL: journey ended at', JSON.stringify(j), 'deck', G.deck.length); process.exit(1);
}
if (['Trick', 'Numeric', 'Elemental', 'Character'].some(function (m) { return !G.played[m]; })) {
  console.error('FAIL: a mode was never played', JSON.stringify(G.played)); process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
var lines = 0;
Object.keys(G.M).forEach(function (name) {
  G.M[name].traces.filter(function (t) { return t.length; }).forEach(function (t, k) {
    fs.writeFileSync(path.join(out, name + '.' + k + '.trace'), t.join('\n') + '\n'); lines += t.length;
  });
});
console.log('ok: 78 chapters, age ' + j.age + ', deck ' + G.deck.length + ', encounters ' + JSON.stringify(G.played) +
  ', lessons ' + G.lessons.length + ', ' + lines + ' trace lines in ' + out);
