## ADDED Requirements

### Requirement: All processes trap SIGINT and SIGTERM
Every long-running process in the monorepo (agent, MCP server, web UI) SHALL register handlers for SIGINT and SIGTERM that initiate graceful shutdown.

#### Scenario: Developer presses Ctrl+C while agent is running
- **WHEN** the agent process receives SIGINT or SIGTERM
- **THEN** the agent cancels the running loop, disconnects MCP clients, and exits with code 0

#### Scenario: MCP server receives termination signal
- **WHEN** the MCP server process receives SIGINT or SIGTERM
- **THEN** it closes all active MCP sessions, disconnects the bot, and exits with code 0

#### Scenario: Web UI receives termination signal
- **WHEN** the web UI process receives SIGINT or SIGTERM
- **THEN** it closes WebSocket connections, disconnects the MCP client, stops polling, and exits with code 0

### Requirement: Forced exit timeout on shutdown
Each process SHALL enforce a maximum shutdown duration. If cleanup does not complete within the timeout, the process SHALL log a warning and force-exit with code 1.

#### Scenario: Cleanup hangs beyond timeout
- **WHEN** a process receives a termination signal and cleanup takes longer than the configured timeout (default 10 seconds)
- **THEN** the process logs a warning message and calls `process.exit(1)`

#### Scenario: Cleanup completes within timeout
- **WHEN** a process receives a termination signal and cleanup completes within the timeout
- **THEN** the process exits with code 0

### Requirement: Agent loop supports abort via AbortSignal
The AgentLoop class SHALL accept an optional `AbortSignal` and cancel any in-progress iteration when the signal fires.

#### Scenario: AbortSignal fires during LLM call
- **WHEN** the abort signal fires while the agent is awaiting an LLM response
- **THEN** the pending LLM call is cancelled and the loop exits without completing the current iteration

#### Scenario: AbortSignal fires during tool execution
- **WHEN** the abort signal fires while the agent is executing an MCP tool call
- **THEN** the pending tool call is cancelled and the loop exits

#### Scenario: AbortSignal fires during loop delay
- **WHEN** the abort signal fires during the delay between iterations
- **THEN** the delay is cancelled immediately and the loop exits

#### Scenario: No AbortSignal provided
- **WHEN** no AbortSignal is provided to AgentLoop
- **THEN** the loop runs to completion as it does today (backward compatible)

### Requirement: Agent process disconnects MCP clients on shutdown
The agent main entry point SHALL disconnect all MCP clients (MC server and MemPalace) before exiting, even when interrupted by a signal.

#### Scenario: Agent receives SIGINT with active MCP connections
- **WHEN** the agent receives a termination signal while connected to MC MCP server and MemPalace
- **THEN** it calls `disconnect()` on both MCP clients before exiting

#### Scenario: MCP client disconnect fails
- **WHEN** an MCP client's `disconnect()` call throws an error during shutdown
- **THEN** the error is logged but does not prevent the process from exiting

### Requirement: BotManager removes listeners on disconnect
BotManager.disconnect() SHALL remove all event listeners from the bot and wait for the `end` event (with timeout) before returning.

#### Scenario: Bot disconnects cleanly
- **WHEN** `disconnect()` is called on a connected bot
- **THEN** it calls `bot.quit('Disconnecting')`, waits for the `end` event (up to 3 seconds), and removes all listeners before returning success

#### Scenario: Bot `end` event times out
- **WHEN** `disconnect()` is called and the `end` event does not fire within 3 seconds
- **THEN** it removes all listeners, sets the bot reference to null, and returns success with a warning logged

### Requirement: Shared shutdown utility
The `@yearn-for-mines/shared` package SHALL export a `registerShutdown` function that wraps SIGINT/SIGTERM handling with a forced-exit timeout.

#### Scenario: Multiple handlers registered
- **WHEN** `registerShutdown` is called with multiple cleanup handlers
- **THEN** all handlers run in parallel on SIGINT/SIGTERM, and the process waits for all to complete (up to the timeout) before exiting

#### Scenario: Handler throws during shutdown
- **WHEN** a registered cleanup handler throws an error
- **THEN** the error is logged and other handlers continue running

### Requirement: Docker Compose graceful shutdown configuration
All services in `docker-compose.yml` SHALL specify `stop_grace_period` values appropriate to their shutdown duration.

#### Scenario: Agent container receives SIGTERM
- **WHEN** Docker sends SIGTERM to the agent container
- **THEN** the agent has 15 seconds to complete shutdown before Docker sends SIGKILL

#### Scenario: MCP server or web UI container receives SIGTERM
- **WHEN** Docker sends SIGTERM to the MCP server or web UI container
- **THEN** the service has 10 seconds to complete shutdown before Docker sends SIGKILL