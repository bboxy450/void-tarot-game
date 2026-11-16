// The finish: the one pass over the picture. Antialias a touch, firm the strokes, grade the colour
// (shade toward violet, light toward warm gold), lay the weave of the canvas and a little varnish.
import * as THREE from 'three';

export const finishUniforms = {
  tScene: { value: null as THREE.Texture | null },
  uRes: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
  uFlash: { value: 0 },
  uFlashCol: { value: new THREE.Color(1, 0.8, 0.5) },
  uHurt: { value: 0 },
  uDay: { value: 0 },
  uFade: { value: 1 },
  uWeave: { value: 1 },
};

const FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uFlash;
uniform vec3 uFlashCol;
uniform float uHurt;
uniform float uDay;
uniform float uFade;
uniform float uWeave;
varying vec2 vUv;

float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec2 px = 1.0 / uRes;
  vec3 c = texture2D(tScene, vUv).rgb;
  vec3 n0 = texture2D(tScene, vUv + vec2(px.x, 0.0)).rgb;
  vec3 n1 = texture2D(tScene, vUv - vec2(px.x, 0.0)).rgb;
  vec3 n2 = texture2D(tScene, vUv + vec2(0.0, px.y)).rgb;
  vec3 n3 = texture2D(tScene, vUv - vec2(0.0, px.y)).rgb;
  // firm the edges of the strokes, never past the lightest or darkest neighbour
  vec3 lo = min(min(n0, n1), min(n2, n3)), hi = max(max(n0, n1), max(n2, n3));
  vec3 s = clamp(c + (c * 4.0 - n0 - n1 - n2 - n3) * 0.28, min(lo, c), max(hi, c));
  c = s;

  // grade: shade toward violet, light toward warm, a lift in the darks
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 shade = c * vec3(0.9, 0.84, 1.12) + vec3(0.025, 0.012, 0.05);
  vec3 light = c * vec3(1.06, 1.0, 0.86) + vec3(0.02, 0.01, 0.0);
  c = mix(shade, light, smoothstep(0.15, 0.75, l));
  // saturation held together
  float l2 = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l2), c, 1.08);
  c = mix(c, c * vec3(1.18, 1.1, 0.88) + vec3(0.05, 0.035, 0.0), uDay);
  // rolloff of the brightest paint
  c = mix(c, 1.0 - (1.0 - c) * (1.0 - c) * 0.5 - 0.0, smoothstep(0.75, 1.3, c) * 0.6);
  c = min(c, vec3(1.0));

  // the weave of the canvas, in picture space
  vec2 q = gl_FragCoord.xy;
  float warp = sin(q.x * 1.15 + vnoise(q * 0.05) * 2.0) * 0.5 + 0.5;
  float weft = sin(q.y * 1.15 + vnoise(q.yx * 0.05) * 2.0) * 0.5 + 0.5;
  float weave = mix(warp, weft, step(0.5, fract((floor(q.x / 2.7) + floor(q.y / 2.7)) * 0.5)));
  float tooth = vnoise(q * 0.7) * 0.6 + vnoise(q * 0.13) * 0.4;
  c *= 1.0 + ((weave - 0.5) * 0.05 + (tooth - 0.5) * 0.06) * uWeave;
  // varnish: a faint warm sheen, deeper corners
  vec2 v = vUv - 0.5;
  float vig = 1.0 - dot(v, v) * 0.85;
  c *= vig;
  c += vec3(0.012, 0.008, 0.0);

  c += uFlashCol * uFlash;
  c = mix(c, vec3(0.35, 0.02, 0.06), uHurt * smoothstep(0.15, 0.6, length(v)) * 0.8);
  c *= uFade;
  gl_FragColor = vec4(c, 1.0);
}
`;

export function makeFinish(): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: finishUniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}
