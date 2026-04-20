/**
 * Response curves: map a raw signal to [0, 1]. All curves clamp to that range.
 */

export type Curve = (x: number) => number;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export const Linear: Curve = (x) => clamp01(x);

/** Smooth logistic curve centered at 0.5 with configurable steepness. */
export function Logistic(steepness = 10, midpoint = 0.5): Curve {
  return (x) => 1 / (1 + Math.exp(-steepness * (x - midpoint)));
}

/** Step function: 0 below threshold, 1 at or above. */
export function Threshold(threshold: number): Curve {
  return (x) => (x >= threshold ? 1 : 0);
}

export const Inverse: Curve = (x) => clamp01(1 - x);
