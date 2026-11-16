// Where things are. World units are metres; the valley lies toward -Z below the castle.
// The castle courtyard sits on a hill at z = 4..40; the gate opens south onto the valley.
import { fbm, smooth, clamp } from '../paint/util';

export type V2 = [number, number];

export const PLATEAU_Y = 16;
export const CASTLE = { x0: -18, x1: 18, z0: 4, z1: 40, wallH: 9, wallT: 2, gateW: 4.4, gateH: 6.5 };
export const START = { x: 2, z: 22.5, yaw: 0.42 };
export const GATE = { x: 0, z: 1, yaw: 0.0 };

/** The road: from the gate down the hill, through the village to the standing stones. */
export const PATHS: { pts: V2[]; width: number }[] = [
  { width: 2.6, pts: [[0, 5], [0, -6], [-7, -16], [-13, -27], [-9, -39], [2, -49], [11, -60], [14, -74], [10, -90], [3, -106], [-2, -122], [-8, -140], [-14, -157], [-16, -168]] },
  { width: 1.8, pts: [[13, -80], [28, -86], [44, -91], [58, -97], [68, -101]] },
  { width: 1.6, pts: [[11, -66], [-2, -70], [-16, -73], [-30, -76]] },
  { width: 1.4, pts: [[3, -106], [-10, -110], [-18, -116]] },
];

export const POND = { x: -44, z: -80, r: 11.5, y: -1.1 };
export const STREAM: V2[] = [[-112, -126], [-100, -114], [-86, -106], [-74, -99], [-62, -91], [-52, -85], [-46, -82]];
export const STREAM_W = 2.4;

export const STONES = { x: -16, z: -181, r: 9 };
export const TENT = { x: 74, z: -103, face: -1.75 };
export const TABLE = { x: -4, z: 16 };

export interface House { x: number; z: number; rot: number; w: number; d: number; h: number }
export const HOUSES: House[] = [
  { x: 27, z: -69, rot: 0.35, w: 6, d: 8, h: 4.2 },
  { x: -8, z: -95, rot: -0.25, w: 7, d: 5.5, h: 4.0 },
  { x: 24, z: -104, rot: 0.15, w: 6.5, d: 7, h: 4.6 },
  { x: -17, z: -126, rot: 0.5, w: 5.5, d: 7, h: 3.8 },
  { x: 15, z: -130, rot: -0.35, w: 6, d: 6, h: 4.2 },
  { x: 36, z: -120, rot: 0.9, w: 5, d: 6.5, h: 3.6 },
];

// ---------------------------------------------------------------------------------------------
// distances

function segDist(px: number, pz: number, a: V2, b: V2): [number, number] {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz));
  const x = a[0] + dx * t, z = a[1] + dz * t;
  return [Math.hypot(px - x, pz - z), t];
}

export function polyDist(px: number, pz: number, pts: V2[]): { d: number; dx: number; dz: number } {
  let best = 1e9, bdx = 1, bdz = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [d] = segDist(px, pz, pts[i], pts[i + 1]);
    if (d < best) {
      best = d;
      bdx = pts[i + 1][0] - pts[i][0];
      bdz = pts[i + 1][1] - pts[i][1];
    }
  }
  const l = Math.hypot(bdx, bdz) || 1;
  return { d: best, dx: bdx / l, dz: bdz / l };
}

/** Distance past the edge of the nearest road (negative on it) and the road's direction. */
export function pathInfo(x: number, z: number): { d: number; dx: number; dz: number } {
  let best = { d: 1e9, dx: 1, dz: 0 };
  for (const p of PATHS) {
    const r = polyDist(x, z, p.pts);
    const w = p.width * (1 + (fbm(x * 0.15, z * 0.15, 2) - 0.5) * 0.5);
    r.d -= w;
    if (r.d < best.d) best = r;
  }
  return best;
}

export function streamDist(x: number, z: number) {
  return polyDist(x, z, STREAM);
}

/** How near the player can come: 0 on the roads and in the valley, 1 far out on the rim. */
export function reachOf(x: number, z: number): number {
  const out = Math.max(smooth(110, 170, Math.abs(x)), smooth(-200, -260, z), smooth(50, 90, z));
  const nearPath = smooth(6, 40, pathInfo(x, z).d);
  return clamp(out * 0.8 + nearPath * 0.35);
}

// ---------------------------------------------------------------------------------------------
// the ground

export function hillMask(x: number, z: number): number {
  const r = Math.hypot(x / 32, (z - 22) / (z < 22 ? 20 : 30));
  return 1 - smooth(1.0, 2.9, r);
}

export function groundHeight(x: number, z: number, cut = true): number {
  const hill = PLATEAU_Y * hillMask(x, z);
  const roll = (fbm(x * 0.012 + 3, z * 0.012 - 7, 3) - 0.5) * 7;
  const rimX = smooth(95, 175, Math.abs(x));
  const rimS = smooth(-195, -270, z);
  const rimN = smooth(55, 120, z);
  const rim = Math.max(rimX, rimS, rimN) * (26 + fbm(x * 0.02, z * 0.02, 3) * 34);
  let h = Math.max(hill, roll * (1 - hillMask(x, z)) + rim);
  // the standing stones sit on a low rise
  h += 2.2 * (1 - smooth(8, 30, Math.hypot(x - STONES.x, z - STONES.z)));
  if (!cut) return h;
  // water cuts in
  const pd = Math.hypot(x - POND.x, z - POND.z);
  h -= 3.2 * (1 - smooth(POND.r - 3, POND.r + 6, pd));
  const sd = streamDist(x, z).d;
  h -= 2.0 * (1 - smooth(STREAM_W * 0.4, STREAM_W * 2.2, sd));
  return h;
}

export function groundNormal(x: number, z: number): [number, number, number] {
  const e = 0.6;
  const hx = groundHeight(x + e, z) - groundHeight(x - e, z);
  const hz = groundHeight(x, z + e) - groundHeight(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz);
  return [-hx / l, (2 * e) / l, -hz / l];
}

export function waterAt(x: number, z: number): number | null {
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1.5) return POND.y;
  const s = streamDist(x, z);
  if (s.d < STREAM_W * 1.1) return groundHeight(x, z, false) - 0.75;
  return null;
}
