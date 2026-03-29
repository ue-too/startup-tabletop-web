/**
 * Audit system: bidding, legality check, fold/settle resolution.
 * Direct port from Python startup_simulator/phases/audit_phase.py
 */

import { Tag, Tier, Zone } from "../types";
import type { GameState } from "../state";
import { getRegistrySync } from "../cardRegistry";
import { isHybrid, type ProductCardDef } from "../cards";

/**
 * Check if a product has a matching lead for its transient cubes (ghost progress check).
 * Inlined from enginePhase / productActions since it is not exported there.
 */
function hasMatchingLead(
  state: GameState,
  prodId: number,
  pdef: ProductCardDef,
): boolean {
  const registry = getRegistrySync();
  const team = state.getTalentOnProduct(prodId);

  let hasSoftwareLead = false;
  let hasHardwareLead = false;

  for (const tid of team) {
    const talent = state.talentInstances.get(tid)!;
    const tdef = registry.getTalent(talent.cardDefId);
    if (talent.canLeadSoftware(tdef)) hasSoftwareLead = true;
    if (talent.canLeadHardware(tdef)) hasHardwareLead = true;
  }

  if (isHybrid(pdef)) {
    return hasSoftwareLead && hasHardwareLead;
  }
  if (pdef.costSoftware > 0) return hasSoftwareLead;
  if (pdef.costHardware > 0) return hasHardwareLead;
  return false;
}

/** Check if a face-down product is legal. */
export function checkLegality(
  state: GameState,
  productId: number,
): [boolean, string] {
  const registry = getRegistrySync();
  const prod = state.productInstances.get(productId)!;
  const pdef = registry.getProduct(prod.cardDefId);

  // 1. Ghost Progress (Tier 2/3 only)
  if (pdef.tier >= Tier.TIER2) {
    const hasTransient =
      prod.transientSoftware > 0 || prod.transientHardware > 0;
    if (hasTransient) {
      if (!hasMatchingLead(state, productId, pdef)) {
        return [false, "Ghost Progress: transient cubes without matching lead"];
      }
    }
  }

  // 2. Missing Dependencies
  if (pdef.requires.length > 0) {
    const playerTags = state.getPlayerTagsWithPartners(prod.owner);
    for (const tag of prod.legacyTags) {
      playerTags.add(tag);
    }

    for (const tag of pdef.requires) {
      if (!playerTags.has(tag)) {
        return [false, `Missing dependency: ${Tag[tag]}`];
      }
    }
  }

  return [true, "Legal"];
}

/** Resolve a legal audit: whistleblower pays bid to owner. */
export function resolveLegal(
  state: GameState,
  productId: number,
  whistleblowerId: number,
  bid: number,
): void {
  const prod = state.productInstances.get(productId)!;
  const whistleblower = state.getPlayer(whistleblowerId);
  const owner = state.getPlayer(prod.owner);
  whistleblower.cash -= bid;
  owner.cash += bid;
  prod.isFaceDown = false;
}

/** Resolve illegal-fold: project scrapped, owner pays $5 ($4 to WB, $1 to bank). */
export function resolveFold(
  state: GameState,
  productId: number,
  whistleblowerId: number,
): void {
  const prod = state.productInstances.get(productId)!;
  const owner = state.getPlayer(prod.owner);
  const whistleblower = state.getPlayer(whistleblowerId);
  const fine = Math.min(owner.cash, 5);
  const wbPayment = Math.min(fine, 4);
  owner.cash -= fine;
  whistleblower.cash += wbPayment;
  scrapProduct(state, productId);
}

/** Resolve illegal-settle: project survives, owner pays $6, WB gets $4 from bank. */
export function resolveSettle(
  state: GameState,
  productId: number,
  whistleblowerId: number,
): void {
  const registry = getRegistrySync();
  const prod = state.productInstances.get(productId)!;
  const pdef = registry.getProduct(prod.cardDefId);
  const owner = state.getPlayer(prod.owner);
  const whistleblower = state.getPlayer(whistleblowerId);

  const modifiers = state.roundModifiers;
  let auditReward = 4;
  if (modifiers && modifiers.auditRewardMultiplier !== undefined) {
    auditReward = 4 * modifiers.auditRewardMultiplier;
  }

  const settlement = Math.min(owner.cash, 6);
  owner.cash -= settlement;

  // Find tag owner for $3 payment
  if (pdef.requires.length > 0) {
    for (const tag of pdef.requires) {
      for (const other of state.players) {
        if (other.playerId === prod.owner) continue;
        if (state.getPlayerTags(other.playerId).has(tag)) {
          const tagPayment = Math.min(3, settlement);
          other.cash += tagPayment;
          break;
        }
      }
    }
  }

  whistleblower.cash += auditReward;
  prod.isFaceDown = false;
}

/** Check if settling is possible (required tag exists somewhere). */
export function canSettle(state: GameState, productId: number): boolean {
  const registry = getRegistrySync();
  const prod = state.productInstances.get(productId)!;
  const pdef = registry.getProduct(prod.cardDefId);

  if (pdef.requires.length === 0) {
    return true;
  }

  for (const tag of pdef.requires) {
    let tagExists = false;
    for (const player of state.players) {
      if (player.playerId === prod.owner) continue;
      if (state.getPlayerTags(player.playerId).has(tag)) {
        tagExists = true;
        break;
      }
    }
    if (!tagExists) return false;
  }
  return true;
}

/** Scrap a product: discard card, return staff to bench. */
export function scrapProduct(state: GameState, productId: number): void {
  const prod = state.productInstances.get(productId)!;
  const owner = state.getPlayer(prod.owner);
  const team = state.getTalentOnProduct(productId);
  for (const tid of team) {
    const talent = state.talentInstances.get(tid)!;
    talent.zone = Zone.BENCH;
    talent.assignedProduct = null;
    talent.xpPending.length = 0;
    talent.onboarding = true;
    owner.bench.push(tid);
  }
  const devIdx = owner.devProducts.indexOf(productId);
  if (devIdx !== -1) {
    owner.devProducts.splice(devIdx, 1);
  }
  state.markets.openIdeaPool.push(productId);
  while (state.markets.openIdeaPool.length > 5) {
    state.markets.openIdeaPool.shift();
  }
  prod.owner = -1;
}
