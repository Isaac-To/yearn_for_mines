## Requirements

### Requirement: Agent loop injects full observation into every planning turn
The agent loop SHALL call the `observe` MCP tool during the perceive phase and include the formatted observation text in every planning prompt, replacing the bare `bot_status` JSON observation.

#### Scenario: Observation injected into plan step
- **WHEN** the agent loop begins a new iteration
- **THEN** the perceive phase SHALL call the `observe` MCP tool
- **AND** the formatted observation text SHALL be included in the user message before the planner invokes the LLM

#### Scenario: Observation unavailable (bot disconnected)
- **WHEN** the `observe` tool fails or returns an error
- **THEN** the agent loop SHALL fall back to calling `bot_status` and using the minimal JSON as observation
- **AND** the loop SHALL continue without crashing

#### Scenario: Observation text replaces bot_status JSON in planning prompt
- **WHEN** the agent loop constructs the planning prompt
- **THEN** the observation text from `observe` SHALL replace the `JSON.stringify(bot_status_result)` in the "Current World State Observation" section
- **AND** the prompt template SHALL remain otherwise unchanged

### Requirement: Agent loop preserves perceive-then-act ordering
The agent loop SHALL always perceive (call `observe`) before planning and acting in each iteration, ensuring the LLM always has current world state when deciding what to do.

#### Scenario: Standard iteration flow
- **WHEN** a new iteration begins
- **THEN** the loop SHALL execute: perceive (observe) → plan → execute → verify
- **AND** the observation from perceive SHALL be the observation used for that iteration's planning

#### Scenario: First iteration after reconnection
- **WHEN** the bot reconnects after a disconnection
- **THEN** the agent loop SHALL call `observe` before attempting any action
- **AND** the fresh observation SHALL inform the LLM's first action after reconnection