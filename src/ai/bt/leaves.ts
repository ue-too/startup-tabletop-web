import { ActionType } from "../../engine/types";
import type { BtBlackboard, BtNode, BtStatus } from "./types";
import type { BtPredicate } from "./decorators";

/** Condition leaf: success if predicate holds, else failure. */
export class Condition implements BtNode {
  constructor(private readonly cond: BtPredicate) {}

  tick(bb: BtBlackboard): BtStatus {
    return this.cond(bb) ? "success" : "failure";
  }
}

/**
 * SelectAction leaf: given a picker (bb) => legalActions index or -1, commit the
 * chosen action to the blackboard. Returns success if an index was chosen.
 */
export type ActionPicker = (bb: BtBlackboard) => number;

export class SelectAction implements BtNode {
  constructor(private readonly pick: ActionPicker) {}

  tick(bb: BtBlackboard): BtStatus {
    const idx = this.pick(bb);
    if (idx < 0 || idx >= bb.legalActions.length) return "failure";
    bb.chosenActionIndex = idx;
    return "success";
  }
}

/**
 * Terminal fallback: guarantee a legal action is chosen. Prefers PASS /
 * END_ASSIGN_BATCH (safe no-ops) if available, else first legal.
 *
 * Spec guarantee (utility-bt-agent §"Agent interface"): the agent always
 * returns a valid legalActions index.
 */
export class PassOrFirstLegal implements BtNode {
  tick(bb: BtBlackboard): BtStatus {
    if (bb.legalActions.length === 0) return "failure";
    const preferred = [ActionType.PASS, ActionType.END_ASSIGN_BATCH];
    for (const at of preferred) {
      const idx = bb.legalActions.findIndex((a) => a.actionType === at);
      if (idx >= 0) {
        bb.chosenActionIndex = idx;
        return "success";
      }
    }
    bb.chosenActionIndex = 0;
    return "success";
  }
}
