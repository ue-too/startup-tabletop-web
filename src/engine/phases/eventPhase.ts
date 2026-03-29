/**
 * Phase A: Event Phase - draw and apply event card.
 * Direct port from Python startup_simulator/phases/event_phase.py
 */

import { Tier, Zone } from "../types";
import type { GameState } from "../state";
import { getRegistrySync } from "../cardRegistry";
import { defaultModifiers, parseEventModifiers, type RoundModifiers } from "../modifiers";

/** Draw an event card and set it as active. Returns the cardDefId. */
export function drawEvent(state: GameState): string | null {
  // Discard previous event
  if (state.markets.activeEvent !== null) {
    state.markets.eventDiscard.push(state.markets.activeEvent);
    state.markets.activeEvent = null;
  }

  if (state.markets.eventDeck.length === 0) {
    return null;
  }

  const cardId = state.markets.eventDeck.pop()!;
  state.markets.activeEvent = cardId;
  return cardId;
}

/** Get the RoundModifiers for the current event. */
export function getRoundModifiers(state: GameState): RoundModifiers {
  if (state.markets.activeEvent === null) {
    return defaultModifiers();
  }

  const registry = getRegistrySync();
  const eventDef = registry.getEvent(state.markets.activeEvent);
  return parseEventModifiers(eventDef.effectId);
}

/** Apply one-time immediate effects of the current event. */
export function applyImmediateEventEffects(state: GameState): void {
  if (state.markets.activeEvent === null) {
    return;
  }

  const registry = getRegistrySync();
  const eventDef = registry.getEvent(state.markets.activeEvent);

  if (eventDef.effectId === "tier1_only_bonus_3") {
    // Players with only Tier 1 products get $3
    for (const player of state.players) {
      const highest = state.getPlayerHighestTier(player.playerId);
      const hasAny = player.opsProducts.length > 0;
      if (hasAny && highest <= Tier.TIER1) {
        player.cash += 3;
      }
    }
  } else if (eventDef.effectId === "payroll_tax") {
    // Pay $1 per employee with salary > $0
    for (const player of state.players) {
      let tax = 0;
      for (const [tid, t] of state.talentInstances) {
        if (t.owner !== player.playerId) continue;
        if (t.zone !== Zone.DEV && t.zone !== Zone.OPS) continue;
        const tdef = registry.getTalent(t.cardDefId);
        if (tdef.isJunior) {
          if (t.salary > 0) tax += 1;
        } else if (tdef.salary > 0) {
          tax += 1;
        }
      }
      if (tax > 0) {
        if (player.cash >= tax) {
          player.cash -= tax;
        } else {
          // Can't pay: simplified - just take what they have
          player.cash = 0;
        }
      }
    }
  }
}
