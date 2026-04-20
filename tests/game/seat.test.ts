import { test, expect } from "bun:test";
import {
  buildAgentForSeat,
  buildAgentsForSeats,
  findHumanSeat,
  seatsNeedNeuralFeatures,
  type SeatConfig,
} from "../../src/game/seat";
import { OnnxAgentAdapter } from "../../src/ai/onnxAgentAdapter";
import { UtilityBtAgent } from "../../src/ai/utilityBtAgent";

test("buildAgentForSeat: human returns null", () => {
  expect(buildAgentForSeat({ kind: "human" }, 0, 42)).toBeNull();
});

test("buildAgentForSeat: onnx returns OnnxAgentAdapter", () => {
  const a = buildAgentForSeat(
    { kind: "onnx", modelPath: "/models/m.onnx" },
    1,
    42,
  );
  expect(a).toBeInstanceOf(OnnxAgentAdapter);
});

test("buildAgentForSeat: utilityBt returns UtilityBtAgent", () => {
  const a = buildAgentForSeat({ kind: "utilityBt", persona: "balanced" }, 1, 42);
  expect(a).toBeInstanceOf(UtilityBtAgent);
});

test("buildAgentForSeat: unknown persona throws", () => {
  expect(() =>
    buildAgentForSeat({ kind: "utilityBt", persona: "ghost" }, 0, 0),
  ).toThrow(/Unknown persona "ghost"/);
});

test("buildAgentForSeat: onnx without modelPath throws", () => {
  expect(() =>
    buildAgentForSeat({ kind: "onnx", modelPath: "" }, 0, 0),
  ).toThrow(/requires modelPath/);
});

test("buildAgentsForSeats dedupes ONNX adapters by modelPath", () => {
  const seats: SeatConfig[] = [
    { kind: "onnx", modelPath: "/m.onnx" },
    { kind: "onnx", modelPath: "/m.onnx" },
    { kind: "onnx", modelPath: "/other.onnx" },
  ];
  const agents = buildAgentsForSeats(seats, 42);
  expect(agents[0]).toBe(agents[1]);
  expect(agents[0]).not.toBe(agents[2]);
});

test("buildAgentsForSeats mixed seats", () => {
  const seats: SeatConfig[] = [
    { kind: "human" },
    { kind: "utilityBt", persona: "aggressive" },
    { kind: "onnx", modelPath: "/m.onnx" },
  ];
  const agents = buildAgentsForSeats(seats, 7);
  expect(agents[0]).toBeNull();
  expect(agents[1]).toBeInstanceOf(UtilityBtAgent);
  expect(agents[2]).toBeInstanceOf(OnnxAgentAdapter);
});

test("findHumanSeat returns the index of the human seat or -1", () => {
  expect(
    findHumanSeat([
      { kind: "onnx", modelPath: "/m" },
      { kind: "human" },
      { kind: "utilityBt", persona: "balanced" },
    ]),
  ).toBe(1);
  expect(findHumanSeat([{ kind: "onnx", modelPath: "/m" }])).toBe(-1);
});

test("seatsNeedNeuralFeatures is true iff any seat is onnx", () => {
  expect(
    seatsNeedNeuralFeatures([{ kind: "utilityBt", persona: "balanced" }]),
  ).toBe(false);
  expect(
    seatsNeedNeuralFeatures([{ kind: "onnx", modelPath: "/m" }]),
  ).toBe(true);
  expect(
    seatsNeedNeuralFeatures([
      { kind: "human" },
      { kind: "utilityBt", persona: "balanced" },
    ]),
  ).toBe(false);
});

test("Pure UtilityBT init makes no fetch calls", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    calls.push(String(url));
    return new Response("");
  }) as any;

  try {
    const seats: SeatConfig[] = [
      { kind: "utilityBt", persona: "balanced" },
      { kind: "utilityBt", persona: "aggressive" },
    ];
    const agents = buildAgentsForSeats(seats, 0);
    const seen = new Set();
    for (const a of agents) {
      if (!a || seen.has(a) || !a.init) continue;
      seen.add(a);
      await a.init();
    }
    expect(calls).toEqual([]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
