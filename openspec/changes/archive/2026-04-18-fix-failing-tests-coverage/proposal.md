## Why

The `packages/shared` package currently has a failing test in `llm-client.test.ts`, blocking successful suite execution and deployments. There are also widespread broken tests and lagging test coverage in `packages/agent` and `packages/mc-mcp-server` following recent refactors like Context Frames and Experiential Learning additions. Resolving these issues ensures suite reliability and maintains 95% test coverage.

## What Changes

- Fix the system prompt formatting logic in `packages/shared/src/llm-client.ts` to omit the "Relevant memories" block when no memories are passed.
- Ensure the respective unit test `should not include memory section when no memories provided` passes successfully.
- Fix broken tests in `packages/agent/src/__tests__/agent-loop.test.ts` and `packages/agent/src/__tests__/connectivity-integration.test.ts` regarding `bot_status` tool calls and expectation mismatches.
- Expand test coverage in `packages/mc-mcp-server` to reach the configured 95% threshold.

## Capabilities

### New Capabilities

### Modified Capabilities
- `learning-reflection`: The LLM client formatting prompt is updated to not include the "Relevant memories" text when no memories are passed.

## Impact

- `packages/shared/src/llm-client.ts` and corresponding tests
- `packages/agent/src/__tests__/agent-loop.test.ts` and `packages/agent/src/__tests__/connectivity-integration.test.ts`
- Tests across `packages/mc-mcp-server`
