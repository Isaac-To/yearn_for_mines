## 1. Craft Macro Tool Implementation

- [x] 1.1 Create `craft_macro.ts` in `packages/mc-mcp-server/src/tools/macro/` with zod schema for `item_name` and `count`.
- [x] 1.2 Implement recipe lookups using `bot.recipesFor()`. Check if recipe requires a crafting table.
- [x] 1.3 Handle 2x2 crafting: if table is not required, directly call `bot.craft(recipe, count, null)`.
- [x] 1.4 Handle 3x3 crafting: find nearest `crafting_table`, use `bot.pathfinder.setGoal` to navigate, `bot.lookAt`, then `bot.craft(recipe, count, craftingTable)`.
- [x] 1.5 Emit rich success/failure text describing the exact steps the macro took so the agent understands.

## 2. Interact Block Macro Tool Implementation

- [x] 2.1 Create `interact_block_macro.ts` in `packages/mc-mcp-server/src/tools/macro/` accepting `block_name` (e.g. furnace, hopper, chest).
- [x] 2.2 Use `bot.findBlock` to locate the nearest instance of the requested block.
- [x] 2.3 Use pathfinder to navigate to the block and `bot.lookAt` to ensure it's targeted.
- [x] 2.4 Simulate interaction or execute relevant block opening action (e.g. `bot.activateBlock`).
- [x] 2.5 Emit verbose success/failure status.

## 3. Registration and Testing

- [x] 3.1 Export both new macro tools from their module index.
- [x] 3.2 Register these tools in the main `mc-mcp-server` entry point.
- [x] 3.3 Ensure fast timeout or robust error handling is covered for cases where bot gets stuck pathfinding.
