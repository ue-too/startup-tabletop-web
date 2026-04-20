import type { Agent } from "../ai/agent";
import { OnnxAgentAdapter } from "../ai/onnxAgentAdapter";
import { UtilityBtAgent } from "../ai/utilityBtAgent";
import { SeededRng, perSeatSeed } from "../ai/rng";
import { getPersona } from "../ai/personas";

export type SeatConfig =
  | { kind: "human" }
  | { kind: "onnx"; modelPath: string }
  | { kind: "utilityBt"; persona: string };

/**
 * Build the Agent instance for a seat. Returns null for human seats.
 * Throws on malformed configs (missing model path, unknown persona).
 * Does NOT dedupe ONNX sessions — that's the controller's job.
 */
export function buildAgentForSeat(
  seat: SeatConfig,
  seatIndex: number,
  gameSeed: number,
): Agent | null {
  switch (seat.kind) {
    case "human":
      return null;
    case "onnx":
      if (!seat.modelPath) {
        throw new Error(`Seat ${seatIndex}: onnx seat requires modelPath`);
      }
      return new OnnxAgentAdapter(seat.modelPath);
    case "utilityBt":
      getPersona(seat.persona); // validate early (throws on unknown)
      return new UtilityBtAgent({
        persona: seat.persona,
        rng: new SeededRng(perSeatSeed(gameSeed, seatIndex)),
      });
  }
}

/**
 * Resolve all seats to agents, deduplicating ONNX adapter instances for
 * identical modelPaths so the model is only fetched once.
 */
export function buildAgentsForSeats(
  seats: readonly SeatConfig[],
  gameSeed: number,
): (Agent | null)[] {
  const onnxCache = new Map<string, OnnxAgentAdapter>();
  const agents: (Agent | null)[] = [];
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i];
    if (seat.kind === "onnx") {
      if (!seat.modelPath) {
        throw new Error(`Seat ${i}: onnx seat requires modelPath`);
      }
      let adapter = onnxCache.get(seat.modelPath);
      if (!adapter) {
        adapter = new OnnxAgentAdapter(seat.modelPath);
        onnxCache.set(seat.modelPath, adapter);
      }
      agents.push(adapter);
    } else {
      agents.push(buildAgentForSeat(seat, i, gameSeed));
    }
  }
  return agents;
}

/** Find the human seat index; returns -1 if none. */
export function findHumanSeat(seats: readonly SeatConfig[]): number {
  return seats.findIndex((s) => s.kind === "human");
}

/** Does any seat in this config require neural-feature context (observation/mask)? */
export function seatsNeedNeuralFeatures(seats: readonly SeatConfig[]): boolean {
  return seats.some((s) => s.kind === "onnx");
}
