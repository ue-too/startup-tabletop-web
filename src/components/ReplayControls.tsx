interface ReplayControlsProps {
  frameIndex: number;
  totalFrames: number;
  onPrev: () => void;
  onNext: () => void;
  onJumpToTurn: (turn: number) => void;
  onJumpTo: (index: number) => void;
}

export function ReplayControls({
  frameIndex,
  totalFrames,
  onPrev,
  onNext,
  onJumpTo,
}: ReplayControlsProps) {
  const atStart = frameIndex <= 0;
  const atEnd = frameIndex >= totalFrames - 1;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2">
      <button
        onClick={onPrev}
        disabled={atStart}
        className="rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Prev
      </button>

      <button
        onClick={onNext}
        disabled={atEnd}
        className="rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>

      <span className="text-xs font-mono text-gray-300">
        Frame {frameIndex + 1}/{totalFrames}
      </span>

      <input
        type="range"
        min={0}
        max={Math.max(totalFrames - 1, 0)}
        value={frameIndex}
        onChange={(e) => onJumpTo(parseInt(e.target.value, 10))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-gray-600 accent-indigo-500"
      />

      <div className="flex items-center gap-1 text-[10px] text-gray-500">
        <kbd className="rounded border border-gray-600 bg-gray-700 px-1">&larr;</kbd>
        <kbd className="rounded border border-gray-600 bg-gray-700 px-1">&rarr;</kbd>
        <span>navigate</span>
      </div>
    </div>
  );
}
