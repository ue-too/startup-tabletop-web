import type { ProductSummary } from '../game/GameRecorder';
import { TalentCard } from './TalentCard';

const TIER_LABELS: Record<number, string> = { 1: 'T1', 2: 'T2', 3: 'T3' };
const TIER_COLORS: Record<number, string> = {
  1: 'bg-green-700 text-green-100',
  2: 'bg-blue-700 text-blue-100',
  3: 'bg-purple-700 text-purple-100',
};

interface ProductCardProps {
  product: ProductSummary;
  zone: 'dev' | 'ops';
}

export function ProductCard({ product, zone }: ProductCardProps) {
  const tierLabel = TIER_LABELS[product.tier] ?? `T${product.tier}`;
  const tierColor = TIER_COLORS[product.tier] ?? 'bg-gray-600 text-gray-200';

  const swPct = Math.min(100, product.progressSw * 100);
  const hwPct = Math.min(100, product.progressHw * 100);

  return (
    <div className={`rounded border bg-gray-800 p-2 ${
      product.isFaceDown ? 'border-gray-600 opacity-60' : 'border-gray-600'
    }`}>
      {/* Header */}
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${tierColor}`}>
            {tierLabel}
          </span>
          <span className="text-xs font-semibold text-white">
            {product.isFaceDown ? '???' : product.name}
          </span>
          {product.integrated && (
            <span className="text-[10px] text-indigo-400">+INT</span>
          )}
        </div>
        {product.isFaceDown && (
          <span className="text-[10px] italic text-gray-500">Stealth</span>
        )}
      </div>

      {/* Progress bars (dev only) */}
      {zone === 'dev' && !product.isFaceDown && (
        <div className="mb-1.5 space-y-1">
          {product.costSw > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-6 text-[10px] text-blue-400">SW</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${swPct}%` }}
                />
              </div>
              <span className="w-8 text-right text-[10px] font-mono text-gray-400">
                {Math.round(swPct)}%
              </span>
            </div>
          )}
          {product.costHw > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-6 text-[10px] text-red-400">HW</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-full rounded-full bg-red-500 transition-all"
                  style={{ width: `${hwPct}%` }}
                />
              </div>
              <span className="w-8 text-right text-[10px] font-mono text-gray-400">
                {Math.round(hwPct)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tokens */}
      {(product.bugs > 0 || product.hype > 0 || product.scandal > 0) && (
        <div className="mb-1 flex items-center gap-2">
          {product.bugs > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-400">
              {Array.from({ length: product.bugs }, (_, i) => (
                <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
              ))}
              <span className="ml-0.5">bugs</span>
            </span>
          )}
          {product.hype > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-green-400">
              {Array.from({ length: product.hype }, (_, i) => (
                <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
              ))}
              <span className="ml-0.5">hype</span>
            </span>
          )}
          {product.scandal > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-300">
              {Array.from({ length: product.scandal }, (_, i) => (
                <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-red-300" />
              ))}
              <span className="ml-0.5">scandal</span>
            </span>
          )}
        </div>
      )}

      {/* Team */}
      {product.team.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-0.5">
          {product.team.map((name, i) => (
            <TalentCard key={i} name={name} compact />
          ))}
        </div>
      )}

      {/* Revenue (ops only) */}
      {zone === 'ops' && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400">Revenue</span>
          <span className="text-xs font-bold text-green-400">${product.revenue}</span>
        </div>
      )}

      {/* Online status */}
      {zone === 'ops' && !product.isOnline && (
        <span className="text-[10px] font-medium text-red-400">OFFLINE</span>
      )}
    </div>
  );
}
