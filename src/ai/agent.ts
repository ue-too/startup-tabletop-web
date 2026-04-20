/**
 * Common opponent interface. Every AI agent (ONNX, UtilityBT, future variants)
 * implements this so controllers don't branch on concrete class.
 *
 * See openspec/changes/add-utility-bt-agent/design.md §1 and
 * specs/utility-bt-agent/spec.md §"Agent interface".
 */

import type { Action } from "../engine/actions/base";
import type { GameState } from "../engine/state";

export interface AgentContext {
  state: GameState;
  player: number;
  legalActions: readonly Action[];
  // Populated by the controller only for agents that need neural features.
  observation?: Float32Array;
  actionMask?: Int8Array;
}

export interface Agent {
  init?(): Promise<void>;
  getAction(ctx: AgentContext): Promise<number>;
}
