import type { GameFrame } from '../game/GameRecorder';
import type { Action } from '../engine/actions/base';
import { EventBanner } from './EventBanner';
import { PlayerPanel } from './PlayerPanel';
import { MarketPanel } from './MarketPanel';
import { ActionPanel } from './ActionPanel';
import { ActionLog } from './ActionLog';
import { ScoreBoard } from './ScoreBoard';
import { SimControls } from './SimControls';
import { ReplayControls } from './ReplayControls';

interface GameBoardProps {
  frame: GameFrame;
  mode: 'play' | 'simulate' | 'replay';
  // Play mode
  humanPlayer?: number;
  legalActions?: Action[];
  onAction?: (index: number) => void;
  // Simulate mode
  isPlaying?: boolean;
  speed?: number;
  onPlay?: () => void;
  onPause?: () => void;
  onStep?: () => void;
  onSpeedChange?: (speed: number) => void;
  // Replay mode
  totalFrames?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onJumpToTurn?: (turn: number) => void;
  onJumpTo?: (index: number) => void;
}

export function GameBoard({
  frame,
  mode,
  humanPlayer = 0,
  legalActions,
  onAction,
  isPlaying = false,
  speed = 1,
  onPlay,
  onPause,
  onStep,
  onSpeedChange,
  totalFrames = 0,
  onPrev,
  onNext,
  onJumpToTurn,
  onJumpTo,
}: GameBoardProps) {
  const numPlayers = frame.players.length;
  const isHumanTurn = mode === 'play' && frame.currentPlayer === humanPlayer;

  // Build action log from frame data
  const actionLog = frame.action ? [frame.action] : [];

  // Player grid: 2 cols for 2p, 2x2 for 3-4p
  const gridCols = numPlayers <= 2 ? 'grid-cols-2' : 'grid-cols-2';

  return (
    <div className="flex h-full flex-col gap-2 bg-gray-900 p-2">
      {/* Top: Event Banner */}
      <EventBanner
        eventName={frame.activeEvent}
        turn={frame.turn}
        phase={frame.phase}
        growthDeckSize={frame.market.growthDeckSize}
      />

      {/* Middle: Player Panels */}
      <div className={`grid ${gridCols} gap-2`}>
        {frame.players.map((player, i) => (
          <PlayerPanel
            key={i}
            player={player}
            isActive={frame.currentPlayer === i}
            isHuman={mode === 'play' && i === humanPlayer}
            playerIndex={i}
          />
        ))}
      </div>

      {/* Market */}
      <MarketPanel market={frame.market} />

      {/* Action Panel (play mode, human's turn) */}
      {isHumanTurn && legalActions && legalActions.length > 0 && onAction && (
        <ActionPanel actions={legalActions} onAction={onAction} />
      )}

      {/* Action Log */}
      <ActionLog actions={actionLog} />

      {/* Scores (game over) */}
      {frame.scores && frame.scores.length > 0 && (
        <ScoreBoard scores={frame.scores} numPlayers={numPlayers} />
      )}

      {/* Sim Controls */}
      {mode === 'simulate' && onPlay && onPause && onStep && onSpeedChange && (
        <SimControls
          isPlaying={isPlaying}
          speed={speed}
          onPlay={onPlay}
          onPause={onPause}
          onStep={onStep}
          onSpeedChange={onSpeedChange}
        />
      )}

      {/* Replay Controls */}
      {mode === 'replay' && onPrev && onNext && onJumpTo && onJumpToTurn && (
        <ReplayControls
          frameIndex={frame.frameIndex}
          totalFrames={totalFrames}
          onPrev={onPrev}
          onNext={onNext}
          onJumpToTurn={onJumpToTurn}
          onJumpTo={onJumpTo}
        />
      )}
    </div>
  );
}
