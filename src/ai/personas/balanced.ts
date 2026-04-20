import type { Persona } from "./types";

export const balanced: Persona = {
  name: "balanced",
  combinator: "additive",
  weights: {
    actionIsLaunch: 1.0,
    actionIsAssign: 0.9,
    actionIsRecruit: 0.7,
    actionIsInvest: 0.5,
    actionIsDivest: 0.2,
    actionIsPass: 0.1,
    cashRunway: 0.4,
    apRemaining: 0.3,
    benchSpace: 0.3,
    devProjectLoad: 0.3,
    backlogPressure: 0.2,
    opponentCashLead: 0.2,
  },
};
