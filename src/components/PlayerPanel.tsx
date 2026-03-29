import type { PlayerSummary } from '../game/GameRecorder';
import { ProductCard } from './ProductCard';

const PLAYER_COLORS = [
  { border: 'border-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-400', badge: 'bg-cyan-600' },
  { border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400', badge: 'bg-amber-600' },
  { border: 'border-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400', badge: 'bg-emerald-600' },
  { border: 'border-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', badge: 'bg-purple-600' },
];

interface PlayerPanelProps {
  player: PlayerSummary;
  isActive: boolean;
  isHuman?: boolean;
  playerIndex: number;
}

export function PlayerPanel({ player, isActive, isHuman, playerIndex }: PlayerPanelProps) {
  const colors = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];

  return (
    <div
      className={`rounded-lg border-2 ${isActive ? colors.border : 'border-gray-700'} ${
        isActive ? colors.bg : 'bg-gray-800'
      } p-3 transition-colors`}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-bold text-white ${colors.badge}`}>
            P{playerIndex + 1}
          </span>
          {isHuman && (
            <span className="rounded bg-gray-600 px-1.5 py-0.5 text-[10px] font-medium text-gray-300">
              YOU
            </span>
          )}
          {isActive && (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono text-green-400">${player.cash}</span>
          <span className="font-mono text-yellow-400">AP {player.ap}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400">
        <span>Equity: <span className="font-mono text-gray-200">{player.equityOwn}</span></span>
        <span>Bench: <span className="font-mono text-gray-200">{player.bench.length}</span></span>
        <span>Backlog: <span className="font-mono text-gray-200">{player.backlogCount}</span></span>
        <span>Rev: <span className="font-mono text-green-300">${player.totalRevenue}</span></span>
        <span>Salary: <span className="font-mono text-red-300">${player.salaryCost}</span></span>
        {player.strategyHand.length > 0 && (
          <span>Strats: <span className="font-mono text-gray-200">{player.strategyHand.length}</span></span>
        )}
      </div>

      {/* Bench names (compact) */}
      {player.bench.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Bench ({player.bench.length})
          </div>
          <div className="flex flex-wrap gap-0.5">
            {player.bench.map((name, i) => (
              <span key={i} className="inline-block rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* DEV section */}
      {player.devProducts.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Development
          </div>
          <div className="space-y-1">
            {player.devProducts.map((p, i) => (
              <ProductCard key={i} product={p} zone="dev" />
            ))}
          </div>
        </div>
      )}

      {/* OPS section */}
      {player.opsProducts.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Operations
          </div>
          <div className="space-y-1">
            {player.opsProducts.map((p, i) => (
              <ProductCard key={i} product={p} zone="ops" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {player.devProducts.length === 0 && player.opsProducts.length === 0 && (
        <p className="text-center text-[10px] italic text-gray-600">No products</p>
      )}
    </div>
  );
}
