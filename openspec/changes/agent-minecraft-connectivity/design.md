## Context

The agent connects to the Minecraft world through two hops: Agent → MC MCP Server → Minecraft server. The current startup sequence in `main.ts` uses `connectMcpWithRetry` (up to 10 retries) to connect to the MCP server, then the agent loop begins calling tools like `bot_connect`, `observe`, etc. If the MCP server isn't ready or the Minecraft server isn't reachable, the agent retries tool calls within its loop but has no structured way to distinguish connection failures from bad tool arguments.

The MC MCP server's `BotManager` manages the Mineflayer bot lifecycle. When `bot_connect` succeeds, the bot is spawned and tools work. When it fails, the error bubbles up through the tool response. But there's no status tool — the agent can't ask "is the bot connected?" without attempting an action.

## Goals / Non-Goals

**Goals:**
- Ensure the agent can reliably connect to the MC MCP server and verify the Minecraft bot is spawned before starting the perceive-plan-execute loop
- Add a `bot_status` MCP tool so the agent (and web UI) can query bot connection state without side effects
- Give the agent loop a clear state machine: `connecting` → `connected` → `running`, with `paused` when connectivity is lost
- Improve error classification in tool call results so the retry logic can distinguish transient connection errors from permanent argument errors

**Non-Goals:**
- Auto-reconnection with exponential backoff in the MCP server (the agent can simply call `bot_connect` again)
- Changing the MCP transport layer or protocol
- Adding authentication or multi-tenancy to the MCP server
- Modifying MemPalace connectivity (that's a separate concern)

## Decisions

### 1. Add `bot_status` as a dedicated MCP tool (not just a resource)

**Decision**: Expose bot connection state as a callable tool `bot_status` returning `{ connected: boolean, username: string, position?: {x,y,z}, health?: number }`, in addition to the existing `bot://status` resource.

**Rationale**: The agent loop calls tools, not resources. Adding a tool that mirrors the resource data lets the agent check connectivity as a regular planning step without special-casing resource reads. The resource remains for the web UI.

**Alternatives considered**:
- Resource-only approach: Would require the agent to handle a different API path just for status checks. More complexity for no gain.
- Inline status in every tool response: Adds payload to every response, most of which won't need it.

### 2. Agent startup state machine: connect → verify → run

**Decision**: The agent startup sequence becomes:
1. Connect to MCP server (with existing `connectMcpWithRetry`)
2. Call `bot_connect` to spawn the bot
3. Call `bot_status` to verify the bot is alive
4. Enter the perceive-plan-execute loop

If step 3 fails, retry from step 2 (up to `AGENT_MAX_RETRIES`). If step 2 fails after retries, enter paused state and retry periodically.

**Rationale**: This eliminates the race where the agent starts planning before the bot is actually in the world. The explicit verify step ensures the loop only runs when connectivity is confirmed.

**Alternatives considered**:
- Health-check polling: Could work but adds a background timer. The state machine approach is simpler and more explicit.

### 3. Pause the agent loop on disconnection, resume on reconnection

**Decision**: When a tool call returns a connection-related error (bot not connected, MCP transport error), the agent enters a `paused` state. In `paused` state, it periodically calls `bot_status` until the bot is back, then resumes the loop from the last observation.

**Rationale**: Currently, the agent retries tool calls with its existing retry logic, which is designed for argument errors, not connectivity. Separating the two cases means the retry logic stays clean and the pause/resume logic is explicit.

**Alternatives considered**:
- Transparent reconnect: The MCP server could auto-reconnect the bot, but this hides state changes from the agent (position may have changed, inventory may be different).
- Crash and restart: Works but wastes time on full process restart vs. resuming from a known state.

### 4. Classify tool errors as transient vs. permanent

**Decision**: Add a `transient` boolean to error tool results. Transient errors are connection-related (bot not connected, MCP transport failure, timeout). Permanent errors are argument-related (invalid block name, item not in inventory). The agent's retry logic only retries on transient errors.

**Rationale**: The current retry logic retries all errors up to 3 times, which wastes iterations on permanent failures like "oak_planks not in inventory". Classifying errors lets the agent handle each type appropriately.

**Alternatives considered**:
- Error codes: Could work but requires a mapping. A boolean is simpler and sufficient for the two categories we have.

## Risks / Trade-offs

- **Risk**: Bot disconnection mid-loop could lose context about what the agent was doing → **Mitigation**: Save the last observation and plan in the loop state so the agent can pick up where it left off after reconnection.
- **Risk**: `bot_status` adds a tool call on every reconnection check → **Mitigation**: Minimal — it's a lightweight read with no side effects.
- **Trade-off**: State machine adds complexity to the agent loop → Accepted because the current ad-hoc retry approach is harder to reason about and debug.