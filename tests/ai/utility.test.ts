import { test, expect } from "bun:test";
import { Linear, Inverse, Logistic, Threshold } from "../../src/ai/utility/curves";
import { Scorer } from "../../src/ai/utility/scorer";
import type { AgentContext } from "../../src/ai/agent";
import { createAction } from "../../src/engine/actions/base";
import { ActionType } from "../../src/engine/types";
import type { BtRng } from "../../src/ai/bt/types";

const fixedRng = (next: number, rint: number): BtRng => ({
  next: () => next,
  randint: () => rint,
});

function makeCtx(legal = [createAction(ActionType.PASS)]): AgentContext {
  return {
    state: {
      players: [
        { cash: 7, actionPoints: 3, bench: [], devProducts: [], productBacklog: [] },
      ],
    } as any,
    player: 0,
    legalActions: legal,
  };
}

test("Linear clamps to [0,1]", () => {
  expect(Linear(-1)).toBe(0);
  expect(Linear(0)).toBe(0);
  expect(Linear(0.5)).toBe(0.5);
  expect(Linear(2)).toBe(1);
});

test("Inverse returns 1 - x clamped", () => {
  expect(Inverse(0)).toBe(1);
  expect(Inverse(1)).toBe(0);
  expect(Inverse(-1)).toBe(1);
});

test("Threshold steps at the boundary", () => {
  const t = Threshold(0.5);
  expect(t(0.49)).toBe(0);
  expect(t(0.5)).toBe(1);
  expect(t(1)).toBe(1);
});

test("Logistic monotonic", () => {
  const l = Logistic();
  expect(l(0)).toBeLessThan(l(0.5));
  expect(l(0.5)).toBeLessThan(l(1));
});

test("Geometric combinator vetoes on a zero consideration", () => {
  const scorer = new Scorer({
    terms: [
      { key: "a", consideration: () => 0, weight: 1 },
      { key: "b", consideration: () => 1, weight: 1 },
    ],
  });
  expect(scorer.score(makeCtx(), createAction(ActionType.PASS))).toBe(0);
});

test("Geometric combinator returns positive score when all terms are positive", () => {
  const scorer = new Scorer({
    terms: [
      { key: "a", consideration: () => 0.5, weight: 1 },
      { key: "b", consideration: () => 0.8, weight: 1 },
    ],
  });
  const s = scorer.score(makeCtx(), createAction(ActionType.PASS));
  expect(s).toBeGreaterThan(0);
  expect(s).toBeLessThanOrEqual(1);
});

test("Additive combinator averages weighted terms", () => {
  const scorer = new Scorer({
    combinator: "additive",
    terms: [
      { key: "a", consideration: () => 1, weight: 1 },
      { key: "b", consideration: () => 0, weight: 1 },
    ],
  });
  const s = scorer.score(makeCtx(), createAction(ActionType.PASS));
  expect(s).toBeCloseTo(0.5, 6);
});

test("pickBest returns the highest-scoring candidate index", () => {
  const legal = [
    createAction(ActionType.PASS),
    createAction(ActionType.RECRUIT),
    createAction(ActionType.LAUNCH),
  ];
  const scorer = new Scorer({
    terms: [
      {
        key: "a",
        consideration: (_c, a) => (a.actionType === ActionType.LAUNCH ? 1 : 0.1),
        weight: 1,
      },
    ],
  });
  const idx = scorer.pickBest(makeCtx(legal), [0, 1, 2], fixedRng(0, 0));
  expect(idx).toBe(2);
});

test("pickBest ties broken deterministically", () => {
  const legal = [createAction(ActionType.PASS), createAction(ActionType.RECRUIT)];
  const scorer = new Scorer({
    terms: [{ key: "a", consideration: () => 0.5, weight: 1 }],
  });
  // both have identical score; rng.randint returns 1 → pick second tied index
  const ctx = makeCtx(legal);
  const a = scorer.pickBest(ctx, [0, 1], fixedRng(0, 1));
  const b = scorer.pickBest(ctx, [0, 1], fixedRng(0, 1));
  expect(a).toBe(b);
  expect(a).toBe(1);
});

test("pickBest returns -1 when no candidate scores above zero", () => {
  const legal = [createAction(ActionType.PASS)];
  const scorer = new Scorer({
    terms: [{ key: "a", consideration: () => 0, weight: 1 }],
  });
  expect(scorer.pickBest(makeCtx(legal), [0], fixedRng(0, 0))).toBe(-1);
});
