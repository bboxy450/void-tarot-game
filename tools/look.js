// Look at the game from a few places. Usage:
//   node tools/look.js [url] [outDir] [view ...]   view = name:x,z,yaw,pitch[,ticks]
// Without views, a standard set. Writes PNGs and prints errors and counts.
import { launch } from './cdp.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5199/?shots';
const out = process.argv[3] ?? '/tmp/void-tarot-world-shots/look';
mkdirSync(out, { recursive: true });
const views = process.argv.slice(4);
const std = [
  'start:6,27.4,0.45,-0.03',
  'gate:0,1,0.0,-0.1',
  'down:-9,-38,0.6,-0.06',
  'village:12,-70,0.1,-0.03',
  'castle:10,-95,3.14,0.12',
  'pond:-30,-70,0.9,-0.08',
  'tent:58,-97,-1.6,-0.04',
  'stones:-12,-160,0.1,0.0',
];
const list = views.length ? views : std;

const b = await launch({ port: 9335 });
try {
  await b.goto(url);
  await b.waitFor('!!(window.__game && window.__game.world && window.__game.game.hands.sprites)');
  const info = await b.eval('({counts: __game.counts, buildMs: __game.buildMs})');
  console.log(JSON.stringify(info));
  for (const v of list) {
    const [name, rest] = v.split(':');
    const [x, z, yaw, pitch, ticks] = rest.split(',').map(Number);
    await b.eval(`__game.teleport(${x}, ${z}, ${yaw}, ${pitch}); __game.tick(1/60, ${ticks || 3}); 1`);
    const ms = await b.eval('__game.bench(10)');
    const f = await b.shot(join(out, name + '.png'));
    console.log(name, f, 'ms/frame', ms.toFixed(1));
  }
  console.log('errors:', b.errors.length ? b.errors : 'none');
} finally {
  await b.close();
}
