import type { BtBlackboard, BtNode, BtStatus } from "./types";

export class Sequence implements BtNode {
  constructor(private readonly children: readonly BtNode[]) {}

  tick(bb: BtBlackboard): BtStatus {
    for (const child of this.children) {
      const status = child.tick(bb);
      if (status !== "success") return status;
    }
    return "success";
  }
}

export class Selector implements BtNode {
  constructor(private readonly children: readonly BtNode[]) {}

  tick(bb: BtBlackboard): BtStatus {
    for (const child of this.children) {
      const status = child.tick(bb);
      if (status !== "failure") return status;
    }
    return "failure";
  }
}

/**
 * UtilitySelector: score each child, tick the best one. A child is scored via
 * a pure function of the blackboard. Ties broken deterministically via rng.
 * The chosen child's status is returned as-is.
 */
export type UtilityScorer = (bb: BtBlackboard) => number;

export interface UtilityChild {
  score: UtilityScorer;
  node: BtNode;
}

export class UtilitySelector implements BtNode {
  constructor(private readonly children: readonly UtilityChild[]) {
    if (children.length === 0) {
      throw new Error("UtilitySelector requires at least one child");
    }
  }

  tick(bb: BtBlackboard): BtStatus {
    let bestIdx = -1;
    let bestScore = -Infinity;
    const ties: number[] = [];
    for (let i = 0; i < this.children.length; i++) {
      const s = this.children[i].score(bb);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
        ties.length = 0;
        ties.push(i);
      } else if (s === bestScore) {
        ties.push(i);
      }
    }
    const picked = ties.length > 1 ? ties[bb.rng.randint(0, ties.length)] : bestIdx;
    return this.children[picked].node.tick(bb);
  }
}
