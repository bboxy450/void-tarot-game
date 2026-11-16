// The hands, drawn as chunky pixel sprites over the painted world, like weapons in Doom:
// lower left, a hand on the Hermit's staff-lantern with a living flame; lower right, a hand holding
// the selected card as a pixel miniature of its art. Also the hearts and a small aiming mark.
import { hex } from '../paint/util';

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
  skin: ['#5a2e2e', '#9a5a46', '#d08a66', '#f2bc92'],
  robe: ['#160e2c', '#2c1c50', '#4a307a', '#6a4aa0'],
  gold: ['#6a4414', '#b8862a', '#f0cc58', '#fff2a8'],
  iron: ['#14101c', '#2e2838', '#4e4860', '#7a7490'],
  wood: ['#2c1a12', '#5a3820', '#86582e', '#a8743e'],
};

function drawSleeve(px: Px, pts: [number, number][], cuff: [number, number][]) {
  px.poly(pts, P.robe[1]);
  px.shade(P.robe[1], P.robe[2], P.robe[0]);
  // folds
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = pts[0];
    px.line(ax - 4 - i * 7, ay, cuff[1][0] - 2 - i * 5, cuff[1][1] + 6, P.robe[0]);
  }
  px.poly(cuff, P.gold[1]);
  px.shade(P.gold[1], P.gold[2], P.gold[0]);
}

function lanternSprite(): HTMLCanvasElement {
  const px = new Px(74, 140);
  // the staff
  px.poly([[36, 54], [41, 54], [44, 140], [37, 140]], P.wood[1]);
  px.shade(P.wood[1], P.wood[2], P.wood[0]);
  px.line(38, 60, 40, 138, P.wood[3]);
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
  // sleeve and cuff from the lower left
  drawSleeve(px, [[0, 140], [0, 108], [14, 98], [31, 102], [36, 116], [31, 140]], [[13, 97], [31, 101], [34, 108], [16, 105]]);
  // the fist round the staff
  px.ellipse(40, 99, 11, 10, P.skin[1]);
  px.ellipse(37, 96, 7.5, 6.5, P.skin[2]);
  px.ellipse(35, 94, 3, 2.5, P.skin[3]);
  for (let i = 0; i < 4; i++) {
    px.ellipse(49, 90 + i * 5, 3.6, 2.8, P.skin[i % 2 ? 1 : 2]);
    px.line(46, 92.5 + i * 5, 51, 92.5 + i * 5, P.skin[0]);
  }
  // the thumb laid over the fingers
  px.poly([[30, 92], [42, 86], [47, 88], [44, 91], [33, 97]], P.skin[2]);
  px.line(34, 92, 44, 88, P.skin[3]);
  px.outline(P.out);
  return px.canvas();
}

function cardHandSprites(): { back: HTMLCanvasElement; front: HTMLCanvasElement; open: HTMLCanvasElement } {
  const back = new Px(90, 140);
  // fingers behind the card: they show past its right edge
  for (let i = 0; i < 3; i++) {
    back.ellipse(63, 40 + i * 8, 5, 3.6, P.skin[i % 2 ? 1 : 2]);
    back.line(59, 43.5 + i * 8, 67, 43.5 + i * 8, P.skin[0]);
  }
  back.outline(P.out);
  const front = new Px(90, 140);
  drawSleeve(front, [[90, 140], [90, 102], [72, 94], [54, 102], [52, 140]], [[71, 93], [54, 101], [56, 108], [73, 100]]);
  front.ellipse(55, 92, 13, 11, P.skin[1]);
  front.ellipse(52, 89, 9, 7, P.skin[2]);
  // the thumb pressing the card from the front
  front.poly([[46, 90], [30, 80], [27, 74], [33, 71], [50, 82]], P.skin[2]);
  front.line(31, 75, 46, 84, P.skin[3]);
  front.ellipse(29, 74, 3.5, 3, P.skin[2]);
  front.outline(P.out);
  // an open hand when there is no card yet
  const open = new Px(90, 140);
  drawSleeve(open, [[90, 140], [90, 102], [72, 94], [54, 102], [52, 140]], [[71, 93], [54, 101], [56, 108], [73, 100]]);
  for (let i = 0; i < 4; i++) {
    open.poly([[42 + i * 6, 88], [40 + i * 6, 64 + Math.abs(i - 1.5) * 4], [45 + i * 6, 62 + Math.abs(i - 1.5) * 4], [48 + i * 6, 88]], P.skin[2]);
    open.line(41 + i * 6, 66 + Math.abs(i - 1.5) * 4, 41 + i * 6, 86, P.skin[3]);
  }
  open.ellipse(54, 92, 13, 10, P.skin[1]);
  open.ellipse(51, 89, 9, 7, P.skin[2]);
  open.poly([[44, 92], [32, 84], [30, 79], [35, 78], [47, 86]], P.skin[2]);
  open.outline(P.out);
  return { back: back.canvas(), front: front.canvas(), open: open.canvas() };
}

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
  private hand = cardHandSprites();
  private hearts = [heartSprite(true), heartSprite(false)];
  private cardPx = new Map<number, HTMLCanvasElement>();
  private sparks: Spark[] = [];
  throwT = 1;
  hurtT = 1;
  hidden = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number) {
    this.scale = Math.max(2, Math.round(h / 185));
    this.canvas.width = Math.ceil(w / this.scale);
    this.canvas.height = Math.ceil(h / this.scale);
    this.ctx.imageSmoothingEnabled = false;
  }

  /** A pixel miniature of the card art: downsampled, lifted, with a gold frame. */
  cardSprite(index: number, img: HTMLImageElement): HTMLCanvasElement {
    const got = this.cardPx.get(index);
    if (got) return got;
    const w = 40, h = 60;
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
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (this.hidden) return;
    const { t, dt } = o;
    this.throwT = Math.min(1, this.throwT + dt / 0.42);
    this.hurtT = Math.min(1, this.hurtT + dt / 0.4);
    const hurt = (1 - this.hurtT) * 4;
    const sw = Math.sin(o.walk) * 4 * o.walkAmt, dip = Math.abs(Math.cos(o.walk)) * 4 * o.walkAmt;
    const breathe = Math.sin(t * 1.6) * 1.2;
    const sz = Math.min(1.25, H / 230);
    void sz;

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
        ctx.drawImage(this.hand.back, rx, ry);
        const cs = this.cardSprite(o.card.index, o.card.img);
        const rise = th >= 0.6 && th < 1 ? Math.round((1 - (th - 0.6) / 0.4) * 30) : 0;
        // the card's aura when it is ready to cast
        if (o.card.ready > 0.99) {
          ctx.fillStyle = o.card.glow;
          for (let y = -3; y < 64; y++) for (let x = -3; x < 43; x++) {
            const inside = x >= 0 && y >= 0 && x < 40 && y < 60;
            if (inside) continue;
            if (BAYER[((y + 64) & 3) * 4 + ((x + 64) & 3)] < 0.5 + 0.25 * Math.sin(t * 6 + (x + y) * 0.4)) ctx.fillRect(rx + 20 + x, ry + 20 + y + rise, 1, 1);
          }
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx + 10, ry, 80, 120);
        ctx.clip();
        ctx.globalAlpha = 0.45 + 0.55 * o.card.ready;
        ctx.drawImage(cs, rx + 20, ry + 20 + rise);
        ctx.restore();
      }
      ctx.drawImage(showCard ? this.hand.front : this.hand.open, rx, ry);
    } else {
      ctx.drawImage(this.hand.open, rx, ry);
    }

    // --- hearts
    for (let i = 0; i < o.maxHearts; i++) ctx.drawImage(this.hearts[i < o.hearts ? 0 : 1], 4 + i * 11, 4);
    // aiming mark
    ctx.fillStyle = 'rgba(255,236,190,0.55)';
    ctx.fillRect(Math.floor(W / 2), Math.floor(H / 2) - 1, 1, 3);
    ctx.fillRect(Math.floor(W / 2) - 1, Math.floor(H / 2), 3, 1);
  }
}
