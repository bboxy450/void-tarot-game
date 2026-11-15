#!/usr/bin/env node
// Opens index.html in headless Chrome and plays chapters by clicking the page.
// Usage: node tools/drive-chrome.js [chapters=5] [screenshot.png]
var { spawn } = require('child_process'), path = require('path'), fs = require('fs'), os = require('os');
var CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
var chapters = Number(process.argv[2] || 5), shot = process.argv[3];
var url = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?fresh=1&seed=11';
var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vtg-chrome-'));
var chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9333', '--user-data-dir=' + profile, '--window-size=1400,1600', 'about:blank'], { stdio: 'ignore' });

// Runs inside the page: one chapter, by clicking what a player would click.
function playChapter() {
  var click = function (a) { var el = document.querySelector('[data-a="' + a + '"]'); if (!el) throw new Error('no element ' + a + ' / ' + G.msg); el.click(); };
  var ch = G.ch, mode = ch.mode, before = G.M.journey.s.chapter, i, guard = 0;
  click('advance');
  if (!/ChapterUnfinished/.test(document.getElementById('msg').textContent)) throw new Error('early leave was not refused on screen');
  click('visitPsychic'); click('openEncounter');
  while (!ch.encDone && guard++ < 300) {
    var e = ch.enc, n = e.hand.length, moved = function () { return ch.encDone || ch.enc !== e || e.hand.length < n; };
    if (mode === 'Trick') { for (i = 0; i < n; i++) { click('playTrick:' + i); if (moved()) break; } }
    else if (mode === 'Numeric') {
      var left = G.M.numeric.s.target - G.M.numeric.s.total, pickI = -1;
      for (var mask = 1; mask < (1 << n) && pickI < 0; mask++) { var s = 0, f = -1; for (i = 0; i < n; i++) if (mask & (1 << i)) { s += ch.enc.hand[i].n; if (f < 0) f = i; } if (s === left) pickI = f; }
      click(pickI < 0 ? 'withdraw' : 'playNumber:' + pickI);
    }
    else if (mode === 'Elemental') { for (i = 0; i < n; i++) { click('castElement:' + i); if (moved()) break; } }
    else if (!G.M.character.s.standing) click('playCharacter:' + ch.enc.hand.findIndex(function (c) { return c.suit === 'major' || c.n > 10; }));
    else if (n && !ch.enc.tried) { for (i = n - 1; i >= 0; i--) click('playCharacter:' + i); ch.enc.tried = 1; }
    else ['Affection', 'Resources', 'Attack', 'Impenetrable'].some(function (w) { click('claim:' + w); return ch.encDone; });
  }
  click('search'); click('spell:0'); click('modifier'); click('spell:0'); click('spell:0'); click('spell:0'); click('cast');
  for (i = 0; i < 6 && !G.M.chapter.s.found; i++) click('flip:' + i);
  click('advance');
  if (G.M.journey.s.chapter !== before + 1) throw new Error('chapter ' + before + ' not left: ' + G.msg);
  return mode + ' (' + ch.card.title + ')';
}

(async function () {
  var target;
  for (var t = 0; t < 50 && !target; t++) {
    await new Promise(function (r) { setTimeout(r, 200); });
    try { target = (await (await fetch('http://127.0.0.1:9333/json')).json()).find(function (x) { return x.type === 'page'; }); } catch (e) {}
  }
  if (!target) throw new Error('Chrome did not start');
  var ws = new WebSocket(target.webSocketDebuggerUrl), id = 0, waiting = {}, errors = [], requests = [];
  await new Promise(function (r) { ws.onopen = r; });
  ws.onmessage = function (m) {
    var d = JSON.parse(m.data);
    if (d.id && waiting[d.id]) waiting[d.id](d);
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(JSON.stringify(d.params.args));
    if (d.method === 'Network.requestWillBeSent') requests.push(d.params.request.url);
    if (d.method === 'Network.loadingFailed') errors.push('load failed: ' + d.params.requestId + ' ' + d.params.errorText);
  };
  var send = function (method, params) { return new Promise(function (r) { waiting[++id] = r; ws.send(JSON.stringify({ id: id, method: method, params: params || {} })); }); };
  var evaluate = async function (expr) {
    var r = (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result;
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception.description);
    return r.result.value;
  };
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Page.navigate', { url: url });
  await new Promise(function (r) { setTimeout(r, 1500); });
  var played = [];
  for (var c = 0; c < chapters; c++) played.push(await evaluate('(' + playChapter + ')()'));
  var head = await evaluate('document.getElementById("head").textContent');
  var images = await evaluate('[].slice.call(document.images).filter(function(i){return !i.complete || !i.naturalWidth}).length');
  if (shot) fs.writeFileSync(shot, Buffer.from((await send('Page.captureScreenshot')).result.data, 'base64'));
  var remote = requests.filter(function (u) { return !/^(file|data|about):/.test(u); });
  ws.close(); chrome.kill();
  console.log('played by clicking:', played.join(', '));
  console.log('header:', head.replace(/\s+/g, ' '));
  console.log('requests:', requests.length, 'non-local:', remote.length, 'broken images:', images, 'script errors:', errors.length);
  if (errors.length) console.error(errors.join('\n'));
  process.exit(errors.length || remote.length || images ? 1 : 0);
})().catch(function (e) { console.error('FAIL:', e.message); chrome.kill(); process.exit(1); });
