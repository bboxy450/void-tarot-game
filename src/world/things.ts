// Painters for kinds of things: trees, firs, bushes, houses, stones, figures, the psychic's tent.
import * as THREE from 'three';
import { MARKS } from '../paint/brush';
import { RAMP, LAMP, LAMP_HOT } from '../paint/palette';
import { shadeColor, castBall, castPost, addLamp } from '../paint/light';
import { place } from '../paint/under';
import { clamp, mix, ramp, hex, type RGB } from '../paint/util';
import { groundHeight, type House, TENT, STONES } from './layout';

const STONES_C = [STONES.x, STONES.z];
import { paintBox, paintRect, paintTube, stroke, type V3 } from './surfaces';
import type { Ctx } from './ctx';

const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// ---------------------------------------------------------------------------------------------
// leaves

interface Lobe { x: number; y: number; z: number; r: number }

/** Lobes of leaves round a dark core: the crown of a tree or a bush. */
function paintLobes(ctx: Ctx, lobes: Lobe[], centre: V3, gy: number, o: { ramp: keyof typeof RAMP; leaf: number; detail: number; bias?: number; swayBase?: number }) {
  const { r } = ctx;
  const top = Math.max(...lobes.map((l) => l.y + l.r)), bottom = Math.min(...lobes.map((l) => l.y - l.r));
  for (const L of lobes) {
    const leaf = o.leaf / Math.sqrt(o.detail);
    const count = Math.round(((4 * Math.PI * L.r * L.r * 2.4) / (leaf * leaf * 0.62 * 0.55)));
    for (let i = 0; i < count; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const d: V3 = [s * Math.cos(a), u, s * Math.sin(a)];
      const rr = L.r * (0.9 + r() * 0.16);
      const p: V3 = [L.x + d[0] * rr, L.y + d[1] * rr, L.z + d[2] * rr];
      // hidden inside another lobe: skip
      let hidden = false;
      for (const M of lobes) if (M !== L && Math.hypot(p[0] - M.x, p[1] - M.y, p[2] - M.z) < M.r * 0.86) { hidden = true; break; }
      if (hidden) continue;
      const cn = norm([p[0] - centre[0], (p[1] - centre[1]) * 1.2, p[2] - centre[2]]);
      const n = norm([d[0] * 0.55 + cn[0] * 0.45, d[1] * 0.55 + cn[1] * 0.45, d[2] * 0.55 + cn[2] * 0.45]);
      const h = clamp((p[1] - bottom) / Math.max(top - bottom, 0.1));
      const rnd = r();
      const col = shadeColor(o.ramp, p[0], p[1], p[2], n, rnd, { bias: (o.bias ?? 0) + (h - 0.5) * 0.1, sunK: 0.72, groundY: gy, jitter: 0.26 });
      const dir: V3 = [r() - 0.5 + n[0] * 0.3, -0.55 + r() * 0.35, r() - 0.5 + n[2] * 0.3];
      const len = leaf * (0.75 + r() * 0.5);
      const mk = r();
      ctx.leaves.add(p[0], p[1], p[2], dir[0], dir[1], dir[2], null, len, len * (0.55 + r() * 0.2), col, {
        mark: mk < 0.5 ? MARKS.leaf : mk < 0.8 ? MARKS.press : MARKS.round,
        sway: (o.swayBase ?? 0.35) + 0.65 * h,
        light: 1,
      });
    }
    ctx.under.add(new THREE.IcosahedronGeometry(L.r * 0.9, 1), place(L.x, L.y, L.z), o.ramp, -0.16, 0.5);
  }
}

export function paintTree(ctx: Ctx, x: number, z: number, s: number, variant: 'green' | 'autumn' = 'green') {
  const { r } = ctx;
  const gy = groundHeight(x, z);
  const det = ctx.detail(x, z);
  const trunkH = (2.6 + r() * 2.2) * s;
  const R = (2.4 + r() * 1.6) * s;
  const cy = gy + trunkH + R * 0.55;
  const tr = 0.28 * s;
  paintTube(ctx.solid, r, x, gy - 0.2, z, tr, tr * 0.6, trunkH + R * 0.4, { ramp: 'bark', len: 0.45 * s / Math.sqrt(det), cover: 2.2, grainMode: 'v', jitter: 0.15, groundY: gy });
  ctx.under.add(new THREE.CylinderGeometry(tr * 0.6, tr, trunkH + R * 0.4, 6, 1, true), place(x, gy - 0.2 + (trunkH + R * 0.4) / 2, z), 'bark', -0.1);
  // a couple of boughs
  for (let b = 0; b < 3; b++) {
    const a = r() * Math.PI * 2, h0 = gy + trunkH * (0.6 + r() * 0.3);
    const ex = x + Math.cos(a) * R * 0.6, ez = z + Math.sin(a) * R * 0.6, ey = h0 + R * 0.5;
    for (let t = 0.15; t < 1; t += 0.2) {
      const p: V3 = [x + (ex - x) * t, h0 + (ey - h0) * t, z + (ez - z) * t];
      stroke(ctx.solid, r, p, [0, 0, 0], norm([ex - x, ey - h0, ez - z]), { ramp: 'bark', len: 0.5 * s, wid: 0.12 * s, groundY: gy, marks: [MARKS.long] }, false);
    }
  }
  const n = 3 + Math.floor(r() * 4);
  const lobes: Lobe[] = [{ x, y: cy + R * 0.15, z, r: R * 0.72 }];
  for (let i = 1; i < n; i++) {
    const a = (i / (n - 1)) * Math.PI * 2 + r() * 0.8;
    const d = R * (0.45 + r() * 0.3);
    lobes.push({ x: x + Math.cos(a) * d, y: cy + (r() - 0.55) * R * 0.6, z: z + Math.sin(a) * d, r: R * (0.48 + r() * 0.22) });
  }
  for (const L of lobes) castBall(L.x, L.y, L.z, L.r * 0.95, gy, 0.82);
  castPost(x, gy, z, trunkH, 0.35 * s, 0.75);
  paintLobes(ctx, lobes, [x, cy, z], gy, { ramp: variant === 'autumn' ? 'autumn' : 'foliage', leaf: 0.62 * s, detail: det });
  ctx.colliders.push({ kind: 'circle', x, z, r: 0.55 * s });
}

export function paintBush(ctx: Ctx, x: number, z: number, s: number, flowers = false) {
  const { r } = ctx;
  const gy = groundHeight(x, z);
  const det = ctx.detail(x, z);
  const R = (0.7 + r() * 0.6) * s;
  const lobes: Lobe[] = [];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = R * 0.5 * r();
    lobes.push({ x: x + Math.cos(a) * d, y: gy + R * (0.55 + r() * 0.3), z: z + Math.sin(a) * d, r: R * (0.6 + r() * 0.35) });
  }
  for (const L of lobes) castBall(L.x, L.y, L.z, L.r, gy, 0.7);
  paintLobes(ctx, lobes, [x, gy + R * 0.6, z], gy, { ramp: 'foliage', leaf: 0.4 * s, detail: det, bias: 0.03, swayBase: 0.15 });
  if (flowers) {
    const fc = [hex('#e8d6ff'), hex('#f4c860'), hex('#c87ad0'), hex('#fff0d0')][Math.floor(r() * 4)];
    for (let i = 0; i < 26 * s; i++) {
      const L = lobes[Math.floor(r() * lobes.length)];
      const u = r() * 1.6 - 0.6, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
      ctx.leaves.add(L.x + q * Math.cos(a) * L.r, L.y + u * L.r, L.z + q * Math.sin(a) * L.r, r() - 0.5, 0.2, r() - 0.5, null, 0.13, 0.11, mix(fc, [1, 1, 1], r() * 0.2), { mark: MARKS.round, sway: 0.4, light: 1 });
    }
  }
}

export function paintFir(ctx: Ctx, x: number, z: number, s: number) {
  const { r } = ctx;
  const gy = groundHeight(x, z);
  const det = ctx.detail(x, z);
  const H = (8 + r() * 7) * s;
  const R = (2.2 + r() * 1.1) * s;
  ctx.under.add(new THREE.ConeGeometry(R * 0.62, H * 0.86, 7, 1, true), place(x, gy + H * 0.12 + H * 0.43, z), 'fir', -0.2, 0.4);
  paintTube(ctx.solid, r, x, gy - 0.2, z, 0.24 * s, 0.12 * s, H * 0.35, { ramp: 'bark', len: 0.4 * s, grainMode: 'v', groundY: gy });
  const len = 0.75 * s / Math.sqrt(det);
  for (let t = 0.12; t < 1.0; t += 0.055 / Math.sqrt(det)) {
    const hy = gy + H * t;
    const rad = R * Math.pow(1 - t, 0.85) + 0.15;
    const boughs = Math.max(3, Math.round((Math.PI * 2 * rad) / (len * 0.42)));
    for (let b = 0; b < boughs; b++) {
      const a = (b / boughs) * Math.PI * 2 + r() * 0.5;
      const cs = Math.cos(a), sn = Math.sin(a);
      for (let k = 0; k < 3; k++) {
        const f = 0.55 + k * 0.28 + r() * 0.1;
        const p: V3 = [x + cs * rad * f, hy - rad * f * 0.35 + r() * 0.2, z + sn * rad * f];
        const n: V3 = norm([cs, 0.55, sn]);
        const col = shadeColor('fir', p[0], p[1], p[2], n, r(), { sunK: 0.75, groundY: gy, bias: (f - 0.6) * 0.12 + t * 0.08 });
        ctx.leaves.add(p[0], p[1], p[2], cs * 0.8, -0.45, sn * 0.8, null, len * (0.8 + r() * 0.5), len * 0.32, col, { mark: r() < 0.6 ? MARKS.long : MARKS.flick, sway: 0.15 + t * 0.6, light: 1 });
      }
    }
  }
  for (let t = 0.15; t < 0.9; t += 0.15) castBall(x, gy + H * t, z, R * (1 - t) * 0.9, gy, 0.8);
  ctx.colliders.push({ kind: 'circle', x, z, r: 0.5 * s });
}

// ---------------------------------------------------------------------------------------------
// houses

export function houseWindows(h: House): { p: V3; n: V3; w: number; hgt: number }[] {
  const c = Math.cos(h.rot), s = Math.sin(h.rot);
  const gy = groundHeight(h.x, h.z);
  const ax: V3 = [c, 0, -s], az: V3 = [s, 0, c];
  const out: { p: V3; n: V3; w: number; hgt: number }[] = [];
  const at = (lx: number, ly: number, lz: number, n: V3) => out.push({ p: [h.x + ax[0] * lx + az[0] * lz, gy + ly, h.z + ax[2] * lx + az[2] * lz], n, w: 0.8, hgt: 1.0 });
  at(-h.w * 0.25, 1.6, h.d / 2 + 0.03, az);
  at(h.w * 0.28, 1.6, h.d / 2 + 0.03, az);
  at(h.w / 2 + 0.03, 1.7, 0, ax);
  at(-h.w / 2 - 0.03, 1.7, h.d * 0.15, [-ax[0], 0, -ax[2]]);
  if (h.h > 4) at(0, h.h - 0.6, h.d / 2 + 0.03, az);
  return out;
}

export function houseLamps(h: House) {
  for (const w of houseWindows(h)) addLamp(w.p[0] + w.n[0] * 1.2, w.p[1], w.p[2] + w.n[2] * 1.2, 7, 0.55);
}

function paintWindow(ctx: Ctx, p: V3, n: V3, w: number, hgt: number) {
  const { r } = ctx;
  const side: V3 = norm([n[2], 0, -n[0]]);
  // dark frame, then the glow inside
  paintRect(ctx.solid, r, [p[0] - side[0] * (w / 2 + 0.12) + n[0] * 0.01, p[1] - hgt / 2 - 0.12, p[2] - side[2] * (w / 2 + 0.12) + n[2] * 0.01], [side[0] * (w + 0.24), 0, side[2] * (w + 0.24)], [0, hgt + 0.24, 0], n, { ramp: 'wood', len: 0.22, cover: 2.4, bias: -0.25 });
  const hot = LAMP_HOT, lamp = LAMP;
  const cnt = Math.round(w * hgt * 60);
  for (let i = 0; i < cnt; i++) {
    const a = r() - 0.5, b = r() - 0.5;
    const q: V3 = [p[0] + side[0] * a * w + n[0] * 0.06, p[1] + b * hgt, p[2] + side[2] * a * w + n[2] * 0.06];
    const k = r();
    const col: RGB = mix(mix(lamp, hot, k), [1, 0.85, 0.6], Math.max(0, b) * 0.4);
    ctx.glow.add(q[0], q[1], q[2], 0, 1, 0, n, 0.16, 0.08, col, { mark: MARKS.press, light: 0, glow: 1 });
  }
  // mullions
  for (const m of [0]) {
    for (let t = -0.5; t <= 0.5; t += 0.12) {
      const q: V3 = [p[0] + side[0] * m * w + n[0] * 0.09, p[1] + t * hgt, p[2] + side[2] * m * w + n[2] * 0.09];
      ctx.solid.add(q[0], q[1], q[2], 0, 1, 0, n, 0.14, 0.05, hex('#2a1a24'), { mark: MARKS.long, light: 0.4 });
    }
    for (let t = -0.5; t <= 0.5; t += 0.12) {
      const q: V3 = [p[0] + side[0] * t * w + n[0] * 0.09, p[1], p[2] + side[2] * t * w + n[2] * 0.09];
      ctx.solid.add(q[0], q[1], q[2], side[0], 0, side[2], n, 0.14, 0.05, hex('#2a1a24'), { mark: MARKS.long, light: 0.4 });
    }
  }
}

export function paintHouse(ctx: Ctx, h: House) {
  const { r } = ctx;
  const gy = groundHeight(h.x, h.z) - 0.4;
  const c = Math.cos(h.rot), s = Math.sin(h.rot);
  const ax: V3 = [c, 0, -s], az: V3 = [s, 0, c];
  const P = (lx: number, ly: number, lz: number): V3 => [h.x + ax[0] * lx + az[0] * lz, gy + ly, h.z + ax[2] * lx + az[2] * lz];
  const det = ctx.detail(h.x, h.z);
  const L = 0.42 / Math.sqrt(det);
  // walls: plaster over a stone footing, with timber
  paintBox(ctx.solid, r, h.x, gy + 0.9, h.z, h.w, h.d, h.h - 0.5, h.rot, { ramp: 'plaster', len: L, cover: 2.4, top: false, jitter: 0.12, groundY: gy });
  paintBox(ctx.solid, r, h.x, gy, h.z, h.w + 0.1, h.d + 0.1, 1.0, h.rot, { ramp: 'stone', len: L * 0.8, cover: 2.4, top: false, groundY: gy, marks: [MARKS.press, MARKS.round] });
  ctx.under.add(new THREE.BoxGeometry(h.w, h.h + 0.4, h.d), place(h.x, gy + (h.h + 0.4) / 2, h.z, h.rot), 'plaster', -0.12);
  // timbers: corners, a band, braces
  const beam = (a: V3, b: V3, n: V3) => {
    const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(...d);
    for (let t = 0; t < l; t += 0.25) {
      const f = t / l;
      const p: V3 = [a[0] + d[0] * f + n[0] * 0.05, a[1] + d[1] * f, a[2] + d[2] * f + n[2] * 0.05];
      stroke(ctx.solid, r, p, n, norm(d), { ramp: 'wood', len: 0.4, wid: 0.2, bias: -0.08, groundY: gy, marks: [MARKS.long, MARKS.flat] });
    }
  };
  const hw = h.w / 2, hd = h.d / 2, top = h.h + 0.4;
  const faces: [number, number, V3, V3][] = [
    [hw, hd, az, ax],
    [hw, -hd, [-az[0], 0, -az[2]], ax],
  ];
  for (const [w, d, n] of faces) {
    beam(P(-w, 1, d), P(-w, top, d), n);
    beam(P(w, 1, d), P(w, top, d), n);
    beam(P(-w, 2.6, d), P(w, 2.6, d), n);
    beam(P(-w, top, d), P(w, top, d), n);
    beam(P(-w, 1, d), P(-w * 0.4, 2.6, d), n);
    beam(P(w, 1, d), P(w * 0.4, 2.6, d), n);
  }
  for (const sx of [-1, 1]) {
    const n: V3 = [ax[0] * sx, 0, ax[2] * sx];
    beam(P(sx * (hw + 0.02), 2.6, -hd), P(sx * (hw + 0.02), 2.6, hd), n);
  }
  // door
  paintRect(ctx.solid, r, P(-0.55, 0.3, hd + 0.06), [ax[0] * 1.1, 0, ax[2] * 1.1], [0, 2.0, 0], az, { ramp: 'wood', len: 0.3, grain: [0, 1, 0], cover: 3, bias: -0.06 });
  // roof: a gable along local x, eaves overhang
  const over = 0.6, rh = h.d * 0.55;
  const ridgeY = top + rh;
  for (const sz of [-1, 1]) {
    const eave = P(-hw - over, top - 0.3, sz * (hd + over));
    const ridge = P(-hw - over, ridgeY, 0);
    const u: V3 = [ax[0] * (h.w + 2 * over), 0, ax[2] * (h.w + 2 * over)];
    const v: V3 = [ridge[0] - eave[0], ridge[1] - eave[1], ridge[2] - eave[2]];
    const nn = norm([az[0] * sz * rh, hd + over, az[2] * sz * rh]);
    paintRect(ctx.solid, r, eave, u, v, nn, { ramp: 'roof', len: L * 1.1, cover: 2.6, grain: u, jitter: 0.12, marks: [MARKS.flat, MARKS.long, MARKS.press], groundY: gy, sunK: 0.7 });
    const a = eave, b: V3 = [eave[0] + u[0], eave[1], eave[2] + u[2]], cc = ridge, d: V3 = [ridge[0] + u[0], ridge[1], ridge[2] + u[2]];
    const col = (y: number) => ramp(RAMP.roof, 0.2 + (y - top) * 0.04);
    ctx.under.tri([...a], [...b], [...d], col(a[1]), col(b[1]), col(d[1]));
    ctx.under.tri([...a], [...d], [...cc], col(a[1]), col(d[1]), col(cc[1]));
  }
  // gable ends: triangles of plaster
  for (const sx of [-1, 1]) {
    const n: V3 = [ax[0] * sx, 0, ax[2] * sx];
    const cnt = Math.round(((h.d * rh) / 2) * 2.4 / (L * L * 0.45 * 0.55));
    for (let i = 0; i < cnt; i++) {
      let a = r(), b = r();
      if (a + b > 1) { a = 1 - a; b = 1 - b; }
      const lz = -hd + a * h.d + b * hd;
      const ly = top + b * rh;
      const p = P(sx * (hw + 0.03), ly, lz);
      stroke(ctx.solid, r, p, n, az, { ramp: 'plaster', len: L, groundY: gy, bias: -0.04 });
    }
    const A = P(sx * hw, top, -hd), B = P(sx * hw, top, hd), C = P(sx * hw, ridgeY, 0);
    const k = ramp(RAMP.plaster, 0.3);
    ctx.under.tri([...A], [...B], [...C], k, k, k);
    ctx.under.tri([...A], [...C], [...B], k, k, k);
  }
  // chimney
  const ch = P(hw * 0.5, 0, -hd * 0.25);
  paintBox(ctx.solid, r, ch[0], gy + top, ch[2], 0.8, 0.8, rh + 1.2, h.rot, { ramp: 'stone', len: 0.3, groundY: gy });
  ctx.under.add(new THREE.BoxGeometry(0.8, rh + 1.2, 0.8), place(ch[0], gy + top + (rh + 1.2) / 2, ch[2], h.rot), 'stone', -0.1);
  for (const w of houseWindows(h)) paintWindow(ctx, w.p, w.n, w.w, w.hgt);
  // the house's long shadow
  for (let lx = -hw; lx <= hw; lx += 1.5) for (let lz = -hd; lz <= hd; lz += 1.5) {
    const q = P(lx, top, lz);
    castBall(q[0], q[1] + rh * 0.5 * (1 - Math.abs(lz) / hd), q[2], 1.3, gy, 0.85);
  }
  ctx.colliders.push({ kind: 'box', x: h.x, z: h.z, hw: hw + 0.3, hd: hd + 0.3, rot: h.rot });
}

// ---------------------------------------------------------------------------------------------
// stones

export function paintStone(ctx: Ctx, x: number, z: number, hgt: number, w: number, rot: number) {
  const { r } = ctx;
  const gy = groundHeight(x, z) - 0.5;
  const d = w * 0.55;
  const L = 0.32 / Math.sqrt(ctx.detail(x, z));
  // a tapered slab: two boxes, the top narrower
  paintBox(ctx.solid, r, x, gy, z, w, d, hgt * 0.65, rot, { bias: 0.1, ramp: 'stone', len: L, sideGrain: 'v', jitter: 0.3, groundY: gy + 0.5, marks: [MARKS.press, MARKS.dry, MARKS.long, MARKS.round], top: false });
  paintBox(ctx.solid, r, x, gy + hgt * 0.65, z, w * 0.8, d * 0.85, hgt * 0.35, rot, { bias: 0.12, ramp: 'stone', len: L, sideGrain: 'v', jitter: 0.3, groundY: gy + 0.5, marks: [MARKS.press, MARKS.dry, MARKS.round] });
  ctx.under.add(new THREE.BoxGeometry(w * 0.95, hgt * 0.65, d * 0.95), place(x, gy + hgt * 0.325, z, rot), 'stone', -0.12);
  ctx.under.add(new THREE.BoxGeometry(w * 0.75, hgt * 0.35, d * 0.8), place(x, gy + hgt * 0.825, z, rot), 'stone', -0.12);
  // lichen
  for (let i = 0; i < hgt * w * 10; i++) {
    const a = r() * Math.PI * 2;
    const p: V3 = [x + Math.cos(a) * w * 0.52, gy + r() * hgt * 0.7, z + Math.sin(a) * d * 0.52];
    ctx.solid.add(p[0], p[1], p[2], 0, 1, 0, null, 0.14, 0.1, shadeColor('meadow', p[0], p[1], p[2], [Math.cos(a), 0, Math.sin(a)], r(), { bias: 0.1 }), { mark: MARKS.round });
  }
  // runes of the void, faintly lit on the inner face
  const c = Math.cos(rot), s = Math.sin(rot);
  const az: V3 = [s, 0, c], ax: V3 = [c, 0, -s];
  const inward = (STONES_C[0] - x) * az[0] + (STONES_C[1] - z) * az[2] > 0 ? 1 : -1;
  if (hgt > 2) for (let g = 0; g < 3; g++) {
    const gyc = gy + hgt * (0.35 + g * 0.17);
    const kind = Math.floor(r() * 4);
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      let lx = 0, ly = 0;
      if (kind === 0) { lx = Math.cos(t * Math.PI * 2) * 0.18; ly = Math.sin(t * Math.PI * 2) * 0.18; }
      else if (kind === 1) { lx = (t - 0.5) * 0.4; ly = Math.abs(t - 0.5) * 0.5 - 0.1; }
      else if (kind === 2) { lx = i < 7 ? 0 : (t - 0.75) * 0.6; ly = i < 7 ? (t * 2 - 0.5) * 0.4 : 0.05; }
      else { lx = Math.sin(t * 6) * 0.15; ly = (t - 0.5) * 0.45; }
      const p: V3 = [x + ax[0] * lx + az[0] * inward * (d / 2 + 0.06), gyc + ly, z + ax[2] * lx + az[2] * inward * (d / 2 + 0.06)];
      ctx.glow.add(p[0], p[1], p[2], 0, 1, 0, [az[0] * inward, 0, az[2] * inward], 0.12, 0.06, mix(hex('#7a6cff'), hex('#d8ccff'), r() * 0.5), { mark: MARKS.press, light: 0, glow: 1 });
    }
  }
  castPost(x, gy, z, hgt, w * 0.45, 0.85);
  ctx.colliders.push({ kind: 'box', x, z, hw: w / 2 + 0.2, hd: d / 2 + 0.2, rot });
}

// ---------------------------------------------------------------------------------------------
// figures: nobles at their game, the psychic

export interface FigureStyle { robe: keyof typeof RAMP; hat?: 'tall' | 'brim' | 'hood' | 'crown'; seated?: boolean }

export function paintFigure(ctx: Ctx, x: number, y: number, z: number, face: number, st: FigureStyle) {
  const { r } = ctx;
  const fx = Math.sin(face), fz = Math.cos(face); // facing direction
  const seatY = st.seated ? y + 0.5 : y;
  const L = 0.1;
  // robe: body from the seat (or ground) up
  const bodyH = st.seated ? 0.75 : 1.45;
  paintTube(ctx.solid, r, x, seatY - (st.seated ? 0.5 : 0), z, st.seated ? 0.42 : 0.38, 0.2, bodyH + (st.seated ? 0.5 : 0), { ramp: st.robe, len: L * 1.4, grainMode: 'v', cover: 2.6, jitter: 0.2, light: 1 });
  ctx.under.add(new THREE.CylinderGeometry(0.19, st.seated ? 0.4 : 0.36, bodyH + (st.seated ? 0.5 : 0), 8), place(x, seatY - (st.seated ? 0.5 : 0) + (bodyH + (st.seated ? 0.5 : 0)) / 2, z), st.robe, -0.1);
  if (st.seated) {
    // lap and knees forward
    paintBox(ctx.solid, r, x + fx * 0.3, seatY - 0.05, z + fz * 0.3, 0.55, 0.55, 0.22, face, { ramp: st.robe, len: L, cover: 2.4 });
  }
  const top = seatY + bodyH;
  // arms reaching forward to the table
  for (const side of [-1, 1]) {
    const sx = Math.cos(face) * side * 0.26, sz = -Math.sin(face) * side * 0.26;
    for (let t = 0; t < 1; t += 0.2) {
      const p: V3 = [x + sx * (1 - t * 0.4) + fx * t * 0.42, top - 0.2 - t * 0.28, z + sz * (1 - t * 0.4) + fz * t * 0.42];
      stroke(ctx.solid, r, p, [0, 0, 0], [fx, -0.4, fz], { ramp: st.robe, len: 0.18, wid: 0.12, bias: 0.05 }, false);
    }
    const hp: V3 = [x + sx * 0.6 + fx * 0.46, top - 0.5, z + sz * 0.6 + fz * 0.46];
    stroke(ctx.solid, r, hp, [0, 0, 0], [fx, 0, fz], { ramp: 'skin', len: 0.1, wid: 0.08, bias: 0.15 }, false);
  }
  // head
  const hy = top + 0.16;
  for (let i = 0; i < 70; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
    const n: V3 = [q * Math.cos(a), u, q * Math.sin(a)];
    const front = n[0] * fx + n[2] * fz;
    const p: V3 = [x + n[0] * 0.13, hy + n[1] * 0.15, z + n[2] * 0.13];
    const isHair = front < 0.1 || n[1] > 0.5;
    const col = isHair ? shadeColor('wood', p[0], p[1], p[2], n, r(), { bias: -0.1 }) : shadeColor('skin', p[0], p[1], p[2], n, r(), { bias: 0.08 });
    ctx.solid.add(p[0], p[1], p[2], 0, 1, 0, null, 0.08, 0.06, col, { mark: MARKS.round, light: 1 });
  }
  ctx.under.add(new THREE.SphereGeometry(0.12, 8, 6), place(x, hy, z), 'skin', -0.15);
  // hat
  if (st.hat === 'tall') paintTube(ctx.solid, r, x, hy + 0.08, z, 0.15, 0.03, 0.45, { ramp: 'robeViolet', len: 0.08, grainMode: 'v', bias: 0.05 });
  if (st.hat === 'brim') {
    paintTube(ctx.solid, r, x, hy + 0.08, z, 0.26, 0.12, 0.08, { ramp: 'cloth', len: 0.08, grainMode: 'h' });
    paintTube(ctx.solid, r, x, hy + 0.14, z, 0.12, 0.1, 0.16, { ramp: 'cloth', len: 0.07, grainMode: 'h' });
  }
  if (st.hat === 'crown') {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      ctx.glow.add(x + Math.cos(a) * 0.13, hy + 0.13 + (i % 2) * 0.04, z + Math.sin(a) * 0.13, 0, 1, 0, null, 0.07, 0.04, ramp(RAMP.gold, 0.7 + (i % 3) * 0.1), { mark: MARKS.press, light: 1, glow: 0.4 });
    }
  }
  if (st.hat === 'hood') paintTube(ctx.solid, r, x - fx * 0.03, hy - 0.12, z - fz * 0.03, 0.2, 0.06, 0.42, { ramp: st.robe, len: 0.1, grainMode: 'v', bias: -0.05, arc: [face + Math.PI * 0.5 - Math.PI, face + Math.PI * 0.5 + Math.PI * 0.55] });
}

// ---------------------------------------------------------------------------------------------
// the psychic's tent

export function tentLamps() {
  addLamp(TENT.x + Math.sin(TENT.face) * 0.5, groundHeight(TENT.x, TENT.z) + 1.2, TENT.z + Math.cos(TENT.face) * 0.5, 8, 0.7);
  addLamp(TENT.x + Math.sin(TENT.face) * 3.4, groundHeight(TENT.x, TENT.z) + 2.4, TENT.z + Math.cos(TENT.face) * 3.4, 7, 0.5);
}

export function paintTent(ctx: Ctx) {
  const { r } = ctx;
  const { x, z, face } = TENT;
  const gy = groundHeight(x, z);
  const fx = Math.sin(face), fz = Math.cos(face);
  const R = 3.4, H = 4.6;
  // the angle round the axis that points out the open front
  const frontAng = Math.atan2(fz, fx);
  const stripe = (px: number, _py: number, pz: number, n: V3, rnd: number): RGB => {
    const a = Math.atan2(pz - z, px - x);
    const band = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 14) % 2;
    return shadeColor(band ? 'robeViolet' : 'cloth', px, _py, pz, n, rnd, { bias: band ? 0.12 : 0.05, groundY: gy });
  };
  paintTube(ctx.solid, r, x, gy, z, R, 0.12, H, { ramp: 'robeViolet', len: 0.4, grainMode: 'down', cover: 2.4, arc: [frontAng + 0.55, frontAng + Math.PI * 2 - 0.55], color: stripe });
  ctx.under.add(new THREE.ConeGeometry(R * 0.98, H, 14, 1, true, face + 0.6, Math.PI * 2 - 1.2), place(x, gy + H / 2, z), 'robeViolet', -0.2);
  ctx.under.add(new THREE.CircleGeometry(R, 14).rotateX(-Math.PI / 2), place(x, gy + 0.04, z), 'cloth', -0.1);
  // inside, a warm dark
  paintTube(ctx.solid, r, x, gy, z, R * 0.9, 0.1, H * 0.95, { ramp: 'cloth', len: 0.35, grainMode: 'down', arc: [frontAng + Math.PI * 0.6, frontAng + Math.PI * 1.4], bias: -0.1 });
  // flaps pulled aside
  for (const side of [-1, 1]) {
    const a = frontAng + side * 0.6;
    for (let i = 0; i < 70; i++) {
      const t = r();
      const p: V3 = [x + Math.cos(a) * R * (1 - t) + Math.cos(a + side * 0.4) * 0.3, gy + t * H, z + Math.sin(a) * R * (1 - t) + Math.sin(a + side * 0.4) * 0.3];
      stroke(ctx.solid, r, p, [Math.cos(a), 0.4, Math.sin(a)], [0, 1, 0], { ramp: 'cloth', len: 0.4, bias: 0.12, groundY: gy }, false);
    }
  }
  // a rug, a low table, the crystal ball, the seer
  paintRect(ctx.ground, r, [x - 2, gy + 0.06, z - 2], [4, 0, 0], [0, 0, 4], [0, 1, 0], { ramp: 'cloth', len: 0.3, bias: 0.1, cover: 2.6 });
  const tx = x + fx * 1.0, tz = z + fz * 1.0;
  paintBox(ctx.solid, r, tx, gy, tz, 0.9, 0.9, 0.7, face, { ramp: 'cloth', len: 0.15, bias: 0.05 });
  ctx.under.add(new THREE.BoxGeometry(0.9, 0.7, 0.9), place(tx, gy + 0.35, tz, face), 'cloth', -0.1);
  for (let i = 0; i < 160; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
    const k = r();
    ctx.glow.add(tx + q * Math.cos(a) * 0.22, gy + 0.95 + u * 0.22, tz + q * Math.sin(a) * 0.22, 0, 1, 0, null, 0.08, 0.06, mix(hex('#6a7cff'), hex('#e6d8ff'), k * k), { mark: MARKS.round, light: 0, glow: 1 });
  }
  paintFigure(ctx, x - fx * 0.2, gy, z - fz * 0.2, face, { robe: 'robeTeal', hat: 'hood', seated: true });
  // a lantern on a pole by the door
  const lx = x + fx * 3.4 + Math.cos(face) * 1.6, lz = z + fz * 3.4 - Math.sin(face) * 1.6;
  paintTube(ctx.solid, r, lx, gy, lz, 0.06, 0.05, 2.6, { ramp: 'wood', len: 0.2, grainMode: 'v' });
  for (let i = 0; i < 40; i++) {
    const k = r();
    ctx.glow.add(lx + (r() - 0.5) * 0.25, gy + 2.3 + (r() - 0.5) * 0.35, lz + (r() - 0.5) * 0.25, 0, 1, 0, null, 0.12, 0.09, mix(LAMP, LAMP_HOT, k), { mark: MARKS.press, light: 0, glow: 1 });
  }
  ctx.colliders.push({ kind: 'circle', x, z: z, r: 0.6 });
  for (let a = 0.7; a < Math.PI * 2 - 0.7; a += 0.35) ctx.colliders.push({ kind: 'circle', x: x + Math.cos(frontAng + a) * R, z: z + Math.sin(frontAng + a) * R, r: 0.5 });
  castBall(x, gy + H * 0.4, z, R * 0.8, gy, 0.8);
}
