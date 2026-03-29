import { useState } from 'react';
import type { MarketSummary } from '../game/GameRecorder';

interface MarketPanelProps {
  market: MarketSummary;
}

export function MarketPanel({ market }: MarketPanelProps) {
  const [showPools, setShowPools] = useState(false);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Market</h3>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span className="rounded bg-gray-700 px-1.5 py-0.5">
            Talent: {market.talentDeckSize}
          </span>
          <span className="rounded bg-gray-700 px-1.5 py-0.5">
            Seed: {market.seedDeckSize}
          </span>
          <span className="rounded bg-gray-700 px-1.5 py-0.5">
            Growth: {market.growthDeckSize}
          </span>
          <span className="rounded bg-gray-700 px-1.5 py-0.5">
            Strategy: {market.strategyDeckSize}
          </span>
        </div>
      </div>

      {/* Agency Row */}
      <div className="mb-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Agency ({market.agency.length})
        </div>
        <div className="flex gap-1.5">
          {market.agency.length > 0 ? (
            market.agency.map((name, i) => (
              <div
                key={i}
                className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200"
              >
                {name}
              </div>
            ))
          ) : (
            <span className="text-[10px] italic text-gray-600">Empty</span>
          )}
        </div>
      </div>

      {/* Product Market */}
      <div className="flex gap-4">
        {/* Seed */}
        <div className="flex-1">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Seed Market
          </div>
          <div className="flex flex-wrap gap-1.5">
            {market.seedMarket.length > 0 ? (
              market.seedMarket.map((name, i) => (
                <div
                  key={i}
                  className="rounded border border-green-800 bg-green-900/30 px-2 py-1 text-xs text-green-300"
                >
                  {name}
                </div>
              ))
            ) : (
              <span className="text-[10px] italic text-gray-600">Empty</span>
            )}
          </div>
        </div>

        {/* Growth */}
        <div className="flex-1">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Growth Market
          </div>
          <div className="flex flex-wrap gap-1.5">
            {market.growthMarket.length > 0 ? (
              market.growthMarket.map((name, i) => (
                <div
                  key={i}
                  className="rounded border border-blue-800 bg-blue-900/30 px-2 py-1 text-xs text-blue-300"
                >
                  {name}
                </div>
              ))
            ) : (
              <span className="text-[10px] italic text-gray-600">Empty</span>
            )}
          </div>
        </div>
      </div>

      {/* Open Pools (collapsed) */}
      <div className="mt-2 border-t border-gray-700 pt-2">
        <button
          onClick={() => setShowPools(!showPools)}
          className="text-[10px] text-gray-500 underline hover:text-gray-300"
        >
          {showPools ? 'Hide' : 'Show'} Open Pools
        </button>
        {showPools && (
          <div className="mt-1 flex gap-4">
            <div>
              <div className="text-[10px] font-semibold text-gray-500">Open Jobs ({market.openJobs.length})</div>
              <div className="flex flex-wrap gap-1">
                {market.openJobs.map((name, i) => (
                  <span key={i} className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
                    {name}
                  </span>
                ))}
                {market.openJobs.length === 0 && (
                  <span className="text-[10px] italic text-gray-600">Empty</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-500">Idea Pool ({market.ideaPool.length})</div>
              <div className="flex flex-wrap gap-1">
                {market.ideaPool.map((name, i) => (
                  <span key={i} className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
                    {name}
                  </span>
                ))}
                {market.ideaPool.length === 0 && (
                  <span className="text-[10px] italic text-gray-600">Empty</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
