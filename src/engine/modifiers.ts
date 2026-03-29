/**
 * RoundModifiers: per-round state modifiers from active event cards.
 * Direct port from Python startup_simulator/modifiers.py
 */

export interface RoundModifiers {
  equitySaleBonus: number;
  revenueBonus: number;
  licenseFee: number;
  revenueDecayPerBug: number;
  softwareOutputBonus: number;
  hardwareOutputBonus: number;
  hardwareHiringExtra: number;
  crunchTime: boolean;
  softwareOpsPenalty: number;
  hardwareOutputPenalty: number;
  poachCostMultiplier: number | null;
  universityCost: number | null;
  poachingSuspended: boolean;
  trainingCost: number | null;
  auditRewardMultiplier: number;
  prCostMultiplier: number;
}

export function defaultModifiers(): RoundModifiers {
  return {
    equitySaleBonus: 0,
    revenueBonus: 0,
    licenseFee: 3,
    revenueDecayPerBug: 1,
    softwareOutputBonus: 0,
    hardwareOutputBonus: 0,
    hardwareHiringExtra: 0,
    crunchTime: false,
    softwareOpsPenalty: 0,
    hardwareOutputPenalty: 0,
    poachCostMultiplier: null,
    universityCost: null,
    poachingSuspended: false,
    trainingCost: null,
    auditRewardMultiplier: 1,
    prCostMultiplier: 1.0,
  };
}

export function parseEventModifiers(effectId: string): RoundModifiers {
  const m = defaultModifiers();

  switch (effectId) {
    case "equity_bonus_3": m.equitySaleBonus = 3; break;
    case "revenue_plus_1": m.revenueBonus = 1; break;
    case "license_fee_5": m.licenseFee = 5; break;
    case "decay_2_per_bug": m.revenueDecayPerBug = 2; break;
    case "software_output_plus_1": m.softwareOutputBonus = 1; break;
    case "hardware_output_plus_1": m.hardwareOutputBonus = 1; break;
    case "hardware_hiring_plus_3": m.hardwareHiringExtra = 3; break;
    case "crunch_time": m.crunchTime = true; break;
    case "software_ops_minus_1": m.softwareOpsPenalty = 1; break;
    case "hardware_output_minus_1": m.hardwareOutputPenalty = 1; break;
    case "poach_cost_1x": m.poachCostMultiplier = 1.0; break;
    case "university_free": m.universityCost = 0; break;
    case "poaching_suspended": m.poachingSuspended = true; break;
    case "training_cost_1": m.trainingCost = 1; break;
    case "audit_reward_doubled": m.auditRewardMultiplier = 2; break;
    case "pr_half_price": m.prCostMultiplier = 0.5; break;
    // tier1_only_bonus_3 and payroll_tax are immediate effects, not modifiers
  }

  return m;
}
