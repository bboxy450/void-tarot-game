// Light baked into the paint: a low sun with long shadows, the sky from above, and lamplight.
// Nothing here runs per frame; every dab asks once while the world is painted.
import { RAMP, LAMP } from './palette';
import { ramp, clamp, noise2, type RGB } from './util';

const s = [-0.42, 0.25, -1];
const sl = Math.hypot(s[0], s[1], s[2]);
export const SUN: [number, number, number] = [s[0] / sl, s[1] / sl, s[2] / sl];
const SH = Math.hypot(SUN[0], SUN[2]);
const SUN_TAN = SUN[1] / SH; // rise over run toward the sun
const SX = SUN[0] / SH, SZ = SUN[2] / SH;

export interface Lamp { x: number; y: number; z: number; r: number; k: number; col: RGB }
export const LAMPS: Lamp[] = [];
export function addLamp(x: number, y: number, z: number, r: number, k: number, col: RGB = LAMP) {
  LAMPS.push({ x, y, z, r, k, col });
}

// ---------------------------------------------------------------------------------------------
// shadow: a grid over the valley, 1 = in the sun

const G = { x0: -220, z0: -300, res: 1, w: 440, h: 420 };
const shadow = new Float32Array(G.w * G.h).fill(1);
const T = { res: 4, w: G.w / 4, h: G.h / 4 };
const terrainLit = new Float32Array(T.w * T.h).fill(1);

export function bakeTerrainShadow(height: (x: number, z: number) => number) {
  for (let j = 0; j < T.h; j++) {
    for (let i = 0; i < T.w; i++) {
      const x = G.x0 + (i + 0.5) * T.res, z = G.z0 + (j + 0.5) * T.res;
      const y0 = height(x, z) + 0.5;
      let lit = 1;
      for (let t = 3; t < 200; t += 3 + t * 0.04) {
        const px = x + SX * t, pz = z + SZ * t, py = y0 + SUN_TAN * t;
        if (height(px, pz) > py) { lit = 0; break; }
      }
      terrainLit[j * T.w + i] = lit;
    }
  }
}

/** The shadow of a ball (crown, rock) laid on the ground along the sun. */
export function castBall(cx: number, cy: number, cz: number, r: number, groundY: number, k = 0.85) {
  const hgt = cy - groundY;
  if (hgt < -r) return;
  const run = hgt / SUN_TAN;
  const ex = cx - SX * run, ez = cz - SZ * run; // centre of the shadow
  const along = r / Math.sin(Math.atan(SUN_TAN)); // stretched along the sun
  const ext = along + 1;
  const i0 = Math.max(0, Math.floor((ex - ext - G.x0) / G.res)), i1 = Math.min(G.w - 1, Math.ceil((ex + ext - G.x0) / G.res));
  const j0 = Math.max(0, Math.floor((ez - ext - G.z0) / G.res)), j1 = Math.min(G.h - 1, Math.ceil((ez + ext - G.z0) / G.res));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = G.x0 + (i + 0.5) * G.res - ex, z = G.z0 + (j + 0.5) * G.res - ez;
      const a = x * SX + z * SZ, c = -x * SZ + z * SX;
      const q = (a * a) / (along * along) + (c * c) / (r * r);
      if (q < 1) {
        const soft = clamp((1 - q) * 3);
        shadow[j * G.w + i] *= 1 - k * soft;
      }
    }
  }
}

/** A post (trunk, stone) of height h: a line of small balls. */
export function castPost(x: number, y: number, z: number, h: number, r: number, k = 0.8) {
  for (let t = r; t < h; t += r * 1.5) castBall(x, y + t, z, r, y, k);
}

function lookup(x: number, z: number): number {
  const i = Math.floor((x - G.x0) / G.res), j = Math.floor((z - G.z0) / G.res);
  let v = 1;
  if (i >= 0 && j >= 0 && i < G.w && j < G.h) v = shadow[j * G.w + i];
  const ti = (x - G.x0) / T.res - 0.5, tj = (z - G.z0) / T.res - 0.5;
  const a = Math.floor(ti), b = Math.floor(tj);
  if (a >= 0 && b >= 0 && a < T.w - 1 && b < T.h - 1) {
    const fx = ti - a, fz = tj - b;
    const t00 = terrainLit[b * T.w + a], t10 = terrainLit[b * T.w + a + 1];
    const t01 = terrainLit[(b + 1) * T.w + a], t11 = terrainLit[(b + 1) * T.w + a + 1];
    const t = (t00 * (1 - fx) + t10 * fx) * (1 - fz) + (t01 * (1 - fx) + t11 * fx) * fz;
    v *= clamp((t - 0.35) * 3.5);
  }
  return v;
}

/** Sun reaching a point: ground shadow fades for things standing up off the ground. */
export function sunAt(x: number, y: number, z: number, groundY: number): number {
  const lift = clamp((y - groundY) / 10);
  // a ragged edge: the lookup is jittered a little per point
  const j = (noise2(x * 1.7, z * 1.7) - 0.5) * 1.2;
  return lookup(x + j, z - j) * (1 - lift) + lift * lookup(x - SX * (y - groundY) / SUN_TAN, z - SZ * (y - groundY) / SUN_TAN);
}

/** Lamplight reaching a point: summed colour times strength. */
export function lampAt(x: number, y: number, z: number): RGB {
  const k: RGB = [0, 0, 0];
  for (const l of LAMPS) {
    const dx = x - l.x, dy = y - l.y, dz = z - l.z;
    if (Math.abs(dx) > l.r || Math.abs(dz) > l.r || Math.abs(dy) > l.r) continue;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const f = 1 - d / l.r;
    if (f > 0) { const w = f * f * l.k; k[0] += l.col[0] * w; k[1] += l.col[1] * w; k[2] += l.col[2] * w; }
  }
  return k;
}

export interface ShadeOpts {
  bias?: number; // shift along the ramp
  sunK?: number; // how much the sun counts
  jitter?: number;
  lit?: number; // sun already known (skip the shadow lookup)
  groundY?: number;
}

/** Mix a colour for a dab: tone picked from a ramp by light and chance, then lamplight. */
export function shadeColor(r: keyof typeof RAMP, x: number, y: number, z: number, n: [number, number, number], rnd: number, o: ShadeOpts = {}): RGB {
  const ndl = n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2];
  const sun = Math.max(0, ndl) * (o.lit ?? sunAt(x, y, z, o.groundY ?? y));
  const sky = 0.5 + 0.5 * n[1];
  const t = 0.1 + sky * 0.22 + sun * (o.sunK ?? 0.62) + (rnd - 0.5) * (o.jitter ?? 0.24) + (o.bias ?? 0);
  return warm(ramp(RAMP[r], t), x, y, z);
}

export function warm(c: RGB, x: number, y: number, z: number): RGB {
  const L = lampAt(x, y, z);
  const m = Math.max(L[0], L[1], L[2]);
  if (m <= 0.001) return c;
  const s = m > 1.3 ? 1.3 / m : 1;
  return [c[0] + (c[0] * 1.8 + 0.1) * L[0] * s, c[1] + (c[1] * 1.8 + 0.06) * L[1] * s, c[2] + (c[2] * 1.4 + 0.04) * L[2] * s];
}
