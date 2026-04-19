## ADDED Requirements

### Requirement: Agent performs startup verification before entering loop
The agent SHALL verify end-to-end connectivity (MCP server reachable + bot spawned) before starting the perceive-plan-execute-verify-remember loop.

#### Scenario: Successful startup verification
- **WHEN** the agent starts and both the MCP server and Minecraft bot are reachable
- **THEN** the agent SHALL connect to the MCP server, call `bot_connect`, call `bot_status` to confirm the bot is connected, and then enter the running state

#### Scenario: MCP server unreachable at startup
- **WHEN** the agent starts but cannot connect to the MCP server
- **THEN** the agent SHALL retry the MCP connection with exponential backoff (up to 10 attempts) and log each attempt

#### Scenario: Bot fails to connect to Minecraft server
- **WHEN** the MCP server is reachable but `bot_connect` fails
- **THEN** the agent SHALL retry `bot_connect` up to `AGENT_MAX_RETRIES` times, then enter a paused state and retry periodically

### Requirement: Agent pauses loop on disconnection
The agent SHALL enter a paused state when it detects that the Minecraft bot is disconnected, and resume the loop when connectivity is restored.

#### Scenario: Bot disconnects mid-loop
- **WHEN** a tool call returns a transient error indicating the bot is not connected
- **THEN** the agent SHALL pause the perceive-plan-execute loop, save the last observation and plan, and begin polling `bot_status`

#### Scenario: Bot reconnects after pause
- **WHEN** the agent is in paused state and `bot_status` reports the bot is connected
- **THEN** the agent SHALL resume the loop using the last saved observation as context

#### Scenario: Bot does not reconnect within iteration budget
- **WHEN** the agent is paused and the total iterations (including pause-poll iterations) exceed `AGENT_MAX_ITERATIONS`
- **THEN** the agent SHALL log a failure to MemPalace and exit the loop

### Requirement: Agent classifies tool errors as transient or permanent
The agent SHALL distinguish between transient connectivity errors and permanent argument errors when processing tool call results.

#### Scenario: Transient error received
- **WHEN** a tool call returns an error with `transient: true` or the error message matches a known connectivity pattern (e.g., "bot not connected", "MCP transport error", "timeout")
- **THEN** the agent SHALL treat the error as transient and enter the pause-and-reconnect flow

#### Scenario: Permanent error received
- **WHEN** a tool call returns an error without a transient indicator
- **THEN** the agent SHALL treat the error as permanent, feed it back to the LLM for replanning, and NOT count it against connection retry limits