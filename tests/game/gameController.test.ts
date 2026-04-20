import { test, expect } from "bun:test";
import { GameController } from "../../src/game/GameController";
import { SimController } from "../../src/game/SimController";
import type { SeatConfig } from "../../src/game/seat";

// These two construction-time guards fire before the engine is built, so we
// can pass a null registry without the engine ever touching it.

test("GameController: seat count mismatch throws", () => {
  const seats: SeatConfig[] = [{ kind: "human" }];
  expect(
    () =>
      new GameController(
        { numPlayers: 2, seed: 0, seats } as any,
        null as any,
      ),
  ).toThrow(/seats.length/);
});

test("GameController: missing human seat throws", () => {
  const seats: SeatConfig[] = [
    { kind: "utilityBt", persona: "balanced" },
    { kind: "onnx", modelPath: "/m" },
  ];
  expect(
    () =>
      new GameController(
        { numPlayers: 2, seed: 0, seats } as any,
        null as any,
      ),
  ).toThrow(/human seat/);
});

test("SimController: human seat is rejected", () => {
  const seats: SeatConfig[] = [
    { kind: "human" },
    { kind: "utilityBt", persona: "balanced" },
  ];
  expect(
    () => new SimController({ numPlayers: 2, seed: 0, seats } as any, null as any),
  ).toThrow(/human seats/);
});

test("SimController: seat count mismatch throws", () => {
  expect(
    () =>
      new SimController(
        {
          numPlayers: 3,
          seed: 0,
          seats: [{ kind: "utilityBt", persona: "balanced" }],
        } as any,
        null as any,
      ),
  ).toThrow(/seats.length/);
});
