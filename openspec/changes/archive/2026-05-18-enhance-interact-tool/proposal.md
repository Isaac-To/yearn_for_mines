## Why

The `interact` tool was too basic, only supporting simple block breaking and placing. To be a truly useful agent, it needs to handle the complexity of Minecraft's workstations (furnaces, brewing stands, etc.) and containers.

## What Changes

- Enhanced `interact` tool with specialized logic for containers and workstations.
- Added explicit support for opening GUIs (Furnace, Brewing Stand, Chest/Barrel).
- Expanded list of interactable blocks to include common workstations.
- Updated tool schema to better guide the LLM on using these blocks.

## Capabilities

### New Capabilities
- `unified-world-interaction`: Expanded capabilities for the interact tool to handle complex block interactions and GUIs.

### Modified Capabilities
<!-- None -->

## Impact

- `packages/mc-mcp-server/src/tools/interact.ts`: Logic expanded.
- `packages/mc-mcp-server/src/index.ts`: Minor cleanup (removed non-existent tool registration).
