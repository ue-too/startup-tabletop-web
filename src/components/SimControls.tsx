interface SimControlsProps {
  isPlaying: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onSpeedChange: (speed: number) => void;
}

export function SimControls({
  isPlaying,
  speed,
  onPlay,
  onPause,
  onStep,
  onSpeedChange,
}: SimControlsProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2">
      <button
        onClick={isPlaying ? onPause : onPlay}
        className={`rounded px-4 py-1.5 text-sm font-semibold transition-colors ${
          isPlaying
            ? 'bg-amber-600 text-white hover:bg-amber-500'
            : 'bg-green-600 text-white hover:bg-green-500'
        }`}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      <button
        onClick={onStep}
        disabled={isPlaying}
        className="rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Step
      </button>

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400">Speed</label>
        <input
          type="range"
          min={0.5}
          max={10}
          step={0.5}
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-gray-600 accent-indigo-500"
        />
        <span className="w-10 text-right text-xs font-mono text-gray-300">
          {speed}x
        </span>
      </div>
    </div>
  );
}
