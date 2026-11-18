// Hands from a real hand mesh: the WebXR generic hand (public/hands, MIT), posed by turning its joints,
// lit with three.js (soft shadows, a sheen for skin), rendered once at four samples per pixel and cut to
// the same 40-colour sprites as the other hands. The tattoo is drawn from the rest pose, so it rides the skin.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SPIDER_GLSL, toSprites, pxAt } from './handRender';
import { FIST_PAD, FIST_W, type HandSprites } from './hands';

const FOV = 35, SS = 4;
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const CHAIN = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];

/** per finger: knuckle, middle and end bends (radians) and the sideways spread; the thumb: swing across the palm, then its three bends */
interface MeshPose { curl: [number, number, number][]; spread: number[]; thumbSwing: number; thumbTwist: number; thumb: [number, number, number] }

const v3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
/** sprite pixel to camera space at depth z (cm) */
const at = (sx: number, sy: number, z: number, w: number, h: number) => { const k = pxAt(z, h, (FOV * Math.PI) / 180); return new THREE.Vector3((sx - w / 2) * k, (h / 2 - sy) * k, z); };

const loader = new GLTFLoader();
const load = (url: string) => new Promise<THREE.Group>((ok, no) => loader.load(url, (g) => ok(g.scene), undefined, no));

interface Rig { root: THREE.Group; mesh: THREE.SkinnedMesh; bones: Map<string, THREE.Object3D>; wrist: THREE.Vector3; fingers: THREE.Vector3; back: THREE.Vector3; across: THREE.Vector3 }

async function rig(side: 'left' | 'right'): Promise<Rig> {
  const root = await load(`${import.meta.env.BASE_URL}hands/${side}.glb`);
  const bones = new Map<string, THREE.Object3D>();
  let mesh: THREE.SkinnedMesh | null = null;
  root.traverse((o) => { if ((o as THREE.Bone).isBone) bones.set(o.name, o); if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
  const p = (n: string) => bones.get(n)!.position.clone();
  const wrist = p('wrist');
  const fingers = p('middle-finger-phalanx-proximal').sub(wrist).normalize();
  // across the knuckles toward the thumb; the back of the hand follows from it (and from which hand it is)
  const across = p('index-finger-phalanx-proximal').sub(p('pinky-finger-phalanx-proximal')).normalize();
  const back = new THREE.Vector3().crossVectors(fingers, across).multiplyScalar(side === 'right' ? 1 : -1).normalize();
  across.crossVectors(back, fingers).multiplyScalar(side === 'right' ? 1 : -1);
  return { root, mesh: mesh!, bones, wrist, fingers, back, across };
}

/** Turn the joints: each bend turns that joint and everything beyond it about the joint. */
function pose(r: Rig, ps: MeshPose) {
  const turn = (names: string[], from: number, axis: THREE.Vector3, ang: number) => {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, ang), pivot = r.bones.get(names[from])!.position.clone();
    for (let j = from; j < names.length; j++) {
      const b = r.bones.get(names[j])!;
      b.position.sub(pivot).applyQuaternion(q).add(pivot);
      b.quaternion.premultiply(q);
    }
  };
  const dir = (names: string[], k: number) => r.bones.get(names[k + 1])!.position.clone().sub(r.bones.get(names[k])!.position).normalize();
  FINGERS.forEach((f, i) => {
    const names = CHAIN.map((c) => `${f}-finger-${c}`);
    turn(names, 1, r.back, ps.spread[i]);
    for (let k = 1; k <= 3; k++) turn(names, k, new THREE.Vector3().crossVectors(r.back, dir(names, k)).normalize(), ps.curl[i][k - 1]);
  });
  const th = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];
  // the thumb swings in front of the palm, then folds across it toward the little finger (its nail faces sideways)
  turn(th, 0, new THREE.Vector3().crossVectors(r.back, r.across).normalize(), ps.thumbSwing);
  turn(th, 1, dir(th, 1), ps.thumbTwist);
  for (let k = 0; k < 3; k++) {
    const d = dir(th, k);
    turn(th, k, new THREE.Vector3().crossVectors(d, r.fingers).normalize().addScaledVector(new THREE.Vector3().crossVectors(r.back, d).normalize(), 0.5).normalize(), ps.thumb[k]);
  }
}

/** Place the hand (metres) so its wrist, fingers and back of hand land on a frame in camera space (cm). */
function place(r: Rig, origin: THREE.Vector3, fingers: number[], back: number[]) {
  const F = v3(fingers).normalize(), Bk = v3(back), X = new THREE.Vector3().crossVectors(F, Bk).normalize();
  Bk.crossVectors(X, F);
  const Xr = new THREE.Vector3().crossVectors(r.fingers, r.back).normalize();
  const target = new THREE.Matrix4().makeBasis(X, F, Bk), rest = new THREE.Matrix4().makeBasis(Xr, r.fingers, r.back);
  const rot = target.multiply(rest.transpose());
  r.root.quaternion.setFromRotationMatrix(rot);
  r.root.scale.setScalar(100);
  r.root.position.copy(origin).sub(r.wrist.clone().multiplyScalar(100).applyQuaternion(r.root.quaternion));
  r.root.updateMatrixWorld(true);
}
const worldOf = (r: Rig, name: string) => r.bones.get(name)!.getWorldPosition(new THREE.Vector3());

function skin(r: Rig, ink: boolean) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xe0b49c, roughness: 0.62, sheen: 0.6, sheenColor: new THREE.Color(0xff8a70), sheenRoughness: 0.7 });
  const X = new THREE.Vector3().crossVectors(r.fingers, r.back).normalize(); // toward the little finger on the right hand
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uW = { value: r.wrist }; sh.uniforms.uX = { value: X }; sh.uniforms.uY = { value: r.fingers }; sh.uniforms.uZ = { value: r.back };
    sh.uniforms.uInk = { value: ink ? 1 : 0 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRest; uniform vec3 uW, uX, uY, uZ; uniform float uInk;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
${SPIDER_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  { vec3 r = (vRest - uW) * 100.0; // cm, rest pose
    float g = n3(r * 2.2) * 0.5 + n3(r * 5.0) * 0.3 + n3(r * 11.0) * 0.2;
    diffuseColor.rgb *= 0.86 + 0.28 * g;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.45, 0.4), 0.3 * smoothstep(0.55, 0.8, n3(r * 0.8 + 3.0)));
    if (uInk > 0.5 && dot(r, uZ) > 0.2) { float k = spider(vec2(-dot(r, uX), dot(r, uY))); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.05, 0.09), 0.88 * k); } }`);
  };
  r.mesh.material = m;
  r.mesh.castShadow = true; r.mesh.receiveShadow = true;
}

const cloth = () => new THREE.MeshStandardMaterial({ color: 0x3a2266, roughness: 0.95 });
const gold = () => new THREE.MeshStandardMaterial({ color: 0xb08030, roughness: 0.4, metalness: 0.7 });
/** a sleeve over the wrist, along the forearm away from the fingers */
function sleeve(r: Rig, scene: THREE.Scene) {
  const w = worldOf(r, 'wrist'), f = worldOf(r, 'middle-finger-metacarpal').sub(w).normalize();
  const mk = (len: number, r0: number, r1: number, mat: THREE.Material, off: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 28, 1, true), mat);
    m.material.side = THREE.DoubleSide;
    m.position.copy(w).addScaledVector(f, -off - len / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };
  mk(0.8, 3.15, 3.2, gold(), 1.2);
  mk(30, 3.1, 5.0, cloth(), 1.9);
}

function lights(scene: THREE.Scene, key: number[], target: THREE.Vector3) {
  const k = new THREE.DirectionalLight(0xffd2a0, 3.2);
  k.position.copy(target).addScaledVector(v3(key).normalize(), 60); k.target.position.copy(target);
  k.castShadow = true; k.shadow.mapSize.set(2048, 2048); k.shadow.radius = 3;
  const c = k.shadow.camera as THREE.OrthographicCamera; c.left = c.bottom = -25; c.right = c.top = 25; c.near = 1; c.far = 140; k.shadow.bias = -0.0005;
  scene.add(k, k.target);
  scene.add(new THREE.HemisphereLight(0x6a5aa8, 0x6a4030, 0.9));
  const front = new THREE.DirectionalLight(0xc8a0a0, 0.5); front.position.set(0, 20, 60).add(target); front.target.position.copy(target); scene.add(front, front.target);
  const rim = new THREE.DirectionalLight(0x8a90ff, 1.2); rim.position.copy(target).add(new THREE.Vector3(40, 10, -30)); rim.target.position.copy(target); scene.add(rim, rim.target);
}

let renderer: THREE.WebGLRenderer | null = null;
/** Render a scene at SS samples per sprite pixel; with an occluder, what it hides is 'behind the card'. */
function shoot(scene: THREE.Scene, w: number, h: number, occluder?: THREE.Object3D): Uint8ClampedArray {
  const W = w * SS, H = h * SS;
  renderer ??= new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 0);
  const cam = new THREE.PerspectiveCamera(FOV, w / h, 1, 300);
  const read = () => { renderer!.render(scene, cam); const px = new Uint8Array(W * H * 4); const g = renderer!.getContext(); g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, px); return px; };
  const all = read();
  let front: Uint8Array | null = null;
  if (occluder) { scene.add(occluder); front = read(); scene.remove(occluder); }
  const img = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = ((H - 1 - y) * W + x) * 4, q = (y * W + x) * 4;
    if (all[k + 3] < 128) continue;
    img.set([all[k], all[k + 1], all[k + 2], !front || front[k + 3] >= 128 ? 255 : 128], q);
  }
  return img;
}

/** The three shots: pose, and where the hand goes (fingers and back of hand as camera-space directions). */
export const MESH = {
  fist: { pose: { curl: [[1.4, 1.6, 0.7], [1.5, 1.65, 0.7], [1.5, 1.65, 0.7], [1.45, 1.6, 0.7]], spread: [0.04, 0, -0.03, -0.08], thumbSwing: 0.7, thumbTwist: 0, thumb: [0.3, 0.8, 0.6] } as MeshPose, fingers: [0.5, 0.4, -0.75], back: [-0.83, 0.1, -0.55] },
  held: { pose: { curl: [[0.35, 0.45, 0.25], [0.4, 0.5, 0.25], [0.45, 0.55, 0.25], [0.55, 0.6, 0.3]], spread: [-0.04, 0, 0.04, 0.1], thumbSwing: 0.8, thumbTwist: 0, thumb: [0.1, 0.25, 0.2] } as MeshPose, at: [148, 262, -36], fingers: [-0.2, 0.9, -0.4], back: [0.6, 0.2, 0.75] },
  open: { pose: { curl: [[0.4, 0.55, 0.3], [0.45, 0.6, 0.32], [0.52, 0.65, 0.34], [0.6, 0.7, 0.36]], spread: [-0.08, -0.02, 0.04, 0.1], thumbSwing: 0.2, thumbTwist: 0, thumb: [0.15, 0.2, 0.15] } as MeshPose, at: [158, 222, -30], fingers: [-0.55, 0.5, -0.67], back: [0.2, 0.8, 0.55] },
};

export async function meshSprites(M = MESH): Promise<HandSprites> {
  const [L, R1, R2] = await Promise.all([rig('left'), rig('right'), rig('right')]);
  // the game runs three.js with colour management off (raw sRGB); these lit renders need it on
  const managed = THREE.ColorManagement.enabled;
  THREE.ColorManagement.enabled = true;
  try { return build(M, L, R1, R2); } finally { THREE.ColorManagement.enabled = managed; }
}

function build(M: typeof MESH, L: Rig, R1: Rig, R2: Rig): HandSprites {
  // --- left: a fist round the staff
  const fw = FIST_W, fh = 280, z = -33, sx = 80 + FIST_PAD;
  pose(L, M.fist.pose);
  place(L, new THREE.Vector3(0, 0, 0), M.fist.fingers, M.fist.back);
  // the hollow of the grip: the middle of the curled middle finger
  const hollow = ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((c) => worldOf(L, `middle-finger-${c}`)).reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(0.25);
  const grip = at(sx, 200, z, fw, fh);
  L.root.position.add(grip.clone().sub(hollow)); L.root.updateMatrixWorld(true);
  skin(L, false);
  const s1 = new THREE.Scene(); s1.add(L.root); sleeve(L, s1);
  const top = at(sx, 108, z, fw, fh), bot = at(sx, 330, z, fw, fh);
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.1, top.distanceTo(bot), 20), new THREE.MeshStandardMaterial({ color: 0xa06a3c, roughness: 0.6 }));
  staff.position.copy(top).add(bot).multiplyScalar(0.5); staff.castShadow = staff.receiveShadow = true; s1.add(staff);
  lights(s1, [-0.15, 1, -0.05], grip);
  const fist = toSprites(shoot(s1, fw, fh), fw * SS, fh * SS, SS, fw, fh).all;
  // --- right: holding the card (thumb in front), and empty
  const w = 180, h = 280, cz = -38, k = pxAt(cz, h, (FOV * Math.PI) / 180);
  pose(R1, M.held.pose);
  place(R1, at(M.held.at[0], M.held.at[1], M.held.at[2], w, h), M.held.fingers, M.held.back);
  skin(R1, true);
  const s2 = new THREE.Scene(); s2.add(R1.root); sleeve(R1, s2); lights(s2, [-0.9, 0.75, 0.12], at(120, 160, cz, w, h));
  const card = new THREE.Mesh(new THREE.PlaneGeometry(80 * k, 120 * k), new THREE.MeshBasicMaterial({ colorWrite: false }));
  card.position.copy(at(80, 100, cz, w, h));
  const held = toSprites(shoot(s2, w, h, card), w * SS, h * SS, SS, w, h);
  pose(R2, M.open.pose);
  place(R2, at(M.open.at[0], M.open.at[1], M.open.at[2], w, h), M.open.fingers, M.open.back);
  skin(R2, true);
  const s3 = new THREE.Scene(); s3.add(R2.root); sleeve(R2, s3); lights(s3, [-0.9, 0.75, 0.12], at(120, 200, -30, w, h));
  const open = toSprites(shoot(s3, w, h), w * SS, h * SS, SS, w, h).all;
  return { fist, back: held.back, front: held.front, open };
}
