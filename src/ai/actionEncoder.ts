/**
 * Action mask encoder: maps legal actions to a fixed-size binary mask.
 * Used alongside the ONNX model to filter valid actions from model output.
 */

import type { Action } from "../engine/actions/base";

export const MAX_ACTIONS = 512;

export class ActionEncoder {
  private currentActions: Action[] = [];

  /**
   * Update the encoder with the current set of legal actions.
   * Actions are stored by index (0..N-1) and padded to MAX_ACTIONS with zeros in the mask.
   */
  update(legalActions: Action[]): void {
    this.currentActions = legalActions.slice(0, MAX_ACTIONS);
  }

  /**
   * Encode a binary mask of size MAX_ACTIONS.
   * mask[i] = 1 if action i is legal, 0 otherwise.
   */
  encodeMask(): Int8Array {
    const mask = new Int8Array(MAX_ACTIONS);
    for (let i = 0; i < this.currentActions.length; i++) {
      mask[i] = 1;
    }
    return mask;
  }

  /**
   * Decode an action index back to the original Action object.
   * Throws if the index is out of range.
   */
  decode(actionIndex: number): Action {
    if (actionIndex < 0 || actionIndex >= this.currentActions.length) {
      throw new Error(
        `Action index ${actionIndex} out of range [0, ${this.currentActions.length})`,
      );
    }
    return this.currentActions[actionIndex];
  }

  /** Number of currently legal actions. */
  get numLegal(): number {
    return this.currentActions.length;
  }
}
