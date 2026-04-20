/**
 * Utility scorer: weighted combinator of curve-transformed considerations.
 *
 * Default combinator is the weighted geometric mean (one near-zero term vetoes
 * the action); a weighted additive combinator is available per scorer.
 *
 * Spec: utility-bt-agent §"Utility scorer".
 */

import type { Action } from "../../engine/actions/base";
import type { AgentContext } from "../agent";
import type { BtRng } from "../bt/types";
import type { Consideration } from "./considerations";
import { Linear, type Curve } from "./curves";

export interface Term {
  key: string;
  consideration: Consideration;
  curve?: Curve;
  weight: number;
}

export type Combinator = "geometric" | "additive";

export interface ScorerConfig {
  terms: readonly Term[];
  combinator?: Combinator;
}

export class Scorer {
  constructor(private readonly config: ScorerConfig) {}

  /** Score a single action in [0, 1]. */
  score(ctx: AgentContext, action: Action): number {
    if (this.config.terms.length === 0) return 0;
    const mode = this.config.combinator ?? "geometric";
    if (mode === "geometric") return this.geometric(ctx, action);
    return this.additive(ctx, action);
  }

  /**
   * Pick the highest-scoring action from `candidates`, which must be a subset
   * of ctx.legalActions. Returns the index into ctx.legalActions, or -1 if no
   * candidate scores above 0.
   * Ties broken deterministically by the RNG.
   */
  pickBest(
    ctx: AgentContext,
    candidates: readonly number[],
    rng: BtRng,
  ): number {
    if (candidates.length === 0) return -1;
    let bestScore = -Infinity;
    let ties: number[] = [];
    for (const legalIdx of candidates) {
      const s = this.score(ctx, ctx.legalActions[legalIdx]);
      if (s > bestScore) {
        bestScore = s;
        ties = [legalIdx];
      } else if (s === bestScore) {
        ties.push(legalIdx);
      }
    }
    if (bestScore <= 0) return -1;
    return ties.length > 1 ? ties[rng.randint(0, ties.length)] : ties[0];
  }

  private geometric(ctx: AgentContext, action: Action): number {
    let totalWeight = 0;
    let logSum = 0;
    for (const t of this.config.terms) {
      if (t.weight <= 0) continue;
      const raw = t.consideration(ctx, action);
      const curved = (t.curve ?? Linear)(raw);
      if (curved <= 0) return 0; // geometric veto
      logSum += t.weight * Math.log(curved);
      totalWeight += t.weight;
    }
    if (totalWeight === 0) return 0;
    return Math.exp(logSum / totalWeight);
  }

  private additive(ctx: AgentContext, action: Action): number {
    let total = 0;
    let totalWeight = 0;
    for (const t of this.config.terms) {
      if (t.weight <= 0) continue;
      const raw = t.consideration(ctx, action);
      const curved = (t.curve ?? Linear)(raw);
      total += t.weight * curved;
      totalWeight += t.weight;
    }
    if (totalWeight === 0) return 0;
    return total / totalWeight;
  }
}
