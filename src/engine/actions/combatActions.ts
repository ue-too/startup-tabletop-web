/**
 * Combat actions: Poaching (Headhunter card play).
 * Direct port from Python startup_simulator/actions/combat_actions.py
 */

import { TalentType, Trait, Zone } from "../types";
import type { GameState } from "../state";
import { getRegistrySync } from "../cardRegistry";
import type { Action, ActionResult } from "./base";
import { okResult, failResult } from "./base";

export function calculatePoachCost(
  state: GameState,
  talentId: number,
  multiplier: number = 2.0,
): number {
  const talent = state.talentInstances.get(talentId)!;
  const registry = getRegistrySync();
  const tdef = registry.getTalent(talent.cardDefId);

  const baseCost = tdef.cost;

  // Token value
  let tokenValue = 0;
  // XP tokens
  tokenValue += talent.xpPermanent.length * 2;
  // Skill tokens
  tokenValue += talent.skills.length * 2;
  // Attributes
  tokenValue += talent.attributes.length * 2;
  // Pending tokens
  tokenValue += talent.xpPending.length * 2;

  // Rank badge
  if (talent.rankBadges > 0) {
    if (tdef.isJunior) {
      tokenValue += 4; // Growth premium
    } else {
      tokenValue += 2;
    }
  }

  // Flight Risk attribute: cost is 1x base (ignore tokens)
  if (talent.attributes.includes("flight_risk")) {
    return baseCost; // 1x base, no multiplier
  }

  const adjustedBase = baseCost + tokenValue;

  // Mercenary trait: 1.5x instead of 2x
  let effectiveMultiplier = multiplier;
  if (tdef.trait !== null && tdef.trait === Trait.MERCENARY) {
    effectiveMultiplier = Math.min(effectiveMultiplier, 1.5);
  }

  const total = Math.ceil(adjustedBase * effectiveMultiplier);
  return total;
}

export function executePoach(
  state: GameState,
  action: Action,
  multiplier: number = 2.0,
  bypassHr: boolean = false,
): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();
  const victimId = action.targetPlayer;
  const talentId = action.targetInstance;

  if (victimId < 0 || victimId === state.currentPlayer) {
    return failResult("Invalid target player");
  }
  if (victimId >= state.numPlayers) {
    return failResult("Invalid target player");
  }

  const talent = state.talentInstances.get(talentId);
  if (talent === undefined || talent.owner !== victimId) {
    return failResult("Target talent not owned by victim");
  }

  const tdef = registry.getTalent(talent.cardDefId);

  // Check targeting restrictions
  if (talent.zone === Zone.BENCH) {
    return failResult("Cannot poach from bench");
  }
  if (talent.zone === Zone.OPS) {
    return failResult("Cannot poach from Ops Zone (Golden Handcuffs)");
  }
  if (talent.zone !== Zone.DEV) {
    return failResult("Target must be on board (Dev)");
  }

  // Check defenses
  const victim = state.getPlayer(victimId);

  // Investor immunity: cannot poach if you hold their equity
  if ((player.equityHeld.get(victimId) ?? 0) > 0) {
    return failResult("Investor immunity: you hold their equity");
  }

  // Vested interest: talent has equity token on it
  if (talent.equityVested !== null) {
    return failResult("Vested interest: talent has equity protection");
  }

  // HR Shield: check if team has HR Manager
  if (!bypassHr && talent.assignedProduct !== null) {
    const team = state.getTalentOnProduct(talent.assignedProduct);
    for (const tid of team) {
      const t = state.talentInstances.get(tid)!;
      const td = registry.getTalent(t.cardDefId);
      if (td.talentType === TalentType.HR && !t.onboarding) {
        return failResult("HR Manager protects this team");
      }
    }
  }

  // Tapped talent (just poached) is immune
  if (talent.onboarding) {
    return failResult("Tapped talent is immune to poaching");
  }

  // Calculate cost
  const cost = calculatePoachCost(state, talentId, multiplier);
  if (player.cash < cost) {
    return failResult(`Cannot afford poach cost $${cost}`);
  }

  // Check aggressor has open board slot
  const hasSlot = player.devProducts.length > 0 || player.opsProducts.length > 0;
  if (!hasSlot) {
    return failResult("No board slot available");
  }

  // Pay to bank
  player.cash -= cost;

  // Transfer talent
  const oldProduct = talent.assignedProduct;
  talent.owner = state.currentPlayer;
  talent.onboarding = true; // Tapped: 0 output, immune to poaching
  talent.xpPending.length = 0; // Lose pending XP on transfer

  // Place on aggressor's board (first available dev product or ops)
  if (player.devProducts.length > 0) {
    talent.assignedProduct = player.devProducts[0];
    talent.zone = Zone.DEV;
  } else if (player.opsProducts.length > 0) {
    talent.assignedProduct = player.opsProducts[0];
    talent.zone = Zone.OPS;
  }

  // Impact on victim's project
  if (oldProduct !== null) {
    const prod = state.productInstances.get(oldProduct);
    if (prod && prod.zone === Zone.DEV) {
      // Check if stolen talent was a lead - project may stall
      // Stall check happens naturally in generateCubes
    }
  }

  return okResult(`Poached ${tdef.name} for $${cost}`);
}
