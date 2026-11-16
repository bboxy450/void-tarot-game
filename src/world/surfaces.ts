// Surface painters: lay strokes over rectangles, boxes, cylinders and cones along their grain.
import { DabSet } from '../paint/dabs';
import { MARKS } from '../paint/brush';
import { RAMP } from '../paint/palette';
import { shadeColor } from '../paint/light';
import type { RGB } from '../paint/util';

export type V3 = [number, number, number];

export interface SurfOpts {
  ramp: keyof typeof RAMP;
  len: number; // stroke length (m)
  wid?: number; // stroke width (m), default len * 0.45
  cover?: number; // how many times the surface is covered
  grain?: V3; // the way strokes run (world); default: along u
  jitter?: number; // angle jitter of the grain (radians)
  marks?: number[];
  bias?: number;
  tone?: number; // colour jitter
  sunK?: number;
  groundY?: number;
  light?: number;
  glow?: number;
  sway?: number;
  color?: (x: number, y: number, z: number, n: V3, r: number) => RGB | null; // override the colour
}

const DEF_MARKS = [MARKS.long, MARKS.press, MARKS.flat, MARKS.dry, MARKS.curve];

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function rotateInPlane(g: V3, n: V3, ang: number): V3 {
  // rotate g about n by ang
  const c = Math.cos(ang), s = Math.sin(ang);
  const k = cross(n, g);
  const d = n[0] * g[0] + n[1] * g[1] + n[2] * g[2];
  return [g[0] * c + k[0] * s + n[0] * d * (1 - c), g[1] * c + k[1] * s + n[1] * d * (1 - c), g[2] * c + k[2] * s + n[2] * d * (1 - c)];
}

export function stroke(set: DabSet, r: () => number, p: V3, n: V3, grain: V3, o: SurfOpts, lying = true) {
  const rnd = r();
  const col = o.color?.(p[0], p[1], p[2], n, rnd) ?? shadeColor(o.ramp, p[0], p[1], p[2], n, rnd, { bias: o.bias, jitter: o.tone, sunK: o.sunK, groundY: o.groundY });
  const g = o.jitter ? rotateInPlane(grain, n, (r() - 0.5) * 2 * o.jitter) : grain;
  const len = o.len * (0.75 + r() * 0.5);
  const wid = (o.wid ?? o.len * 0.45) * (0.8 + r() * 0.4);
  const marks = o.marks ?? DEF_MARKS;
  set.add(p[0], p[1], p[2], g[0], g[1], g[2], lying ? n : null, len, wid, col, { mark: marks[(r() * marks.length) | 0], light: o.light ?? 1, glow: o.glow ?? 0, sway: o.sway ?? 0 });
}

function countFor(area: number, o: SurfOpts) {
  const len = o.len, wid = o.wid ?? o.len * 0.45;
  return Math.max(1, Math.round((area * (o.cover ?? 2.2)) / (len * wid * 0.55)));
}

/** A flat rectangle: corner o, edges u and v; normal n (outward). */
export function paintRect(set: DabSet, r: () => number, o: V3, u: V3, v: V3, n: V3, opts: SurfOpts) {
  const area = Math.hypot(...cross(u, v));
  const count = countFor(area, opts);
  const grain = norm(opts.grain ?? u);
  for (let i = 0; i < count; i++) {
    const a = r(), b = r();
    const p: V3 = [o[0] + u[0] * a + v[0] * b + n[0] * 0.02, o[1] + u[1] * a + v[1] * b + n[1] * 0.02, o[2] + u[2] * a + v[2] * b + n[2] * 0.02];
    stroke(set, r, p, n, grain, opts);
  }
}

/** A box: centre x,z, base y, size w (x) d (z) h, turned by rot about Y. Sides and top. */
export function paintBox(set: DabSet, r: () => number, x: number, y: number, z: number, w: number, d: number, h: number, rot: number, opts: SurfOpts & { top?: boolean; sideGrain?: 'h' | 'v' }) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const ax: V3 = [c, 0, -s], az: V3 = [s, 0, c];
  const P = (lx: number, ly: number, lz: number): V3 => [x + ax[0] * lx + az[0] * lz, y + ly, z + ax[2] * lx + az[2] * lz];
  const up: V3 = [0, h, 0];
  const vertical = opts.sideGrain === 'v';
  const sides: [V3, V3, V3][] = [
    [P(-w / 2, 0, d / 2), [ax[0] * w, 0, ax[2] * w], az],
    [P(w / 2, 0, -d / 2), [-ax[0] * w, 0, -ax[2] * w], [-az[0], 0, -az[2]]],
    [P(w / 2, 0, d / 2), [-az[0] * d, 0, -az[2] * d], ax],
    [P(-w / 2, 0, -d / 2), [az[0] * d, 0, az[2] * d], [-ax[0], 0, -ax[2]]],
  ];
  for (const [o, u, n] of sides) paintRect(set, r, o, u, up, n, { ...opts, grain: vertical ? [0, 1, 0] : u });
  if (opts.top !== false) paintRect(set, r, P(-w / 2, h, -d / 2), [ax[0] * w, 0, ax[2] * w], [az[0] * d, 0, az[2] * d], [0, 1, 0], { ...opts, grain: ax });
}

/** A cylinder or cone frustum round a vertical axis. grain 'v' runs up, 'h' runs round. */
export function paintTube(set: DabSet, r: () => number, x: number, y: number, z: number, r0: number, r1: number, h: number, opts: SurfOpts & { grainMode?: 'v' | 'h' | 'down'; arc?: [number, number] }) {
  const slant = Math.hypot(h, r0 - r1);
  const area = Math.PI * (r0 + r1) * slant;
  const [a0, a1] = opts.arc ?? [0, Math.PI * 2];
  const count = Math.round(countFor(area, opts) * ((a1 - a0) / (Math.PI * 2)));
  const ny = (r0 - r1) / slant, nh = h / slant;
  for (let i = 0; i < count; i++) {
    // area-weighted height: more strokes where the radius is larger
    const f = r0 === r1 ? r() : (r0 - Math.sqrt(r0 * r0 - r() * (r0 * r0 - r1 * r1))) / (r0 - r1);
    const ang = a0 + r() * (a1 - a0);
    const rad = r0 + (r1 - r0) * f;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const n: V3 = norm([cs * nh, ny, sn * nh]);
    const p: V3 = [x + cs * (rad + 0.02), y + f * h, z + sn * (rad + 0.02)];
    let grain: V3;
    if (opts.grainMode === 'h') grain = [-sn, 0, cs];
    else if (opts.grainMode === 'down') grain = norm([cs * (r0 - r1), -h, sn * (r0 - r1)]);
    else grain = norm([-cs * (r0 - r1), h, -sn * (r0 - r1)]);
    stroke(set, r, p, n, grain, opts);
  }
}
