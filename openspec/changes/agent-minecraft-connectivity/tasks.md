## 1. MCP Server — Bot Status Tool

- [x] 1.1 Add `bot_status` tool to `packages/mc-mcp-server/src/tools/` that returns `{ connected, username, position, health, gameMode, connecting }` from `BotManager`
- [x] 1.2 Add Zod input/output schemas for `bot_status` tool
- [x] 1.3 Register `bot_status` in the MCP server's tool list
- [x] 1.4 Add tests for `bot_status` covering connected, disconnected, and connecting states

## 2. MCP Server — Error Classification

- [x] 2.1 Add `transient` field to error responses in `BotManager` and tool handlers (bot not connected, transport error, timeout)
- [x] 2.2 Update `bot_connect` to return `transient: true` for connection failures and handle "already connected" case gracefully
- [x] 2.3 Update existing tool error responses to include `transient: false` for argument errors (e.g., block not found, item not in inventory)
- [ ] 2.4 Add tests verifying transient vs. permanent error classification

## 3. Shared — Connection State Types

- [x] 3.1 Add `AgentState` enum to `packages/shared/src/types/` with values: `connecting`, `connected`, `running`, `paused`
- [x] 3.2 Add `ToolError` type with `transient` field to shared types
- [x] 3.3 Export new types from shared package index

## 4. Agent — Startup Verification

- [ ] 4.1 Refactor agent startup in `packages/agent/src/main.ts` to follow the state machine: connect MCP → call `bot_connect` → call `bot_status` → enter running
- [ ] 4.2 Add retry logic for `bot_connect` with `AGENT_MAX_RETRIES` and periodic retry in paused state
- [ ] 4.3 Add connection state tracking to `AgentLoop` class/module
- [ ] 4.4 Add tests for startup verification sequence (success, MCP unreachable, bot unreachable)

## 5. Agent — Pause/Resume on Disconnection

- [ ] 5.1 Add paused state to the agent loop that saves last observation and plan
- [ ] 5.2 Implement disconnection detection: check for transient errors or `transient: true` in tool results
- [ ] 5.3 Implement polling `bot_status` while paused, with configurable interval
- [ ] 5.4 Implement resume: re-observe world state, inject previous plan context into LLM prompt, resume loop
- [ ] 5.5 Add iteration budget accounting that counts pause-poll iterations toward `AGENT_MAX_ITERATIONS`
- [ ] 5.6 Add tests for pause/resume flow (disconnection during loop, reconnection, iteration budget exhaustion)

## 6. Integration Testing

- [ ] 6.1 Write integration test: full startup → observe → disconnect → pause → reconnect → resume → verify
- [ ] 6.2 Write integration test: MCP server starts after agent (startup race condition)
- [ ] 6.3 Write integration test: `bot_status` returns correct state across connect/disconnect lifecycle