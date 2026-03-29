/**
 * SimController: orchestrates an all-AI simulation game.
 * No human player -- all agents use ONNX inference.
 */

import { GameEngine } from "../engine/engine";
import type { CardRegistry } from "../engine/cardRegistry";
import { OnnxAgent } from "../ai/onnxAgent";
import { encodeObservation } from "../ai/observation";
import { ActionEncoder } from "../ai/actionEncoder";
import {
  GameRecorder,
  describeAction,
  type GameFrame,
} from "./GameRecorder";

export interface SimControllerOptions {
  numPlayers: number;
  seed: number;
  modelPath: string;
}

export class SimController {
  private engine: GameEngine;
  private agents: OnnxAgent[];
  private actionEncoder: ActionEncoder;
  private modelPath: string;
  private numPlayers: number;
  private seed: number;

  recorder: GameRecorder;

  constructor(options: SimControllerOptions, registry: CardRegistry) {
    this.numPlayers = options.numPlayers;
    this.seed = options.seed;
    this.modelPath = options.modelPath;

    this.engine = new GameEngine(options.numPlayers, options.seed, registry);
    this.actionEncoder = new ActionEncoder();
    this.recorder = new GameRecorder();

    // One OnnxAgent per player (all AI)
    this.agents = [];
    for (let i = 0; i < options.numPlayers; i++) {
      this.agents.push(new OnnxAgent());
    }

    // Record initial frame
    this.recorder.recordInitialFrame(this.engine.state, options.seed, options.numPlayers);
  }

  /**
   * Load the ONNX model for all agents.
   */
  async init(): Promise<void> {
    // Load once and share -- OnnxAgent instances each hold a session,
    // but we load the same model path for all of them.
    for (const agent of this.agents) {
      await agent.load(this.modelPath);
    }
  }

  /**
   * Step one action: the current agent picks and executes an action.
   * Returns the recorded GameFrame.
   */
  async stepOne(): Promise<GameFrame> {
    if (this.engine.isDone()) {
      return GameRecorder.snapshotFrame(this.engine.state, "Game Over", "");
    }

    const state = this.engine.state;
    const currentPlayer = this.engine.getCurrentAgent();
    const legalActions = this.engine.getLegalActions();

    // Encode observation and mask
    const obs = encodeObservation(state, currentPlayer);
    this.actionEncoder.update(legalActions);
    const mask = this.actionEncoder.encodeMask();

    const agent = this.agents[currentPlayer];
    const actionIdx = await agent.getAction(obs, mask);
    const action = this.actionEncoder.decode(actionIdx);

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
   * Returns all frames generated.
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
   * Returns all frames generated.
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
}
