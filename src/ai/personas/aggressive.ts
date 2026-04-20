import type { Persona } from "./types";

export const aggressive: Persona = {
  name: "aggressive",
  combinator: "additive",
  weights: {
    actionIsLaunch: 2.0,
    actionIsAssign: 1.2,
    actionIsRecruit: 1.2,
    actionIsInvest: 1.0,
    actionIsDivest: 0.3,
    actionIsPass: 0.0,
    cashRunway: 0.1,
    apRemaining: 0.2,
    benchSpace: 0.6,
    devProjectLoad: 0.5,
    backlogPressure: 0.6,
    opponentCashLead: 0.6,
  },
};
