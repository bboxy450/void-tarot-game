#!/usr/bin/env node
// Plays the real game in headless Chrome with real mouse clicks and key presses, over the
// DevTools protocol. No dependencies (Node 22+ for global fetch and WebSocket).
//
//   node tools/drive.js                 play 3 chapters quickly, exit non-zero on any error
//   node tools/drive.js --chapters=5
//   node tools/drive.js --shots=/tmp/void-tarot-shots   normal speed, save screenshots
//   node tools/drive.js --start=30 --shots=DIR          start from a debug run at chapter 30
//
// Fails on: any script exception, any console error, any failed request, any request that
// is not file://, a fight that does not end, fewer wins or reward picks than asked for.
var cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
var args = {};
process.argv.slice(2).forEach(function (a) { var m = a.match(/^--([^=]+)(?:=(.*))?$/); if (m) args[m[1]] = m[2] == null ? true : m[2]; });
var CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
var ROOT = path.resolve(__dirname, '..');
var SHOTS = args.shots ? path.resolve(String(args.shots)) : null;
var FAST = args.fast != null ? +args.fast : (SHOTS ? 1 : 0.3);
var CHAPTERS = +args.chapters || 3;
var PORT = 9300 + Math.floor(Math.random() * 600);
var W = +args.width || 1440, H = +args.height || 900;

var errors = [], requests = [], ws, seq = 0, pending = {}, chrome, profile, shotN = 0;
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function send(method, params) {
  return new Promise(function (res, rej) {
    var id = ++seq; pending[id] = { res: res, rej: rej, method: method };
    ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  });
}
async function ev(expr) {
  var r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('evaluate failed: ' + expr + ' -> ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
  return r.result.value;
}
async function waitFor(expr, ms, what) {
  var t0 = Date.now();
  while (Date.now() - t0 < (ms || 20000)) { if (await ev(expr)) return true; await sleep(60); }
  throw new Error('timed out waiting for ' + (what || expr));
}
async function move(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x, y: y }); }
async function click(x, y) {
  await move(x, y); await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x, y: y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x, y: y, button: 'left', clickCount: 1 });
}
async function key(k, code, vk) {
  var p = { key: k, code: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: k.length === 1 ? k : undefined };
  await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, p));
  await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, p));
}
async function center(sel) {
  var p = await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return null;var r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,r.width,r.height];})()');
  if (!p) throw new Error('no element ' + sel);
  return p;
}
async function clickSel(sel, dx) { var p = await center(sel); await click(p[0] + (dx || 0), Math.min(p[1], H - 16)); }
async function shot(name) {
  if (!SHOTS) return;
  var r = await send('Page.captureScreenshot', { format: 'png' });
  var file = path.join(SHOTS, String(++shotN).padStart(2, '0') + '-' + name + '.png');
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('  shot ' + file);
}
function say(s) { console.log(s); }

async function playFight(n, opts) {
  await waitFor('VT.screen==="fight" && VT.Fight.state() && !VT.Fight.state().busy', 30000, 'fight ready');
  var st = await ev('VT.Fight.state()');
  say('chapter ' + (st.chapter + 1) + ': fight begins, shade ' + st.shade + ', you ' + st.hp);
  if (n === 0) { await sleep(SHOTS ? 500 : 0); await shot('fight-at-rest'); }
  var turns = 0, usedKeys = false;
  while (turns++ < 60) {
    st = await ev('VT.Fight.state()');
    if (!st || st.over) break;
    // the tutorial points at cards: follow it, like a first-time player would
    var hinted = await ev('Array.prototype.map.call(document.querySelectorAll(".card.hinted"),function(e){return +e.getAttribute("data-uid")})');
    var want = hinted.length ? hinted : st.suggest;
    if (hinted.length) want = st.hand.filter(function (u) { return hinted.indexOf(u) >= 0; }).sort(function (a, b) { return hinted.indexOf(a) - hinted.indexOf(b); });
    if (hinted.length && st.chapter === 0) want = await ev('(function(){var a=[];[66,26].forEach(function(id){var e=Array.prototype.filter.call(document.querySelectorAll(".card.hinted"),function(c){return c._inst.id===id})[0];if(e)a.push(+e.getAttribute("data-uid"))});return a})()');
    if (hinted.length && st.chapter === 1) want = await ev('(function(){var a=[];[38,52,54].forEach(function(id){var e=Array.prototype.filter.call(document.querySelectorAll(".card.hinted"),function(c){return c._inst.id===id})[0];if(e)a.push(+e.getAttribute("data-uid"))});return a})()');
    for (var i = 0; i < want.length; i++) {
      if (!usedKeys && turns === 2 && i === 0) {            // once, lay a card with the keyboard
        var idx = st.hand.indexOf(want[i]) + 1;
        await key(String(idx), 'Digit' + idx, 48 + idx); usedKeys = true;
      } else {
        await clickSel('.card[data-uid="' + want[i] + '"]', -34);
      }
      await sleep(Math.max(120, 420 * FAST));
      if (n === 0 && turns === 1 && i === 0) { await move(700, 300); }
    }
    var sp = await ev('VT.Fight.state().spread');
    if (JSON.stringify(sp) !== JSON.stringify(want)) throw new Error('spread is ' + JSON.stringify(sp) + ' but clicked ' + JSON.stringify(want));
    if (opts.hoverShot && turns === 1 && want.length) {
      var rest = st.hand.filter(function (u) { return want.indexOf(u) < 0; });
      if (rest.length) { var p = await center('.card[data-uid="' + rest[0] + '"]'); await move(p[0] - 34, Math.min(p[1], H - 30)); await sleep(500); await shot('hover-tooltip'); await move(700, 560); await sleep(200); }
      await shot('spread-laid');
    }
    if (turns % 2) await clickSel('#btn-cast'); else await key('Enter', 'Enter', 13);
    if (SHOTS) {                                            // frames during the cast, the Shade's answer and its death
      var k = 0, dk = 0;
      for (;;) {
        await sleep(140);
        var s2 = await ev('VT.screen==="fight" && VT.Fight.state() ? {busy:VT.Fight.state().busy, over:VT.Fight.state().over} : null');
        if (!s2) break;
        if (s2.over === 'win') { if (dk < 9 && opts.deathShots) await shot('ch' + (st.chapter + 1) + '-death-' + (dk++)); }
        else if (opts.castShots && turns <= opts.castShots && k < 22) await shot('ch' + (st.chapter + 1) + '-t' + turns + '-cast-' + String(k++).padStart(2, '0'));
        if (!s2.busy || s2.over === 'lose') break;
      }
    }
    await waitFor('VT.screen!=="fight" || !VT.Fight.state() || !VT.Fight.state().busy || VT.Fight.state().over', 60000, 'turn to finish');
    if (await ev('VT.screen!=="fight"')) break;
  }
  st = await ev('VT.screen==="fight" ? VT.Fight.state() : null');
  if (st && st.over === 'lose') { say('  lost; rising again'); await sleep(1500 * FAST + 400); await shot('defeat'); await clickSel('#btn-retry'); return playFight(n, {}); }
  if (st && !st.over) throw new Error('fight did not end in 60 turns');
  return turns;
}

async function main() {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-drive-'));
  chrome = cp.spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--window-size=' + W + ',' + H,
    '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  var target = null;
  for (var i = 0; i < 100 && !target; i++) {
    await sleep(150);
    try { var list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json(); target = list.filter(function (t) { return t.type === 'page'; })[0]; } catch (e) { /* not up yet */ }
  }
  if (!target) throw new Error('Chrome did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(function (res, rej) { ws.onopen = res; ws.onerror = function () { rej(new Error('websocket failed')); }; });
  ws.onmessage = function (m) {
    var d = JSON.parse(m.data);
    if (d.id) { var p = pending[d.id]; delete pending[d.id]; if (p) { if (d.error) p.rej(new Error(p.method + ': ' + d.error.message)); else p.res(d.result); } return; }
    if (d.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text));
    if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'assert')) errors.push('console.error: ' + d.params.args.map(function (a) { return a.value || a.description; }).join(' '));
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push('log: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
    if (d.method === 'Network.requestWillBeSent') { var u = d.params.request.url; requests.push(u); if (!/^(file:|data:|about:)/.test(u)) errors.push('non-local request: ' + u); }
    if (d.method === 'Network.loadingFailed') errors.push('request failed: ' + d.params.errorText + ' (' + d.params.requestId + ')');
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  var q = ['fast=' + FAST];
  if (args.start != null) q.push('chapter=' + args.start);
  if (args.seed != null) q.push('seed=' + args.seed);
  var url = 'file://' + ROOT + '/index.html?' + q.join('&');
  say('open ' + url);
  await send('Page.navigate', { url: url });
  await waitFor('typeof VT!=="undefined" && VT.screen && !VT.busy', 20000, 'game to boot');

  var wins = 0, picks = 0;
  if (args.start == null) {
    if ((await ev('VT.screen')) !== 'title') throw new Error('expected the title screen');
    await sleep(2600 * FAST + 300); await shot('title');
    await clickSel('#btn-mute'); if (!(await ev('VTAudio.isMuted()'))) throw new Error('mute toggle did not mute');
    await clickSel('#btn-mute'); if (await ev('VTAudio.isMuted()')) throw new Error('mute toggle did not unmute');
    await clickSel('#btn-new');
    await waitFor('VT.screen==="map" && !VT.busy', 20000, 'map');
    if ((await ev('VTAudio.state()')) === 'none') throw new Error('audio did not start on the first gesture');
    await sleep(1800 * FAST + 300); await shot('map');
    await clickSel('#btn-deck'); await waitFor('VT.overlayOpen', 5000, 'deck overlay'); await sleep(500 * FAST + 200); await shot('deck');
    await key('Escape', 'Escape', 27); await waitFor('!VT.overlayOpen', 5000, 'deck overlay to close');
    await clickSel('#btn-enter');
  }
  for (var n = 0; n < CHAPTERS; n++) {
    var turns = await playFight(n, { hoverShot: n === 0 || args.start != null, castShots: n < 2 || args.start != null ? (+args.casts || 2) : 0, deathShots: n === 0 || args.start != null });
    await waitFor('VT.screen==="reward" && !VT.busy', 30000, 'reward screen');
    wins++;
    say('  won in ' + turns + ' turns');
    await waitFor('document.querySelectorAll(".card.r-card:not(.down)").length>=1', 20000, 'reward cards');
    await sleep(1400 * FAST + 300);
    if (n === 0) { await shot('reward'); var rp = await center('.card.r-card[data-offer="1"]'); await move(rp[0], rp[1]); await sleep(300); await shot('reward-hover'); }
    await clickSel('.card.r-card[data-offer="0"]'); picks++;
    await waitFor('VT.screen==="map" || VT.overlayOpen', 30000, 'map or altar');
    if (await ev('VT.overlayOpen')) {
      await sleep(600 * FAST + 200); await shot('altar');
      await clickSel('.thumb.pickable'); await sleep(200); await clickSel('#btn-burn');
      say('  burned a card at the altar');
    }
    await waitFor('VT.screen==="map" && !VT.busy && !document.querySelector(".m-panel.wait")', 30000, 'arrival on the map');
    if (n === 0) { await sleep(300); await shot('map-arrived'); }
    if ((await ev('VT.run.chapter')) !== (+(args.start || 0)) + n + 1) throw new Error('chapter did not advance');
    if (n < CHAPTERS - 1) await key(' ', 'Space', 32);
  }
  var saved = args.start == null ? await ev('!!localStorage.getItem("voidtarot.save.v1")') : true;
  if (!saved) errors.push('progress was not saved to localStorage');
  var played = await ev('Object.keys(VTAudio.played).length'), audio = await ev('VTAudio.state()');
  var pageErrors = await ev('VT.errors');
  pageErrors.forEach(function (e) { errors.push('page: ' + e); });
  say('\nwins ' + wins + ', reward picks ' + picks + ', requests ' + requests.length + ' (all local), sounds triggered ' + played + ' kinds, audio context ' + audio);
  if (wins < CHAPTERS) errors.push('only ' + wins + ' wins');
  if (errors.length) { say('\nFAILED'); errors.forEach(function (e) { say('  ' + e); }); return 1; }
  say('OK: no script errors, no failed or non-local requests');
  return 0;
}

main().then(function (code) { done(code); }, function (e) { console.error('FAILED: ' + e.message); errors.forEach(function (x) { console.error('  ' + x); }); done(1); });
function done(code) {
  try { if (ws) ws.close(); } catch (e) { /* closing */ }
  try { if (chrome) chrome.kill('SIGKILL'); } catch (e) { /* gone */ }
  setTimeout(function () { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* tmp */ } process.exit(code); }, 300);
}
