## 1. Agent interface + OnnxAgent adapter

- [x] 1.1 Add `src/ai/agent.ts` defining `Agent` interface and `AgentContext` type (matches design §1)
- [x] 1.2 Wrap existing `OnnxAgent` so it implements `Agent.getAction(ctx)` by reading `ctx.observation` / `ctx.actionMask`; keep legacy `getAction(observation, mask)` call site intact for now
- [x] 1.3 Unit test: `OnnxAgent` wrapper returns the same index as the underlying `argmaxMasked` for a handcrafted logits/mask pair

## 2. Behavior-tree framework

- [x] 2.1 Create `src/ai/bt/types.ts` with `Status`, `BtBlackboard`, `BtNode` interface
- [x] 2.2 Implement composites `Sequence`, `Selector`, `UtilitySelector` in `src/ai/bt/composites.ts`
- [x] 2.3 Implement decorators `Guard`, `Inverter` in `src/ai/bt/decorators.ts`
- [x] 2.4 Implement leaves `Condition`, `Action`, and terminal fallback `PassOrFirstLegal` in `src/ai/bt/leaves.ts`
- [x] 2.5 Add a small builder/DSL (`src/ai/bt/build.ts`) so personas can declare trees concisely
- [x] 2.6 Unit tests covering each composite/decorator's short-circuit and status-propagation rules (spec: utility-bt-agent §"Behavior-tree framework")

## 3. Utility scoring layer

- [x] 3.1 Create `src/ai/utility/curves.ts` (`Linear`, `Logistic`, `Threshold`, `Inverse`)
- [x] 3.2 Create `src/ai/utility/considerations.ts` with an initial set of pure-fn considerations (cash runway, team balance, AP left, project maturity, opponent pressure, launch readiness, hiring need)
- [x] 3.3 Create `src/ai/utility/scorer.ts` implementing geometric-mean combinator with additive fallback, deterministic tie-break via `BtBlackboard.rng`
- [x] 3.4 Unit tests: zero-consideration veto, deterministic tie-break, legal-action restriction (spec: utility-bt-agent §"Utility scorer")

## 4. UtilityBtAgent and personas

- [x] 4.1 Create `src/ai/utilityBtAgent.ts` implementing `Agent`; constructor takes `{ persona, rng }` and builds the tree via the DSL
- [x] 4.2 Implement a seedable RNG helper `src/ai/rng.ts` (or reuse engine RNG) and a derivation `perSeatSeed(gameSeed, seatIndex)`
- [x] 4.3 Add persona file `src/ai/personas/balanced.ts`
- [x] 4.4 Add persona file `src/ai/personas/aggressive.ts`
- [x] 4.5 Add persona file `src/ai/personas/cautious.ts`
- [x] 4.6 Add `src/ai/personas/index.ts` registry mapping name -> persona
- [x] 4.7 Unit test: each persona returns only legal action indices on a seeded mid-game state
- [x] 4.8 Determinism test: same `{ gameSeed, persona, seatIndex }` produces identical action sequence on two runs (spec: utility-bt-agent §"Deterministic action selection")

## 5. Controller refactor to per-seat agents

- [x] 5.1 Introduce `SeatConfig` union type in `src/game/seat.ts` (human | onnx | utilityBt)
- [x] 5.2 Add `buildAgentForSeat(seat, seatIndex, gameSeed)` resolver; errors on unknown persona or missing model path
- [x] 5.3 Rewrite `GameController` to hold `Agent[]` and accept `seats: SeatConfig[]`; remove hard-coded `OnnxAgent` construction
- [x] 5.4 Rewrite `SimController` similarly
- [x] 5.5 Update `init()` to skip work for seats that don't need it; dedupe ONNX session loads for identical model paths
- [x] 5.6 Update every existing call site (`useGameState`, `GamePage`, `SimPage`, `ReplayPage`) to pass a `seats` array built from current props
- [x] 5.7 Unit tests: seat-count mismatch throws; unknown persona throws; no fetch happens for a pure-UtilityBT game (spec: agent-selection §"Per-seat agent configuration", §"Agent initialization is agent-specific")

## 6. Setup UI: opponent picker

- [x] 6.1 Create `src/components/OpponentPicker.tsx` — dropdown of `{ ONNX } ∪ { UtilityBT:<persona> for each registered persona }`
- [x] 6.2 Wire the picker into `HomePage` (play flow) to build the `seats` array
- [x] 6.3 Wire the picker into `SimPage` (all-AI flow) to build per-seat configs
- [x] 6.4 Keep session-scoped selection in component state; no persistence
- [x] 6.5 Smoke test: starting a game with `UtilityBT: aggressive` selected lands in `GamePage` and the first AI decision produces a legal action (spec: agent-selection §"Opponent picker in setup UI")

## 7. Tournament harness + tuning pass

- [x] 7.1 Add `scripts/tournament.ts` (runnable via `bun run scripts/tournament.ts`) that plays N seeded games across persona pairings + ONNX baseline and prints win rates / average score
- [x] 7.2 Run a first tuning pass on persona weights; commit updated defaults with numbers from the harness
- [x] 7.3 Document in PR description: tournament results, any weight changes, and which open questions from design.md were resolved

## 8. Verification

- [x] 8.1 `bun test` — all new and existing tests pass
- [x] 8.2 Manual smoke: start a game vs each persona, play a full turn, confirm no crashes and opponent actions feel distinct per persona
- [x] 8.3 Manual smoke: replay a pre-change recorded game with the old ONNX seat config and confirm action stream is unchanged
- [x] 8.4 `openspec status --change add-utility-bt-agent` reports all tasks complete and the change ready to archive
