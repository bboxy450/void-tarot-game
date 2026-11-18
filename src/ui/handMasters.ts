// Hands cut from public-domain old masters (public/hands/masters, crops of Wikimedia Commons scans):
// the card hand from Theodoor Rombouts, "Card player showing his hand" (c. 1620s); the loosely closed hand
// resting on the table in Caravaggio's "The Cardsharps" (c. 1594), stood upright round the staff for the left
// hand and as it is for the empty right. Each is clipped by a traced outline, placed in the sprite frame,
// graded to the dusk, and cut to the same 40-colour sprites as the other hands.
import { toSprites } from './handRender';
import { FIST_PAD, FIST_W, type HandSprites } from './hands';

const SS = 4;
type Pt = [number, number];
interface Cut { src: string; outline: Pt[]; anchor: Pt; to: Pt; scale: number; turn?: number; mirror?: boolean; sat?: number }

const ROMBOUTS: Cut = {
  src: 'rombouts-hand.jpg', anchor: [190, 255], to: [95, 150], scale: 0.6, mirror: true, sat: 0.7,
  outline: [[0, 470], [40, 380], [70, 300], [100, 245], [130, 218], [175, 212], [215, 225], [230, 260], [232, 300], [228, 325], [275, 340], [300, 380], [300, 430], [270, 480], [240, 520], [200, 560], [0, 560]],
};
const CARAVAGGIO_OUTLINE: Pt[] = [[38, 95], [45, 60], [70, 40], [110, 32], [150, 33], [185, 42], [212, 58], [222, 80], [218, 150], [110, 150], [70, 138], [45, 125]];
const CARAVAGGIO: Cut = { src: 'caravaggio-hand.jpg', anchor: [130, 90], to: [108, 215], scale: 0.8, outline: CARAVAGGIO_OUTLINE };
/** the same hand stood up: knuckles up, wrist down, the staff through the curl of the fingers */
const FIST: Cut = { src: 'caravaggio-hand.jpg', anchor: [80, 95], to: [80 + FIST_PAD, 195], scale: 0.7, turn: 90, mirror: true, outline: CARAVAGGIO_OUTLINE };

const image = (name: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = `${import.meta.env.BASE_URL}hands/masters/${name}`; });

/** Lay one cut onto a canvas at SS samples per sprite pixel. */
async function lay(cx: CanvasRenderingContext2D, c: Cut) {
  const img = await image(c.src);
  cx.save();
  cx.translate(c.to[0] * SS, c.to[1] * SS);
  if (c.mirror) cx.scale(-1, 1);
  cx.rotate(((c.turn ?? 0) * Math.PI) / 180);
  cx.scale(c.scale * SS, c.scale * SS);
  cx.translate(-c.anchor[0], -c.anchor[1]);
  cx.beginPath(); c.outline.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y))); cx.closePath(); cx.clip();
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(img, 0, 0);
  cx.restore();
}

/** From canvas to the sprite picture, with a little dusk in the grade. */
function picture(cx: CanvasRenderingContext2D, W: number, H: number, sat = 1): Uint8ClampedArray {
  const d = cx.getImageData(0, 0, W, H).data;
  for (let q = 0; q < d.length; q += 4) {
    if (d[q + 3] < 128) { d[q + 3] = 0; continue; }
    const l = 0.3 * d[q] + 0.55 * d[q + 1] + 0.15 * d[q + 2];
    const [r, g, b] = [0, 1, 2].map((c) => l + (d[q + c] - l) * sat);
    d[q] = Math.min(255, r * 1.04); d[q + 1] = g * 0.97; d[q + 2] = Math.min(255, b * 1.06); d[q + 3] = 255;
  }
  return d;
}

export async function mastersSprites(): Promise<HandSprites> {
  const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w * SS; c.height = h * SS; return c.getContext('2d', { willReadFrequently: true })!; };
  // the fist: a staff, the hand over it
  const fw = FIST_W, fh = 280, f = mk(fw, fh);
  const sx = (80 + FIST_PAD) * SS, sw = 9 * SS;
  const wood = f.createLinearGradient(sx - sw, 0, sx + sw, 0);
  wood.addColorStop(0, '#2a160c'); wood.addColorStop(0.35, '#7a4c28'); wood.addColorStop(0.55, '#9a6a3a'); wood.addColorStop(1, '#2a160c');
  f.fillStyle = wood; f.fillRect(sx - sw, 108 * SS, sw * 2, (fh - 108) * SS);
  const staff = f.getImageData(0, 0, fw * SS, fh * SS).data;
  const hf = mk(fw, fh);
  await lay(hf, FIST);
  const fp = picture(hf, fw * SS, fh * SS);
  for (let q = 0; q < fp.length; q += 4) if (!fp[q + 3] && staff[q + 3]) fp.set([staff[q], staff[q + 1], staff[q + 2], 255], q);
  const fist = toSprites(fp, fw * SS, fh * SS, SS, fw, fh).all;
  // the card hand: all of it in front of the card
  const w = 180, h = 280, c = mk(w, h);
  await lay(c, ROMBOUTS);
  const held = toSprites(picture(c, w * SS, h * SS, ROMBOUTS.sat), w * SS, h * SS, SS, w, h);
  const o = mk(w, h);
  await lay(o, CARAVAGGIO);
  const open = toSprites(picture(o, w * SS, h * SS), w * SS, h * SS, SS, w, h).all;
  return { fist, back: held.back, front: held.all, open };
}
