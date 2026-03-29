/**
 * Card definition interfaces for Startup Simulator.
 * Direct port from Python startup_simulator/cards.py
 */

import { CubeType, Sector, Tag, TalentType, Tier, Trait } from "./types";

export interface TalentCardDef {
  readonly cardDefId: string;
  readonly name: string;
  readonly talentType: TalentType;
  readonly cost: number;
  readonly salary: number;
  readonly baseOutput: number;
  readonly outputType: CubeType | null; // null for specialists
  readonly isJunior: boolean;
  readonly isCrossFunctional: boolean;
  readonly trait: Trait | null;
  readonly isFlex: boolean; // Firmware/Full Stack
}

export interface ProductCardDef {
  readonly cardDefId: string;
  readonly name: string;
  readonly tier: Tier;
  readonly sector: Sector | null; // null for Market Crash
  readonly costSoftware: number;
  readonly costHardware: number;
  readonly revenue: number;
  readonly valuation: number;
  readonly maintSoftware: number;
  readonly maintHardware: number;
  readonly requires: readonly Tag[];
  readonly provides: Tag | null;
  readonly isMarketCrash: boolean;
  readonly isExpansion: boolean;
}

export interface StrategyCardDef {
  readonly cardDefId: string;
  readonly name: string;
  readonly category: string; // "training", "warfare", "attribute", "utility"
  readonly cost: number;
  readonly effectId: string;
  readonly count: number;
  readonly description: string;
}

export interface EventCardDef {
  readonly cardDefId: string;
  readonly name: string;
  readonly category: string; // "economic", "production", "hr", "conflict"
  readonly effectId: string;
  readonly description: string;
}

// Helper functions for ProductCardDef
export function totalCost(p: ProductCardDef): number {
  return p.costSoftware + p.costHardware;
}

export function totalMaint(p: ProductCardDef): number {
  return p.maintSoftware + p.maintHardware;
}

export function isHybrid(p: ProductCardDef): boolean {
  return p.costSoftware > 0 && p.costHardware > 0;
}

export function isSoftwareOnly(p: ProductCardDef): boolean {
  return p.costSoftware > 0 && p.costHardware === 0;
}

export function isHardwareOnly(p: ProductCardDef): boolean {
  return p.costHardware > 0 && p.costSoftware === 0;
}

// Helper functions for TalentCardDef
export function isSpecialist(t: TalentCardDef): boolean {
  return [TalentType.QA, TalentType.SALES, TalentType.HR,
    TalentType.PM, TalentType.SENIOR_PM, TalentType.GROWTH_HACKER].includes(t.talentType);
}

export function isSeniorDev(t: TalentCardDef): boolean {
  return [TalentType.SENIOR_BACKEND, TalentType.SENIOR_HARDWARE,
    TalentType.FIRMWARE, TalentType.FULL_STACK].includes(t.talentType);
}

export function isPm(t: TalentCardDef): boolean {
  return t.talentType === TalentType.PM || t.talentType === TalentType.SENIOR_PM;
}

export function canProduceCubes(t: TalentCardDef): boolean {
  return t.baseOutput > 0 || t.isJunior;
}
