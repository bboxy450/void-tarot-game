// The Fool on foot: walking, running, jumping, pushed out of walls and trunks.
import * as THREE from 'three';
import { groundHeight, waterAt, pathInfo, CASTLE } from '../world/layout';
import type { Collider } from '../world/ctx';

export const EYE = 1.7;
const WALK = 4.2, RUN = 7.6, JUMP = 5.2, GRAVITY = 14, RADIUS = 0.4;

export interface Input { fwd: number; side: number; run: boolean; jump: boolean }

export class Player {
  pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  vy = 0;
  onGround = true;
  hearts = 5;
  maxHearts = 5;
  hurtAt = -99;
  stepPhase = 0;
  moving = 0; // 0..1 how much it walks this frame
  speed = 0;
  wading = false;
  onRoad = false;
  private colliders: Collider[] = [];

  constructor(colliders: Collider[]) {
    this.colliders = colliders;
  }

  place(x: number, z: number, yaw: number, pitch = -0.04) {
    this.pos.set(x, this.floor(x, z), z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.vy = 0;
  }

  floor(x: number, z: number) {
    const g = groundHeight(x, z);
    const w = waterAt(x, z);
    return w !== null ? Math.max(g, w - 0.55) : g;
  }

  /** returns the distance walked (for steps) */
  step(dt: number, inp: Input): number {
    const sp = inp.run ? RUN : WALK;
    let fx = inp.fwd, sx = inp.side;
    const l = Math.hypot(fx, sx);
    if (l > 1) { fx /= l; sx /= l; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward is -Z at yaw 0
    const dx = (-sin * fx + cos * sx) * sp * dt;
    const dz = (-cos * fx - sin * sx) * sp * dt;
    const ox = this.pos.x, oz = this.pos.z;
    let nx = ox + dx, nz = oz + dz;
    // steep slopes slow you
    const g0 = this.floor(ox, oz), g1 = this.floor(nx, nz);
    const climb = (g1 - g0) / Math.max(Math.hypot(dx, dz), 1e-4);
    if (climb > 1.4 && this.onGround) { nx = ox; nz = oz; }
    [nx, nz] = this.collide(nx, nz);
    // the bounds of the valley
    nx = Math.max(-150, Math.min(150, nx));
    nz = Math.max(-235, Math.min(46, nz));
    this.pos.x = nx;
    this.pos.z = nz;
    const fl = this.floor(nx, nz);
    if (inp.jump && this.onGround) { this.vy = JUMP; this.onGround = false; }
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= fl) {
      this.pos.y = fl;
      this.vy = 0;
      this.onGround = true;
    } else if (this.onGround && this.pos.y - fl < 0.45 && this.vy <= 0) {
      this.pos.y = fl; // follow the ground down slopes
      this.vy = 0;
    } else this.onGround = false;
    const moved = Math.hypot(nx - ox, nz - oz);
    this.speed = moved / Math.max(dt, 1e-4);
    this.moving = this.onGround ? Math.min(1, this.speed / WALK) : 0;
    this.wading = waterAt(nx, nz) !== null;
    const inCourt = nx > CASTLE.x0 && nx < CASTLE.x1 && nz > CASTLE.z0 - 8 && nz < CASTLE.z1;
    this.onRoad = inCourt || pathInfo(nx, nz).d < 0;
    return this.onGround ? moved : 0;
  }

  collide(x: number, z: number): [number, number] {
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        if (c.kind === 'circle') {
          const dx = x - c.x, dz = z - c.z;
          if (Math.abs(dx) > 8 || Math.abs(dz) > 8) continue;
          const d = Math.hypot(dx, dz), m = c.r! + RADIUS;
          if (d < m && d > 1e-5) { x = c.x + (dx / d) * m; z = c.z + (dz / d) * m; }
        } else {
          const rot = c.rot ?? 0;
          const cs = Math.cos(rot), sn = Math.sin(rot);
          const dx = x - c.x, dz = z - c.z;
          if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
          // into the box's frame: local x along (cos, -sin), local z along (sin, cos)
          const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
          const hw = c.hw! + RADIUS, hd = c.hd! + RADIUS;
          if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
            const px = hw - Math.abs(lx), pz = hd - Math.abs(lz);
            let qx = lx, qz = lz;
            if (px < pz) qx = Math.sign(lx) * hw; else qz = Math.sign(lz) * hd;
            x = c.x + qx * cs + qz * sn;
            z = c.z - qx * sn + qz * cs;
          }
        }
      }
    }
    return [x, z];
  }

  eye(out: THREE.Vector3) {
    return out.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }
}
