/**
 * Game recorder: captures action-by-action snapshots for replay.
 * Port from Python startup_simulator/recorder.py
 */

import { GameState } from "../engine/state";
import { getRegistrySync } from "../engine/cardRegistry";
import { Phase, SubPhase, ActionType, CubeType, Sector, Tag } from "../engine/types";
import type { Action } from "../engine/actions/base";
import type { StepResult } from "../engine/engine";
import { calculateOperationalRevenue, calculateSalaryCost } from "../engine/phases/incomePhase";

// ─── Data interfaces ────────────────────────────────────────────────

export interface ProductSummary {
  name: string;
  tier: number;
  sector: string;
  tag: string;
  progressSw: number;
  progressHw: number;
  costSw: number;
  costHw: number;
  bugs: number;
  hype: number;
  scandal: number;
  isOnline: boolean;
  isFaceDown: boolean;
  isComplete: boolean;
  team: string[];
  revenue: number;
  integrated: boolean;
}

export interface PlayerSummary {
  playerId: number;
  cash: number;
  equityOwn: number;
  equityHeld: Record<number, number>;
  ap: number;
  bench: string[];
  devProducts: ProductSummary[];
  opsProducts: ProductSummary[];
  backlogCount: number;
  strategyHand: string[];
  totalRevenue: number;
  salaryCost: number;
}

export interface MarketSummary {
  agency: string[];
  openJobs: string[];
  seedMarket: string[];
  growthMarket: string[];
  ideaPool: string[];
  seedDeckSize: number;
  growthDeckSize: number;
  talentDeckSize: number;
  strategyDeckSize: number;
}

export interface GameFrame {
  frameIndex: number;
  turn: number;
  phase: string;
  subPhase: string;
  currentPlayer: number;
  action: string;
  result: string;
  activeEvent: string;
  players: PlayerSummary[];
  market: MarketSummary;
  scores: number[] | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function talentName(state: GameState, instanceId: number): string {
  const registry = getRegistrySync();
  const t = state.talentInstances.get(instanceId);
  if (!t) return `Talent#${instanceId}`;
  const tdef = registry.getTalent(t.cardDefId);
  return tdef.name;
}

function productName(state: GameState, instanceId: number): string {
  const registry = getRegistrySync();
  const p = state.productInstances.get(instanceId);
  if (!p) return `Product#${instanceId}`;
  const pdef = registry.getProduct(p.cardDefId);
  return pdef.name;
}

function buildProductSummary(state: GameState, pid: number): ProductSummary {
  const registry = getRegistrySync();
  const prod = state.productInstances.get(pid)!;
  const pdef = registry.getProduct(prod.cardDefId);
  const [swCost, hwCost] = prod.getEffectiveCost(pdef);

  const team = state.getTalentOnProduct(pid);
  const teamNames: string[] = [];
  for (const tid of team) {
    const t = state.talentInstances.get(tid)!;
    const tdef = registry.getTalent(t.cardDefId);
    let label = tdef.name;
    const output = t.getOutput(tdef);
    if (output > 0) label += `(${output})`;
    if (t.onboarding) label += "[onb]";
    teamNames.push(label);
  }

  return {
    name: pdef.name,
    tier: pdef.tier,
    sector: pdef.sector !== null && pdef.sector !== undefined ? Sector[pdef.sector] : "",
    tag: pdef.provides !== null && pdef.provides !== undefined ? Tag[pdef.provides] : "",
    progressSw: swCost > 0 ? prod.cubesSoftware / Math.max(swCost, 1) : 1.0,
    progressHw: hwCost > 0 ? prod.cubesHardware / Math.max(hwCost, 1) : 1.0,
    costSw: swCost,
    costHw: hwCost,
    bugs: prod.bugs,
    hype: prod.hype,
    scandal: prod.scandal,
    isOnline: prod.isOnline,
    isFaceDown: prod.isFaceDown,
    isComplete: prod.isFeatureComplete,
    team: teamNames,
    revenue: pdef.revenue,
    integrated: prod.integratedWith !== null,
  };
}

/**
 * Extract a lightweight snapshot of the current game state.
 */
export function snapshotState(state: GameState): {
  players: PlayerSummary[];
  market: MarketSummary;
} {
  const registry = getRegistrySync();
  const players: PlayerSummary[] = [];

  for (const player of state.players) {
    // Bench talent names with annotations
    const benchNames: string[] = [];
    for (const tid of player.bench) {
      const t = state.talentInstances.get(tid)!;
      const tdef = registry.getTalent(t.cardDefId);
      let label = tdef.name;
      if (t.totalXp > 0) label += ` (XP:${t.totalXp})`;
      if (t.rankBadges > 0) label += " [Lead]";
      benchNames.push(label);
    }

    // Dev & ops products
    const devProds = player.devProducts.map((pid) => buildProductSummary(state, pid));
    const opsProds = player.opsProducts.map((pid) => buildProductSummary(state, pid));

    // Strategy hand
    const stratNames = player.strategyHand.map((cardId) => {
      const sdef = registry.getStrategy(cardId);
      return `${sdef.name} ($${sdef.cost})`;
    });

    const rev = calculateOperationalRevenue(state, player.playerId);
    const sal = calculateSalaryCost(state, player.playerId);

    const equityHeldObj: Record<number, number> = {};
    for (const [k, v] of player.equityHeld) {
      equityHeldObj[k] = v;
    }

    players.push({
      playerId: player.playerId,
      cash: player.cash,
      equityOwn: player.equityTokensOwn,
      equityHeld: equityHeldObj,
      ap: player.actionPoints,
      bench: benchNames,
      devProducts: devProds,
      opsProducts: opsProds,
      backlogCount: player.productBacklog.length,
      strategyHand: stratNames,
      totalRevenue: rev,
      salaryCost: sal,
    });
  }

  // Market snapshot
  const agencyNames = state.markets.agencyRow.map((tid) => {
    const t = state.talentInstances.get(tid)!;
    const tdef = registry.getTalent(t.cardDefId);
    return `${tdef.name} ($${tdef.cost})`;
  });

  const openJobNames = state.markets.openJobMarket.map((tid) => {
    const t = state.talentInstances.get(tid)!;
    const tdef = registry.getTalent(t.cardDefId);
    return tdef.name;
  });

  const seedNames = state.markets.productMarketSeed.map((pid) => {
    const p = state.productInstances.get(pid)!;
    const pdef = registry.getProduct(p.cardDefId);
    return pdef.name;
  });

  const growthNames = state.markets.productMarketGrowth.map((pid) => {
    const p = state.productInstances.get(pid)!;
    const pdef = registry.getProduct(p.cardDefId);
    return pdef.name;
  });

  const poolNames = state.markets.openIdeaPool.map((pid) => {
    const p = state.productInstances.get(pid)!;
    const pdef = registry.getProduct(p.cardDefId);
    return pdef.name;
  });

  const market: MarketSummary = {
    agency: agencyNames,
    openJobs: openJobNames,
    seedMarket: seedNames,
    growthMarket: growthNames,
    ideaPool: poolNames,
    seedDeckSize: state.markets.seedDeck.length,
    growthDeckSize: state.markets.growthDeck.length,
    talentDeckSize: state.markets.talentDeck.length,
    strategyDeckSize: state.markets.strategyDeck.length,
  };

  return { players, market };
}

/**
 * Create a human-readable description of an action.
 */
export function describeAction(action: Action, state: GameState): string {
  const registry = getRegistrySync();
  const atype = action.actionType;
  const pid = state.currentPlayer + 1; // 1-indexed for display

  switch (atype) {
    case ActionType.RECRUIT: {
      const src = action.sourceType;
      if (src === "university_sw") return `P${pid}: Recruit Jr Software from University ($2)`;
      if (src === "university_hw") return `P${pid}: Recruit Jr Hardware from University ($2)`;
      if (src === "agency") {
        const idx = action.sourceIndex;
        if (idx < state.markets.agencyRow.length) {
          const tid = state.markets.agencyRow[idx];
          const t = state.talentInstances.get(tid)!;
          const tdef = registry.getTalent(t.cardDefId);
          return `P${pid}: Recruit ${tdef.name} from Agency ($${tdef.cost})`;
        }
        return `P${pid}: Recruit from Agency`;
      }
      if (src === "open_market") return `P${pid}: Recruit from Open Market ($1)`;
      return `P${pid}: Recruit (${src})`;
    }
    case ActionType.ASSIGN:
      return `P${pid}: ASSIGN batch started`;
    case ActionType.ASSIGN_ONE: {
      const tname = talentName(state, action.targetInstance);
      const pname = productName(state, action.sourceIndex);
      return `P${pid}: Assign ${tname} to ${pname}`;
    }
    case ActionType.END_ASSIGN_BATCH:
      return `P${pid}: End assign batch`;
    case ActionType.RECALL:
      return `P${pid}: RECALL all from Ops to Bench`;
    case ActionType.REASSIGN: {
      const tname = talentName(state, action.targetInstance);
      const pname = productName(state, action.sourceIndex);
      return `P${pid}: Reassign ${tname} to ${pname}`;
    }
    case ActionType.LAYOFF_SOURCE:
      return `P${pid}: Layoff/Source (${action.targetInstances.length} discarded)`;
    case ActionType.IDEATION: {
      const src = action.sourceType;
      if (src === "seed_market" || src === "growth_market") {
        const idx = action.sourceIndex;
        const mkt = src === "seed_market"
          ? state.markets.productMarketSeed
          : state.markets.productMarketGrowth;
        if (idx < mkt.length) {
          const pname = productName(state, mkt[idx]);
          return `P${pid}: Draft ${pname} from ${src === "seed_market" ? "Seed" : "Growth"} Market`;
        }
      }
      if (src === "seed_deck" || src === "growth_deck") {
        return `P${pid}: Draft from ${src === "seed_deck" ? "Seed" : "Growth"} Deck (blind)`;
      }
      if (src === "idea_pool") return `P${pid}: Draft from Idea Pool (2 AP)`;
      return `P${pid}: Ideation (${src})`;
    }
    case ActionType.GREENLIGHT:
      return `P${pid}: Greenlight ${productName(state, action.targetInstance)}`;
    case ActionType.LAUNCH:
      return `P${pid}: LAUNCH ${productName(state, action.targetInstance)}`;
    case ActionType.PIVOT:
      return `P${pid}: Pivot/Scrap ${productName(state, action.targetInstance)}`;
    case ActionType.BRAINSTORM:
      return `P${pid}: Brainstorm (draw strategy cards)`;
    case ActionType.INVEST:
      return `P${pid}: Invest in Player ${action.targetPlayer + 1}`;
    case ActionType.DIVEST:
      return `P${pid}: Divest equity to Player ${action.sourceIndex + 1}`;
    case ActionType.BUYBACK:
      return `P${pid}: Buyback equity from Player ${action.targetPlayer + 1}`;
    case ActionType.ACQUISITION:
      return `P${pid}: Acquire ${productName(state, action.targetInstance)} from Player ${action.targetPlayer + 1}`;
    case ActionType.SECONDARY_TRADE:
      return `P${pid}: Secondary Trade`;
    case ActionType.PLAY_STRATEGY: {
      const idx = action.sourceIndex;
      const player = state.getPlayer(pid);
      if (idx >= 0 && idx < player.strategyHand.length) {
        const cardId = player.strategyHand[idx];
        const sdef = registry.getStrategy(cardId);
        return `P${pid}: Play ${sdef.name} ($${sdef.cost})`;
      }
      return `P${pid}: Play strategy card`;
    }
    case ActionType.INTEGRATE: {
      const host = productName(state, action.targetInstance);
      const client = productName(state, action.sourceIndex);
      return `P${pid}: Integrate ${host} + ${client}`;
    }
    case ActionType.VOLUNTARY_DISCLOSURE:
      return `P${pid}: Disclose ${productName(state, action.targetInstance)}`;
    case ActionType.PASS:
      return `P${pid}: PASS`;
    case ActionType.CHOOSE_MODE: {
      const mode = action.choice >= 0 ? CubeType[action.choice] : "?";
      return `P${pid}: Declare mode ${mode}`;
    }
    case ActionType.CHOOSE_XP: {
      const xp = action.choice >= 0 ? CubeType[action.choice] : "?";
      return `P${pid}: Graduate XP (${xp})`;
    }
    case ActionType.DISCARD_TALENT:
      return `P${pid}: Discard ${talentName(state, action.targetInstance)} (bench overflow)`;
    case ActionType.DISCARD_BACKLOG:
      return `P${pid}: Discard ${productName(state, action.targetInstance)} (backlog overflow)`;
    case ActionType.CHOOSE_OFFLINE:
      return `P${pid}: Take ${productName(state, action.targetInstance)} offline`;
    case ActionType.FIRE_STAFF:
      return `P${pid}: Fire ${talentName(state, action.targetInstance)}`;
    case ActionType.BID_AUDIT:
      return `P${pid}: Bid $${action.amount} on audit`;
    case ActionType.PASS_AUDIT:
      return `P${pid}: Pass on audit`;
    case ActionType.FOLD:
      return `P${pid}: FOLD (audit)`;
    case ActionType.SETTLE:
      return `P${pid}: SETTLE (audit)`;
    default:
      return `P${pid}: ${ActionType[atype]}`;
  }
}

function getEventName(state: GameState): string {
  if (state.markets.activeEvent === null) return "";
  try {
    const registry = getRegistrySync();
    const edef = registry.getEvent(state.markets.activeEvent);
    return edef.name;
  } catch {
    return state.markets.activeEvent;
  }
}

// ─── GameRecorder ───────────────────────────────────────────────────

export class GameRecorder {
  frames: GameFrame[] = [];

  addFrame(frame: GameFrame): void {
    this.frames.push(frame);
  }

  getFrames(): GameFrame[] {
    return this.frames;
  }

  toJSON(): string {
    return JSON.stringify({
      numFrames: this.frames.length,
      frames: this.frames,
    }, null, 2);
  }

  static fromJSON(json: string): GameRecorder {
    const data = JSON.parse(json);
    const recorder = new GameRecorder();
    // Support both formats: { frames: [...] } or bare [...]
    if (Array.isArray(data)) {
      recorder.frames = data as GameFrame[];
    } else if (data && Array.isArray(data.frames)) {
      recorder.frames = data.frames as GameFrame[];
    } else {
      throw new Error("Invalid replay format: expected array of frames or { frames: [...] }");
    }
    return recorder;
  }

  /**
   * Record an initial frame (before any actions) from a GameState.
   */
  recordInitialFrame(state: GameState, seed: number, numPlayers: number): void {
    const { players, market } = snapshotState(state);
    this.addFrame({
      frameIndex: 0,
      turn: state.turnNumber,
      phase: Phase[state.phase],
      subPhase: SubPhase[state.subPhase],
      currentPlayer: state.currentPlayer,
      action: "Game Start",
      result: `Seed: ${seed}, ${numPlayers} players`,
      activeEvent: getEventName(state),
      players,
      market,
      scores: null,
    });
  }

  /**
   * Record a frame after an action has been executed.
   * `preActionState` is used to describe the action (before the state mutates).
   * In practice, pass the action description string if the state is already mutated.
   */
  recordActionFrame(
    state: GameState,
    actionDesc: string,
    stepResult: StepResult,
  ): GameFrame {
    const { players, market } = snapshotState(state);

    const frame: GameFrame = {
      frameIndex: this.frames.length,
      turn: state.turnNumber,
      phase: Phase[state.phase],
      subPhase: SubPhase[state.subPhase],
      currentPlayer: state.currentPlayer,
      action: actionDesc,
      result: stepResult.actionResult?.message ?? "",
      activeEvent: getEventName(state),
      players,
      market,
      scores: state.gameOver ? [...state.finalScores] : null,
    };

    this.addFrame(frame);
    return frame;
  }

  /**
   * Convenience: snapshot the current state into a GameFrame without recording it.
   */
  static snapshotFrame(
    state: GameState,
    actionDesc: string = "",
    resultMsg: string = "",
  ): GameFrame {
    const { players, market } = snapshotState(state);
    return {
      frameIndex: -1,
      turn: state.turnNumber,
      phase: Phase[state.phase],
      subPhase: SubPhase[state.subPhase],
      currentPlayer: state.currentPlayer,
      action: actionDesc,
      result: resultMsg,
      activeEvent: getEventName(state),
      players,
      market,
      scores: state.gameOver ? [...state.finalScores] : null,
    };
  }
}
