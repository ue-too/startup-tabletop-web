# utility-bt-agent

## Requirements

### Requirement: Agent interface
The system SHALL define a common `Agent` interface that every opponent implementation (including `OnnxAgent` and `UtilityBtAgent`) conforms to. The interface SHALL expose an optional async `init()` and an async `getAction(ctx)` that returns an index into the legal-actions array supplied on the context.

#### Scenario: ONNX and UtilityBT agents satisfy the same interface
- **WHEN** the controller asks an agent for an action
- **THEN** it calls `getAction(ctx)` on an `Agent` reference without branching on the concrete class, and receives an integer index `0 <= i < ctx.legalActions.length`

#### Scenario: Agent returns a legal action index
- **WHEN** `UtilityBtAgent.getAction(ctx)` resolves
- **THEN** the returned index refers to an action inside `ctx.legalActions` (never -1, never out of range)

### Requirement: Behavior-tree framework
The system SHALL provide a minimal behavior-tree framework with synchronous `tick` semantics returning `success`, `failure`, or `running`. It MUST include at least `Sequence`, `Selector`, and `UtilitySelector` composites; `Guard` and `Inverter` decorators; and `Condition` and `Action` leaves. All nodes MUST operate over a `BtBlackboard` carrying `{ state, player, legalActions, rng, memory }`.

#### Scenario: Sequence short-circuits on failure
- **WHEN** a `Sequence` with children `[A(success), B(failure), C(success)]` is ticked
- **THEN** the sequence returns `failure` and does NOT tick `C`

#### Scenario: Selector short-circuits on success
- **WHEN** a `Selector` with children `[A(failure), B(success), C(anything)]` is ticked
- **THEN** the selector returns `success` and does NOT tick `C`

#### Scenario: UtilitySelector picks the highest-scoring viable child
- **WHEN** a `UtilitySelector` ticks children whose scorer outputs `[0.1, 0.8, 0.5]` respectively
- **THEN** it ticks the second child and returns that child's status

#### Scenario: Guard gates on a condition
- **WHEN** a `Guard` wraps child `C` with a condition that evaluates to false
- **THEN** the guard returns `failure` without ticking `C`

### Requirement: Utility scorer
The system SHALL provide a utility scorer that, given a weighted set of considerations and curves, produces a numeric score in `[0, 1]` per candidate action. The default combinator SHALL be the weighted geometric mean so that a single near-zero consideration vetoes the action; scorers MAY opt into a weighted additive combinator per node.

#### Scenario: Geometric combinator vetoes on a zero consideration
- **GIVEN** a scorer with two considerations, weights `[1, 1]`, curves applied
- **WHEN** one consideration returns `0` for an action
- **THEN** the scorer outputs `0` for that action regardless of the other consideration's value

#### Scenario: Deterministic tie-breaking
- **GIVEN** two actions with identical utility scores and a seeded RNG shared with the blackboard
- **WHEN** the scorer is asked to pick among them twice with the same seed
- **THEN** it returns the same index both times

#### Scenario: Scores restricted to legal actions
- **WHEN** the scorer is invoked with a candidate list
- **THEN** every scored action was present in `ctx.legalActions` at tick time (no illegal actions are ever returned)

### Requirement: Personas as declarative config
The system SHALL model personas as plain data objects containing a name, a map of consideration keys to weights, and optional BT overrides. Adding a new persona SHALL require only a new entry under `src/ai/personas/` — no edits to the BT framework or scorer.

#### Scenario: Balanced persona ships by default
- **WHEN** `UtilityBtAgent` is constructed without an explicit persona
- **THEN** it uses the `balanced` persona

#### Scenario: Persona weights override defaults
- **GIVEN** an `aggressive` persona that sets `cashPreservation` weight to `0` and `launchOpportunity` weight to `2`
- **WHEN** `getAction` is called in a state where both launching and saving are legal
- **THEN** the chosen action is the `LAUNCH` branch (absent other vetoes) rather than a passive/defensive action

### Requirement: Deterministic action selection under a fixed seed
The system SHALL accept a seedable RNG for `UtilityBtAgent` and use it only for tiebreaks and explicitly stochastic considerations. Given identical `{ gameSeed, persona, seatIndex, gameState history }`, the agent MUST return the same action sequence.

#### Scenario: Replay of a game with a UtilityBT opponent reproduces the same actions
- **GIVEN** a recorded game `G` where seat 1 used persona `balanced` with game seed `S`
- **WHEN** the game is re-simulated from the same seed and seat configuration
- **THEN** seat 1 chooses the same action at every decision point
