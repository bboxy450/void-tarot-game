// buildWorld(): the whole static painted scene, built once at load.
import * as THREE from 'three';
import { DabSet, type Kind } from '../paint/dabs';
import { Under } from '../paint/under';
import { bakeTerrainShadow, addLamp } from '../paint/light';
import { rng, fbm, smooth } from '../paint/util';
import { MARKS } from '../paint/brush';
import { LAMP, LAMP_HOT } from '../paint/palette';
import { mix, hex } from '../paint/util';
import { HOUSES, POND, STONES, TENT, PATHS, groundHeight, pathInfo, hillMask, reachOf, streamDist } from './layout';
import { paintTree, paintFir, paintBush, paintHouse, paintStone, houseLamps, paintTent, tentLamps } from './things';
import { castleLamps, paintCastle, FLAMES } from './castle';
import { paintGround } from './ground';
import { buildSky, buildMountains } from './sky';
import { paintTube } from './surfaces';
import type { Collider, Ctx } from './ctx';

export const KINDS: Record<string, Kind> = {
  ground: { name: 'ground', minPx: 5, maxPx: 170, gust: 0, mist: 1, depthStep: 1, cell: 48, impasto: 1.0 },
  grass: { name: 'grass', minPx: 2.5, maxPx: 70, gust: 0.55, mist: 1, depthStep: 0, cell: 48, keepFloor: 0 },
  leaves: { name: 'leaves', minPx: 5, maxPx: 120, gust: 0.42, mist: 1, depthStep: 0, cell: 48, impasto: 1.0 },
  solid: { name: 'solid', minPx: 4.5, maxPx: 150, gust: 0, mist: 1, depthStep: 1, cell: 48, impasto: 1.0 },
  glow: { name: 'glow', minPx: 1.5, maxPx: 50, gust: 0, mist: 0.35, depthStep: 1.5, cell: 0, impasto: 0.6, broken: 0.25 },
};

export interface World {
  scene: THREE.Scene;
  sky: THREE.Group;
  clouds: THREE.Object3D;
  colliders: Collider[];
  flames: [number, number, number][];
  counts: Record<string, number>;
}

const LAMP_POSTS: [number, number][] = [[16, -82], [6, -99], [2, -119], [-5, -137], [64, -98]];

export function buildWorld(): World {
  const scene = new THREE.Scene();
  const r = rng(1234);
  const ctx: Ctx = {
    ground: new DabSet(KINDS.ground, 1 << 18, 1),
    grass: new DabSet(KINDS.grass, 1 << 18, 2),
    leaves: new DabSet(KINDS.leaves, 1 << 18, 3),
    solid: new DabSet(KINDS.solid, 1 << 18, 4),
    glow: new DabSet(KINDS.glow, 1 << 14, 5),
    far: new DabSet(KINDS.solid, 16, 6),
    under: new Under(),
    r,
    colliders: [],
    detail: (x, z) => Math.max(0.06, 1 - 0.94 * reachOf(x, z)),
  };

  // lamps first: their light is mixed into everything painted after
  castleLamps();
  for (const h of HOUSES) houseLamps(h);
  tentLamps();
  for (const [x, z] of LAMP_POSTS) addLamp(x, groundHeight(x, z) + 2.8, z, 9, 0.6);
  addLamp(STONES.x, groundHeight(STONES.x, STONES.z) + 2.5, STONES.z, 17, 0.8, hex('#8a70ff'));
  bakeTerrainShadow((x, z) => groundHeight(x, z));

  paintCastle(ctx);
  for (const h of HOUSES) paintHouse(ctx, h);
  paintTent(ctx);
  // the standing stones, one fallen lintel
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const x = STONES.x + Math.cos(a) * STONES.r, z = STONES.z + Math.sin(a) * STONES.r;
    paintStone(ctx, x, z, 3.4 + r() * 2.4 + (i === 0 ? 1.4 : 0), 1.5 + r() * 0.7, -a + Math.PI / 2 + (r() - 0.5) * 0.3);
  }
  paintStone(ctx, STONES.x, STONES.z, 1.0, 2.4, 0.4); // the altar stone in the middle
  // lamp posts
  for (const [x, z] of LAMP_POSTS) {
    const y = groundHeight(x, z);
    paintTube(ctx.solid, r, x, y - 0.3, z, 0.09, 0.07, 3.0, { ramp: 'wood', len: 0.18, grainMode: 'v' });
    for (let i = 0; i < 44; i++) ctx.glow.add(x + (r() - 0.5) * 0.3, y + 2.75 + (r() - 0.5) * 0.4, z + (r() - 0.5) * 0.3, 0, 1, 0, null, 0.13, 0.09, mix(LAMP, LAMP_HOT, r()), { mark: MARKS.press, light: 0, glow: 1 });
    ctx.colliders.push({ kind: 'circle', x, z, r: 0.3 });
  }

  // trees, firs and bushes
  const keepClear = (x: number, z: number, d: number) => {
    if (pathInfo(x, z).d < d) return false;
    if (hillMask(x, z) > 0.75) return false;
    if (Math.abs(x) < 26 && z > -60 && z < 8) return false; // the view from the gate
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 4) return false;
    if (streamDist(x, z).d < 4) return false;
    if (Math.hypot(x - STONES.x, z - STONES.z) < STONES.r + 22) return false;
    if (Math.hypot(x - TENT.x, z - TENT.z) < 9) return false;
    for (const h of HOUSES) if (Math.hypot(x - h.x, z - h.z) < Math.max(h.w, h.d) + 2.5) return false;
    return true;
  };
  let trees = 0, firs = 0;
  for (let z = -300; z < 100; z += 6.5) {
    for (let x = -230; x < 230; x += 6.5) {
      const px = x + (r() - 0.5) * 6, pz = z + (r() - 0.5) * 6;
      if (Math.hypot(px * 0.9, pz + 80) > 285) continue;
      const wood = fbm(px * 0.016 + 40, pz * 0.016, 3);
      const rim = Math.max(smooth(85, 140, Math.abs(px)), smooth(-170, -230, pz), smooth(45, 80, pz));
      const east = smooth(80, 100, px) * smooth(-150, -110, pz) * smooth(-40, -80, pz); // the wood behind the seer
      const p = smooth(0.5, 0.7, wood) * 0.5 + rim * 0.28 + east * 0.6 + 0.012;
      if (r() > p) continue;
      if (!keepClear(px, pz, 4)) continue;
      const reach = reachOf(px, pz);
      if ((rim > 0.4 && r() < 0.8) || r() < 0.2 + reach * 0.3) {
        paintFir(ctx, px, pz, 0.85 + r() * 0.5);
        firs++;
      } else {
        paintTree(ctx, px, pz, 0.85 + r() * 0.45, r() < 0.22 ? 'autumn' : 'green');
        trees++;
      }
    }
  }
  // a few trees framing the descent from the gate
  for (const [x, z, s] of [[-22, -20, 1.1], [-27, -36, 1.2], [24, -18, 1.0], [30, -40, 1.25], [-33, -8, 0.9], [-30, -55, 1.15], [33, -58, 1.0]] as const) {
    paintTree(ctx, x, z, s, z < -50 ? 'autumn' : 'green');
    trees++;
  }
  let bushes = 0;
  for (const p of PATHS) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < len; t += 3.2) {
        if (r() > 0.45) continue;
        const f = t / len;
        const side = r() < 0.5 ? -1 : 1;
        const off = p.width + 2.2 + r() * 4;
        const x = ax + (bx - ax) * f - ((bz - az) / len) * off * side, z = az + (bz - az) * f + ((bx - ax) / len) * off * side;
        if (!keepClear(x, z, 1.6)) continue;
        if (Math.abs(x) < 12 && z > -8) continue;
        paintBush(ctx, x, z, 0.9 + r() * 0.6, r() < 0.3);
        bushes++;
      }
    }
  }
  // bushes round the houses and the pond
  for (let i = 0; i < 70; i++) {
    const h = HOUSES[i % HOUSES.length];
    const a = r() * Math.PI * 2, d = Math.max(h.w, h.d) * 0.75 + 1.5 + r() * 2;
    const x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
    if (pathInfo(x, z).d < 1.2) continue;
    paintBush(ctx, x, z, 0.7 + r() * 0.5, r() < 0.4);
    bushes++;
  }

  // the ground last: it reads the shadows everything cast
  paintGround(ctx);

  const counts: Record<string, number> = { trees, firs, bushes };
  for (const k of ['ground', 'grass', 'leaves', 'solid', 'glow'] as const) {
    const set = ctx[k];
    counts[k] = set.n;
    for (const m of set.build()) scene.add(m);
  }
  const under = ctx.under.build(1, false);
  scene.add(under);

  const sky = buildSky();
  scene.add(sky.group);
  const mountains = buildMountains();
  for (const m of mountains.meshes) scene.add(m);
  counts.sky = sky.counts;
  counts.far = mountains.count;
  counts.total = Object.entries(counts).filter(([k]) => !['trees', 'firs', 'bushes'].includes(k)).reduce((a, [, v]) => a + v, 0);
  return { scene, sky: sky.group, clouds: sky.clouds, colliders: ctx.colliders, flames: FLAMES, counts };
}
