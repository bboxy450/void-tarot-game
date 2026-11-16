// Shades: dark smoky presences that drift in the valley and come for the Fool when they notice him.
// Each is painted once in dabs; they flinch when struck and come apart into dabs when undone.
import * as THREE from 'three';
import { DabSet, dabMaterial, type Kind } from '../paint/dabs';
import { MARKS } from '../paint/brush';
import { RAMP } from '../paint/palette';
import { ramp, rng, mix, hex } from '../paint/util';
import { groundHeight, waterAt } from '../world/layout';
import type { FX } from './fx';
import type { Target, Foes, Sound } from './spells';

const SHADE_KIND: Kind = { name: 'shade', minPx: 1.5, maxPx: 140, gust: 0.35, mist: 0.8, depthStep: 0, impasto: 0.8, broken: 0.4 };

export const SHADE_HOMES: [number, number][] = [[-56, -100], [46, -140], [-34, -200], [100, -124], [-64, -44], [62, -60]];

interface Shade extends Target {
  home: THREE.Vector2;
  group: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  hp: number;
  state: 'drift' | 'chase' | 'flinch' | 'dead';
  stateT: number;
  wander: THREE.Vector2;
  hitCool: number;
  flash: number;
  noticed: boolean;
  phase: number;
  vel: THREE.Vector3;
}

function paintShade(): { geo: THREE.BufferGeometry; pts: { p: [number, number, number]; c: [number, number, number] }[] } {
  const set = new DabSet(SHADE_KIND, 4096, 99);
  const r = rng(77);
  const pts: { p: [number, number, number]; c: [number, number, number] }[] = [];
  const add = (x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, wid: number, c: [number, number, number], mark: number, sway: number, glow = 0) => {
    set.add(x, y, z, dx, dy, dz, null, len, wid, c, { mark, sway, light: 0.6, glow });
    pts.push({ p: [x, y, z], c });
  };
  // the robe: a column that frays into smoke at the foot
  for (let i = 0; i < 900; i++) {
    const h = Math.pow(r(), 0.8) * 1.75;
    const rad = 0.18 + 0.38 * Math.pow(1 - h / 1.75, 0.8) + (r() - 0.5) * 0.08;
    const a = r() * Math.PI * 2;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const lit = 0.5 + 0.5 * Math.cos(a - 1.2);
    const c = ramp(RAMP.shade, 0.15 + lit * 0.45 + r() * 0.25) as [number, number, number];
    add(x, h, z, (r() - 0.5) * 0.4, 1, (r() - 0.5) * 0.4, 0.32 + r() * 0.2, 0.14, c, r() < 0.5 ? MARKS.long : MARKS.dry, 0.15 + (1 - h / 1.75) * 0.7);
  }
  // tatters under it
  for (let i = 0; i < 160; i++) {
    const a = r() * Math.PI * 2, rad = 0.2 + r() * 0.45;
    add(Math.cos(a) * rad, -0.15 - r() * 0.45, Math.sin(a) * rad, (r() - 0.5) * 0.3, -1, (r() - 0.5) * 0.3, 0.45 + r() * 0.4, 0.1, ramp(RAMP.shade, r() * 0.35) as [number, number, number], MARKS.flick, 1);
  }
  // the hood and its hollow
  for (let i = 0; i < 420; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
    const n = [q * Math.cos(a), u, q * Math.sin(a)];
    if (n[2] > 0.55 && n[1] < 0.5) continue; // the open front
    const peak = Math.max(0, n[1]) * 0.18;
    add(n[0] * 0.27, 1.8 + n[1] * 0.3 + peak, n[2] * 0.27 - 0.03, -n[0] * 0.2, -1, -n[2] * 0.2, 0.2, 0.1, ramp(RAMP.shade, 0.2 + Math.max(0, n[0] * 0.4 + n[1] * 0.3) + r() * 0.2) as [number, number, number], MARKS.press, 0.15);
  }
  for (let i = 0; i < 60; i++) add((r() - 0.5) * 0.3, 1.72 + (r() - 0.5) * 0.3, 0.05 + r() * 0.1, 0, 1, 0, 0.14, 0.1, [0.01, 0.0, 0.03], MARKS.round, 0.1);
  // sleeves reaching out
  for (const side of [-1, 1]) {
    for (let t = 0; t < 1; t += 0.03) {
      const x = side * (0.3 + t * 0.15), y = 1.45 - t * 0.55, z = 0.1 + t * 0.55;
      for (let k = 0; k < 3; k++) add(x + (r() - 0.5) * 0.12, y + (r() - 0.5) * 0.12, z + (r() - 0.5) * 0.12, side * 0.3, -0.6, 1, 0.24, 0.1, ramp(RAMP.shade, 0.2 + r() * 0.4) as [number, number, number], MARKS.long, 0.4 + t * 0.4);
    }
    // long pale fingers
    for (let f = 0; f < 3; f++) add(side * (0.43 + f * 0.03), 0.86 - f * 0.03, 0.68 + f * 0.02, side * 0.1, -1, 0.5, 0.2, 0.035, mix(hex('#4a4466'), hex('#8a84b0'), r()) as [number, number, number], MARKS.flick, 0.5);
  }
  // eyes
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) add(side * 0.075, 1.76 + (k % 2) * 0.01, 0.2, 1, 0, 0, 0.07, 0.045, hex('#cfeeff') as [number, number, number], MARKS.round, 0.05, 1);
  const meshes = set.build(dabMaterial(SHADE_KIND));
  return { geo: meshes[0].geometry, pts };
}

export class Shades implements Foes {
  list: Shade[] = [];
  private pts: { p: [number, number, number]; c: [number, number, number] }[];
  onHurtPlayer: (dmg: number, from: THREE.Vector3) => void = () => {};
  private time = 0;

  constructor(scene: THREE.Scene, private fx: FX, private sound: Sound) {
    const { geo, pts } = paintShade();
    this.pts = pts;
    for (const [hx, hz] of SHADE_HOMES) {
      const mat = dabMaterial(SHADE_KIND);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      scene.add(mesh);
      const pos = new THREE.Vector3(hx, groundHeight(hx, hz), hz);
      this.list.push({ pos, alive: true, radius: 0.7, home: new THREE.Vector2(hx, hz), group: mesh, mat, hp: 5, state: 'drift', stateT: 0, wander: new THREE.Vector2(hx, hz), hitCool: 0, flash: 0, noticed: false, phase: Math.random() * 10, vel: new THREE.Vector3() });
    }
  }

  targets() { return this.list; }

  hit(t: Target, dmg: number, from: THREE.Vector3, kind: string) {
    const s = t as Shade;
    if (!s.alive) return;
    s.hp -= dmg;
    s.flash = 1;
    s.noticed = true;
    const away = new THREE.Vector3(s.pos.x - from.x, 0, s.pos.z - from.z);
    if (away.lengthSq() < 1e-4) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    away.normalize();
    s.vel.addScaledVector(away, dmg >= 4 ? 9 : 4);
    s.state = 'flinch';
    s.stateT = 0;
    const tint: Record<string, [number, number, number]> = { fire: [1, 0.6, 0.2], explosion: [1, 0.7, 0.3], zap: [0.7, 0.9, 1], water: [0.5, 0.7, 1], air: [0.9, 0.9, 1], earth: [0.6, 0.45, 0.3], tower: [0.8, 0.9, 1] };
    const c = tint[kind] ?? [0.8, 0.7, 1];
    s.mat.uniforms.uTint.value.set(c[0], c[1], c[2], 0.85);
    this.sound(s.hp <= 0 ? 'shade_die' : 'shade_hit', s.pos);
    if (s.hp <= 0) this.dissolve(s, from);
  }

  private dissolve(s: Shade, from: THREE.Vector3) {
    s.alive = false;
    s.state = 'dead';
    s.stateT = 0;
    s.group.visible = false;
    const cs = Math.cos(s.group.rotation.y), sn = Math.sin(s.group.rotation.y);
    for (let i = 0; i < this.pts.length; i += 2) {
      const { p, c } = this.pts[i];
      const x = s.pos.x + p[0] * cs + p[2] * sn, z = s.pos.z - p[0] * sn + p[2] * cs, y = s.group.position.y + p[1];
      const ax = x - from.x, az = z - from.z, l = Math.hypot(ax, az) || 1;
      const sp = 1 + Math.random() * 4;
      this.fx.spawn({ x, y, z, vx: (ax / l) * sp + (Math.random() - 0.5) * 2, vy: Math.random() * 3 + 0.5, vz: (az / l) * sp + (Math.random() - 0.5) * 2, drag: 1.5, grav: -0.8, life: 0.8 + Math.random() * 1.6, size: 0.3, size1: 0.02, col: c, col1: mix(c, hex('#6a5aa0'), 0.8), mark: MARKS.long, glow: 0.3, spin: (Math.random() - 0.5) * 6, dir: [0, 1, 0] });
    }
    for (let i = 0; i < 40; i++) this.fx.spawn({ x: s.pos.x, y: s.group.position.y + 1.4, z: s.pos.z, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 5, vz: (Math.random() - 0.5) * 6, drag: 1, life: 1.2, size: 0.2, size1: 0.01, col: hex('#cfc4ff'), mark: MARKS.round, glow: 1 });
  }

  update(dt: number, t: number, player: THREE.Vector3, safe: boolean) {
    this.time = t;
    for (const s of this.list) {
      s.stateT += dt;
      s.hitCool -= dt;
      if (s.state === 'dead') {
        if (s.stateT > 45) {
          s.alive = true; s.hp = 5; s.state = 'drift'; s.noticed = false;
          s.pos.set(s.home.x, groundHeight(s.home.x, s.home.y), s.home.y);
          s.group.visible = true;
        }
        continue;
      }
      const dx = player.x - s.pos.x, dz = player.z - s.pos.z;
      const dist = Math.hypot(dx, dz);
      if (s.state !== 'flinch') {
        if (!safe && dist < 17) {
          if (!s.noticed) { s.noticed = true; this.sound('shade_cry', s.pos); }
          s.state = 'chase';
        } else if (dist > 30 || safe) { s.state = 'drift'; s.noticed = false; }
      }
      let goal = s.wander;
      let speed = 0.9;
      if (s.state === 'drift') {
        if (Math.hypot(s.wander.x - s.pos.x, s.wander.y - s.pos.z) < 1 || s.stateT > 8) {
          s.wander.set(s.home.x + (Math.random() - 0.5) * 22, s.home.y + (Math.random() - 0.5) * 22);
          s.stateT = 0;
        }
      } else if (s.state === 'chase') {
        goal = new THREE.Vector2(player.x, player.z);
        speed = 2.9;
      } else if (s.state === 'flinch' && s.stateT > 0.5) s.state = s.noticed ? 'chase' : 'drift';
      if (s.state !== 'flinch') {
        const gx = goal.x - s.pos.x, gz = goal.y - s.pos.z, gl = Math.hypot(gx, gz);
        if (gl > (s.state === 'chase' ? 1.1 : 0.3)) {
          s.vel.x += ((gx / gl) * speed - s.vel.x) * Math.min(1, dt * 2);
          s.vel.z += ((gz / gl) * speed - s.vel.z) * Math.min(1, dt * 2);
        } else { s.vel.x *= 0.9; s.vel.z *= 0.9; }
      }
      s.vel.multiplyScalar(s.state === 'flinch' ? Math.max(0, 1 - dt * 4) : 1);
      s.pos.x += s.vel.x * dt;
      s.pos.z += s.vel.z * dt;
      const w = waterAt(s.pos.x, s.pos.z);
      s.pos.y = Math.max(groundHeight(s.pos.x, s.pos.z), w ?? -99);
      // touch: it hurts
      if (s.state === 'chase' && dist < 1.5 && s.hitCool <= 0) {
        s.hitCool = 1.6;
        this.onHurtPlayer(1, s.pos.clone());
        this.sound('shade_strike', s.pos);
      }
      // pose: hover and sway, face the way it goes or the Fool
      const bob = Math.sin(t * 1.7 + s.phase) * 0.15;
      s.group.position.set(s.pos.x, s.pos.y + 0.45 + bob, s.pos.z);
      const face = s.state === 'chase' ? Math.atan2(dx, dz) : Math.atan2(s.vel.x, s.vel.z);
      let dr = face - s.group.rotation.y;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      s.group.rotation.y += dr * Math.min(1, dt * 4);
      s.group.rotation.z = Math.sin(t * 1.1 + s.phase) * 0.05;
      s.flash = Math.max(0, s.flash - dt * 3);
      s.mat.uniforms.uTint.value.w = s.flash * 0.85;
      // smoke comes off it
      if (Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        this.fx.spawn({ x: s.pos.x + Math.cos(a) * 0.4, y: s.group.position.y + Math.random() * 1.6, z: s.pos.z + Math.sin(a) * 0.4, vx: (Math.random() - 0.5) * 0.4, vy: 0.5 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.4, life: 1.2 + Math.random(), size: 0.35, size1: 0.05, col: hex('#120e22'), col1: hex('#4a4070'), mark: MARKS.dry, glow: 0.1, dir: [0, 1, 0] });
      }
    }
    void this.time;
  }

  nearest(p: THREE.Vector3): number {
    let d = 1e9;
    for (const s of this.list) if (s.alive) d = Math.min(d, Math.hypot(s.pos.x - p.x, s.pos.z - p.z));
    return d;
  }
}
