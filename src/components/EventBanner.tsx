interface EventBannerProps {
  eventName: string;
  turn: number;
  phase: string;
  growthDeckSize: number;
}

export function EventBanner({ eventName, turn, phase, growthDeckSize }: EventBannerProps) {
  return (
    <div className="flex items-center justify-between rounded-t-lg bg-gradient-to-r from-indigo-800 to-purple-800 px-4 py-2 text-white shadow-md">
      <div className="flex items-center gap-3">
        <span className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider">
          Turn {turn}
        </span>
        <span className="rounded bg-purple-600 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
          {phase}
        </span>
      </div>
      <div className="text-sm font-semibold">
        {eventName || 'No Event'}
      </div>
      <div className="flex items-center gap-1 text-xs text-purple-200">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
        Growth Deck: {growthDeckSize}
      </div>
    </div>
  );
}
