// Casting the cards. Each suit is an element; elements leave residue on the ground and combine:
// earth leaves oil, fire on oil explodes; water leaves a splash, air charges the water, then it zaps.
import * as THREE from 'three';
import { MARKS } from '../paint/brush';
import { hex, mix, noise2, type RGB } from '../paint/util';
import { shared } from '../paint/shaders';
import { groundHeight, waterAt } from '../world/layout';
import type { FX, Lights, Jolt } from './fx';
import type { Suit } from './cardData';

export type Element = 'fire' | 'water' | 'air' | 'earth';
export const ELEMENT_OF: Record<Exclude<Suit, 'major'>, Element> = { wands: 'fire', cups: 'water', swords: 'air', pentacles: 'earth' };

export interface Target { pos: THREE.Vector3; alive: boolean; radius: number }
export interface Foes {
  targets(): Target[];
  hit(t: Target, dmg: number, from: THREE.Vector3, kind: string): void;
}
export type Sound = (name: string, at?: THREE.Vector3, gain?: number) => void;

type PatchKind = 'oil' | 'wet' | 'charged' | 'fire' | 'scorch';
interface Patch { kind: PatchKind; x: number; y: number; z: number; r: number; dabs: number[]; age: number; life: number; light?: ReturnType<Lights['add']>; spark: number }

interface Bolt { el: Element | 'trump'; card: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; grav: number; range: number; travelled: number }

const C = {
  fire: ['#fff3c0', '#ffd060', '#ff9a30', '#f05a20', '#a02818'].map(hex),
  smoke: ['#2a2238', '#3e3450', '#5a4e66'].map(hex),
  water: ['#e8f4ff', '#9cc4ff', '#5a86e0', '#3050b0', '#1e2c78'].map(hex),
  air: ['#ffffff', '#e8f0ff', '#c8d4f0', '#a8b4e0'].map(hex),
  earth: ['#5a3a26', '#3e2818', '#7a5634', '#2a1c14'].map(hex),
  oil: ['#120c18', '#1a1222', '#22182c', '#0c0810'].map(hex),
  sheen: ['#6a3aa8', '#2a7a7a', '#a08a30', '#c070c0'].map(hex),
  zap: ['#ffffff', '#d8f6ff', '#8ee8ff', '#a08cff'].map(hex),
  void: ['#1a0e3a', '#4a2a9a', '#9a7aff', '#e0d4ff'].map(hex),
};
const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Spells {
  bolts: Bolt[] = [];
  patches: Patch[] = [];
  dayUntil = 0;
  stars: { i: number; t: number }[] = [];
  starUntil = 0;
  private pushT = 0;
  private time = 0;

  constructor(private fx: FX, private lights: Lights, private jolt: Jolt, private foes: Foes, private sound: Sound, private heal: () => void) {}

  floorAt(x: number, z: number) {
    const w = waterAt(x, z);
    return w !== null ? Math.max(w, groundHeight(x, z)) : groundHeight(x, z);
  }

  /** Throw a card's element from the eye along dir. */
  cast(el: Element | 'trump', card: number, from: THREE.Vector3, dir: THREE.Vector3) {
    const sp = { fire: 30, water: 24, air: 42, earth: 22, trump: 34 }[el];
    const grav = { fire: 6, water: 11, air: 0, earth: 13, trump: 3 }[el];
    const up = el === 'air' ? 0 : 0.12;
    this.bolts.push({ el, card, x: from.x + dir.x * 0.8, y: from.y - 0.25 + dir.y * 0.8, z: from.z + dir.z * 0.8, vx: dir.x * sp, vy: (dir.y + up) * sp, vz: dir.z * sp, age: 0, grav, range: el === 'air' ? 38 : 90, travelled: 0 });
    this.sound('throw');
    this.sound(el === 'trump' ? 'trump' : 'cast_' + el);
    if (el === 'trump') this.trumpCast(card, from, dir);
  }

  update(dt: number, t: number, eye: THREE.Vector3) {
    this.time = t;
    // bolts in flight
    for (const b of this.bolts) {
      b.age += dt;
      b.vy -= b.grav * dt;
      const ox = b.x, oz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.travelled += Math.hypot(b.x - ox, b.z - oz);
      this.trail(b, dt);
      // a gust in its path: over water it charges it, it bends the grass
      if (b.el === 'air') {
        shared.uPush.value.set(b.x, b.y, b.z, 1.6);
        shared.uPushR.value = 5;
        this.pushT = 0.35;
        for (const p of this.patches) if ((p.kind === 'wet' || p.kind === 'charged' || p.kind === 'fire') && Math.hypot(p.x - b.x, p.z - b.z) < p.r + 1 && b.y - p.y < 3) { this.land(b, p); break; }
      }
      if (b.age > 9) { b.age = -1; continue; }
      const fl = this.floorAt(b.x, b.z);
      let hit = b.y <= fl + 0.05;
      for (const f of this.foes.targets()) {
        if (!f.alive) continue;
        if (Math.hypot(f.pos.x - b.x, f.pos.y + 1.1 - b.y, f.pos.z - b.z) < f.radius + 0.5) {
          this.foes.hit(f, b.el === 'trump' ? 3 : 1, new THREE.Vector3(b.x, b.y, b.z), b.el);
          hit = true;
        }
      }
      if (b.age > 0 && b.travelled > b.range && b.el === 'air') { this.gustOut(b); b.age = -1; continue; }
      if (hit && b.age > 0) {
        b.y = Math.max(b.y, fl);
        this.land(b);
      }
    }
    this.bolts = this.bolts.filter((b) => b.age >= 0);
    if (this.pushT > 0) {
      this.pushT -= dt;
      shared.uPush.value.w *= Math.max(0, 1 - dt * 3);
      if (this.pushT <= 0) shared.uPush.value.w = 0;
    }
    this.updatePatches(dt, t, eye);
    // the Star's motes
    if (this.stars.length) {
      for (const s of this.stars) {
        if (!this.fx.isAlive(s.i)) continue;
        for (const f of this.foes.targets()) {
          if (f.alive && Math.random() < dt * 2 && Math.hypot(f.pos.x - eye.x, f.pos.z - eye.z) < 9) {
            this.foes.hit(f, 1, eye.clone(), 'star');
            this.bolt([eye.x, eye.y + 2, eye.z], [f.pos.x, f.pos.y + 1.2, f.pos.z], 0.25, [hex('#fff4c0'), hex('#c8b0ff')]);
          }
        }
      }
      if (t > this.starUntil) this.stars = [];
    }
    // the Sun
    const dayGoal = t < this.dayUntil ? 1 : 0;
    shared.uDay.value += (dayGoal - shared.uDay.value) * Math.min(1, dt * 0.8);
  }

  private trail(b: Bolt, dt: number) {
    const fx = this.fx;
    const n = Math.ceil(dt * 90);
    for (let i = 0; i < n; i++) {
      const j = () => rnd(-0.12, 0.12);
      if (b.el === 'fire') {
        fx.spawn({ x: b.x + j(), y: b.y + j(), z: b.z + j(), vx: rnd(-1, 1), vy: rnd(0.5, 2), vz: rnd(-1, 1), life: rnd(0.25, 0.5), size: rnd(0.35, 0.6), size1: 0.05, col: pick(C.fire.slice(0, 3)), col1: C.fire[4], mark: MARKS.flick, wid: 0.5, glow: 1 });
        if (Math.random() < 0.3) fx.spawn({ x: b.x, y: b.y, z: b.z, vx: rnd(-0.5, 0.5), vy: rnd(0.6, 1.4), vz: rnd(-0.5, 0.5), life: rnd(0.8, 1.4), size: 0.3, size1: 0.8, col: C.smoke[1], col1: C.smoke[2], mark: MARKS.round, glow: 0.2, light: 0.5 });
      } else if (b.el === 'water') {
        fx.spawn({ x: b.x + j(), y: b.y + j(), z: b.z + j(), vx: rnd(-0.8, 0.8), vy: rnd(-1, 0.5), vz: rnd(-0.8, 0.8), life: rnd(0.2, 0.45), size: rnd(0.2, 0.42), size1: 0.04, col: pick(C.water.slice(0, 3)), col1: C.water[3], mark: MARKS.round, glow: 0.7, grav: 6 });
      } else if (b.el === 'air') {
        const sp = Math.hypot(b.vx, b.vz);
        const a = b.age * 26 + i;
        const px = -b.vz / sp, pz = b.vx / sp;
        const rr = 0.45;
        fx.spawn({ x: b.x + px * Math.cos(a) * rr, y: b.y + Math.sin(a) * rr, z: b.z + pz * Math.cos(a) * rr, life: rnd(0.25, 0.5), size: rnd(0.7, 1.3), size1: 0.1, col: pick(C.air), col1: hex('#8a94c8'), mark: MARKS.long, wid: 0.18, glow: 0.8, dir: [b.vx, 0, b.vz] });
      } else if (b.el === 'earth') {
        fx.spawn({ x: b.x + j(), y: b.y + j(), z: b.z + j(), vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), vz: rnd(-0.5, 0.5), life: rnd(0.2, 0.4), size: rnd(0.25, 0.4), size1: 0.1, col: pick(C.earth), mark: MARKS.press, glow: 0.1, light: 1, grav: 5 });
      } else {
        fx.spawn({ x: b.x + j() * 2, y: b.y + j() * 2, z: b.z + j() * 2, vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(-1, 1), life: rnd(0.3, 0.7), size: rnd(0.3, 0.6), size1: 0.02, col: pick(C.void.slice(2)), col1: C.void[1], mark: MARKS.round, glow: 1 });
      }
    }
    // the core of the bolt: one bright dab
    const core: Record<string, RGB> = { fire: C.fire[0], water: C.water[1], air: C.air[0], earth: C.earth[2], trump: C.void[3] };
    fx.spawn({ x: b.x, y: b.y, z: b.z, life: 0.05, size: b.el === 'earth' ? 0.55 : 0.7, col: core[b.el], mark: MARKS.round, wid: 0.9, glow: b.el === 'earth' ? 0.2 : 1, light: b.el === 'earth' ? 1 : 0 });
  }

  private near(x: number, z: number, pad: number, kinds: PatchKind[]): Patch | null {
    let best: Patch | null = null, bd = 1e9;
    for (const p of this.patches) {
      if (!kinds.includes(p.kind)) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < p.r + pad && d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** A bolt lands (on the ground, a foe, or over a patch it was passing). */
  private land(b: Bolt, over?: Patch) {
    b.age = -1;
    const x = b.x, z = b.z;
    const y = this.floorAt(x, z);
    const at = new THREE.Vector3(x, y, z);
    const charged = over?.kind === 'charged' ? over : this.near(x, z, 1.2, ['charged']);
    if (charged && b.el !== 'trump') { this.zap(charged); return; }
    switch (b.el) {
      case 'fire': {
        const oil = this.near(x, z, 1.4, ['oil']);
        if (oil) { this.explode(oil); return; }
        const wet = this.near(x, z, 0.8, ['wet']);
        if (wet) { this.steam(wet.x, wet.y, wet.z, wet.r); this.removePatch(wet); this.sound('steam', at); return; }
        this.burst(at, C.fire, 70, 4.5, 0.55, MARKS.flick);
        this.flame(x, y, z, 1.8, 7);
        this.hurtAround(at, 2.5, 1, 'fire');
        this.sound('fire', at);
        return;
      }
      case 'water': {
        const fire = this.near(x, z, 1.0, ['fire']);
        if (fire) { this.steam(fire.x, fire.y, fire.z, fire.r); this.removePatch(fire); this.sound('steam', at); }
        this.burst(at, C.water, 80, 5, 0.38, MARKS.round, 9);
        this.splash(x, y, z, 2.8);
        this.hurtAround(at, 2.2, 1, 'water');
        this.sound('water', at);
        return;
      }
      case 'air': {
        const wet = over?.kind === 'wet' ? over : this.near(x, z, 1.2, ['wet']);
        if (wet) { this.charge(wet); return; }
        const fire = over?.kind === 'fire' ? over : this.near(x, z, 1.0, ['fire']);
        if (fire) { this.flame(fire.x, fire.y, fire.z, fire.r * 1.6, 6); this.burst(new THREE.Vector3(fire.x, fire.y, fire.z), C.fire, 120, 7, 0.6, MARKS.flick); this.hurtAround(new THREE.Vector3(fire.x, fire.y, fire.z), 5, 2, 'fire'); this.sound('fire', at, 1.4); return; }
        this.gustOut(b);
        return;
      }
      case 'earth': {
        const fire = this.near(x, z, 1.0, ['fire']);
        this.burst(at, C.earth, 60, 4, 0.4, MARKS.press, 12);
        this.oil(x, y, z, 2.6);
        this.hurtAround(at, 2, 1, 'earth');
        this.jolt.shake(0.15);
        this.sound('earth', at);
        if (fire) { const o = this.patches[this.patches.length - 1]; this.explode(o); }
        return;
      }
      case 'trump':
        this.trumpLand(b.card, at);
        return;
    }
  }

  private gustOut(b: Bolt) {
    const at = new THREE.Vector3(b.x, Math.max(b.y, this.floorAt(b.x, b.z)), b.z);
    shared.uPush.value.set(at.x, at.y, at.z, 2.4);
    shared.uPushR.value = 7;
    this.pushT = 0.8;
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.spawn({ x: at.x, y: at.y + rnd(0.2, 1.6), z: at.z, vx: Math.cos(a) * rnd(4, 9), vy: rnd(-0.5, 1), vz: Math.sin(a) * rnd(4, 9), drag: 2, life: rnd(0.4, 0.8), size: rnd(0.8, 1.4), size1: 0.1, col: pick(C.air), mark: MARKS.long, wid: 0.15, glow: 0.7, dir: [-Math.sin(a), 0, Math.cos(a)] });
    }
    this.hurtAround(at, 3, 1, 'air');
    this.sound('air', at);
  }

  private hurtAround(at: THREE.Vector3, r: number, dmg: number, kind: string) {
    for (const f of this.foes.targets()) if (f.alive && Math.hypot(f.pos.x - at.x, f.pos.z - at.z) < r) this.foes.hit(f, dmg, at, kind);
  }

  burst(at: THREE.Vector3, cols: RGB[], n: number, speed: number, size: number, mark: number, grav = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random();
      const s = speed * (0.3 + Math.random() * 0.7);
      this.fx.spawn({ x: at.x, y: at.y + 0.3, z: at.z, vx: Math.cos(a) * s * (1 - u * 0.5), vy: s * (0.4 + u), vz: Math.sin(a) * s * (1 - u * 0.5), grav, drag: 1.2, life: rnd(0.4, 1.0), size: size * rnd(0.6, 1.3), size1: size * 0.1, col: pick(cols.slice(0, 3)), col1: cols[cols.length - 1], mark, glow: 0.9, floor: at.y + 0.05 });
    }
  }

  // ------------------------------------------------------------------------------------------
  // patches on the ground

  private blob(x: number, z: number, r: number, density: number, fn: (px: number, py: number, pz: number, d: number) => number) {
    const dabs: number[] = [];
    const n = Math.round(Math.PI * r * r * density);
    const seed = Math.random() * 100;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, q = Math.sqrt(Math.random());
      const edge = r * (0.72 + 0.4 * noise2(Math.cos(a) * 2 + seed, Math.sin(a) * 2));
      const d = q * edge;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const py = this.floorAt(px, pz) + 0.06 + Math.random() * 0.02;
      const id = fn(px, py, pz, d / r);
      if (id >= 0) dabs.push(id);
    }
    return dabs;
  }

  private addPatch(kind: PatchKind, x: number, y: number, z: number, r: number, dabs: number[], life: number): Patch {
    const p: Patch = { kind, x, y, z, r, dabs, age: 0, life, spark: 0 };
    this.patches.push(p);
    return p;
  }

  removePatch(p: Patch, over = 0.5) {
    for (const i of p.dabs) this.fx.fade(i, over * (0.5 + Math.random()));
    if (p.light) this.lights.remove(p.light);
    this.patches = this.patches.filter((q) => q !== p);
  }

  oil(x: number, y: number, z: number, r: number) {
    const dabs = this.blob(x, z, r, 26, (px, py, pz) => {
      const sheen = Math.random() < 0.22;
      const c = sheen ? mix(pick(C.sheen), C.oil[0], 0.35) : pick(C.oil);
      const a = Math.random() * Math.PI;
      return this.fx.spawn({ x: px, y: py, z: pz, life: Infinity, size: rnd(0.3, 0.6), col: c, mark: sheen ? MARKS.curve : pick([MARKS.press, MARKS.round, MARKS.flat]), lie: true, dir: [Math.cos(a), 0, Math.sin(a)], glow: sheen ? 0.4 : 0.05, light: 1, wid: 0.55 });
    });
    this.addPatch('oil', x, y, z, r, dabs, 60);
  }

  splash(x: number, y: number, z: number, r: number) {
    const near = this.near(x, z, 0, ['wet']);
    if (near) { near.age = 0; return; }
    const dabs = this.blob(x, z, r, 26, (px, py, pz, d) => {
      const hi = Math.random() < 0.18;
      const c = hi ? pick([hex('#d8e6ff'), hex('#f2c08a'), hex('#b0a0e8')]) : mix(C.water[3], C.water[4], Math.random() * 0.6 + d * 0.3);
      return this.fx.spawn({ x: px, y: py, z: pz, life: Infinity, size: rnd(0.3, 0.65), col: c, mark: hi ? MARKS.long : pick([MARKS.flat, MARKS.long, MARKS.press]), lie: true, dir: [1, 0, rnd(-0.2, 0.2)], glow: hi ? 0.8 : 0.35, light: 0.8, wid: 0.4 });
    });
    this.addPatch('wet', x, y, z, r, dabs, 50);
  }

  flame(x: number, y: number, z: number, r: number, life: number) {
    const near = this.near(x, z, 0, ['fire']);
    if (near) { near.age = Math.max(0, near.age - life * 0.5); return; }
    const dabs = this.blob(x, z, r * 0.9, 10, (px, py, pz) => this.fx.spawn({ x: px, y: py, z: pz, life: Infinity, size: rnd(0.3, 0.5), col: pick([hex('#1a1014'), hex('#2a1418'), hex('#5a2010')]), mark: MARKS.press, lie: true, dir: [1, 0, 0], glow: 0.1, light: 1 }));
    const p = this.addPatch('fire', x, y, z, r, dabs, life);
    p.light = this.lights.add({ x, y: y + 1, z, r: 10, col: [1, 0.5, 0.15], k: 1.6, life, flicker: 0.4 });
  }

  scorch(x: number, y: number, z: number, r: number) {
    const dabs = this.blob(x, z, r, 14, (px, py, pz) => {
      const ember = Math.random() < 0.08;
      return this.fx.spawn({ x: px, y: py, z: pz, life: Infinity, size: rnd(0.4, 0.8), col: ember ? hex('#ff7a30') : pick([hex('#100a0e'), hex('#1e1418'), hex('#2a2024')]), mark: pick([MARKS.press, MARKS.dry, MARKS.flat]), lie: true, dir: [Math.random(), 0, Math.random()], glow: ember ? 1 : 0, light: 0.5 });
    });
    this.addPatch('scorch', x, y, z, r, dabs, 40);
  }

  private charge(p: Patch) {
    p.kind = 'charged';
    p.age = 0;
    p.life = 40;
    p.light = this.lights.add({ x: p.x, y: p.y + 0.8, z: p.z, r: 9, col: [0.5, 0.85, 1], k: 1.2, life: 40, flicker: 0.6 });
    this.jolt.flashOf(0.25, [0.6, 0.85, 1]);
    this.sound('charge', new THREE.Vector3(p.x, p.y, p.z));
    this.crackle(p, 18);
  }

  private crackle(p: Patch, n: number) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * p.r;
      const x0 = p.x + Math.cos(a) * d, z0 = p.z + Math.sin(a) * d;
      const a2 = a + rnd(-1.5, 1.5), l = rnd(0.4, 1.4);
      this.bolt([x0, this.floorAt(x0, z0) + 0.1, z0], [x0 + Math.cos(a2) * l, this.floorAt(x0, z0) + rnd(0.2, 0.9), z0 + Math.sin(a2) * l], 0.07, [C.zap[1], C.zap[2]], 2);
    }
  }

  private updatePatches(dt: number, t: number, eye: THREE.Vector3) {
    for (const p of [...this.patches]) {
      p.age += dt;
      if (p.age > p.life) { this.removePatch(p, 1.5); continue; }
      if (p.kind === 'fire') {
        const k = 1 - p.age / p.life;
        const n = Math.ceil(dt * 70 * p.r * k + 0.01);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * p.r * 0.85;
          const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
          this.fx.spawn({ x, y: this.floorAt(x, z) + 0.1, z, vx: rnd(-0.3, 0.3), vy: rnd(1.5, 3.2) * (0.6 + k), vz: rnd(-0.3, 0.3), life: rnd(0.35, 0.8), size: rnd(0.35, 0.75) * (0.6 + k * 0.6), size1: 0.05, col: pick(C.fire.slice(0, 3)), col1: C.fire[4], mark: MARKS.flick, wid: 0.45, glow: 1, dir: [0, 1, 0] });
        }
        if (Math.random() < dt * 6) this.fx.spawn({ x: p.x + rnd(-1, 1), y: p.y + 1.5, z: p.z + rnd(-1, 1), vx: rnd(-0.3, 0.3), vy: rnd(1, 2), vz: rnd(-0.3, 0.3), life: rnd(1.5, 2.5), size: 0.5, size1: 1.4, col: C.smoke[0], col1: C.smoke[2], mark: MARKS.round, glow: 0.1, light: 0.6 });
        // fire hurts what stands in it
        for (const f of this.foes.targets()) if (f.alive && Math.hypot(f.pos.x - p.x, f.pos.z - p.z) < p.r && Math.random() < dt * 1.5) this.foes.hit(f, 1, new THREE.Vector3(p.x, p.y, p.z), 'fire');
        const oil = this.patches.find((q) => q.kind === 'oil' && Math.hypot(q.x - p.x, q.z - p.z) < q.r + p.r * 0.7);
        if (oil) this.explode(oil);
      }
      if (p.kind === 'charged') {
        p.spark -= dt;
        if (p.spark <= 0) {
          p.spark = rnd(0.05, 0.25);
          this.crackle(p, 3);
          for (let i = 0; i < 4; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * p.r; this.fx.spawn({ x: p.x + Math.cos(a) * d, y: p.y + rnd(0.1, 0.5), z: p.z + Math.sin(a) * d, vy: rnd(0.3, 0.9), life: rnd(0.4, 0.9), size: rnd(0.08, 0.16), size1: 0.01, col: pick(C.zap), mark: MARKS.round, glow: 1 }); }
          // the paint flickers between water and lightning
          for (let i = 0; i < 6; i++) {
            const id = p.dabs[(Math.random() * p.dabs.length) | 0];
            this.fx.setColor(id, Math.random() < 0.5 ? pick(C.zap) : mix(C.water[3], C.water[2], Math.random()));
          }
          if (Math.random() < 0.3) this.sound('crackle', new THREE.Vector3(p.x, p.y, p.z), 0.5);
        }
        // anything walking into it is zapped
        for (const f of this.foes.targets()) if (f.alive && Math.hypot(f.pos.x - p.x, f.pos.z - p.z) < p.r) { this.zap(p); break; }
      }
      if (p.kind === 'oil' || p.kind === 'wet') {
        // a little sheen moves on the surface
        if (Math.random() < dt * 4) {
          const id = p.dabs[(Math.random() * p.dabs.length) | 0];
          this.fx.setColor(id, p.kind === 'oil' ? (Math.random() < 0.5 ? pick(C.sheen) : pick(C.oil)) : Math.random() < 0.3 ? hex('#e0ecff') : mix(C.water[3], C.water[4], Math.random()));
        }
      }
    }
    void t; void eye;
  }

  // ------------------------------------------------------------------------------------------
  // the combos

  explode(p: Patch) {
    const at = new THREE.Vector3(p.x, p.y, p.z);
    this.removePatch(p, 0.2);
    const fx = this.fx;
    // the fireball: big round strokes swelling and cooling into smoke
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, q = Math.sqrt(1 - u * u);
      const s = rnd(3, 11);
      fx.spawn({ x: at.x, y: at.y + 0.8, z: at.z, vx: Math.cos(a) * q * s, vy: Math.abs(u) * s * 0.9 + 2, vz: Math.sin(a) * q * s, drag: 2.6, grav: -1.5, life: rnd(0.5, 1.0), size: rnd(0.7, 1.3), size1: rnd(0.2, 0.6), col: pick(C.fire.slice(0, 3)), col1: pick(C.fire.slice(2)), mark: pick([MARKS.press, MARKS.curve, MARKS.dry, MARKS.flick]), glow: 1, wid: 0.55, dir: [Math.cos(a) * q, Math.abs(u) + 0.3, Math.sin(a) * q] });
    }
    // sparks flying, falling
    for (let i = 0; i < 380; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random();
      const s = rnd(6, 26);
      fx.spawn({ x: at.x, y: at.y + 0.6, z: at.z, vx: Math.cos(a) * s * (1 - u * 0.6), vy: rnd(3, 18) * (0.4 + u), vz: Math.sin(a) * s * (1 - u * 0.6), grav: 14, drag: 0.6, life: rnd(0.6, 1.8), size: rnd(0.3, 0.7), size1: 0.05, col: pick(C.fire.slice(0, 2)), col1: C.fire[3], mark: MARKS.long, wid: 0.18, glow: 1, floor: at.y });
    }
    // clods of earth and paint torn up
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(4, 12);
      fx.spawn({ x: at.x, y: at.y + 0.3, z: at.z, vx: Math.cos(a) * s, vy: rnd(5, 12), vz: Math.sin(a) * s, grav: 18, life: rnd(0.9, 1.6), size: rnd(0.3, 0.6), size1: 0.2, col: pick([...C.earth, ...C.oil]), mark: MARKS.press, glow: 0, light: 1, floor: at.y + 0.05, spin: rnd(-8, 8), dir: [1, 0, 0] });
    }
    // smoke column
    for (let i = 0; i < 140; i++) fx.spawn({ x: at.x + rnd(-1.5, 1.5), y: at.y + rnd(0.5, 3), z: at.z + rnd(-1.5, 1.5), vx: rnd(-1.2, 1.2), vy: rnd(2, 5.5), vz: rnd(-1.2, 1.2), drag: 0.8, life: rnd(1.6, 3.2), size: rnd(0.6, 1.1), size1: rnd(1.2, 2.2), col: mix(C.fire[3], C.smoke[0], 0.6), col1: pick(C.smoke), mark: pick([MARKS.dry, MARKS.press, MARKS.curve]), glow: 0.1, light: 0.8, wid: 0.5, spin: rnd(-1, 1), dir: [1, rnd(-0.5, 0.5), 0] });
    // a shock ring along the ground
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2;
      if (Math.random() < 0.6) fx.spawn({ x: at.x + Math.cos(a), y: at.y + rnd(0.1, 0.8), z: at.z + Math.sin(a), vx: Math.cos(a) * rnd(11, 18), vy: rnd(0, 1.5), vz: Math.sin(a) * rnd(11, 18), drag: 3.5, life: rnd(0.35, 0.6), size: rnd(0.8, 1.6), size1: 0.2, col: pick(C.fire.slice(0, 3)), col1: C.smoke[1], mark: MARKS.dry, wid: 0.3, glow: 1, dir: [-Math.sin(a), 0, Math.cos(a)] });
    }
    this.lights.add({ x: at.x, y: at.y + 2, z: at.z, r: 32, col: [1, 0.6, 0.25], k: 3.5, life: 1.3, flicker: 0.2 });
    this.jolt.shake(1.0);
    this.jolt.flashOf(0.55, [1, 0.72, 0.4]);
    shared.uPush.value.set(at.x, at.y, at.z, 4);
    shared.uPushR.value = 16;
    this.pushT = 1.0;
    this.hurtAround(at, 8, 6, 'explosion');
    this.scorch(at.x, at.y, at.z, 3.4);
    this.flame(at.x, at.y, at.z, 2.4, 5);
    this.sound('explosion', at);
    // a chain: other oil nearby goes up too
    setTimeout(() => {
      for (const q of this.patches.filter((q) => q.kind === 'oil' && Math.hypot(q.x - at.x, q.z - at.z) < 9)) this.explode(q);
    }, 220);
  }

  zap(p: Patch) {
    if (p.kind !== 'charged') return;
    const at = new THREE.Vector3(p.x, p.y, p.z);
    p.kind = 'wet';
    if (p.light) { this.lights.remove(p.light); p.light = undefined; }
    for (const id of p.dabs) this.fx.setColor(id, mix(C.water[3], C.water[4], Math.random()));
    // lightning from the sky into the water, and out of it to every foe near
    const strikes = 3;
    for (let s = 0; s < strikes; s++) {
      setTimeout(() => {
        this.bolt([at.x + rnd(-6, 6), at.y + 40, at.z + rnd(-6, 6)], [at.x, at.y + 0.2, at.z], 0.35, C.zap, 6);
        for (const f of this.foes.targets()) if (f.alive && Math.hypot(f.pos.x - at.x, f.pos.z - at.z) < 14) this.bolt([at.x + rnd(-1, 1), at.y + 0.3, at.z + rnd(-1, 1)], [f.pos.x, f.pos.y + 1.2, f.pos.z], 0.22, C.zap, 3);
        this.jolt.flashOf(0.45, [0.75, 0.9, 1]);
      }, s * 90);
    }
    this.crackle(p, 30);
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(3, 12);
      this.fx.spawn({ x: at.x, y: at.y + 0.3, z: at.z, vx: Math.cos(a) * s, vy: rnd(2, 9), vz: Math.sin(a) * s, grav: 12, life: rnd(0.3, 0.8), size: rnd(0.25, 0.5), size1: 0.03, col: pick(C.zap), mark: MARKS.long, wid: 0.15, glow: 1, floor: at.y });
    }
    this.lights.add({ x: at.x, y: at.y + 3, z: at.z, r: 28, col: [0.75, 0.82, 1], k: 2.0, life: 0.6, flicker: 0.8 });
    this.jolt.shake(0.85);
    for (const f of this.foes.targets()) if (f.alive && Math.hypot(f.pos.x - at.x, f.pos.z - at.z) < 14) this.foes.hit(f, 5, at, 'zap');
    this.sound('zap', at);
    p.age = Math.max(p.age, p.life - 12);
  }

  private steam(x: number, y: number, z: number, r: number) {
    for (let i = 0; i < 80; i++) this.fx.spawn({ x: x + rnd(-r, r), y: y + rnd(0, 0.6), z: z + rnd(-r, r), vx: rnd(-0.5, 0.5), vy: rnd(1.5, 3.5), vz: rnd(-0.5, 0.5), drag: 0.6, life: rnd(1, 2.2), size: rnd(0.5, 1), size1: rnd(1.4, 2.4), col: hex('#e8e4f4'), col1: hex('#7a7090'), mark: MARKS.round, glow: 0.5 });
  }

  /** Forked lightning: a jagged path of bright strokes, with branches. */
  bolt(a: [number, number, number], b: [number, number, number], width: number, cols: RGB[], branches = 3) {
    const pts: [number, number, number][] = [a, b];
    let disp = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 0.22;
    for (let lvl = 0; lvl < 6; lvl++) {
      const next: [number, number, number][] = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        next.push([(p[0] + q[0]) / 2 + rnd(-disp, disp), (p[1] + q[1]) / 2 + rnd(-disp, disp) * 0.5, (p[2] + q[2]) / 2 + rnd(-disp, disp)], q);
      }
      pts.splice(0, pts.length, ...next);
      disp *= 0.5;
    }
    const life = rnd(0.14, 0.24);
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
      const l = Math.hypot(dx, dy, dz);
      const m: [number, number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      this.fx.spawn({ x: m[0], y: m[1], z: m[2], life: life * 1.4, size: l * 1.3 + width, col: cols[Math.min(2, cols.length - 1)], mark: MARKS.flat, wid: Math.min(0.5, (width * 1.4) / (l * 1.3 + width)), glow: 1, dir: [dx, dy, dz] });
      this.fx.spawn({ x: m[0], y: m[1], z: m[2], life, size: l * 1.2 + width * 0.4, col: cols[0], mark: MARKS.flat, wid: Math.min(0.3, (width * 0.45) / (l * 1.2 + width * 0.4)), glow: 1, dir: [dx, dy, dz] });
    }
    for (let k = 0; k < branches; k++) {
      const i = 2 + ((Math.random() * (pts.length - 4)) | 0);
      const p = pts[i];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * rnd(0.12, 0.3);
      const end: [number, number, number] = [p[0] + rnd(-l, l), p[1] - l * rnd(0.2, 0.8), p[2] + rnd(-l, l)];
      this.bolt(p, end, width * 0.5, cols, 0);
    }
  }

  // ------------------------------------------------------------------------------------------
  // the trumps

  private trumpCast(card: number, from: THREE.Vector3, dir: THREE.Vector3) {
    void dir;
    if (card === 19) {
      // the Sun: the valley brightens for a while; Shades burn
      this.dayUntil = this.time + 22;
      this.jolt.flashOf(0.8, [1, 0.92, 0.6]);
      for (const f of this.foes.targets()) if (f.alive) this.foes.hit(f, 3, from, 'sun');
      this.sound('sun');
    }
    if (card === 17) {
      // the Star: motes of light gather round the Fool, heal, and strike Shades that come near
      this.starUntil = this.time + 16;
      this.heal();
      for (let i = 0; i < 160; i++) {
        const a = Math.random() * Math.PI * 2, d = rnd(1, 9);
        const id = this.fx.spawn({ x: from.x + Math.cos(a) * d, y: from.y + rnd(-1.5, 4), z: from.z + Math.sin(a) * d, vx: rnd(-0.4, 0.4), vy: rnd(0.1, 0.6), vz: rnd(-0.4, 0.4), life: rnd(10, 16), size: rnd(0.12, 0.26), size1: 0.02, col: pick([hex('#fff6d0'), hex('#d8e4ff'), hex('#ffe08a')]), mark: MARKS.round, glow: 1, wid: 0.9 });
        this.stars.push({ i: id, t: 0 });
      }
      this.lights.add({ x: from.x, y: from.y, z: from.z, r: 16, col: [0.85, 0.85, 1], k: 1.2, life: 16, follow: () => [from.x, from.y, from.z] });
      this.jolt.flashOf(0.35, [0.85, 0.9, 1]);
      this.sound('star');
    }
  }

  private trumpLand(card: number, at: THREE.Vector3) {
    if (card === 16) {
      // the Tower: lightning from the sky; it strikes, explodes, charges water near
      for (let s = 0; s < 4; s++) setTimeout(() => {
        this.bolt([at.x + rnd(-8, 8), at.y + 70, at.z + rnd(-8, 8)], [at.x, at.y, at.z], 0.5, C.zap, 7);
        this.jolt.flashOf(0.35, [0.85, 0.9, 1]);
      }, s * 70);
      const p = this.addPatch('oil', at.x, at.y, at.z, 0.5, [], 1);
      this.explode(p);
      for (const q of this.patches) if (q.kind === 'wet' && Math.hypot(q.x - at.x, q.z - at.z) < 12) this.charge(q);
      this.hurtAround(at, 10, 8, 'tower');
      this.sound('zap', at);
      return;
    }
    if (card === 19 || card === 17) return;
    // any other trump: the void opens: a violet ring that takes Shades with it
    for (let i = 0; i < 140; i++) {
      const a = (i / 140) * Math.PI * 2;
      this.fx.spawn({ x: at.x, y: at.y + 0.4, z: at.z, vx: Math.cos(a) * 9, vy: rnd(0, 1), vz: Math.sin(a) * 9, drag: 1.4, life: 1.1, size: 1.1, size1: 0.1, col: pick(C.void.slice(1)), col1: C.void[0], mark: MARKS.long, wid: 0.25, glow: 1, dir: [-Math.sin(a), 0, Math.cos(a)] });
    }
    for (let i = 0; i < 80; i++) this.fx.spawn({ x: at.x + rnd(-1, 1), y: at.y + rnd(0, 2), z: at.z + rnd(-1, 1), vx: rnd(-1, 1), vy: rnd(2, 6), vz: rnd(-1, 1), life: rnd(0.8, 1.6), size: rnd(0.3, 0.7), size1: 0.02, col: pick(C.void.slice(2)), col1: C.void[0], mark: MARKS.round, glow: 1 });
    this.lights.add({ x: at.x, y: at.y + 1.5, z: at.z, r: 18, col: [0.6, 0.4, 1], k: 2.4, life: 1.2 });
    this.jolt.shake(0.5);
    this.jolt.flashOf(0.4, [0.6, 0.45, 1]);
    this.hurtAround(at, 7, 5, 'void');
    this.sound('void', at);
  }
}
