/**
 * Small DSL for assembling behavior trees. Keeps persona files readable without
 * a build step or JSX.
 */

import { Sequence, Selector, UtilitySelector, type UtilityChild } from "./composites";
import { Guard, Inverter, type BtPredicate } from "./decorators";
import { Condition, SelectAction, PassOrFirstLegal, type ActionPicker } from "./leaves";
import type { BtNode } from "./types";

export const seq = (...children: BtNode[]): BtNode => new Sequence(children);
export const sel = (...children: BtNode[]): BtNode => new Selector(children);
export const util = (...children: UtilityChild[]): BtNode =>
  new UtilitySelector(children);
export const guard = (cond: BtPredicate, child: BtNode): BtNode =>
  new Guard(cond, child);
export const not = (child: BtNode): BtNode => new Inverter(child);
export const cond = (pred: BtPredicate): BtNode => new Condition(pred);
export const pick = (p: ActionPicker): BtNode => new SelectAction(p);
export const fallback = (): BtNode => new PassOrFirstLegal();
