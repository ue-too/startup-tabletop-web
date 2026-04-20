import type { ConsiderationKey } from "../utility/considerations";
import type { Curve } from "../utility/curves";
import type { Combinator } from "../utility/scorer";

export interface Persona {
  name: string;
  /** Weight per consideration. Missing keys default to 0 (skipped). */
  weights: Partial<Record<ConsiderationKey, number>>;
  /** Optional per-consideration curve overrides. */
  curves?: Partial<Record<ConsiderationKey, Curve>>;
  /** Defaults to 'additive' — personas mostly shape preferences, not veto. */
  combinator?: Combinator;
}
