/**
 * Phase D: Engine Phase - cube generation, QA, audit, commit, complete, refill, cleanup.
 * Direct port from Python startup_simulator/phases/engine_phase.py
 */

import { CubeType, Trait, TalentType, Tier, Sector, Zone } from "../types";
import type { GameState, TalentInstance } from "../state";
import type { TalentCardDef, ProductCardDef } from "../cards";
import { isSpecialist, isPm, isSeniorDev, isHybrid, isSoftwareOnly, isHardwareOnly } from "../cards";
import { getRegistrySync } from "../cardRegistry";
import { refillProductMarketSeed, refillProductMarketGrowth } from "../actions/productActions";

// ---------------------------------------------------------------------------
// Trait helpers
// ---------------------------------------------------------------------------

export function hasTrait(
  talent: TalentInstance,
  cardDef: TalentCardDef,
  trait: Trait,
): boolean {
  return cardDef.trait === trait;
}

export function hasCleanCode(
  talent: TalentInstance,
  cardDef: TalentCardDef,
): boolean {
  /** Check if unit has Clean Code trait (never generates bugs). */
  if (cardDef.trait === Trait.CLEAN_CODE) return true;
  // Also check attached attribute cards
  return talent.attributes.includes("clean_coder");
}

export function getQaBugRemoval(
  talent: TalentInstance,
  cardDef: TalentCardDef,
): number {
  /** How many bugs can this QA remove per turn? */
  if (cardDef.talentType !== TalentType.QA) return 0;
  let base = 1;
  // +1 XP = removes 2 bugs, +2 XP = removes 2 bugs (same, but adds decay prevention)
  if (talent.totalXp >= 1) {
    base = 2;
  }
  return base;
}

export function getSalesBonus(
  talent: TalentInstance,
  cardDef: TalentCardDef,
): number {
  /** Revenue bonus from Sales Rep. */
  if (cardDef.talentType !== TalentType.SALES) return 0;
  const base = 2;
  if (talent.totalXp >= 2) return 4;
  if (talent.totalXp >= 1) return 3;
  return base;
}

export function getPmSynergy(
  talent: TalentInstance,
  cardDef: TalentCardDef,
  teamSize: number,
): number {
  /** PM synergy bonus: +1 output per other teammate. */
  if (!isPm(cardDef)) return 0;
  if (talent.onboarding) return 0;
  return Math.max(0, teamSize - 1);
}

// ---------------------------------------------------------------------------
// Cube generation
// ---------------------------------------------------------------------------

export function generateCubes(state: GameState, playerId: number): void {
  /**
   * Generate work cubes for all dev teams of a player.
   * Cubes go into the transient zone first (committed later).
   * Also handles Pending XP for juniors.
   */
  const registry = getRegistrySync();
  const player = state.getPlayer(playerId);

  for (const pid of player.devProducts) {
    const prod = state.productInstances.get(pid)!;
    const pdef = registry.getProduct(prod.cardDefId);
    const team = state.getTalentOnProduct(pid);
    const teamSize = team.length;

    // Check for stalled project (Tier 2/3 without matching lead)
    let isStalled = false;
    if (pdef.tier >= Tier.TIER2) {
      isStalled = !hasMatchingLead(state, pid, pdef);
    }

    // First pass: compute PM synergy bonus
    let pmBonusSw = 0;
    let pmBonusHw = 0;
    for (const tid of team) {
      const talent = state.talentInstances.get(tid)!;
      const tdef = registry.getTalent(talent.cardDefId);
      const synergy = getPmSynergy(talent, tdef, teamSize);
      if (synergy > 0 && !isStalled) {
        // PM bonus goes to the product's majority cube type
        if (pdef.costSoftware >= pdef.costHardware) {
          pmBonusSw += synergy;
        } else {
          pmBonusHw += synergy;
        }
      }
    }

    // Second pass: generate cubes from each team member
    for (const tid of team) {
      const talent = state.talentInstances.get(tid)!;
      if (talent.onboarding) continue;
      const tdef = registry.getTalent(talent.cardDefId);

      // Specialists
      if (isSpecialist(tdef)) {
        if (tdef.talentType === TalentType.QA) {
          // QA in dev: remove bugs
          const removals = getQaBugRemoval(talent, tdef);
          for (let i = 0; i < removals; i++) {
            if (prod.bugs > 0) prod.bugs -= 1;
          }
        } else if (tdef.talentType === TalentType.GROWTH_HACKER) {
          // Growth hacker in dev does nothing
        }
        continue;
      }

      // Stalled projects produce 0 output
      if (isStalled) continue;

      const output = talent.getOutput(tdef);
      if (output <= 0) continue;

      // Determine cube type via effective mode
      const mode = talent.getEffectiveMode(tdef);
      if (mode === null) continue;

      // Place cubes in transient zone
      if (mode === CubeType.SOFTWARE) {
        prod.transientSoftware += output;
      } else if (mode === CubeType.HARDWARE) {
        prod.transientHardware += output;
      }

      // Pending XP for juniors
      if (tdef.isJunior && !talent.hasPendingXpOfType(mode)) {
        if (talent.xpPending.length < 3 && talent.totalXp < 4) {
          talent.xpPending.push(mode);
        }
      }
    }

    // Apply PM synergy bonus
    if (!isStalled) {
      prod.transientSoftware += pmBonusSw;
      prod.transientHardware += pmBonusHw;
    }

    // Handle juniors acting as QA (green skill token)
    for (const tid of team) {
      const talent = state.talentInstances.get(tid)!;
      if (talent.onboarding) continue;
      const tdef = registry.getTalent(talent.cardDefId);
      if (tdef.isJunior && talent.declaredMode === CubeType.QA) {
        // Junior in QA mode removes 1 bug (base) + XP bonus
        const xpBonus = talent.xpPermanent.filter(
          (x) => x === CubeType.QA,
        ).length;
        const removals = 1 + xpBonus;
        for (let i = 0; i < removals; i++) {
          if (prod.bugs > 0) prod.bugs -= 1;
        }
        // Pending QA XP
        if (!talent.hasPendingXpOfType(CubeType.QA)) {
          if (talent.xpPending.length < 3 && talent.totalXp < 4) {
            talent.xpPending.push(CubeType.QA);
          }
        }
      }
    }

    // Senior Hardware "The Fixer" - can switch to QA mode
    for (const tid of team) {
      const talent = state.talentInstances.get(tid)!;
      if (talent.onboarding) continue;
      const tdef = registry.getTalent(talent.cardDefId);
      if (
        tdef.trait === Trait.QA_SKILL &&
        talent.declaredMode === CubeType.QA
      ) {
        if (prod.bugs > 0) prod.bugs -= 1;
      }
    }
  }
}

export function hasMatchingLead(
  state: GameState,
  productId: number,
  pdef: ProductCardDef,
): boolean {
  /** Check if a product has a matching lead for Tier 2/3. */
  const registry = getRegistrySync();
  const team = state.getTalentOnProduct(productId);

  const needsSwLead = pdef.costSoftware > 0;
  const needsHwLead = pdef.costHardware > 0;
  let hasSwLead = false;
  let hasHwLead = false;

  for (const tid of team) {
    const talent = state.talentInstances.get(tid)!;
    const tdef = registry.getTalent(talent.cardDefId);

    // Check if this talent is Tier 2+
    let isTier2 = isSeniorDev(tdef) || (tdef.isJunior && talent.rankBadges > 0);
    // Visionary attribute: counts as lead for any tier
    if (talent.attributes.includes("visionary")) {
      isTier2 = true;
    }

    if (!isTier2) continue;

    if (talent.canLeadSoftware(tdef)) hasSwLead = true;
    if (talent.canLeadHardware(tdef)) hasHwLead = true;
  }

  if (isHybrid(pdef)) {
    return (!needsSwLead || hasSwLead) && (!needsHwLead || hasHwLead);
  } else if (isSoftwareOnly(pdef)) {
    return hasSwLead;
  } else if (isHardwareOnly(pdef)) {
    return hasHwLead;
  }
  return true;
}

// ---------------------------------------------------------------------------
// QA in Ops
// ---------------------------------------------------------------------------

export function processQaOps(state: GameState, playerId: number): void {
  /** QA staff in Ops remove bugs from maintenance products. */
  const registry = getRegistrySync();
  const player = state.getPlayer(playerId);

  for (const pid of player.opsProducts) {
    const prod = state.productInstances.get(pid)!;
    const team = state.getTalentOnProduct(pid);

    for (const tid of team) {
      const talent = state.talentInstances.get(tid)!;
      if (talent.onboarding) continue;
      const tdef = registry.getTalent(talent.cardDefId);

      if (tdef.talentType === TalentType.QA) {
        const removals = getQaBugRemoval(talent, tdef);
        for (let i = 0; i < removals; i++) {
          if (prod.bugs > 0) prod.bugs -= 1;
        }
        // Pending XP for junior QA in ops
        if (tdef.isJunior && !talent.hasPendingXpOfType(CubeType.QA)) {
          if (talent.xpPending.length < 3 && talent.totalXp < 4) {
            talent.xpPending.push(CubeType.QA);
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Commit cubes
// ---------------------------------------------------------------------------

export function commitCubes(state: GameState, playerId: number): void {
  /** Move legal cubes from transient zone to product tracks. */
  const registry = getRegistrySync();
  const player = state.getPlayer(playerId);

  for (const pid of player.devProducts) {
    const prod = state.productInstances.get(pid)!;
    const pdef = registry.getProduct(prod.cardDefId);
    const [swCost, hwCost] = prod.getEffectiveCost(pdef);

    // Commit software cubes (cap at effective cost)
    const swNeeded = Math.max(0, swCost - prod.cubesSoftware);
    const swCommit = Math.min(prod.transientSoftware, swNeeded);
    prod.cubesSoftware += swCommit;

    // Commit hardware cubes
    const hwNeeded = Math.max(0, hwCost - prod.cubesHardware);
    const hwCommit = Math.min(prod.transientHardware, hwNeeded);
    prod.cubesHardware += hwCommit;

    // Clear transient zone
    prod.transientSoftware = 0;
    prod.transientHardware = 0;

    // Check if feature complete
    if (prod.isDevelopmentComplete(pdef)) {
      prod.isFeatureComplete = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Growth Hacker bug generation
// ---------------------------------------------------------------------------

export function processGrowthHackerBugs(
  state: GameState,
  playerId: number,
): void {
  /** Growth Hacker adds 1 bug to their attached product at end of turn. */
  const registry = getRegistrySync();
  for (const [tid, talent] of state.talentInstances) {
    if (talent.owner !== playerId || talent.zone !== Zone.OPS) continue;
    const tdef = registry.getTalent(talent.cardDefId);
    if (
      tdef.talentType === TalentType.GROWTH_HACKER &&
      talent.assignedProduct !== null
    ) {
      const prod = state.productInstances.get(talent.assignedProduct);
      if (prod) {
        prod.bugs += 1;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Market refill
// ---------------------------------------------------------------------------

export function refillMarkets(state: GameState): void {
  /** Refill agency row and product market. */
  refillAgencyRow(state);
  refillProductMarketSeed(state);
  refillProductMarketGrowth(state);
}

function refillAgencyRow(state: GameState): void {
  /** Refill agency row to 4 cards. */
  while (
    state.markets.agencyRow.length < 4 &&
    state.markets.talentDeck.length > 0
  ) {
    const cardDefId = state.markets.talentDeck.pop()!;
    const inst = state.createTalentInstance(cardDefId, -1, Zone.BENCH);
    state.markets.agencyRow.push(inst.instanceId);
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export function cleanupHandLimits(
  state: GameState,
  playerId: number,
): boolean {
  /** Check and enforce hand limits. Returns true if discards needed. */
  const player = state.getPlayer(playerId);
  return (
    player.bench.length > 5 ||
    player.strategyHand.length > 3 ||
    player.productBacklog.length > 3
  );
}

export function autoCleanupExcess(
  state: GameState,
  playerId: number,
): void {
  /** Auto-discard excess cards. */
  const player = state.getPlayer(playerId);

  // Bench overflow: discard to open job market
  while (player.bench.length > 5) {
    const tid = player.bench.pop()!;
    const talent = state.talentInstances.get(tid)!;
    talent.owner = -1;
    talent.zone = Zone.BENCH;
    state.markets.openJobMarket.push(tid);
    while (state.markets.openJobMarket.length > 5) {
      state.markets.openJobMarket.shift();
    }
  }

  // Strategy hand overflow: discard to strategy discard pile
  while (player.strategyHand.length > 3) {
    const cardId = player.strategyHand.pop()!;
    state.markets.strategyDiscard.push(cardId);
  }

  // Backlog overflow: discard to open idea pool
  while (player.productBacklog.length > 3) {
    const pid = player.productBacklog.pop()!;
    const prod = state.productInstances.get(pid)!;
    prod.owner = -1;
    state.markets.openIdeaPool.push(pid);
    while (state.markets.openIdeaPool.length > 5) {
      state.markets.openIdeaPool.shift();
    }
  }
}

export function clearOnboarding(state: GameState, playerId: number): void {
  /** Clear onboarding tokens at end of turn. */
  for (const [tid, talent] of state.talentInstances) {
    if (talent.owner === playerId) {
      talent.onboarding = false;
    }
  }
}

export function resetOnlineStatus(state: GameState, playerId: number): void {
  /** Reset all products to online at start of income phase. */
  const player = state.getPlayer(playerId);
  for (const pid of player.opsProducts) {
    state.productInstances.get(pid)!.isOnline = true;
  }
}

// ---------------------------------------------------------------------------
// Domain expertise
// ---------------------------------------------------------------------------

export function getDomainExpertiseSectors(
  state: GameState,
  playerId: number,
): Set<Sector> {
  /**
   * Get sectors where the player has active maintenance products.
   * Infrastructure sector does NOT generate synergy.
   */
  const registry = getRegistrySync();
  const player = state.getPlayer(playerId);
  const sectors = new Set<Sector>();

  for (const pid of player.opsProducts) {
    const prod = state.productInstances.get(pid)!;
    if (!prod.isOnline) continue;
    const pdef = registry.getProduct(prod.cardDefId);
    if (pdef.sector !== null && pdef.sector !== Sector.INFRA) {
      sectors.add(pdef.sector);
    }
  }

  return sectors;
}

export function applyDomainExpertise(
  state: GameState,
  playerId: number,
  productDef: ProductCardDef,
): [number, number] {
  /**
   * Calculate effective cost after domain expertise reduction.
   * Returns [effectiveSwCost, effectiveHwCost].
   * -2 cubes total for matching sector. Player can split between sw/hw for hybrid.
   * Minimum 1 cube total.
   */
  const sectors = getDomainExpertiseSectors(state, playerId);

  let swCost = productDef.costSoftware;
  let hwCost = productDef.costHardware;

  if (
    productDef.sector !== null &&
    sectors.has(productDef.sector) &&
    productDef.sector !== Sector.INFRA
  ) {
    const total = swCost + hwCost;
    const reduction = Math.min(2, total - 1); // Can't reduce below 1 total

    if (isHybrid(productDef)) {
      // For hybrid: reduce proportionally, bias toward larger cost
      let swReduce: number;
      let hwReduce: number;
      if (swCost >= hwCost) {
        swReduce = Math.min(reduction, swCost);
        hwReduce = Math.min(reduction - swReduce, hwCost);
      } else {
        hwReduce = Math.min(reduction, hwCost);
        swReduce = Math.min(reduction - hwReduce, swCost);
      }
      swCost -= swReduce;
      hwCost -= hwReduce;
    } else if (swCost > 0) {
      swCost =
        hwCost === 0
          ? Math.max(1, swCost - reduction)
          : swCost - Math.min(reduction, swCost);
    } else {
      hwCost =
        swCost === 0
          ? Math.max(1, hwCost - reduction)
          : hwCost - Math.min(reduction, hwCost);
    }

    // Ensure minimum 1 total
    if (swCost + hwCost < 1) {
      if (productDef.costSoftware > 0) {
        swCost = 1;
      } else {
        hwCost = 1;
      }
    }
  }

  return [swCost, hwCost];
}
