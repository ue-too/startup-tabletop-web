/**
 * Seeded RNG for AI decisions. Wraps the engine's mulberry32-based GameRng so
 * tie-breaks and stochastic considerations stay deterministic under a fixed
 * game seed.
 */

import { GameRng } from "../engine/rng";
import type { BtRng } from "./bt/types";

export class SeededRng implements BtRng {
  private readonly inner: GameRng;
  constructor(seed: number) {
    this.inner = new GameRng(seed);
  }
  next(): number {
    return this.inner.next();
  }
  randint(low: number, high: number): number {
    return this.inner.randint(low, high);
  }
}

/** Derive a per-seat seed from the game seed so each seat has an independent stream. */
export function perSeatSeed(gameSeed: number, seatIndex: number): number {
  // XOR with a large odd constant rotated by seat index keeps streams distinct.
  return (gameSeed ^ (seatIndex * 0x9e3779b1)) | 0;
}
