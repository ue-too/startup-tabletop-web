import { useRef, useEffect } from 'react';

interface ActionLogProps {
  actions: string[];
  maxVisible?: number;
}

export function ActionLog({ actions, maxVisible = 8 }: ActionLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visible = actions.slice(-maxVisible);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [actions.length]);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900">
      <div className="border-b border-gray-700 px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Action Log
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-40 overflow-y-auto p-2"
      >
        {visible.length === 0 ? (
          <p className="text-xs italic text-gray-500">No actions yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((action, i) => {
              const isLast = i === visible.length - 1;
              return (
                <li
                  key={actions.length - visible.length + i}
                  className={`rounded px-2 py-0.5 text-xs ${
                    isLast
                      ? 'bg-gray-700 font-medium text-white'
                      : 'text-gray-400'
                  }`}
                >
                  {action}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
