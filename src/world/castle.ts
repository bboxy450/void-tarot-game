// The castle on the hill: curtain walls round a courtyard, towers with slate cones, a tall keep with
// spires, a gate to the valley. Inside, nobles play tarot at a table under a canopy.
import * as THREE from 'three';
import { MARKS } from '../paint/brush';
import { RAMP, LAMP, LAMP_HOT } from '../paint/palette';
import { addLamp, shadeColor, SUN } from '../paint/light';
import { place } from '../paint/under';
import { mix, ramp, hex, type RGB } from '../paint/util';
import { CASTLE, PLATEAU_Y, TABLE } from './layout';
import { paintBox, paintRect, paintTube, type V3 } from './surfaces';
import { paintFigure, paintTree, paintBush } from './things';
import type { Ctx } from './ctx';

const Y = PLATEAU_Y;
const SH = Math.hypot(SUN[0], SUN[2]);
const SUN_TAN = SUN[1] / SH;

/** Sun inside the walls: the south wall hides it, except a shaft through the gate. */
export function courtyardSun(x: number, y: number, z: number): number {
  if (z < CASTLE.z0 + 1 || Math.abs(x) > CASTLE.x1 + 1 || z > CASTLE.z1 + 1) return 1;
  const run = (z - CASTLE.z0) / (-SUN[2] / SH);
  const hAt = y + SUN_TAN * run;
  const xAt = x + (SUN[0] / SH) * run;
  if (hAt > Y + CASTLE.wallH + 0.3) return 1;
  if (Math.abs(xAt) < CASTLE.gateW / 2 - 0.2 && hAt < Y + CASTLE.gateH) return 1;
  return 0;
}

interface Tower { x: number; z: number; r: number; h: number; cone: number }
export const TOWERS: Tower[] = [
  { x: CASTLE.x0, z: CASTLE.z0, r: 3.4, h: 15, cone: 7 },
  { x: CASTLE.x1, z: CASTLE.z0, r: 3.4, h: 15, cone: 7 },
  { x: CASTLE.x0, z: CASTLE.z1, r: 3.6, h: 17, cone: 8 },
  { x: CASTLE.x1, z: CASTLE.z1, r: 3.6, h: 17, cone: 8 },
  { x: -4.6, z: CASTLE.z0, r: 2.5, h: 13, cone: 5.5 },
  { x: 4.6, z: CASTLE.z0, r: 2.5, h: 13, cone: 5.5 },
  { x: -10, z: 29, r: 2.6, h: 30, cone: 10 },
  { x: 10, z: 29, r: 2.6, h: 30, cone: 10 },
  { x: 0, z: 35, r: 2.2, h: 36, cone: 13 },
];
const KEEP = { x0: -10, x1: 10, z0: 29, z1: 40, h: 22 };

/** Lamps first: the light they throw is mixed into every colour painted after. */
export function castleLamps() {
  // table candles, braziers, gate torches, keep door, windows
  addLamp(TABLE.x, Y + 1.4, TABLE.z, 7, 1.0);
  addLamp(-12, Y + 1.6, 12, 9, 1.0);
  addLamp(9, Y + 1.6, 22, 9, 1.0);
  addLamp(-2.6, Y + 3, CASTLE.z0 - 1.6, 7, 0.5);
  addLamp(2.6, Y + 3, CASTLE.z0 - 1.6, 7, 0.5);
  addLamp(-2.6, Y + 3, CASTLE.z0 + 2.5, 7, 0.8);
  addLamp(2.6, Y + 3, CASTLE.z0 + 2.5, 7, 0.8);
  addLamp(0, Y + 2, KEEP.z0 - 1.5, 8, 0.9);
  stringLanterns().forEach(([x, y, z, c], i) => { if (i % 3 === 1) addLamp(x, y - 0.5, z, 7, 0.35, c); });
  for (const w of keepWindows()) addLamp(w.p[0] + w.n[0] * 1.5, w.p[1], w.p[2] + w.n[2] * 1.5, w.h > 2 ? 8 : 6, w.h > 2 ? 0.7 : 0.45);
}

/** Strings of small lanterns across the courtyard: [x, y, z, colour] */
export function stringLanterns(): [number, number, number, RGB][] {
  const out: [number, number, number, RGB][] = [];
  const cols = [hex('#ffcf6a'), hex('#ff9a6a'), hex('#d8a0ff'), hex('#ffe9a0')];
  for (const z of [11, 19.5]) {
    for (let x = CASTLE.x0 + 1.5; x <= CASTLE.x1 - 1.5; x += 1.7) {
      const f = (x - CASTLE.x0) / (CASTLE.x1 - CASTLE.x0);
      const y = Y + 7.6 - Math.sin(f * Math.PI) * 2.2;
      out.push([x, y, z + Math.sin(x * 0.7) * 0.2, cols[Math.round(x * 3.3) & 3]]);
    }
  }
  return out;
}

export const FLAMES: V3[] = [
  [-12, Y + 1.25, 12],
  [9, Y + 1.25, 22],
  [-2.6, Y + 3.1, CASTLE.z0 - 1.4],
  [2.6, Y + 3.1, CASTLE.z0 - 1.4],
  [-2.6, Y + 3.1, CASTLE.z0 + 2.3],
  [2.6, Y + 3.1, CASTLE.z0 + 2.3],
];

function keepWindows(): { p: V3; n: V3; w: number; h: number }[] {
  const out: { p: V3; n: V3; w: number; h: number }[] = [];
  // the inner faces of the curtain walls: rooms built into them
  const t = CASTLE.wallT / 2 + 0.05;
  for (const x of [-14, -9, 9, 14]) out.push({ p: [x, Y + 4.2, CASTLE.z0 + t], n: [0, 0, 1], w: 0.9, h: 1.6 });
  for (const z of [10, 17, 24]) {
    out.push({ p: [CASTLE.x0 + t, Y + 3.6, z], n: [1, 0, 0], w: 0.9, h: 1.6 });
    out.push({ p: [CASTLE.x1 - t, Y + 3.6, z], n: [-1, 0, 0], w: 0.9, h: 1.6 });
  }
  for (const z of [12, 22]) {
    out.push({ p: [CASTLE.x0 + t, Y + 1.3, z], n: [1, 0, 0], w: 1.4, h: 2.4 });
    out.push({ p: [CASTLE.x1 - t, Y + 1.3, z], n: [-1, 0, 0], w: 1.4, h: 2.4 });
  }
  for (const row of [7.5, 12, 16.5]) for (let x = -7.5; x <= 7.5; x += 3.75) out.push({ p: [x, Y + row, KEEP.z0 - 0.05], n: [0, 0, -1], w: 0.8, h: 1.8 });
  for (const t of TOWERS) {
    for (let k = 0; k < 3; k++) {
      const hh = t.h * (0.45 + k * 0.17);
      if (hh < 8) continue;
      const a = -Math.PI / 2 + (k - 1) * 0.7 + (t.x > 0 ? 0.3 : -0.3);
      out.push({ p: [t.x + Math.cos(a) * (t.r + 0.05), Y + hh, t.z + Math.sin(a) * (t.r + 0.05)], n: [Math.cos(a), 0, Math.sin(a)], w: 0.6, h: 1.4 });
    }
  }
  return out;
}

function glowRect(ctx: Ctx, p: V3, n: V3, w: number, h: number, hot = 0.5) {
  const { r } = ctx;
  const side: V3 = [n[2], 0, -n[0]];
  const cnt = Math.round(w * h * 120) + 10;
  for (let i = 0; i < cnt; i++) {
    const a = r() - 0.5, b = r() - 0.5;
    // arched top
    if (b > 0.3 && Math.abs(a) > Math.sqrt(Math.max(0, 0.25 - (b - 0.3) * (b - 0.3) * 4)) * 0.9) continue;
    const col: RGB = mix(LAMP, LAMP_HOT, Math.min(1, r() * 0.8 + hot * 0.4 - b * 0.3));
    ctx.glow.add(p[0] + side[0] * a * w + n[0] * 0.08, p[1] + b * h, p[2] + side[2] * a * w + n[2] * 0.08, 0, 1, 0, n, 0.26, 0.15, col, { mark: MARKS.press, light: 0, glow: 1 });
  }
}

export function paintCastle(ctx: Ctx) {
  const { r, solid, under } = ctx;
  const { x0, x1, z0, z1, wallH, wallT, gateW, gateH } = CASTLE;
  const L = 0.82;
  const inside = (x: number, y: number, z: number, n: V3, rnd: number, rampName: keyof typeof RAMP, bias = 0): RGB =>
    shadeColor(rampName, x, y, z, n, rnd, { lit: courtyardSun(x + n[0] * 0.3, y, z + n[2] * 0.3), bias, sunK: 0.52 });
  const stoneCol = (bias = 0) => (x: number, y: number, z: number, n: V3, rnd: number) => {
    const height = (y - Y) / 40;
    return inside(x, y, z, n, rnd, 'castle', bias - 0.06 + height * 0.1);
  };
  const st = { ramp: 'castle' as const, len: L, cover: 2.3, jitter: 0.1, marks: [MARKS.flat, MARKS.long, MARKS.press, MARKS.dry], color: stoneCol() };

  // curtain walls: [start, end] along x or z, the outward normal
  const walls: { a: V3; b: V3; n: V3; gate?: boolean }[] = [
    { a: [x0, Y, z0], b: [x1, Y, z0], n: [0, 0, -1], gate: true },
    { a: [x1, Y, z1], b: [x0, Y, z1], n: [0, 0, 1] },
    { a: [x0, Y, z1], b: [x0, Y, z0], n: [-1, 0, 0] },
    { a: [x1, Y, z0], b: [x1, Y, z1], n: [1, 0, 0] },
  ];
  for (const w of walls) {
    const segs: [V3, V3][] = [];
    if (w.gate) {
      segs.push([w.a, [-gateW / 2, Y, z0]], [[gateW / 2, Y, z0], w.b]);
    } else segs.push([w.a, w.b]);
    for (const [a, b] of segs) {
      const u: V3 = [b[0] - a[0], 0, b[2] - a[2]];
      const len = Math.hypot(u[0], u[2]);
      const off = (s: number): V3 => [w.n[0] * wallT * 0.5 * s, 0, w.n[2] * wallT * 0.5 * s];
      const o1 = off(1), o2 = off(-1);
      paintRect(solid, r, [a[0] + o1[0], Y - 1, a[2] + o1[2]], u, [0, wallH + 1, 0], w.n, st);
      paintRect(solid, r, [a[0] + o2[0], Y - 0.2, a[2] + o2[2]], u, [0, wallH + 0.2, 0], [-w.n[0], 0, -w.n[2]], st);
      paintRect(solid, r, [a[0] + o2[0], Y + wallH, a[2] + o2[2]], u, [w.n[0] * wallT, 0, w.n[2] * wallT], [0, 1, 0], { ...st, len: 0.5 });
      const cx = (a[0] + b[0]) / 2 + 0, cz = (a[2] + b[2]) / 2;
      const rot = Math.atan2(-u[2], u[0]);
      under.add(new THREE.BoxGeometry(len, wallH + 1.2, wallT), place(cx, Y - 1.2 + (wallH + 1.2) / 2, cz, rot), 'castle', -0.12);
      ctx.colliders.push({ kind: 'box', x: cx, z: cz, hw: len / 2, hd: wallT / 2 + 0.3, rot });
      // merlons on the outer edge
      const ux = u[0] / len, uz = u[2] / len;
      for (let t = 0.6; t < len - 0.4; t += 2.1) {
        const mx = a[0] + ux * t + w.n[0] * wallT * 0.35, mz = a[2] + uz * t + w.n[2] * wallT * 0.35;
        paintBox(solid, r, mx, Y + wallH, mz, 1.1, 0.7, 1.3, rot, { ...st, len: 0.32 });
        under.add(new THREE.BoxGeometry(1.1, 1.3, 0.7), place(mx, Y + wallH + 0.65, mz, rot), 'castle', -0.08);
      }
    }
  }
  // over the gate: the lintel, the passage
  paintRect(solid, r, [-gateW / 2, Y + gateH, z0 - wallT / 2 - 0.02], [gateW, 0, 0], [0, wallH - gateH, 0], [0, 0, -1], st);
  paintRect(solid, r, [-gateW / 2, Y + gateH, z0 + wallT / 2 + 0.02], [gateW, 0, 0], [0, wallH - gateH, 0], [0, 0, 1], st);
  under.add(new THREE.BoxGeometry(gateW, wallH - gateH, wallT), place(0, Y + gateH + (wallH - gateH) / 2, z0), 'castle', -0.12);
  for (const sx of [-1, 1]) {
    paintRect(solid, r, [sx * gateW / 2, Y - 0.2, z0 - wallT / 2], [0, 0, wallT], [0, gateH + 0.2, 0], [-sx, 0, 0], { ...st, color: stoneCol(-0.1) });
  }
  paintRect(solid, r, [-gateW / 2, Y + gateH - 0.02, z0 - wallT / 2], [gateW, 0, 0], [0, 0, wallT], [0, -1, 0], { ...st, color: stoneCol(-0.15) });

  // towers with slate cones
  for (const t of TOWERS) {
    const base = t.h > 20 ? Y + 6 : Y - 3;
    const h = Y + t.h - base;
    paintTube(solid, r, t.x, base, t.z, t.r, t.r * 0.94, h, { ...st, grainMode: 'h', len: t.r < 3 ? 0.5 : L });
    under.add(new THREE.CylinderGeometry(t.r * 0.92, t.r * 0.98, h, 12), place(t.x, base + h / 2, t.z), 'castle', -0.1);
    // a ring of corbels under the cone, the cone itself
    paintTube(solid, r, t.x, Y + t.h - 0.2, t.z, t.r * 1.08, t.r * 1.08, 0.9, { ...st, grainMode: 'h', len: 0.35, color: stoneCol(-0.05) });
    paintTube(solid, r, t.x, Y + t.h + 0.6, t.z, t.r * 1.2, 0.05, t.cone, { ramp: 'slate', len: 0.55, cover: 2.4, grainMode: 'down', jitter: 0.08, marks: [MARKS.long, MARKS.flat, MARKS.dry], sunK: 0.75 });
    under.add(new THREE.ConeGeometry(t.r * 1.15, t.cone, 12), place(t.x, Y + t.h + 0.6 + t.cone / 2, t.z), 'slate', -0.1);
    // a gold finial
    for (let i = 0; i < 12; i++) ctx.glow.add(t.x, Y + t.h + 0.6 + t.cone + i * 0.12, t.z, 0, 1, 0, null, 0.18, 0.08, ramp(RAMP.gold, 0.6 + (i % 3) * 0.12), { mark: MARKS.press, light: 1, glow: 0.3 });
    ctx.colliders.push({ kind: 'circle', x: t.x, z: t.z, r: t.r + 0.3 });
  }
  // the keep
  const kx = (KEEP.x0 + KEEP.x1) / 2, kz = (KEEP.z0 + KEEP.z1) / 2, kw = KEEP.x1 - KEEP.x0, kd = KEEP.z1 - KEEP.z0;
  paintBox(solid, r, kx, Y - 0.3, kz, kw, kd, KEEP.h, 0, { ...st, top: false });
  under.add(new THREE.BoxGeometry(kw, KEEP.h, kd), place(kx, Y + KEEP.h / 2 - 0.3, kz), 'castle', -0.12);
  // hipped roof
  const ry = Y + KEEP.h - 0.3, rh = 7;
  const rc: V3 = [kx, ry + rh, kz];
  const corners: V3[] = [[KEEP.x0 - 0.5, ry, KEEP.z0 - 0.5], [KEEP.x1 + 0.5, ry, KEEP.z0 - 0.5], [KEEP.x1 + 0.5, ry, KEEP.z1 + 0.5], [KEEP.x0 - 0.5, ry, KEEP.z1 + 0.5]];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const area = (Math.hypot(b[0] - a[0], b[2] - a[2]) * Math.hypot(rh, kd / 2)) / 2;
    const cnt = Math.round((area * 2.4) / (0.55 * 0.25 * 0.55));
    const e1: V3 = [b[0] - a[0], 0, b[2] - a[2]], e2: V3 = [rc[0] - a[0], rc[1] - a[1], rc[2] - a[2]];
    let n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(...n);
    n = [n[0] / nl, n[1] / nl, n[2] / nl];
    if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
    for (let k = 0; k < cnt; k++) {
      let p = r(), q = r();
      if (p + q > 1) { p = 1 - p; q = 1 - q; }
      const pos: V3 = [a[0] + e1[0] * p + e2[0] * q, a[1] + e2[1] * q + 0.02, a[2] + e1[2] * p + e2[2] * q];
      const col = shadeColor('slate', pos[0], pos[1], pos[2], n, r(), { sunK: 0.75, lit: 1 });
      solid.add(pos[0], pos[1], pos[2], e2[0], e2[1], e2[2], n, 0.55, 0.25, col, { mark: r() < 0.5 ? MARKS.long : MARKS.flat });
    }
    const k1 = ramp(RAMP.slate, 0.25);
    under.tri([...a], [...b], [...rc], k1, k1, k1);
    under.tri([...a], [...rc], [...b], k1, k1, k1);
  }
  ctx.colliders.push({ kind: 'box', x: kx, z: kz, hw: kw / 2 + 0.3, hd: kd / 2 + 0.3, rot: 0 });
  // keep door, lit
  glowRect(ctx, [0, Y + 1.6, KEEP.z0 - 0.06], [0, 0, -1], 2.2, 3.2, 0.2);
  for (const w of keepWindows()) {
    paintRect(solid, r, [w.p[0] - (w.n[2] !== 0 ? 0.55 : 0), w.p[1] - w.h / 2 - 0.25, w.p[2] - (w.n[0] !== 0 ? 0.55 : 0)], [Math.abs(w.n[2]) * 1.1, 0, Math.abs(w.n[0]) * 1.1], [0, w.h + 0.5, 0], w.n, { ramp: 'castle', len: 0.2, bias: -0.3, cover: 2 });
    glowRect(ctx, w.p, w.n, w.w, w.h);
  }
  // the gate's torches on iron brackets
  for (const p of FLAMES.slice(2)) paintTube(solid, r, p[0], p[1] - 0.9, p[2], 0.06, 0.09, 0.9, { ramp: 'wood', len: 0.12, grainMode: 'v' });

  paintCourt(ctx);
  // an old tree in the courtyard, and a little green at the walls
  paintTree(ctx, 11.5, 13.5, 1.15, 'autumn');
  for (const [bx, bz] of [[15.5, 7.5], [-15.5, 26], [-15.8, 7.2], [15.6, 27]] as [number, number][]) paintBush(ctx, bx, bz, 1.1, true);
  for (const [bx, bz] of [[14.5, 22], [15.2, 23.4], [-14.8, 15]] as [number, number][]) {
    paintTube(ctx.solid, r, bx, Y, bz, 0.42, 0.42, 1.1, { ramp: 'wood', len: 0.18, grainMode: 'v', bias: 0.05 });
    paintTube(ctx.solid, r, bx, Y + 0.25, bz, 0.45, 0.45, 0.08, { ramp: 'wood', len: 0.1, grainMode: 'h', color: () => hex('#2a2430') });
    ctx.colliders.push({ kind: 'circle', x: bx, z: bz, r: 0.5 });
  }
  // the strings of lanterns and their cords
  for (const [x, y, z, c] of stringLanterns()) {
    for (let i = 0; i < 9; i++) ctx.glow.add(x + (r() - 0.5) * 0.22, y - 0.25 + (r() - 0.5) * 0.3, z + (r() - 0.5) * 0.22, 0, 1, 0, null, 0.14, 0.1, mix(c, LAMP_HOT, r() * 0.5), { mark: MARKS.round, light: 0, glow: 1 });
  }
}

function paintCourt(ctx: Ctx) {
  const { r, solid, under } = ctx;
  // the table, its cloth, the cards in play, candles
  const { x, z } = TABLE;
  const tw = 2.6, td = 1.5, th = 0.85;
  paintBox(solid, r, x, Y + th - 0.08, z, tw + 0.2, td + 0.2, 0.1, 0, { ramp: 'cloth', len: 0.18, bias: 0.12, cover: 2.6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) paintTube(solid, r, x + sx * (tw / 2 - 0.15), Y, z + sz * (td / 2 - 0.15), 0.07, 0.07, th, { ramp: 'wood', len: 0.1, grainMode: 'v' });
  // hanging cloth sides
  for (const [o, u, n] of [
    [[x - tw / 2 - 0.1, Y + th - 0.45, z - td / 2 - 0.1], [tw + 0.2, 0, 0], [0, 0, -1]],
    [[x - tw / 2 - 0.1, Y + th - 0.45, z + td / 2 + 0.1], [tw + 0.2, 0, 0], [0, 0, 1]],
  ] as [V3, V3, V3][]) paintRect(solid, r, o, u, [0, 0.4, 0], n, { ramp: 'cloth', len: 0.16, grain: [0, 1, 0], bias: 0.05 });
  under.add(new THREE.BoxGeometry(tw, 0.12, td), place(x, Y + th - 0.04, z), 'cloth', 0);
  const cardCol = [hex('#f2e8d0'), hex('#d8cdb4'), hex('#1a1838'), hex('#2a2458')];
  for (let i = 0; i < 26; i++) {
    const cx = x + (r() - 0.5) * tw * 0.8, cz = z + (r() - 0.5) * td * 0.7;
    const a = r() * Math.PI;
    solid.add(cx, Y + th + 0.03, cz, Math.cos(a), 0, Math.sin(a), [0, 1, 0], 0.16, 0.1, cardCol[i % 4], { mark: MARKS.flat, light: 1, rank: 0.99 });
  }
  for (const [cx, cz] of [[x - 0.8, z], [x + 0.8, z + 0.1], [x, z - 0.3]]) {
    paintTube(solid, r, cx, Y + th, cz, 0.04, 0.04, 0.25, { ramp: 'plaster', len: 0.05, grainMode: 'v', bias: 0.4 });
    for (let i = 0; i < 6; i++) ctx.glow.add(cx, Y + th + 0.32 + i * 0.03, cz, 0, 1, 0, null, 0.07, 0.04, mix(LAMP, LAMP_HOT, i / 6), { mark: MARKS.flick, glow: 1, light: 0 });
  }
  // nobles round the game
  paintFigure(ctx, x - tw / 2 - 0.45, Y, z, Math.PI / 2, { robe: 'robeViolet', hat: 'crown', seated: true });
  paintFigure(ctx, x + tw / 2 + 0.45, Y, z, -Math.PI / 2, { robe: 'cloth', hat: 'brim', seated: true });
  paintFigure(ctx, x - 0.5, Y, z + td / 2 + 0.5, Math.PI, { robe: 'robeTeal', hat: 'tall', seated: true });
  paintFigure(ctx, x + 0.6, Y, z - td / 2 - 0.5, 0, { robe: 'robeViolet', hat: 'brim', seated: true });
  ctx.colliders.push({ kind: 'box', x, z, hw: tw / 2 + 1.0, hd: td / 2 + 1.0, rot: 0 });
  // canopy: four posts and a cloth roof
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    paintTube(solid, r, x + sx * 2.3, Y, z + sz * 1.8, 0.09, 0.09, 3.4, { ramp: 'wood', len: 0.15, grainMode: 'v' });
    ctx.colliders.push({ kind: 'circle', x: x + sx * 2.3, z: z + sz * 1.8, r: 0.25 });
  }
  const can = (p: number, q: number): V3 => [x + p * 2.5, Y + 3.4 + 0.5 * (1 - Math.abs(q)), z + q * 2.0];
  for (let i = 0; i < 1100; i++) {
    const p = r() * 2 - 1, q = r() * 2 - 1;
    const pos = can(p, q);
    const n: V3 = [0, 0.9, -Math.sign(q) * 0.4];
    const stripe = Math.floor((p + 1) * 4) % 2;
    const col = shadeColor(stripe ? 'cloth' : 'gold', pos[0], pos[1], pos[2], n, r(), { lit: 0, bias: stripe ? 0.18 : -0.12 });
    solid.add(pos[0], pos[1], pos[2], 0, -Math.sign(q) * 0.3, Math.sign(q), n, 0.3, 0.16, col, { mark: MARKS.flat });
  }
  // valance with scallops
  for (let p = -1; p <= 1; p += 0.04) for (const q of [-1, 1]) {
    const pos = can(p, q);
    const col = shadeColor('cloth', pos[0], pos[1], pos[2], [0, 0, q], r(), { lit: 0, bias: 0.15 });
    solid.add(pos[0], pos[1] - 0.15 - Math.abs(Math.sin(p * 9)) * 0.12, pos[2] + q * 0.05, 0, 1, 0, [0, 0, q], 0.32, 0.14, col, { mark: MARKS.long });
  }
  // braziers
  for (const f of FLAMES.slice(0, 2)) {
    paintTube(solid, r, f[0], Y, f[2], 0.15, 0.12, 0.9, { ramp: 'wood', len: 0.1, grainMode: 'v', bias: -0.1 });
    paintTube(solid, r, f[0], Y + 0.9, f[2], 0.3, 0.5, 0.35, { ramp: 'stone', len: 0.12, grainMode: 'h', bias: -0.1 });
    for (let i = 0; i < 30; i++) ctx.glow.add(f[0] + (r() - 0.5) * 0.6, Y + 1.25, f[2] + (r() - 0.5) * 0.6, 0, 1, 0, null, 0.12, 0.08, mix(hex('#ff6a20'), LAMP_HOT, r()), { mark: MARKS.round, glow: 1, light: 0 });
    ctx.colliders.push({ kind: 'circle', x: f[0], z: f[2], r: 0.7 });
  }
  // banners on the inner face of the north wall, a well of shadow under the keep
  for (const bx of [-14, 14]) {
    for (let i = 0; i < 260; i++) {
      const a = r(), b = r();
      const pos: V3 = [bx - 1 + a * 2, Y + 2.5 + b * 5, CASTLE.z1 - 1.08];
      const tri = Math.abs(a - 0.5) * 2 < (b < 0.2 ? b * 5 : 1);
      if (!tri) continue;
      const col = shadeColor(b < 0.9 ? 'robeViolet' : 'gold', pos[0], pos[1], pos[2], [0, 0, -1], r(), { lit: 0, bias: 0.15 });
      solid.add(pos[0], pos[1], pos[2], 0, 1, 0, [0, 0, -1], 0.35, 0.14, col, { mark: MARKS.long, sway: 0.1 });
    }
    // the sigil: a gold circle on the banner
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      ctx.glow.add(bx + Math.cos(a) * 0.45, Y + 5.5 + Math.sin(a) * 0.45, CASTLE.z1 - 1.12, -Math.sin(a), Math.cos(a), 0, [0, 0, -1], 0.14, 0.06, ramp(RAMP.gold, 0.8), { mark: MARKS.long, glow: 0.4, light: 1 });
    }
  }
}
