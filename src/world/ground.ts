// The ground: underpainting mesh, lying strokes along the roads and the grain of the meadows,
// tufts of grass, flowers, water with the sky in it.
import { MARKS } from '../paint/brush';
import { shadeColor, sunAt } from '../paint/light';
import { RAMP } from '../paint/palette';
import { fbm, noise2, hash2, clamp, smooth, mix, ramp, hex, type RGB } from '../paint/util';
import { CASTLE, POND, STREAM, STREAM_W, groundHeight, groundNormal, pathInfo, hillMask, streamDist, waterAt } from './layout';
import { courtyardSun } from './castle';
import type { Ctx } from './ctx';
import type { V3 } from './surfaces';

const inCourt = (x: number, z: number) => x > CASTLE.x0 - 0.5 && x < CASTLE.x1 + 0.5 && z > CASTLE.z0 - 1 && z < CASTLE.z1 + 0.5;
const nearGate = (x: number, z: number) => Math.abs(x) < 4.5 && z > -2.5 && z < CASTLE.z0 + 1;

interface Zone { ramp: keyof typeof RAMP; grain: [number, number]; bias: number; road: number }

function zoneAt(x: number, z: number, rnd: number): Zone {
  if (inCourt(x, z) || nearGate(x, z)) {
    // flagstones: a tone per stone
    const fx = Math.floor(x / 1.3 + (Math.floor(z / 0.9) % 2) * 0.5), fz = Math.floor(z / 0.9);
    return { ramp: 'paving', grain: [1, 0], bias: (hash2(fx, fz) - 0.5) * 0.22, road: 1 };
  }
  const p = pathInfo(x, z);
  const edge = clamp(-p.d / 1.2 + 0.5 + (rnd - 0.5) * 0.9);
  if (edge > 0.5) return { ramp: 'path', grain: [p.dx, p.dz], bias: (fbm(x * 0.3, z * 0.3, 2) - 0.5) * 0.2, road: edge };
  const a = fbm(x * 0.05 + 11, z * 0.05, 3) * Math.PI * 4;
  const meadow = fbm(x * 0.02 - 5, z * 0.02 + 3, 3);
  return { ramp: meadow > 0.52 ? 'meadow' : 'grass', grain: [Math.cos(a), Math.sin(a)], bias: (meadow - 0.5) * 0.15, road: 0 };
}

function lightAt(x: number, y: number, z: number): number {
  if (inCourt(x, z)) return courtyardSun(x, y + 0.2, z);
  return sunAt(x, y, z, y);
}

export function paintGround(ctx: Ctx) {
  const { r } = ctx;
  const CELL = 4;
  for (let cz = -300; cz < 110; cz += CELL) {
    for (let cx = -236; cx < 236; cx += CELL) {
      const mx = cx + CELL / 2, mz = cz + CELL / 2;
      if (Math.hypot(mx * 0.9, (mz + 80) * 1.0) > 290) continue;
      const det = ctx.detail(mx, mz);
      const pd = inCourt(mx, mz) || nearGate(mx, mz) ? 0 : Math.max(0, pathInfo(mx, mz).d);
      const L = Math.min(4, (0.4 + 0.028 * pd) / Math.sqrt(det) * (1 + (1 - det) * 1.5));
      const cover = 2.1;
      const count = Math.max(1, Math.round((CELL * CELL * cover) / (L * L * 0.48 * 0.55)));
      for (let i = 0; i < count; i++) {
        const x = cx + r() * CELL, z = cz + r() * CELL;
        if (waterAt(x, z) !== null && Math.hypot(x - POND.x, z - POND.z) < POND.r - 0.5) continue;
        const y = groundHeight(x, z);
        const n = groundNormal(x, z);
        const rnd = r();
        const zone = zoneAt(x, z, r());
        const lit = lightAt(x, y, z);
        let col = shadeColor(zone.ramp, x, y, z, n, rnd, { lit, bias: zone.bias, sunK: 0.68, jitter: 0.2 });
        // wet banks are darker
        const sd = streamDist(x, z).d, pd = Math.hypot(x - POND.x, z - POND.z) - POND.r;
        const wet = Math.max(1 - smooth(0, 3, sd - STREAM_W), 1 - smooth(0, 4, pd));
        if (wet > 0) col = mix(col, ramp(RAMP.water, 0.25 + rnd * 0.15), wet * 0.45);
        const ang = (r() - 0.5) * (zone.road ? 0.35 : 0.8);
        const c = Math.cos(ang), s = Math.sin(ang);
        const gx = zone.grain[0] * c - zone.grain[1] * s, gz = zone.grain[0] * s + zone.grain[1] * c;
        const len = L * (0.75 + r() * 0.6);
        const mk = r();
        ctx.ground.add(x, y + 0.03, z, gx, 0, gz, n, len, len * (0.38 + r() * 0.2), col, {
          mark: zone.road ? (mk < 0.5 ? MARKS.flat : mk < 0.8 ? MARKS.dry : MARKS.press) : mk < 0.4 ? MARKS.long : mk < 0.7 ? MARKS.curve : MARKS.dry,
        });
      }
      paintGrass(ctx, cx, cz, CELL, det);
    }
  }
  paintUnderGround(ctx);
  paintWater(ctx);
}

function paintGrass(ctx: Ctx, cx: number, cz: number, cell: number, det: number) {
  const { r } = ctx;
  if (det < 0.25) return;
  const density = 0.55 * det * det;
  const tufts = Math.round(cell * cell * density * (0.5 + fbm(cx * 0.04, cz * 0.04, 2)));
  for (let i = 0; i < tufts; i++) {
    const x = cx + r() * cell, z = cz + r() * cell;
    if (inCourt(x, z) || nearGate(x, z) || waterAt(x, z) !== null) continue;
    const p = pathInfo(x, z);
    if (p.d < 0.2) continue;
    if (hillMask(x, z) > 0.98) continue;
    const y = groundHeight(x, z);
    const lit = sunAt(x, y + 0.4, z, y);
    const blades = 3 + Math.floor(r() * 4);
    const tall = (0.35 + r() * 0.45) * (p.d < 2.5 ? 1.25 : 1);
    const lean = r() * Math.PI * 2;
    for (let b = 0; b < blades; b++) {
      const a = lean + (r() - 0.5) * 1.6;
      const lx = Math.cos(a) * 0.35, lz = Math.sin(a) * 0.35;
      const h = tall * (0.7 + r() * 0.5);
      const n: V3 = [lx, 0.7, lz];
      const col = shadeColor(r() < 0.3 ? 'meadow' : 'grass', x, y + h, z, n, r(), { lit, bias: 0.06, sunK: 0.75, jitter: 0.3 });
      ctx.grass.add(x + lx * h * 0.5, y + h * 0.5, z + lz * h * 0.5, lx, 1, lz, null, h, h * 0.22, col, { mark: MARKS.flick, sway: 0.7 + r() * 0.3 });
    }
    // flowers among the grass
    if (r() < 0.08 * det) {
      const fc: RGB = [hex('#d9c8ff'), hex('#f6d070'), hex('#b866c8'), hex('#fff4e0'), hex('#7a8cff')][Math.floor(r() * 5)];
      for (let k = 0; k < 3; k++) {
        const fx = x + (r() - 0.5) * 0.6, fz = z + (r() - 0.5) * 0.6;
        ctx.grass.add(fx, y + tall * 0.9, fz, r() - 0.5, 0.2, r() - 0.5, null, 0.12, 0.1, mix(fc, [1, 1, 1], lit * 0.15), { mark: MARKS.round, sway: 0.8, glow: 0.15 });
      }
    }
  }
}

function paintUnderGround(ctx: Ctx) {
  const S = 3;
  const x0 = -240, x1 = 240, z0 = -310, z1 = 120;
  const nx = Math.round((x1 - x0) / S), nz = Math.round((z1 - z0) / S);
  const P: V3[] = [], C: RGB[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * S, z = z0 + j * S;
      const y = groundHeight(x, z);
      const zone = zoneAt(x, z, 0.5);
      const n = groundNormal(x, z);
      P.push([x, y - 0.06, z]);
      C.push(shadeColor(zone.ramp, x, y, z, n, 0.5, { lit: lightAt(x, y, z), bias: zone.bias - 0.06, jitter: 0, sunK: 0.6 }));
    }
  }
  const at = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      ctx.under.tri(P[a], P[d], P[c], C[a], C[d], C[c]);
      ctx.under.tri(P[a], P[c], P[b], C[a], C[c], C[b]);
    }
  }
}

/** Water: deep blue with the sunset laid on it in horizontal strokes. */
function waterColor(x: number, z: number, rnd: number): { c: RGB; glow: number } {
  const band = noise2(x * 0.25, z * 1.4);
  const streak = fbm(x * 0.08, z * 0.6, 2);
  let t = 0.2 + band * 0.25 + (rnd - 0.5) * 0.2;
  let glow = 0;
  if (streak > 0.6) { t = 0.62 + (streak - 0.6) * 1.4 + rnd * 0.1; glow = 0.6; }
  return { c: ramp(RAMP.water, clamp(t)), glow };
}

function paintWater(ctx: Ctx) {
  const { r } = ctx;
  // pond
  const n = Math.round(Math.PI * POND.r * POND.r * 16);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (POND.r + 1.2);
    const x = POND.x + Math.cos(a) * d, z = POND.z + Math.sin(a) * d;
    const w = waterColor(x, z, r());
    ctx.ground.add(x, POND.y, z, 1, 0, (r() - 0.5) * 0.15, [0, 1, 0], 0.55 + r() * 0.45, 0.16 + r() * 0.08, w.c, { mark: r() < 0.6 ? MARKS.long : MARKS.flat, glow: w.glow, light: 0.6 });
  }
  const P: V3[] = [];
  for (let k = 0; k <= 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    P.push([POND.x + Math.cos(a) * (POND.r + 1), POND.y - 0.04, POND.z + Math.sin(a) * (POND.r + 1)]);
  }
  const deep = ramp(RAMP.water, 0.22);
  for (let k = 0; k < 32; k++) ctx.under.tri([POND.x, POND.y - 0.04, POND.z], P[k + 1], P[k], deep, deep, deep);
  // reeds round the pond
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2, d = POND.r + (r() - 0.3) * 2.2;
    const x = POND.x + Math.cos(a) * d, z = POND.z + Math.sin(a) * d;
    const y = Math.max(groundHeight(x, z), POND.y);
    const h = 0.8 + r() * 0.9;
    const col = shadeColor('meadow', x, y + h, z, [Math.cos(a), 0.5, Math.sin(a)], r(), { bias: -0.05 });
    ctx.grass.add(x, y + h * 0.5, z, (r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3, null, h, 0.08, col, { mark: MARKS.flick, sway: 0.8 });
    if (r() < 0.25) ctx.grass.add(x, y + h, z, 0, 1, 0, null, 0.22, 0.07, hex('#3a2430'), { mark: MARKS.long, sway: 0.8 });
  }
  // the stream: strokes run with the water
  for (let s = 0; s < STREAM.length - 1; s++) {
    const [ax, az] = STREAM[s], [bx, bz] = STREAM[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const cnt = Math.round(len * STREAM_W * 2 * 8);
    for (let i = 0; i < cnt; i++) {
      const t = r() * len, o = (r() - 0.5) * 2 * STREAM_W * 0.95;
      const x = ax + dx * t - dz * o, z = az + dz * t + dx * o;
      const y = waterAt(x, z);
      if (y === null) continue;
      const w = waterColor(x * 0.7, z * 0.7 + t, r());
      ctx.ground.add(x, y, z, dx, 0, dz, [0, 1, 0], 0.6 + r() * 0.5, 0.16, w.c, { mark: MARKS.long, glow: w.glow * 0.7, light: 0.6 });
    }
    // under ribbon, following the ground
    const W = STREAM_W * 1.05;
    const steps = Math.ceil(len / 2);
    for (let k = 0; k < steps; k++) {
      const p0x = ax + dx * (k / steps) * len, p0z = az + dz * (k / steps) * len;
      const p1x = ax + dx * ((k + 1) / steps) * len, p1z = az + dz * ((k + 1) / steps) * len;
      const y0 = (waterAt(p0x, p0z) ?? groundHeight(p0x, p0z)) - 0.05, y1 = (waterAt(p1x, p1z) ?? groundHeight(p1x, p1z)) - 0.05;
      const A: V3 = [p0x + dz * W, y0, p0z - dx * W], B: V3 = [p0x - dz * W, y0, p0z + dx * W];
      const C2: V3 = [p1x - dz * W, y1, p1z + dx * W], D: V3 = [p1x + dz * W, y1, p1z - dx * W];
      ctx.under.tri(A, B, C2, deep, deep, deep);
      ctx.under.tri(A, C2, D, deep, deep, deep);
    }
  }
}
