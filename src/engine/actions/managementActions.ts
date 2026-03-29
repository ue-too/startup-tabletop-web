/**
 * Management actions: Brainstorm, Invest, Divest, Buyback, SecondaryTrade, Acquisition.
 * Direct port from Python startup_simulator/actions/management_actions.py
 */

import { Tier, Zone } from "../types";
import type { GameState } from "../state";
import { getRegistrySync } from "../cardRegistry";
import { isPm, isSpecialist } from "../cards";
import type { Action, ActionResult } from "./base";
import { okResult, failResult } from "./base";

export function executeBrainstorm(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();

  // Flush: discard strategy cards at the indices specified in targetInstances
  // Indices are sorted descending to avoid shifting issues
  const flushIndices = [...action.targetInstances].sort((a, b) => b - a);
  for (const idx of flushIndices) {
    if (idx >= 0 && idx < player.strategyHand.length) {
      const discarded = player.strategyHand.splice(idx, 1)[0];
      state.markets.strategyDiscard.push(discarded);
    }
  }

  // Check for PM bonus (any PM on player's board)
  let hasPm = false;
  for (const [tid, talent] of state.talentInstances) {
    if (talent.owner === state.currentPlayer && (talent.zone === Zone.DEV || talent.zone === Zone.OPS)) {
      const tdef = registry.getTalent(talent.cardDefId);
      if (isPm(tdef) && !talent.onboarding) {
        hasPm = true;
        break;
      }
    }
  }

  const drawCount = hasPm ? 3 : 2;

  // Reshuffle if needed
  maybeReshuffleStrategy(state);

  // Draw cards
  const drawn: string[] = [];
  for (let i = 0; i < drawCount; i++) {
    if (state.markets.strategyDeck.length === 0) {
      maybeReshuffleStrategy(state);
    }
    if (state.markets.strategyDeck.length > 0) {
      drawn.push(state.markets.strategyDeck.pop()!);
    }
  }

  if (drawn.length === 0) {
    return failResult("No strategy cards available");
  }

  // Keep one (by choice index, default 0)
  const keepIdx = action.choice >= 0
    ? Math.max(0, Math.min(action.choice, drawn.length - 1))
    : 0;
  const kept = drawn[keepIdx];
  player.strategyHand.push(kept);

  // Discard rest
  for (let i = 0; i < drawn.length; i++) {
    if (i !== keepIdx) {
      state.markets.strategyDiscard.push(drawn[i]);
    }
  }

  return okResult(`Brainstormed: kept ${registry.getStrategy(kept).name}`);
}

function maybeReshuffleStrategy(state: GameState): void {
  if (state.markets.strategyDeck.length === 0 && state.markets.strategyDiscard.length > 0) {
    state.markets.strategyDeck = [...state.markets.strategyDiscard];
    state.markets.strategyDiscard.length = 0;
    // Note: we don't have RNG access here, so shuffle won't be random
    // The engine should handle reshuffling with proper RNG
  }
}

export function executeInvest(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const targetPid = action.targetPlayer;

  if (targetPid === state.currentPlayer) {
    return failResult("Cannot invest in yourself");
  }
  if (targetPid < 0 || targetPid >= state.numPlayers) {
    return failResult("Invalid target player");
  }

  const target = state.getPlayer(targetPid);

  // Check if target has equity to sell
  if (target.equityTokensOwn <= 1) {
    return failResult("Target has no equity to sell (must keep 1)");
  }

  // Determine share price based on target's highest active tier
  const highestTier = state.getPlayerHighestTier(targetPid);
  let price: number;
  if (highestTier >= Tier.TIER3) {
    price = 15;
  } else if (highestTier >= Tier.TIER2) {
    price = 10;
  } else {
    price = 5;
  }

  if (player.cash < price) {
    return failResult(`Cannot afford $${price}`);
  }

  // Execute transaction
  player.cash -= price;
  target.cash += price;
  target.equityTokensOwn -= 1;
  player.equityHeld.set(targetPid, (player.equityHeld.get(targetPid) ?? 0) + 1);

  return okResult(`Invested in Player ${targetPid} for $${price}`);
}

export function executeDivest(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const founderId = action.targetPlayer;
  const buyerId = action.sourceIndex;

  const tokensHeld = player.equityHeld.get(founderId) ?? 0;
  if (tokensHeld <= 0) {
    return failResult("You don't hold this equity");
  }

  if (buyerId < 0 || buyerId >= state.numPlayers) {
    return failResult("Invalid buyer");
  }
  if (buyerId === state.currentPlayer) {
    return failResult("Cannot sell to yourself");
  }

  const buyer = state.getPlayer(buyerId);

  // Price = current share price
  const highestTier = state.getPlayerHighestTier(founderId);
  let price: number;
  if (highestTier >= Tier.TIER3) {
    price = 15;
  } else if (highestTier >= Tier.TIER2) {
    price = 10;
  } else {
    price = 5;
  }

  if (buyer.cash < price) {
    return failResult("Buyer cannot afford");
  }

  // Transfer
  const newCount = tokensHeld - 1;
  if (newCount === 0) {
    player.equityHeld.delete(founderId);
  } else {
    player.equityHeld.set(founderId, newCount);
  }
  buyer.equityHeld.set(founderId, (buyer.equityHeld.get(founderId) ?? 0) + 1);
  buyer.cash -= price;
  player.cash += price;

  return okResult(`Divested equity for $${price}`);
}

export function executeBuyback(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const investorId = action.targetPlayer;

  if (investorId < 0 || investorId >= state.numPlayers) {
    return failResult("Invalid investor");
  }

  const investor = state.getPlayer(investorId);
  const tokensHeld = investor.equityHeld.get(state.currentPlayer) ?? 0;
  if (tokensHeld <= 0) {
    return failResult("Investor doesn't hold your equity");
  }

  // Price = current share price
  const highestTier = state.getPlayerHighestTier(state.currentPlayer);
  let price: number;
  if (highestTier >= Tier.TIER3) {
    price = 15;
  } else if (highestTier >= Tier.TIER2) {
    price = 10;
  } else {
    price = 5;
  }

  if (player.cash < price) {
    return failResult(`Cannot afford buyback at $${price}`);
  }

  // Transfer
  const newCount = tokensHeld - 1;
  if (newCount === 0) {
    investor.equityHeld.delete(state.currentPlayer);
  } else {
    investor.equityHeld.set(state.currentPlayer, newCount);
  }
  player.equityTokensOwn += 1;
  player.cash -= price;
  investor.cash += price;

  return okResult(`Bought back equity for $${price}`);
}

export function executeSecondaryTrade(state: GameState, action: Action): ActionResult {
  return executeDivest(state, action); // Same mechanics
}

export function executeAcquisition(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();
  const sellerId = action.targetPlayer;
  const prodId = action.targetInstance;

  if (sellerId === state.currentPlayer) {
    return failResult("Cannot acquire from yourself");
  }

  const seller = state.getPlayer(sellerId);
  if (!seller.opsProducts.includes(prodId)) {
    return failResult("Product not in seller's ops");
  }

  const prod = state.productInstances.get(prodId)!;
  const pdef = registry.getProduct(prod.cardDefId);

  // M&A Price
  const basePrices: Record<number, number> = {
    [Tier.TIER1]: 6,
    [Tier.TIER2]: 12,
    [Tier.TIER3]: 20,
  };
  let price = basePrices[pdef.tier] ?? 6;
  price += prod.hype * 5;
  price -= prod.scandal * 5;
  price -= prod.bugs * 1;

  // Check for attached specialists
  const team = state.getTalentOnProduct(prodId);
  for (const tid of team) {
    const tdef = registry.getTalent(state.talentInstances.get(tid)!.cardDefId);
    if (isSpecialist(tdef)) {
      price += 5;
    }
  }

  price = Math.max(1, price);

  if (player.cash < price) {
    return failResult(`Cannot afford $${price}`);
  }

  // Transfer product
  player.cash -= price;
  seller.cash += price;
  const sellerIdx = seller.opsProducts.indexOf(prodId);
  if (sellerIdx !== -1) {
    seller.opsProducts.splice(sellerIdx, 1);
  }
  player.opsProducts.push(prodId);
  prod.owner = state.currentPlayer;

  // Transfer attached staff
  for (const tid of team) {
    const talent = state.talentInstances.get(tid)!;
    talent.owner = state.currentPlayer;
  }

  return okResult(`Acquired ${pdef.name} for $${price}`);
}

