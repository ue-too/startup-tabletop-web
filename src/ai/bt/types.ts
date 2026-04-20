/**
 * Behavior-tree core types. Keep minimal: a node is something that ticks against
 * a blackboard and returns a status. Nodes that finalize an action decision write
 * it to `bb.chosenActionIndex` before returning success.
 */

import type { Action } from "../../engine/actions/base";
import type { GameState } from "../../engine/state";

export type BtStatus = "success" | "failure" | "running";

export interface BtRng {
  /** [0, 1) */
  next(): number;
  /** integer in [low, high) */
  randint(low: number, high: number): number;
}

export interface BtBlackboard {
  readonly state: GameState;
  readonly player: number;
  readonly legalActions: readonly Action[];
  readonly rng: BtRng;
  /** Free-form per-tick memory (e.g. cooldowns). Nodes own their keys. */
  memory: Record<string, unknown>;
  /** Nodes that commit to an action write its legalActions index here. */
  chosenActionIndex: number;
}

export interface BtNode {
  tick(bb: BtBlackboard): BtStatus;
}

export function makeBlackboard(args: {
  state: GameState;
  player: number;
  legalActions: readonly Action[];
  rng: BtRng;
}): BtBlackboard {
  return {
    ...args,
    memory: {},
    chosenActionIndex: -1,
  };
}
