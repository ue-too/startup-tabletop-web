import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Loader2, Play, Download, RotateCcw } from 'lucide-react';
import { useGameState } from '../game/useGameState';
import { getRegistry } from '../engine/cardRegistry';
import { GameBoard } from '../components/GameBoard';
import { OpponentPicker } from '../components/OpponentPicker';
import type { SeatConfig } from '../game/seat';

const MODEL_PATH = '/models/ai_model.onnx';
const DEFAULT_AI_SEAT: SeatConfig = { kind: 'utilityBt', persona: 'balanced' };

export default function SimPage() {
  const navigate = useNavigate();
  const game = useGameState();

  // Setup state
  const [numPlayers, setNumPlayers] = useState(2);
  const [seed, setSeed] = useState<string>('');
  const [seats, setSeats] = useState<SeatConfig[]>([DEFAULT_AI_SEAT, DEFAULT_AI_SEAT]);
  const [hasStarted, setHasStarted] = useState(false);

  // Keep seats array length in sync with numPlayers, preserving existing choices.
  useEffect(() => {
    setSeats((prev) => {
      if (prev.length === numPlayers) return prev;
      if (prev.length > numPlayers) return prev.slice(0, numPlayers);
      return [...prev, ...Array(numPlayers - prev.length).fill(DEFAULT_AI_SEAT)];
    });
  }, [numPlayers]);

  const handleStart = useCallback(async () => {
    const seedVal = seed ? parseInt(seed, 10) : Math.floor(Math.random() * 999999);
    const registry = await getRegistry();
    await game.startSimulation(
      { numPlayers, seed: seedVal, seats },
      registry,
    );
    setHasStarted(true);
  }, [seed, numPlayers, seats, game]);

  const handleSaveReplay = useCallback(() => {
    if (game.frames.length === 0) return;
    const data = JSON.stringify({ numFrames: game.frames.length, frames: game.frames }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [game.frames]);

  const handleNewSim = useCallback(() => {
    setHasStarted(false);
    game.returnToMenu();
  }, [game]);

  const isGameOver = game.currentFrame?.scores != null && game.currentFrame.scores.length > 0;

  // Setup screen
  if (!hasStarted && !game.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900/90 p-8 shadow-2xl">
          <h2 className="mb-6 text-center text-2xl font-bold text-white">Simulation Setup</h2>

          {/* Number of Players */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-gray-400">
              Number of Players
            </label>
            <div className="flex gap-2">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setNumPlayers(n)}
                  className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                    numPlayers === n
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {n} Players
                </button>
              ))}
            </div>
          </div>

          {/* Opponents */}
          <div className="mb-6 space-y-2">
            <label className="block text-sm font-medium text-gray-400">
              Opponents
            </label>
            {seats.map((seat, i) => (
              <OpponentPicker
                key={i}
                seatIndex={i}
                value={seat}
                modelPath={MODEL_PATH}
                onChange={(next) =>
                  setSeats((prev) => prev.map((p, j) => (j === i ? next : p)))
                }
                label={`Seat ${i + 1}`}
              />
            ))}
          </div>

          {/* Seed */}
          <div className="mb-8">
            <label className="mb-2 block text-sm font-medium text-gray-400">
              Seed <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="Random"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-amber-500"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/')}
              className="rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Back
            </button>
            <button
              onClick={handleStart}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500"
            >
              <Play size={16} />
              Start Simulation
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (game.isLoading || (!game.currentFrame && !game.error)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
        <p className="text-sm text-gray-400">Loading ONNX model & initializing simulation...</p>
      </div>
    );
  }

  // Error
  if (game.error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="max-w-md rounded-lg border border-red-800 bg-red-950/50 p-6 text-center">
          <h2 className="mb-2 text-lg font-bold text-red-400">Error</h2>
          <p className="mb-4 text-sm text-red-300">{game.error}</p>
          <button
            onClick={handleNewSim}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Simulation view
  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-4 border-b border-gray-800 bg-gray-900/50 px-4 py-2 backdrop-blur-sm">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
        >
          <ArrowLeft size={16} />
          Menu
        </button>
        <div className="h-4 w-px bg-gray-700" />
        <span className="text-sm font-semibold text-amber-400">AI Simulation</span>
        {game.currentFrame && (
          <span className="text-xs text-gray-500">
            Turn {game.currentFrame.turn} &middot; {game.currentFrame.phase}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleSaveReplay}
            disabled={game.frames.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-40"
          >
            <Download size={14} />
            Save Replay
          </button>
        </div>
      </header>

      {/* Game board */}
      <div className="flex-1 overflow-auto p-2">
        {game.currentFrame && (
          <GameBoard
            frame={game.currentFrame}
            mode="simulate"
            isPlaying={game.isSimRunning}
            speed={game.simSpeed}
            onPlay={game.playSim}
            onPause={game.pauseSim}
            onStep={game.stepSim}
            onSpeedChange={game.setSimSpeed}
          />
        )}
      </div>

      {/* Game over overlay */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-8 shadow-2xl">
            <h2 className="mb-6 text-center text-2xl font-bold text-white">Simulation Complete</h2>

            <div className="mb-8 space-y-3">
              {game.currentFrame!.scores!.map((score, i) => {
                const maxScore = Math.max(...game.currentFrame!.scores!);
                const isWinner = score === maxScore;
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                      isWinner ? 'border border-amber-700/50 bg-amber-950/30' : 'bg-gray-800/50'
                    }`}
                  >
                    <span className={`font-medium ${isWinner ? 'text-amber-400' : 'text-gray-300'}`}>
                      AI Player {i + 1}
                      {isWinner && <span className="ml-2 text-xs text-amber-500">WINNER</span>}
                    </span>
                    <span className="font-mono text-lg font-bold text-white">{score}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSaveReplay}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-600"
              >
                <Download size={16} />
                Save Replay
              </button>
              <button
                onClick={handleNewSim}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500"
              >
                <RotateCcw size={16} />
                New Simulation
              </button>
            </div>

            <button
              onClick={() => navigate('/')}
              className="mt-3 w-full rounded-lg py-2 text-sm text-gray-400 transition-colors hover:text-white"
            >
              Return to Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
