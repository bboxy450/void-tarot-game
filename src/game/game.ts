import * as THREE from 'three';
import type { World } from '../world/world';
import type { Player } from './player';
export class Game {
  cards = { give: (_i: number) => {}, selectCard: (_i: number) => {} };
  constructor(public o: { renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; scene: THREE.Scene; world: World; player: Player; canvas: HTMLCanvasElement; skipTitle: boolean }) {}
  resize(_w: number, _h: number) {}
  shake() { return new THREE.Vector4(0, 0, 0, 0); }
  update(_dt: number, _t: number) {}
  drawOverlay() {}
  castNow() {}
  castAt(_x: number, _z: number) {}
}
