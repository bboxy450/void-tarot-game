// Screenshot the hand bench: node tools/handshot.js [url] [out.png]
import { launch } from './cdp.js';
const url = process.argv[2] ?? 'http://127.0.0.1:5173/tools/hands.html';
const out = process.argv[3] ?? '/tmp/void-tarot-hands.png';
const b = await launch({ port: 9341, width: 2160, height: 1140 });
try {
  await b.goto(url);
  await b.waitFor('window.ready === true');
  console.log(await b.shot(out), 'errors:', b.errors.length ? b.errors : 'none');
} finally { await b.close(); }
