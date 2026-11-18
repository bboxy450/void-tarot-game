// Screenshot the hand bench: node tools/handshot.js [url] [out.png]
import { launch } from './cdp.js';
const url = process.argv[2] ?? 'http://127.0.0.1:5173/tools/hands.html';
const out = process.argv[3] ?? `/tmp/void-tarot-hands-${Date.now()}.png`;
const b = await launch({ port: 9341, width: 2240, height: 1160 });
try {
  await b.goto(url);
  await b.waitFor('window.ready === true', 30000).catch((e) => { console.error(b.errors); throw e; });
  console.log(await b.shot(out), 'errors:', b.errors.length ? b.errors : 'none');
} finally { await b.close(); }
