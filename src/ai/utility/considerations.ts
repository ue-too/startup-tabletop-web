/**
 * Considerations: pure functions of `(ctx, action)` returning a raw signal.
 * Scorers pass the signal through a curve to produce a [0, 1] value.
 */

import type { Action } from "../../engine/actions/base";
import { ActionType } from "../../engine/types";
import type { AgentContext } from "../agent";

export type Consideration = (ctx: AgentContext, action: Action) => number;
export type ConsiderationKey =
  | "actionIsLaunch"
  | "actionIsRecruit"
  | "actionIsAssign"
  | "actionIsInvest"
  | "actionIsDivest"
  | "actionIsPass"
  | "cashRunway"
  | "apRemaining"
  | "benchFill"
  | "benchSpace"
  | "devProjectLoad"
  | "backlogPressure"
  | "opponentCashLead";

const me = (ctx: AgentContext) => ctx.state.players[ctx.player];
const opponents = (ctx: AgentContext) =>
  ctx.state.players.filter((_, i) => i !== ctx.player);

const isAction = (at: ActionType): Consideration => (_ctx, action) =>
  action.actionType === at ? 1 : 0;

/** All considerations. Values are raw signals; curves applied in the scorer. */
export const considerations: Record<ConsiderationKey, Consideration> = {
  actionIsLaunch: isAction(ActionType.LAUNCH),
  actionIsRecruit: isAction(ActionType.RECRUIT),
  actionIsAssign: isAction(ActionType.ASSIGN),
  actionIsInvest: isAction(ActionType.INVEST),
  actionIsDivest: isAction(ActionType.DIVEST),
  actionIsPass: isAction(ActionType.PASS),

  /** Cash scaled by a rough baseline (startup starts with 7). Clamped to [0,1]. */
  cashRunway: (ctx) => Math.min(me(ctx).cash / 10, 1),

  /** Action points remaining (baseline ~3 per turn). */
  apRemaining: (ctx) => Math.min(me(ctx).actionPoints / 3, 1),

  /** Fraction of bench filled (max 5). */
  benchFill: (ctx) => Math.min(me(ctx).bench.length / 5, 1),

  /** Fraction of bench still available. */
  benchSpace: (ctx) => Math.max(0, 1 - me(ctx).bench.length / 5),

  /** How many dev projects in flight (max 3). */
  devProjectLoad: (ctx) => Math.min(me(ctx).devProducts.length / 3, 1),

  /** Product backlog size (max 3). */
  backlogPressure: (ctx) => Math.min(me(ctx).productBacklog.length / 3, 1),

  /** How far ahead the richest opponent is, normalized. */
  opponentCashLead: (ctx) => {
    const myCash = me(ctx).cash;
    const topOppCash = opponents(ctx).reduce(
      (m, p) => (p.cash > m ? p.cash : m),
      0,
    );
    const lead = topOppCash - myCash;
    return Math.max(0, Math.min(lead / 10, 1));
  },
};
