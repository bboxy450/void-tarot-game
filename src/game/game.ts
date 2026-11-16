// The game: input, the Fool's step, cards found and cast, Shades, the seer, hands, words and sound.
import * as THREE from 'three';
import type { World } from '../world/world';
import type { Player } from './player';
import { FX, Lights, Jolt } from './fx';
import { Spells, ELEMENT_OF, type Element } from './spells';
import { Shades } from './shades';
import { Cards } from './cards';
import { CARDS, type Suit } from './cardData';
import { Hands } from '../ui/hands';
import { Hud } from '../ui/hud';
import { Sounds } from '../audio';
import { gustAt } from './wind';
import { MARKS } from '../paint/brush';
import { hex, mix } from '../paint/util';
import { finishUniforms } from '../finish';
import { GATE, TENT, groundHeight, hillMask } from '../world/layout';

const COOLDOWN = 0.45;
const LEAF_COLS = ['#3f6a3f', '#6f823a', '#b0983e', '#d08a3a', '#a85a36', '#7a3c3e', '#e9c25e'].map(hex);
const GLOW: Record<Suit, string> = { wands: 'rgba(255,170,80,0.85)', cups: 'rgba(130,170,255,0.85)', swords: 'rgba(225,235,255,0.85)', pentacles: 'rgba(220,190,100,0.85)', major: 'rgba(190,150,255,0.9)' };

export interface GameOpts { renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; scene: THREE.Scene; world: World; player: Player; canvas: HTMLCanvasElement; skipTitle: boolean }

export class Game {
  fx: FX;
  lights = new Lights();
  jolt = new Jolt();
  spells: Spells;
  shades: Shades;
  cards: Cards;
  hands: Hands;
  hud = new Hud();
  audio = new Sounds();
  started = false;
  keys = new Set<string>();
  locked = false;
  private lastCast = -9;
  private t = 0;
  private walkPhase = 0;
  private stepDist = 0;
  private lastHurt = -99;
  private regen = 0;
  private dying = -1;
  private fade = 0;
  private jumpQueued = false;
  private hintClock = 0;
  private eye = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private titleFade = 1;
  private lastDt = 1 / 60;

  constructor(private o: GameOpts) {
    this.fx = new FX(o.scene);
    this.cards = new Cards(o.scene, this.fx);
    const sound = (n: string, at?: THREE.Vector3, g?: number) => this.audio.play(n, at, g);
    this.shades = new Shades(o.scene, this.fx, sound);
    this.spells = new Spells(this.fx, this.lights, this.jolt, this.shades, sound, () => { o.player.hearts = o.player.maxHearts; });
    this.shades.onHurtPlayer = (d, from) => this.hurt(d, from);
    this.hands = new Hands(document.getElementById('pixels') as HTMLCanvasElement);
    this.cards.onChange = () => {
      this.hud.setCount(this.cards.found.length);
      this.hud.setCard(this.cards.current());
    };
    this.hud.setCount(0);
    this.cards.load().catch((e) => console.warn('cards', e));
    if (o.skipTitle) {
      this.hud.hideTitle(true);
      this.started = true;
      this.titleFade = 0;
    }
    this.bindInput();
  }

  // ------------------------------------------------------------------------------------------
  // input

  private lock() {
    try {
      const r = this.o.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      r?.catch?.(() => {});
    } catch { /* not allowed here (headless, iframe) */ }
  }

  private bindInput() {
    const { canvas } = this.o;
    const begin = () => {
      if (this.started) return;
      this.started = true;
      this.hud.hideTitle();
      this.audio.unlock();
      this.audio.play('start');
      this.hud.once('walk', 'WASD to walk · move the mouse to look');
      this.lock();
    };
    this.hud.title.addEventListener('click', begin);
    canvas.addEventListener('click', () => {
      this.audio.unlock();
      if (!this.started) return begin();
      if (this.hud.readingOpen) return this.hud.hideReading();
      if (!this.locked) this.lock();
    });
    this.hud.reading.addEventListener('click', () => this.hud.hideReading());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    document.addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0 && !this.hud.readingOpen) this.castNow();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const p = this.o.player;
      p.yaw -= e.movementX * 0.0022;
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - e.movementY * 0.0022));
    });
    window.addEventListener('wheel', (e) => {
      if (!this.started) return;
      this.cards.cycle(e.deltaY > 0 ? 1 : -1);
      this.audio.play('select');
    }, { passive: true });
    window.addEventListener('keydown', (e) => {
      this.audio.unlock();
      const k = e.code;
      this.keys.add(k);
      if (k === 'Space') { this.jumpQueued = true; e.preventDefault(); }
      if (k === 'KeyE') this.interact();
      if (k === 'KeyM') { const m = this.audio.toggleMute(); this.hud.mute.classList.toggle('on', m); }
      const suits: Record<string, Suit> = { Digit1: 'wands', Digit2: 'cups', Digit3: 'swords', Digit4: 'pentacles', Digit5: 'major' };
      if (suits[k]) { if (this.cards.selectSuit(suits[k])) this.audio.play('select'); }
      if (k === 'Escape' && this.hud.readingOpen) this.hud.hideReading();
      if (!this.started && (k === 'Enter' || k === 'Space')) begin();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private interact() {
    if (this.hud.readingOpen) { this.hud.hideReading(); return; }
    const p = this.o.player.pos;
    const c = this.cards.nearest(p);
    if (c) {
      this.cards.take(c);
      const info = CARDS[c.index];
      const el = { wands: 'Wands · Fire', cups: 'Cups · Water', swords: 'Swords · Air', pentacles: 'Pentacles · Earth', major: 'Major Arcana · ' + ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'][c.index] }[info.suit] ?? '';
      this.hud.showBanner(info.title, el);
      this.audio.play('pickup');
      this.hands.throwT = 0.6; // the card rises into the hand
      this.hud.once('cast', 'Click to cast the card · wheel or 1–4 to choose');
      const suits = new Set(this.cards.found.map((i) => CARDS[i].suit));
      if (suits.has('wands') && suits.has('pentacles')) this.hud.once('oil', 'Earth leaves oil on the ground. Fire on oil explodes.');
      if (suits.has('cups') && suits.has('swords')) this.hud.once('zap', 'Water leaves a pool. Air charges it. Then anything that touches it is struck.');
      if (info.suit === 'major') this.hud.once('trump', 'The trumps do stranger things. Cast it and see.');
      return;
    }
    if (this.nearSeer()) this.openReading();
  }

  private nearSeer() {
    const p = this.o.player.pos;
    return Math.hypot(p.x - (TENT.x + Math.sin(TENT.face) * 2.2), p.z - (TENT.z + Math.cos(TENT.face) * 2.2)) < 3.6;
  }

  openReading() {
    const found = this.cards.found.slice();
    for (let i = found.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [found[i], found[j]] = [found[j], found[i]]; }
    const pick = found.slice(0, 3);
    this.hud.showReading(pick, (c) => {
      const m = CARDS[c].meaning;
      const first = m.split(/[,.;]/).slice(0, 3).join(',').trim();
      return first.length > 96 ? first.slice(0, 94) + '…' : first + '.';
    });
    this.audio.play('seer');
  }

  // ------------------------------------------------------------------------------------------
  // casting

  private aim() {
    const cam = this.o.camera;
    cam.getWorldDirection(this.fwd);
    this.right.set(1, 0, 0).applyQuaternion(cam.quaternion);
  }

  castNow() {
    const idx = this.cards.current();
    if (idx === null) { this.hud.once('nocard', 'Your hand is empty. Find a card first.'); return; }
    if (this.t - this.lastCast < COOLDOWN) return;
    this.lastCast = this.t;
    this.aim();
    const from = this.eye.clone().addScaledVector(this.right, 0.35);
    const suit = CARDS[idx].suit;
    const el: Element | 'trump' = suit === 'major' ? 'trump' : ELEMENT_OF[suit];
    this.spells.cast(el, idx, from, this.fwd.clone());
    this.hands.throwT = 0;
  }

  /** for the driver: cast the selected card straight down onto a point */
  castAt(x: number, z: number) {
    const idx = this.cards.current();
    if (idx === null) return;
    const suit = CARDS[idx].suit;
    const el: Element | 'trump' = suit === 'major' ? 'trump' : ELEMENT_OF[suit];
    const y = this.spells.floorAt(x, z);
    this.spells.cast(el, idx, new THREE.Vector3(x, y + 2.2, z), new THREE.Vector3(0, -1, 0));
    this.lastCast = this.t;
    this.hands.throwT = 0;
  }

  // ------------------------------------------------------------------------------------------
  // the Fool's health

  private hurt(d: number, from: THREE.Vector3) {
    const p = this.o.player;
    if (this.dying >= 0) return;
    p.hearts = Math.max(0, p.hearts - d);
    this.lastHurt = this.t;
    this.hands.hurtT = 0;
    this.jolt.shake(0.5);
    finishUniforms.uHurt.value = 1;
    this.audio.play('hurt');
    const away = new THREE.Vector3(p.pos.x - from.x, 0, p.pos.z - from.z).normalize();
    const [nx, nz] = p.collide(p.pos.x + away.x * 1.6, p.pos.z + away.z * 1.6);
    p.pos.x = nx; p.pos.z = nz;
    if (p.hearts <= 0) {
      this.dying = 0;
      this.hud.death.classList.add('on');
      this.audio.play('death');
    }
  }

  // ------------------------------------------------------------------------------------------
  // the frame

  resize(w: number, h: number) { this.hands.resize(w, h); }
  shake() { return this.jolt.offset(); }

  update(dt: number, t: number) {
    this.t = t;
    this.lastDt = dt;
    const p = this.o.player;
    // death: fade, then back at the gate
    if (this.dying >= 0) {
      this.dying += dt;
      this.fade = Math.min(1, this.dying / 1.2);
      if (this.dying > 2.4) {
        p.place(GATE.x, GATE.z, GATE.yaw);
        p.hearts = p.maxHearts;
        this.dying = -1;
        this.hud.death.classList.remove('on');
        for (const s of this.shades.list) { s.state = 'drift'; s.noticed = false; s.pos.set(s.home.x, groundHeight(s.home.x, s.home.y), s.home.y); }
      }
    } else this.fade = Math.max(0, this.fade - dt * 1.2);
    this.titleFade = this.started ? Math.max(0, this.titleFade - dt * 0.6) : 1;
    finishUniforms.uFade.value = 1 - this.fade * 0.95;
    finishUniforms.uHurt.value = Math.max(0, finishUniforms.uHurt.value - dt * 2);

    // walking
    const k = this.keys;
    const active = this.started && this.dying < 0 && !this.hud.readingOpen;
    const fwd = active ? (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) : 0;
    const side = active ? (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) : 0;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const moved = p.step(dt, { fwd, side, run, jump: active && this.jumpQueued });
    this.jumpQueued = false;
    this.walkPhase += moved * (run ? 1.05 : 1.45);
    this.stepDist += moved;
    if (this.stepDist > (run ? 2.1 : 1.6)) { this.stepDist = 0; this.audio.step(p.onRoad, p.wading); }
    if (moved > 0) this.hintClock += dt;
    if (this.hintClock > 10) this.hud.once('run', 'Shift to run · Space to jump');
    if (this.hintClock > 45) this.hud.once('mute', 'M silences the world');

    // hearts come back when nothing has struck for a while
    if (p.hearts < p.maxHearts && t - this.lastHurt > 8) {
      this.regen += dt;
      if (this.regen > 4) { this.regen = 0; p.hearts++; }
    } else this.regen = 0;

    p.eye(this.eye);
    this.aim();
    // the lantern lights what is near
    const L = this.lights.lantern;
    L.x = this.eye.x - this.right.x * 0.45 + this.fwd.x * 0.6;
    L.y = this.eye.y - 0.35;
    L.z = this.eye.z - this.right.z * 0.45 + this.fwd.z * 0.6;
    L.k = 0.75;
    L.r = 11;

    const hand = this.eye.clone().addScaledVector(this.right, 0.35).addScaledVector(this.fwd, 0.6).add(new THREE.Vector3(0, -0.3, 0));
    this.cards.update(dt, t, hand);
    const safe = hillMask(p.pos.x, p.pos.z) > 0.7;
    this.shades.update(dt, t, p.pos, safe || this.dying >= 0);
    if (this.shades.nearest(p.pos) < 16 && !safe) this.hud.once('shade', 'A Shade. Your cards can hurt it; the elements together hurt it most.');
    this.spells.update(dt, t, this.eye);
    this.ambient(dt, t);
    this.fx.update(dt);
    this.lights.update(dt, t, this.eye);
    this.jolt.update(dt);
    this.hud.update(dt);

    // what can be done here
    if (this.started && this.dying < 0 && !this.hud.readingOpen) {
      const c = this.cards.nearest(p.pos);
      if (c) {
        this.hud.setPrompt(`<kbd>E</kbd>take the card`);
        this.hud.once('take', 'Cards are hidden all through the valley. They glow faintly.');
      } else if (this.nearSeer()) this.hud.setPrompt(`<kbd>E</kbd>sit with the seer`);
      else this.hud.setPrompt(null);
    } else this.hud.setPrompt(null);

    const gust = gustAt(p.pos.x, p.pos.z, t);
    this.audio.update(dt, this.eye, p.yaw, gust, 0.8);
  }

  /** leaves torn off and blown through the view, the braziers' flames */
  private ambient(dt: number, t: number) {
    const e = this.eye;
    const g = gustAt(e.x, e.z, t);
    const wind = new THREE.Vector2(0.8, 0.6).normalize();
    const n = dt * (4 + g * 16);
    for (let i = 0; i < n || Math.random() < n - i; i++) {
      const sp = 3 + g * 8;
      const ox = (Math.random() - 0.5) * 34, oz = (Math.random() - 0.5) * 34;
      const x = e.x + ox - wind.x * 10, z = e.z + oz - wind.y * 10;
      const col = LEAF_COLS[(Math.random() * LEAF_COLS.length) | 0];
      this.fx.spawn({ x, y: e.y + (Math.random() - 0.3) * 6, z, vx: wind.x * sp, vy: (Math.random() - 0.6) * 1.2, vz: wind.y * sp, life: 4 + Math.random() * 3, size: 0.14 + Math.random() * 0.1, col, col1: mix(col, [0.2, 0.15, 0.3], 0.4), mark: MARKS.leaf, wid: 0.6, glow: 0.1, light: 1, spin: (Math.random() - 0.5) * 10, dir: [1, 0.3, 0] });
      if (i > 20) break;
    }
    for (const f of this.o.world.flames) {
      if (Math.hypot(f[0] - e.x, f[2] - e.z) > 80) continue;
      const big = f[1] < 18;
      for (let i = 0; i < (big ? 2 : 1); i++) {
        this.fx.spawn({ x: f[0] + (Math.random() - 0.5) * (big ? 0.4 : 0.15), y: f[1], z: f[2] + (Math.random() - 0.5) * (big ? 0.4 : 0.15), vx: (Math.random() - 0.5) * 0.3, vy: 1 + Math.random() * 1.4, vz: (Math.random() - 0.5) * 0.3, life: 0.3 + Math.random() * 0.35, size: big ? 0.3 : 0.18, size1: 0.03, col: mix(hex('#fff0b0'), hex('#ffb040'), Math.random()), col1: hex('#c02a10'), mark: MARKS.flick, wid: 0.5, glow: 1, dir: [0, 1, 0] });
      }
      if (Math.random() < dt * 3) this.fx.spawn({ x: f[0], y: f[1] + 0.4, z: f[2], vx: (Math.random() - 0.5) * 0.6, vy: 1.5 + Math.random(), vz: (Math.random() - 0.5) * 0.6, life: 1.5, size: 0.04, col: hex('#ffd060'), mark: MARKS.round, glow: 1, grav: -0.5 });
    }
  }

  drawOverlay() {
    const p = this.o.player;
    const idx = this.cards.current();
    const img = idx !== null ? this.cards.images.get(idx) : undefined;
    this.hands.hidden = !this.started || this.titleFade > 0.6;
    this.hands.draw({
      t: this.t,
      dt: this.lastDt,
      walk: this.walkPhase,
      walkAmt: Math.min(1, p.moving * 1.2),
      card: idx !== null && img ? { index: idx, img, glow: GLOW[CARDS[idx].suit], ready: Math.min(1, (this.t - this.lastCast) / COOLDOWN) } : null,
      hearts: p.hearts,
      maxHearts: p.maxHearts,
      flame: 1,
    });
  }
}
