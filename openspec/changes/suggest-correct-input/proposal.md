## Why

When the agent provides an invalid block or item name (e.g., "diamond" instead of "diamond_ore"), the system currently returns a hard error ("Unknown block type"). This often causes the agent to get stuck or fail repeatedly. Providing a suggestion of correct valid inputs (similar to "Did you mean 'diamond_ore'?") will help the LLM self-correct and recover gracefully.

## What Changes

- Implement a string similarity or partial matching function to find closest valid Minecraft block/item names given an invalid string.
- Update the MCP tool handlers (like `gather_materials`, `place_block`, etc.) in the Minecraft MCP server to validate inputs against the Minecraft registry.
- When validation fails, catch the error, calculate suggested valid names, and return an enriched error message containing the suggestions (e.g. "Unknown block type: 'diamond'. Did you mean 'diamond_ore'?").
- Ensure the agent loop can propagate these enriched error messages back to the LLM.

## Capabilities

### New Capabilities
- `input-suggestion`: Logic to calculate and suggest the closest valid block/item/entity names based on a given erroneous input.

### Modified Capabilities
- `minecraft-mcp-server`: MCP tools in the server will be updated to validate inputs and inject suggested corrections into error responses when inputs don't match Minecraft registry names.

## Impact

- `mc-mcp-server` tool handlers dealing with block/item names.
- May require a new utility in `shared` or `mc-mcp-server` for fuzzy string matching (e.g., Levenshtein distance).
- Significantly improves the LLM agent's ability to recover from hallucinations or slightly incorrect terminology.
