/**
 * Phase B: Income Phase - bandwidth check, revenue, dividends, salaries.
 * Direct port from Python startup_simulator/phases/income_phase.py
 */

import { CubeType, Trait, TalentType, Zone } from "../types";
import { GameState } from "../state";
import { getRegistrySync } from "../cardRegistry";
import { getSalesBonus } from "./enginePhase";

export function calculateBandwidth(
  state: GameState,
  playerId: number,
): [number, number] {
  /** Calculate total ops bandwidth for a player (software, hardware). */
  const registry = getRegistrySync();
  let bwSoftware = 0;
  let bwHardware = 0;

  for (const [tid, talent] of state.talentInstances) {
    if (talent.owner !== playerId || talent.zone !== Zone.OPS) continue;
    if (talent.onboarding) continue;
    const cdef = registry.getTalent(talent.cardDefId);
    const output = talent.getOutput(cdef);
    if (output <= 0) continue;

    if (cdef.isFlex || cdef.isCrossFunctional) {
      // Flex: use declared mode or default to software
      const mode = talent.declaredMode ?? CubeType.SOFTWARE;
      if (mode === CubeType.SOFTWARE) {
        bwSoftware += output;
      } else {
        bwHardware += output;
      }
    } else if (cdef.outputType === CubeType.SOFTWARE) {
      bwSoftware += output;
    } else if (cdef.outputType === CubeType.HARDWARE) {
      bwHardware += output;
    }
  }

  return [bwSoftware, bwHardware];
}

export function calculateMaintenanceCost(
  state: GameState,
  playerId: number,
): [number, number] {
  /** Calculate total maintenance cost for a player's ops products (software, hardware). */
  const registry = getRegistrySync();
  const player = state.getPlayer(playerId);
  let maintSw = 0;
  let maintHw = 0;

  for (const pid of player.opsProducts) {
    const prod = state.productInstances.get(pid)!;
    if (!prod.isOnline) continue;
    const pdef = registry.getProduct(prod.cardDefId);
    maintSw += pdef.maintSoftware;
    maintHw += pdef.maintHardware;
  }

  return [maintSw, maintHw];
}

export function checkBandwidth(state: GameState, playerId: number): boolean {
  /** Check if bandwidth covers maintenance. Returns true if OK, false if deficit. */
  const [bwSw, bwHw] = calculateBandwidth(state, playerId);
  const [maintSw, maintHw] = calculateMaintenanceCost(state, playerId);
  return bwSw >= maintSw && bwHw >= maintHw;
}

export function calculateOperationalRevenue(
  state: GameState,
  playerId: number,
): number {
  /**
   * Calculate operational revenue for a player.
   * Revenue = Sum of active product revenue + staff bonuses - bug decay.
   */
  const registry = getRegistrySync();
  const player = state.getPlayer(playerId);
  let totalRevenue = 0;

  for (const pid of player.opsProducts) {
    const prod = state.productInstances.get(pid)!;
    if (!prod.isOnline) continue;
    const pdef = registry.getProduct(prod.cardDefId);

    let productRev = pdef.revenue;

    // Staff bonuses
    const team = state.getTalentOnProduct(pid);
    let hasVpSales = false;
    for (const tid of team) {
      const talent = state.talentInstances.get(tid)!;
      const tdef = registry.getTalent(talent.cardDefId);
      if (talent.zone !== Zone.OPS || talent.onboarding) continue;

      // Sales Rep: +$2/3/4 based on XP
      if (tdef.talentType === TalentType.SALES) {
        productRev += getSalesBonus(talent, tdef);
        // VP of Sales (rank badge): ignores bug decay
        if (talent.rankBadges > 0) {
          hasVpSales = true;
        }
      } else if (tdef.talentType === TalentType.GROWTH_HACKER) {
        // Growth Hacker: +$3
        productRev += 3;
      }

      // Workaholic attribute: +$2 revenue (attached to product staff)
      if (talent.attributes.includes("workaholic")) {
        productRev += 2;
      }
    }

    // Integration bonus: Client gets +$2
    if (prod.integratedWith !== null && !prod.isHost) {
      const host = state.productInstances.get(prod.integratedWith);
      if (host && host.isOnline) {
        productRev += 2;
      }
    }

    // Bug decay: -$1 per bug
    let bugDecay = prod.bugs;

    // VP of Sales: ignores bug decay
    if (hasVpSales) {
      bugDecay = 0;
    }

    // QA with 2+ XP: prevents revenue decay on this product
    for (const tid of team) {
      const talent = state.talentInstances.get(tid)!;
      const tdef = registry.getTalent(talent.cardDefId);
      if (
        tdef.talentType === TalentType.QA &&
        talent.totalXp >= 2 &&
        talent.zone === Zone.OPS
      ) {
        bugDecay = 0;
        break;
      }
    }

    // Stickiness: Client in integration ignores bug decay
    if (prod.integratedWith !== null && !prod.isHost) {
      const host = state.productInstances.get(prod.integratedWith);
      if (host && host.isOnline) {
        bugDecay = 0; // Stickiness
      }
    }

    productRev = Math.max(0, productRev - bugDecay);
    totalRevenue += productRev;
  }

  return totalRevenue;
}

export function calculateDividendTier(operationalRevenue: number): number {
  /** Calculate dividend payout per token based on operational revenue. */
  if (operationalRevenue <= 0) return 0;
  if (operationalRevenue <= 10) return 1;
  if (operationalRevenue <= 20) return 2;
  return 3;
}

export function calculateSalaryCost(
  state: GameState,
  playerId: number,
): number {
  /** Calculate total salary cost for a player's board + bench talent. */
  const registry = getRegistrySync();
  let total = 0;

  for (const [tid, talent] of state.talentInstances) {
    if (talent.owner !== playerId) continue;
    if (talent.zone !== Zone.DEV && talent.zone !== Zone.OPS) continue;
    const cdef = registry.getTalent(talent.cardDefId);
    let sal: number;
    if (cdef.isJunior) {
      sal = talent.salary; // Dynamic based on XP
    } else {
      sal = cdef.salary;
      // Efficient trait: salary $1 in Ops (instead of $2)
      if (cdef.trait === Trait.EFFICIENT && talent.zone === Zone.OPS) {
        sal = 1;
      }
    }

    // Workaholic attribute: +$2 salary
    if (talent.attributes.includes("workaholic")) {
      sal += 2;
    }

    total += sal;
  }

  return total;
}

export function processIncome(
  state: GameState,
  playerId: number,
): Record<string, any> {
  /** Process the full income phase for a player. Returns summary dict. */
  const player = state.getPlayer(playerId);
  const registry = getRegistrySync();
  const summary: Record<string, any> = {};

  // 1. Bandwidth check (auto for Phase 1 - take products offline if needed)
  let [bwSw, bwHw] = calculateBandwidth(state, playerId);
  let [maintSw, maintHw] = calculateMaintenanceCost(state, playerId);

  if (bwSw < maintSw || bwHw < maintHw) {
    // Auto-resolve: take offline products until bandwidth is met
    // Sort by revenue (lowest first) to minimize loss
    const onlineProducts = player.opsProducts.filter(
      (pid) => state.productInstances.get(pid)!.isOnline,
    );
    onlineProducts.sort(
      (a, b) =>
        registry.getProduct(state.productInstances.get(a)!.cardDefId).revenue -
        registry.getProduct(state.productInstances.get(b)!.cardDefId).revenue,
    );
    for (const pid of onlineProducts) {
      if (bwSw >= maintSw && bwHw >= maintHw) break;
      const prod = state.productInstances.get(pid)!;
      const pdef = registry.getProduct(prod.cardDefId);
      prod.isOnline = false;
      maintSw -= pdef.maintSoftware;
      maintHw -= pdef.maintHardware;
    }
  }

  summary.bandwidth = { sw: bwSw, hw: bwHw, maintSw, maintHw };

  // 2. Operational Revenue
  const opRev = calculateOperationalRevenue(state, playerId);
  summary.operationalRevenue = opRev;

  // 3. Dividends (pay opponents who hold your equity)
  const divPerToken = calculateDividendTier(opRev);
  for (let otherId = 0; otherId < state.numPlayers; otherId++) {
    if (otherId === playerId) continue;
    const other = state.getPlayer(otherId);
    const tokensHeld = other.equityHeld.get(playerId) ?? 0;
    if (tokensHeld > 0 && divPerToken > 0) {
      const payout = tokensHeld * divPerToken;
      other.cash += payout; // Bank pays
    }
  }

  // 4. Collect dividends from equity we hold
  for (const [founderId, count] of player.equityHeld) {
    if (count > 0) {
      const founderRev = calculateOperationalRevenue(state, founderId);
      const div = calculateDividendTier(founderRev);
      player.cash += count * div;
    }
  }

  summary.dividendsReceived = 0;
  for (let fid = 0; fid < state.numPlayers; fid++) {
    if (fid === playerId) continue;
    const held = player.equityHeld.get(fid) ?? 0;
    summary.dividendsReceived +=
      held * calculateDividendTier(calculateOperationalRevenue(state, fid));
  }

  // 5. Collect operational revenue
  player.cash += opRev;
  summary.cashFromRevenue = opRev;

  // 6. Pay salaries
  const salaryCost = calculateSalaryCost(state, playerId);
  summary.salaryCost = salaryCost;

  if (player.cash >= salaryCost) {
    player.cash -= salaryCost;
  } else {
    // Cannot pay all salaries - fire cheapest first (auto for Phase 1)
    player.cash -= salaryCost;
    if (player.cash < 0) {
      // Add debt tokens
      const debt = -player.cash;
      player.cash = 0;
      player.debtTokens += Math.ceil(debt / 5); // Each debt token = $5 penalty
    }
  }

  return summary;
}
