/**
 * Core enumerations and constants for Startup Simulator.
 * Direct port from Python startup_simulator/types.py
 */

export enum CubeType {
  SOFTWARE = 0, // Blue {}
  HARDWARE = 1, // Red [Chk]
  QA = 2,       // Green
}

export enum Tier {
  TIER0 = 0, // Special (Market Crash)
  TIER1 = 1,
  TIER2 = 2,
  TIER3 = 3,
}

export enum Sector {
  CONCEPT = 0,
  CONSUMER = 1,   // Pink
  FINTECH = 2,    // Gold
  DEEP_TECH = 3,  // Gray
  LIFE_SCI = 4,   // Green
  INFRA = 5,      // Blue
}

export enum Tag {
  APP = 0,
  SOCIAL = 1,
  MEDIA = 2,
  COMMERCE = 3,
  CRYPTO = 4,
  DEFI = 5,
  IOT = 6,
  ROBOTICS = 7,
  ENERGY = 8,
  FUSION = 9,
  DATA = 10,
  BIO = 11,
  LONGEVITY = 12,
  PLATFORM = 13,
  CLOUD = 14,
  AI = 15,
  QUANTUM = 16,
  DEVICE = 17,
  NETWORK = 18,
  SERVICE = 19,
  FINTECH_TAG = 20,
  METAVERSE = 21,
}

export enum TalentType {
  JUNIOR_SOFTWARE = 0,
  JUNIOR_HARDWARE = 1,
  SENIOR_BACKEND = 2,
  SENIOR_HARDWARE = 3,
  FIRMWARE = 4,
  FULL_STACK = 5,
  QA = 6,
  SALES = 7,
  HR = 8,
  PM = 9,
  SENIOR_PM = 10,
  GROWTH_HACKER = 11,
}

export enum Zone {
  BENCH = 0,
  DEV = 1,
  OPS = 2,
}

export enum Phase {
  SETUP = 0,
  EVENT = 1,
  INCOME = 2,
  ACTION = 3,
  ENGINE = 4,
  GAME_OVER = 5,
}

export enum SubPhase {
  NONE = 0,
  // Income sub-phases
  INCOME_BANDWIDTH = 1,
  INCOME_CHOOSE_OFFLINE = 2,
  INCOME_REVENUE = 3,
  INCOME_SALARY = 4,
  INCOME_FIRE_CHOICE = 5,
  // Action sub-phases
  ACTION_MAIN = 10,
  ACTION_ASSIGN_BATCH = 11,
  ACTION_CONSENT = 12,
  ACTION_COUNTER_OFFER = 13,
  // Engine sub-phases
  ENGINE_MODE_DECLARE = 20,
  ENGINE_GENERATE = 21,
  ENGINE_QA = 22,
  ENGINE_AUDIT_BID = 23,
  ENGINE_AUDIT_RESOLVE = 24,
  ENGINE_COMMIT = 25,
  ENGINE_COMPLETE = 26,
  ENGINE_XP_GRADUATE = 27,
  ENGINE_REFILL = 28,
  ENGINE_CLEANUP = 29,
  ENGINE_CLEANUP_TALENT = 30,
  ENGINE_CLEANUP_STRATEGY = 31,
  ENGINE_CLEANUP_BACKLOG = 32,
}

export enum ActionType {
  // 1-AP actions
  RECRUIT = 0,
  ASSIGN = 1,
  RECALL = 2,
  REASSIGN = 3,
  LAYOFF_SOURCE = 4,
  IDEATION = 5,
  LAUNCH = 6,
  PIVOT = 7,
  ACQUISITION = 8,
  BRAINSTORM = 9,
  INVEST = 10,
  DIVEST = 11,
  BUYBACK = 12,
  SECONDARY_TRADE = 13,
  // 0-AP actions
  GREENLIGHT = 14,
  PLAY_STRATEGY = 15,
  INTEGRATE = 16,
  VOLUNTARY_DISCLOSURE = 17,
  // Control
  PASS = 18,
  END_ASSIGN_BATCH = 19,
  // Micro-decisions
  ASSIGN_ONE = 20,
  CHOOSE_OFFLINE = 21,
  FIRE_STAFF = 22,
  CHOOSE_MODE = 23,
  BID_AUDIT = 24,
  PASS_AUDIT = 25,
  FOLD = 26,
  SETTLE = 27,
  CONSENT_YES = 28,
  CONSENT_NO = 29,
  COUNTER_OFFER = 30,
  DECLINE_COUNTER = 31,
  CHOOSE_XP = 32,
  DISCARD_TALENT = 33,
  DISCARD_STRATEGY = 34,
  DISCARD_BACKLOG = 35,
}

export enum Trait {
  SPAGHETTI_CODE = 0,
  CLEAN_CODE = 1,
  MENTOR = 2,
  EGO = 3,
  EFFICIENT = 4,
  QA_SKILL = 5,
  MERCENARY = 6,
  BUG_HUNTER = 7,
  RAINMAKER = 8,
  GATEKEEPER = 9,
  SYNERGY = 10,
  AGILE_SYNERGY = 11,
  VIRAL_LOOP = 12,
}

// String -> Trait mapping for JSON deserialization
export const TRAIT_NAME_MAP: Record<string, Trait> = {
  spaghetti_code: Trait.SPAGHETTI_CODE,
  clean_code: Trait.CLEAN_CODE,
  mentor: Trait.MENTOR,
  ego: Trait.EGO,
  efficient: Trait.EFFICIENT,
  qa_skill: Trait.QA_SKILL,
  mercenary: Trait.MERCENARY,
  bug_hunter: Trait.BUG_HUNTER,
  rainmaker: Trait.RAINMAKER,
  gatekeeper: Trait.GATEKEEPER,
  synergy: Trait.SYNERGY,
  agile_synergy: Trait.AGILE_SYNERGY,
  viral_loop: Trait.VIRAL_LOOP,
};

// String -> enum maps for JSON deserialization
export const CUBE_TYPE_MAP: Record<string, CubeType> = {
  SOFTWARE: CubeType.SOFTWARE,
  HARDWARE: CubeType.HARDWARE,
  QA: CubeType.QA,
};

export const SECTOR_MAP: Record<string, Sector> = Object.fromEntries(
  Object.entries(Sector).filter(([k]) => isNaN(Number(k))).map(([k, v]) => [k, v as Sector])
);

export const TAG_MAP: Record<string, Tag> = Object.fromEntries(
  Object.entries(Tag).filter(([k]) => isNaN(Number(k))).map(([k, v]) => [k, v as Tag])
);

export const TALENT_TYPE_MAP: Record<string, TalentType> = Object.fromEntries(
  Object.entries(TalentType).filter(([k]) => isNaN(Number(k))).map(([k, v]) => [k, v as TalentType])
);

// AP costs
export const AP_COST: Partial<Record<ActionType, number>> = {
  [ActionType.RECRUIT]: 1,
  [ActionType.ASSIGN]: 1,
  [ActionType.RECALL]: 1,
  [ActionType.REASSIGN]: 1,
  [ActionType.LAYOFF_SOURCE]: 1,
  [ActionType.IDEATION]: 1,
  [ActionType.LAUNCH]: 1,
  [ActionType.PIVOT]: 1,
  [ActionType.ACQUISITION]: 1,
  [ActionType.BRAINSTORM]: 1,
  [ActionType.INVEST]: 1,
  [ActionType.DIVEST]: 1,
  [ActionType.BUYBACK]: 1,
  [ActionType.SECONDARY_TRADE]: 1,
  [ActionType.GREENLIGHT]: 0,
  [ActionType.PLAY_STRATEGY]: 0,
  [ActionType.INTEGRATE]: 0,
  [ActionType.VOLUNTARY_DISCLOSURE]: 0,
  [ActionType.PASS]: 0,
  [ActionType.END_ASSIGN_BATCH]: 0,
  [ActionType.ASSIGN_ONE]: 0,
};

export const IDEATION_POOL_AP_COST = 2;
export const MAX_TURNS = 30;
