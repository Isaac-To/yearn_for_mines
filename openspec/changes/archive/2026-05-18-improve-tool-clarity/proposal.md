## Why

Agent accuracy suffers when MCP tool descriptions, parameter names, and parameter descriptions are vague, inconsistent, or missing. The `interact` mega-tool buries 16 actions in a wall of text; `combat`, `reposition`, and `gather_materials` have missing parameter descriptions and ambiguous names (`target` means different things across tools; `level` conflates slot index with enchantment level; `type` is too generic). These issues cause the LLM to misidentify actions, pass wrong parameter types, and misinterpret results.

## What Changes

- Add `.describe()` to every Zod parameter that lacks one, with specific guidance on expected values and format
- Rename ambiguous parameter names: `type` → `blockType`, `level` → `enchantmentSlot`, `isCoordinate` → `isCoordinateTarget`
- Refactor `interact` tool description from wall-of-text to structured, scannable format with sections per action
- Add implicit-behavior documentation: placement constraints (solid block below), search radius (64 blocks for gather), fishing rod requirement, furnace auto-find radius (6 blocks), one-catch-per-call for fishing
- Normalize `target` parameter semantics across tools: document what each accepts (entity name, block name, coordinates string, coordinate object)
- Add parameter descriptions to `combat`, `reposition`, and `gather_materials` tools
- Standardize Zod schema style: all tools use `z.object({...})` consistently (not the shorthand object form)

## Capabilities

### New Capabilities

- `tool-descriptions`: Improved descriptions, parameter naming, and documentation for all MCP tools to increase agent accuracy and intuitiveness

### Modified Capabilities

- `minecraft-mcp-server`: Parameter descriptions and schema style standardization for `send_chat` and `bot_status`
- `unified-world-interaction`: Refactored `interact` tool description format, renamed `level` → `enchantmentSlot`, added implicit-behavior docs

## Impact

- **Code**: `packages/mc-mcp-server/src/tools/` — all 6 tool files (`interact.ts`, `combat.ts`, `reposition.ts`, `gather_materials.ts`, `chat.ts`, `lifecycle.ts`) 
- **APIs**: MCP tool interface contract changes (parameter names rename; descriptions change) — **BREAKING** for any caller using `level` or `type` or `isCoordinate` parameter names directly
- **Dependencies**: None (only Zod schema and description changes)
- **Systems**: Agent loop (no code changes needed — LLM consumes tool schema at runtime, so improved descriptions take immediate effect)