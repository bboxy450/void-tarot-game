// Cards hidden in the valley, painted in dabs from their own art, and the hand of cards found.
import * as THREE from 'three';
import { DabSet, dabMaterial, type Kind } from '../paint/dabs';
import { MARKS } from '../paint/brush';
import { hex, mix, type RGB } from '../paint/util';
import { groundHeight, waterAt, STONES, TABLE, PLATEAU_Y } from '../world/layout';
import { CARDS, CARD_BACK, type Suit } from './cardData';
import type { FX } from './fx';

const CARD_KIND: Kind = { name: 'card', minPx: 0.6, maxPx: 400, gust: 0, mist: 0.25, depthStep: 0.4, impasto: 0.5, broken: 0.25, keepFloor: 1 };
const W = 0.56, H = 0.84; // a large card, so it reads from afar

/** Where the cards lie: [card index, x, z, height above the ground] */
export const PLACES: [number, number, number, number][] = [
  [22, 2.4, -1.2, 1.1], // Ace of Wands: just outside the gate
  [9, TABLE.x + 0.3, TABLE.z, 1.6], // the Hermit: on the nobles' table
  [64, -15.5, -29, 1.0], // Ace of Pentacles: by the road down the hill
  [29, 30, -32, 1.0], // Eight of Wands: on the east slope
  [46, -35, -73, 0.9], // Page of Cups: in the shallows of the pond
  [36, -79, -102, 0.9], // Ace of Cups: in the stream
  [25, 21, -76, 1.0], // Four of Wands: behind the first house
  [41, 8, -101, 1.0], // Six of Cups: by the lamp in the village
  [76, -24, -131, 1.0], // Queen of Pentacles: behind a cottage
  [33, 22, -114, 1.0], // Knight of Wands: among the houses
  [57, 92, -116, 1.0], // Eight of Swords: in the wood behind the seer
  [70, -64, -128, 1.0], // Seven of Pentacles: in the west meadow
  [61, -9, -150, 1.0], // Knight of Swords: on the road south
  [50, STONES.x, STONES.z, 1.9], // Ace of Swords: on the altar stone
  [16, STONES.x + 4, STONES.z + 3, 1.1], // the Tower: in the ring of stones
  [19, -38, -14, 1.0], // the Sun: on the west hillside
  [17, -92, -110, 0.9], // the Star: where the stream rises
  [54, 64, -108, 1.0], // Five of Swords: by the seer's tent
];

interface WorldCard { index: number; group: THREE.Group; base: THREE.Vector3; taken: boolean; flying: number; phase: number }

function sampleImage(img: HTMLImageElement, cols: number, rows: number): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, cols, rows);
  return ctx.getImageData(0, 0, cols, rows).data;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('image ' + src));
    i.src = src;
  });
}

const SUIT_GLOW: Record<Suit, RGB> = { wands: hex('#ffb060'), cups: hex('#8ab4ff'), swords: hex('#e0e8ff'), pentacles: hex('#d8c070'), major: hex('#c8a0ff') };

/** Paint a card in dabs: the front from its art, the back from the deck's back, a gold rim. */
function paintCard(front: Uint8ClampedArray, back: Uint8ClampedArray, cols: number, rows: number, suit: Suit): THREE.Mesh[] {
  const set = new DabSet(CARD_KIND, cols * rows * 2 + 600, 3);
  const cw = W / cols, ch = H / rows;
  const lift = (d: Uint8ClampedArray, i: number): RGB => {
    const c: RGB = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
    // the art is night-dark: lift it so it reads in the dusk
    return [Math.min(1, c[0] * 1.7 + 0.04), Math.min(1, c[1] * 1.7 + 0.04), Math.min(1, c[2] * 1.8 + 0.07)];
  };
  for (let side = 0; side < 2; side++) {
    const data = side === 0 ? front : back;
    const z = side === 0 ? 0.008 : -0.008;
    const n: [number, number, number] = [0, 0, side === 0 ? 1 : -1];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = (j * cols + i) * 4;
        // the back is mirrored so it reads the right way round
        const x = side === 0 ? -W / 2 + (i + 0.5) * cw : W / 2 - (i + 0.5) * cw;
        const y = H / 2 - (j + 0.5) * ch;
        const a = (Math.random() - 0.5) * 0.6;
        set.add(x + (Math.random() - 0.5) * cw * 0.3, y + (Math.random() - 0.5) * ch * 0.3, z, Math.cos(a), Math.sin(a), 0, n, cw * 1.9, ch * 1.0, lift(data, k), { mark: Math.random() < 0.6 ? MARKS.press : MARKS.flat, light: 0.3, glow: 0.85, rank: 0 });
      }
    }
  }
  // gold rim
  const gold = [hex('#f2c650'), hex('#d09a32'), hex('#fff0a0')];
  for (let t = 0; t < 1; t += 0.012) {
    const per = 2 * (W + H);
    let s = t * per, x = 0, y = 0, dx = 1, dy = 0;
    if (s < W) { x = -W / 2 + s; y = H / 2; }
    else if ((s -= W) < H) { x = W / 2; y = H / 2 - s; dx = 0; dy = 1; }
    else if ((s -= H) < W) { x = W / 2 - s; y = -H / 2; }
    else { s -= W; x = -W / 2; y = -H / 2 + s; dx = 0; dy = 1; }
    for (const z of [0.012, -0.012]) set.add(x, y, z, dx, dy, 0, [0, 0, Math.sign(z)], 0.05, 0.022, gold[(Math.random() * 3) | 0], { mark: MARKS.long, light: 0.5, glow: 1, rank: 0 });
  }
  // a halo of soft strokes behind, in the suit's light
  const g = SUIT_GLOW[suit];
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.55 + Math.random() * 0.25;
    set.add(Math.cos(a) * r * 0.8, Math.sin(a) * r, 0, -Math.sin(a), Math.cos(a), 0, null, 0.22, 0.06, mix(g, [1, 1, 1], Math.random() * 0.3), { mark: MARKS.curve, light: 0, glow: 1, rank: 0 });
  }
  return set.build(dabMaterial(CARD_KIND));
}

export class Cards {
  world: WorldCard[] = [];
  found: number[] = [];
  selected = -1;
  images = new Map<number, HTMLImageElement>();
  back: HTMLImageElement | null = null;
  ready = false;
  onChange: () => void = () => {};

  constructor(private scene: THREE.Scene, private fx: FX) {}

  async load() {
    const back = await loadImage(CARD_BACK);
    this.back = back;
    const cols = 20, rows = 30;
    const backData = sampleImage(back, cols, rows);
    await Promise.all(
      PLACES.map(async ([index, x, z, dy]) => {
        const img = await loadImage(CARDS[index].image);
        this.images.set(index, img);
        const meshes = paintCard(sampleImage(img, cols, rows), backData, cols, rows, CARDS[index].suit);
        const group = new THREE.Group();
        for (const m of meshes) { m.frustumCulled = false; group.add(m); }
        const inCourt = Math.abs(x) < 18 && z > 4 && z < 40;
        const w = waterAt(x, z);
        const gy = inCourt ? PLATEAU_Y : Math.max(groundHeight(x, z), w ?? -99);
        const base = new THREE.Vector3(x, gy + dy, z);
        group.position.copy(base);
        this.scene.add(group);
        this.world.push({ index, group, base, taken: false, flying: -1, phase: Math.random() * 6 });
      }),
    );
    this.ready = true;
  }

  /** the nearest card not yet taken within reach */
  nearest(p: THREE.Vector3, reach = 2.8): WorldCard | null {
    let best: WorldCard | null = null, bd = reach;
    for (const c of this.world) {
      if (c.taken) continue;
      const d = Math.hypot(c.base.x - p.x, c.base.z - p.z);
      if (d < bd && Math.abs(c.base.y - p.y) < 3.5) { bd = d; best = c; }
    }
    return best;
  }

  take(c: WorldCard) {
    c.taken = true;
    c.flying = 0;
    this.give(c.index);
  }

  give(index: number) {
    if (!this.found.includes(index)) this.found.push(index);
    this.selected = this.found.indexOf(index);
    this.onChange();
  }

  current(): number | null { return this.selected >= 0 ? this.found[this.selected] : null; }

  cycle(step: number) {
    if (!this.found.length) return;
    this.selected = (this.selected + step + this.found.length) % this.found.length;
    this.onChange();
  }

  selectSuit(suit: Suit) {
    const list = this.found.map((c, i) => ({ c, i })).filter(({ c }) => CARDS[c].suit === suit);
    if (!list.length) return false;
    const after = list.find(({ i }) => i > this.selected && CARDS[this.found[this.selected]]?.suit === suit) ?? list[0];
    this.selected = after.i;
    this.onChange();
    return true;
  }

  selectCard(index: number) {
    const i = this.found.indexOf(index);
    if (i >= 0) { this.selected = i; this.onChange(); }
  }

  update(dt: number, t: number, hand: THREE.Vector3) {
    for (const c of this.world) {
      if (c.taken) {
        if (c.flying >= 0) {
          c.flying += dt;
          const k = Math.min(1, c.flying / 0.45);
          c.group.position.lerpVectors(c.base, hand, k * k);
          c.group.rotation.y += dt * 14;
          if (k >= 1) { c.flying = -1; c.group.visible = false; }
        }
        continue;
      }
      c.group.rotation.y = t * 0.9 + c.phase;
      c.group.position.y = c.base.y + Math.sin(t * 1.6 + c.phase) * 0.08;
      // motes rising off it
      if (Math.random() < dt * 5) {
        const g = SUIT_GLOW[CARDS[c.index].suit];
        this.fx.spawn({ x: c.base.x + (Math.random() - 0.5) * 0.8, y: c.base.y - 0.4 + Math.random() * 0.5, z: c.base.z + (Math.random() - 0.5) * 0.8, vy: 0.4 + Math.random() * 0.5, life: 1.8, size: 0.09, size1: 0.01, col: mix(g, [1, 1, 1], 0.4), mark: MARKS.round, glow: 1, wid: 0.9 });
      }
    }
  }

  remaining() { return this.world.filter((c) => !c.taken).length; }
}
