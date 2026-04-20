/**
 * SimController: orchestrates an all-AI simulation game.
 * No human player -- all agents come from per-seat config.
 */

import { GameEngine } from "../engine/engine";
import type { CardRegistry } from "../engine/cardRegistry";
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
  seatsNeedNeuralFeatures,
  type SeatConfig,
} from "./seat";

export interface SimControllerOptions {
  numPlayers: number;
  seed: number;
  /** Per-seat agent config; must be length === numPlayers and contain no human seats. */
  seats: SeatConfig[];
}

export class SimController {
  private engine: GameEngine;
  private agents: (Agent | null)[];
  private actionEncoder: ActionEncoder;
  private needsObs: boolean;

  recorder: GameRecorder;

  constructor(options: SimControllerOptions, registry: CardRegistry) {
    if (options.seats.length !== options.numPlayers) {
      throw new Error(
        `seats.length (${options.seats.length}) must equal numPlayers (${options.numPlayers})`,
      );
    }
    if (options.seats.some((s) => s.kind === "human")) {
      throw new Error("SimController does not support human seats");
    }
    this.needsObs = seatsNeedNeuralFeatures(options.seats);

    this.engine = new GameEngine(options.numPlayers, options.seed, registry);
    this.actionEncoder = new ActionEncoder();
    this.recorder = new GameRecorder();

    this.agents = buildAgentsForSeats(options.seats, options.seed);

    // Record initial frame
    this.recorder.recordInitialFrame(this.engine.state, options.seed, options.numPlayers);
  }

  /**
   * Initialize any agents that need async setup, deduping across seats.
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
   * Step one action: the current agent picks and executes an action.
   */
  async stepOne(): Promise<GameFrame> {
    if (this.engine.isDone()) {
      return GameRecorder.snapshotFrame(this.engine.state, "Game Over", "");
    }

    const state = this.engine.state;
    const currentPlayer = this.engine.getCurrentAgent();
    const legalActions = this.engine.getLegalActions();

    this.actionEncoder.update(legalActions);
    const ctx: AgentContext = {
      state,
      player: currentPlayer,
      legalActions,
    };
    if (this.needsObs) {
      ctx.observation = encodeObservation(state, currentPlayer);
      ctx.actionMask = this.actionEncoder.encodeMask();
    }

    const agent = this.agents[currentPlayer];
    if (!agent) {
      throw new Error(`No agent for seat ${currentPlayer}`);
    }
    const actionIdx = await agent.getAction(ctx);
    const action = legalActions[actionIdx];
    if (!action) {
      throw new Error(
        `Agent for seat ${currentPlayer} returned invalid index ${actionIdx}`,
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

  /**
   * Run N steps (or until game over, whichever comes first).
   */
  async stepN(n: number): Promise<GameFrame[]> {
    const frames: GameFrame[] = [];
    for (let i = 0; i < n; i++) {
      if (this.engine.isDone()) break;
      const frame = await this.stepOne();
      frames.push(frame);
    }
    return frames;
  }

  /**
   * Run the simulation to completion (max 10000 steps as safety limit).
   */
  async runToEnd(): Promise<GameFrame[]> {
    const MAX_STEPS = 10000;
    const frames: GameFrame[] = [];
    let steps = 0;

    while (!this.engine.isDone() && steps < MAX_STEPS) {
      const frame = await this.stepOne();
      frames.push(frame);
      steps++;
    }

    if (steps >= MAX_STEPS && !this.engine.isDone()) {
      console.warn(`SimController: hit safety limit of ${MAX_STEPS} steps without game over.`);
    }

    return frames;
  }

  isGameOver(): boolean {
    return this.engine.isDone();
  }

  getSnapshot(): GameFrame {
    return GameRecorder.snapshotFrame(this.engine.state);
  }

  getScores(): number[] {
    return this.engine.getScores();
  }
}
