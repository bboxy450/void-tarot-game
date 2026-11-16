// GLSL for the dab cards and the underpainting. One set of shared uniforms drives every material.
import * as THREE from 'three';

export const MAX_LIGHTS = 10;

/** Uniforms shared by every painted material (one object, so one update reaches them all). */
export const shared = {
  uTime: { value: 0 },
  uFocal: { value: 600 }, // pixels per metre at one metre: viewport height / 2 / tan(fov / 2)
  uViewport: { value: new THREE.Vector2(1440, 900) },
  uRefPx: { value: 1 }, // screen pixels per reference pixel (sizes are given for a 900 px tall picture)
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uSunDir: { value: new THREE.Vector3(-0.35, 0.2, -1).normalize() },
  uMistWarm: { value: new THREE.Color() },
  uMistCool: { value: new THREE.Color() },
  uMistDensity: { value: 0.0042 },
  uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -999, 0, 1)) },
  uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uDay: { value: 0 }, // the Sun card: 0 dusk .. 1 bright
  uPush: { value: new THREE.Vector4(0, -999, 0, 0) }, // a blast that bends grass and leaves: xyz, strength
  uPushR: { value: 6 },
};

export const COMMON = /* glsl */ `
uniform float uTime;
uniform float uFocal;
uniform vec2 uViewport;
uniform float uRefPx;
uniform vec2 uWindDir;
uniform vec3 uSunDir;
uniform vec3 uMistWarm;
uniform vec3 uMistCool;
uniform float uMistDensity;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec4 uLightCol[${MAX_LIGHTS}];
uniform float uDay;
uniform vec4 uPush;
uniform float uPushR;

// gusts cross the valley in bands (mirrored in wind.ts for the sound)
float gustAt(vec2 xz, float t) {
  float along = dot(xz, uWindDir);
  float across = dot(xz, vec2(-uWindDir.y, uWindDir.x));
  float g = 0.5 + 0.5 * sin(along * 0.045 - t * 0.9 + sin(across * 0.02) * 2.0);
  g = g * g * g;
  return 0.18 + g * (0.75 + 0.25 * sin(across * 0.031 + t * 0.21));
}

vec3 mistColor(vec3 viewDir) {
  vec2 s = normalize(uSunDir.xz);
  float toSun = max(dot(normalize(viewDir.xz + 1e-5), s), 0.0);
  return mix(uMistCool, uMistWarm, pow(toSun, 2.5));
}

// mist by true distance; thinner high up
float mistAt(float dist, float height) {
  float m = 1.0 - exp(-max(dist - 12.0, 0.0) * uMistDensity);
  return m * mix(1.0, 0.55, clamp(height / 60.0, 0.0, 1.0));
}

vec3 dynamicLight(vec3 wp, vec3 col, float take) {
  vec3 add = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    vec4 lp = uLightPos[i];
    vec4 lc = uLightCol[i];
    float d = length(wp - lp.xyz);
    float f = max(1.0 - d / lp.w, 0.0);
    add += lc.rgb * (f * f * lc.a);
  }
  // paint takes light: it warms the colour and lifts it, a little goes straight in
  return col + (col * 1.6 + 0.12) * add * take;
}
`;

export const DAB_VERT = /* glsl */ `
${COMMON}
attribute vec3 iPos;
attribute vec4 iDir;   // xyz: stroke direction, w: bend (how much the wind moves it)
attribute vec4 iNrm;   // xyz: surface normal for lying strokes (zero: the stroke faces the eye)
attribute vec2 iSize;  // length, width in centimetres
attribute vec4 iCol;   // rgb, a: rank
attribute vec4 iMisc;  // x: mark, y: seed, z: takes light, w: glow

uniform float uMinPx;
uniform float uMaxPx;
uniform float uGust;
uniform float uMistAmt;
uniform float uDepthStep;
uniform float uKeepFloor;
uniform vec4 uTint;

varying vec3 vCol;
varying vec2 vUv;
varying vec2 vLight;
varying float vFine;
varying float vMark;

void main() {
  vec3 wp = (modelMatrix * vec4(iPos, 1.0)).xyz;
  vec3 dirW = mat3(modelMatrix) * iDir.xyz;
  float bend = iDir.w;
  float seed = iMisc.y;

  // wind: pushed downwind by the gust, flutter by its own seed
  if (uGust > 0.0 && bend > 0.0) {
    float g = gustAt(wp.xz, uTime);
    vec2 push = uWindDir * (g * 0.9 + 0.06 * sin(uTime * 2.7 + seed * 40.0));
    vec3 flutter = vec3(sin(uTime * 3.1 + seed * 61.0), 0.4 * sin(uTime * 2.3 + seed * 17.0), cos(uTime * 2.9 + seed * 29.0));
    wp += (vec3(push.x, -0.15 * g, push.y) + flutter * 0.12 * (0.4 + g)) * bend * uGust;
  }
  if (bend > 0.0 && uPush.w > 0.0) {
    vec3 dp = wp - uPush.xyz;
    float f = max(0.0, 1.0 - length(dp) / uPushR);
    vec2 away = normalize(dp.xz + 1e-4);
    wp += vec3(away.x, -0.35, away.y) * f * f * uPush.w * bend;
  }

  vec3 toEye = cameraPosition - wp;
  float dist = length(toEye);
  vec3 V = toEye / dist;

  float len = iSize.x * 0.01;
  float wid = iSize.y * 0.01;
  float px = len * uFocal / dist;
  float minPx = uMinPx * uRefPx;
  float scale = 1.0;
  float rank = iCol.a;
  vFine = 0.0;
  if (px < minPx) {
    // far: fewer and larger strokes. Each dab has a fixed rank; only low ranks stay and grow.
    float keep = max((px / minPx) * (px / minPx), uKeepFloor);
    if (rank > keep) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
    scale = minPx / px;
    scale *= mix(0.45, 1.0, smoothstep(keep, keep * 0.7, rank));
    vFine = 1.0;
  }
  float onScreen = px * scale;
  vFine = max(vFine, smoothstep(14.0, 6.0, onScreen / uRefPx));
  if (onScreen > uMaxPx * uRefPx) scale *= uMaxPx * uRefPx / onScreen;

  // light along the paint: from the upper left of the picture
  vec2 lightDir = normalize(vec2(-0.6, 0.8));
  vec4 clip;
  vec3 nrm = iNrm.xyz;
  if (dot(nrm, nrm) < 0.01) {
    // facing stroke: a card turned to the eye, running along the stroke direction seen on screen
    mat4 pv = projectionMatrix * viewMatrix;
    clip = pv * vec4(wp, 1.0);
    vec4 c2 = pv * vec4(wp + normalize(dirW + 1e-5) * max(len, 0.05) * 0.5, 1.0);
    vec2 s1 = clip.xy / clip.w;
    vec2 s2 = c2.xy / max(c2.w, 1e-3);
    vec2 sd = (s2 - s1) * uViewport;
    if (c2.w <= 1e-3 || dot(sd, sd) < 1e-6) sd = vec2(1.0, 0.0);
    sd = normalize(sd);
    vec2 pd = vec2(-sd.y, sd.x);
    vec2 off = (sd * position.x * len + pd * position.y * wid) * 0.5 * scale * uFocal / dist;
    clip.xy += off / uViewport * 2.0 * clip.w;
    vLight = vec2(dot(lightDir, sd), dot(lightDir, pd));
  } else {
    // lying stroke: on its surface along its grain, stood up toward the eye when seen edge on
    nrm = normalize(mat3(modelMatrix) * nrm);
    vec3 t = normalize(dirW - nrm * dot(dirW, nrm) + 1e-5);
    vec3 b = cross(nrm, t);
    float facing = abs(dot(V, nrm));
    vec3 bFace = normalize(cross(t, V) + 1e-5);
    b = normalize(mix(bFace, b, smoothstep(0.08, 0.45, facing)));
    vec3 tFace = normalize(cross(V, b) + 1e-5);
    t = normalize(mix(tFace * sign(dot(tFace, t) + 1e-4), t, smoothstep(0.02, 0.25, facing) * 0.5 + 0.5));
    vec3 corner = wp + (t * position.x * len + b * position.y * wid) * 0.5 * scale;
    // a small step toward the eye by rank, so strokes on one surface never fight
    corner += V * (rank * uDepthStep * (0.02 + dist * 0.004));
    clip = projectionMatrix * viewMatrix * vec4(corner, 1.0);
    vec4 a0 = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vec4 a1 = projectionMatrix * viewMatrix * vec4(wp + t, 1.0);
    vec2 sd = normalize((a1.xy / max(a1.w, 1e-3) - a0.xy / max(a0.w, 1e-3)) * uViewport + 1e-5);
    vec2 pd = vec2(-sd.y, sd.x);
    vLight = vec2(dot(lightDir, sd), dot(lightDir, pd));
  }
  gl_Position = clip;

  // colour: baked, then the moving lights, then the mist
  vec3 col = iCol.rgb;
  col = dynamicLight(wp, col, iMisc.z);
  col *= 1.0 + uDay * (0.25 + 0.35 * iMisc.z);
  float glow = iMisc.w;
  float m = mistAt(dist, wp.y) * uMistAmt * (1.0 - glow * 0.8) * (1.0 - uDay * 0.5);
  vCol = mix(mix(col, mistColor(-V), m), uTint.rgb, uTint.a);

  float mark = floor(iMisc.x * 7.0 + 0.5);
  vMark = mark;
  vec2 cell = vec2(mod(mark, 2.0), floor(mark / 2.0));
  vec2 uv = vec2(position.x * 0.5 + 0.5, position.y * 0.5 + 0.5);
  // flip some marks so the dry end is not always on one side
  if (fract(seed * 7.13) > 0.5) uv.x = 1.0 - uv.x;
  vUv = (cell + uv) / vec2(2.0, 4.0);
}
`;

export const DAB_FRAG = /* glsl */ `
uniform sampler2D uBrush;
uniform float uImpasto;
uniform float uBroken;
varying vec3 vCol;
varying vec2 vUv;
varying vec2 vLight;
varying float vFine;
varying float vMark;

void main() {
  vec4 t = texture2D(uBrush, vUv);
  float a = mix(t.a, t.b, vFine);
  // a one-pixel edge for alpha to coverage
  float w = max(fwidth(a), 1e-4);
  a = clamp((a - 0.5) / w + 0.5, 0.0, 1.0);
  if (a < 0.01) discard;
  float rich = 1.0 - vFine;
  vec3 col = vCol;
  // broken colour along the bristles
  col *= 1.0 + (t.r - 0.5) * uBroken * (0.35 + 0.65 * rich);
  // the light rakes across the thickness of the paint
  vec2 texel = vec2(1.0 / 512.0) * 3.0;
  float h1 = texture2D(uBrush, vUv + vec2(vLight.x, -vLight.y) * texel).g;
  col *= 1.0 + (t.g - h1) * uImpasto * rich;
  gl_FragColor = vec4(max(col, 0.0), a);
}
`;

export const UNDER_VERT = /* glsl */ `
${COMMON}
attribute vec3 color;
uniform float uMistAmt;
varying vec3 vCol;
void main() {
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 toEye = cameraPosition - wp;
  float dist = length(toEye);
  vec3 col = dynamicLight(wp, color, 1.0);
  col *= 1.0 + uDay * 0.55;
  vCol = mix(col, mistColor(-toEye / dist), mistAt(dist, wp.y) * uMistAmt * (1.0 - uDay * 0.5));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const UNDER_FRAG = /* glsl */ `
varying vec3 vCol;
void main() { gl_FragColor = vec4(vCol, 1.0); }
`;
