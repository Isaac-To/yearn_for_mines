## Requirements

### Requirement: Agent verifies startup connection state
The agent SHALL check the bot's connection status upon startup before entering the autonomous loop.

#### Scenario: Bot is already connected
- **WHEN** the agent starts and queries `bot_status`
- **THEN** if the bot is connected, the agent SHALL proceed with the autonomous loop

#### Scenario: Bot requires connection
- **WHEN** the agent starts and queries `bot_status`
- **THEN** if the bot is disconnected, the agent SHALL attempt to connect using configured credentials before starting the loop

### Requirement: Agent pauses loop on disconnection
The agent SHALL monitor the connection state and pause the perceive-plan-execute loop if the bot disconnects from the Minecraft server.

#### Scenario: Connection lost during loop
- **WHEN** the agent detects a disconnection (via `bot_status`, a connection loss event, or tool error)
- **THEN** the agent SHALL pause the loop, log a warning, and enter a waiting state until reconnected

#### Scenario: Reconnection resumes loop
- **WHEN** the agent is in a paused state and detecting a successful reconnection
- **THEN** the agent SHALL resume the autonomous loop from the perceive phase

### Requirement: Agent classifies and handles tool errors
The agent SHALL distinguish between normal game errors (e.g. invalid target, blocked path) and connection/system errors, routing them appropriately.

#### Scenario: Game-related tool error
- **WHEN** a tool returns an error related to game mechanics (e.g., "block cannot be dug")
- **THEN** the agent SHALL feed the error back strictly to the LLM for re-planning

#### Scenario: Connection-related tool error
- **WHEN** a tool returns a connection error (e.g., "bot disconnected", "timeout")
- **THEN** the agent SHALL classify it as a connection error, skip LLM re-planning, and pause the loop to await reconnection