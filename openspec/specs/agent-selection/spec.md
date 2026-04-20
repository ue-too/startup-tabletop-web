# agent-selection

## Requirements

### Requirement: Per-seat agent configuration
The system SHALL let callers of `GameController` and `SimController` specify, per seat, which agent implementation occupies that seat. The configuration MUST support at least `human`, `onnx` (with a model path), and `utilityBt` (with a persona name).

#### Scenario: Mixed seat configuration is accepted
- **WHEN** the controller is constructed with seats `[human, utilityBt:balanced, onnx:<path>, utilityBt:aggressive]`
- **THEN** seat 0 is treated as the human, seat 1 uses a `UtilityBtAgent` with the balanced persona, seat 2 uses an `OnnxAgent` bound to the given model path, and seat 3 uses a `UtilityBtAgent` with the aggressive persona

#### Scenario: Seat count mismatch is rejected
- **WHEN** the controller is constructed with `numPlayers = 3` but a `seats` array of length 2
- **THEN** construction throws an error before any game state is mutated

#### Scenario: Unknown persona name is rejected
- **WHEN** a seat config references a persona name that does not exist under `src/ai/personas/`
- **THEN** construction throws an error naming the missing persona

### Requirement: Agent initialization is agent-specific
The system SHALL call `init()` only on agents that declare it, SHALL load ONNX models only for seats configured as `onnx`, and SHALL skip network/disk work for seats that don't need it.

#### Scenario: Pure UtilityBT game does not fetch the ONNX model
- **GIVEN** a controller whose seats contain no `onnx` entries
- **WHEN** `init()` is awaited
- **THEN** no fetch is made to the configured model path

#### Scenario: Mixed game loads the model only once per distinct path
- **GIVEN** a controller with two seats both configured as `onnx` with the same `modelPath`
- **WHEN** `init()` is awaited
- **THEN** the model bytes are fetched at most once (agents share the session or reuse the fetch)

### Requirement: Opponent picker in setup UI
The game-setup pages (`HomePage` and/or `SimPage`) SHALL present, for each non-human seat, a control that lets the player choose between `ONNX` and each available `UtilityBT` persona before starting the game. The selection SHALL flow into the controller's `seats` array.

#### Scenario: Player selects an aggressive utility-BT opponent
- **GIVEN** the setup page with two seats: one human, one AI
- **WHEN** the player opens the AI seat's dropdown and selects `UtilityBT: aggressive`
- **THEN** starting the game constructs a controller whose seat 1 uses `UtilityBtAgent` with the aggressive persona

#### Scenario: Default selection is preserved on page reload within a session
- **GIVEN** a player chose `UtilityBT: balanced` for seat 1
- **WHEN** they navigate away and back within the same session
- **THEN** the picker still shows `UtilityBT: balanced` as the selected option (session-scoped; persistence across reloads is out of scope)
