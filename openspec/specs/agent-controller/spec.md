## MODIFIED Requirements

### Requirement: Agent plans using LLM with tool descriptions
The agent SHALL send observations and available tool descriptions to the LLM, requesting a plan of action expressed as tool calls. Observations MUST include recent Minecraft chat events when present.

#### Scenario: LLM generates a plan
- **WHEN** the agent sends the observation and available MCP tool descriptions to the LLM
- **THEN** the LLM SHALL respond with one or more tool calls that constitute a plan

#### Scenario: Observation includes chat context
- **WHEN** recent in-game chat messages exist
- **THEN** the agent SHALL include those messages in the observation sent to the LLM

### Requirement: Agent communicates progress in-game
The agent SHALL optionally narrate key actions and outcomes in Minecraft chat using the `send_chat` tool.

#### Scenario: Start narration
- **WHEN** the agent begins a goal
- **THEN** the agent SHALL send a short chat message describing the goal

#### Scenario: Failure narration
- **WHEN** a tool call fails and the agent changes strategy
- **THEN** the agent SHALL send a concise chat message explaining the failure and next step

#### Scenario: Completion narration
- **WHEN** the agent verifies the goal is complete
- **THEN** the agent SHALL send a short chat completion message

### Requirement: Agent responds to player chat
The agent SHALL respond to in-game chat messages directed at it and consider them as guidance for its plan.

#### Scenario: Respond to direct message
- **WHEN** a chat message mentions the bot name or is from an operator
- **THEN** the agent SHALL reply acknowledging the message and adjust the plan if it requests a feasible action