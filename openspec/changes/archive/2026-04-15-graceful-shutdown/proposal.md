## Why

Process termination across the monorepo is inconsistent: the MCP server and web-ui handle SIGINT/SIGTERM but the agent does not; the Mineflayer bot can leave zombie connections on force-kill; Docker containers lack explicit `stop_signal` and shutdown timeouts; and the agent loop has no mechanism to abort mid-iteration. This means Ctrl+C, container stops, and crash-recovery scenarios can leave orphan processes, dangling MCP sessions, and unclosed Minecraft connections.

## What Changes

- Add SIGINT/SIGTERM handlers to the agent process that cancel the running loop and disconnect MCP clients before exiting
- Add an `abort` mechanism to the agent loop so it can be cancelled mid-iteration (abort controller or cancellation signal)
- Ensure the Mineflayer bot sends a proper quit message and cleans up listeners on shutdown, even on forced termination
- Add a `stop_signal` and `stop_grace_period` to Docker Compose so containers receive SIGTERM with a timeout before SIGKILL
- Ensure the `dev.sh` trap handler and `concurrently` kill-others both propagate signals correctly to child processes

## Capabilities

### New Capabilities
- `graceful-shutdown`: Standardized shutdown handling across all processes — signal trapping, connection draining, resource cleanup, and orderly exit

### Modified Capabilities
- `dev-orchestrator`: Extend the dev-orchestrator spec to cover signal propagation from concurrently to child processes and shutdown timeout behavior

## Impact

- **Agent package**: `main.ts`, `agent-loop.ts` — new abort/cancel mechanism, signal handlers
- **MC MCP Server package**: `bot-manager.ts` — improved disconnect cleanup, listener removal
- **Web UI package**: minimal changes (already handles shutdown well)
- **Shared package**: possibly a shared `gracefulShutdown()` utility or signal-handling helper
- **Docker**: `docker-compose.yml` — add `stop_signal` and `stop_grace_period`
- **Scripts**: `dev.sh` — verify signal propagation