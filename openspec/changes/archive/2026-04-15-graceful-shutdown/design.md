## Context

The monorepo runs three long-lived Node.js processes (MCP server, web UI, agent) plus an optional Python MemPalace process. Currently:

- **MC MCP server** and **web UI** handle SIGINT/SIGTERM by calling `server.stop()` then `process.exit(0)`, but don't guarantee the stop completes within a timeout.
- **Agent** has **no signal handlers at all** — Ctrl+C kills it mid-iteration, skipping cleanup (MCP disconnects, memory writes).
- **AgentLoop.stop()** sets a `running = false` flag, but the loop only checks it at the top of each iteration. An in-progress `await` (LLM call, MCP tool call, `setTimeout`) blocks cancellation.
- **BotManager.disconnect()** calls `bot.quit()` but doesn't remove event listeners or wait for the bot's `end` event.
- **Docker Compose** has no `stop_signal` or `stop_grace_period`, so containers get Docker's default 10s SIGKILL timeout.
- **dev.sh** uses a `trap` handler and `PIDS` array, which is fragile and redundant with `concurrently`'s `--kill-others`.

## Goals / Non-Goals

**Goals:**
- Every process traps SIGINT/SIGTERM and shuts down cleanly (closes connections, drains requests, exits 0)
- Agent loop can be aborted mid-iteration without waiting for the current LLM call or tool execution to finish
- Bot sends a clean quit message and removes listeners before the process exits
- Docker Compose uses an explicit graceful shutdown timeout
- Dev orchestration propagates signals reliably to all child processes

**Non-Goals:**
- Hot-reloading or zero-downtime restarts
- Persisting in-flight agent state to disk for resume later
- Changes to MemPalace (external Python process, out of scope)
- Changing the agent loop's retry/alternative logic

## Decisions

### 1. Use AbortController for agent loop cancellation

**Choice:** Pass an `AbortSignal` into `AgentLoop` rather than just `stop()`.

**Rationale:** The current `running` flag only works at iteration boundaries. An `AbortSignal` can be passed to any `await`-able operation that supports it (fetch, setTimeout, custom promises). When the signal fires, pending operations reject immediately rather than completing their full duration.

**Alternative considered:** Cooperative check points (check `this.running` between each phase). Rejected because it still blocks on long LLM calls and doesn't cancel in-flight MCP tool calls.

### 2. Shared `gracefulShutdown()` helper in `@yearn-for-mines/shared`

**Choice:** Add a `registerShutdown(handler)` utility to the shared package that wraps SIGINT/SIGTERM handling with a forced-exit timeout.

**Rationale:** Both the MCP server and web UI have nearly identical signal handler code. The agent will need the same pattern. A shared helper reduces duplication and ensures consistent timeout behavior (default 10s forced exit if cleanup hangs).

**Alternative considered:** Each package implements its own handler. Rejected because the pattern is identical across all three and diverging implementations led to the current inconsistency.

### 3. BotManager cleans up listeners on disconnect

**Choice:** Call `bot.removeAllListeners()` after `bot.quit()` and wait for the `end` event with a short timeout before nulling the reference.

**Rationale:** Mineflayer bots emit many events (`physicTick`, `chat`, etc.) that hold references. Removing listeners prevents memory leaks and ensures the bot object can be GC'd. Waiting for `end` confirms the server processed the quit.

**Alternative considered:** Just call `bot.quit()` and null immediately (current behavior). Rejected because it can leave zombie connections and unprocessed event handlers.

### 4. Docker Compose `stop_grace_period: 15s`

**Choice:** Add `stop_grace_period: 15s` to the `agent` service and a 10s period to other services.

**Rationale:** The agent may need up to 10s to abort an in-flight LLM call and disconnect MCP clients. Other services shut down faster (close HTTP server, close WebSocket). 15s gives the agent breathing room while keeping the overall shutdown under 20s.

### 5. Dev scripts rely on `concurrently` signal propagation, remove `trap`/`PIDS`

**Choice:** Remove the manual `trap` handler and `PIDS` array from `dev.sh`, rely entirely on `concurrently`'s `--kill-others` and its built-in SIGINT handling.

**Rationale:** `concurrently` already handles SIGINT propagation to child processes. The `trap`/`PIDS` pattern is redundant and fragile (race conditions on process list). This aligns with the dev-orchestrator spec which already specifies `concurrently` as the orchestrator.

## Risks / Trade-offs

- **AbortController propagation depth** → Not all async operations accept `AbortSignal`. For operations that don't (e.g., MCP SDK calls), we'll wrap them in a `Promise.race` with an abort listener that rejects on signal. This is a lightweight pattern that works without modifying the MCP SDK.
- **Force-exit timeout is a hard cutoff** → If cleanup takes longer than the timeout, the process exits with code 1 and logs a warning. This is preferable to hanging indefinitely, and the 10-15s window should be sufficient for normal operations.
- **Removing dev.sh trap handler** → Low risk since `concurrently` already handles this. We should verify manually that Ctrl+C works correctly after the change.