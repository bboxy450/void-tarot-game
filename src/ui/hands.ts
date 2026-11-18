// The hands over the painted world, like weapons in Doom: lower left, a fist on the Hermit's
// staff-lantern with a living flame; lower right, a hand holding the selected card as a pixel
// miniature of its art. The hands (handMesh.ts) are sprites at twice the pixel density of the lantern,
// hearts and flame, which are chunky sprites drawn on a 2x grid. Also a small aiming mark.
import { hex } from '../paint/util';
import { meshSprites } from './handMesh';

type Col = string;

/** A tiny raster of palette colours with an outline pass. */
class Px {
  data: (Col | null)[];
  constructor(public w: number, public h: number) {
    this.data = new Array(w * h).fill(null);
  }
  set(x: number, y: number, c: Col | null) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c;
  }
  get(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : null; }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Col | null) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.set(x, y, c);
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: Col | null) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  poly(pts: [number, number][], c: Col | null) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        const yy = y + 0.5;
        if ((ay <= yy && by > yy) || (by <= yy && ay > yy)) xs.push(ax + ((yy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) this.set(x, y, c);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Col | null) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  /** light from the upper left: a lighter rim there, a darker one at the lower right */
  shade(from: Col, hi: Col, lo: Col) {
    const src = this.data.slice();
    const g = (x: number, y: number) => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : null);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x] !== from) continue;
      if (g(x - 1, y) !== from || g(x, y - 1) !== from) this.data[y * this.w + x] = hi;
      else if (g(x + 1, y) !== from || g(x, y + 1) !== from || g(x + 2, y + 1) !== from) this.data[y * this.w + x] = lo;
    }
  }
  outline(c: Col) {
    const src = this.data.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x]) continue;
      const n = [src[y * this.w + x - 1], src[y * this.w + x + 1], y > 0 ? src[(y - 1) * this.w + x] : null, y < this.h - 1 ? src[(y + 1) * this.w + x] : null];
      if ((x > 0 && n[0]) || (x < this.w - 1 && n[1]) || n[2] || n[3]) this.data[y * this.w + x] = c;
    }
  }
  canvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      if (!v) continue;
      const [r, g, b] = hex(v);
      img.data[i * 4] = r * 255; img.data[i * 4 + 1] = g * 255; img.data[i * 4 + 2] = b * 255; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

const P = {
  out: '#120a1a',
  gold: ['#6a4414', '#b8862a', '#f0cc58', '#fff2a8'],
  iron: ['#14101c', '#2e2838', '#4e4860', '#7a7490'],
};

function lanternSprite(): HTMLCanvasElement {
  const px = new Px(74, 140);
  // (the staff below the lantern is painted with the fist)
  // lantern: ring, cap, rim, cage, base
  px.ellipse(38.5, 7.5, 4.5, 4.5, P.iron[2]);
  px.ellipse(38.5, 7.5, 2, 2, null);
  px.poly([[38.5, 11], [52, 24], [25, 24]], P.iron[1]);
  px.shade(P.iron[1], P.iron[3], P.iron[0]);
  px.rect(23, 24, 54, 27, P.gold[1]);
  px.rect(23, 24, 54, 24, P.gold[2]);
  px.rect(26, 28, 51, 49, '#ffcf6a'); // glass (filled per frame)
  for (const x of [26, 27, 38, 39, 50, 51]) px.rect(x, 28, x, 49, x % 2 ? P.iron[1] : P.iron[2]);
  px.rect(26, 38, 51, 38, P.iron[1]);
  px.rect(23, 50, 54, 53, P.gold[1]);
  px.rect(23, 50, 54, 50, P.gold[2]);
  px.rect(34, 54, 43, 57, P.iron[2]);
  px.outline(P.out);
  return px.canvas();
}

/** the fist sprite reaches further left than the lantern sprite, for the forearm */
export const FIST_PAD = 70, FIST_W = 148 + FIST_PAD;
export interface HandSprites { fist: HTMLCanvasElement; back: HTMLCanvasElement; front: HTMLCanvasElement; open: HTMLCanvasElement }

function heartSprite(full: boolean): HTMLCanvasElement {
  const rows = ['.##..##.', '########', '########', '########', '.######.', '..####..', '...##...'];
  const px = new Px(10, 9);
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && px.set(x + 1, y + 1, full ? '#c8243a' : '#2a1830')));
  if (full) { px.set(2, 2, '#ff9aa8'); px.set(3, 2, '#ff6a7e'); px.set(2, 3, '#ff6a7e'); px.set(7, 5, '#7a1020'); px.set(6, 6, '#7a1020'); }
  px.outline(P.out);
  return px.canvas();
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

interface Spark { x: number; y: number; vx: number; vy: number; life: number; c: string }

export class Hands {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scale = 4;
  private lantern = lanternSprite();
  sprites: HandSprites | null = null; // null until the chosen hands are made
  private hearts = [heartSprite(true), heartSprite(false)];
  private cardPx = new Map<number, HTMLCanvasElement>();
  private sparks: Spark[] = [];
  throwT = 1;
  hurtT = 1;
  hidden = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    meshSprites().then((sp) => { this.sprites = sp; });
  }

  resize(w: number, h: number) {
    // the canvas is at the hands' density; the chunky sprites draw on a 2x grid over it
    this.scale = Math.max(1, Math.round(h / 370));
    this.canvas.width = Math.ceil(w / this.scale);
    this.canvas.height = Math.ceil(h / this.scale);
    this.ctx.imageSmoothingEnabled = false;
  }

  /** A pixel miniature of the card art: downsampled, lifted, with a gold frame. */
  cardSprite(index: number, img: HTMLImageElement): HTMLCanvasElement {
    const got = this.cardPx.get(index);
    if (got) return got;
    const w = 80, h = 120;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'brightness(1.75) contrast(1.15) saturate(1.25)';
    ctx.drawImage(img, 1, 1, w - 2, h - 2);
    ctx.filter = 'none';
    // limit the palette a little, so it reads as pixels
    const d = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < d.data.length; i += 4) for (let k = 0; k < 3; k++) d.data[i + k] = Math.round(d.data[i + k] / 24) * 24;
    ctx.putImageData(d, 0, 0);
    ctx.fillStyle = '#d8a83a';
    ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, h - 1, w, 1); ctx.fillRect(0, 0, 1, h); ctx.fillRect(w - 1, 0, 1, h);
    ctx.fillStyle = '#fff0a0';
    ctx.fillRect(0, 0, w - 1, 1); ctx.fillRect(0, 0, 1, h - 1);
    this.cardPx.set(index, c);
    return c;
  }

  draw(o: { t: number; dt: number; walk: number; walkAmt: number; card: { index: number; img: HTMLImageElement; glow: string; ready: number } | null; hearts: number; maxHearts: number; flame: number }) {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.hidden) return;
    // layout in chunky units (2 canvas pixels); painted sprites draw at half size, so at full density
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const W = Math.ceil(this.canvas.width / 2), H = Math.ceil(this.canvas.height / 2);
    const fine = (c: HTMLCanvasElement, x: number, y: number) => ctx.drawImage(c, x, y, c.width / 2, c.height / 2);
    const { t, dt } = o;
    this.throwT = Math.min(1, this.throwT + dt / 0.42);
    this.hurtT = Math.min(1, this.hurtT + dt / 0.4);
    const hurt = (1 - this.hurtT) * 4;
    const sw = Math.sin(o.walk) * 4 * o.walkAmt, dip = Math.abs(Math.cos(o.walk)) * 4 * o.walkAmt;
    const breathe = Math.sin(t * 1.6) * 1.2;

    // --- left: the lantern
    const lx = Math.round(W * 0.07 + sw - 6 + Math.sin(t * 37) * hurt);
    const ly = Math.round(H - 128 + dip + breathe);
    // halo, dithered
    const cx = lx + 38, cy = ly + 38;
    const fl = 0.85 + 0.15 * Math.sin(t * 17) * Math.sin(t * 9.3);
    const R = 34 * fl;
    for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(H, cy + R); y++) {
      for (let x = Math.max(0, Math.floor(lx - 10)); x < Math.min(W, cx + R); x++) {
        const d = Math.hypot(x - cx, (y - cy) * 1.1) / R;
        if (d > 1) continue;
        const k = (1 - d) * (1 - d) * 0.8;
        if (k > BAYER[(y & 3) * 4 + (x & 3)]) {
          ctx.fillStyle = d < 0.35 ? 'rgba(255,214,140,0.55)' : 'rgba(255,170,80,0.32)';
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    ctx.drawImage(this.lantern, lx, ly);
    const sp = this.sprites;
    if (sp) fine(sp.fist, lx - FIST_PAD / 2, ly);
    // glass glow and the flame inside
    for (let y = 28; y <= 49; y++) for (let x = 28; x <= 49; x++) {
      if (x === 38 || x === 39 || y === 38) continue;
      const v = 0.55 + 0.45 * Math.sin(t * 9 + x * 0.3 + y * 0.2) * Math.sin(t * 13 + y * 0.5);
      ctx.fillStyle = v > 0.6 ? '#ffd27a' : '#f0a848';
      ctx.fillRect(lx + x, ly + y, 1, 1);
    }
    const fh = 13 + Math.sin(t * 11) * 2 + Math.sin(t * 23) * 1.5;
    for (let i = 0; i < fh; i++) {
      const y = ly + 47 - i;
      const k = i / fh;
      const sway = Math.round(Math.sin(t * 8 + i * 0.4) * k * 2.2);
      const half = Math.max(0, Math.round(5.5 * Math.pow(1 - k, 0.8) * (0.85 + 0.15 * Math.sin(t * 19 + i))));
      for (let dx = -half; dx <= half; dx++) {
        const e = Math.abs(dx) / Math.max(1, half);
        const col = k < 0.55 && e < 0.4 ? '#fffbe8' : e < 0.6 && k < 0.8 ? '#ffe070' : k > 0.85 ? '#d2381e' : '#ff9a2e';
        ctx.fillStyle = col;
        ctx.fillRect(lx + 38 + dx + sway, y, 1, 1);
      }
    }
    // sparks off the cap
    if (Math.random() < dt * 9 * o.flame) this.sparks.push({ x: lx + 38 + (Math.random() - 0.5) * 4, y: ly + 10, vx: (Math.random() - 0.5) * 8, vy: -12 - Math.random() * 14, life: 0.7 + Math.random() * 0.8, c: Math.random() < 0.5 ? '#ffe070' : '#ff8a30' });
    for (const s of this.sparks) {
      s.life -= dt; s.vy += 6 * dt; s.vx += Math.sin(t * 5 + s.y) * 10 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      ctx.fillStyle = s.life < 0.3 ? '#a03018' : s.c;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);

    // --- right: the hand with the card
    const th = this.throwT;
    const lift = th < 0.35 ? Math.sin((th / 0.35) * Math.PI * 0.5) : 1 - (th - 0.35) / 0.65;
    const rx = Math.round(W - 90 - W * 0.07 - sw + Math.sin(t * 41) * hurt - (th < 1 ? lift * 14 : 0));
    const ry = Math.round(H - 124 + dip * 0.8 - breathe + (th < 1 ? -lift * 20 + (th > 0.35 ? (1 - lift) * 0 : 0) : 0));
    if (o.card) {
      const showCard = !(th > 0.25 && th < 0.6);
      if (showCard) {
        if (sp) fine(sp.back, rx, ry);
        const cs = this.cardSprite(o.card.index, o.card.img);
        const rise = th >= 0.6 && th < 1 ? Math.round((1 - (th - 0.6) / 0.4) * 30) : 0;
        // the card's aura when it is ready to cast
        if (o.card.ready > 0.99) {
          ctx.fillStyle = o.card.glow;
          for (let y = -5; y < 125; y++) for (let x = -5; x < 85; x++) {
            const inside = x >= 0 && y >= 0 && x < 80 && y < 120;
            if (inside) continue;
            if (BAYER[((y + 64) & 3) * 4 + ((x + 64) & 3)] < 0.5 + 0.25 * Math.sin(t * 6 + (x + y) * 0.2)) ctx.fillRect(rx + 20 + x / 2, ry + 20 + y / 2 + rise, 0.5, 0.5);
          }
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx + 10, ry, 80, 120);
        ctx.clip();
        ctx.globalAlpha = 0.45 + 0.55 * o.card.ready;
        fine(cs, rx + 20, ry + 20 + rise);
        ctx.restore();
      }
      if (sp) fine(showCard ? sp.front : sp.open, rx, ry);
    } else {
      if (sp) fine(sp.open, rx, ry);
    }

    // --- hearts
    for (let i = 0; i < o.maxHearts; i++) ctx.drawImage(this.hearts[i < o.hearts ? 0 : 1], 4 + i * 11, 4);
    // aiming mark
    ctx.fillStyle = 'rgba(255,236,190,0.55)';
    ctx.fillRect(Math.floor(W / 2), Math.floor(H / 2) - 1, 1, 3);
    ctx.fillRect(Math.floor(W / 2) - 1, Math.floor(H / 2), 3, 1);
  }
}
