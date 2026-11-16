// The gusts as the shader paints them (gustAt in shaders.ts), for the sound and the flying leaves.
import { shared } from '../paint/shaders';

export function gustAt(x: number, z: number, t: number): number {
  const w = shared.uWindDir.value;
  const along = x * w.x + z * w.y;
  const across = -x * w.y + z * w.x;
  let g = 0.5 + 0.5 * Math.sin(along * 0.045 - t * 0.9 + Math.sin(across * 0.02) * 2.0);
  g = g * g * g;
  return 0.18 + g * (0.75 + 0.25 * Math.sin(across * 0.031 + t * 0.21));
}
