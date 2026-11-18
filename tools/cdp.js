// A small DevTools-protocol client: start headless Chrome, open a page, evaluate, screenshot.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch({ port = 9333, width = 1440, height = 900, gl = 'metal', headless = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vt-chrome-'));
  const args = [
    ...(headless ? ['--headless=new'] : []), `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
  ];
  if (gl === 'metal') args.push('--use-angle=metal');
  else args.push('--use-gl=angle', '--use-angle=swiftshader');
  const proc = spawn(CHROME, [...args, 'about:blank'], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 100 && !targets; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* not up yet */ }
  }
  if (!targets) throw new Error('chrome did not start');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) for (const l of listeners) l(msg);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const errors = [];
  listeners.push((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url ?? ''));
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const api = {
    send,
    errors,
    async goto(url) {
      await send('Page.navigate', { url });
    },
    async eval(expr, awaitPromise = true) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      return r.result.value;
    },
    async waitFor(expr, ms = 120000) {
      const t = Date.now();
      while (Date.now() - t < ms) {
        try { if (await api.eval(expr)) return true; } catch { /* page loading */ }
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('timeout waiting for ' + expr);
    },
    async shot(file) {
      // headless Chrome sometimes never answers a capture; give up after 10 s and ask again with the page in front
      let r = null;
      for (let i = 0; i < 4 && !r; i++) {
        if (i) await send('Page.bringToFront', {});
        r = await Promise.race([send('Page.captureScreenshot', { format: 'png' }), new Promise((ok) => setTimeout(() => ok(null), 10000))]);
      }
      if (!r) throw new Error('screenshot never came: ' + file);
      writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    async key(type, key, code, keyCode) {
      await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
    },
    async click(x, y, button = 'left') {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
    },
    async close() {
      try { ws.close(); } catch { /* closed */ }
      proc.kill('SIGKILL');
      await new Promise((r) => setTimeout(r, 300));
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* busy */ }
    },
  };
  return api;
}
