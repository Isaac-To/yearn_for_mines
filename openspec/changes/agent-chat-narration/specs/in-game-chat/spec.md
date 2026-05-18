## ADDED Requirements

### Requirement: MCP tool sends Minecraft chat
The MCP server SHALL expose a `send_chat` tool that delivers a text message to the Minecraft server using the active bot.

#### Scenario: Send chat while connected
- **WHEN** the agent calls `send_chat` with a message and the bot is connected
- **THEN** the server SHALL send the chat message in-game and return success

#### Scenario: Send chat while disconnected
- **WHEN** the agent calls `send_chat` and the bot is not connected
- **THEN** the server SHALL return an error response indicating the bot is not connected

#### Scenario: Rate limit chat
- **WHEN** the agent calls `send_chat` more frequently than the configured rate limit
- **THEN** the server SHALL reject or defer the message with a clear error

### Requirement: Chat events surface in observations
The MCP server SHALL include recent in-game chat events in observation output provided to the agent.

#### Scenario: Chat event captured
- **WHEN** another player sends a chat message near the bot
- **THEN** the server SHALL record the chat event with username and message text

#### Scenario: Observation includes chat events
- **WHEN** the agent receives an observation after chat events have occurred
- **THEN** the observation SHALL include the recent chat events in a structured list
