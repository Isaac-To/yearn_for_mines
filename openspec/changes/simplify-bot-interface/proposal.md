## Why

The current agent interface is fragmented across too many fine-grained tools, causing token bloat and planning complexity. Additionally, infrastructure concerns like bot lifecycle management are unnecessarily exposed to the model, while critical context like observations and status are treated as optional tool calls rather than fundamental environment state.

## What Changes

- **BREAKING**: Removed `bot_connect`, `bot_disconnect`, and `bot_respawn` from the MCP toolset. These are now handled by the environment harness.
- **BREAKING**: Removed `observe`, `screenshot`, `get_inventory`, and `get_position` from the MCP toolset. These are now injected directly into the LLM context.
- **BREAKING**: Consolidated `craft_items`, `craft_macro`, `interact`, and `interact_block_macro` into a single `interact` tool.
- Automated bot status monitoring and injection into the agent loop.
- Unified observation pipeline that ensures the agent always starts with a fresh world view.

## Capabilities

### New Capabilities
- `unified-interaction`: A single super-tool for crafting and block/world interaction to simplify agent decision making.

### Modified Capabilities
- `agent-controller`: Update the agent loop to automatically inject observations and status instead of relying on tool calls.
- `minecraft-mcp-server`: Remove lifecycle and observation tools from the exposed toolset.
- `agent-connection-lifecycle`: Shift responsibility of connection management from the agent to the harness/orchestrator.
- `observation-pipeline`: Ensure observations are pushed to the agent rather than pulled via tools.

## Impact

- `packages/agent`: Significant changes to the agent loop and system prompt construction.
- `packages/mc-mcp-server`: Removal of multiple tool registrations.
- `openspec/specs`: Updates to multiple requirement specifications to reflect the simplified architecture.
