// What the painters share while the world is built.
import type { DabSet } from '../paint/dabs';
import type { Under } from '../paint/under';

export interface Collider {
  kind: 'circle' | 'box';
  x: number;
  z: number;
  r?: number; // circle
  hw?: number; // box half width (local x)
  hd?: number; // box half depth (local z)
  rot?: number;
  top?: number; // the player can stand on it above this height (not used for walls)
}

export interface Ctx {
  ground: DabSet;
  grass: DabSet;
  leaves: DabSet;
  solid: DabSet;
  glow: DabSet;
  far: DabSet;
  under: Under;
  r: () => number;
  colliders: Collider[];
  /** density of strokes here: 1 where the player walks, less far away */
  detail: (x: number, z: number) => number;
}
