// The Fool: renderer, input, the main loop and the debug hook.
import * as THREE from 'three';
import { buildWorld } from './world/world';
import { shared } from './paint/shaders';
import { makeFinish, finishUniforms } from './finish';
import { Player, EYE } from './game/player';
import { START, GATE } from './world/layout';
import { SUN } from './paint/light';
import { MIST_WARM, MIST_COOL } from './paint/palette';
import { Game } from './game/game';

THREE.ColorManagement.enabled = false; // colours are raw sRGB throughout
const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shots') });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // raw sRGB in, raw out
renderer.toneMapping = THREE.NoToneMapping;
renderer.autoClear = true;
renderer.setPixelRatio(1);

const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.08, 4000);
const target = new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.UnsignedByteType, colorSpace: THREE.NoColorSpace, depthBuffer: true });
const finishScene = new THREE.Scene();
finishScene.add(makeFinish());
const finishCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
finishUniforms.tScene.value = target.texture;

shared.uSunDir.value.set(SUN[0], SUN[1], SUN[2]);
shared.uMistWarm.value.set(MIST_WARM);
shared.uMistCool.value.set(MIST_COOL);
// raw sRGB: undo three's colour management for these uniforms
shared.uMistWarm.value.setStyle(MIST_WARM, THREE.LinearSRGBColorSpace);
shared.uMistCool.value.setStyle(MIST_COOL, THREE.LinearSRGBColorSpace);

const t0 = performance.now();
const world = buildWorld();
const buildMs = performance.now() - t0;
const player = new Player(world.colliders);
const at = params.get('at');
if (at) {
  const [x, z, yaw] = at.split(',').map(Number);
  player.place(x, z, yaw ?? 0);
} else player.place(START.x, START.z, START.yaw);

const game = new Game({ renderer, camera, scene: world.scene, world, player, canvas, skipTitle: params.has('skip') || params.has('shots') });

// ---------------------------------------------------------------------------------------------
// resolution: the screen's own pixels, fewer when frames are slow

let scale = Math.min(window.devicePixelRatio || 1, params.has('shots') ? 1 : 1.5);
const maxScale = scale;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pw = Math.max(2, Math.round(w * scale)), ph = Math.max(2, Math.round(h * scale));
  renderer.setSize(pw, ph, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  target.setSize(pw, ph);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  shared.uViewport.value.set(pw, ph);
  shared.uFocal.value = ph / 2 / Math.tan((camera.fov * Math.PI) / 360);
  shared.uRefPx.value = ph / 900;
  finishUniforms.uRes.value.set(pw, ph);
  game.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

let slow = 0, fast = 0;
function keepPace(ms: number) {
  if (params.has('shots')) return;
  if (ms > 24) slow++; else slow = Math.max(0, slow - 1);
  if (ms < 13) fast++; else fast = 0;
  if (slow > 30 && scale > 0.55) { scale = Math.max(0.55, scale - 0.1); slow = 0; resize(); }
  if (fast > 240 && scale < maxScale) { scale = Math.min(maxScale, scale + 0.1); fast = 0; resize(); }
}

// ---------------------------------------------------------------------------------------------
// the loop

const eye = new THREE.Vector3();
let last = performance.now();
let manual = params.has('shots');
const frameTimes: number[] = [];
const clock = { t: 0 };

function render() {
  player.eye(eye);
  const shake = game.shake();
  camera.position.set(eye.x + shake.x, eye.y + shake.y, eye.z + shake.z);
  camera.rotation.set(player.pitch + shake.w, player.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
  world.sky.position.copy(camera.position);
  renderer.setRenderTarget(target);
  renderer.render(world.scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(finishScene, finishCam);
  game.drawOverlay();
}

function tick(dt: number) {
  dt = Math.min(dt, 0.1);
  clock.t += dt;
  shared.uTime.value = clock.t;
  finishUniforms.uTime.value = clock.t;
  world.clouds.rotation.y = clock.t * 0.0025;
  game.update(dt, clock.t);
  render();
}

function frame(now: number) {
  const ms = now - last;
  last = now;
  if (!manual) {
    frameTimes.push(ms);
    if (frameTimes.length > 240) frameTimes.shift();
    keepPace(ms);
    tick(ms / 1000);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------------------------
// the debug hook

(window as any).__game = {
  world,
  camera,
  player,
  game,
  counts: world.counts,
  buildMs,
  get time() { return clock.t; },
  set manual(v: boolean) { manual = v; },
  get manual() { return manual; },
  tick: (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) tick(dt); },
  teleport: (x: number, z: number, yaw = 0, pitch = -0.04) => { const [cx, cz] = player.collide(x, z); player.place(cx, cz, yaw, pitch); },
  look: (yaw: number, pitch = -0.04) => { player.yaw = yaw; player.pitch = pitch; },
  start: () => player.place(START.x, START.z, START.yaw),
  gate: () => player.place(GATE.x, GATE.z, GATE.yaw),
  give: (i: number) => game.cards.give(i),
  select: (i: number) => game.cards.selectCard(i),
  cast: () => game.castNow(),
  castAt: (x: number, z: number) => game.castAt(x, z),
  eyeHeight: EYE,
  frameStats: () => {
    const a = frameTimes.slice().sort((p, q) => p - q);
    const avg = a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);
    return { avg, p50: a[Math.floor(a.length / 2)], p95: a[Math.floor(a.length * 0.95)], n: a.length, scale };
  },
  /** time n frames rendered back to back (ms per frame) */
  bench: (n = 60) => {
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    tick(1 / 60);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const s = performance.now();
    for (let i = 0; i < n; i++) tick(1 / 60);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return (performance.now() - s) / n;
  },
  setScale: (s: number) => { scale = s; resize(); },
};
