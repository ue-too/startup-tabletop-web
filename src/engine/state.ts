/**
 * Mutable game state for Startup Simulator.
 * Direct port from Python startup_simulator/state.py
 */

import type { TalentCardDef, ProductCardDef } from "./cards";
import { isSpecialist, isSeniorDev } from "./cards";
import { CubeType, Phase, SubPhase, Tag, TalentType, Tier, Zone } from "./types";
import { getRegistrySync } from "./cardRegistry";
import type { RoundModifiers } from "./modifiers";

export class TalentInstance {
  instanceId: number;
  cardDefId: string;
  owner: number; // player_id, -1 if in market
  zone: Zone;
  assignedProduct: number | null = null;

  // XP system
  xpPermanent: CubeType[] = [];  // max 4
  xpPending: CubeType[] = [];    // max 3 (1 per color)
  skills: CubeType[] = [];
  rankBadges: number = 0;
  rankPending: boolean = false;

  // Status
  onboarding: boolean = false;
  declaredMode: CubeType | null = null;
  equityVested: number | null = null;
  attributes: string[] = [];

  constructor(instanceId: number, cardDefId: string, owner: number, zone: Zone) {
    this.instanceId = instanceId;
    this.cardDefId = cardDefId;
    this.owner = owner;
    this.zone = zone;
  }

  get totalXp(): number {
    return this.xpPermanent.length;
  }

  /** Dynamic salary for juniors: $0 at 0-1 XP, $1 at 2+ XP */
  get salary(): number {
    return this.totalXp >= 2 ? 1 : 0;
  }

  hasPendingXpOfType(cubeType: CubeType): boolean {
    return this.xpPending.includes(cubeType);
  }

  hasSkill(cubeType: CubeType): boolean {
    return this.skills.includes(cubeType);
  }

  canLeadSoftware(cardDef: TalentCardDef): boolean {
    if (cardDef.isCrossFunctional) return true;
    if (cardDef.talentType === TalentType.SENIOR_BACKEND) return true;
    if (cardDef.isJunior && this.rankBadges > 0) {
      return this.hasSkill(CubeType.SOFTWARE) || cardDef.outputType === CubeType.SOFTWARE;
    }
    return false;
  }

  canLeadHardware(cardDef: TalentCardDef): boolean {
    if (cardDef.isCrossFunctional) return true;
    if (cardDef.talentType === TalentType.SENIOR_HARDWARE) return true;
    if (cardDef.isJunior && this.rankBadges > 0) {
      return this.hasSkill(CubeType.HARDWARE) || cardDef.outputType === CubeType.HARDWARE;
    }
    return false;
  }

  getEffectiveMode(cardDef: TalentCardDef): CubeType | null {
    if (isSpecialist(cardDef)) return null;
    if (cardDef.isFlex || this.skills.length > 0) {
      if (this.declaredMode !== null) return this.declaredMode;
    }
    if (cardDef.outputType !== null) return cardDef.outputType;
    return this.declaredMode;
  }

  getOutput(cardDef: TalentCardDef): number {
    if (this.onboarding) return 0;
    const base = cardDef.baseOutput;
    if (cardDef.isJunior) {
      const mode = this.getEffectiveMode(cardDef);
      if (mode !== null) {
        const xpBonus = this.xpPermanent.filter((x) => x === mode).length;
        return base + xpBonus;
      }
      return base;
    }
    return base;
  }

  needsModeDeclaration(cardDef: TalentCardDef): boolean {
    if (this.onboarding) return false;
    if (cardDef.isFlex) return true;
    if (cardDef.isJunior && this.skills.length > 0) return true;
    return false;
  }

  get isTier2Plus(): boolean {
    return this.rankBadges > 0;
  }
}

export class ProductInstance {
  instanceId: number;
  cardDefId: string;
  owner: number;
  zone: Zone;

  // Progress
  cubesSoftware: number = 0;
  cubesHardware: number = 0;
  transientSoftware: number = 0;
  transientHardware: number = 0;

  // Tokens
  bugs: number = 0;
  hype: number = 0;
  scandal: number = 0;

  // Flags
  isFaceDown: boolean = false;
  isFeatureComplete: boolean = false;
  isOnline: boolean = true;

  // Integration
  integratedWith: number | null = null;
  isHost: boolean = false;
  legacyTags: Set<Tag> = new Set();
  stealthLaunchBonus: number = 0;

  // Effective cost (after domain expertise)
  effectiveCostSoftware: number | null = null;
  effectiveCostHardware: number | null = null;

  constructor(instanceId: number, cardDefId: string, owner: number, zone: Zone) {
    this.instanceId = instanceId;
    this.cardDefId = cardDefId;
    this.owner = owner;
    this.zone = zone;
  }

  getEffectiveCost(productDef: ProductCardDef): [number, number] {
    const sw = this.effectiveCostSoftware ?? productDef.costSoftware;
    const hw = this.effectiveCostHardware ?? productDef.costHardware;
    return [sw, hw];
  }

  isDevelopmentComplete(productDef: ProductCardDef): boolean {
    const [swCost, hwCost] = this.getEffectiveCost(productDef);
    return this.cubesSoftware >= swCost && this.cubesHardware >= hwCost;
  }
}

export class PlayerState {
  playerId: number;
  cash: number = 7;
  equityTokensOwn: number = 3;
  equityHeld: Map<number, number> = new Map(); // playerId -> count

  bench: number[] = [];         // talent instance_ids, max 5
  devProducts: number[] = [];   // product instance_ids, max 3
  opsProducts: number[] = [];   // product instance_ids
  productBacklog: number[] = []; // product instance_ids, max 3
  strategyHand: string[] = [];  // strategy card_def_ids, max 3

  marketShareTokens: number = 0;
  debtTokens: number = 0;
  milestones: string[] = [];
  actionPoints: number = 0;

  constructor(playerId: number) {
    this.playerId = playerId;
  }
}

export class MarketState {
  agencyRow: number[] = [];
  openJobMarket: number[] = [];  // FIFO queue, max 5
  productMarketSeed: number[] = [];
  productMarketGrowth: number[] = [];
  openIdeaPool: number[] = [];   // FIFO queue, max 5

  seedDeck: string[] = [];
  growthDeck: string[] = [];
  talentDeck: string[] = [];
  strategyDeck: string[] = [];
  strategyDiscard: string[] = [];
  eventDeck: string[] = [];
  eventDiscard: string[] = [];
  activeEvent: string | null = null;
  milestones: string[] = [];
}

export interface PendingDecision {
  playerId: number;
  decisionType: SubPhase;
  context: Record<string, any>;
}

export class GameState {
  numPlayers: number;
  currentPlayer: number = 0;
  turnNumber: number = 0;
  phase: Phase = Phase.SETUP;
  subPhase: SubPhase = SubPhase.NONE;

  players: PlayerState[] = [];
  markets: MarketState = new MarketState();

  talentInstances: Map<number, TalentInstance> = new Map();
  productInstances: Map<number, ProductInstance> = new Map();
  nextInstanceId: number = 0;

  pendingDecisions: PendingDecision[] = [];

  gameOver: boolean = false;
  marketCrashDrawn: boolean = false;
  finishRound: boolean = false;

  roundModifiers: RoundModifiers | null = null;
  enginePlayerIndex: number = 0;

  auditTargetProduct: number | null = null;
  auditBids: Map<number, number> = new Map();
  auditCurrentBidder: number = 0;

  finalScores: number[] = [];

  constructor(numPlayers: number) {
    this.numPlayers = numPlayers;
  }

  createTalentInstance(cardDefId: string, owner: number, zone: Zone): TalentInstance {
    const inst = new TalentInstance(this.nextInstanceId, cardDefId, owner, zone);
    this.talentInstances.set(inst.instanceId, inst);
    this.nextInstanceId++;
    return inst;
  }

  createProductInstance(cardDefId: string, owner: number, zone: Zone): ProductInstance {
    const inst = new ProductInstance(this.nextInstanceId, cardDefId, owner, zone);
    this.productInstances.set(inst.instanceId, inst);
    this.nextInstanceId++;
    return inst;
  }

  getPlayer(playerId: number): PlayerState {
    return this.players[playerId];
  }

  getTalentOnProduct(productInstanceId: number): number[] {
    const result: number[] = [];
    for (const [tid, t] of this.talentInstances) {
      if (t.assignedProduct === productInstanceId) result.push(tid);
    }
    return result;
  }

  getBoardTalent(playerId: number): number[] {
    const result: number[] = [];
    for (const [tid, t] of this.talentInstances) {
      if (t.owner === playerId && (t.zone === Zone.DEV || t.zone === Zone.OPS)) {
        result.push(tid);
      }
    }
    return result;
  }

  getAllTalentForPlayer(playerId: number): number[] {
    const result: number[] = [];
    for (const [tid, t] of this.talentInstances) {
      if (t.owner === playerId) result.push(tid);
    }
    return result;
  }

  getPlayerTags(playerId: number): Set<Tag> {
    const registry = getRegistrySync();
    const player = this.players[playerId];
    const tags = new Set<Tag>();
    for (const pid of player.opsProducts) {
      const prod = this.productInstances.get(pid)!;
      if (!prod.isOnline) continue;
      const pdef = registry.getProduct(prod.cardDefId);
      if (pdef.provides !== null) tags.add(pdef.provides);
    }
    return tags;
  }

  getPlayerTagsWithPartners(playerId: number): Set<Tag> {
    const tags = this.getPlayerTags(playerId);
    const player = this.players[playerId];
    for (const [partnerId, count] of player.equityHeld) {
      if (count > 0) {
        for (const tag of this.getPlayerTags(partnerId)) {
          tags.add(tag);
        }
      }
    }
    return tags;
  }

  getPlayerHighestTier(playerId: number): Tier {
    const registry = getRegistrySync();
    const player = this.players[playerId];
    let maxTier = Tier.TIER0;
    for (const pid of player.opsProducts) {
      const prod = this.productInstances.get(pid)!;
      if (!prod.isOnline) continue;
      const pdef = registry.getProduct(prod.cardDefId);
      if (pdef.tier > maxTier) maxTier = pdef.tier;
    }
    return maxTier;
  }
}
