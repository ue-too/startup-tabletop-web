/**
 * Legal action enumeration for Startup Simulator.
 * Direct port from Python startup_simulator/actions/validator.py
 */

import {
  ActionType,
  CubeType,
  Phase,
  SubPhase,
  Tag,
  TalentType,
  Tier,
  Trait,
  Zone,
  IDEATION_POOL_AP_COST,
} from "../types";
import { GameState } from "../state";
import { getRegistrySync } from "../cardRegistry";
import { isPm, isSpecialist } from "../cards";
import { Action, createAction } from "./base";
import { hasMatchingLead } from "../phases/enginePhase";
import { calculatePoachCost } from "./combatActions";
import { _isValidIntegration as isValidIntegration } from "./freeActions";
import { canSettle } from "../phases/auditPhase";

export function getLegalActions(state: GameState): Action[] {
  if (state.gameOver) {
    return [];
  }

  if (state.phase === Phase.ACTION) {
    if (state.subPhase === SubPhase.ACTION_ASSIGN_BATCH) {
      return getAssignBatchActions(state);
    }
    if (state.subPhase === SubPhase.ACTION_MAIN) {
      return getMainActions(state);
    }
  }

  if (state.phase === Phase.ENGINE) {
    if (state.subPhase === SubPhase.ENGINE_MODE_DECLARE) {
      return getModeDeclareActions(state);
    }
    if (state.subPhase === SubPhase.ENGINE_AUDIT_BID) {
      return getAuditBidActions(state);
    }
    if (state.subPhase === SubPhase.ENGINE_AUDIT_RESOLVE) {
      return getAuditResolveActions(state);
    }
    if (state.subPhase === SubPhase.ENGINE_XP_GRADUATE) {
      return getXpGraduateActions(state);
    }
    if (state.subPhase === SubPhase.ENGINE_CLEANUP_TALENT) {
      return getTalentDiscardActions(state);
    }
    if (state.subPhase === SubPhase.ENGINE_CLEANUP_BACKLOG) {
      return getBacklogDiscardActions(state);
    }
  }

  if (state.phase === Phase.INCOME) {
    if (state.subPhase === SubPhase.INCOME_CHOOSE_OFFLINE) {
      return getChooseOfflineActions(state);
    }
    if (state.subPhase === SubPhase.INCOME_FIRE_CHOICE) {
      return getFireChoiceActions(state);
    }
  }

  // Default: only PASS
  return [createAction(ActionType.PASS)];
}

function getMainActions(state: GameState): Action[] {
  const actions: Action[] = [];
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();
  const ap = player.actionPoints;

  // Always can pass (ends action phase)
  actions.push(createAction(ActionType.PASS));

  if (ap <= 0) {
    // Only free actions available
    addFreeActions(state, actions);
    return actions;
  }

  // --- 1 AP Actions ---

  // RECRUIT
  addRecruitActions(state, actions);

  // ASSIGN (starts batch)
  if (player.bench.length > 0 && (player.devProducts.length > 0 || player.opsProducts.length > 0)) {
    actions.push(createAction(ActionType.ASSIGN));
  }

  // RECALL (from ops)
  const opsTalent: number[] = [];
  for (const [tid, t] of state.talentInstances) {
    if (t.owner === state.currentPlayer && t.zone === Zone.OPS) {
      opsTalent.push(tid);
    }
  }
  if (opsTalent.length > 0) {
    actions.push(createAction(ActionType.RECALL));
  }

  // REASSIGN
  const boardTalent = state.getBoardTalent(state.currentPlayer);
  const allProducts = [...player.devProducts, ...player.opsProducts];
  for (const tid of boardTalent) {
    const t = state.talentInstances.get(tid)!;
    const tdef = registry.getTalent(t.cardDefId);
    // Ego trait: cannot reassign
    if (tdef.trait !== null && tdef.trait === Trait.EGO) {
      continue;
    }
    for (const pid of allProducts) {
      if (pid !== t.assignedProduct) {
        actions.push(createAction(ActionType.REASSIGN, {
          targetInstance: tid,
          sourceIndex: pid,
        }));
      }
    }
  }

  // LAYOFF/SOURCE
  addLayoffSourceActions(state, actions);

  // IDEATION
  addIdeationActions(state, actions);

  // LAUNCH
  for (const pid of player.devProducts) {
    const prod = state.productInstances.get(pid)!;
    const pdef = registry.getProduct(prod.cardDefId);
    if (prod.isDevelopmentComplete(pdef) && prod.bugs === 0) {
      // Also check lead requirement for Tier 2/3
      if (pdef.tier >= Tier.TIER2) {
        if (!hasMatchingLead(state, pid, pdef)) {
          continue;
        }
      }
      actions.push(createAction(ActionType.LAUNCH, { targetInstance: pid }));
    }
  }

  // PIVOT
  for (const pid of player.devProducts) {
    actions.push(createAction(ActionType.PIVOT, { targetInstance: pid }));
  }

  // BRAINSTORM (draw strategy cards)
  if (state.markets.strategyDeck.length > 0 || state.markets.strategyDiscard.length > 0) {
    // Offer different keep choices (0, 1, 2 for PM)
    for (let choice = 0; choice < 3; choice++) {
      actions.push(createAction(ActionType.BRAINSTORM, { choice }));
    }
  }

  // INVEST (buy equity in opponent)
  addInvestActions(state, actions);

  // BUYBACK (buy back own equity from investor)
  addBuybackActions(state, actions);

  // DIVEST / SECONDARY TRADE
  addDivestActions(state, actions);

  // ACQUISITION (buy opponent's maintenance product)
  addAcquisitionActions(state, actions);

  // --- Free Actions (0 AP) ---
  addFreeActions(state, actions);

  return actions;
}

function addRecruitActions(state: GameState, actions: Action[]): void {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();

  // University (always available, infinite supply)
  if (player.cash >= 2) {
    actions.push(createAction(ActionType.RECRUIT, { sourceType: "university_sw" }));
    actions.push(createAction(ActionType.RECRUIT, { sourceType: "university_hw" }));
  }

  // Agency Row (bench or immediate deploy to board)
  const allProducts = [...player.devProducts, ...player.opsProducts];
  for (let i = 0; i < state.markets.agencyRow.length; i++) {
    const tid = state.markets.agencyRow[i];
    const talent = state.talentInstances.get(tid)!;
    const cdef = registry.getTalent(talent.cardDefId);
    if (player.cash >= cdef.cost) {
      actions.push(createAction(ActionType.RECRUIT, { sourceIndex: i, sourceType: "agency" }));
      // Immediate deployment option (to any existing product)
      for (const pid of allProducts) {
        actions.push(createAction(ActionType.RECRUIT, {
          sourceIndex: i,
          sourceType: "agency_deploy",
          targetInstance: pid,
        }));
      }
    }
  }

  // Open Job Market
  for (let i = 0; i < state.markets.openJobMarket.length; i++) {
    if (player.cash >= 1) {
      actions.push(createAction(ActionType.RECRUIT, { sourceIndex: i, sourceType: "open_market" }));
    }
  }
}

function addLayoffSourceActions(state: GameState, actions: Action[]): void {
  const player = state.getPlayer(state.currentPlayer);
  if (player.bench.length === 0 || state.markets.talentDeck.length === 0) {
    return;
  }
  // Offer discarding 1, 2, or 3 bench cards (up to bench size)
  const maxDiscard = Math.min(player.bench.length, 3);
  const bench = player.bench;

  for (let count = 1; count <= maxDiscard; count++) {
    // Generate combinations of `count` items from bench using nested loops
    const combos = getCombinations(bench, count);
    for (const combo of combos) {
      actions.push(createAction(ActionType.LAYOFF_SOURCE, {
        targetInstances: combo,
      }));
    }
  }
}

/** Simple combinations helper (replacement for itertools.combinations). */
function getCombinations(arr: number[], k: number): number[][] {
  const result: number[][] = [];
  const combo: number[] = [];

  function backtrack(start: number): void {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      backtrack(i + 1);
      combo.pop();
    }
  }

  backtrack(0);
  return result;
}

function addIdeationActions(state: GameState, actions: Action[]): void {
  const player = state.getPlayer(state.currentPlayer);

  // Cannot ideate if backlog is at 4 (overflow already happened)
  if (player.productBacklog.length >= 4) {
    return;
  }

  // Seed market
  for (let i = 0; i < state.markets.productMarketSeed.length; i++) {
    actions.push(createAction(ActionType.IDEATION, { sourceIndex: i, sourceType: "seed_market" }));
  }

  // Growth market
  for (let i = 0; i < state.markets.productMarketGrowth.length; i++) {
    actions.push(createAction(ActionType.IDEATION, { sourceIndex: i, sourceType: "growth_market" }));
  }

  // Blind draft from decks
  if (state.markets.seedDeck.length > 0) {
    actions.push(createAction(ActionType.IDEATION, { sourceType: "seed_deck" }));
  }
  if (state.markets.growthDeck.length > 0) {
    actions.push(createAction(ActionType.IDEATION, { sourceType: "growth_deck" }));
  }

  // Open Idea Pool (costs 2 AP)
  if (player.actionPoints >= IDEATION_POOL_AP_COST) {
    for (let i = 0; i < state.markets.openIdeaPool.length; i++) {
      actions.push(createAction(ActionType.IDEATION, { sourceIndex: i, sourceType: "idea_pool" }));
    }
  }
}

function tierToPrice(tier: Tier): number {
  if (tier >= Tier.TIER3) {
    return 15;
  } else if (tier >= Tier.TIER2) {
    return 10;
  }
  return 5;
}

function addInvestActions(state: GameState, actions: Action[]): void {
  const player = state.getPlayer(state.currentPlayer);
  for (const other of state.players) {
    if (other.playerId === state.currentPlayer) {
      continue;
    }
    if (other.equityTokensOwn <= 1) {
      continue;
    }
    const price = tierToPrice(state.getPlayerHighestTier(other.playerId));
    if (player.cash >= price) {
      actions.push(createAction(ActionType.INVEST, { targetPlayer: other.playerId }));
    }
  }
}

function addBuybackActions(state: GameState, actions: Action[]): void {
  const player = state.getPlayer(state.currentPlayer);
  const price = tierToPrice(state.getPlayerHighestTier(state.currentPlayer));

  for (const other of state.players) {
    if (other.playerId === state.currentPlayer) {
      continue;
    }
    if ((other.equityHeld.get(state.currentPlayer) ?? 0) > 0 && player.cash >= price) {
      actions.push(createAction(ActionType.BUYBACK, { targetPlayer: other.playerId }));
    }
  }
}

function addDivestActions(state: GameState, actions: Action[]): void {
  const player = state.getPlayer(state.currentPlayer);

  for (const [founderId, count] of player.equityHeld) {
    if (count <= 0) {
      continue;
    }
    const price = tierToPrice(state.getPlayerHighestTier(founderId));
    for (const buyer of state.players) {
      if (buyer.playerId === state.currentPlayer) {
        continue;
      }
      if (buyer.cash >= price) {
        actions.push(createAction(ActionType.DIVEST, {
          targetPlayer: founderId,
          sourceIndex: buyer.playerId,
        }));
      }
    }
  }
}

function addAcquisitionActions(state: GameState, actions: Action[]): void {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();

  for (const other of state.players) {
    if (other.playerId === state.currentPlayer) {
      continue;
    }
    for (const pid of other.opsProducts) {
      const prod = state.productInstances.get(pid)!;
      const pdef = registry.getProduct(prod.cardDefId);
      const basePrices: Partial<Record<Tier, number>> = {
        [Tier.TIER1]: 6,
        [Tier.TIER2]: 12,
        [Tier.TIER3]: 20,
      };
      let price = basePrices[pdef.tier] ?? 6;
      price += prod.hype * 5 - prod.scandal * 5 - prod.bugs;
      price = Math.max(1, price);
      if (player.cash >= price) {
        actions.push(createAction(ActionType.ACQUISITION, {
          targetPlayer: other.playerId,
          targetInstance: pid,
        }));
      }
    }
  }
}

function addFreeActions(state: GameState, actions: Action[]): void {
  const player = state.getPlayer(state.currentPlayer);

  // GREENLIGHT (backlog -> dev)
  if (player.devProducts.length < 3) {
    for (const pid of player.productBacklog) {
      if (canGreenlight(state, pid)) {
        actions.push(createAction(ActionType.GREENLIGHT, { targetInstance: pid }));
      }
    }
  }

  // PLAY STRATEGY CARD
  addPlayStrategyActions(state, actions);

  // INTEGRATE (stack host/client in ops)
  addIntegrateActions(state, actions);

  // VOLUNTARY DISCLOSURE (flip face-down card)
  for (const pid of player.devProducts) {
    const prod = state.productInstances.get(pid)!;
    if (prod.isFaceDown) {
      actions.push(createAction(ActionType.VOLUNTARY_DISCLOSURE, { targetInstance: pid }));
    }
  }
}

function canGreenlight(state: GameState, prodId: number): boolean {
  const registry = getRegistrySync();
  const prod = state.productInstances.get(prodId)!;
  const pdef = registry.getProduct(prod.cardDefId);

  if (pdef.requires.length === 0) {
    return true;
  }

  const playerTags = state.getPlayerTagsWithPartners(state.currentPlayer);

  if (pdef.requires.every((t: Tag) => playerTags.has(t))) {
    return true;
  }

  // Check if missing tags can be licensed ($3 each)
  const player = state.getPlayer(state.currentPlayer);
  for (const tag of pdef.requires) {
    if (playerTags.has(tag)) {
      continue;
    }
    let found = false;
    for (const other of state.players) {
      if (other.playerId === state.currentPlayer) {
        continue;
      }
      if (state.getPlayerTags(other.playerId).has(tag)) {
        found = true;
        break;
      }
    }
    if (!found) {
      return false;
    }
  }

  const missingCount = pdef.requires.filter((t: Tag) => !playerTags.has(t)).length;
  return player.cash >= missingCount * 3;
}

function addIntegrateActions(state: GameState, actions: Action[]): void {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();

  const opsProducts: Array<[number, ReturnType<typeof state.productInstances.get>]> = [];
  for (const pid of player.opsProducts) {
    opsProducts.push([pid, state.productInstances.get(pid)!]);
  }

  for (let i = 0; i < opsProducts.length; i++) {
    const [hostId, host] = opsProducts[i];
    if (host!.integratedWith !== null) {
      continue;
    }
    const hostDef = registry.getProduct(host!.cardDefId);
    for (let j = 0; j < opsProducts.length; j++) {
      if (i === j) continue;
      const [clientId, client] = opsProducts[j];
      if (client!.integratedWith !== null) {
        continue;
      }
      const clientDef = registry.getProduct(client!.cardDefId);
      // Check compatibility
      if (isValidIntegration(hostDef, clientDef, registry)) {
        // Same tag check
        if (hostDef.provides !== clientDef.provides) {
          actions.push(createAction(ActionType.INTEGRATE, {
            targetInstance: hostId,
            sourceIndex: clientId,
          }));
        }
      }
    }
  }
}

function addPlayStrategyActions(state: GameState, actions: Action[]): void {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();

  for (let idx = 0; idx < player.strategyHand.length; idx++) {
    const cardId = player.strategyHand[idx];
    const sdef = registry.getStrategy(cardId);
    if (player.cash < sdef.cost) {
      continue;
    }

    // Generate valid targets based on effect
    if (sdef.effectId === "train_software_skill") {
      for (const tid of getOwnJuniors(state)) {
        const talent = state.talentInstances.get(tid)!;
        const tdef = registry.getTalent(talent.cardDefId);
        if (!talent.skills.includes(CubeType.SOFTWARE) && tdef.outputType !== CubeType.SOFTWARE) {
          actions.push(createAction(ActionType.PLAY_STRATEGY, { sourceIndex: idx, targetInstance: tid }));
        }
      }

    } else if (sdef.effectId === "train_qa_skill") {
      for (const tid of getOwnJuniors(state)) {
        const talent = state.talentInstances.get(tid)!;
        if (!talent.skills.includes(CubeType.QA)) {
          actions.push(createAction(ActionType.PLAY_STRATEGY, { sourceIndex: idx, targetInstance: tid }));
        }
      }

    } else if (sdef.effectId === "train_specialist_xp") {
      for (const [tid, t] of state.talentInstances) {
        if (t.owner !== state.currentPlayer) {
          continue;
        }
        const tdef = registry.getTalent(t.cardDefId);
        if ((tdef.talentType === TalentType.QA || tdef.talentType === TalentType.SALES) && t.totalXp < 2) {
          actions.push(createAction(ActionType.PLAY_STRATEGY, { sourceIndex: idx, targetInstance: tid }));
        }
      }

    } else if (sdef.effectId === "add_rank_badge") {
      for (const tid of getOwnJuniors(state)) {
        const talent = state.talentInstances.get(tid)!;
        if (talent.rankBadges === 0) {
          actions.push(createAction(ActionType.PLAY_STRATEGY, { sourceIndex: idx, targetInstance: tid }));
        }
      }

    } else if (sdef.effectId === "add_pm_rank_badge") {
      for (const [tid, t] of state.talentInstances) {
        if (t.owner !== state.currentPlayer) {
          continue;
        }
        const tdef = registry.getTalent(t.cardDefId);
        if (isPm(tdef) && t.rankBadges === 0) {
          actions.push(createAction(ActionType.PLAY_STRATEGY, { sourceIndex: idx, targetInstance: tid }));
        }
      }

    } else if (sdef.effectId === "poach_2x" || sdef.effectId === "poach_1_5x_bypass_hr") {
      // Poach: target opponent's dev board talent
      const multiplier = sdef.effectId.includes("1_5x") ? 1.5 : 2.0;
      const bypassHr = sdef.effectId.includes("bypass_hr");
      for (const other of state.players) {
        if (other.playerId === state.currentPlayer) {
          continue;
        }
        if ((player.equityHeld.get(other.playerId) ?? 0) > 0) {
          continue; // Investor immunity
        }
        for (const [tid, t] of state.talentInstances) {
          if (t.owner === other.playerId && t.zone === Zone.DEV && !t.onboarding) {
            if (t.equityVested !== null) {
              continue; // Vested
            }
            // Check HR shield
            if (!bypassHr && t.assignedProduct !== null) {
              const team = state.getTalentOnProduct(t.assignedProduct);
              const hasHr = team.some((x: number) => {
                const xi = state.talentInstances.get(x)!;
                if (xi.onboarding) return false;
                const xdef = registry.getTalent(xi.cardDefId);
                return xdef.talentType === TalentType.HR;
              });
              if (hasHr) {
                continue;
              }
            }
            // Check cost
            const cost = calculatePoachCost(state, tid, multiplier) + sdef.cost;
            if (player.cash < cost) {
              continue;
            }
            actions.push(createAction(ActionType.PLAY_STRATEGY, {
              sourceIndex: idx,
              targetInstance: tid,
              targetPlayer: other.playerId,
            }));
          }
        }
      }

    } else if (sdef.effectId === "add_scandal") {
      for (const other of state.players) {
        if (other.playerId === state.currentPlayer) {
          continue;
        }
        if ((player.equityHeld.get(other.playerId) ?? 0) > 0) {
          continue;
        }
        for (const pid of other.opsProducts) {
          actions.push(createAction(ActionType.PLAY_STRATEGY, {
            sourceIndex: idx,
            targetInstance: pid,
            targetPlayer: other.playerId,
          }));
        }
      }

    } else if (sdef.effectId === "hostile_buyout") {
      for (const other of state.players) {
        if (other.playerId === state.currentPlayer) {
          continue;
        }
        if ((other.equityHeld.get(state.currentPlayer) ?? 0) > 0 && player.cash >= 5) {
          actions.push(createAction(ActionType.PLAY_STRATEGY, {
            sourceIndex: idx,
            targetPlayer: other.playerId,
          }));
        }
      }

    } else if (sdef.effectId.startsWith("attr_")) {
      const attrName = sdef.effectId.replace("attr_", "");
      if (attrName === "workaholic" || attrName === "clean_coder" || attrName === "visionary") {
        // Buff own talent
        for (const [tid, t] of state.talentInstances) {
          if (t.owner === state.currentPlayer) {
            actions.push(createAction(ActionType.PLAY_STRATEGY, { sourceIndex: idx, targetInstance: tid }));
          }
        }
      } else {
        // Debuff opponent talent
        for (const other of state.players) {
          if (other.playerId === state.currentPlayer) {
            continue;
          }
          if ((player.equityHeld.get(other.playerId) ?? 0) > 0) {
            continue;
          }
          for (const [tid, t] of state.talentInstances) {
            if (t.owner === other.playerId) {
              actions.push(createAction(ActionType.PLAY_STRATEGY, {
                sourceIndex: idx,
                targetInstance: tid,
                targetPlayer: other.playerId,
              }));
            }
          }
        }
      }

    } else if (sdef.effectId === "add_hype") {
      for (const pid of player.opsProducts) {
        actions.push(createAction(ActionType.PLAY_STRATEGY, { sourceIndex: idx, targetInstance: pid }));
      }

    } else if (sdef.effectId === "draw_5_products") {
      if (state.markets.seedDeck.length > 0 || state.markets.growthDeck.length > 0) {
        actions.push(createAction(ActionType.PLAY_STRATEGY, { sourceIndex: idx }));
      }

    } else if (sdef.effectId === "cancel_attack") {
      // Reaction card: don't generate actions for it (held in hand)
    }
  }
}

function getOwnJuniors(state: GameState): number[] {
  const registry = getRegistrySync();
  const juniors: number[] = [];
  for (const [tid, t] of state.talentInstances) {
    if (t.owner !== state.currentPlayer) {
      continue;
    }
    const tdef = registry.getTalent(t.cardDefId);
    if (tdef.isJunior) {
      juniors.push(tid);
    }
  }
  return juniors;
}

function getAssignBatchActions(state: GameState): Action[] {
  const actions: Action[] = [];
  const player = state.getPlayer(state.currentPlayer);

  // Can always end the batch
  actions.push(createAction(ActionType.END_ASSIGN_BATCH));

  // Assign each bench talent to each dev/ops product
  const allProducts = [...player.devProducts, ...player.opsProducts];
  for (const tid of player.bench) {
    for (const pid of allProducts) {
      actions.push(createAction(ActionType.ASSIGN_ONE, {
        targetInstance: tid,
        sourceIndex: pid,
      }));
    }
  }

  return actions;
}

function getAuditBidActions(state: GameState): Action[] {
  const actions: Action[] = [createAction(ActionType.PASS_AUDIT)];
  const player = state.getPlayer(state.currentPlayer);

  // Find face-down products of the active player being audited
  if (state.pendingDecisions.length > 0) {
    const ctx = state.pendingDecisions[0].context;
    const activePlayerId = ctx["active_player"] as number | undefined;
    if (activePlayerId !== undefined) {
      const active = state.getPlayer(activePlayerId);
      for (const pid of active.devProducts) {
        const prod = state.productInstances.get(pid)!;
        if (prod.isFaceDown) {
          // Bid at $3, $4, $5, $6 increments
          for (let bid = 3; bid < Math.min(player.cash + 1, 10); bid++) {
            actions.push(createAction(ActionType.BID_AUDIT, { targetInstance: pid, amount: bid }));
          }
        }
      }
    }
  }

  return actions;
}

function getAuditResolveActions(state: GameState): Action[] {
  const actions: Action[] = [createAction(ActionType.FOLD)];
  const prodId = state.auditTargetProduct;
  if (prodId !== null) {
    if (canSettle(state, prodId)) {
      const owner = state.productInstances.get(prodId)!.owner;
      if (state.players[owner].cash >= 6) {
        actions.push(createAction(ActionType.SETTLE));
      }
    }
  }
  return actions;
}

function getModeDeclareActions(state: GameState): Action[] {
  const actions: Action[] = [];
  const registry = getRegistrySync();

  // Find the talent that needs mode declaration (stored in pending_decisions context)
  if (state.pendingDecisions.length > 0) {
    const decision = state.pendingDecisions[0];
    const tid = decision.context["talent_id"] as number | undefined;
    if (tid !== undefined) {
      const talent = state.talentInstances.get(tid)!;
      const tdef = registry.getTalent(talent.cardDefId);

      // Available modes: native output type + trained skills
      const modes = new Set<CubeType>();
      if (tdef.outputType !== null && tdef.outputType !== CubeType.QA) {
        modes.add(tdef.outputType);
      }
      if (tdef.isFlex) {
        modes.add(CubeType.SOFTWARE);
        modes.add(CubeType.HARDWARE);
      }
      for (const skill of talent.skills) {
        modes.add(skill);
      }
      // Fixer trait: can switch to QA mode
      if (tdef.trait !== null && tdef.trait === Trait.QA_SKILL) {
        modes.add(CubeType.QA);
      }

      for (const mode of modes) {
        actions.push(createAction(ActionType.CHOOSE_MODE, {
          targetInstance: tid,
          choice: mode as number,
        }));
      }
    }
  }

  return actions;
}

function getXpGraduateActions(state: GameState): Action[] {
  const actions: Action[] = [];
  if (state.pendingDecisions.length > 0) {
    const decision = state.pendingDecisions[0];
    const tid = decision.context["talent_id"] as number | undefined;
    if (tid !== undefined) {
      const talent = state.talentInstances.get(tid)!;
      // Choose one of the pending XP tokens
      const seen = new Set<CubeType>();
      for (const xp of talent.xpPending) {
        if (!seen.has(xp)) {
          actions.push(createAction(ActionType.CHOOSE_XP, {
            targetInstance: tid,
            choice: xp as number,
          }));
          seen.add(xp);
        }
      }
    }
  }
  return actions;
}

function getTalentDiscardActions(state: GameState): Action[] {
  const player = state.getPlayer(state.currentPlayer);
  const actions: Action[] = [];
  for (const tid of player.bench) {
    actions.push(createAction(ActionType.DISCARD_TALENT, { targetInstance: tid }));
  }
  return actions;
}

function getBacklogDiscardActions(state: GameState): Action[] {
  const player = state.getPlayer(state.currentPlayer);
  const actions: Action[] = [];
  for (const pid of player.productBacklog) {
    actions.push(createAction(ActionType.DISCARD_BACKLOG, { targetInstance: pid }));
  }
  return actions;
}

function getChooseOfflineActions(state: GameState): Action[] {
  const player = state.getPlayer(state.currentPlayer);
  const actions: Action[] = [];
  for (const pid of player.opsProducts) {
    const prod = state.productInstances.get(pid)!;
    if (prod.isOnline) {
      actions.push(createAction(ActionType.CHOOSE_OFFLINE, { targetInstance: pid }));
    }
  }
  return actions;
}

function getFireChoiceActions(state: GameState): Action[] {
  const player = state.getPlayer(state.currentPlayer);
  const actions: Action[] = [];
  const boardTalent = state.getBoardTalent(state.currentPlayer);
  for (const tid of boardTalent) {
    actions.push(createAction(ActionType.FIRE_STAFF, { targetInstance: tid }));
  }
  for (const tid of player.bench) {
    actions.push(createAction(ActionType.FIRE_STAFF, { targetInstance: tid }));
  }
  return actions;
}
