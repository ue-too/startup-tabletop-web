/**
 * Observation encoding: game state -> fixed-size float array for RL.
 * Direct port from Python env/observation_space.py
 *
 * Layout (for max 4 players):
 *   - Global features (turn, phase, event, deck sizes)
 *   - Self player features (cash, equity, AP, etc.)
 *   - Self talent cards (bench + board, padded to MAX_TALENT)
 *   - Self products (backlog + dev + ops, padded to MAX_PRODUCTS)
 *   - Self strategy hand (padded)
 *   - Per-opponent public features (cash, board talent, products)
 *   - Market features (agency row, product market, pools)
 */

import { GameState, TalentInstance, ProductInstance } from "../engine/state";
import { getRegistrySync } from "../engine/cardRegistry";
import type { TalentCardDef, ProductCardDef } from "../engine/cards";
import { Zone } from "../engine/types";

// ── Sizing constants ──
export const MAX_PLAYERS = 4;
export const MAX_TALENT_PER_PLAYER = 20;
export const MAX_PRODUCTS_PER_PLAYER = 10;
export const MAX_STRATEGY_HAND = 3;
export const MAX_AGENCY = 4;
export const MAX_OPEN_MARKET = 5;
export const MAX_PRODUCT_MARKET = 4;
export const MAX_IDEA_POOL = 5;

// Feature sizes per card
export const TALENT_FEATURES = 18;
export const PRODUCT_FEATURES = 22;
export const STRATEGY_FEATURES = 5;

// Total sizes
export const GLOBAL_FEATURES = 12;
export const PLAYER_SCALAR_FEATURES = 12;
export const TALENT_BLOCK = MAX_TALENT_PER_PLAYER * TALENT_FEATURES;   // 360
export const PRODUCT_BLOCK = MAX_PRODUCTS_PER_PLAYER * PRODUCT_FEATURES; // 220
export const STRATEGY_BLOCK = MAX_STRATEGY_HAND * STRATEGY_FEATURES;   // 15
export const PLAYER_BLOCK = PLAYER_SCALAR_FEATURES + TALENT_BLOCK + PRODUCT_BLOCK + STRATEGY_BLOCK; // 607

export const MARKET_BLOCK =
  MAX_AGENCY * TALENT_FEATURES +
  MAX_OPEN_MARKET * TALENT_FEATURES +
  MAX_PRODUCT_MARKET * PRODUCT_FEATURES +
  MAX_IDEA_POOL * PRODUCT_FEATURES; // 360

export const OBS_SIZE = GLOBAL_FEATURES + PLAYER_BLOCK * MAX_PLAYERS + MARKET_BLOCK;
// 12 + 607*4 + 360 = 2800

// ── Helper: simple hash for strategy effect_id ──
function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h * 31) + str.charCodeAt(i)) | 0;
  }
  return ((h % 100) + 100) % 100; // ensure positive 0-99
}

// ── Encode a talent instance ──
function encodeTalent(
  obs: Float32Array,
  offset: number,
  talent: TalentInstance,
): void {
  const registry = getRegistrySync();
  const tdef = registry.getTalent(talent.cardDefId);

  obs[offset] = 1.0;                                   // exists
  obs[offset + 1] = tdef.talentType / 11.0;
  obs[offset + 2] = tdef.cost / 10.0;
  obs[offset + 3] = tdef.salary / 3.0;
  obs[offset + 4] = tdef.baseOutput / 5.0;
  obs[offset + 5] = tdef.isJunior ? 1.0 : 0.0;
  obs[offset + 6] = tdef.isCrossFunctional ? 1.0 : 0.0;
  obs[offset + 7] = isSpecialist(tdef) ? 1.0 : 0.0;
  obs[offset + 8] = talent.zone / 2.0;
  obs[offset + 9] = talent.totalXp / 4.0;
  obs[offset + 10] = talent.xpPending.length / 3.0;
  obs[offset + 11] = talent.skills.length / 3.0;
  obs[offset + 12] = talent.rankBadges / 1.0;
  obs[offset + 13] = talent.onboarding ? 1.0 : 0.0;
  obs[offset + 14] = (talent.declaredMode ?? 0) / 2.0;
  obs[offset + 15] = talent.attributes.length / 3.0;
  obs[offset + 16] = talent.equityVested !== null ? 1.0 : 0.0;
  obs[offset + 17] = talent.getOutput(tdef) / 7.0;
}

/** Check if a talent type is a specialist (matches Python is_specialist). */
function isSpecialist(tdef: TalentCardDef): boolean {
  const t = tdef.talentType;
  // TalentType: QA=6, SALES=7, HR=8, PM=9, SENIOR_PM=10, GROWTH_HACKER=11
  return t >= 6;
}

// ── Encode a product instance ──
function encodeProduct(
  obs: Float32Array,
  offset: number,
  prod: ProductInstance,
  pdef: ProductCardDef,
): void {
  obs[offset] = 1.0;                                       // exists
  obs[offset + 1] = prod.zone / 2.0;
  obs[offset + 2] = pdef.tier / 3.0;
  obs[offset + 3] = (pdef.sector ?? 0) / 5.0;
  obs[offset + 4] = pdef.costSoftware / 20.0;
  obs[offset + 5] = pdef.costHardware / 20.0;
  obs[offset + 6] = pdef.revenue / 15.0;
  obs[offset + 7] = pdef.valuation / 28.0;
  obs[offset + 8] = pdef.maintSoftware / 3.0;
  obs[offset + 9] = pdef.maintHardware / 3.0;

  // Progress
  const [swCost, hwCost] = prod.getEffectiveCost(pdef);
  obs[offset + 10] = prod.cubesSoftware / Math.max(swCost, 1);
  obs[offset + 11] = prod.cubesHardware / Math.max(hwCost, 1);
  obs[offset + 12] = prod.bugs / 5.0;
  obs[offset + 13] = prod.hype / 3.0;
  obs[offset + 14] = prod.scandal / 3.0;
  obs[offset + 15] = prod.isFaceDown ? 1.0 : 0.0;
  obs[offset + 16] = prod.isFeatureComplete ? 1.0 : 0.0;
  obs[offset + 17] = prod.isOnline ? 1.0 : 0.0;
  obs[offset + 18] = prod.integratedWith !== null ? 1.0 : 0.0;
  obs[offset + 19] = prod.isHost ? 1.0 : 0.0;

  // Tags (simplified)
  obs[offset + 20] = (pdef.provides ?? 0) / 21.0;
  obs[offset + 21] = pdef.requires.length / 3.0;
}

// ── Encode active event ──
function encodeEvent(state: GameState): number {
  if (state.markets.activeEvent === null) return 0.0;
  const registry = getRegistrySync();
  const eventIds = registry.eventCards.map((e) => e.cardDefId);
  const idx = eventIds.indexOf(state.markets.activeEvent);
  if (idx < 0) return 0.0;
  return (idx + 1) / eventIds.length;
}

// ── Get all talent ids for a player: bench + board ──
function getAllTalentIds(state: GameState, playerId: number): number[] {
  const player = state.getPlayer(playerId);
  const board = state.getBoardTalent(playerId);
  return [...player.bench, ...board];
}

// ── Get all product ids for a player ──
function getAllProductIds(state: GameState, playerId: number, includeHidden: boolean): number[] {
  const player = state.getPlayer(playerId);
  const result: number[] = [];
  if (includeHidden) {
    result.push(...player.productBacklog);
  }
  result.push(...player.devProducts);
  result.push(...player.opsProducts);
  return result;
}

// ── Main encoding function ──
export function encodeObservation(state: GameState, playerId: number): Float32Array {
  const obs = new Float32Array(OBS_SIZE); // zero-initialized
  const registry = getRegistrySync();
  let offset = 0;

  // --- Global features ---
  obs[offset] = state.turnNumber / 30.0;
  obs[offset + 1] = state.phase / 5.0;
  obs[offset + 2] = state.subPhase / 32.0;
  obs[offset + 3] = state.currentPlayer / MAX_PLAYERS;
  obs[offset + 4] = state.numPlayers / MAX_PLAYERS;
  obs[offset + 5] = state.marketCrashDrawn ? 1.0 : 0.0;
  obs[offset + 6] = state.markets.seedDeck.length / 30.0;
  obs[offset + 7] = state.markets.growthDeck.length / 35.0;
  obs[offset + 8] = state.markets.talentDeck.length / 22.0;
  obs[offset + 9] = state.markets.strategyDeck.length / 30.0;
  obs[offset + 10] = state.markets.eventDeck.length / 18.0;
  obs[offset + 11] = encodeEvent(state);
  offset += GLOBAL_FEATURES;

  // --- Player blocks (self first, then opponents in order) ---
  const playerOrder: number[] = [playerId];
  for (let i = 0; i < state.numPlayers; i++) {
    if (i !== playerId) playerOrder.push(i);
  }
  // Pad to MAX_PLAYERS
  while (playerOrder.length < MAX_PLAYERS) {
    playerOrder.push(-1);
  }

  for (let idx = 0; idx < playerOrder.length; idx++) {
    const pid = playerOrder[idx];
    const isSelf = pid === playerId;

    if (pid < 0 || pid >= state.numPlayers) {
      offset += PLAYER_BLOCK;
      continue;
    }

    const player = state.getPlayer(pid);

    // Scalar features
    obs[offset] = player.cash / 50.0;
    obs[offset + 1] = player.equityTokensOwn / 3.0;
    obs[offset + 2] = isSelf ? player.actionPoints / 3.0 : 0.0;
    obs[offset + 3] = player.marketShareTokens / 10.0;
    obs[offset + 4] = player.debtTokens / 5.0;
    obs[offset + 5] = player.bench.length / 5.0;
    obs[offset + 6] = player.devProducts.length / 3.0;
    obs[offset + 7] = player.opsProducts.length / 8.0;
    obs[offset + 8] = isSelf ? player.productBacklog.length / 3.0 : 0.0;
    obs[offset + 9] = isSelf ? player.strategyHand.length / 3.0 : 0.0;
    // Equity held in others
    let totalEquity = 0;
    player.equityHeld.forEach((count) => {
      totalEquity += count;
    });
    obs[offset + 10] = totalEquity / 6.0;
    obs[offset + 11] = 1.0; // Player exists flag
    offset += PLAYER_SCALAR_FEATURES;

    // Talent cards
    const talentIds = getAllTalentIds(state, pid);
    for (let tIdx = 0; tIdx < MAX_TALENT_PER_PLAYER; tIdx++) {
      if (tIdx < talentIds.length) {
        const tid = talentIds[tIdx];
        const talent = state.talentInstances.get(tid)!;
        // Hide opponent bench cards
        if (!isSelf && talent.zone === Zone.BENCH) {
          offset += TALENT_FEATURES;
          continue;
        }
        encodeTalent(obs, offset, talent);
      }
      offset += TALENT_FEATURES;
    }

    // Product cards
    const productIds = getAllProductIds(state, pid, isSelf);
    for (let pIdx = 0; pIdx < MAX_PRODUCTS_PER_PLAYER; pIdx++) {
      if (pIdx < productIds.length) {
        const pidProd = productIds[pIdx];
        const prod = state.productInstances.get(pidProd)!;
        const pdef = registry.getProduct(prod.cardDefId);
        // Hide opponent face-down products
        if (!isSelf && prod.isFaceDown) {
          obs[offset] = 1.0;       // exists
          obs[offset + 1] = prod.zone / 2.0;
          offset += PRODUCT_FEATURES;
          continue;
        }
        encodeProduct(obs, offset, prod, pdef);
      }
      offset += PRODUCT_FEATURES;
    }

    // Strategy hand (self only)
    if (isSelf) {
      for (let sIdx = 0; sIdx < MAX_STRATEGY_HAND; sIdx++) {
        if (sIdx < player.strategyHand.length) {
          const cardId = player.strategyHand[sIdx];
          const sdef = registry.getStrategy(cardId);
          obs[offset] = 1.0;       // exists
          obs[offset + 1] = sdef.cost / 10.0;
          const catMap: Record<string, number> = {
            training: 0.25,
            warfare: 0.5,
            attribute: 0.75,
            utility: 1.0,
          };
          obs[offset + 2] = catMap[sdef.category] ?? 0.0;
          obs[offset + 3] = simpleHash(sdef.effectId) / 100.0;
          obs[offset + 4] = sdef.count / 4.0;
        }
        offset += STRATEGY_FEATURES;
      }
    } else {
      offset += STRATEGY_BLOCK;
    }
  }

  // --- Market features ---

  // Agency row
  for (let aIdx = 0; aIdx < MAX_AGENCY; aIdx++) {
    if (aIdx < state.markets.agencyRow.length) {
      const tid = state.markets.agencyRow[aIdx];
      const talent = state.talentInstances.get(tid)!;
      encodeTalent(obs, offset, talent);
    }
    offset += TALENT_FEATURES;
  }

  // Open job market
  const openMarketList = [...state.markets.openJobMarket];
  for (let mIdx = 0; mIdx < MAX_OPEN_MARKET; mIdx++) {
    if (mIdx < openMarketList.length) {
      const tid = openMarketList[mIdx];
      const talent = state.talentInstances.get(tid)!;
      encodeTalent(obs, offset, talent);
    }
    offset += TALENT_FEATURES;
  }

  // Product market (seed + growth)
  const allMarketProducts = [
    ...state.markets.productMarketSeed,
    ...state.markets.productMarketGrowth,
  ];
  for (let pIdx = 0; pIdx < MAX_PRODUCT_MARKET; pIdx++) {
    if (pIdx < allMarketProducts.length) {
      const pidProd = allMarketProducts[pIdx];
      const prod = state.productInstances.get(pidProd)!;
      const pdef = registry.getProduct(prod.cardDefId);
      encodeProduct(obs, offset, prod, pdef);
    }
    offset += PRODUCT_FEATURES;
  }

  // Open idea pool
  const ideaPoolList = [...state.markets.openIdeaPool];
  for (let iIdx = 0; iIdx < MAX_IDEA_POOL; iIdx++) {
    if (iIdx < ideaPoolList.length) {
      const pidProd = ideaPoolList[iIdx];
      const prod = state.productInstances.get(pidProd)!;
      const pdef = registry.getProduct(prod.cardDefId);
      encodeProduct(obs, offset, prod, pdef);
    }
    offset += PRODUCT_FEATURES;
  }

  return obs;
}
