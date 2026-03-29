/**
 * Talent-related actions: Recruit, Assign, Recall, Reassign, Layoff/Source.
 * Direct port from Python startup_simulator/actions/talent_actions.py
 */

import { TalentType, Tier, Trait, Zone } from "../types";
import type { GameState } from "../state";
import { getRegistrySync } from "../cardRegistry";
import { isPm } from "../cards";
import type { Action, ActionResult } from "./base";
import { okResult, failResult } from "./base";

export function executeRecruit(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();

  if (action.sourceType === "university_sw") {
    const cost = 2;
    if (player.cash < cost) {
      return failResult("Not enough cash");
    }
    player.cash -= cost;
    const inst = state.createTalentInstance("jr_software", state.currentPlayer, Zone.BENCH);
    player.bench.push(inst.instanceId);
    return okResult(`Recruited Junior Software Dev (id=${inst.instanceId})`);
  }

  if (action.sourceType === "university_hw") {
    const cost = 2;
    if (player.cash < cost) {
      return failResult("Not enough cash");
    }
    player.cash -= cost;
    const inst = state.createTalentInstance("jr_hardware", state.currentPlayer, Zone.BENCH);
    player.bench.push(inst.instanceId);
    return okResult(`Recruited Junior Hardware Eng (id=${inst.instanceId})`);
  }

  if (action.sourceType === "agency" || action.sourceType === "agency_deploy") {
    const idx = action.sourceIndex;
    if (idx < 0 || idx >= state.markets.agencyRow.length) {
      return failResult("Invalid agency index");
    }
    const talentId = state.markets.agencyRow[idx];
    const talentInst = state.talentInstances.get(talentId)!;
    const cardDef = registry.getTalent(talentInst.cardDefId);
    const cost = cardDef.cost;
    if (player.cash < cost) {
      return failResult("Not enough cash");
    }
    player.cash -= cost;
    state.markets.agencyRow.splice(idx, 1);
    talentInst.owner = state.currentPlayer;

    if (action.sourceType === "agency_deploy" && action.targetInstance >= 0) {
      // Immediate deployment: place directly on board (Dev or Ops product)
      const prodId = action.targetInstance;
      const prod = state.productInstances.get(prodId);
      if (prod && prod.owner === state.currentPlayer) {
        talentInst.zone = prod.zone;
        talentInst.assignedProduct = prodId;
        // Spaghetti Code trait on deploy
        if (cardDef.trait !== null && cardDef.trait === Trait.SPAGHETTI_CODE) {
          prod.bugs += 1;
        }
      } else {
        talentInst.zone = Zone.BENCH;
        player.bench.push(talentId);
      }
    } else {
      talentInst.zone = Zone.BENCH;
      player.bench.push(talentId);
    }

    refillAgency(state);
    const deployMsg = action.sourceType === "agency_deploy" ? " (deployed to board)" : "";
    return okResult(`Recruited ${cardDef.name} from Agency${deployMsg}`);
  }

  if (action.sourceType === "open_market") {
    const idx = action.sourceIndex;
    const marketList = [...state.markets.openJobMarket];
    if (idx < 0 || idx >= marketList.length) {
      return failResult("Invalid open market index");
    }
    const talentId = marketList[idx];
    const cost = 1;
    if (player.cash < cost) {
      return failResult("Not enough cash");
    }
    player.cash -= cost;
    // Remove from open market
    const marketIdx = state.markets.openJobMarket.indexOf(talentId);
    if (marketIdx !== -1) {
      state.markets.openJobMarket.splice(marketIdx, 1);
    }
    const talentInst = state.talentInstances.get(talentId)!;
    talentInst.owner = state.currentPlayer;
    talentInst.zone = Zone.BENCH;
    player.bench.push(talentId);
    return okResult("Recruited from Open Market");
  }

  return failResult(`Unknown source_type: ${action.sourceType}`);
}

export function refillAgency(state: GameState): void {
  while (state.markets.agencyRow.length < 4 && state.markets.talentDeck.length > 0) {
    const cardDefId = state.markets.talentDeck.pop()!;
    const inst = state.createTalentInstance(cardDefId, -1, Zone.BENCH);
    state.markets.agencyRow.push(inst.instanceId);
  }
}

export function executeAssignOne(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();
  const talentId = action.targetInstance;
  const productId = action.sourceIndex;

  if (!player.bench.includes(talentId)) {
    return failResult("Talent not on bench");
  }

  const talentInst = state.talentInstances.get(talentId)!;
  const tdef = registry.getTalent(talentInst.cardDefId);

  // Determine target zone
  const prod = state.productInstances.get(productId)!;
  const targetZone = prod.zone; // DEV or OPS

  // Move from bench to board
  const benchIdx = player.bench.indexOf(talentId);
  if (benchIdx !== -1) {
    player.bench.splice(benchIdx, 1);
  }
  talentInst.zone = targetZone;
  talentInst.owner = state.currentPlayer;
  talentInst.assignedProduct = productId;

  // Spaghetti Code trait: on entry, add 1 bug to the product
  if (tdef.trait !== null && tdef.trait === Trait.SPAGHETTI_CODE) {
    prod.bugs += 1;
  }

  // PM on Tier 2/3 project: place pending rank badge
  const pdef = registry.getProduct(prod.cardDefId);
  if (isPm(tdef) && pdef.tier >= Tier.TIER2 && talentInst.rankBadges === 0) {
    talentInst.rankPending = true;
  }

  return okResult(`Assigned talent ${talentId} to product ${productId}`);
}

export function executeRecall(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);

  // Find all talent in ops zone for this player
  const opsTalent: number[] = [];
  for (const [tid, t] of state.talentInstances) {
    if (t.owner === state.currentPlayer && t.zone === Zone.OPS) {
      opsTalent.push(tid);
    }
  }

  if (opsTalent.length === 0) {
    return failResult("No talent in Ops Zone");
  }

  for (const tid of opsTalent) {
    const talentInst = state.talentInstances.get(tid)!;
    talentInst.zone = Zone.BENCH;
    talentInst.assignedProduct = null;
    player.bench.push(tid);
  }

  return okResult(`Recalled ${opsTalent.length} talent to bench`);
}

export function executeReassign(state: GameState, action: Action): ActionResult {
  const registry = getRegistrySync();
  const talentId = action.targetInstance;
  const destProductId = action.sourceIndex;

  const talentInst = state.talentInstances.get(talentId)!;
  const tdef = registry.getTalent(talentInst.cardDefId);
  if (talentInst.owner !== state.currentPlayer) {
    return failResult("Not your talent");
  }
  if (talentInst.zone !== Zone.DEV && talentInst.zone !== Zone.OPS) {
    return failResult("Talent not on board");
  }

  // Ego trait: cannot be reassigned
  if (tdef.trait !== null && tdef.trait === Trait.EGO) {
    return failResult("This talent has the Ego trait and cannot be reassigned");
  }

  const oldProduct = talentInst.assignedProduct;
  talentInst.assignedProduct = destProductId;
  talentInst.zone = Zone.DEV;
  talentInst.onboarding = true; // Standard penalty

  // Agile PM exception: if destination team has a Senior PM (or promoted PM),
  // the reassigned talent does NOT get onboarding penalty
  const destTeam = state.getTalentOnProduct(destProductId);
  for (const tid of destTeam) {
    if (tid === talentId) {
      continue;
    }
    const other = state.talentInstances.get(tid)!;
    const otherDef = registry.getTalent(other.cardDefId);
    // Senior PM card or promoted Junior PM
    const hasAgile =
      otherDef.talentType === TalentType.SENIOR_PM ||
      (isPm(otherDef) && other.rankBadges > 0);
    if (hasAgile && !other.onboarding) {
      talentInst.onboarding = false;
      break;
    }
  }

  return okResult(`Reassigned talent ${talentId} to product ${destProductId}`);
}

export function executeLayoffSource(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();
  const toDiscard = action.targetInstances;

  if (toDiscard.length === 0) {
    return failResult("Must discard at least 1 card");
  }

  // Verify all are on bench
  for (const tid of toDiscard) {
    if (!player.bench.includes(tid)) {
      return failResult(`Talent ${tid} not on bench`);
    }
  }

  // Discard to Open Job Market
  for (const tid of toDiscard) {
    const benchIdx = player.bench.indexOf(tid);
    if (benchIdx !== -1) {
      player.bench.splice(benchIdx, 1);
    }
    const talent = state.talentInstances.get(tid)!;
    talent.owner = -1;
    talent.zone = Zone.BENCH;
    talent.assignedProduct = null;
    state.markets.openJobMarket.push(tid);
    while (state.markets.openJobMarket.length > 5) {
      state.markets.openJobMarket.shift();
    }
  }

  // Reveal X cards from talent deck
  const revealCount = toDiscard.length;
  const revealed: number[] = [];
  for (let i = 0; i < revealCount; i++) {
    if (state.markets.talentDeck.length === 0) {
      break;
    }
    const cardDefId = state.markets.talentDeck.pop()!;
    const inst = state.createTalentInstance(cardDefId, -1, Zone.BENCH);
    revealed.push(inst.instanceId);
  }

  // Push revealed cards into agency row from the left
  // Existing cards slide right, excess falls to Open Job Market
  const newAgency = [...revealed, ...state.markets.agencyRow];
  state.markets.agencyRow = newAgency.slice(0, 4);
  // Excess goes to open market
  for (const tid of newAgency.slice(4)) {
    const talent = state.talentInstances.get(tid)!;
    talent.owner = -1;
    state.markets.openJobMarket.push(tid);
    while (state.markets.openJobMarket.length > 5) {
      state.markets.openJobMarket.shift();
    }
  }

  return okResult(`Sourced ${revealed.length} new talent cards`);
}
