// Sound, all made with the Web Audio API: wind that rises with the gusts, footsteps on road and grass,
// the lantern's hiss, a low drone with far bells, and a voice for every card, element and Shade.
// Nothing exists before the first click (browsers keep audio locked until then).
import * as THREE from 'three';

type Ctx = AudioContext;

export class Sounds {
  ctx: Ctx | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private verb!: ConvolverNode;
  private verbIn!: GainNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private hissGain!: GainNode;
  private noise!: AudioBuffer;
  muted = false;
  private listener = { pos: new THREE.Vector3(), yaw: 0 };
  private bellT = 4;

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    // a hall made of decaying noise
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb.buffer = ir;
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.35;
    this.verbIn.connect(this.verb).connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; nd[i] = w * 0.6 + b * 3; }
    this.startBeds();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  private noiseSrc(loop = true) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    s.loopStart = Math.random();
    return s;
  }

  private startBeds() {
    const ctx = this.ctx!;
    // wind: filtered noise; the gust sets its loudness and brightness
    const w = this.noiseSrc();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    w.connect(this.windFilter).connect(this.windGain).connect(this.master);
    w.start();
    // the lantern's hiss
    const h = this.noiseSrc();
    const hf = ctx.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = 3500;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0.012;
    h.connect(hf).connect(this.hissGain).connect(this.master);
    h.start();
    // the drone: low fifths, slowly breathing, under a dark filter
    const drone = ctx.createGain();
    drone.gain.value = 0;
    drone.gain.setTargetAtTime(0.11, ctx.currentTime, 4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.Q.value = 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 160;
    lfo.connect(lfoAmt).connect(lp.frequency);
    lfo.start();
    for (const [f, type, g] of [[55, 'sawtooth', 0.35], [55.4, 'sawtooth', 0.3], [82.4, 'triangle', 0.4], [110.2, 'sine', 0.25], [130.8, 'sine', 0.12]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(lp);
      o.start();
    }
    lp.connect(drone).connect(this.master);
    drone.connect(this.verbIn);
  }

  /** follow the eye: wind with the gust, the hiss with the flame */
  update(dt: number, eye: THREE.Vector3, yaw: number, gust: number, flame: number) {
    if (!this.ctx) return;
    this.listener.pos.copy(eye);
    this.listener.yaw = yaw;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.03 + gust * 0.16, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(300 + gust * 900, t, 0.4);
    this.hissGain.gain.setTargetAtTime(0.006 + flame * 0.01, t, 0.1);
    // far bells: a slow line in a minor mode
    this.bellT -= dt;
    if (this.bellT <= 0) {
      this.bellT = 5 + Math.random() * 9;
      const notes = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
      this.bell(notes[(Math.random() * notes.length) | 0] * (Math.random() < 0.3 ? 0.5 : 1), 0.05);
    }
  }

  private bell(f: number, g: number, at = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    for (const [m, k] of [[1, 1], [2.76, 0.35], [5.4, 0.15]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * m;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(g * k, t + 0.01);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 3.5 / m);
      o.connect(e);
      e.connect(this.sfx);
      e.connect(this.verbIn);
      o.start(t);
      o.stop(t + 4);
    }
  }

  /** where a sound is heard from: quieter with distance, panned by direction */
  private place(at?: THREE.Vector3): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    if (at) {
      const dx = at.x - this.listener.pos.x, dz = at.z - this.listener.pos.z;
      const d = Math.hypot(dx, dz);
      g.gain.value = 1 / (1 + d * 0.06);
      const right = Math.cos(this.listener.yaw) * dx - Math.sin(this.listener.yaw) * dz;
      pan.pan.value = Math.max(-0.9, Math.min(0.9, right / Math.max(4, d)));
    }
    g.connect(pan);
    pan.connect(this.sfx);
    const send = ctx.createGain();
    send.gain.value = 0.4;
    pan.connect(send).connect(this.verbIn);
    return g;
  }

  private burst(out: AudioNode, o: { dur: number; f0: number; f1: number; q?: number; type?: BiquadFilterType; gain: number; attack?: number; delay?: number }) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const s = this.noiseSrc(false);
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.005));
    e.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f).connect(e).connect(out);
    s.start(t, Math.random());
    s.stop(t + o.dur + 0.05);
  }

  private tone(out: AudioNode, o: { f0: number; f1: number; dur: number; gain: number; type?: OscillatorType; delay?: number; attack?: number }) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t + o.dur);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.01));
    e.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(e).connect(out);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  step(road: boolean, wading: boolean) {
    if (!this.ctx) return;
    const out = this.place();
    const k = 0.8 + Math.random() * 0.4;
    if (wading) {
      this.burst(out, { dur: 0.3, f0: 900 * k, f1: 300, q: 2, gain: 0.18 });
      this.tone(out, { f0: 300 * k, f1: 700, dur: 0.12, gain: 0.03, delay: 0.05 });
    } else if (road) {
      // gravel: a few grains, a crunch
      this.burst(out, { dur: 0.12, f0: 1800 * k, f1: 900, q: 1.5, gain: 0.16 });
      for (let i = 0; i < 4; i++) this.burst(out, { dur: 0.03, f0: 3000 + Math.random() * 2000, f1: 2000, q: 4, gain: 0.08, delay: 0.02 + Math.random() * 0.08 });
    } else {
      // grass: a soft swish
      this.burst(out, { dur: 0.22, f0: 700 * k, f1: 2400, q: 0.8, type: 'bandpass', gain: 0.07, attack: 0.04 });
      this.tone(out, { f0: 90, f1: 60, dur: 0.08, gain: 0.05 });
    }
  }

  play(name: string, at?: THREE.Vector3, gain = 1) {
    if (!this.ctx) return;
    const out = this.place(at);
    const g = gain;
    const r = () => 0.85 + Math.random() * 0.3;
    switch (name) {
      case 'pickup': {
        const notes = [293.7, 349.2, 440, 523.3, 587.3, 698.5];
        notes.forEach((f, i) => this.bell(f, 0.09, i * 0.07));
        this.burst(out, { dur: 1.2, f0: 4000, f1: 9000, q: 3, gain: 0.04, attack: 0.3 });
        break;
      }
      case 'throw': this.burst(out, { dur: 0.25, f0: 500, f1: 3000, q: 1.2, gain: 0.22 * g, attack: 0.03 }); break;
      case 'cast_fire': this.burst(out, { dur: 0.5, f0: 300, f1: 1200, q: 0.7, type: 'lowpass', gain: 0.25 * g }); break;
      case 'cast_water': this.tone(out, { f0: 300 * r(), f1: 900, dur: 0.2, gain: 0.08 }); break;
      case 'cast_air': this.burst(out, { dur: 0.6, f0: 1200, f1: 400, q: 2, gain: 0.18 }); break;
      case 'cast_earth': this.tone(out, { f0: 110, f1: 70, dur: 0.25, gain: 0.15, type: 'triangle' }); break;
      case 'trump': [196, 293.7, 392].forEach((f, i) => this.bell(f, 0.08, i * 0.05)); break;
      case 'fire':
        this.burst(out, { dur: 0.9, f0: 1500, f1: 200, q: 0.6, type: 'lowpass', gain: 0.4 * g, attack: 0.01 });
        for (let i = 0; i < 10; i++) this.burst(out, { dur: 0.02, f0: 4000, f1: 3000, q: 5, gain: 0.12, delay: Math.random() * 0.8 });
        break;
      case 'water':
        this.burst(out, { dur: 0.6, f0: 2500, f1: 400, q: 1, gain: 0.35 * g });
        for (let i = 0; i < 6; i++) this.tone(out, { f0: 400 + Math.random() * 600, f1: 1200 + Math.random() * 800, dur: 0.07, gain: 0.04, delay: 0.05 + Math.random() * 0.4 });
        break;
      case 'air': this.burst(out, { dur: 0.9, f0: 2400, f1: 300, q: 1.6, gain: 0.3 * g, attack: 0.05 }); break;
      case 'earth':
        this.tone(out, { f0: 120, f1: 40, dur: 0.4, gain: 0.5 * g, type: 'sine' });
        this.burst(out, { dur: 0.35, f0: 600, f1: 150, q: 0.8, type: 'lowpass', gain: 0.3 });
        break;
      case 'steam': this.burst(out, { dur: 1.4, f0: 5000, f1: 2500, q: 0.5, type: 'highpass', gain: 0.18, attack: 0.05 }); break;
      case 'charge':
        this.tone(out, { f0: 80, f1: 640, dur: 0.7, gain: 0.12, type: 'sawtooth' });
        this.burst(out, { dur: 0.6, f0: 6000, f1: 3000, q: 2, gain: 0.12 });
        break;
      case 'crackle':
        for (let i = 0; i < 5; i++) this.burst(out, { dur: 0.015, f0: 5000 + Math.random() * 3000, f1: 4000, q: 3, gain: 0.08 * g, delay: Math.random() * 0.2 });
        break;
      case 'explosion':
        this.tone(out, { f0: 90, f1: 22, dur: 1.6, gain: 0.95, type: 'sine' });
        this.tone(out, { f0: 60, f1: 30, dur: 1.2, gain: 0.5, type: 'triangle' });
        this.burst(out, { dur: 2.4, f0: 3000, f1: 80, q: 0.5, type: 'lowpass', gain: 1.0, attack: 0.004 });
        this.burst(out, { dur: 0.3, f0: 8000, f1: 1000, q: 0.5, type: 'lowpass', gain: 0.6 });
        for (let i = 0; i < 25; i++) this.burst(out, { dur: 0.03, f0: 3000, f1: 2000, q: 3, gain: 0.08, delay: 0.3 + Math.random() * 1.6 });
        break;
      case 'zap': {
        const ctx = this.ctx;
        for (let i = 0; i < 14; i++) {
          const t0 = Math.random() * 0.5;
          const o = ctx.createOscillator();
          o.type = 'square';
          o.frequency.value = 60 + Math.random() * 1400;
          const e = ctx.createGain();
          const t = ctx.currentTime + t0;
          e.gain.setValueAtTime(0.14, t);
          e.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
          o.connect(e).connect(out);
          o.start(t);
          o.stop(t + 0.06);
        }
        this.burst(out, { dur: 0.25, f0: 9000, f1: 2000, q: 0.5, type: 'highpass', gain: 0.6, attack: 0.002 });
        this.tone(out, { f0: 70, f1: 30, dur: 1.2, gain: 0.6, type: 'sine', delay: 0.05 });
        this.burst(out, { dur: 1.8, f0: 600, f1: 60, q: 0.5, type: 'lowpass', gain: 0.6, delay: 0.08 });
        break;
      }
      case 'sun': [261.6, 329.6, 392, 523.3, 659.3].forEach((f, i) => this.bell(f, 0.1, i * 0.12)); break;
      case 'star': [523.3, 659.3, 783.9, 1046.5, 1318.5].forEach((f, i) => this.bell(f, 0.06, i * 0.09)); break;
      case 'void':
        this.tone(out, { f0: 300, f1: 40, dur: 1.4, gain: 0.4, type: 'sawtooth' });
        this.burst(out, { dur: 1.2, f0: 200, f1: 2000, q: 4, gain: 0.25 });
        break;
      case 'shade_cry': {
        // a falling, breathy wail
        const f = 300 + Math.random() * 120;
        this.tone(out, { f0: f, f1: f * 0.45, dur: 1.4, gain: 0.12, type: 'sawtooth', attack: 0.25 });
        this.tone(out, { f0: f * 1.5, f1: f * 0.6, dur: 1.2, gain: 0.05, type: 'sine', attack: 0.3 });
        this.burst(out, { dur: 1.3, f0: 900, f1: 300, q: 6, gain: 0.12, attack: 0.3 });
        break;
      }
      case 'shade_hit':
        this.tone(out, { f0: 520 * r(), f1: 180, dur: 0.35, gain: 0.12, type: 'sawtooth' });
        this.burst(out, { dur: 0.3, f0: 1500, f1: 500, q: 4, gain: 0.15 });
        break;
      case 'shade_die':
        this.tone(out, { f0: 700, f1: 60, dur: 1.6, gain: 0.16, type: 'sawtooth', attack: 0.02 });
        this.burst(out, { dur: 1.8, f0: 3000, f1: 200, q: 2, gain: 0.2 });
        [220, 207.7].forEach((f, i) => this.bell(f, 0.05, 0.3 + i * 0.2));
        break;
      case 'shade_strike': this.burst(out, { dur: 0.35, f0: 300, f1: 1800, q: 3, gain: 0.25 }); break;
      case 'hurt':
        this.tone(out, { f0: 140, f1: 50, dur: 0.4, gain: 0.5, type: 'sine' });
        this.burst(out, { dur: 0.25, f0: 800, f1: 200, q: 1, type: 'lowpass', gain: 0.25 });
        break;
      case 'seer': [196, 233.1, 293.7, 349.2].forEach((f, i) => this.bell(f, 0.1, i * 0.35)); break;
      case 'select': this.bell(587.3 * r(), 0.04); break;
      case 'death': [146.8, 138.6, 110].forEach((f, i) => this.bell(f, 0.12, i * 0.5)); break;
      case 'start': [146.8, 220, 293.7, 349.2, 440].forEach((f, i) => this.bell(f, 0.07, i * 0.25)); break;
    }
  }
}
