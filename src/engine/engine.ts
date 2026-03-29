/**
 * Game engine: top-level state machine orchestrator.
 * Direct port from Python startup_simulator/engine.py
 */

import { ActionType, CubeType, Phase, Sector, SubPhase, Zone, IDEATION_POOL_AP_COST, MAX_TURNS } from "./types";
import { GameState, PlayerState, MarketState, TalentInstance } from "./state";
import type { CardRegistry } from "./cardRegistry";
import { GameRng } from "./rng";
import type { Action, ActionResult } from "./actions/base";
import { okResult, failResult } from "./actions/base";
import {
  executeAssignOne,
  executeLayoffSource,
  executeRecall,
  executeReassign,
  executeRecruit,
} from "./actions/talentActions";
import {
  executeGreenlight,
  executeIdeation,
  executeLaunch,
  executePivot,
} from "./actions/productActions";
import {
  executeAcquisition,
  executeBrainstorm,
  executeBuyback,
  executeDivest,
  executeInvest,
  executeSecondaryTrade,
} from "./actions/managementActions";
import {
  executeIntegrate,
  executePlayStrategy,
  executeVoluntaryDisclosure,
} from "./actions/freeActions";
import { getLegalActions } from "./actions/validator";
import { applyImmediateEventEffects, drawEvent, getRoundModifiers } from "./phases/eventPhase";
import { checkLegality, resolveFold, resolveLegal, resolveSettle, canSettle } from "./phases/auditPhase";
import { processIncome } from "./phases/incomePhase";
import {
  autoCleanupExcess,
  clearOnboarding,
  commitCubes,
  generateCubes,
  processGrowthHackerBugs,
  processQaOps,
  refillMarkets,
  resetOnlineStatus,
} from "./phases/enginePhase";
import { calculateFinalScores } from "./phases/scoring";
import { type RoundModifiers, defaultModifiers } from "./modifiers";

export interface StepResult {
  currentPlayer: number;
  phase: Phase;
  subPhase: SubPhase;
  actionResult: ActionResult | null;
  gameOver: boolean;
  scores: number[] | null;
}

export class GameEngine {
  rng: GameRng;
  state: GameState;
  _playerPassed: boolean;
  _failedActions: Set<string>;

  constructor(numPlayers: number = 2, seed: number = 42, registry: CardRegistry) {
    if (numPlayers < 2 || numPlayers > 4) {
      throw new Error("numPlayers must be 2-4");
    }
    this.rng = new GameRng(seed);
    this._playerPassed = false;
    this._failedActions = new Set<string>();
    this.state = this._setup(numPlayers, registry);
    this._advance(); // Auto-advance through EVENT and INCOME to first player decision
  }

  private _setup(numPlayers: number, registry: CardRegistry): GameState {
    const state = new GameState(numPlayers);

    // Create players
    for (let i = 0; i < numPlayers; i++) {
      state.players.push(new PlayerState(i));
    }

    // Build decks from card definitions
    const seedDefs = registry.getSeedDeck();
    const growthDefs = registry.getGrowthDeck();
    const agencyDefs = registry.agencyDeckDefs;

    // Seed deck (cardDefIds)
    state.markets.seedDeck = seedDefs.map((p) => p.cardDefId);
    this.rng.shuffle(state.markets.seedDeck);

    // Growth deck with Market Crash in bottom 20%
    const growthNonCrash = growthDefs.filter((p) => !p.isMarketCrash).map((p) => p.cardDefId);
    this.rng.shuffle(growthNonCrash);

    // Insert Market Crash into bottom 20%
    const bottom20Size = Math.max(1, Math.floor(growthNonCrash.length / 5));
    const crashPos = this.rng.randint(0, bottom20Size);
    growthNonCrash.splice(crashPos, 0, "market_crash");
    state.markets.growthDeck = growthNonCrash;

    // Talent deck (cardDefIds for agency cards)
    state.markets.talentDeck = agencyDefs.map((c) => c.cardDefId);
    this.rng.shuffle(state.markets.talentDeck);

    // Strategy deck
    state.markets.strategyDeck = registry.strategyDeckDefs.map((c) => c.cardDefId);
    this.rng.shuffle(state.markets.strategyDeck);

    // Event deck
    state.markets.eventDeck = registry.eventCards.map((c) => c.cardDefId);
    this.rng.shuffle(state.markets.eventDeck);

    // Deal Agency Row (4 face-up)
    for (let i = 0; i < Math.min(4, state.markets.talentDeck.length); i++) {
      const cardDefId = state.markets.talentDeck.pop()!;
      const inst = state.createTalentInstance(cardDefId, -1, Zone.BENCH);
      state.markets.agencyRow.push(inst.instanceId);
    }

    // Deal Product Market (2 Seed + 2 Growth)
    for (let i = 0; i < 2; i++) {
      if (state.markets.seedDeck.length > 0) {
        const cid = state.markets.seedDeck.pop()!;
        const inst = state.createProductInstance(cid, -1, Zone.BENCH);
        state.markets.productMarketSeed.push(inst.instanceId);
      }
    }
    for (let i = 0; i < 2; i++) {
      if (state.markets.growthDeck.length > 0) {
        const cid = state.markets.growthDeck.pop()!;
        const pdef = registry.getProduct(cid);
        if (pdef.isMarketCrash) {
          // Shouldn't happen since it's in bottom 20%, but handle it
          state.marketCrashDrawn = true;
          state.finishRound = true;
          continue;
        }
        const inst = state.createProductInstance(cid, -1, Zone.BENCH);
        state.markets.productMarketGrowth.push(inst.instanceId);
      }
    }

    // Player setup: 1 Jr Software, 1 Jr Hardware, 1 Jr QA
    // "Jr QA" = a Junior Software Dev pre-trained with QA skill
    for (const player of state.players) {
      let inst = state.createTalentInstance("jr_software", player.playerId, Zone.BENCH);
      player.bench.push(inst.instanceId);
      inst = state.createTalentInstance("jr_hardware", player.playerId, Zone.BENCH);
      player.bench.push(inst.instanceId);
      // Jr QA: a junior with green QA skill token
      inst = state.createTalentInstance("jr_software", player.playerId, Zone.BENCH);
      inst.skills.push(CubeType.QA);
      player.bench.push(inst.instanceId);
    }

    // Seed Round: Draft 1 "Concept" product to Dev Zone
    const conceptIds = seedDefs
      .filter((p) => p.sector !== null && p.sector === Sector.CONCEPT)
      .map((p) => p.cardDefId);

    for (const player of state.players) {
      if (conceptIds.length > 0 && state.markets.seedDeck.length > 0) {
        // Find a concept in the seed deck
        let chosen: number | null = null;
        for (let i = 0; i < state.markets.seedDeck.length; i++) {
          if (conceptIds.includes(state.markets.seedDeck[i])) {
            chosen = i;
            break;
          }
        }
        let cid: string;
        if (chosen !== null) {
          cid = state.markets.seedDeck.splice(chosen, 1)[0];
        } else {
          // Fallback: just take top of seed deck
          cid = state.markets.seedDeck.pop()!;
        }
        const inst = state.createProductInstance(cid, player.playerId, Zone.DEV);
        player.devProducts.push(inst.instanceId);
      }
    }

    // Start the game
    state.phase = Phase.EVENT;
    state.subPhase = SubPhase.NONE;
    state.currentPlayer = 0;
    state.turnNumber = 1;

    return state;
  }

  step(action: Action): StepResult {
    const state = this.state;

    if (state.gameOver) {
      return {
        currentPlayer: state.currentPlayer,
        phase: Phase.GAME_OVER,
        subPhase: SubPhase.NONE,
        actionResult: null,
        gameOver: true,
        scores: state.finalScores,
      };
    }

    const result = this._executeAction(action);

    // Track failed free actions to prevent infinite loops
    if (
      !result.success &&
      (action.actionType === ActionType.GREENLIGHT ||
        action.actionType === ActionType.PLAY_STRATEGY ||
        action.actionType === ActionType.INTEGRATE ||
        action.actionType === ActionType.VOLUNTARY_DISCLOSURE)
    ) {
      const key = JSON.stringify([
        action.actionType,
        action.sourceIndex,
        action.targetInstance,
        action.targetPlayer,
      ]);
      this._failedActions.add(key);
    } else if (action.actionType === ActionType.PASS) {
      this._failedActions.clear();
    }

    this._advance();

    return {
      currentPlayer: state.currentPlayer,
      phase: state.phase,
      subPhase: state.subPhase,
      actionResult: result,
      gameOver: state.gameOver,
      scores: state.gameOver ? state.finalScores : null,
    };
  }

  private _executeAction(action: Action): ActionResult {
    const state = this.state;
    const player = state.getPlayer(state.currentPlayer);
    const atype = action.actionType;

    // AP-costing actions
    if (atype === ActionType.RECRUIT) {
      const apCost = 1;
      if (player.actionPoints < apCost) {
        return failResult("Not enough AP");
      }
      const result = executeRecruit(state, action);
      if (result.success) {
        player.actionPoints -= apCost;
      }
      return result;
    }

    if (atype === ActionType.ASSIGN) {
      if (player.actionPoints < 1) {
        return failResult("Not enough AP");
      }
      player.actionPoints -= 1;
      state.subPhase = SubPhase.ACTION_ASSIGN_BATCH;
      return okResult("Started assign batch");
    }

    if (atype === ActionType.ASSIGN_ONE) {
      return executeAssignOne(state, action);
    }

    if (atype === ActionType.END_ASSIGN_BATCH) {
      state.subPhase = SubPhase.ACTION_MAIN;
      return okResult("Ended assign batch");
    }

    if (atype === ActionType.RECALL) {
      if (player.actionPoints < 1) {
        return failResult("Not enough AP");
      }
      const result = executeRecall(state, action);
      if (result.success) {
        player.actionPoints -= 1;
      }
      return result;
    }

    if (atype === ActionType.REASSIGN) {
      if (player.actionPoints < 1) {
        return failResult("Not enough AP");
      }
      const result = executeReassign(state, action);
      if (result.success) {
        player.actionPoints -= 1;
      }
      return result;
    }

    if (atype === ActionType.IDEATION) {
      const apCost = action.sourceType === "idea_pool" ? IDEATION_POOL_AP_COST : 1;
      if (player.actionPoints < apCost) {
        return failResult("Not enough AP");
      }
      const result = executeIdeation(state, action);
      if (result.success) {
        player.actionPoints -= apCost;
      }
      return result;
    }

    if (atype === ActionType.LAUNCH) {
      if (player.actionPoints < 1) {
        return failResult("Not enough AP");
      }
      const result = executeLaunch(state, action);
      if (result.success) {
        player.actionPoints -= 1;
      }
      return result;
    }

    if (atype === ActionType.PIVOT) {
      if (player.actionPoints < 1) {
        return failResult("Not enough AP");
      }
      const result = executePivot(state, action);
      if (result.success) {
        player.actionPoints -= 1;
      }
      return result;
    }

    if (atype === ActionType.LAYOFF_SOURCE) {
      if (player.actionPoints < 1) {
        return failResult("Not enough AP");
      }
      const result = executeLayoffSource(state, action);
      if (result.success) {
        player.actionPoints -= 1;
      }
      return result;
    }

    if (atype === ActionType.BRAINSTORM) {
      if (player.actionPoints < 1) {
        return failResult("Not enough AP");
      }
      const result = executeBrainstorm(state, action);
      if (result.success) {
        player.actionPoints -= 1;
      }
      return result;
    }

    if (atype === ActionType.INVEST) {
      if (player.actionPoints < 1) {
        return failResult("Not enough AP");
      }
      const result = executeInvest(state, action);
      if (result.success) {
        player.actionPoints -= 1;
      }
      return result;
    }

    if (atype === ActionType.DIVEST) {
      if (player.actionPoints < 1) {
        return failResult("Not enough AP");
      }
      const result = executeDivest(state, action);
      if (result.success) {
        player.actionPoints -= 1;
      }
      return result;
    }

    if (atype === ActionType.BUYBACK) {
      if (player.actionPoints < 1) {
        return failResult("Not enough AP");
      }
      const result = executeBuyback(state, action);
      if (result.success) {
        player.actionPoints -= 1;
      }
      return result;
    }

    if (atype === ActionType.SECONDARY_TRADE) {
      if (player.actionPoints < 1) {
        return failResult("Not enough AP");
      }
      const result = executeSecondaryTrade(state, action);
      if (result.success) {
        player.actionPoints -= 1;
      }
      return result;
    }

    if (atype === ActionType.ACQUISITION) {
      if (player.actionPoints < 1) {
        return failResult("Not enough AP");
      }
      const result = executeAcquisition(state, action);
      if (result.success) {
        player.actionPoints -= 1;
      }
      return result;
    }

    // 0 AP actions
    if (atype === ActionType.GREENLIGHT) {
      return executeGreenlight(state, action);
    }

    if (atype === ActionType.PLAY_STRATEGY) {
      return executePlayStrategy(state, action);
    }

    if (atype === ActionType.INTEGRATE) {
      return executeIntegrate(state, action);
    }

    if (atype === ActionType.VOLUNTARY_DISCLOSURE) {
      return executeVoluntaryDisclosure(state, action);
    }

    // Audit actions
    if (atype === ActionType.BID_AUDIT) {
      const prodId = action.targetInstance;
      const bidAmount = action.amount;
      state.auditBids.set(state.currentPlayer, bidAmount);
      state.auditTargetProduct = prodId;
      return okResult(`Bid $${bidAmount} on audit`);
    }

    if (atype === ActionType.PASS_AUDIT) {
      return okResult("Passed on audit");
    }

    if (atype === ActionType.FOLD) {
      const prodId = state.auditTargetProduct;
      if (prodId !== null) {
        // Find whistleblower (highest bidder)
        let wbId = -1;
        let maxBid = -1;
        for (const [pid, bid] of state.auditBids) {
          if (bid > maxBid) {
            maxBid = bid;
            wbId = pid;
          }
        }
        if (wbId >= 0) {
          resolveFold(state, prodId, wbId);
        }
        state.auditBids.clear();
        state.auditTargetProduct = null;
      }
      return okResult("Folded");
    }

    if (atype === ActionType.SETTLE) {
      const prodId = state.auditTargetProduct;
      if (prodId !== null) {
        let wbId = -1;
        let maxBid = -1;
        for (const [pid, bid] of state.auditBids) {
          if (bid > maxBid) {
            maxBid = bid;
            wbId = pid;
          }
        }
        if (wbId >= 0) {
          resolveSettle(state, prodId, wbId);
        }
        state.auditBids.clear();
        state.auditTargetProduct = null;
      }
      return okResult("Settled");
    }

    if (atype === ActionType.CHOOSE_MODE) {
      const tid = action.targetInstance;
      const talent = state.talentInstances.get(tid);
      if (talent) {
        talent.declaredMode = action.choice as CubeType;
        if (state.pendingDecisions.length > 0) {
          state.pendingDecisions.shift();
        }
        return okResult(`Declared mode ${CubeType[action.choice]}`);
      }
      return failResult("Invalid talent");
    }

    if (atype === ActionType.CHOOSE_XP) {
      const tid = action.targetInstance;
      const talent = state.talentInstances.get(tid);
      if (talent && talent.xpPending.length > 0) {
        const chosen = action.choice as CubeType;
        if (talent.xpPending.includes(chosen) && talent.totalXp < 4) {
          talent.xpPermanent.push(chosen);
        }
        talent.xpPending = [];
        if (state.pendingDecisions.length > 0) {
          state.pendingDecisions.shift();
        }
        return okResult(`Graduated XP: ${CubeType[chosen]}`);
      }
      return failResult("Invalid talent or no pending XP");
    }

    if (atype === ActionType.PASS) {
      player.actionPoints = 0;
      this._playerPassed = true;
      return okResult("Passed");
    }

    if (atype === ActionType.DISCARD_TALENT) {
      const tid = action.targetInstance;
      const idx = player.bench.indexOf(tid);
      if (idx >= 0) {
        player.bench.splice(idx, 1);
        const talent = state.talentInstances.get(tid)!;
        talent.owner = -1;
        state.markets.openJobMarket.push(tid);
        while (state.markets.openJobMarket.length > 5) {
          state.markets.openJobMarket.shift();
        }
        return okResult("Discarded talent");
      }
      return failResult("Talent not on bench");
    }

    if (atype === ActionType.DISCARD_BACKLOG) {
      const pid = action.targetInstance;
      const idx = player.productBacklog.indexOf(pid);
      if (idx >= 0) {
        player.productBacklog.splice(idx, 1);
        state.productInstances.get(pid)!.owner = -1;
        state.markets.openIdeaPool.push(pid);
        while (state.markets.openIdeaPool.length > 5) {
          state.markets.openIdeaPool.shift();
        }
        return okResult("Discarded backlog product");
      }
      return failResult("Product not in backlog");
    }

    if (atype === ActionType.CHOOSE_OFFLINE) {
      const pid = action.targetInstance;
      const prod = state.productInstances.get(pid);
      if (prod && prod.isOnline) {
        prod.isOnline = false;
        return okResult("Product taken offline");
      }
      return failResult("Invalid product");
    }

    if (atype === ActionType.FIRE_STAFF) {
      const tid = action.targetInstance;
      const talent = state.talentInstances.get(tid);
      if (talent && talent.owner === state.currentPlayer) {
        const benchIdx = player.bench.indexOf(tid);
        if (benchIdx >= 0) {
          player.bench.splice(benchIdx, 1);
        }
        talent.owner = -1;
        talent.zone = Zone.BENCH;
        talent.assignedProduct = null;
        state.markets.openJobMarket.push(tid);
        while (state.markets.openJobMarket.length > 5) {
          state.markets.openJobMarket.shift();
        }
        return okResult("Fired staff");
      }
      return failResult("Invalid talent");
    }

    return failResult(`Unknown action type: ${atype}`);
  }

  private _advance(): void {
    const state = this.state;

    while (true) {
      if (state.gameOver) {
        return;
      }

      if (state.phase === Phase.EVENT) {
        this._doEventPhase();
        state.phase = Phase.INCOME;
        state.subPhase = SubPhase.NONE;
        state.currentPlayer = 0;
        continue;
      }

      if (state.phase === Phase.INCOME) {
        // Process income for all players (auto for Phase 1)
        for (let pid = 0; pid < state.numPlayers; pid++) {
          resetOnlineStatus(state, pid);
          processIncome(state, pid);
        }

        // Move to action phase
        state.phase = Phase.ACTION;
        state.subPhase = SubPhase.ACTION_MAIN;
        state.currentPlayer = 0;
        state.players[0].actionPoints = 3;
        return; // Yield: need player action
      }

      if (state.phase === Phase.ACTION) {
        const player = state.getPlayer(state.currentPlayer);

        if (state.subPhase === SubPhase.ACTION_ASSIGN_BATCH) {
          // Waiting for assign batch decisions
          return;
        }

        if (player.actionPoints <= 0) {
          if (!this._playerPassed) {
            // Check for free actions (excluding known-failed ones)
            const legal = getLegalActions(state);
            let hasViable = false;
            for (const a of legal) {
              if (a.actionType === ActionType.PASS) {
                continue;
              }
              const key = JSON.stringify([
                a.actionType,
                a.sourceIndex,
                a.targetInstance,
                a.targetPlayer,
              ]);
              if (!this._failedActions.has(key)) {
                hasViable = true;
                break;
              }
            }
            if (hasViable) {
              return; // Still has free actions
            }
          }

          this._playerPassed = false;
          this._failedActions.clear();
          // Move to next player or engine phase
          const nextPlayer = state.currentPlayer + 1;
          if (nextPlayer >= state.numPlayers) {
            // All players done, move to engine phase
            state.phase = Phase.ENGINE;
            state.subPhase = SubPhase.NONE;
            state.enginePlayerIndex = 0;
            continue;
          } else {
            state.currentPlayer = nextPlayer;
            state.players[nextPlayer].actionPoints = 3;
            state.subPhase = SubPhase.ACTION_MAIN;
            return; // Yield: next player's turn
          }
        } else {
          return; // Yield: player has AP
        }
      }

      if (state.phase === Phase.ENGINE) {
        this._doEnginePhase();

        // Check for game over: Market Crash or turn limit
        if (state.marketCrashDrawn && state.finishRound) {
          this._endGame();
          return;
        }
        if (state.turnNumber >= MAX_TURNS) {
          this._endGame();
          return;
        }

        // Next turn
        state.turnNumber += 1;
        state.phase = Phase.EVENT;
        state.subPhase = SubPhase.NONE;
        state.currentPlayer = 0;
        continue;
      }

      // Unknown phase - just return
      return;
    }
  }

  private _doEventPhase(): void {
    const state = this.state;
    const cardId = drawEvent(state);
    if (cardId !== null) {
      state.roundModifiers = getRoundModifiers(state);
      applyImmediateEventEffects(state);
    } else {
      state.roundModifiers = defaultModifiers();
    }
  }

  private _doEnginePhase(): void {
    const state = this.state;

    for (let pid = 0; pid < state.numPlayers; pid++) {
      // 1. Generate & Train: dev teams produce cubes + pending XP
      generateCubes(state, pid);

      // 2. Clean & Train: QA in Ops removes bugs
      processQaOps(state, pid);

      // 3. Audit window (auto-skipped for now; bidding handled via sub-phases)

      // 4. Commit: move transient cubes to tracks
      commitCubes(state, pid);

      // 5. Complete: mark full products, Growth Hacker decay
      processGrowthHackerBugs(state, pid);
    }

    // 6. Refill markets (once per round, before cleanup per rulebook)
    refillMarkets(state);

    // 7. Cleanup + clear onboarding (per player)
    for (let pid = 0; pid < state.numPlayers; pid++) {
      autoCleanupExcess(state, pid);
      clearOnboarding(state, pid);
    }
  }

  private _endGame(): void {
    const state = this.state;
    state.finalScores = calculateFinalScores(state);
    state.gameOver = true;
    state.phase = Phase.GAME_OVER;
  }

  getCurrentAgent(): number {
    return this.state.currentPlayer;
  }

  getLegalActions(): Action[] {
    return getLegalActions(this.state);
  }

  isDone(): boolean {
    return this.state.gameOver;
  }

  getScores(): number[] {
    return this.state.finalScores;
  }
}
