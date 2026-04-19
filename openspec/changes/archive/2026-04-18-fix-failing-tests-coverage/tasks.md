## 1. Fix Prompt Formatting (Completed)

- [x] 1.1 Update `formatSystemPrompt` in `packages/shared/src/llm-client.ts` to conditionally render the "Relevant memories" block based on the `memories` array length.
- [x] 1.2 Run `vitest run` on `packages/shared` and assert `should not include memory section when no memories provided` test passes.

## 2. Fix Agent Tests

- [x] 2.1 Update `packages/agent/src/__tests__/agent-loop.test.ts` to replace outdated assertions (`observe`, `get_events`) with the current `bot_status`.
- [x] 2.2 Update `packages/agent/src/__tests__/agent-loop.test.ts` to account for new Reflect & Remember logic (e.g. `mempalace_add_drawer`, extraction changes).
- [x] 2.3 Ensure context frame tracking and paused state assertions match recent disconnect/reconnect logic in `packages/agent/src/__tests__/connectivity-integration.test.ts`.

## 3. Restore mc-mcp-server Code Coverage

- [x] 3.1 Expand coverage in `packages/mc-mcp-server` to reach the 95% threshold required by `vitest.config.base.ts`.

## 4. Final Validation

- [x] 4.1 Run global code coverage `pnpm -r run test:coverage` to confirm code coverage thresholds (95%+) are maintained and there are no other regressions.
