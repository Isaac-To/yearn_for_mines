## ADDED Requirements

### Requirement: MCP server exposes bot status query tool
The system SHALL provide a `bot_status` MCP tool that returns the current connection state of the bot without side effects.

#### Scenario: Bot is connected
- **WHEN** the `bot_status` tool is called while the bot is connected to the Minecraft server
- **THEN** the server SHALL return `{ connected: true, username: string, position: {x,y,z}, health: number, gameMode: string }`

#### Scenario: Bot is not connected
- **WHEN** the `bot_status` tool is called while the bot is not connected
- **THEN** the server SHALL return `{ connected: false, username: string, position: null, health: null, gameMode: null }`

#### Scenario: Bot is connecting
- **WHEN** the `bot_status` tool is called while the bot is in the process of connecting
- **THEN** the server SHALL return `{ connected: false, username: string, position: null, health: null, gameMode: null, connecting: true }`

## MODIFIED Requirements

### Requirement: MCP server exposes Mineflayer bot lifecycle management
The system SHALL provide MCP tools for managing the bot's connection lifecycle including creating, connecting, disconnecting, and respawning the bot. Tool errors SHALL be classified as transient or permanent to enable intelligent retry behavior.

#### Scenario: Bot connects to Minecraft server
- **WHEN** the `bot_connect` tool is called with valid host, port, username, and version
- **THEN** the server SHALL create a Mineflayer bot instance, connect to the specified Minecraft server, and return a success response with the bot's username and spawn position

#### Scenario: Bot disconnects gracefully
- **WHEN** the `bot_disconnect` tool is called while the bot is connected
- **THEN** the server SHALL disconnect the bot from the Minecraft server and clean up resources

#### Scenario: Bot respawns after death
- **WHEN** the `bot_respawn` tool is called after the bot has died
- **THEN** the server SHALL respawn the bot at the world spawn point

#### Scenario: Bot connection fails
- **WHEN** the `bot_connect` tool is called with an unreachable server
- **THEN** the server SHALL return an error response with `isError: true`, `transient: true`, and a descriptive message indicating the connection failure

#### Scenario: Bot is already connected when connect is called
- **WHEN** the `bot_connect` tool is called while the bot is already connected
- **THEN** the server SHALL return a success response with the current connection details without creating a duplicate bot instance