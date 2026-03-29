import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Upload, Film } from 'lucide-react';
import { useGameState } from '../game/useGameState';
import { GameBoard } from '../components/GameBoard';

export default function ReplayPage() {
  const navigate = useNavigate();
  const game = useGameState();

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        game.loadReplay(text);
      } catch {
        // error handled by useGameState
      }
    },
    [game],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  // Keyboard navigation
  useEffect(() => {
    if (game.mode !== 'replay') return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        game.setReplayIndex(game.replayIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        game.setReplayIndex(game.replayIndex + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        game.setReplayIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        game.setReplayIndex(game.frames.length - 1);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [game, game.mode, game.replayIndex]);

  const isLoaded = game.mode === 'replay' && game.currentFrame != null;

  // Upload screen
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <button
            onClick={() => navigate('/')}
            className="mb-8 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <ArrowLeft size={16} />
            Back to Menu
          </button>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 transition-all ${
              isDragging
                ? 'border-purple-400 bg-purple-950/30'
                : 'border-gray-700 bg-gray-900/50 hover:border-purple-500/50 hover:bg-gray-900/80'
            }`}
          >
            <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-xl transition-colors ${
              isDragging ? 'bg-purple-800/50 text-purple-300' : 'bg-gray-800 text-gray-400 group-hover:text-purple-400'
            }`}>
              {isDragging ? <Upload size={28} /> : <Film size={28} />}
            </div>

            <h3 className="mb-2 text-lg font-semibold text-white">
              {isDragging ? 'Drop to load replay' : 'Load Replay File'}
            </h3>

            <p className="mb-4 text-center text-sm text-gray-500">
              Drag and drop a replay JSON file here, or click to browse
            </p>

            <span className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-medium text-gray-400 transition-colors group-hover:bg-gray-700 group-hover:text-white">
              Choose File
            </span>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Error */}
          {game.error && (
            <div className="mt-4 rounded-lg border border-red-800 bg-red-950/50 p-4 text-center">
              <p className="text-sm text-red-300">{game.error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Replay viewer
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
        <span className="text-sm font-semibold text-purple-400">Replay Viewer</span>
        {game.currentFrame && (
          <span className="text-xs text-gray-500">
            Turn {game.currentFrame.turn} &middot; {game.currentFrame.phase}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-500">
          Frame {game.replayIndex + 1} / {game.frames.length}
        </span>
      </header>

      {/* Game board */}
      <div className="flex-1 overflow-auto p-2">
        {game.currentFrame && (
          <GameBoard
            frame={game.currentFrame}
            mode="replay"
            totalFrames={game.frames.length}
            onPrev={() => game.setReplayIndex(game.replayIndex - 1)}
            onNext={() => game.setReplayIndex(game.replayIndex + 1)}
            onJumpTo={game.setReplayIndex}
            onJumpToTurn={(turn: number) => {
              const idx = game.frames.findIndex((f) => f.turn === turn);
              if (idx >= 0) game.setReplayIndex(idx);
            }}
          />
        )}
      </div>
    </div>
  );
}
