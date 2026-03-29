/**
 * GameController: orchestrates a human vs AI game.
 * Human plays as one player; AI agents handle the rest.
 */

import { GameEngine, type StepResult } from "../engine/engine";
import type { CardRegistry } from "../engine/cardRegistry";
import type { Action } from "../engine/actions/base";
import { OnnxAgent } from "../ai/onnxAgent";
import { encodeObservation } from "../ai/observation";
import { ActionEncoder } from "../ai/actionEncoder";
import {
  GameRecorder,
  describeAction,
  type GameFrame,
} from "./GameRecorder";

export type GameMode = "play" | "simulate" | "replay";

export interface GameControllerOptions {
  numPlayers: number;
  seed: number;
  humanPlayer: number; // which player index is human (0-based)
  modelPath: string;
}

export class GameController {
  private engine: GameEngine;
  private agents: OnnxAgent[];
  private actionEncoder: ActionEncoder;
  private humanPlayer: number;
  private modelPath: string;
  private numPlayers: number;
  private seed: number;

  recorder: GameRecorder;

  constructor(options: GameControllerOptions, registry: CardRegistry) {
    this.numPlayers = options.numPlayers;
    this.seed = options.seed;
    this.humanPlayer = options.humanPlayer;
    this.modelPath = options.modelPath;

    this.engine = new GameEngine(options.numPlayers, options.seed, registry);
    this.actionEncoder = new ActionEncoder();
    this.recorder = new GameRecorder();

    // Create one OnnxAgent per AI player (share the same model)
    this.agents = [];
    for (let i = 0; i < options.numPlayers; i++) {
      if (i !== options.humanPlayer) {
        this.agents.push(new OnnxAgent());
      }
    }

    // Record initial frame
    this.recorder.recordInitialFrame(this.engine.state, options.seed, options.numPlayers);
  }

  /**
   * Load the ONNX model for all AI agents.
   */
  async init(): Promise<void> {
    for (const agent of this.agents) {
      await agent.load(this.modelPath);
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

    // Encode observation and action mask
    const obs = encodeObservation(state, playerId);
    this.actionEncoder.update(legalActions);
    const mask = this.actionEncoder.encodeMask();

    // Find the agent for this player (agents array skips human)
    const agentIndex = playerId < this.humanPlayer ? playerId : playerId - 1;
    const agent = this.agents[agentIndex];

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
}
