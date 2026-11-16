// The brush sheet: eight marks of a bristle brush, made in code at load.
// Each cell is 256 x 128 texels; the mark runs along +x.
//   R: paint value along the bristles (0.5 = the mixed colour, lighter and darker streaks)
//   G: height of the paint (thick at the press and at the ridges between bristles)
//   B: the plain mark: the same touch as one clean shape (used when a stroke is small on screen)
//   A: the full mark: bristle gaps and a dry, broken end
import * as THREE from 'three';
import { rng, noise2, clamp, smooth } from './util';

export const MARKS = {
  long: 0, // long straight stroke that runs dry
  press: 1, // short fat dab with a loaded press
  curve: 2, // curved stroke
  dry: 3, // scumble: dry broken stroke
  round: 4, // round dab
  flick: 5, // thin flick, pointed both ends (grass)
  leaf: 6, // pointed oval (leaves)
  flat: 7, // wide flat stroke (sky, walls)
} as const;

const CW = 256, CH = 128, COLS = 2, ROWS = 4;

interface MarkShape {
  /** half width (0..1 of half height) at position u along the stroke */
  width: (u: number) => number;
  /** sideways bend of the centre line at u, in half-heights */
  bend: (u: number) => number;
  bristles: number;
  dryness: number; // how far the dry end reaches back
  gaps: number; // bristle gaps
  press: number; // paint build-up at the start
}

const ease = (u: number, a: number, b: number) => smooth(0, a, u) * (1 - smooth(1 - b, 1, u));

const SHAPES: MarkShape[] = [
  { width: (u) => 0.78 * ease(u, 0.12, 0.08) + 0.06, bend: () => 0, bristles: 22, dryness: 0.35, gaps: 0.25, press: 0.6 },
  { width: (u) => 0.9 * Math.pow(Math.sin(Math.PI * clamp(u * 1.05)), 0.55), bend: () => 0, bristles: 18, dryness: 0.15, gaps: 0.12, press: 1 },
  { width: (u) => 0.62 * ease(u, 0.15, 0.2) + 0.05, bend: (u) => (u - 0.5) * (u - 0.5) * 1.6 - 0.2, bristles: 16, dryness: 0.3, gaps: 0.25, press: 0.5 },
  { width: (u) => 0.82 * ease(u, 0.1, 0.15), bend: () => 0, bristles: 26, dryness: 0.6, gaps: 0.55, press: 0.3 },
  { width: (u) => 0.95 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.5) * 2.05, 2))), bend: () => 0, bristles: 14, dryness: 0.08, gaps: 0.1, press: 0.8 },
  { width: (u) => 0.42 * Math.pow(Math.sin(Math.PI * u), 1.3), bend: (u) => u * u * 0.5, bristles: 7, dryness: 0.2, gaps: 0.15, press: 0.6 },
  { width: (u) => 0.9 * Math.pow(Math.sin(Math.PI * u), 0.85), bend: (u) => Math.sin(Math.PI * u) * 0.12, bristles: 12, dryness: 0.05, gaps: 0.08, press: 0.7 },
  { width: (u) => 0.92 * ease(u, 0.06, 0.1) + 0.04, bend: () => 0, bristles: 30, dryness: 0.4, gaps: 0.3, press: 0.4 },
];

function paintMark(data: Uint8ClampedArray, stride: number, ox: number, oy: number, shape: MarkShape, seed: number) {
  const r = rng(seed);
  const n = shape.bristles;
  // each bristle: its place across the stroke, how much paint, where it runs dry, its tone
  const bristle = Array.from({ length: n }, () => ({
    ink: 0.55 + r() * 0.45,
    end: 1 - shape.dryness * Math.pow(r(), 0.7),
    tone: (r() - 0.5) * 0.9,
    gap: r() < shape.gaps,
  }));
  const pad = 6;
  for (let py = 0; py < CH; py++) {
    for (let px = 0; px < CW; px++) {
      const u = (px - pad) / (CW - 2 * pad);
      const vRaw = ((py + 0.5) / CH) * 2 - 1;
      let a = 0, plain = 0, val = 0.5, h = 0;
      if (u > 0 && u < 1) {
        const w = shape.width(u);
        const v = vRaw - shape.bend(u) * 0.5;
        // ragged edge: the side of a stroke wobbles a little
        const edge = w * (1 + (noise2(u * 9 + seed, v > 0 ? 3 : 7) - 0.5) * 0.18);
        const inside = Math.abs(v) < edge ? 1 : 0;
        plain = clamp((edge - Math.abs(v)) * 18) * (w > 0.02 ? 1 : 0);
        if (inside) {
          const across = clamp((v / Math.max(edge, 1e-3)) * 0.5 + 0.5);
          const bi = Math.min(n - 1, Math.floor(across * n));
          const b = bristle[bi];
          const within = across * n - bi; // 0..1 inside one bristle
          // dry end: the bristle runs out of paint, broken by noise
          const dry = smooth(b.end, b.end - 0.18, u + (noise2(u * 40, bi * 3.1 + seed) - 0.5) * 0.25);
          const gap = b.gap ? 0.35 + 0.65 * smooth(0.0, 0.5, noise2(u * 25, bi + seed * 3)) : 1;
          const fleck = noise2(px * 0.6 + seed, py * 0.6) > 0.82 - 0.2 * (1 - dry) ? 0.4 : 1;
          a = clamp(dry * gap * b.ink * fleck * 1.5);
          val = 0.5 + b.tone * 0.5 + (noise2(u * 60, across * 30 + seed) - 0.5) * 0.25;
          // ridges between bristles, a heap at the press and at the edges where paint is pushed
          const ridge = 0.5 + 0.5 * Math.cos(within * Math.PI * 2);
          const pressHeap = shape.press * smooth(0.35, 0.0, u);
          const edgeHeap = smooth(0.7, 1.0, Math.abs(v) / Math.max(edge, 1e-3)) * 0.12;
          h = clamp(0.3 + ridge * 0.12 * a + pressHeap * 0.45 + edgeHeap + (noise2(u * 14, across * 5 + seed) - 0.5) * 0.25);
        }
      }
      const i = ((oy + py) * stride + ox + px) * 4;
      data[i] = val * 255;
      data[i + 1] = h * 255;
      data[i + 2] = plain * 255;
      data[i + 3] = a * 255;
    }
  }
}

let cached: THREE.Texture | null = null;

export function brushSheet(): THREE.Texture {
  if (cached) return cached;
  const w = CW * COLS, h = CH * ROWS;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  SHAPES.forEach((s, i) => paintMark(img.data, w, (i % COLS) * CW, Math.floor(i / COLS) * CH, s, 101 + i * 37));
  // data texture: keeps the four channels exactly (a canvas would premultiply alpha)
  const tex = new THREE.DataTexture(new Uint8Array(img.data.buffer), w, h, THREE.RGBAFormat);
  tex.flipY = false;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}

export const SHEET = { cols: COLS, rows: ROWS, cellAspect: CW / CH };
