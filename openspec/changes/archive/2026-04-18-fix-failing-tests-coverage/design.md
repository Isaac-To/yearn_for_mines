## Context

The `llm-client.test.ts` failure indicates a regression regarding rendering memory within the generic system prompt payload of the LLM pipeline (`LlmClient`). Concurrently, large architectural changes like Context Frames and Experiential Learning broke the E2E test suites in `packages/agent` resulting in 19 test failures, typically relating to replacing the `observe` or `get_events` tools with `bot_status`, and missing coverage in `packages/mc-mcp-server`.

## Goals / Non-Goals

**Goals:**
- Conditionally render the "Relevant memories" block in the system prompt only when the `memories` parameter is populated containing one or more entries.
- Repair the agent loop assertions across `agent-loop.test.ts` and `connectivity-integration.test.ts` to expect `bot_status` tool calls and appropriate context frame checks.
- Add or fix missing coverage in `mc-mcp-server` so the module passes the 95% threshold.
- Have the `test:coverage` command passing across all modules.

**Non-Goals:**
- Changes to the underlying core logic of Memory management or MemPalace implementation.
- Adjustments to Agent loop internals outside of fixing test files.

## Decisions

- **Conditional formatting in `llm-client.ts`**: Update the `formatSystemPrompt` function.
- **Agent test repairs**: Replace outdated tool mocks and expectations in the test modules (`observe`/`get_events` to `bot_status`, etc.) without altering the underlying target code files. Support new experiential learning test flow.
- **MC MCP Server Coverage**: Write tests for the branches missing coverage.

## Risks / Trade-offs

- None expected. This is purely ensuring test alignment to recently deployed features.
