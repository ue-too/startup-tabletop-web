/**
 * Seeded random number generator using mulberry32.
 * Deterministic: same seed = same sequence.
 *
 * Note: This does NOT produce the same sequence as Python's numpy.random.RandomState.
 * Game seeds will produce different games in TS vs Python.
 * This is acceptable since the ONNX model doesn't depend on game sequence.
 */

export class GameRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Return a float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Return random int in [low, high) */
  randint(low: number, high: number): number {
    return low + Math.floor(this.next() * (high - low));
  }

  /** Shuffle array in-place (Fisher-Yates) */
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.randint(0, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  /** Pick a random element from array */
  choice<T>(arr: readonly T[]): T {
    return arr[this.randint(0, arr.length)];
  }
}
