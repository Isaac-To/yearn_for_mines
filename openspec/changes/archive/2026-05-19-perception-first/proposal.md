## Why

The agent perceives the world through two incompatible channels: `bot_status` (minimal JSON: position, health, food) during the perceive phase, and rich `ObservationContext` (inventory, nearby entities, craftable items, POIs) only as a side-effect of action tool results. This famine/feast cycle forces the LLM to plan blind or gamble on actions just to see what's happening. Observation should be automatically injected into every planning turn — not gated behind tool execution.

## What Changes

- Add automatic observation injection: the agent loop's perceive phase calls the observation pipeline directly and includes the full `ContextFrame` as formatted text in every planning prompt, replacing the bare `bot_status` JSON
- Remove the perception side-effect pattern: tool result handlers still include observation context, but it's now supplementary rather than the only source of world state
- Upgrade `bot_status` to return the full observation context (inventory, nearby entities, craftable items, events) instead of minimal position/health data
- Add a lightweight `observe` MCP tool for on-demand observation (e.g., after reconnection, after error recovery, when the LLM explicitly wants fresh world state)
- **BREAKING**: `bot_status` MCP tool return shape changes from `{ connected, username, position, health, food, experience, gameMode }` to include full observation context

## Capabilities

### New Capabilities

- `automatic-perception`: Agent loop automatically injects full observation context into every planning turn, eliminating the starvation/overload cycle

### Modified Capabilities

- `observation-pipeline`: Observation context now also produced on-demand for the perceive phase, not only as side-effect in tool results
- `minecraft-mcp-server`: `bot_status` tool returns rich observation data; new `observe` tool for explicit on-demand observation

## Impact

- **Code**: `packages/agent/src/agent-loop.ts` (perceive phase), `packages/mc-mcp-server/src/tools/lifecycle.ts` (bot_status), `packages/mc-mcp-server/src/observation-builder.ts` (on-demand invocation), new `packages/mc-mcp-server/src/tools/observe.ts`
- **APIs**: `bot_status` return shape changes (BREAKING — adds inventory, entities, craftable items, events); new `observe` tool added
- **Dependencies**: None — uses existing `ObservationBuilder` infrastructure
- **Systems**: Agent loop (perceive phase rewrite), MCP server (two tool changes)