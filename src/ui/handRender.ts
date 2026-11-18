// Hands as real 3D forms: a posed skeleton of tapered capsules (cm), melted together as a signed
// distance field and ray-marched once on the GPU (soft shadow, occlusion, skin grain), then reduced to
// pixels with an ordered dither. The result is a sprite; nothing here runs per frame.

export type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => mul(a, 1 / Math.hypot(...a));

/** groups: 0 palm, 1..5 fingers and thumb (skin), 6 sleeve, 7 gold, 8 wood, 9 card (hidden, but it occludes) */
export interface Cap { a: V3; b: V3; ra: number; rb: number; group: number; k: number; nail?: boolean; flat?: boolean; joint?: boolean; up?: V3 }

export interface Frame { origin: V3; fingers: V3; back: V3; mirror?: boolean }
/** local hand space: a right hand, wrist at 0, fingers along +y, back of the hand toward +z, thumb toward -x */
export function basis(f: Frame) {
  const Y = norm(f.fingers);
  let Z = norm(f.back);
  const X = norm(cross(Y, Z));
  Z = cross(X, Y);
  return { X, Y, Z, s: f.mirror ? -1 : 1 };
}
function framer(f: Frame) {
  const Y = norm(f.fingers);
  let Z = norm(f.back);
  const X = norm(cross(Y, Z));
  Z = cross(X, Y);
  const s = f.mirror ? -1 : 1;
  const dir = (v: V3): V3 => add(add(mul(X, v[0] * s), mul(Y, v[1])), mul(Z, v[2]));
  return { dir, pt: (v: V3): V3 => add(f.origin, dir(v)) };
}

export interface Pose {
  /** per finger (index, middle, ring, little): bend at the knuckle, middle and end joints, radians */
  curl: [number, number, number][];
  spread: number[];
  /** the thumb's three bones as local directions, and the way its nail faces */
  thumb: [V3, V3, V3];
  thumbBack: V3;
  sleeve?: number;
}

const BASES: V3[] = [[-2.7, 9.0, 0.3], [-0.85, 9.5, 0.35], [1.0, 9.2, 0.3], [2.65, 8.5, 0.2]];
const LENS = [[4.0, 2.4, 2.0], [4.4, 2.8, 2.1], [4.1, 2.6, 2.0], [3.3, 2.0, 1.8]];
const RAD = [0.92, 0.98, 0.9, 0.78];

/** A local hand point in world space. */
export const localToWorld = (f: Frame, v: V3) => framer(f).pt(v);

/** A hand (and sleeve) as capsules in world space. */
export function hand(pose: Pose, f: Frame): Cap[] {
  const { dir, pt } = framer(f);
  const caps: Cap[] = [];
  const C = (a: V3, b: V3, ra: number, rb: number, group: number, k: number, more: Partial<Cap> = {}) => caps.push({ a: pt(a), b: pt(b), ra, rb, group, k, ...more, up: more.up ? norm(dir(more.up)) : undefined });
  // palm: three long bones melted into a slab, knuckles, the heel of the hand, the wrist
  C([-1.6, 1.4, 0], [-2.5, 8.6, 0.1], 1.45, 1.15, 0, 1.4);
  C([0, 1.2, 0.05], [-0.8, 9.0, 0.15], 1.5, 1.2, 0, 1.4);
  C([1.5, 1.4, 0], [2.4, 8.0, 0.05], 1.4, 1.1, 0, 1.4);
  BASES.forEach((b, i) => C(b, b, RAD[i] * 1.12, RAD[i] * 1.12, 0, 1.0));
  C([1.4, 2.6, -0.6], [2.2, 6.5, -0.5], 1.3, 1.1, 0, 1.4); // the little-finger heel
  C([0, 0.5, 0], [0, -14, -0.2], 2.15, 2.6, 0, 1.6); // wrist and forearm
  // fingers
  BASES.forEach((base, i) => {
    const sp = pose.spread[i];
    const d0: V3 = [Math.sin(sp), Math.cos(sp), 0];
    let p = base, th = 0, r = RAD[i];
    for (let j = 0; j < 3; j++) {
      th += pose.curl[i][j];
      const d = add(mul(d0, Math.cos(th)), [0, 0, -Math.sin(th)]);
      const up = add(mul(d0, Math.sin(th)), [0, 0, Math.cos(th)]);
      const q = add(p, mul(d, LENS[i][j]));
      const r1 = r * (j === 0 ? 0.9 : j === 1 ? 0.9 : 0.86);
      C(p, q, r, r1, 1 + i, 0.5, { nail: j === 2, joint: j > 0, up });
      p = q; r = r1;
    }
  });
  // thumb: from the base of the palm, its root bone melting into the palm
  let p: V3 = [-1.7, 2.2, -0.6];
  const TL = [4.3, 3.0, 2.6], TR = [[1.45, 1.1], [1.08, 0.98], [0.98, 0.84]];
  pose.thumb.forEach((d, j) => {
    const q = add(p, mul(norm(d), TL[j]));
    C(p, q, TR[j][0], TR[j][1], j === 0 ? 0 : 5, j === 0 ? 1.4 : 0.5, { nail: j === 2, joint: j > 0, up: pose.thumbBack });
    p = q;
  });
  // sleeve with a gold band at its mouth
  const s = pose.sleeve ?? -1.6;
  C([0, s, -0.1], [0, s - 0.7, -0.1], 3.05, 3.1, 7, 0, { flat: true });
  C([0, s - 0.6, -0.1], [0, s - 30, -0.4], 3.0, 5.2, 6, 0, { flat: true });
  return caps;
}

const MAX = 64;
const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform int uN; uniform float uTan;
uniform vec4 uA[${MAX}]; uniform vec4 uB[${MAX}]; uniform vec4 uM[${MAX}]; uniform vec3 uU[${MAX}];
uniform vec3 uKey; uniform vec3 uKeyCol; uniform vec3 uFillCol; uniform vec3 uRim; uniform vec3 uRimCol;
uniform float uCardZ; uniform vec4 uCard; // card centre xy, half size xy (it lies in z = uCardZ)
uniform float uInk; uniform vec3 uHO, uHX, uHY, uHZ; uniform float uHS; // the hand's frame (uInk: -1 none, 0 plain, 1 tattooed)
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
// a spider on the back of the hand, in hand space (cm): head toward the index knuckle, legs over the knuckle and the thumb
float spider(vec2 q){
  q = (q - vec2(-1.2, 5.0)) / 0.7 + vec2(-0.6, 4.6); // smaller, toward the thumb
  vec2 T = vec2(-1.0, 5.6), A = vec2(-0.25, 3.5);
  vec2 d = normalize(T - A), s = vec2(d.y, -d.x);
  vec2 qa = q - A; vec2 la = vec2(dot(qa, s), dot(qa, d));
  float ink = 1.0 - smoothstep(0.95, 1.05, length(la / vec2(1.2, 1.45)));
  // the pale swirl on its back
  float ang = atan(la.y, la.x), rr = length(la / vec2(1.2, 1.45));
  float sw = abs(fract((rr * 3.2 - ang / 6.2832) ) - 0.5);
  if (rr < 0.7 && sw < 0.12) ink *= 0.15;
  vec2 qt = q - T; ink = max(ink, 1.0 - smoothstep(0.9, 1.0, length(vec2(dot(qt, s), dot(qt, d)) / vec2(0.7, 0.85))));
  vec2 K[16] = vec2[16](vec2(-2.0, 7.4), vec2(-2.6, 9.7), vec2(-2.5, 6.5), vec2(-3.7, 6.1), vec2(-2.5, 5.0), vec2(-3.1, 3.5), vec2(-1.9, 4.0), vec2(-2.3, 1.8),
                        vec2(0.3, 7.0), vec2(0.8, 8.1), vec2(0.8, 5.8), vec2(1.7, 6.5), vec2(1.0, 4.4), vec2(2.4, 3.1), vec2(1.0, 2.1), vec2(1.7, 0.5));
  for (int i = 0; i < 8; i++) {
    vec2 o = i == 7 ? A : T, k = K[i * 2], e = K[i * 2 + 1];
    float w = 0.3 + 0.04 * sin(float(i) * 3.1);
    ink = max(ink, 1.0 - smoothstep(w - 0.1, w, min(seg(q, o, k), seg(q, k, e) + 0.04 * length(q - k))));
  }
  return ink;
}
out vec4 o;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ return 0.5 * noise(p) + 0.25 * noise(p * 2.03) + 0.125 * noise(p * 4.01); }
float smin(float a, float b, float k){ if (k <= 0.0) return min(a, b); float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float capd(int i, vec3 p, out float t){ vec3 a = uA[i].xyz, ba = uB[i].xyz - a, pa = p - a;
  float t0 = dot(pa, ba) / max(dot(ba, ba), 1e-6); t = clamp(t0, 0.0, 1.0);
  float d = length(pa - ba * t) - mix(uA[i].w, uB[i].w, t);
  if (uM[i].z > 1.5) { // a flat-ended tube (cloth, bands): cut at both ends
    vec2 q = vec2(d, (abs(t0 - 0.5) - 0.5) * length(ba)); d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)); }
  return d; }
float G[10];
float scene(vec3 p){
  for (int g = 0; g < 10; g++) G[g] = 1e9;
  for (int i = 0; i < ${MAX}; i++) { if (i >= uN) break; float t; float d = capd(i, p, t); int g = int(uM[i].x);
    if (g == 6) d -= 0.22 * sin(atan(p.x, p.z) * 9.0 + p.y * 0.35 + 2.0 * fbm(p * 0.4)) * smoothstep(0.0, 4.0, t * 30.0);
    if (g == 8) d -= 0.06 * sin(atan(p.x - uA[i].x, p.z - uA[i].z) * 7.0 + p.y * 0.8);
    G[g] = smin(G[g], d, uM[i].y); }
  vec3 q = abs(p - vec3(uCard.xy, uCardZ)) - vec3(uCard.zw, 0.04); G[9] = uCard.z > 0.0 ? length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) : 1e9;
  float skin = G[0]; for (int g = 1; g < 6; g++) skin = smin(skin, G[g], 0.32);
  G[0] = skin;
  return min(min(min(skin, G[6]), min(G[7], G[8])), G[9]);
}
vec3 normalAt(vec3 p){ const vec2 e = vec2(0.01, -0.01);
  return normalize(e.xyy * scene(p + e.xyy) + e.yyx * scene(p + e.yyx) + e.yxy * scene(p + e.yxy) + e.xxx * scene(p + e.xxx)); }
float shadow(vec3 ro, vec3 rd){ float r = 1.0, t = 0.05; for (int i = 0; i < 40; i++) { float h = scene(ro + rd * t); r = min(r, 10.0 * h / t); t += clamp(h, 0.05, 0.8); if (r < 0.01 || t > 25.0) break; } return clamp(r, 0.0, 1.0); }
float occl(vec3 p, vec3 n){ float o = 0.0, s = 1.0; for (int i = 1; i <= 5; i++) { float h = 0.12 * float(i); o += (h - scene(p + n * h)) * s; s *= 0.7; } return clamp(1.0 - 2.2 * o, 0.0, 1.0); }
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 rd = normalize(vec3(uv * 2.0 * uTan, -1.0)), ro = vec3(0.0);
  float t = 20.0; bool hit = false;
  for (int i = 0; i < 160; i++) { float d = scene(ro + rd * t); if (d < 0.004 * t * 0.05 + 0.002) { hit = true; break; } t += d * 0.8; if (t > 90.0) break; }
  if (!hit) { o = vec4(0.0); return; }
  vec3 p = ro + rd * t; scene(p);
  int mat = 0; float best = 1e9; for (int g = 0; g < 10; g++) { int gg = g; if (g >= 1 && g <= 5) continue; if (G[gg] < best) { best = G[gg]; mat = gg; } }
  if (mat == 9) { o = vec4(0.0); return; }
  vec3 n = normalAt(p);
  // the nearest bone, for nails and joint creases
  int bi = 0; float bt = 0.0; float bd = 1e9;
  for (int i = 0; i < ${MAX}; i++) { if (i >= uN) break; float tt; float d = capd(i, p, tt); if (d < bd) { bd = d; bi = i; bt = tt; } }
  vec3 alb; float spec = 0.12, rough = 24.0, sss = 0.0;
  if (mat == 0) {
    float g = fbm(p * 2.2);
    alb = mix(vec3(0.6, 0.4, 0.31), vec3(0.72, 0.5, 0.4), g);
    alb = mix(alb, vec3(0.7, 0.38, 0.32), 0.45 * smoothstep(0.5, 0.8, fbm(p * 0.9 + 3.0)));
    n = normalize(n + 0.16 * (vec3(noise(p * 7.0), noise(p * 7.0 + 7.0), noise(p * 7.0 + 13.0)) - 0.5) + 0.07 * (vec3(noise(p * 19.0), noise(p * 19.0 + 3.0), noise(p * 19.0 + 5.0)) - 0.5));
    alb *= 0.86 + 0.28 * fbm(p * 2.2 + 11.0);
    sss = 1.0;
    if (uInk > -0.5) {
      vec3 hp = p - uHO; vec2 h2 = vec2(dot(hp, uHX) * uHS, dot(hp, uHY)); float back = smoothstep(0.0, 0.5, dot(n, uHZ));
      // four tendons fanning from the wrist to the knuckles, and the knuckles' folds of loose skin
      for (int f = 0; f < 4; f++) {
        vec2 kn = vec2(-2.6 + 1.75 * float(f), 8.8 - (f == 3 ? 0.4 : 0.0)), wr = vec2(-0.5 + 0.35 * float(f), 1.5);
        float dd = seg(h2, wr, kn);
        float ridge = (1.0 - smoothstep(0.0, 0.42, dd)) * smoothstep(1.5, 4.5, h2.y);
        alb *= 1.0 + 0.10 * ridge * back;
        n = normalize(n + 0.18 * ridge * back * normalize(uHZ));
        vec2 dk = h2 - kn; float fold = (1.0 - smoothstep(0.6, 1.5, length(dk * vec2(1.0, 1.4)))) * back;
        alb *= 1.0 - 0.16 * fold * smoothstep(0.35, 0.65, abs(sin(dk.y * 9.0 + dk.x * 1.5)));
        alb = mix(alb, vec3(0.74, 0.46, 0.4), 0.35 * fold);
      }
      // a blue vein or two under the skin
      float vn = abs(noise(vec3(h2 * vec2(0.55, 0.22), 2.0)) - 0.5);
      alb = mix(alb, alb * vec3(0.78, 0.84, 1.02), back * (1.0 - smoothstep(0.02, 0.06, vn)) * smoothstep(1.0, 3.0, h2.y) * (1.0 - smoothstep(6.0, 8.0, h2.y)));
    }
    vec3 up = uU[bi];
    if (uM[bi].z > 0.5 && uM[bi].z < 1.5 && bt > 0.42 && dot(n, up) > 0.55) { alb = vec3(0.6, 0.44, 0.36); spec = 0.3; rough = 60.0; if (bt < 0.5 || dot(n, up) < 0.62) alb *= 0.75; }
    if (uM[bi].w > 0.5 && bt < 0.16 && dot(n, up) > 0.2) alb *= 0.82 + 0.18 * smoothstep(-0.3, 0.6, sin(bt * 140.0));
    if (uInk > 0.5) {
      vec3 hp = p - uHO; vec3 lq = vec3(dot(hp, uHX) * uHS, dot(hp, uHY), dot(hp, uHZ));
      float facing = dot(n, uHZ);
      if (lq.z > -0.2 && facing > 0.1) { float k = spider(lq.xy) * smoothstep(0.1, 0.4, facing) * (0.85 + 0.15 * noise(p * 14.0)); alb = mix(alb, vec3(0.03, 0.045, 0.08), k * 0.9); }
    }
  } else if (mat == 6) { alb = mix(vec3(0.09, 0.06, 0.2), vec3(0.2, 0.13, 0.36), fbm(p * vec3(1.5, 0.3, 1.5))); spec = 0.04; rough = 8.0; n = normalize(n + 0.25 * (vec3(noise(p * 6.0), noise(p * 6.0 + 5.0), noise(p * 6.0 + 9.0)) - 0.5)); }
  else if (mat == 7) { alb = vec3(0.5, 0.34, 0.12); spec = 0.45; rough = 24.0; n = normalize(n + 0.2 * (vec3(noise(p * 8.0), noise(p * 8.0 + 3.0), 0.0) - 0.5)); }
  else { alb = mix(vec3(0.30, 0.19, 0.11), vec3(0.55, 0.36, 0.2), fbm(p * vec3(6.0, 0.4, 6.0))); spec = 0.25; rough = 14.0; }
  vec3 v = -rd, L = normalize(uKey);
  float ndl = dot(n, L);
  float dif = sss > 0.5 ? max(0.0, (ndl + 0.15) / 1.15) : max(0.0, ndl);
  float sh = shadow(p + n * 0.04, L);
  float ao = occl(p, n);
  float occ = mix(0.25, 1.0, ao * ao);
  vec3 col = alb * uKeyCol * dif * sh;
  if (sss > 0.5) col += alb * vec3(0.55, 0.12, 0.06) * (1.0 - smoothstep(0.0, 0.35, abs(ndl))) * 0.6 * sh; // the warm edge of the shadow
  vec3 fill = sss > 0.5 ? uFillCol * vec3(1.35, 1.0, 0.85) : uFillCol; // skin stays warm in shadow
  col += alb * fill * (0.45 + 0.55 * n.y) * occ;
  col += alb * uFillCol * vec3(0.5, 0.35, 0.3) * max(0.0, -n.y) * occ; // warm bounce from the ground
  col += alb * vec3(0.07, 0.055, 0.06) * max(0.0, dot(n, v)) * occ; // the world in front
  col += uRimCol * pow(max(0.0, dot(n, normalize(uRim))), 2.0) * pow(1.0 - max(0.0, dot(n, v)), 2.0) * ao * (mat == 0 ? 0.9 : 0.5);
  col += uKeyCol * spec * pow(max(0.0, dot(n, normalize(L + v))), rough) * sh;
  col *= mix(0.4, 1.0, ao) * 1.35;
  col = col / (1.0 + 0.3 * col); col = pow(col, vec3(1.0 / 2.2)); col = mix(vec3(dot(col, vec3(0.3, 0.55, 0.15))), col, 0.9);
  col = clamp((col - 0.5) * 1.3 + 0.44, 0.0, 1.0); col *= col * (3.0 - 2.0 * col) * 0.35 + 0.65; // deep shadows, held lights
  o = vec4(col, p.z > uCardZ ? 1.0 : 0.5);
}`;
const VERT = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

export interface Light { key: V3; keyCol: V3; fillCol: V3; rim: V3; rimCol: V3 }
export interface Shot { w: number; h: number; fovY: number; caps: Cap[]; light: Light; card?: { z: number; cx: number; cy: number; hw: number; hh: number }; frame?: Frame; ink?: boolean }

let gl: WebGL2RenderingContext | null = null;
let prog: WebGLProgram | null = null;
function setup(): WebGL2RenderingContext {
  if (gl && prog) return gl;
  const c = document.createElement('canvas');
  gl = c.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false })!;
  const sh = (type: number, src: string) => { const s = gl!.createShader(type)!; gl!.shaderSource(s, src); gl!.compileShader(s); if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) ?? 'shader'); return s; };
  prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  return gl;
}

const COLOURS = 40;
/** Median cut: split the colour box with the widest channel at its median until there are n boxes; each box's mean is a colour. */
function palette(cols: number[][], n: number): number[][] {
  let boxes = [cols];
  while (boxes.length < n) {
    let bi = -1, bc = 0, br = -1;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of b) { lo = Math.min(lo, p[c]); hi = Math.max(hi, p[c]); }
        const score = (hi - lo) * Math.sqrt(b.length);
        if (score > br) { br = score; bi = i; bc = c; }
      }
    });
    if (bi < 0) break;
    const b = boxes[bi].slice().sort((p, q) => p[bc] - q[bc]);
    const m = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
  }
  return boxes.map((b) => [0, 1, 2].map((c) => b.reduce((a, p) => a + p[c], 0) / b.length));
}

/** Render at four times the size, average each block down, cut to a 40-colour palette without dither. Returns all, front-of-card and behind-card sprites. */
export function renderHand(s: Shot): { all: HTMLCanvasElement; front: HTMLCanvasElement; back: HTMLCanvasElement } {
  const g = setup();
  const SS = 4, W = s.w * SS, H = s.h * SS;
  g.canvas.width = W; g.canvas.height = H;
  g.viewport(0, 0, W, H);
  g.useProgram(prog);
  const u = (n: string) => g.getUniformLocation(prog!, n);
  const caps = s.caps.slice(0, MAX);
  const A = new Float32Array(MAX * 4), B = new Float32Array(MAX * 4), M = new Float32Array(MAX * 4), U = new Float32Array(MAX * 3);
  caps.forEach((c, i) => {
    A.set([...c.a, c.ra], i * 4); B.set([...c.b, c.rb], i * 4);
    M.set([c.group, c.k, c.flat ? 2 : c.nail ? 1 : 0, c.joint ? 1 : 0], i * 4); U.set(c.up ?? [0, 0, 1], i * 3);
  });
  g.uniform2f(u('uRes'), W, H); g.uniform1i(u('uN'), caps.length); g.uniform1f(u('uTan'), Math.tan(s.fovY / 2));
  g.uniform4fv(u('uA'), A); g.uniform4fv(u('uB'), B); g.uniform4fv(u('uM'), M); g.uniform3fv(u('uU'), U);
  g.uniform3fv(u('uKey'), s.light.key); g.uniform3fv(u('uKeyCol'), s.light.keyCol); g.uniform3fv(u('uFillCol'), s.light.fillCol);
  g.uniform3fv(u('uRim'), s.light.rim); g.uniform3fv(u('uRimCol'), s.light.rimCol);
  const cd = s.card;
  g.uniform1f(u('uCardZ'), cd ? cd.z : -1e9);
  g.uniform4f(u('uCard'), cd ? cd.cx : 0, cd ? cd.cy : 0, cd ? cd.hw : 0, cd ? cd.hh : 0);
  g.uniform1f(u('uInk'), s.frame ? (s.ink ? 1 : 0) : -1);
  if (s.frame) {
    const b = basis(s.frame);
    g.uniform3fv(u('uHO'), s.frame.origin); g.uniform3fv(u('uHX'), b.X); g.uniform3fv(u('uHY'), b.Y); g.uniform3fv(u('uHZ'), b.Z); g.uniform1f(u('uHS'), b.s);
  }
  g.drawArrays(g.TRIANGLES, 0, 3);
  const px = new Uint8Array(W * H * 4);
  g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, px);
  const mk = () => { const c = document.createElement('canvas'); c.width = s.w; c.height = s.h; return c; };
  const out = [mk(), mk(), mk()];
  const imgs = out.map((c) => c.getContext('2d')!.createImageData(s.w, s.h));
  const covered = new Uint8Array(s.w * s.h), front = new Uint8Array(s.w * s.h);
  const rgb = new Float32Array(s.w * s.h * 3);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    let r = 0, gg = 0, b = 0, n = 0, f = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const k = ((H - 1 - (y * SS + j)) * W + x * SS + i) * 4;
      if (px[k + 3] === 0) continue;
      r += px[k]; gg += px[k + 1]; b += px[k + 2]; n++; if (px[k + 3] > 200) f++;
    }
    const o = y * s.w + x;
    if (n * 2 < SS * SS) continue;
    covered[o] = 1; front[o] = f * 2 >= n ? 1 : 0;
    rgb.set([r / n, gg / n, b / n], o * 3);
  }
  // cut the palette where the eye tells shades apart: in square-root space, so the shadows keep their steps
  const seen: number[][] = [];
  for (let o = 0; o < s.w * s.h; o++) if (covered[o]) seen.push([0, 1, 2].map((c) => Math.sqrt(rgb[o * 3 + c] / 255) * 255));
  const pal = palette(seen, COLOURS).map((p) => p.map((v) => ((v / 255) ** 2) * 255));
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const o = y * s.w + x;
    if (!covered[o]) continue;
    let best = pal[0], bd = 1e9;
    for (const p of pal) { const d = (p[0] - rgb[o * 3]) ** 2 + (p[1] - rgb[o * 3 + 1]) ** 2 + (p[2] - rgb[o * 3 + 2]) ** 2; if (d < bd) { bd = d; best = p; } }
    const col = best.map(Math.round);
    for (const [idx, ok] of [[0, true], [1, front[o] === 1], [2, front[o] === 0]] as [number, boolean][]) {
      if (!ok) continue;
      imgs[idx].data.set([col[0], col[1], col[2], 255], o * 4);
    }
  }
  out.forEach((c, i) => c.getContext('2d')!.putImageData(imgs[i], 0, 0));
  return { all: out[0], front: out[1], back: out[2] };
}

/** World size of one sprite pixel at depth z (cm), for placing things over sprite coordinates. */
export const pxAt = (z: number, h: number, fovY: number) => (2 * Math.abs(z) * Math.tan(fovY / 2)) / h;
