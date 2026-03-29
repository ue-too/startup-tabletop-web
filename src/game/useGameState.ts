/**
 * React hook for managing game state across play, simulate, and replay modes.
 */

import { useState, useCallback, useRef } from "react";
import type { CardRegistry } from "../engine/cardRegistry";
import type { Action } from "../engine/actions/base";
import { GameController, type GameControllerOptions } from "./GameController";
import { SimController, type SimControllerOptions } from "./SimController";
import { GameRecorder, type GameFrame } from "./GameRecorder";

export type AppMode = "menu" | "play" | "simulate" | "replay";

const DEFAULT_SIM_SPEED = 100; // ms between steps

export interface UseGameStateReturn {
  // Current mode
  mode: AppMode;

  // Current displayed frame
  currentFrame: GameFrame | null;

  // All recorded frames (for replay scrubbing)
  frames: GameFrame[];

  // Legal actions for the human player (play mode only)
  actions: Action[];

  // Mode transitions
  startGame: (options: GameControllerOptions, registry: CardRegistry) => Promise<void>;
  startSimulation: (options: SimControllerOptions, registry: CardRegistry) => Promise<void>;
  loadReplay: (json: string) => void;
  returnToMenu: () => void;

  // Play mode actions
  humanAction: (actionIndex: number) => Promise<void>;

  // Simulate mode controls
  stepSim: () => Promise<void>;
  playSim: () => void;
  pauseSim: () => void;
  simSpeed: number;
  setSimSpeed: (speed: number) => void;
  isSimRunning: boolean;

  // Replay mode controls
  replayIndex: number;
  setReplayIndex: (index: number) => void;

  // Status
  isLoading: boolean;
  error: string | null;
}

export function useGameState(): UseGameStateReturn {
  const [mode, setMode] = useState<AppMode>("menu");
  const [currentFrame, setCurrentFrame] = useState<GameFrame | null>(null);
  const [frames, setFrames] = useState<GameFrame[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replayIndex, setReplayIndexState] = useState(0);
  const [simSpeed, setSimSpeed] = useState(DEFAULT_SIM_SPEED);
  const [isSimRunning, setIsSimRunning] = useState(false);

  // Controllers held as refs to avoid re-renders on internal mutation
  const gameControllerRef = useRef<GameController | null>(null);
  const simControllerRef = useRef<SimController | null>(null);
  const replayRecorderRef = useRef<GameRecorder | null>(null);
  const simIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────

  const clearControllers = useCallback(() => {
    gameControllerRef.current = null;
    simControllerRef.current = null;
    replayRecorderRef.current = null;
    if (simIntervalRef.current !== null) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    setIsSimRunning(false);
  }, []);

  /**
   * After an action in play mode, refresh the displayed frame and legal actions.
   * If it's the AI's turn, run AI turns first.
   */
  const refreshPlayState = useCallback(async () => {
    const ctrl = gameControllerRef.current;
    if (!ctrl) return;

    // If it's not the human's turn, run AI turns
    if (!ctrl.isGameOver()) {
      const aiFrames = await ctrl.playAiTurns();
      // Update frames list
      if (aiFrames.length > 0) {
        setFrames(ctrl.recorder.getFrames().slice());
      }
    }

    // Show the latest snapshot
    const snapshot = ctrl.getSnapshot();
    setCurrentFrame(snapshot);

    // Update legal actions (only meaningful if it's the human's turn and game is alive)
    if (!ctrl.isGameOver()) {
      setActions(ctrl.getLegalActions());
    } else {
      setActions([]);
    }

    setFrames(ctrl.recorder.getFrames().slice());
  }, []);

  // ── Mode transitions ────────────────────────────────────────────

  const startGame = useCallback(
    async (options: GameControllerOptions, registry: CardRegistry) => {
      setIsLoading(true);
      setError(null);
      clearControllers();

      try {
        const ctrl = new GameController(options, registry);
        await ctrl.init();
        gameControllerRef.current = ctrl;

        setMode("play");
        setFrames(ctrl.recorder.getFrames().slice());

        // If AI goes first, run AI turns
        await refreshPlayState();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to start game: ${msg}`);
      } finally {
        setIsLoading(false);
      }
    },
    [clearControllers, refreshPlayState],
  );

  const startSimulation = useCallback(
    async (options: SimControllerOptions, registry: CardRegistry) => {
      setIsLoading(true);
      setError(null);
      clearControllers();

      try {
        const ctrl = new SimController(options, registry);
        await ctrl.init();
        simControllerRef.current = ctrl;

        setMode("simulate");
        const snapshot = ctrl.getSnapshot();
        setCurrentFrame(snapshot);
        setFrames(ctrl.recorder.getFrames().slice());
        setActions([]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to start simulation: ${msg}`);
      } finally {
        setIsLoading(false);
      }
    },
    [clearControllers],
  );

  const loadReplay = useCallback(
    (json: string) => {
      setError(null);
      clearControllers();

      try {
        const recorder = GameRecorder.fromJSON(json);
        const allFrames = recorder.getFrames();
        if (allFrames.length === 0) {
          throw new Error("Replay file contains no frames");
        }

        replayRecorderRef.current = recorder;
        setMode("replay");
        setFrames(allFrames);
        setReplayIndexState(0);
        setCurrentFrame(allFrames[0]);
        setActions([]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to load replay: ${msg}`);
      }
    },
    [clearControllers],
  );

  const returnToMenu = useCallback(() => {
    clearControllers();
    setMode("menu");
    setCurrentFrame(null);
    setFrames([]);
    setActions([]);
    setError(null);
    setReplayIndexState(0);
  }, [clearControllers]);

  // ── Play mode ───────────────────────────────────────────────────

  const humanAction = useCallback(
    async (actionIndex: number) => {
      const ctrl = gameControllerRef.current;
      if (!ctrl || ctrl.isGameOver()) return;

      setError(null);
      try {
        await ctrl.humanAction(actionIndex);
        await refreshPlayState();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Action failed: ${msg}`);
      }
    },
    [refreshPlayState],
  );

  // ── Simulate mode ───────────────────────────────────────────────

  const stepSim = useCallback(async () => {
    const ctrl = simControllerRef.current;
    if (!ctrl || ctrl.isGameOver()) return;

    setError(null);
    try {
      const frame = await ctrl.stepOne();
      setCurrentFrame(frame);
      setFrames(ctrl.recorder.getFrames().slice());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Simulation step failed: ${msg}`);
    }
  }, []);

  const playSim = useCallback(() => {
    const ctrl = simControllerRef.current;
    if (!ctrl || ctrl.isGameOver()) return;

    // Prevent double-starting
    if (simIntervalRef.current !== null) return;

    setIsSimRunning(true);

    const tick = async () => {
      const c = simControllerRef.current;
      if (!c || c.isGameOver()) {
        if (simIntervalRef.current !== null) {
          clearInterval(simIntervalRef.current);
          simIntervalRef.current = null;
        }
        setIsSimRunning(false);
        return;
      }

      try {
        const frame = await c.stepOne();
        setCurrentFrame(frame);
        setFrames(c.recorder.getFrames().slice());

        if (c.isGameOver()) {
          if (simIntervalRef.current !== null) {
            clearInterval(simIntervalRef.current);
            simIntervalRef.current = null;
          }
          setIsSimRunning(false);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Simulation error: ${msg}`);
        if (simIntervalRef.current !== null) {
          clearInterval(simIntervalRef.current);
          simIntervalRef.current = null;
        }
        setIsSimRunning(false);
      }
    };

    simIntervalRef.current = setInterval(tick, simSpeed);
  }, [simSpeed]);

  const pauseSim = useCallback(() => {
    if (simIntervalRef.current !== null) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    setIsSimRunning(false);
  }, []);

  // ── Replay mode ─────────────────────────────────────────────────

  const setReplayIndex = useCallback(
    (index: number) => {
      const allFrames = replayRecorderRef.current?.getFrames() ?? frames;
      const clamped = Math.max(0, Math.min(index, allFrames.length - 1));
      setReplayIndexState(clamped);
      if (allFrames[clamped]) {
        setCurrentFrame(allFrames[clamped]);
      }
    },
    [frames],
  );

  // ── Return ──────────────────────────────────────────────────────

  return {
    mode,
    currentFrame,
    frames,
    actions,

    startGame,
    startSimulation,
    loadReplay,
    returnToMenu,

    humanAction,

    stepSim,
    playSim,
    pauseSim,
    simSpeed,
    setSimSpeed,
    isSimRunning,

    replayIndex,
    setReplayIndex,

    isLoading,
    error,
  };
}
