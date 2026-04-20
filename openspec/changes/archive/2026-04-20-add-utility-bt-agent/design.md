## Context

Today, `GameController` and `SimController` both hard-code `OnnxAgent` as the opponent type (`src/game/GameController.ts:50`, `src/game/SimController.ts:44`). The controllers iterate a list of `OnnxAgent` instances, share a single `modelPath`, and call `agent.getAction(observation, mask)`. The engine itself (`src/engine/*`) is decoupled from the agent choice — it only exposes `getLegalActions()` and `step(action)` — which makes plugging in an alternative agent straightforward.

Constraints:
- The game runs entirely in the browser (Vite/Bun frontend). Anything we add must work without a Node-only API.
- Action decisions must be synchronous enough not to stall the UI; behavior-tree evaluation is cheap, but we should still keep the agent interface async-compatible so we don't lock out future async agents (or preserve compatibility with the ONNX one).
- Determinism matters: the game already uses a seeded RNG (`src/engine/rng.ts`). An AI with random tiebreaks must take a seedable RNG so replays stay reproducible.
- We must not regress the existing ONNX-backed play, simulate, or replay flows.

Stakeholders: solo dev (Vincent) authoring the game; future players who want varied opponents before a trained model is ready.

## Goals / Non-Goals

**Goals:**
- Provide a pure-TypeScript, unit-testable opponent that picks actions via utility-weighted behavior-tree evaluation over the existing `legalActions` set.
- Make agent choice a per-seat decision so games can mix human / ONNX / UtilityBT seats.
- Offer at least three persona presets (`balanced`, `aggressive`, `cautious`) as declarative config, and make adding a new persona a data-only change.
- Keep the BT + utility framework small (single-digit files, <500 LOC core), game-agnostic where practical, and decoupled from React.

**Non-Goals:**
- Replacing or retiring the ONNX agent.
- Learning / self-play / online weight tuning.
- A visual BT editor or persona editor UI.
- Performance beyond "feels instant" (<50ms per decision on a modern laptop).
- Exposing UtilityBT as a training target for the ONNX model.

## Decisions

### 1. Define a common `Agent` interface; refactor controllers to use it
Add `src/ai/agent.ts`:

```ts
export interface Agent {
  init?(): Promise<void>;
  getAction(ctx: AgentContext): Promise<number>; // returns index into ctx.legalActions
}

export interface AgentContext {
  state: GameState;
  player: number;
  legalActions: Action[];
  // Only populated for agents that need the neural features:
  observation?: Float32Array;
  actionMask?: Int8Array;
}
```

`OnnxAgent` gets a thin adapter to this interface; `UtilityBtAgent` implements it directly. Controllers hold `Agent[]` instead of `OnnxAgent[]`.

**Alternative considered**: keep `OnnxAgent` as the concrete type and have `UtilityBtAgent` mimic its shape. Rejected — it leaks the neural concepts (observation/mask) into a scripted agent that doesn't use them.

### 2. Behavior tree: minimal, synchronous, status-returning
Build a tiny framework in `src/ai/bt/`:
- `Status = 'success' | 'failure' | 'running'`
- Composite nodes: `Sequence`, `Selector`, `UtilitySelector` (picks highest-scoring child), `Parallel` (optional, only if needed).
- Decorator nodes: `Inverter`, `Guard` (condition gate), `Cooldown` (turn-based), `Repeat`.
- Leaf nodes: `Condition` (predicate on `BtBlackboard`), `Action` (selects a concrete `Action` from `legalActions`).
- A `BtBlackboard` carries `{ state, player, legalActions, rng, memory }` through a tick.

The root always returns a chosen legal-action index by the time `tick()` resolves; if no branch succeeds, a terminal `PassOrFirstLegal` leaf guarantees a valid fallback.

**Alternative considered**: GOAP / HTN. Rejected — overkill for a turn-based, phase-driven game where the engine already restricts the legal-action set sharply. A BT is easier to read and author.

### 3. Utility scoring: per-action appraisal via weighted, curved considerations
Under `src/ai/utility/`:
- A **consideration** is `(ctx: AgentContext, action: Action) => number` returning a raw signal.
- A **curve** maps raw signal to `[0, 1]`: `Linear`, `Logistic`, `Threshold`, `Inverse`.
- A **scorer** combines `{ consideration, curve, weight }` entries into a single score per action. Default combination is **geometric mean of weighted terms** (one low consideration can veto), with an additive fallback configurable per node.
- The action space is restricted to the engine's current `legalActions` list (no generation of illegal moves).

`UtilitySelector` in the BT consults a scorer against the current candidate action set (filtered by that branch's action-type predicate) and returns the argmax. Ties broken by the seeded RNG.

**Alternative considered**: pure Q-table / heuristic-per-action-type. Rejected — harder to share logic across similar actions (e.g. `ASSIGN` and `REASSIGN`) and doesn't compose with the BT's structural decisions (phase gating).

### 4. Personas as declarative config, not code
A persona is a JSON-like object:

```ts
interface Persona {
  name: string;
  weights: Partial<Record<ConsiderationKey, number>>;
  bt?: BtOverrides; // optional: swap/guard specific nodes
  rngTieBreakOrder?: ActionType[]; // optional deterministic preference
}
```

Personas live in `src/ai/personas/*.ts`. The `UtilityBtAgent` constructor takes a `Persona` and a seeded RNG. Adding a new persona is a new file in that directory; no framework change.

### 5. Deterministic RNG, injected from the controller
Both controllers already carry a game seed. The controller derives a per-seat seed (`seed ^ (seatIndex * 0x9E3779B1)`) and passes a `SeededRng` into each `UtilityBtAgent`. The RNG is used **only** for tiebreaks and any stochastic considerations we add later — never for decisions with a clear utility winner. This keeps replays reproducible from `{ gameSeed, perSeatPersona }`.

### 6. Controller API: per-seat agent config
Extend `GameControllerOptions` / `SimControllerOptions`:

```ts
type SeatConfig =
  | { kind: 'human' }
  | { kind: 'onnx'; modelPath: string }
  | { kind: 'utilityBt'; persona: string /* persona file name */ };

interface GameControllerOptions {
  numPlayers: number;
  seed: number;
  seats: SeatConfig[]; // length === numPlayers
}
```

The controller resolves seat configs to `Agent` instances in its constructor. The existing `{ humanPlayer, modelPath }` path is rewritten in terms of `seats`; any current caller sites are updated in the same PR.

**Alternative considered**: keep the old options shape and add an optional `agentOverrides` array. Rejected — leaves two ways to express the same thing; better to make one shape explicit.

### 7. UI: opponent picker on the setup pages
`HomePage` / `SimPage` gain a small opponent-picker row: for each non-human seat, a dropdown with `{ ONNX, UtilityBT: <persona> }`. The picker is wired to build the `seats` array. No layout rework; one new component.

## Risks / Trade-offs

- **[Risk] Weights hand-tuned without training data → weak play**. Mitigation: start from sensible defaults driven by the rulebook (`rulebook.md`), validate with a tournament harness (`SimController` pitting UtilityBT vs. UtilityBT vs. ONNX over N seeds), and iterate.
- **[Risk] Considerations silently reach into mutable state and break determinism**. Mitigation: considerations are typed as pure functions of `(ctx, action)` and reviewed against that contract; BT memory lives on the blackboard, not on closures.
- **[Risk] Controller refactor (seats API) breaks existing pages/replay**. Mitigation: refactor controllers + all call sites in one change; add unit tests for the seat-config resolver; verify replay against a pre-change save.
- **[Risk] BT framework grows into a general-purpose library nobody asked for**. Mitigation: keep nodes narrowly scoped to what personas actually need; no decorators without a live use case.
- **[Trade-off] UtilityBT can't learn from play**. Accepted — that is the explicit non-goal; learning lives with the ONNX agent.

## Migration Plan

This is additive. Rollout is a single PR:
1. Introduce `Agent` interface + wrap `OnnxAgent` to satisfy it (no behavior change).
2. Refactor controllers to hold `Agent[]` and accept `seats` (update all pages in the same commit).
3. Land BT framework + utility scorer + one persona (`balanced`).
4. Land remaining personas (`aggressive`, `cautious`) and wire the UI picker.
5. Add unit tests + a seeded tournament script (`bun run src/ai/personas/tournament.ts`) reported in the PR description.

Rollback: revert the PR; the `seats` field is additive on top of a refactor, and `OnnxAgent` behavior is unchanged.

## Open Questions

- Do we want a "scripted" fallback persona that always passes — useful as a baseline in the tournament harness?
- Should the UI expose a seed alongside the persona, so players can reproduce a specific opponent game?
- Do we want to surface the agent's chosen utility scores in `GameRecorder` for post-hoc debugging, or keep recorder output identical to ONNX play?
