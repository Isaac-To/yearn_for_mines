## 1. Observe MCP Tool

- [x] 1.1 Create `packages/mc-mcp-server/src/tools/observe.ts` with `registerObserveTool` function that calls `ObservationContext.observe(bot)` and returns formatted text via `textResult()`
- [x] 1.2 Register `observe` tool in `http-transport.ts` `createMcpServer()`, passing `ObservationContext` instance
- [x] 1.3 Handle disconnected-bot case: return `errorResult('Bot not connected')` when bot is null

## 2. Bot Status Upgrade

- [x] 2.1 Expand `bot_status` tool in `lifecycle.ts` to include inventory summary, nearby entities (top 5), and craftable items in the returned data alongside existing fields
- [x] 2.2 Preserve backward compatibility: keep all existing fields (`connected`, `username`, `position`, `health`, `food`, `experience`, `gameMode`) with same names and types

## 3. Agent Loop Perception Rewrite

- [x] 3.1 Add `observe` to the agent's discovered tools list (it will appear automatically via `listTools()` from the MCP server)
- [x] 3.2 In `agent-loop.ts` perceive phase, replace `bot_status` call with `observe` tool call; fall back to `bot_status` on error
- [x] 3.3 Replace `JSON.stringify(status)` observation with the formatted text from `observe` result
- [x] 3.4 Remove `getBotStatus()` helper method (or refactor it to call `observe` instead) — keep only for disconnect detection polling
- [x] 3.5 Ensure disconnect detection still works: the paused-state polling may still use `bot_status` for lightweight connectivity checks (not full observation)

## 4. Event Flushing Coordination

- [x] 4.1 Verify that `observe` tool flushes `EventManager` events (via `ObservationContext.observe()`)
- [x] 4.2 Verify that subsequent tool-result observations don't duplicate events already consumed by the perceive-phase observation

## 5. Tests

- [x] 5.1 Add unit test for `observe` tool: connected bot returns formatted observation text
- [x] 5.2 Add unit test for `observe` tool: disconnected bot returns error result
- [x] 5.3 Add unit test for expanded `bot_status`: response includes inventory summary, nearby entities, craftable items
- [x] 5.4 Update existing `bot_status` tests to verify backward-compatible fields are unchanged

## 6. Validation

- [x] 6.1 Run `pnpm typecheck` to verify no type errors
- [x] 6.2 Run `pnpm lint` to verify style compliance
- [x] 6.3 Run `pnpm test` to verify all tests pass