## Why

The game currently ships with a single opponent type: an ONNX neural-network agent (`OnnxAgent`). That agent is opaque, expensive to load in the browser, hard to tune, and can't be used to offer meaningfully different difficulty levels or play styles. Players need AI opponents whose behavior is transparent, tweakable, and varied — so the game is enjoyable at launch without waiting on a trained model, and so we can ship difficulty/persona presets (cautious, aggressive, balanced) that each feel distinct.

A utility-based behavior tree offers the best of both worlds for a complex action-selection problem: the **behavior tree** encodes the legal-action flow and phase structure the engine already enforces, while a **utility scoring** layer picks among viable actions based on weighted appraisals of game state (cash, team composition, project progress, opponent pressure). This is authorable in plain TypeScript, easy to unit test, and cheap at runtime.

## What Changes

- Introduce a new AI agent type: `UtilityBtAgent`, selectable as an opponent alongside `OnnxAgent`.
- Add a small behavior-tree framework (composite, decorator, leaf nodes; `SUCCESS` / `FAILURE` / `RUNNING` status) under `src/ai/bt/`.
- Add a utility scoring layer: a set of **considerations** (pure functions of game state → [0,1]) combined into per-action **utility scores** via configurable weights and curves.
- Ship at least three agent **personas** (e.g. `balanced`, `aggressive`, `cautious`) as declarative config, each a different set of weights over the same considerations.
- Extend `GameController` and `SimController` to accept a per-seat agent **type** (not only a model path), so a game can mix human + UtilityBT + ONNX seats.
- Update the game-setup UI (`HomePage` / `GamePage`) to let the player pick opponent type and persona before starting a game.
- **Non-goals**: replacing the ONNX agent, self-play training, online learning, or persisting tuning across sessions.

## Capabilities

### New Capabilities
- `utility-bt-agent`: A scripted opponent that selects actions by evaluating the current legal-action set against a weighted set of utility considerations driven by a behavior tree. Includes the BT framework, the utility scoring layer, the persona config format, and the agent adapter that plugs into the existing controller flow.
- `agent-selection`: The ability to choose which agent implementation plays each non-human seat (ONNX vs UtilityBT + persona), surfaced both in the controller API and in the game-setup UI.

### Modified Capabilities
<!-- No existing specs in openspec/specs/ yet; nothing to modify. -->

## Impact

- **New code**: `src/ai/bt/` (framework), `src/ai/utility/` (considerations + scorer), `src/ai/personas/` (persona configs), `src/ai/utilityBtAgent.ts` (agent class).
- **Modified code**: `src/game/GameController.ts`, `src/game/SimController.ts` — generalize from `OnnxAgent[]` to an `Agent`-interface array and accept per-seat agent config. `src/pages/HomePage.tsx` / `GamePage.tsx` / `SimPage.tsx` — opponent-type and persona pickers.
- **New dependency**: none required; framework is implemented in-house.
- **Engine**: untouched. The new agent consumes the same `legalActions` + `GameState` the ONNX agent does; no changes to `src/engine/*`.
- **Bundle size**: small net reduction for games that don't load the ONNX model — UtilityBT is pure TS.
- **Testing**: Bun-based unit tests for BT nodes, considerations, and deterministic persona behavior on fixed seeds.
