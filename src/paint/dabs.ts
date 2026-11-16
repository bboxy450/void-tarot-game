// Dabs: single brush marks as instanced cards pinned to points in 3D.
// A DabSet collects strokes while the world is painted; build() turns them into meshes,
// split into cells so the camera can skip what it does not see.
import * as THREE from 'three';
import { brushSheet } from './brush';
import { DAB_VERT, DAB_FRAG, UNDER_VERT, UNDER_FRAG, shared } from './shaders';
import type { RGB } from './util';

export interface Kind {
  name: string;
  minPx: number; // least size on screen (reference pixels, 900 px tall picture)
  maxPx: number; // largest size on screen
  gust: number; // how far the wind moves a dab of this kind
  mist: number; // how much mist reaches it (0 for the sky)
  depthStep: number; // lying strokes step toward the eye by rank
  layered?: boolean; // far things: no depth, laid in the order pushed
  order?: number; // render order
  impasto?: number;
  broken?: number;
  keepFloor?: number;
  cell?: number; // size of a cell in metres (0: one mesh)
}

export interface DabOpts {
  mark: number;
  sway?: number; // 0..1
  light?: number; // takes the moving lights 0..1
  glow?: number; // 0..1 shines through the mist
  rank?: number;
}

const QUAD = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
})();

export function dabMaterial(kind: Kind): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: DAB_VERT,
    fragmentShader: DAB_FRAG,
    uniforms: {
      ...shared,
      uBrush: { value: brushSheet() },
      uMinPx: { value: kind.minPx },
      uMaxPx: { value: kind.maxPx },
      uGust: { value: kind.gust },
      uMistAmt: { value: kind.mist },
      uDepthStep: { value: kind.depthStep },
      uKeepFloor: { value: kind.keepFloor ?? 0.002 },
      uImpasto: { value: kind.impasto ?? 0.9 },
      uBroken: { value: kind.broken ?? 0.5 },
    },
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    depthWrite: !kind.layered,
    depthTest: true,
  });
  return m;
}

export function underMaterial(mist = 1, layered = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: UNDER_VERT,
    fragmentShader: UNDER_FRAG,
    uniforms: { ...shared, uMistAmt: { value: mist } },
    depthWrite: !layered,
    side: THREE.DoubleSide,
  });
}

export class DabSet {
  n = 0;
  cap: number;
  pos: Float32Array;
  dir: Int8Array;
  nrm: Int8Array;
  size: Uint16Array;
  col: Uint8Array;
  misc: Uint8Array;
  private r: () => number;

  constructor(public kind: Kind, cap = 1024, seed = 7) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.dir = new Int8Array(cap * 4);
    this.nrm = new Int8Array(cap * 4);
    this.size = new Uint16Array(cap * 2);
    this.col = new Uint8Array(cap * 4);
    this.misc = new Uint8Array(cap * 4);
    let s = seed >>> 0;
    this.r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  }

  private grow() {
    const cap = this.cap * 2;
    const g = <T extends Float32Array | Int8Array | Uint16Array | Uint8Array>(a: T, k: number): T => {
      const b = new (a.constructor as any)(cap * k) as T;
      b.set(a);
      return b;
    };
    this.pos = g(this.pos, 3);
    this.dir = g(this.dir, 4);
    this.nrm = g(this.nrm, 4);
    this.size = g(this.size, 2);
    this.col = g(this.col, 4);
    this.misc = g(this.misc, 4);
    this.cap = cap;
  }

  /**
   * Push one stroke. dir: the way the stroke runs (world). nrm: surface normal for a lying stroke,
   * or null for a stroke that faces the eye. len, wid in metres. col raw sRGB.
   */
  add(x: number, y: number, z: number, dx: number, dy: number, dz: number, nrm: [number, number, number] | null, len: number, wid: number, col: RGB, o: DabOpts) {
    if (this.n >= this.cap) this.grow();
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    this.dir[i * 4] = (dx / dl) * 127;
    this.dir[i * 4 + 1] = (dy / dl) * 127;
    this.dir[i * 4 + 2] = (dz / dl) * 127;
    this.dir[i * 4 + 3] = (o.sway ?? 0) * 127;
    if (nrm) {
      const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
      this.nrm[i * 4] = (nrm[0] / nl) * 127;
      this.nrm[i * 4 + 1] = (nrm[1] / nl) * 127;
      this.nrm[i * 4 + 2] = (nrm[2] / nl) * 127;
    } else {
      this.nrm[i * 4] = this.nrm[i * 4 + 1] = this.nrm[i * 4 + 2] = 0;
    }
    this.size[i * 2] = Math.min(65535, len * 100);
    this.size[i * 2 + 1] = Math.min(65535, wid * 100);
    this.col[i * 4] = Math.max(0, Math.min(255, col[0] * 255));
    this.col[i * 4 + 1] = Math.max(0, Math.min(255, col[1] * 255));
    this.col[i * 4 + 2] = Math.max(0, Math.min(255, col[2] * 255));
    this.col[i * 4 + 3] = (o.rank ?? this.r()) * 255;
    this.misc[i * 4] = (o.mark / 7) * 255;
    this.misc[i * 4 + 1] = this.r() * 255;
    this.misc[i * 4 + 2] = (o.light ?? 1) * 255;
    this.misc[i * 4 + 3] = (o.glow ?? 0) * 255;
  }

  /** Make the meshes: one per cell (or one for all). */
  build(material?: THREE.ShaderMaterial): THREE.Mesh[] {
    const mat = material ?? dabMaterial(this.kind);
    const cell = this.kind.cell ?? 0;
    const meshes: THREE.Mesh[] = [];
    if (this.n === 0) return meshes;
    if (!cell) {
      meshes.push(this.meshOf(0, this.n, null, mat));
      return meshes;
    }
    // counting sort by cell, keeping the push order inside a cell
    const keys = new Map<string, number[]>();
    for (let i = 0; i < this.n; i++) {
      const k = Math.floor(this.pos[i * 3] / cell) + ',' + Math.floor(this.pos[i * 3 + 2] / cell);
      let a = keys.get(k);
      if (!a) keys.set(k, (a = []));
      a.push(i);
    }
    for (const idx of keys.values()) meshes.push(this.meshOf(0, idx.length, idx, mat));
    return meshes;
  }

  private meshOf(from: number, count: number, idx: number[] | null, mat: THREE.ShaderMaterial): THREE.Mesh {
    const pick = <T extends Float32Array | Int8Array | Uint16Array | Uint8Array>(a: T, k: number): T => {
      if (!idx) return a.slice(from * k, (from + count) * k) as T;
      const b = new (a.constructor as any)(count * k) as T;
      for (let j = 0; j < count; j++) for (let c = 0; c < k; c++) b[j * k + c] = a[idx[j] * k + c];
      return b;
    };
    const g = new THREE.InstancedBufferGeometry();
    g.index = QUAD.index;
    g.setAttribute('position', QUAD.getAttribute('position'));
    const pos = pick(this.pos, 3);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    g.setAttribute('iDir', new THREE.InstancedBufferAttribute(pick(this.dir, 4), 4, true));
    g.setAttribute('iNrm', new THREE.InstancedBufferAttribute(pick(this.nrm, 4), 4, true));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(pick(this.size, 2), 2, false));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(pick(this.col, 4), 4, true));
    g.setAttribute('iMisc', new THREE.InstancedBufferAttribute(pick(this.misc, 4), 4, true));
    g.instanceCount = count;
    // bounds from the dab centres, padded by the largest stroke
    let maxLen = 0;
    const sz = pick(this.size, 2);
    for (let j = 0; j < count; j++) maxLen = Math.max(maxLen, sz[j * 2] * 0.01);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let j = 0; j < count; j++) box.expandByPoint(v.set(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]));
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    sphere.radius += maxLen + 2;
    g.boundingSphere = sphere;
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = !!this.kind.cell;
    mesh.renderOrder = this.kind.order ?? 0;
    mesh.userData.count = count;
    return mesh;
  }
}
