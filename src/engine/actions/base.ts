/**
 * Base action types for Startup Simulator.
 * Direct port from Python startup_simulator/actions/base.py
 */

import { ActionType } from "../types";

export interface Action {
  readonly actionType: ActionType;
  readonly sourceIndex: number;    // Index into market row, deck choice, etc.
  readonly targetPlayer: number;   // Target opponent player_id
  readonly targetInstance: number;  // Target card instance_id
  readonly targetInstances: readonly number[]; // For batch operations
  readonly amount: number;         // Bid amount, payment, etc.
  readonly choice: number;         // XP color choice, mode choice, etc.
  readonly sourceType: string;     // "university_sw", "agency", etc.
}

export function createAction(
  actionType: ActionType,
  overrides: Partial<Omit<Action, "actionType">> = {},
): Action {
  return {
    actionType,
    sourceIndex: -1,
    targetPlayer: -1,
    targetInstance: -1,
    targetInstances: [],
    amount: -1,
    choice: -1,
    sourceType: "",
    ...overrides,
  };
}

export interface ActionResult {
  success: boolean;
  message: string;
  gameOver: boolean;
}

export function okResult(message: string = ""): ActionResult {
  return { success: true, message, gameOver: false };
}

export function failResult(message: string): ActionResult {
  return { success: false, message, gameOver: false };
}
