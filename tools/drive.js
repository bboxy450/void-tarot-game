// Drives the game in headless Chrome: walks, takes a card, casts every element, sets off an explosion
// and a zap, meets a Shade, sits with the seer; writes screenshots and fails on any script error.
//   node tools/drive.js [url] [outDir]
// Start the game first (pnpm dev, or pnpm build && pnpm preview). Default url: http://localhost:5173/
import { launch } from './cdp.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? '/tmp/void-tarot-world-shots';
mkdirSync(out, { recursive: true });
const url = base + (base.includes('?') ? '&' : '?') + 'shots';

const b = await launch({ port: 9341 });
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
const g = (expr) => b.eval(`(() => { const G = __game, game = G.game; return (${expr}); })()`);
const tick = (n = 1, dt = 1 / 60) => g(`G.tick(${dt}, ${n}), 1`);
const shot = async (name) => { const f = await b.shot(join(out, name + '.png')); console.log('     shot', f); };
const key = async (code, key, vk, hold = 0) => {
  await b.key('keyDown', key, code, vk);
  if (hold) await tick(hold);
  await b.key('keyUp', key, code, vk);
};

try {
  await b.goto(url);
  await b.waitFor('!!(window.__game && window.__game.game.cards.ready)', 120000);
  console.log('dabs', JSON.stringify(await g('G.counts')), 'build ms', Math.round(await g('G.buildMs')));

  // the castle courtyard at dusk
  await g('G.start()');
  await tick(30);
  await shot('01-castle-start');

  // walk: hold W for a second
  const before = await g('({x: G.player.pos.x, z: G.player.pos.z})');
  await b.key('keyDown', 'w', 'KeyW', 87);
  await tick(60);
  await b.key('keyUp', 'w', 'KeyW', 87);
  const after = await g('({x: G.player.pos.x, z: G.player.pos.z})');
  check(Math.hypot(after.x - before.x, after.z - before.z) > 2, `walked ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(2)} m`);

  // the valley from the gate
  await g('G.teleport(0, 0.5, 0.0, -0.16)');
  await tick(20);
  await shot('02-gate-valley');

  // the first card, just outside the gate
  await g('G.teleport(2.4, 0.9, 0.0, -0.25)');
  await tick(10);
  await shot('03-card-glowing');
  await key('KeyE', 'e', 69);
  await tick(14);
  await shot('04-card-pickup');
  check((await g('game.cards.found.length')) === 1, 'picked up a card with E');

  // down the road, the village, the castle behind, the pond
  await g('G.teleport(-10, -36, 0.55, -0.08)'); await tick(10); await shot('05-down-the-path');
  await g('G.teleport(12, -96, 3.0, 0.1)'); await tick(10); await shot('06-village-and-castle');
  await g('G.teleport(-30, -66, 0.85, -0.1)'); await tick(10); await shot('07-pond');

  // fire on oil: EXPLOSION
  await g('G.give(64), G.give(22), G.give(36), G.give(50), G.give(16), G.give(19), G.give(17)');
  await g('G.teleport(4, -50, 0.0, -0.12)');
  await g('G.select(64), G.castAt(4, -61)');
  await tick(50);
  await shot('08-oil-patch');
  const oil = await g('game.spells.patches.filter(p => p.kind === "oil").length');
  check(oil >= 1, 'earth left an oil patch');
  await g('G.select(22), G.castAt(4, -61)');
  for (let i = 0; i < 10; i++) { await tick(i === 0 ? 4 : 7); await shot(`09-explosion-${String(i).padStart(2, '0')}`); }
  check((await g('game.spells.patches.filter(p => p.kind === "oil").length')) === 0, 'fire on oil exploded (the oil is gone)');

  // air on water, then the zap
  await g('G.teleport(-16, -58, 0.5, -0.12)');
  await g('G.select(36), G.castAt(-21, -67)');
  await tick(50);
  await g('G.select(50), G.castAt(-21, -67)');
  await tick(40);
  check((await g('game.spells.patches.filter(p => p.kind === "charged").length')) >= 1, 'air on water charged it');
  await shot('10-charged-water');
  await g('G.select(36), G.castAt(-21, -67)');
  for (let i = 0; i < 8; i++) { await tick(i === 0 ? 3 : 6); await shot(`11-zap-${String(i).padStart(2, '0')}`); }
  check((await g('game.spells.patches.filter(p => p.kind === "charged").length')) === 0, 'touching the charged water zapped it');

  // every element thrown from the hand
  await g('G.teleport(-26, -60, 0.9, -0.06)');
  for (const c of [22, 36, 50, 64]) { await g(`G.select(${c}), G.cast()`); await tick(30); }
  await shot('12-cast-elements');

  // a Shade
  const sh = await g('(() => { const s = game.shades.list[0]; return {x: s.pos.x, z: s.pos.z}; })()');
  await g(`G.teleport(${sh.x + 6}, ${sh.z + 6}, ${Math.atan2(6, 6)}, 0.0)`);
  await tick(50);
  await shot('13-shade');
  await g('G.select(22)');
  for (let i = 0; i < 4; i++) { await g('G.cast()'); await tick(30); }
  await tick(10);
  await shot('14-shade-hit');
  const hp = await g('game.shades.list[0].hp');
  check(hp < 5, `the Shade took hits (hp ${hp})`);

  // the Tower and the Sun
  await g('G.teleport(-4, -110, 0.2, -0.05)');
  await g('G.select(16), G.castAt(-6, -124)');
  await tick(8);
  await shot('15-tower');
  await tick(60);
  await g('G.select(19), G.cast()');
  await tick(120);
  await shot('16-sun');
  await tick(60 * 25);

  // the seer
  await g('G.teleport(69.6, -103.4, -1.75, -0.05)');
  await tick(20);
  await shot('17-seer-tent');
  await key('KeyE', 'e', 69);
  await tick(30);
  await new Promise((r) => setTimeout(r, 2600));
  await tick(2);
  await shot('18-reading');
  check(await g('game.hud.readingOpen'), 'the seer reads three cards');
  await key('KeyE', 'e', 69);

  // standing stones at the far end
  await g('G.teleport(-14, -160, 0.08, 0.02)');
  await tick(20);
  await shot('19-standing-stones');

  // frame time (headless: pessimistic)
  await g('G.teleport(0, 0.5, 0.0, -0.12)');
  const ms = await g('G.bench(60)');
  console.log('bench ms/frame at the gate', ms.toFixed(2));
  const ms2 = await g('(G.teleport(12, -96, 3.0, 0.1), G.bench(60))');
  console.log('bench ms/frame in the village', ms2.toFixed(2));

  // the title, then the game running on its own clock: frame times from requestAnimationFrame
  await b.goto(base);
  await b.waitFor('!!(window.__game && window.__game.game.cards.ready)', 120000);
  await new Promise((r) => setTimeout(r, 1500));
  await shot('00-title');
  await b.click(720, 450);
  await new Promise((r) => setTimeout(r, 2500));
  await shot('20-after-title');
  await g('G.frameStats()');
  await new Promise((r) => setTimeout(r, 6000));
  const fs = await g('G.frameStats()');
  console.log('rAF frame ms (headless, adaptive scale): avg', fs.avg.toFixed(1), 'p50', fs.p50.toFixed(1), 'p95', fs.p95.toFixed(1), 'scale', fs.scale.toFixed(2), 'frames', fs.n);
} catch (e) {
  fails.push(String(e));
  console.error(e);
} finally {
  const errs = b.errors.filter((e) => !e.includes('favicon'));
  console.log('script errors:', errs.length ? errs : 'none');
  if (errs.length) fails.push(...errs);
  await b.close();
}
console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL OK');
process.exit(fails.length ? 1 : 0);
