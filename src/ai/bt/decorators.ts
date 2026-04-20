import type { BtBlackboard, BtNode, BtStatus } from "./types";

export type BtPredicate = (bb: BtBlackboard) => boolean;

/** Guard: tick child only if the condition holds; otherwise return failure. */
export class Guard implements BtNode {
  constructor(
    private readonly cond: BtPredicate,
    private readonly child: BtNode,
  ) {}

  tick(bb: BtBlackboard): BtStatus {
    return this.cond(bb) ? this.child.tick(bb) : "failure";
  }
}

/** Inverter: success ↔ failure; running passes through. */
export class Inverter implements BtNode {
  constructor(private readonly child: BtNode) {}

  tick(bb: BtBlackboard): BtStatus {
    const s = this.child.tick(bb);
    if (s === "success") return "failure";
    if (s === "failure") return "success";
    return "running";
  }
}
