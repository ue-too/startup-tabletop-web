import type { Persona } from "./types";

export const cautious: Persona = {
  name: "cautious",
  combinator: "additive",
  weights: {
    actionIsLaunch: 0.6,
    actionIsAssign: 0.8,
    actionIsRecruit: 0.4,
    actionIsInvest: 0.2,
    actionIsDivest: 0.5,
    actionIsPass: 0.4,
    cashRunway: 0.8,
    apRemaining: 0.5,
    benchSpace: 0.2,
    devProjectLoad: 0.2,
    backlogPressure: 0.3,
    opponentCashLead: 0.3,
  },
};
