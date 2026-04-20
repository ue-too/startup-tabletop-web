/**
 * GameController: orchestrates a human vs AI game.
 * Human plays as one player; AI agents handle the rest.
 *
 * Agents are resolved from a per-seat config (see src/game/seat.ts), so a
 * game can mix ONNX, UtilityBT, and (future) other agent types.
 */

import { GameEngine, type StepResult } from "../engine/engine";
import type { CardRegistry } from "../engine/cardRegistry";
import type { Action } from "../engine/actions/base";
import type { Agent, AgentContext } from "../ai/agent";
import { encodeObservation } from "../ai/observation";
import { ActionEncoder } from "../ai/actionEncoder";
import {
  GameRecorder,
  describeAction,
  type GameFrame,
} from "./GameRecorder";
import {
  buildAgentsForSeats,
  findHumanSeat,
  seatsNeedNeuralFeatures,
  type SeatConfig,
} from "./seat";

export type GameMode = "play" | "simulate" | "replay";

export interface GameControllerOptions {
  numPlayers: number;
  seed: number;
  /** Per-seat agent configuration; must have length === numPlayers. */
  seats: SeatConfig[];
}

export class GameController {
  private engine: GameEngine;
  /** agents[i] is null for the human seat, else the Agent instance. */
  private agents: (Agent | null)[];
  private actionEncoder: ActionEncoder;
  private humanPlayer: number;
  private needsObs: boolean;

  recorder: GameRecorder;

  constructor(options: GameControllerOptions, registry: CardRegistry) {
    if (options.seats.length !== options.numPlayers) {
      throw new Error(
        `seats.length (${options.seats.length}) must equal numPlayers (${options.numPlayers})`,
      );
    }
    const humanSeat = findHumanSeat(options.seats);
    if (humanSeat < 0) {
      throw new Error("GameController requires exactly one human seat");
    }
    this.humanPlayer = humanSeat;
    this.needsObs = seatsNeedNeuralFeatures(options.seats);

    this.engine = new GameEngine(options.numPlayers, options.seed, registry);
    this.actionEncoder = new ActionEncoder();
    this.recorder = new GameRecorder();

    this.agents = buildAgentsForSeats(options.seats, options.seed);

    // Record initial frame
    this.recorder.recordInitialFrame(this.engine.state, options.seed, options.numPlayers);
  }

  /**
   * Initialize any agents that need async setup (e.g. loading ONNX models).
   * Deduplicates identical ONNX adapters so the model is fetched at most once.
   */
  async init(): Promise<void> {
    const seen = new Set<Agent>();
    for (const agent of this.agents) {
      if (!agent || seen.has(agent) || !agent.init) continue;
      seen.add(agent);
      await agent.init();
    }
  }

  /**
   * Get legal actions for the current player (should be human).
   */
  getLegalActions(): Action[] {
    return this.engine.getLegalActions();
  }

  /**
   * Execute a human action by index into the legal actions list.
   * Returns the recorded GameFrame after the action.
   */
  async humanAction(actionIndex: number): Promise<GameFrame> {
    const legalActions = this.engine.getLegalActions();
    if (actionIndex < 0 || actionIndex >= legalActions.length) {
      throw new Error(
        `Invalid action index ${actionIndex}, legal range [0, ${legalActions.length})`,
      );
    }

    const action = legalActions[actionIndex];
    const actionDesc = describeAction(action, this.engine.state);
    const stepResult = this.engine.step(action);

    const frame = this.recorder.recordActionFrame(
      this.engine.state,
      actionDesc,
      stepResult,
    );

    return frame;
  }

  /**
   * Let AI agents play until it is the human player's turn or the game ends.
   * Returns all frames generated during AI play.
   */
  async playAiTurns(): Promise<GameFrame[]> {
    const frames: GameFrame[] = [];

    while (
      !this.engine.isDone() &&
      this.engine.getCurrentAgent() !== this.humanPlayer
    ) {
      const currentAgent = this.engine.getCurrentAgent();
      const frame = await this._aiStep(currentAgent);
      frames.push(frame);
    }

    return frames;
  }

  /**
   * Get a snapshot of the current game state as a GameFrame.
   */
  getSnapshot(): GameFrame {
    return GameRecorder.snapshotFrame(this.engine.state);
  }

  isGameOver(): boolean {
    return this.engine.isDone();
  }

  getScores(): number[] {
    return this.engine.getScores();
  }

  // ── Private ──────────────────────────────────────────────────────

  /**
   * Run one AI step for the given player.
   */
  private async _aiStep(playerId: number): Promise<GameFrame> {
    const state = this.engine.state;
    const legalActions = this.engine.getLegalActions();

    this.actionEncoder.update(legalActions);
    const ctx: AgentContext = {
      state,
      player: playerId,
      legalActions,
    };
    if (this.needsObs) {
      ctx.observation = encodeObservation(state, playerId);
      ctx.actionMask = this.actionEncoder.encodeMask();
    }

    const agent = this.agents[playerId];
    if (!agent) {
      throw new Error(`No agent for non-human seat ${playerId}`);
    }

    const actionIdx = await agent.getAction(ctx);
    const action = legalActions[actionIdx];
    if (!action) {
      throw new Error(
        `Agent for seat ${playerId} returned invalid index ${actionIdx}`,
      );
    }

    const actionDesc = describeAction(action, state);
    const stepResult = this.engine.step(action);

    return this.recorder.recordActionFrame(
      this.engine.state,
      actionDesc,
      stepResult,
    );
  }
}
