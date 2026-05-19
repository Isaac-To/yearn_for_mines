## ADDED Requirements

### Requirement: Observe tool provides on-demand world state observation
The MCP server SHALL expose an `observe` tool that returns a formatted text observation of the bot's current world state, including inventory, nearby entities, craftable items, points of interest, and recent events.

#### Scenario: Successful observation
- **WHEN** the `observe` tool is called and the bot is connected
- **THEN** the server SHALL build a full observation using the observation pipeline
- **AND** return the formatted observation text via `textResult()`

#### Scenario: Bot not connected
- **WHEN** the `observe` tool is called and the bot is not connected
- **THEN** the server SHALL return an error result: "Bot not connected"

## MODIFIED Requirements

### Requirement: MCP server provides chat tooling
The MCP server SHALL expose a `send_chat` tool that sends a chat message using the active bot connection. The `message` parameter SHALL have a description: "Chat message to send (max 256 characters)".

#### Scenario: Valid chat message
- **WHEN** the `send_chat` tool is called with a non-empty message and the bot is connected
- **THEN** the server SHALL send the message to Minecraft chat and return a success result

#### Scenario: Invalid or empty message
- **WHEN** the `send_chat` tool is called with an empty or invalid message
- **THEN** the server SHALL return a validation error

### Requirement: MCP server emits chat events
The MCP server SHALL include chat events in the observation pipeline for agent consumption.

#### Scenario: Chat event recorded
- **WHEN** the bot receives a chat message event
- **THEN** the server SHALL store the event in the event buffer with username and message