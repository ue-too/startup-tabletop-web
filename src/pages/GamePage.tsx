import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Loader2, Play } from 'lucide-react';
import { useGameState } from '../game/useGameState';
import { getRegistry } from '../engine/cardRegistry';
import { GameBoard } from '../components/GameBoard';
import { OpponentPicker } from '../components/OpponentPicker';
import type { SeatConfig } from '../game/seat';

const MODEL_PATH = '/models/ai_model.onnx';

export default function GamePage() {
  const navigate = useNavigate();
  const game = useGameState();
  const [seed, setSeed] = useState<string>('');
  const [opponent, setOpponent] = useState<SeatConfig>({
    kind: 'utilityBt',
    persona: 'balanced',
  });
  const [started, setStarted] = useState(false);

  const handleStart = useCallback(async () => {
    const seedVal = seed ? parseInt(seed, 10) : Math.floor(Math.random() * 999999);
    const registry = await getRegistry();
    const seats: SeatConfig[] = [{ kind: 'human' }, opponent];
    await game.startGame(
      { numPlayers: seats.length, seed: seedVal, seats },
      registry,
    );
    setStarted(true);
  }, [seed, opponent, game]);

  const isGameOver = game.currentFrame?.scores != null && game.currentFrame.scores.length > 0;

  // Setup screen (before start)
  if (!started && !game.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900/90 p-8 shadow-2xl">
          <h2 className="mb-6 text-center text-2xl font-bold text-white">Play vs AI</h2>

          <div className="mb-5">
            <OpponentPicker
              seatIndex={1}
              value={opponent}
              modelPath={MODEL_PATH}
              onChange={setOpponent}
              label="Opponent"
            />
          </div>

          <div className="mb-8">
            <label className="mb-2 block text-sm font-medium text-gray-400">
              Seed <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="Random"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-cyan-500"
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
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-500"
            >
              <Play size={16} />
              Start Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (game.isLoading || (!game.currentFrame && !game.error)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
        <p className="text-sm text-gray-400">Initializing game...</p>
      </div>
    );
  }

  // Error state
  if (game.error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="max-w-md rounded-lg border border-red-800 bg-red-950/50 p-6 text-center">
          <h2 className="mb-2 text-lg font-bold text-red-400">Error</h2>
          <p className="mb-4 text-sm text-red-300">{game.error}</p>
          <button
            onClick={() => navigate('/')}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600"
          >
            Return to Menu
          </button>
        </div>
      </div>
    );
  }

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
        <span className="text-sm font-semibold text-cyan-400">Play vs AI</span>
        {game.currentFrame && (
          <span className="ml-auto text-xs text-gray-500">
            Turn {game.currentFrame.turn} &middot; {game.currentFrame.phase}
          </span>
        )}
      </header>

      {/* Game board */}
      <div className="flex-1 overflow-auto p-2">
        {game.currentFrame && (
          <GameBoard
            frame={game.currentFrame}
            mode="play"
            humanPlayer={0}
            legalActions={game.actions}
            onAction={game.humanAction}
          />
        )}
      </div>

      {/* Game over overlay */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-8 shadow-2xl">
            <h2 className="mb-6 text-center text-2xl font-bold text-white">Game Over</h2>

            {/* Scores */}
            <div className="mb-8 space-y-3">
              {game.currentFrame!.scores!.map((score, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                    i === 0 ? 'border border-cyan-700/50 bg-cyan-950/30' : 'bg-gray-800/50'
                  }`}
                >
                  <span className={`font-medium ${i === 0 ? 'text-cyan-400' : 'text-gray-300'}`}>
                    {i === 0 ? 'You' : `AI Player ${i + 1}`}
                  </span>
                  <span className="font-mono text-lg font-bold text-white">{score}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStarted(false);
                  game.returnToMenu();
                }}
                className="flex-1 rounded-lg bg-cyan-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-500"
              >
                Play Again
              </button>
              <button
                onClick={() => navigate('/')}
                className="flex-1 rounded-lg bg-gray-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-600"
              >
                Return to Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
