// Moving paint: sparks, flames, splashes, smoke, lightning, ground patches. Every effect is made of
// dabs from one pool, written to the GPU each frame. Also the moving lights, the shake and the flash.
import * as THREE from 'three';
import { dabMaterial, type Kind } from '../paint/dabs';
import { shared, MAX_LIGHTS } from '../paint/shaders';
import { finishUniforms } from '../finish';
import type { RGB } from '../paint/util';

const FX_KIND: Kind = { name: 'fx', minPx: 1.2, maxPx: 500, gust: 0, mist: 0.3, depthStep: 0.6, impasto: 0.7, broken: 0.35 };
const CAP = 24000;

export interface Spawn {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number; // seconds (Infinity: until killed)
  size: number; // length (m)
  size1?: number; // length at the end of life
  wid?: number; // width / length
  col: RGB;
  col1?: RGB; // colour at the end of life
  mark: number;
  grav?: number; // m/s² down (negative floats up)
  drag?: number; // per second
  lie?: boolean; // lies flat on the ground
  dir?: [number, number, number]; // stroke direction; default: along the velocity
  glow?: number;
  light?: number;
  spin?: number; // radians per second (turns the stroke)
  floor?: number; // stops falling here
}

export class FX {
  mesh: THREE.Mesh;
  private g: THREE.InstancedBufferGeometry;
  private aPos: Float32Array; private aDir: Int8Array; private aNrm: Int8Array; private aSize: Uint16Array; private aCol: Uint8Array; private aMisc: Uint8Array;
  // particle state
  private alive = new Uint8Array(CAP);
  private free: number[] = [];
  private p = new Float32Array(CAP * 3);
  private v = new Float32Array(CAP * 3);
  private d = new Float32Array(CAP * 3);
  private c0 = new Float32Array(CAP * 3);
  private c1 = new Float32Array(CAP * 3);
  private age = new Float32Array(CAP);
  private life = new Float32Array(CAP);
  private s0 = new Float32Array(CAP);
  private s1 = new Float32Array(CAP);
  private wr = new Float32Array(CAP);
  private grav = new Float32Array(CAP);
  private drag = new Float32Array(CAP);
  private spin = new Float32Array(CAP);
  private floor = new Float32Array(CAP);
  private lie = new Uint8Array(CAP);
  private mark = new Uint8Array(CAP);
  private glow = new Uint8Array(CAP);
  private light = new Uint8Array(CAP);
  private seed = new Uint8Array(CAP);
  count = 0;

  constructor(scene: THREE.Scene) {
    for (let i = CAP - 1; i >= 0; i--) this.free.push(i);
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('position', quad.getAttribute('position'));
    const mk = <T extends THREE.TypedArray>(name: string, arr: T, k: number, normalized: boolean) => {
      const a = new THREE.InstancedBufferAttribute(arr, k, normalized);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return arr;
    };
    this.aPos = mk('iPos', new Float32Array(CAP * 3), 3, false);
    this.aDir = mk('iDir', new Int8Array(CAP * 4), 4, true);
    this.aNrm = mk('iNrm', new Int8Array(CAP * 4), 4, true);
    this.aSize = mk('iSize', new Uint16Array(CAP * 2), 2, false);
    this.aCol = mk('iCol', new Uint8Array(CAP * 4), 4, true);
    this.aMisc = mk('iMisc', new Uint8Array(CAP * 4), 4, true);
    g.instanceCount = 0;
    this.g = g;
    this.mesh = new THREE.Mesh(g, dabMaterial(FX_KIND));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  spawn(s: Spawn): number {
    const i = this.free.pop();
    if (i === undefined) return -1;
    this.alive[i] = 1;
    this.p[i * 3] = s.x; this.p[i * 3 + 1] = s.y; this.p[i * 3 + 2] = s.z;
    this.v[i * 3] = s.vx ?? 0; this.v[i * 3 + 1] = s.vy ?? 0; this.v[i * 3 + 2] = s.vz ?? 0;
    const dir = s.dir ?? [0, 0, 0];
    this.d[i * 3] = dir[0]; this.d[i * 3 + 1] = dir[1]; this.d[i * 3 + 2] = dir[2];
    const c1 = s.col1 ?? s.col;
    for (let k = 0; k < 3; k++) { this.c0[i * 3 + k] = s.col[k]; this.c1[i * 3 + k] = c1[k]; }
    this.age[i] = 0;
    this.life[i] = s.life;
    this.s0[i] = s.size;
    this.s1[i] = s.size1 ?? s.size;
    this.wr[i] = s.wid ?? 0.45;
    this.grav[i] = s.grav ?? 0;
    this.drag[i] = s.drag ?? 0;
    this.spin[i] = s.spin ?? 0;
    this.floor[i] = s.floor ?? -1e9;
    this.lie[i] = s.lie ? 1 : 0;
    this.mark[i] = s.mark;
    this.glow[i] = Math.round((s.glow ?? 1) * 255);
    this.light[i] = Math.round((s.light ?? 0) * 255);
    this.seed[i] = (Math.random() * 255) | 0;
    return i;
  }

  kill(i: number) {
    if (i < 0 || !this.alive[i]) return;
    this.alive[i] = 0;
    this.free.push(i);
  }

  /** age a particle to its end over `over` seconds (it shrinks away) */
  fade(i: number, over = 0.6) {
    if (i < 0 || !this.alive[i]) return;
    this.life[i] = this.age[i] + over;
    this.s1[i] = 0.01;
  }

  setColor(i: number, c: RGB) {
    if (i < 0) return;
    for (let k = 0; k < 3; k++) this.c0[i * 3 + k] = this.c1[i * 3 + k] = c[k];
  }

  isAlive(i: number) { return i >= 0 && this.alive[i] === 1; }

  update(dt: number) {
    let n = 0;
    const P = this.aPos, D = this.aDir, N = this.aNrm, S = this.aSize, C = this.aCol, M = this.aMisc;
    for (let i = 0; i < CAP; i++) {
      if (!this.alive[i]) continue;
      const a = (this.age[i] += dt);
      const L = this.life[i];
      if (a >= L) { this.kill(i); continue; }
      const t = L === Infinity ? 0 : a / L;
      const i3 = i * 3;
      // motion
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i3] *= dr; this.v[i3 + 1] = this.v[i3 + 1] * dr - this.grav[i] * dt; this.v[i3 + 2] *= dr;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      if (this.p[i3 + 1] < this.floor[i]) { this.p[i3 + 1] = this.floor[i]; this.v[i3 + 1] *= -0.25; this.v[i3] *= 0.6; this.v[i3 + 2] *= 0.6; }
      let dx = this.d[i3], dy = this.d[i3 + 1], dz = this.d[i3 + 2];
      if (dx === 0 && dy === 0 && dz === 0) { dx = this.v[i3]; dy = this.v[i3 + 1]; dz = this.v[i3 + 2]; }
      if (this.spin[i]) {
        const ang = this.spin[i] * a;
        const cs = Math.cos(ang), sn = Math.sin(ang);
        const ndx = dx * cs - dy * sn, ndy = dx * sn + dy * cs;
        dx = ndx; dy = ndy;
      }
      let l = Math.hypot(dx, dy, dz);
      if (l < 1e-5) { dx = 1; dy = 0; dz = 0; l = 1; }
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const o3 = n * 3, o4 = n * 4, o2 = n * 2;
      P[o3] = this.p[i3]; P[o3 + 1] = this.p[i3 + 1]; P[o3 + 2] = this.p[i3 + 2];
      D[o4] = (dx / l) * 127; D[o4 + 1] = (dy / l) * 127; D[o4 + 2] = (dz / l) * 127; D[o4 + 3] = 0;
      if (this.lie[i]) { N[o4] = 0; N[o4 + 1] = 127; N[o4 + 2] = 0; } else { N[o4] = N[o4 + 1] = N[o4 + 2] = 0; }
      N[o4 + 3] = 0;
      S[o2] = Math.max(1, size * 100); S[o2 + 1] = Math.max(1, size * this.wr[i] * 100);
      for (let k = 0; k < 3; k++) C[o4 + k] = Math.max(0, Math.min(255, (this.c0[i3 + k] + (this.c1[i3 + k] - this.c0[i3 + k]) * t) * 255));
      C[o4 + 3] = 0; // rank 0: never thinned
      M[o4] = (this.mark[i] / 7) * 255; M[o4 + 1] = this.seed[i]; M[o4 + 2] = this.light[i]; M[o4 + 3] = this.glow[i];
      n++;
    }
    this.count = n;
    this.g.instanceCount = n;
    for (const name of ['iPos', 'iDir', 'iNrm', 'iSize', 'iCol', 'iMisc']) {
      const attr = this.g.getAttribute(name) as THREE.InstancedBufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * attr.itemSize);
      attr.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// moving lights: slot 0 is the lantern; the rest are lent to effects

export interface Light { x: number; y: number; z: number; r: number; col: RGB; k: number; life: number; age: number; flicker?: number; follow?: () => [number, number, number] | null }

export class Lights {
  list: Light[] = [];
  lantern: Light = { x: 0, y: 0, z: 0, r: 10, col: [1, 0.62, 0.28], k: 0.9, life: Infinity, age: 0, flicker: 0.25 };

  add(l: Omit<Light, 'age'>): Light {
    const o = { ...l, age: 0 };
    this.list.push(o);
    return o;
  }
  remove(l: Light) { this.list = this.list.filter((x) => x !== l); }

  update(dt: number, t: number, eye: THREE.Vector3) {
    for (const l of this.list) {
      l.age += dt;
      if (l.follow) { const p = l.follow(); if (p) { l.x = p[0]; l.y = p[1]; l.z = p[2]; } }
    }
    this.list = this.list.filter((l) => l.age < l.life);
    // the brightest and nearest effects take the slots
    const ranked = this.list.map((l) => ({ l, w: (l.k * l.r) / (1 + Math.hypot(l.x - eye.x, l.z - eye.z) * 0.05) })).sort((a, b) => b.w - a.w);
    const slots = [this.lantern, ...ranked.slice(0, MAX_LIGHTS - 1).map((x) => x.l)];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const pos = shared.uLightPos.value[i], col = shared.uLightCol.value[i];
      const l = slots[i];
      if (!l) { pos.set(0, -9999, 0, 1); col.set(0, 0, 0, 0); continue; }
      const fade = l.life === Infinity ? 1 : Math.max(0, 1 - l.age / l.life);
      const fl = l.flicker ? 1 - l.flicker * (0.5 + 0.5 * Math.sin(t * 23 + i * 7) * Math.sin(t * 13.7 + i)) : 1;
      pos.set(l.x, l.y, l.z, l.r);
      col.set(l.col[0], l.col[1], l.col[2], l.k * fade * fl);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// the camera shake and the flash

export class Jolt {
  trauma = 0;
  flash = 0;
  flashCol = new THREE.Color(1, 0.8, 0.5);
  private out = new THREE.Vector4();
  private t = 0;

  shake(amount: number) { this.trauma = Math.min(1.2, this.trauma + amount); }
  flashOf(amount: number, col: RGB) {
    if (amount >= this.flash) this.flashCol.setRGB(col[0], col[1], col[2]);
    this.flash = Math.min(1, Math.max(this.flash, amount));
  }
  update(dt: number) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    finishUniforms.uFlash.value = this.flash * 0.9;
    finishUniforms.uFlashCol.value.copy(this.flashCol);
  }
  offset(): THREE.Vector4 {
    const k = this.trauma * this.trauma * 0.35;
    const t = this.t * 40;
    return this.out.set(Math.sin(t * 1.1) * k * 0.6, Math.sin(t * 1.7 + 1) * k * 0.5, Math.sin(t * 1.3 + 2) * k * 0.6, Math.sin(t * 0.9 + 3) * k * 0.08);
  }
}
