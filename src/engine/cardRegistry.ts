/**
 * Card registry: loads JSON data files and provides lookup by ID.
 * Direct port from Python startup_simulator/card_registry.py
 */

import {
  type TalentCardDef,
  type ProductCardDef,
  type StrategyCardDef,
  type EventCardDef,
} from "./cards";
import {
  CubeType,
  CUBE_TYPE_MAP,
  SECTOR_MAP,
  TAG_MAP,
  TALENT_TYPE_MAP,
  TRAIT_NAME_MAP,
  Tier,
  type Tag,
} from "./types";

// Raw JSON shapes
interface RawTalent {
  id: string;
  name: string;
  talent_type: string;
  cost: number;
  salary: number;
  base_output: number;
  output_type: string | null;
  is_junior: boolean;
  is_cross_functional?: boolean;
  trait: string | null;
  count?: number;
}

interface RawProduct {
  id: string;
  name: string;
  tier: number;
  sector: string | null;
  cost_software: number;
  cost_hardware: number;
  revenue: number;
  valuation: number;
  maint_software: number;
  maint_hardware: number;
  requires: string[];
  provides: string | null;
  is_market_crash?: boolean;
  expansion?: boolean;
}

interface RawStrategy {
  id: string;
  name: string;
  category: string;
  cost: number;
  effect_id: string;
  count?: number;
  description?: string;
}

interface RawEvent {
  id: string;
  name: string;
  category: string;
  effect_id: string;
  description?: string;
}

function parseOutputType(raw: string | null): { outputType: CubeType | null; isFlex: boolean } {
  if (raw === null) return { outputType: null, isFlex: false };
  if (raw === "FLEX") return { outputType: null, isFlex: true };
  return { outputType: CUBE_TYPE_MAP[raw] ?? null, isFlex: false };
}

function parseTalent(raw: RawTalent): TalentCardDef {
  const { outputType, isFlex } = parseOutputType(raw.output_type);
  return {
    cardDefId: raw.id,
    name: raw.name,
    talentType: TALENT_TYPE_MAP[raw.talent_type],
    cost: raw.cost,
    salary: raw.salary,
    baseOutput: raw.base_output,
    outputType,
    isJunior: raw.is_junior,
    isCrossFunctional: raw.is_cross_functional ?? false,
    trait: raw.trait ? (TRAIT_NAME_MAP[raw.trait] ?? null) : null,
    isFlex,
  };
}

function parseProduct(raw: RawProduct): ProductCardDef {
  return {
    cardDefId: raw.id,
    name: raw.name,
    tier: raw.tier as Tier,
    sector: raw.sector ? (SECTOR_MAP[raw.sector] ?? null) : null,
    costSoftware: raw.cost_software,
    costHardware: raw.cost_hardware,
    revenue: raw.revenue,
    valuation: raw.valuation,
    maintSoftware: raw.maint_software,
    maintHardware: raw.maint_hardware,
    requires: (raw.requires ?? []).map((t: string) => TAG_MAP[t]) as Tag[],
    provides: raw.provides ? (TAG_MAP[raw.provides] ?? null) : null,
    isMarketCrash: raw.is_market_crash ?? false,
    isExpansion: raw.expansion ?? false,
  };
}

function parseStrategy(raw: RawStrategy): StrategyCardDef {
  return {
    cardDefId: raw.id,
    name: raw.name,
    category: raw.category,
    cost: raw.cost,
    effectId: raw.effect_id,
    count: raw.count ?? 1,
    description: raw.description ?? "",
  };
}

function parseEvent(raw: RawEvent): EventCardDef {
  return {
    cardDefId: raw.id,
    name: raw.name,
    category: raw.category,
    effectId: raw.effect_id,
    description: raw.description ?? "",
  };
}

export class CardRegistry {
  talentCards: TalentCardDef[] = [];
  seedProducts: ProductCardDef[] = [];
  growthProducts: ProductCardDef[] = [];
  strategyCards: StrategyCardDef[] = [];
  eventCards: EventCardDef[] = [];
  integrationRules: Record<string, any> = {};

  private talentById = new Map<string, TalentCardDef>();
  private productById = new Map<string, ProductCardDef>();
  private strategyById = new Map<string, StrategyCardDef>();
  private eventById = new Map<string, EventCardDef>();

  juniorSoftware!: TalentCardDef;
  juniorHardware!: TalentCardDef;
  agencyDeckDefs: TalentCardDef[] = [];
  strategyDeckDefs: StrategyCardDef[] = [];

  async load(basePath: string = "/data"): Promise<void> {
    const [talentData, seedData, growthData, strategyData, eventData, integrationData] =
      await Promise.all([
        fetch(`${basePath}/talent.json`).then((r) => r.json()),
        fetch(`${basePath}/products_seed.json`).then((r) => r.json()),
        fetch(`${basePath}/products_growth.json`).then((r) => r.json()),
        fetch(`${basePath}/strategy.json`).then((r) => r.json()),
        fetch(`${basePath}/events.json`).then((r) => r.json()),
        fetch(`${basePath}/integration_rules.json`).then((r) => r.json()),
      ]);

    // Parse talent
    for (const category of ["juniors", "seniors", "specialists"]) {
      for (const raw of talentData[category] ?? []) {
        const def = parseTalent(raw);
        const count = (raw as RawTalent).count ?? 1;
        for (let i = 0; i < count; i++) {
          this.talentCards.push(def);
        }
        this.talentById.set(def.cardDefId, def);
      }
    }

    // Parse products
    for (const raw of seedData.products) {
      const def = parseProduct(raw);
      this.seedProducts.push(def);
      this.productById.set(def.cardDefId, def);
    }
    for (const raw of growthData.products) {
      const def = parseProduct(raw);
      this.growthProducts.push(def);
      this.productById.set(def.cardDefId, def);
    }

    // Parse strategy
    for (const raw of strategyData.cards) {
      const def = parseStrategy(raw);
      for (let i = 0; i < def.count; i++) {
        this.strategyCards.push(def);
      }
      this.strategyById.set(def.cardDefId, def);
    }

    // Parse events
    for (const raw of eventData.events) {
      const def = parseEvent(raw);
      this.eventCards.push(def);
      this.eventById.set(def.cardDefId, def);
    }

    this.integrationRules = integrationData;

    // Build derived data
    this.juniorSoftware = this.talentById.get("jr_software")!;
    this.juniorHardware = this.talentById.get("jr_hardware")!;
    this.agencyDeckDefs = this.talentCards.filter((c) => !c.isJunior);
    this.strategyDeckDefs = [...this.strategyCards];
  }

  getTalent(cardDefId: string): TalentCardDef {
    const def = this.talentById.get(cardDefId);
    if (!def) throw new Error(`Unknown talent: ${cardDefId}`);
    return def;
  }

  getProduct(cardDefId: string): ProductCardDef {
    const def = this.productById.get(cardDefId);
    if (!def) throw new Error(`Unknown product: ${cardDefId}`);
    return def;
  }

  getStrategy(cardDefId: string): StrategyCardDef {
    const def = this.strategyById.get(cardDefId);
    if (!def) throw new Error(`Unknown strategy: ${cardDefId}`);
    return def;
  }

  getEvent(cardDefId: string): EventCardDef {
    const def = this.eventById.get(cardDefId);
    if (!def) throw new Error(`Unknown event: ${cardDefId}`);
    return def;
  }

  getSeedDeck(): ProductCardDef[] {
    return this.seedProducts.filter((p) => !p.isMarketCrash);
  }

  getGrowthDeck(): ProductCardDef[] {
    return [...this.growthProducts];
  }
}

// Singleton
let _registry: CardRegistry | null = null;

export async function getRegistry(basePath?: string): Promise<CardRegistry> {
  if (!_registry) {
    _registry = new CardRegistry();
    await _registry.load(basePath);
  }
  return _registry;
}

/** Synchronous access (only after initial load) */
export function getRegistrySync(): CardRegistry {
  if (!_registry) throw new Error("CardRegistry not loaded yet. Call getRegistry() first.");
  return _registry;
}
