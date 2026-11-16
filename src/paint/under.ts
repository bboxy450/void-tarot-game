// The underpainting: coarse geometry in flat colours under the dabs, so nothing shows between them.
import * as THREE from 'three';
import { underMaterial } from './dabs';
import { RAMP } from './palette';
import { ramp, type RGB } from './util';
import { SUN, warm } from './light';

export class Under {
  pos: number[] = [];
  col: number[] = [];

  /** Add a three geometry placed by matrix, each face toned from the ramp by its light. */
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, r: keyof typeof RAMP, bias = -0.06, sunK = 0.55) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(m);
    const p = g.getAttribute('position');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      const ndl = Math.max(0, n.x * SUN[0] + n.y * SUN[1] + n.z * SUN[2]);
      const t = 0.1 + (0.5 + 0.5 * n.y) * 0.22 + ndl * sunK + bias;
      const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
      const k = warm(ramp(RAMP[r], t), cx, cy, cz);
      for (const v of [a, b, c]) {
        this.pos.push(v.x, v.y, v.z);
        this.col.push(k[0], k[1], k[2]);
      }
    }
    if (g !== geo) g.dispose();
  }

  /** Add raw triangles with their own colours. */
  tri(a: number[], b: number[], c: number[], ca: RGB, cb: RGB, cc: RGB) {
    this.pos.push(...a, ...b, ...c);
    this.col.push(...ca, ...cb, ...cc);
  }

  build(mist = 1, layered = false): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, underMaterial(mist, layered));
    m.frustumCulled = false;
    return m;
  }
}

export const M4 = new THREE.Matrix4();
export function place(x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(sx, sy, sz));
}
