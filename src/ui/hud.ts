// Words on the screen: the title, the count of cards, names, hints, the seer's reading.
import { CARDS } from '../game/cardData';

const css = `
#hud .t-title { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  background: radial-gradient(ellipse at 50% 45%, rgba(10,6,30,0.35), rgba(6,4,18,0.85) 75%); transition: opacity 1.6s ease; pointer-events: auto; cursor: pointer; }
#hud .t-title h1 { margin: 0; font-size: clamp(54px, 9vw, 128px); font-weight: 400; letter-spacing: 0.32em; padding-left: 0.32em; color: #f6e2ae;
  text-shadow: 0 0 30px rgba(255,190,90,0.35), 0 2px 0 rgba(0,0,0,0.6); }
#hud .t-title .latin { font-size: clamp(18px, 2.2vw, 28px); font-style: italic; color: #d8c6f0; letter-spacing: 0.08em; }
#hud .t-title .tr { font-size: 15px; color: #a898c8; letter-spacing: 0.12em; }
#hud .t-title .go { margin-top: 30px; font-size: 16px; letter-spacing: 0.4em; color: #f3dfae; animation: vtpulse 2.4s ease-in-out infinite; }
#hud .t-title .sigil { width: 70px; height: 70px; border-radius: 50%; border: 1px solid rgba(243,223,174,0.5); box-shadow: 0 0 40px rgba(120,100,255,0.5), inset 0 0 22px rgba(10,10,40,1); background: radial-gradient(circle, #05030c 55%, #3a3a9a 70%, transparent 72%); }
@keyframes vtpulse { 50% { opacity: 0.35; } }
#hud .count { position: fixed; top: 18px; right: 24px; font-size: 22px; letter-spacing: 0.12em; text-shadow: 0 2px 6px #000; }
#hud .count b { font-weight: 400; font-size: 30px; color: #fff0c8; }
#hud .cardname { position: fixed; right: 24px; bottom: 16px; font-size: 18px; letter-spacing: 0.14em; text-shadow: 0 2px 6px #000, 0 0 2px #000; text-align: right; }
#hud .cardname small { display: block; font-size: 13px; color: #b8a8e0; letter-spacing: 0.25em; text-transform: uppercase; }
#hud .banner { position: fixed; left: 0; right: 0; top: 24%; text-align: center; opacity: 0; transition: opacity 0.5s ease, transform 0.5s ease; transform: translateY(10px); }
#hud .banner.on { opacity: 1; transform: none; }
#hud .banner .name { font-size: clamp(40px, 6vw, 84px); letter-spacing: 0.12em; color: #fff0c8; text-shadow: 0 0 30px rgba(255,180,80,0.45), 0 3px 8px #000; }
#hud .banner .sub { font-size: 18px; letter-spacing: 0.35em; color: #c8b8f0; text-transform: uppercase; text-shadow: 0 2px 6px #000; margin-top: 8px; }
#hud .prompt { position: fixed; left: 0; right: 0; top: 58%; text-align: center; font-size: 20px; letter-spacing: 0.18em; opacity: 0; transition: opacity 0.3s; text-shadow: 0 2px 6px #000, 0 0 3px #000; }
#hud .prompt.on { opacity: 1; }
#hud .prompt kbd { font-family: inherit; border: 1px solid rgba(243,223,174,0.7); border-radius: 4px; padding: 0 8px; margin-right: 8px; }
#hud .hint { position: fixed; left: 0; right: 0; bottom: 70px; text-align: center; font-size: 18px; letter-spacing: 0.12em; color: #efe2c8; opacity: 0; transition: opacity 0.8s; text-shadow: 0 2px 6px #000, 0 0 3px #000; }
#hud .hint.on { opacity: 0.95; }
#hud .reading { position: fixed; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 22px; background: radial-gradient(ellipse at 50% 50%, rgba(20,10,40,0.78), rgba(4,2,12,0.94)); pointer-events: auto; }
#hud .reading.on { display: flex; animation: vtfade 0.8s ease; }
@keyframes vtfade { from { opacity: 0; } }
#hud .reading h2 { margin: 0; font-weight: 400; font-style: italic; font-size: 30px; color: #e6d6ff; letter-spacing: 0.06em; }
#hud .reading .row { display: flex; gap: 3vw; align-items: flex-start; }
#hud .reading .card { width: min(22vw, 250px); text-align: center; opacity: 0; transform: translateY(16px) rotateY(80deg); animation: vtdeal 0.9s ease forwards; }
@keyframes vtdeal { to { opacity: 1; transform: none; } }
#hud .reading img { width: 100%; border-radius: 10px; box-shadow: 0 0 30px rgba(120,100,255,0.45), 0 8px 26px #000; }
#hud .reading .pos { font-size: 13px; letter-spacing: 0.3em; color: #a898c8; text-transform: uppercase; margin: 10px 0 4px; }
#hud .reading .ttl { font-size: 21px; color: #fff0c8; letter-spacing: 0.06em; }
#hud .reading .line { font-size: 16px; color: #d8cce8; font-style: italic; margin-top: 6px; line-height: 1.35; }
#hud .reading .close { font-size: 14px; letter-spacing: 0.3em; color: #a898c8; }
#hud .death { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 44px; font-style: italic; letter-spacing: 0.1em; color: #e8c8d8; opacity: 0; transition: opacity 0.8s; text-shadow: 0 0 20px #000; }
#hud .death.on { opacity: 1; }
#hud .mute { position: fixed; top: 22px; left: 50%; transform: translateX(-50%); font-size: 14px; letter-spacing: 0.3em; opacity: 0; transition: opacity 0.4s; }
#hud .mute.on { opacity: 0.8; }
`;

function el(tag: string, cls: string, html = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
}

export class Hud {
  root: HTMLElement;
  title: HTMLElement;
  count: HTMLElement;
  cardname: HTMLElement;
  banner: HTMLElement;
  prompt: HTMLElement;
  hint: HTMLElement;
  reading: HTMLElement;
  death: HTMLElement;
  mute: HTMLElement;
  private bannerT = 0;
  private hintT = 0;
  private gap = 0;
  private hintsShown = new Set<string>();
  private hintQueue: string[] = [];

  constructor() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    this.root = document.getElementById('hud')!;
    this.title = el('div', 't-title', `<div class="sigil"></div><h1>THE FOOL</h1><div class="latin">Incipit iter stulti, et vacuum respicit.</div><div class="tr">here begins the journey of the fool, and the void looks back</div><div class="go">CLICK TO BEGIN</div>`);
    this.count = el('div', 'count');
    this.cardname = el('div', 'cardname');
    this.banner = el('div', 'banner', '<div class="name"></div><div class="sub"></div>');
    this.prompt = el('div', 'prompt');
    this.hint = el('div', 'hint');
    this.reading = el('div', 'reading');
    this.death = el('div', 'death', 'Iterum incipe.');
    this.mute = el('div', 'mute', 'SILENCE');
    for (const e of [this.count, this.cardname, this.banner, this.prompt, this.hint, this.death, this.mute, this.reading, this.title]) this.root.appendChild(e);
  }

  hideTitle(instant = false) {
    if (instant) { this.title.style.display = 'none'; return; }
    this.title.style.opacity = '0';
    this.title.style.pointerEvents = 'none';
    setTimeout(() => (this.title.style.display = 'none'), 1700);
  }

  setCount(n: number) { this.count.innerHTML = `<b>${n}</b> of 78`; }

  setCard(index: number | null) {
    if (index === null) { this.cardname.innerHTML = ''; return; }
    const c = CARDS[index];
    const el = { wands: 'Wands · Fire', cups: 'Cups · Water', swords: 'Swords · Air', pentacles: 'Pentacles · Earth', major: 'Major Arcana' }[c.suit];
    this.cardname.innerHTML = `${c.title}<small>${el}</small>`;
  }

  showBanner(name: string, sub: string, secs = 2.6) {
    (this.banner.querySelector('.name') as HTMLElement).textContent = name;
    (this.banner.querySelector('.sub') as HTMLElement).textContent = sub;
    this.banner.classList.add('on');
    this.bannerT = secs;
  }

  setPrompt(html: string | null) {
    if (html) { if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html; this.prompt.classList.add('on'); }
    else this.prompt.classList.remove('on');
  }

  /** show a hint once, when it first matters */
  once(key: string, text: string) {
    if (this.hintsShown.has(key)) return;
    this.hintsShown.add(key);
    this.hintQueue.push(text);
  }

  showReading(cards: number[], meaning: (i: number) => string) {
    const pos = ['Quod fuit · what was', 'Quod est · what is', 'Quod erit · what will be'];
    const items = cards.map((c, k) => `<div class="card" style="animation-delay:${0.25 + k * 0.45}s"><img src="${CARDS[c].image}" alt=""><div class="pos">${pos[k]}</div><div class="ttl">${CARDS[c].title}</div><div class="line">${meaning(c)}</div></div>`).join('');
    const say = cards.length < 3 ? '<div class="line">“The deck is scattered, little Fool. Bring me more of it, and I will read further.”</div>' : '';
    this.reading.innerHTML = `<h2>Sors tua in chartis scripta est.</h2><div class="row">${items}</div>${say}<div class="close">E OR CLICK TO RISE</div>`;
    this.reading.classList.add('on');
  }
  hideReading() { this.reading.classList.remove('on'); }
  get readingOpen() { return this.reading.classList.contains('on'); }

  update(dt: number) {
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.banner.classList.remove('on'); }
    this.gap -= dt;
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) { this.hint.classList.remove('on'); this.gap = 1; } }
    else if (this.hintQueue.length && this.gap <= 0) {
      this.hint.innerHTML = this.hintQueue.shift()!;
      this.hint.classList.add('on');
      this.hintT = 5;
    }
  }
}
