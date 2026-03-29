/**
 * Product-related actions: Ideation, Greenlight, Launch, Pivot.
 * Direct port from Python startup_simulator/actions/product_actions.py
 */

import { CubeType, Tag, Tier, Trait, Zone } from "../types";
import type { GameState } from "../state";
import { getRegistrySync } from "../cardRegistry";
import { isHybrid, isPm } from "../cards";
import type { ProductCardDef } from "../cards";
import type { Action, ActionResult } from "./base";
import { okResult, failResult } from "./base";
import { applyDomainExpertise } from "../phases/enginePhase";

export function executeIdeation(state: GameState, action: Action): ActionResult {
  /**
   * Draft a product card to backlog.
   *
   * source_type: "seed_market", "growth_market", "seed_deck", "growth_deck", "idea_pool"
   * source_index: index in the relevant market row or pool
   */
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();

  // Check backlog limit (allow overflow to 4, must discard during cleanup)
  if (player.productBacklog.length >= 4) {
    return failResult("Backlog overflow already at max");
  }

  if (action.sourceType === "seed_market") {
    const idx = action.sourceIndex;
    if (idx < 0 || idx >= state.markets.productMarketSeed.length) {
      return failResult("Invalid seed market index");
    }
    const prodId = state.markets.productMarketSeed.splice(idx, 1)[0];
    const prodInst = state.productInstances.get(prodId)!;
    prodInst.owner = state.currentPlayer;
    player.productBacklog.push(prodId);
    refillProductMarketSeed(state);
    return okResult(`Drafted ${registry.getProduct(prodInst.cardDefId).name}`);

  } else if (action.sourceType === "growth_market") {
    const idx = action.sourceIndex;
    if (idx < 0 || idx >= state.markets.productMarketGrowth.length) {
      return failResult("Invalid growth market index");
    }
    const prodId = state.markets.productMarketGrowth.splice(idx, 1)[0];
    const prodInst = state.productInstances.get(prodId)!;
    const pdef = registry.getProduct(prodInst.cardDefId);
    if (pdef.isMarketCrash) {
      state.marketCrashDrawn = true;
      state.finishRound = true;
      return { success: true, message: "MARKET CRASH DRAWN!", gameOver: false };
    }
    prodInst.owner = state.currentPlayer;
    player.productBacklog.push(prodId);
    refillProductMarketGrowth(state);
    return okResult(`Drafted ${pdef.name}`);

  } else if (action.sourceType === "seed_deck") {
    // Blind draft: draw 3 cards, keep 1 (by choice index), discard 2 to Idea Pool
    if (state.markets.seedDeck.length === 0) {
      return failResult("Seed deck empty");
    }
    const drawn: string[] = [];
    for (let i = 0; i < 3; i++) {
      if (state.markets.seedDeck.length > 0) {
        drawn.push(state.markets.seedDeck.pop()!);
      }
    }
    if (drawn.length === 0) {
      return failResult("Seed deck empty");
    }
    const keepIdx = action.choice >= 0
      ? Math.max(0, Math.min(action.choice, drawn.length - 1))
      : 0;
    const keptId = drawn[keepIdx];
    const pdef = registry.getProduct(keptId);
    const prodInst = state.createProductInstance(keptId, state.currentPlayer, Zone.BENCH);
    player.productBacklog.push(prodInst.instanceId);
    for (let i = 0; i < drawn.length; i++) {
      if (i !== keepIdx) {
        const discardInst = state.createProductInstance(drawn[i], -1, Zone.BENCH);
        addToIdeaPool(state, discardInst.instanceId);
      }
    }
    return okResult(`Drafted ${pdef.name} from Seed Deck (blind)`);

  } else if (action.sourceType === "growth_deck") {
    // Blind draft: draw 3, keep 1, discard 2
    if (state.markets.growthDeck.length === 0) {
      return failResult("Growth deck empty");
    }
    const drawn: string[] = [];
    for (let i = 0; i < 3; i++) {
      if (state.markets.growthDeck.length > 0) {
        const cid = state.markets.growthDeck.pop()!;
        const pdefCheck = registry.getProduct(cid);
        if (pdefCheck.isMarketCrash) {
          state.marketCrashDrawn = true;
          state.finishRound = true;
          continue;
        }
        drawn.push(cid);
      }
    }
    if (drawn.length === 0) {
      if (state.marketCrashDrawn) {
        return { success: true, message: "MARKET CRASH DRAWN!", gameOver: false };
      }
      return failResult("Growth deck empty");
    }
    const keepIdx = action.choice >= 0
      ? Math.max(0, Math.min(action.choice, drawn.length - 1))
      : 0;
    const keptId = drawn[keepIdx];
    const pdef = registry.getProduct(keptId);
    const prodInst = state.createProductInstance(keptId, state.currentPlayer, Zone.BENCH);
    player.productBacklog.push(prodInst.instanceId);
    for (let i = 0; i < drawn.length; i++) {
      if (i !== keepIdx) {
        const discardInst = state.createProductInstance(drawn[i], -1, Zone.BENCH);
        addToIdeaPool(state, discardInst.instanceId);
      }
    }
    return okResult(`Drafted ${pdef.name} from Growth Deck (blind)`);

  } else if (action.sourceType === "idea_pool") {
    const idx = action.sourceIndex;
    const poolList = [...state.markets.openIdeaPool];
    if (idx < 0 || idx >= poolList.length) {
      return failResult("Invalid idea pool index");
    }
    const prodId = poolList[idx];
    const removeIdx = state.markets.openIdeaPool.indexOf(prodId);
    state.markets.openIdeaPool.splice(removeIdx, 1);
    const prodInst = state.productInstances.get(prodId)!;
    prodInst.owner = state.currentPlayer;
    player.productBacklog.push(prodId);
    return okResult("Drafted from Open Idea Pool");
  }

  return failResult(`Unknown source_type: ${action.sourceType}`);
}

export function executeGreenlight(state: GameState, action: Action): ActionResult {
  /**
   * Move product from backlog to development zone (0 AP).
   *
   * target_instance: product instance_id in backlog
   */
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();
  const prodId = action.targetInstance;

  if (!player.productBacklog.includes(prodId)) {
    return failResult("Product not in backlog");
  }
  if (player.devProducts.length >= 3) {
    return failResult("Dev zone full (max 3)");
  }

  const prodInst = state.productInstances.get(prodId)!;
  const pdef = registry.getProduct(prodInst.cardDefId);

  // Dependency check
  let paidLicense = false;
  if (pdef.requires.length > 0) {
    const playerTags = state.getPlayerTagsWithPartners(state.currentPlayer);
    const hasAllTags = pdef.requires.every((t) => playerTags.has(t));

    if (!hasAllTags) {
      const missing = pdef.requires.filter((t) => !playerTags.has(t));
      for (const missingTag of missing) {
        let tagFound = false;
        for (const otherP of state.players) {
          if (otherP.playerId === state.currentPlayer) {
            continue;
          }
          if (state.getPlayerTags(otherP.playerId).has(missingTag)) {
            tagFound = true;
            if (player.cash < 3) {
              return failResult(`Cannot afford $3 license for ${Tag[missingTag]}`);
            }
            player.cash -= 3;
            otherP.cash += 3;
            paidLicense = true;
            break;
          }
        }
        if (!tagFound) {
          return failResult(`No one has tag ${Tag[missingTag]}`);
        }
      }
    }
  }

  // Apply domain expertise cost reduction
  const [effSw, effHw] = applyDomainExpertise(state, state.currentPlayer, pdef);
  prodInst.effectiveCostSoftware = effSw;
  prodInst.effectiveCostHardware = effHw;

  // Move to dev
  const backlogIdx = player.productBacklog.indexOf(prodId);
  player.productBacklog.splice(backlogIdx, 1);
  player.devProducts.push(prodId);
  prodInst.zone = Zone.DEV;

  // Stealth: face-down unless license was paid
  prodInst.isFaceDown = !paidLicense;

  return okResult(`Greenlit ${pdef.name}`);
}

export function executeLaunch(state: GameState, action: Action): ActionResult {
  /**
   * Launch a completed product from Dev to Ops.
   *
   * target_instance: product instance_id in dev zone
   */
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();
  const prodId = action.targetInstance;

  if (!player.devProducts.includes(prodId)) {
    return failResult("Product not in dev zone");
  }

  const prodInst = state.productInstances.get(prodId)!;
  const pdef = registry.getProduct(prodInst.cardDefId);

  // Check feature complete
  if (!prodInst.isDevelopmentComplete(pdef)) {
    return failResult("Product not feature complete");
  }

  // Check 0 bugs
  if (prodInst.bugs > 0) {
    return failResult(`Product has ${prodInst.bugs} bugs`);
  }

  // Lead check for Tier 2/3
  if (pdef.tier >= Tier.TIER2) {
    if (!hasMatchingLead(state, prodId, pdef)) {
      if (isHybrid(pdef)) {
        return failResult("Hybrid Tier 2/3 needs both SW and HW leads (or cross-functional)");
      }
      return failResult("Tier 2/3 product requires a matching Lead");
    }
  }

  // Move to ops
  const devIdx = player.devProducts.indexOf(prodId);
  player.devProducts.splice(devIdx, 1);
  player.opsProducts.push(prodId);
  prodInst.zone = Zone.OPS;
  prodInst.isOnline = true;

  // Move assigned staff to ops
  const team = state.getTalentOnProduct(prodId);
  for (const tid of team) {
    const talent = state.talentInstances.get(tid)!;
    talent.zone = Zone.OPS;
  }

  // XP Graduation for juniors
  for (const tid of team) {
    const talent = state.talentInstances.get(tid)!;
    const tdef = registry.getTalent(talent.cardDefId);

    if (tdef.isJunior && talent.xpPending.length > 0) {
      if (talent.totalXp < 4) {
        // Auto-graduate: pick the first pending XP
        // (In a full implementation, this would yield to the player for choice.
        //  For now, auto-pick matching native type, or first available.)
        let chosen: CubeType | null = null;
        // Prefer XP matching native output type
        if (tdef.outputType !== null) {
          for (const xp of talent.xpPending) {
            if (xp === tdef.outputType) {
              chosen = xp;
              break;
            }
          }
        }
        if (chosen === null) {
          chosen = talent.xpPending[0];
        }
        talent.xpPermanent.push(chosen);

        // Mentor trait: extra +1 XP on launch
        for (const otherTid of team) {
          const other = state.talentInstances.get(otherTid)!;
          const otherDef = registry.getTalent(other.cardDefId);
          if (otherDef.trait !== null && otherDef.trait === Trait.MENTOR && otherTid !== tid) {
            if (talent.totalXp < 4 && talent.xpPending.length > 0) {
              // Grant one more XP from remaining pending
              const remaining = talent.xpPending.filter((x) => x !== chosen);
              if (remaining.length > 0) {
                talent.xpPermanent.push(remaining[0]);
              }
            }
            break;
          }
        }
      }

      talent.xpPending.length = 0;
    } else if (!tdef.isJunior) {
      // Seniors don't gain XP from launches
      talent.xpPending.length = 0;
    }
  }

  // PM Rank promotion: Junior PM on Tier 2/3 project gets permanent rank
  for (const tid of team) {
    const talent = state.talentInstances.get(tid)!;
    const tdef = registry.getTalent(talent.cardDefId);
    if (isPm(tdef) && talent.rankPending && pdef.tier >= Tier.TIER2) {
      talent.rankBadges = 1;
      talent.rankPending = false;
    }
  }

  // Stealth launch bonus
  if (prodInst.isFaceDown) {
    if (pdef.tier === Tier.TIER2) {
      prodInst.stealthLaunchBonus = 5;
    } else if (pdef.tier === Tier.TIER3) {
      prodInst.stealthLaunchBonus = 10;
    }
    prodInst.isFaceDown = false;
  }

  return okResult(`Launched ${pdef.name}`);
}

export function executePivot(state: GameState, action: Action): ActionResult {
  /**
   * Scrap a development project.
   *
   * target_instance: product instance_id in dev zone
   */
  const player = state.getPlayer(state.currentPlayer);
  const prodId = action.targetInstance;

  if (!player.devProducts.includes(prodId)) {
    return failResult("Product not in dev zone");
  }

  // Return staff to bench
  const team = state.getTalentOnProduct(prodId);
  for (const tid of team) {
    const talent = state.talentInstances.get(tid)!;
    talent.zone = Zone.BENCH;
    talent.assignedProduct = null;
    talent.onboarding = true; // Benched staff get onboarding penalty
    talent.xpPending.length = 0; // Lose all pending XP
    player.bench.push(tid);
  }

  // Discard product to Open Idea Pool
  const devIdx = player.devProducts.indexOf(prodId);
  player.devProducts.splice(devIdx, 1);
  addToIdeaPool(state, prodId);

  return okResult("Pivoted/scrapped project");
}

export function refillProductMarketSeed(state: GameState): void {
  /** Refill seed market slots. */
  while (state.markets.productMarketSeed.length < 2 && state.markets.seedDeck.length > 0) {
    const cardDefId = state.markets.seedDeck.pop()!;
    const inst = state.createProductInstance(cardDefId, -1, Zone.BENCH);
    state.markets.productMarketSeed.push(inst.instanceId);
  }
}

export function refillProductMarketGrowth(state: GameState): void {
  /** Refill growth market slots. May draw Market Crash. */
  const registry = getRegistrySync();
  while (state.markets.productMarketGrowth.length < 2 && state.markets.growthDeck.length > 0) {
    const cardDefId = state.markets.growthDeck.pop()!;
    const pdef = registry.getProduct(cardDefId);
    if (pdef.isMarketCrash) {
      state.marketCrashDrawn = true;
      state.finishRound = true;
      continue;
    }
    const inst = state.createProductInstance(cardDefId, -1, Zone.BENCH);
    state.markets.productMarketGrowth.push(inst.instanceId);
  }
}

export function addToIdeaPool(state: GameState, prodId: number): void {
  /** Add product to Open Idea Pool (FIFO, max 5). */
  state.markets.openIdeaPool.push(prodId);
  while (state.markets.openIdeaPool.length > 5) {
    state.markets.openIdeaPool.shift(); // Remove oldest
  }
}

// ---------------------------------------------------------------------------
// Internal helper – mirrors Python _has_matching_lead
// ---------------------------------------------------------------------------

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
