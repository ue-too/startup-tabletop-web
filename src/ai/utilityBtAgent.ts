/**
 * UtilityBtAgent: scripted opponent that picks actions by evaluating the
 * legal-action set through a persona-weighted utility scorer wrapped in a
 * minimal behavior tree.
 *
 * Spec: utility-bt-agent §"Agent interface", §"Personas as declarative config".
 */

import type { Agent, AgentContext } from "./agent";
import { makeBlackboard, type BtBlackboard, type BtNode, type BtRng } from "./bt/types";
import { fallback, pick, sel } from "./bt/build";
import { considerations, type ConsiderationKey } from "./utility/considerations";
import { Scorer, type Term } from "./utility/scorer";
import { SeededRng } from "./rng";
import { getPersona, type Persona } from "./personas";

export interface UtilityBtAgentOptions {
  persona?: Persona | string;
  rng?: BtRng;
  seed?: number; // used only if rng is not provided
}

export class UtilityBtAgent implements Agent {
  private readonly persona: Persona;
  private readonly scorer: Scorer;
  private readonly rng: BtRng;
  private readonly tree: BtNode;

  constructor(opts: UtilityBtAgentOptions = {}) {
    this.persona = resolvePersona(opts.persona);
    this.scorer = buildScorerFromPersona(this.persona);
    this.rng = opts.rng ?? new SeededRng(opts.seed ?? 0);
    this.tree = buildTree(this.scorer);
  }

  async getAction(ctx: AgentContext): Promise<number> {
    const bb: BtBlackboard = makeBlackboard({
      state: ctx.state,
      player: ctx.player,
      legalActions: ctx.legalActions,
      rng: this.rng,
    });
    this.tree.tick(bb);
    // Tree guarantees a choice via the PassOrFirstLegal fallback.
    return bb.chosenActionIndex;
  }

  get personaName(): string {
    return this.persona.name;
  }
}

function resolvePersona(input: Persona | string | undefined): Persona {
  if (!input) return getPersona("balanced");
  return typeof input === "string" ? getPersona(input) : input;
}

function buildScorerFromPersona(persona: Persona): Scorer {
  const terms: Term[] = [];
  for (const [key, weight] of Object.entries(persona.weights) as Array<
    [ConsiderationKey, number]
  >) {
    if (weight === undefined || weight <= 0) continue;
    const consideration = considerations[key];
    if (!consideration) continue;
    terms.push({
      key,
      consideration,
      curve: persona.curves?.[key],
      weight,
    });
  }
  return new Scorer({ terms, combinator: persona.combinator ?? "additive" });
}

function buildTree(scorer: Scorer): BtNode {
  return sel(
    pick((bb) => {
      const candidates: number[] = [];
      for (let i = 0; i < bb.legalActions.length; i++) candidates.push(i);
      return scorer.pickBest(
        { state: bb.state, player: bb.player, legalActions: bb.legalActions },
        candidates,
        bb.rng,
      );
    }),
    fallback(),
  );
}
