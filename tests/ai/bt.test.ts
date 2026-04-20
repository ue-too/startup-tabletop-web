import { test, expect } from "bun:test";
import type { BtBlackboard, BtNode, BtStatus } from "../../src/ai/bt/types";
import { Sequence, Selector, UtilitySelector } from "../../src/ai/bt/composites";
import { Guard, Inverter } from "../../src/ai/bt/decorators";
import { Condition, SelectAction, PassOrFirstLegal } from "../../src/ai/bt/leaves";
import { ActionType } from "../../src/engine/types";
import { createAction } from "../../src/engine/actions/base";

function makeBb(overrides: Partial<BtBlackboard> = {}): BtBlackboard {
  return {
    state: {} as any,
    player: 0,
    legalActions: [createAction(ActionType.PASS)],
    rng: {
      next: () => 0.5,
      randint: (low, high) => Math.floor((low + high) / 2),
    },
    memory: {},
    chosenActionIndex: -1,
    ...overrides,
  };
}

class StubNode implements BtNode {
  ticked = 0;
  constructor(private readonly result: BtStatus) {}
  tick(): BtStatus {
    this.ticked++;
    return this.result;
  }
}

test("Sequence short-circuits on failure", () => {
  const a = new StubNode("success");
  const b = new StubNode("failure");
  const c = new StubNode("success");
  const seq = new Sequence([a, b, c]);
  const status = seq.tick(makeBb());
  expect(status).toBe("failure");
  expect(a.ticked).toBe(1);
  expect(b.ticked).toBe(1);
  expect(c.ticked).toBe(0);
});

test("Sequence returns success when all children succeed", () => {
  const a = new StubNode("success");
  const b = new StubNode("success");
  const seq = new Sequence([a, b]);
  expect(seq.tick(makeBb())).toBe("success");
});

test("Selector short-circuits on success", () => {
  const a = new StubNode("failure");
  const b = new StubNode("success");
  const c = new StubNode("failure");
  const sel = new Selector([a, b, c]);
  expect(sel.tick(makeBb())).toBe("success");
  expect(a.ticked).toBe(1);
  expect(b.ticked).toBe(1);
  expect(c.ticked).toBe(0);
});

test("Selector returns failure when all children fail", () => {
  const sel = new Selector([new StubNode("failure"), new StubNode("failure")]);
  expect(sel.tick(makeBb())).toBe("failure");
});

test("UtilitySelector picks highest-scoring child", () => {
  const a = new StubNode("success");
  const b = new StubNode("success");
  const c = new StubNode("success");
  const usel = new UtilitySelector([
    { score: () => 0.1, node: a },
    { score: () => 0.8, node: b },
    { score: () => 0.5, node: c },
  ]);
  usel.tick(makeBb());
  expect(a.ticked).toBe(0);
  expect(b.ticked).toBe(1);
  expect(c.ticked).toBe(0);
});

test("UtilitySelector tie-break uses the rng", () => {
  const a = new StubNode("success");
  const b = new StubNode("success");
  // First tied index is 0 (only a at first). Then b joins ties. randint(0,2) -> 1.
  const usel = new UtilitySelector([
    { score: () => 0.5, node: a },
    { score: () => 0.5, node: b },
  ]);
  usel.tick(makeBb({ rng: { next: () => 0, randint: () => 1 } }));
  expect(b.ticked).toBe(1);
  expect(a.ticked).toBe(0);
});

test("Guard skips child when condition is false", () => {
  const child = new StubNode("success");
  const g = new Guard(() => false, child);
  expect(g.tick(makeBb())).toBe("failure");
  expect(child.ticked).toBe(0);
});

test("Guard ticks child when condition is true", () => {
  const child = new StubNode("success");
  const g = new Guard(() => true, child);
  expect(g.tick(makeBb())).toBe("success");
  expect(child.ticked).toBe(1);
});

test("Inverter flips success and failure but passes running", () => {
  expect(new Inverter(new StubNode("success")).tick(makeBb())).toBe("failure");
  expect(new Inverter(new StubNode("failure")).tick(makeBb())).toBe("success");
  expect(new Inverter(new StubNode("running")).tick(makeBb())).toBe("running");
});

test("Condition returns status from predicate", () => {
  expect(new Condition(() => true).tick(makeBb())).toBe("success");
  expect(new Condition(() => false).tick(makeBb())).toBe("failure");
});

test("SelectAction commits a legal index", () => {
  const legal = [createAction(ActionType.PASS), createAction(ActionType.RECRUIT)];
  const bb = makeBb({ legalActions: legal });
  const node = new SelectAction(() => 1);
  expect(node.tick(bb)).toBe("success");
  expect(bb.chosenActionIndex).toBe(1);
});

test("SelectAction fails on out-of-range index", () => {
  const bb = makeBb({ legalActions: [createAction(ActionType.PASS)] });
  expect(new SelectAction(() => 7).tick(bb)).toBe("failure");
  expect(bb.chosenActionIndex).toBe(-1);
});

test("PassOrFirstLegal prefers PASS when present", () => {
  const legal = [createAction(ActionType.RECRUIT), createAction(ActionType.PASS)];
  const bb = makeBb({ legalActions: legal });
  new PassOrFirstLegal().tick(bb);
  expect(bb.chosenActionIndex).toBe(1);
});

test("PassOrFirstLegal falls back to index 0 without PASS", () => {
  const legal = [createAction(ActionType.RECRUIT)];
  const bb = makeBb({ legalActions: legal });
  new PassOrFirstLegal().tick(bb);
  expect(bb.chosenActionIndex).toBe(0);
});
