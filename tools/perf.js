// Frame times in a real (windowed) Chrome: the game runs on its own clock for a while at a few places.
//   node tools/perf.js [url]
import { launch } from './cdp.js';

const base = process.argv[2] ?? 'http://localhost:5173/';
const b = await launch({ port: 9343, headless: process.env.HEADLESS === '1' });
try {
  await b.goto(base + (base.includes('?') ? '&' : '?') + 'skip');
  await b.waitFor('!!(window.__game && window.__game.game.cards.ready)', 120000);
  for (const [name, x, z, yaw, pitch] of [['courtyard', 2, 22.5, 0.42, -0.03], ['gate', 0, 0.5, 0, -0.14], ['village', 12, -96, 3.0, 0.1], ['pond', -30, -66, 0.85, -0.1]]) {
    await b.eval(`__game.teleport(${x}, ${z}, ${yaw}, ${pitch}), 1`);
    await new Promise((r) => setTimeout(r, 1500));
    await b.eval('__game.frameStats(), 1');
    await new Promise((r) => setTimeout(r, 4000));
    const fs = await b.eval('__game.frameStats()');
    console.log(name.padEnd(10), 'avg', fs.avg.toFixed(1), 'ms  p50', fs.p50.toFixed(1), ' p95', fs.p95.toFixed(1), ' scale', fs.scale.toFixed(2), ' frames', fs.n);
  }
  console.log('errors:', b.errors.filter((e) => !e.includes('favicon')).length ? b.errors : 'none');
} finally {
  await b.close();
}
