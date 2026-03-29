/**
 * Free actions (0 AP): Play Strategy Card, Integrate, Voluntary Disclosure.
 * Direct port from Python startup_simulator/actions/free_actions.py
 */

import { CubeType, Tag, TalentType, Zone } from "../types";
import type { GameState } from "../state";
import { getRegistrySync } from "../cardRegistry";
import type { StrategyCardDef, ProductCardDef } from "../cards";
import { isPm } from "../cards";
import type { Action, ActionResult } from "./base";
import { okResult, failResult } from "./base";
import { executePoach } from "./combatActions";

export function executePlayStrategy(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();

  const idx = action.sourceIndex;
  if (idx < 0 || idx >= player.strategyHand.length) {
    return failResult("Invalid strategy card index");
  }

  const cardDefId = player.strategyHand[idx];
  const sdef = registry.getStrategy(cardDefId);

  // Check cost
  if (player.cash < sdef.cost) {
    return failResult(`Cannot afford $${sdef.cost}`);
  }

  // Execute effect
  const result = _executeStrategyEffect(state, sdef.effectId, action, sdef);
  if (!result.success) {
    return result;
  }

  // Pay cost and discard card
  player.cash -= sdef.cost;
  player.strategyHand.splice(idx, 1);
  state.markets.strategyDiscard.push(cardDefId);

  return result;
}

function _executeStrategyEffect(
  state: GameState,
  effectId: string,
  action: Action,
  sdef: StrategyCardDef,
): ActionResult {
  const registry = getRegistrySync();
  const player = state.getPlayer(state.currentPlayer);

  // --- TRAINING ---
  if (effectId === "train_software_skill") {
    return _trainSkill(state, action.targetInstance, CubeType.SOFTWARE);
  }

  if (effectId === "train_qa_skill") {
    return _trainSkill(state, action.targetInstance, CubeType.QA);
  }

  if (effectId === "train_specialist_xp") {
    return _trainSpecialist(state, action.targetInstance);
  }

  if (effectId === "add_rank_badge") {
    return _addRankBadge(state, action.targetInstance, true);
  }

  if (effectId === "add_pm_rank_badge") {
    return _addRankBadge(state, action.targetInstance, false);
  }

  // --- WARFARE ---
  if (effectId === "poach_2x") {
    // Headhunter: poach at 2x cost. Handled by combatActions.
    return _initiatePoach(state, action, 2.0, false);
  }

  if (effectId === "poach_1_5x_bypass_hr") {
    return _initiatePoach(state, action, 1.5, true);
  }

  if (effectId === "add_scandal") {
    return _addScandal(state, action);
  }

  if (effectId === "hostile_buyout") {
    return _hostileBuyout(state, action);
  }

  // --- ATTRIBUTES ---
  if (effectId.startsWith("attr_")) {
    return _attachAttribute(state, action, effectId);
  }

  // --- UTILITY ---
  if (effectId === "add_hype") {
    return _addHype(state, action);
  }

  if (effectId === "draw_5_products") {
    return _designSprint(state);
  }

  if (effectId === "cancel_attack") {
    // Cease & Desist: reaction card, handled separately
    return okResult("Cease & Desist held (reaction)");
  }

  return failResult(`Unknown effect: ${effectId}`);
}

function _trainSkill(state: GameState, talentId: number, skill: CubeType): ActionResult {
  if (talentId < 0) {
    return failResult("No talent target");
  }
  const talent = state.talentInstances.get(talentId);
  if (talent === undefined || talent.owner !== state.currentPlayer) {
    return failResult("Invalid talent");
  }
  const registry = getRegistrySync();
  const tdef = registry.getTalent(talent.cardDefId);
  if (!tdef.isJunior) {
    return failResult("Only juniors can be trained");
  }
  if (talent.skills.includes(skill)) {
    return failResult("Already has this skill");
  }
  // Check native type: can't train native skill
  if (tdef.outputType === skill) {
    return failResult("Already has native skill");
  }
  talent.skills.push(skill);
  return okResult(`Trained ${CubeType[skill]} skill`);
}

function _trainSpecialist(state: GameState, talentId: number): ActionResult {
  if (talentId < 0) {
    return failResult("No talent target");
  }
  const talent = state.talentInstances.get(talentId);
  if (talent === undefined || talent.owner !== state.currentPlayer) {
    return failResult("Invalid talent");
  }
  const registry = getRegistrySync();
  const tdef = registry.getTalent(talent.cardDefId);
  if (tdef.talentType !== TalentType.QA && tdef.talentType !== TalentType.SALES) {
    return failResult("Only QA/Sales specialists can receive training XP");
  }
  if (talent.totalXp >= 2) {
    return failResult("Specialist at max XP (2)");
  }
  talent.xpPermanent.push(CubeType.QA); // Type doesn't matter for specialists
  return okResult("Trained specialist +1 XP");
}

function _addRankBadge(state: GameState, talentId: number, developer: boolean): ActionResult {
  if (talentId < 0) {
    return failResult("No talent target");
  }
  const talent = state.talentInstances.get(talentId);
  if (talent === undefined || talent.owner !== state.currentPlayer) {
    return failResult("Invalid talent");
  }
  const registry = getRegistrySync();
  const tdef = registry.getTalent(talent.cardDefId);

  if (developer) {
    if (!tdef.isJunior) {
      return failResult("Rank badge targets junior developers");
    }
    if (talent.rankBadges > 0) {
      return failResult("Already has rank badge");
    }
    talent.rankBadges = 1;
    return okResult("Added Gold Rank Badge (Tier 2 Lead)");
  } else {
    if (!isPm(tdef)) {
      return failResult("PM rank badge targets PMs only");
    }
    if (talent.rankBadges > 0) {
      return failResult("Already has rank badge");
    }
    talent.rankBadges = 1;
    return okResult("Added PM Gold Rank Badge (Agile)");
  }
}

function _initiatePoach(
  state: GameState,
  action: Action,
  multiplier: number,
  bypassHr: boolean,
): ActionResult {
  return executePoach(state, action, multiplier, bypassHr);
}

function _addScandal(state: GameState, action: Action): ActionResult {
  const targetPid = action.targetPlayer;
  const prodId = action.targetInstance;
  if (targetPid < 0 || targetPid === state.currentPlayer) {
    return failResult("Invalid target player");
  }

  // Check investor immunity: cannot attack partner
  const player = state.getPlayer(state.currentPlayer);
  if ((player.equityHeld.get(targetPid) ?? 0) > 0) {
    return failResult("Cannot attack investment partner");
  }

  const target = state.getPlayer(targetPid);
  if (!target.opsProducts.includes(prodId)) {
    return failResult("Invalid target product");
  }

  const prod = state.productInstances.get(prodId)!;
  prod.scandal += 1;
  return okResult("Added Scandal token");
}

function _hostileBuyout(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const targetPid = action.targetPlayer; // The investor holding our equity

  if (targetPid < 0 || targetPid === state.currentPlayer) {
    return failResult("Invalid target");
  }

  const target = state.getPlayer(targetPid);
  const tokens = target.equityHeld.get(state.currentPlayer) ?? 0;
  if (tokens <= 0) {
    return failResult("Target doesn't hold your equity");
  }

  // Pay $5 to investor (card cost $4 already deducted)
  if (player.cash < 5) {
    return failResult("Cannot afford $5 buyout payment");
  }

  player.cash -= 5;
  target.cash += 5;
  const newCount = tokens - 1;
  if (newCount === 0) {
    target.equityHeld.delete(state.currentPlayer);
  } else {
    target.equityHeld.set(state.currentPlayer, newCount);
  }
  player.equityTokensOwn += 1;

  return okResult("Forced equity return via Non-Compete Suit");
}

function _attachAttribute(state: GameState, action: Action, effectId: string): ActionResult {
  const talentId = action.targetInstance;
  if (talentId < 0) {
    return failResult("No talent target");
  }

  const talent = state.talentInstances.get(talentId);
  if (talent === undefined) {
    return failResult("Invalid talent");
  }

  const player = state.getPlayer(state.currentPlayer);
  const attrName = effectId.replace("attr_", "");

  // Buff attributes target own talent
  if (["workaholic", "clean_coder", "visionary"].includes(attrName)) {
    if (talent.owner !== state.currentPlayer) {
      return failResult("Buff attributes target your own talent");
    }
  // Debuff attributes target opponent talent
  } else if (["toxic", "burnout", "flight_risk"].includes(attrName)) {
    if (talent.owner === state.currentPlayer) {
      return failResult("Debuff attributes target opponent talent");
    }
    // Check investor immunity
    if ((player.equityHeld.get(talent.owner) ?? 0) > 0) {
      return failResult("Cannot debuff investment partner");
    }
  } else {
    return failResult(`Unknown attribute: ${attrName}`);
  }

  talent.attributes.push(attrName);
  return okResult(`Attached ${attrName} attribute`);
}

function _addHype(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const prodId = action.targetInstance;
  if (!player.opsProducts.includes(prodId)) {
    return failResult("Invalid product");
  }
  const prod = state.productInstances.get(prodId)!;
  prod.hype += 1;
  return okResult("Added Hype token");
}

function _designSprint(state: GameState): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();

  const drawn: Array<[string, string]> = []; // [source, cardDefId]
  // Draw from both decks
  for (let i = 0; i < 5; i++) {
    if (state.markets.seedDeck.length > 0) {
      drawn.push(["seed", state.markets.seedDeck.pop()!]);
    } else if (state.markets.growthDeck.length > 0) {
      const cardId = state.markets.growthDeck.pop()!;
      const pdef = registry.getProduct(cardId);
      if (pdef.isMarketCrash) {
        state.marketCrashDrawn = true;
        state.finishRound = true;
        continue;
      }
      drawn.push(["growth", cardId]);
    }
  }

  if (drawn.length === 0) {
    return failResult("No products to draw");
  }

  // Auto-keep first, discard rest (simplified)
  const [keptSource, keptId] = drawn[0];
  const inst = state.createProductInstance(keptId, state.currentPlayer, Zone.BENCH);
  if (player.productBacklog.length < 4) {
    player.productBacklog.push(inst.instanceId);
  }

  for (let i = 1; i < drawn.length; i++) {
    const [source, cardId] = drawn[i];
    const discardInst = state.createProductInstance(cardId, -1, Zone.BENCH);
    state.markets.openIdeaPool.push(discardInst.instanceId);
    while (state.markets.openIdeaPool.length > 5) {
      state.markets.openIdeaPool.shift();
    }
  }

  return okResult("Design Sprint: kept 1 product");
}

export function executeIntegrate(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();
  const hostId = action.targetInstance;
  const clientId = action.sourceIndex;

  if (!player.opsProducts.includes(hostId) || !player.opsProducts.includes(clientId)) {
    return failResult("Both products must be in Ops");
  }

  const host = state.productInstances.get(hostId)!;
  const client = state.productInstances.get(clientId)!;
  const hostDef = registry.getProduct(host.cardDefId);
  const clientDef = registry.getProduct(client.cardDefId);

  // Check not already integrated
  if (host.integratedWith !== null || client.integratedWith !== null) {
    return failResult("One of the products is already integrated");
  }

  // Check compatibility
  if (!_isValidIntegration(hostDef, clientDef, registry)) {
    return failResult("Invalid host/client pairing");
  }

  // Same tag restriction
  if (hostDef.provides !== null && hostDef.provides === clientDef.provides) {
    return failResult("Cannot stack same tag");
  }

  // Stack
  host.integratedWith = clientId;
  host.isHost = true;
  client.integratedWith = hostId;
  client.isHost = false;

  return okResult(`Integrated ${hostDef.name} (host) + ${clientDef.name} (client)`);
}

export function _isValidIntegration(
  hostDef: ProductCardDef,
  clientDef: ProductCardDef,
  registry: { integrationRules: Record<string, any> },
): boolean {
  const rules = registry.integrationRules;

  const hostTag = hostDef.provides;
  const clientTag = clientDef.provides;

  if (hostTag === null || clientTag === null) {
    return false;
  }

  // Check standard host/client rules
  const hostTagName = Tag[hostTag];
  const clientTagName = Tag[clientTag];

  const hostRules: Record<string, string[]> = rules["host_client_rules"] ?? {};
  if (hostTagName in hostRules) {
    if (hostRules[hostTagName].includes(clientTagName)) {
      return true;
    }
  }

  // Check unicorn hosts
  const unicornRules: Record<string, string[]> = rules["unicorn_hosts"] ?? {};
  if (hostDef.cardDefId in unicornRules) {
    if (unicornRules[hostDef.cardDefId].includes(clientTagName)) {
      return true;
    }
  }

  return false;
}

export function executeVoluntaryDisclosure(state: GameState, action: Action): ActionResult {
  const player = state.getPlayer(state.currentPlayer);
  const registry = getRegistrySync();
  const prodId = action.targetInstance;

  if (!player.devProducts.includes(prodId)) {
    return failResult("Product not in dev zone");
  }

  const prod = state.productInstances.get(prodId)!;
  if (!prod.isFaceDown) {
    return failResult("Product is already face-up");
  }

  const pdef = registry.getProduct(prod.cardDefId);

  // Check if disclosure requires late license
  if (pdef.requires.length > 0) {
    const playerTags = state.getPlayerTagsWithPartners(state.currentPlayer);
    const hasSecured = pdef.requires.every((t) => playerTags.has(t));
    if (!hasSecured) {
      if (player.cash < 4) {
        return failResult("Cannot afford $4 late license");
      }
      player.cash -= 4;
      for (const tag of pdef.requires) {
        if (!playerTags.has(tag)) {
          for (const other of state.players) {
            if (other.playerId === state.currentPlayer) {
              continue;
            }
            if (state.getPlayerTags(other.playerId).has(tag)) {
              other.cash += 3;
              break;
            }
          }
          break;
        }
      }
    }
  }

  prod.isFaceDown = false;
  // Lose stealth launch bonus potential
  return okResult(`Voluntarily disclosed ${pdef.name}`);
}
