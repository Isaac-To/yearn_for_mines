## Why

The agent loop and MC MCP server exist but the end-to-end connection between them is fragile. The agent races the MCP server on startup (requiring retry logic), tool calls can fail silently, and there's no structured way to verify the full pipeline works before the agent begins its loop. We need reliable, verified connectivity so the agent can consistently perceive the Minecraft world and take actions within it.

## What Changes

- Add a connection health-check step to the agent startup sequence that verifies MCP server availability before attempting the agent loop
- Ensure `bot_connect` is called reliably at startup and reconnection is handled gracefully when the Minecraft server disconnects mid-session
- Add connection state tracking so the agent loop can pause/resume based on connectivity status
- Improve error propagation from MCP tool calls so the agent's retry logic has clear signal about whether a failure is transient (connection issue) vs. permanent (invalid tool args)

## Capabilities

### New Capabilities
- `agent-connection-lifecycle`: Reliable startup, health-check, reconnection, and graceful degradation when MC server or MCP server is unavailable

### Modified Capabilities
- `minecraft-mcp-server`: Add connection status reporting so the agent can query whether the bot is connected
- `agent-controller`: Use connection lifecycle state to pause/resume the agent loop and handle reconnection

## Impact

- `packages/agent/src/` — Startup sequence, connection retry logic, agent loop pause/resume
- `packages/mc-mcp-server/src/` — Connection status tool, bot event handling improvements
- `packages/shared/src/` — Possible shared connection state types
- `packages/shared/src/config.ts` — Any new config for retry/backoff behavior