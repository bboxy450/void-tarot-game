// The sky and the mountains: far things painted in their own airy colours, laid far to near.
import * as THREE from 'three';
import { DabSet, type Kind } from '../paint/dabs';
import { MARKS } from '../paint/brush';
import { Under } from '../paint/under';
import { SUN } from '../paint/light';
import { RAMP } from '../paint/palette';
import { fbm, noise2, clamp, smooth, mix, ramp, hex, rng, type RGB } from '../paint/util';

export const SKY_R = 800;
const SUN_H = (() => { const l = Math.hypot(SUN[0], SUN[2]); return [SUN[0] / l, SUN[2] / l]; })();
export const MOON: [number, number, number] = (() => { const v = [0.3, 0.36, 1]; const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l] as [number, number, number]; })();

// elevation stops in degrees and the colours there: toward the sun, and away from it
const STOPS = [-6, 0, 3, 8, 15, 26, 45, 90];
const WARM = ['#e8a27c', '#ffe6b0', '#ffc77a', '#f39268', '#bd6a86', '#6e4c8e', '#2c2a6a', '#121236'].map(hex);
const COOL = ['#5a4a84', '#7a64a0', '#6a5896', '#544a8c', '#3e387a', '#2c2a66', '#1c1c4a', '#0f0f2e'].map(hex);

function stop(cols: RGB[], deg: number): RGB {
  if (deg <= STOPS[0]) return cols[0];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (deg <= STOPS[i + 1]) return mix(cols[i], cols[i + 1], (deg - STOPS[i]) / (STOPS[i + 1] - STOPS[i]));
  }
  return cols[cols.length - 1];
}

export function sunness(dx: number, dz: number): number {
  const l = Math.hypot(dx, dz) || 1;
  const c = (dx * SUN_H[0] + dz * SUN_H[1]) / l;
  return Math.pow(Math.max(0, c * 0.5 + 0.5), 3.2);
}

export function skyColor(d: [number, number, number]): RGB {
  const deg = (Math.asin(clamp(d[1], -1, 1)) * 180) / Math.PI;
  const k = sunness(d[0], d[2]);
  return mix(stop(COOL, deg), stop(WARM, deg), k);
}

export const SKY_KIND: Kind = { name: 'sky', minPx: 0.5, maxPx: 9999, gust: 0, mist: 0, depthStep: 0, layered: true, order: -20, impasto: 0.9, broken: 0.35 };
export const FAR_KIND: Kind = { name: 'far', minPx: 2, maxPx: 600, gust: 0, mist: 0.18, depthStep: 0, layered: true, order: -10, impasto: 1.1, broken: 0.45 };

function dirOf(az: number, el: number): [number, number, number] {
  const c = Math.cos(el);
  return [Math.cos(az) * c, Math.sin(el), Math.sin(az) * c];
}

export interface SkyParts { group: THREE.Group; clouds: THREE.Object3D; counts: number }

export function buildSky(): SkyParts {
  const r = rng(4242);
  const group = new THREE.Group();
  const under = new Under();
  // the under-sky: a sphere in the gradient
  const geo = new THREE.SphereGeometry(SKY_R * 1.05, 48, 24);
  const pos = geo.getAttribute('position');
  const idx = geo.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const vs = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)].map((k) => [pos.getX(k), pos.getY(k), pos.getZ(k)]);
    const cs = vs.map((v) => { const l = Math.hypot(v[0], v[1], v[2]); return skyColor([v[0] / l, v[1] / l, v[2] / l]); });
    under.tri(vs[0], vs[1], vs[2], cs[0], cs[1], cs[2]);
  }
  const underMesh = under.build(0, true);
  underMesh.renderOrder = -30;
  group.add(underMesh);

  const sky = new DabSet(SKY_KIND, 40000, 11);
  const R = SKY_R;
  // the field of the sky: swirling strokes, broken colour
  for (let i = 0; i < 26000; i++) {
    const az = r() * Math.PI * 2;
    const el = Math.asin(-0.12 + r() * 1.12);
    const d = dirOf(az, el);
    const swirl = (fbm(az * 2.2, el * 3, 3) - 0.5) * 3.2 * (0.35 + el);
    const t: [number, number, number] = [-Math.sin(az), 0, Math.cos(az)];
    const up: [number, number, number] = [-Math.cos(az) * Math.sin(el), Math.cos(el), -Math.sin(az) * Math.sin(el)];
    const cs = Math.cos(swirl), sn = Math.sin(swirl);
    const dir = [t[0] * cs + up[0] * sn, t[1] * cs + up[1] * sn, t[2] * cs + up[2] * sn];
    let c = skyColor(d);
    const k = r();
    // broken colour: a neighbour's tone streaked in
    const d2 = dirOf(az + (r() - 0.5) * 0.3, el + (r() - 0.4) * 0.12);
    c = mix(c, skyColor(d2), 0.5);
    c = [c[0] * (0.93 + k * 0.14), c[1] * (0.93 + k * 0.14), c[2] * (0.95 + k * 0.12)];
    const len = R * (0.05 + r() * 0.05) * (1 - 0.4 * Math.abs(Math.sin(el)));
    sky.add(d[0] * R, d[1] * R, d[2] * R, dir[0], dir[1], dir[2], null, len, len * (0.26 + r() * 0.12), c, { mark: r() < 0.5 ? MARKS.flat : r() < 0.5 ? MARKS.long : MARKS.curve, light: 0, glow: 1, rank: 0 });
  }
  // stars, away from the sun
  for (let i = 0; i < 700; i++) {
    const az = r() * Math.PI * 2, el = Math.asin(0.2 + r() * 0.8);
    const d = dirOf(az, el);
    if (sunness(d[0], d[2]) > 0.08 + r() * 0.1) continue;
    const b = r();
    const c: RGB = mix(hex('#9aa8ff'), hex('#fff6dc'), b);
    const s = R * (0.004 + b * b * 0.006);
    sky.add(d[0] * R * 0.99, d[1] * R * 0.99, d[2] * R * 0.99, r() - 0.5, r() - 0.5, 0, null, s * 1.6, s * 1.2, c, { mark: MARKS.round, light: 0, glow: 1, rank: 0 });
  }
  // the moon over the castle: pale disc, a violet halo
  {
    const m = MOON;
    const t: [number, number, number] = [-m[2], 0, m[0]];
    const tl = Math.hypot(t[0], t[2]);
    t[0] /= tl; t[2] /= tl;
    const up = [m[1] * t[2] * 0 - 0, 1, 0];
    const u2: [number, number, number] = [t[1] * m[2] - t[2] * m[1], t[2] * m[0] - t[0] * m[2], t[0] * m[1] - t[1] * m[0]];
    void up;
    const halo = 0.13, disc = 0.045;
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2, q = Math.sqrt(r());
      const inDisc = i < 520;
      const rad = inDisc ? q * disc : disc + q * halo;
      const ox = Math.cos(a) * rad, oy = Math.sin(a) * rad;
      const d = [m[0] + t[0] * ox + u2[0] * oy, m[1] + t[1] * ox + u2[1] * oy, m[2] + t[2] * ox + u2[2] * oy];
      const l = Math.hypot(d[0], d[1], d[2]);
      const crater = noise2(ox * 120, oy * 120) > 0.68;
      const c: RGB = inDisc ? (crater ? hex('#b8b4d8') : mix(hex('#e8e4ff'), hex('#fffaf0'), r())) : mix(skyColor([d[0] / l, d[1] / l, d[2] / l]), hex('#b4aef0'), 0.75 * Math.pow(1 - (rad - disc) / halo, 2));
      const dirx = inDisc ? -oy : -oy;
      const s = inDisc ? R * 0.012 : R * 0.03;
      sky.add((d[0] / l) * R * (inDisc ? 0.97 : 0.98), (d[1] / l) * R * (inDisc ? 0.97 : 0.98), (d[2] / l) * R * (inDisc ? 0.97 : 0.98), dirx * t[0] + ox * u2[0], ox * u2[1] + 0.01, dirx * t[2] + ox * u2[2], null, s, s * 0.6, c, { mark: inDisc ? MARKS.round : MARKS.curve, light: 0, glow: 1, rank: 0 });
    }
  }
  // the sun, low, its glow in rings of strokes
  {
    const s = SUN;
    const t: [number, number, number] = [-s[2], 0, s[0]];
    const tl = Math.hypot(t[0], t[2]);
    t[0] /= tl; t[2] /= tl;
    const u2: [number, number, number] = [t[1] * s[2] - t[2] * s[1], t[2] * s[0] - t[0] * s[2], t[0] * s[1] - t[1] * s[0]];
    for (let i = 0; i < 1600; i++) {
      const a = r() * Math.PI * 2, q = Math.pow(r(), 0.8);
      const rad = q * 0.16;
      const ox = Math.cos(a) * rad, oy = Math.sin(a) * rad;
      const d = [s[0] + t[0] * ox + u2[0] * oy, s[1] + t[1] * ox + u2[1] * oy, s[2] + t[2] * ox + u2[2] * oy];
      const l = Math.hypot(d[0], d[1], d[2]);
      const core = rad < 0.028;
      const c: RGB = core ? mix(hex('#fff6d8'), hex('#ffffff'), r()) : mix(hex('#ffe9a8'), skyColor([d[0] / l, d[1] / l, d[2] / l]), smooth(0.03, 0.16, rad));
      // strokes run round the sun
      const dx = -oy, dy = ox;
      const sz = core ? R * 0.012 : R * (0.02 + rad * 0.25);
      sky.add((d[0] / l) * R * 0.97, (d[1] / l) * R * 0.97, (d[2] / l) * R * 0.97, dx * t[0] + dy * u2[0], dx * t[1] + dy * u2[1], dx * t[2] + dy * u2[2], null, sz, sz * 0.4, c, { mark: core ? MARKS.round : MARKS.curve, light: 0, glow: 1, rank: 0 });
    }
  }
  const skyMeshes = sky.build();
  for (const m of skyMeshes) group.add(m);

  // clouds: banks lit from below by the low sun
  const clouds = new DabSet(SKY_KIND, 30000, 12);
  for (let c = 0; c < 46; c++) {
    const sunSide = r() < 0.6;
    const sunAz = Math.atan2(SUN_H[1], SUN_H[0]);
    const az = sunSide ? sunAz + (r() - 0.5) * 2.4 : r() * Math.PI * 2;
    const el = (2 + Math.pow(r(), 1.6) * 24) * (Math.PI / 180);
    const w = (0.08 + r() * 0.22) * (1 - el), h = (0.025 + r() * 0.05) * (0.6 + w * 2);
    const n = Math.round(w * h * 1.6e5) + 40;
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, v = r();
      // heaped top, flat bottom
      const top = h * Math.pow(Math.max(0, 1 - u * u), 0.7) * (0.35 + 0.9 * noise2(u * 4 + c * 3, 2) + 0.4 * noise2(u * 11 + c, 5));
      if (v * h > top) continue;
      const a = az + u * w, e = el + v * h * 1.2;
      const d = dirOf(a, e);
      const k = sunness(d[0], d[2]);
      const low = 1 - v * h / Math.max(top, 1e-3);
      const lit = mix(mix(hex('#c88aa6'), hex('#ffcf86'), k), hex('#fff0c8'), k * low * low);
      const shade = mix(hex('#3a3266'), hex('#7a5a8e'), k);
      let col = mix(shade, lit, clamp(low * (0.4 + k * 0.8) + (r() - 0.5) * 0.3));
      col = mix(col, skyColor(d), 0.15 + (1 - k) * 0.2);
      const len = R * (0.022 + r() * 0.03);
      const tx = -Math.sin(a), tz = Math.cos(a);
      const curl = (noise2(u * 5 + c, v * 3) - 0.5) * 1.2;
      clouds.add(d[0] * R * 0.95, d[1] * R * 0.95, d[2] * R * 0.95, tx, curl * 0.6 + (r() - 0.5) * 0.15, tz, null, len, len * 0.34, col, { mark: r() < 0.5 ? MARKS.long : MARKS.dry, light: 0, glow: 1, rank: 0 });
    }
  }
  const cloudGroup = new THREE.Group();
  for (const m of clouds.build()) cloudGroup.add(m);
  group.add(cloudGroup);
  return { group, clouds: cloudGroup, counts: sky.n + clouds.n };
}

// ---------------------------------------------------------------------------------------------
// mountains

const RANGES = [
  { d: 860, base: 70, amp: 230, k: 3.0, air: 0.62, seed: 1 },
  { d: 640, base: 40, amp: 150, k: 5.0, air: 0.42, seed: 2 },
  { d: 450, base: 20, amp: 85, k: 8.0, air: 0.22, seed: 3 },
];
const CENTRE = [0, -80];

function ridge(th: number, R: (typeof RANGES)[number]): number {
  const s = R.seed * 13.1;
  let h = fbm(th * R.k + s, s * 0.7, 4);
  h = 1 - Math.abs(h * 2 - 1); // sharp ridges
  h = Math.pow(h, 1.6);
  // lower behind the castle (north), so the spires stand against the sky
  const north = Math.max(0, Math.sin(th));
  return R.base + R.amp * h * (1 - 0.55 * north * north) + R.amp * 0.25 * noise2(th * R.k * 6, s);
}

export function buildMountains(): { meshes: THREE.Object3D[]; count: number } {
  const r = rng(777);
  const far = new DabSet(FAR_KIND, 60000, 21);
  const under = new Under();
  const out: THREE.Object3D[] = [];
  for (const R of RANGES) {
    const steps = 1440;
    let prev: { p: number[]; top: number[]; c: RGB } | null = null;
    for (let i = 0; i <= steps; i++) {
      const th = (i / steps) * Math.PI * 2;
      const dx = Math.cos(th), dz = Math.sin(th);
      const h = ridge(th, R);
      const x = CENTRE[0] + dx * R.d, z = CENTRE[1] + dz * R.d;
      const horizon = skyColor([-dx * 0, 0.02, 0].map((v, j) => (j === 0 ? dx : j === 2 ? dz : v)) as [number, number, number]);
      const facing = -(dx * SUN_H[0] + dz * SUN_H[1]); // the side we see faces the centre
      const base = ramp(RAMP.mountain, 0.25 + Math.max(0, facing) * 0.3);
      const c = mix(base, horizon, R.air * 0.85 * 0.85);
      if (prev) {
        under.tri(prev.p, [x, -40, z], [x, h, z], prev.c, c, c);
        under.tri(prev.p, [x, h, z], prev.top, prev.c, c, prev.c);
      }
      prev = { p: [x, -40, z], top: [x, h, z], c };
    }
    // strokes over the face of the range
    const n = Math.round((R.d * 2 * Math.PI * (R.base + R.amp * 0.45 + 20) * 2.4) / (R.d * 0.026 * R.d * 0.026 * 0.35 * 0.5));
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2;
      const h = ridge(th, R);
      const y = -20 + Math.pow(r(), 0.7) * (h + 20);
      const dx = Math.cos(th), dz = Math.sin(th);
      const slope = (ridge(th + 0.002, R) - ridge(th - 0.002, R)) / (0.004 * R.d);
      const x = CENTRE[0] + dx * R.d, z = CENTRE[1] + dz * R.d;
      const facing = -(dx * SUN_H[0] + dz * SUN_H[1]);
      const rel = (y + 20) / (h + 20);
      const tx = -dz, tz = dx;
      // light: the slope turns a face toward or away from the sun
      const side = slope * (tx * SUN_H[0] + tz * SUN_H[1]) * -1;
      const lit = clamp(facing * 0.55 + side * 0.6 + 0.2) * smooth(0.1, 0.8, rel);
      let col = ramp(RAMP.mountain, clamp(0.1 + lit * 0.7 + (r() - 0.5) * 0.12));
      if (rel > 0.72 && h > R.base + R.amp * 0.5) col = mix(col, mix(hex('#9a8ac8'), hex('#ffd6c4'), lit), 0.55 * smooth(0.72, 0.9, rel)); // snow
      // the ridge line toward the sun burns at its rim
      if (facing < 0 && rel > 0.96) col = mix(col, hex('#ffb07a'), (-facing) * 0.6);
      const horizon = skyColor([dx, 0.03 + rel * 0.08, dz]);
      col = mix(col, horizon, R.air * 0.85 * (1 - rel * 0.3));
      const len = R.d * (0.02 + r() * 0.014);
      // strokes run down the slopes
      const dy = -1, along = slope * 6 + (r() - 0.5);
      far.add(x - dx * r() * 4, y, z - dz * r() * 4, tx * along, dy, tz * along, null, len, len * 0.35, col, { mark: r() < 0.5 ? MARKS.long : MARKS.dry, light: 0, glow: 0.4 });
    }
    // mist pooled at the foot of the range
    for (let i = 0; i < 900; i++) {
      const th = r() * Math.PI * 2;
      const dx = Math.cos(th), dz = Math.sin(th);
      const x = CENTRE[0] + dx * (R.d - 30), z = CENTRE[1] + dz * (R.d - 30);
      const k = sunness(dx, dz);
      const col = mix(mix(hex('#6e5a9a'), hex('#e6a88c'), k), [1, 1, 1], 0.1 * r());
      const len = R.d * (0.05 + r() * 0.05);
      far.add(x, -5 + r() * R.base * 0.6, z, -dz, 0, dx, null, len, len * 0.15, col, { mark: MARKS.long, light: 0, glow: 0.6 });
    }
  }
  const um = under.build(0.15, true);
  um.renderOrder = -12;
  out.push(um, ...far.build());
  return { meshes: out, count: far.n };
}
