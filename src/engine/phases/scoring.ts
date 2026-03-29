/**
 * End-game scoring calculation.
 * Direct port from Python startup_simulator/phases/scoring.py
 */

import { Tier } from "../types";
import type { GameState } from "../state";
import { getRegistrySync } from "../cardRegistry";

/**
 * Calculate final valuation for all players.
 *
 * Scoring categories:
 * 1. Product Portfolio: Active maintenance products (VP + Hype - Scandal + Integration)
 * 2. Cash: $1 VP per $5
 * 3. Market Share: 2 VP per token
 * 4. Portfolio: 5 VP per opponent equity token
 * 5. Milestones: face value (Phase 4)
 * 6. Human Capital: 1 VP per XP/Skill, 2 VP per Rank Badge
 * 7. Penalties: Vaporware -2/-5/-10, Debt -5 each
 */
export function calculateFinalScores(state: GameState): number[] {
  const registry = getRegistrySync();
  const scores: number[] = [];

  for (const player of state.players) {
    let vp = 0;

    // 1. Product Portfolio
    for (const pid of player.opsProducts) {
      const prod = state.productInstances.get(pid)!;
      if (!prod.isOnline) continue;
      const pdef = registry.getProduct(prod.cardDefId);

      let productVp = pdef.valuation;
      productVp += prod.hype * 1;    // +1 VP per hype
      productVp -= prod.scandal * 1; // -1 VP per scandal
      productVp += prod.stealthLaunchBonus;

      // Integration bonus: Host gets +5 VP
      if (prod.integratedWith !== null && prod.isHost) {
        const partner = state.productInstances.get(prod.integratedWith);
        if (partner && partner.isOnline) {
          productVp += 5;
        }
      }

      vp += Math.max(0, productVp);
    }

    // 2. Cash conversion
    vp += Math.floor(player.cash / 5);

    // 3. Market Share
    vp += player.marketShareTokens * 2;

    // 4. Portfolio (equity in opponents)
    for (const [_otherId, count] of player.equityHeld) {
      vp += count * 5;
    }

    // 5. Milestones (Phase 4 - skip for now)

    // 6. Human Capital
    for (const tid of state.getAllTalentForPlayer(player.playerId)) {
      const talent = state.talentInstances.get(tid)!;
      vp += talent.xpPermanent.length;  // 1 VP per XP
      vp += talent.skills.length;        // 1 VP per Skill
      vp += talent.rankBadges * 2;       // 2 VP per Rank Badge
    }

    // 7. Penalties
    // Vaporware: backlog cards
    for (const pid of player.productBacklog) {
      const prod = state.productInstances.get(pid)!;
      const pdef = registry.getProduct(prod.cardDefId);
      if (pdef.tier === Tier.TIER1) {
        vp -= 2;
      } else if (pdef.tier === Tier.TIER2) {
        vp -= 5;
      } else if (pdef.tier === Tier.TIER3) {
        vp -= 10;
      }
    }

    // Debt penalty
    vp -= player.debtTokens * 5;

    scores.push(vp);
  }

  return scores;
}
