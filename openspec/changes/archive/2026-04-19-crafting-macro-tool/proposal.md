## Why

Currently, the agent has to perform multiple low-level steps to craft an item or interact with utility blocks: search for the block (e.g., crafting table), navigate to it, look at it, and interact with it. This process is error-prone, verbose, and consumes many LLM turn cycles. By introducing macro tools, we can collapse these repetitive operations into single, reliable calls, drastically improving the agent's efficiency and success rate when building and processing items.

## What Changes

- Introduce a macro tool for crafting that automatically determines if an item can be crafted in the player's 2x2 inventory grid or requires a 3x3 crafting table.
- For 3x3 recipes, the macro will automatically find the nearest crafting table, walk to it, look at it, and perform the craft.
- Introduce support for interacting with other interactive blocks (furnaces, brewing stands, hoppers, etc.) via a unified macro that handles the navigation, gazing, and interaction sequence natively.

## Capabilities

### New Capabilities
- `crafting-macro`: A unified macro tool for player grid (2x2) and crafting table (3x3) item synthesis.
- `block-interaction-macro`: A unified macro tool for interacting with utility blocks like furnaces, brewing stands, hoppers, and redstone components.

### Modified Capabilities
- `minecraft-mcp-server`: Add new macro tools to the existing toolset provided by the MC MCP server to abstract low-level navigation and interaction into higher-level tasks.

## Impact

- **mc-mcp-server**: New tools will be added to the MCP server's action and observation pipelines.
- **Bot Behavior**: Simplifies the required reasoning steps for the agent, reducing token usage and failure modes associated with crafting and processing items.
