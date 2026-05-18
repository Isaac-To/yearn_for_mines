## Context

The `interact` tool in `mc-mcp-server` was limited to basic block mining and placing. It lacked the specialized logic required to interact with Minecraft's complex functional blocks (GUIs, containers).

## Goals / Non-Goals

**Goals:**
- Enable the agent to open and interact with common Minecraft GUIs (furnaces, brewing stands, chests).
- Provide a clear schema for the LLM to understand which actions are available.
- Ensure type safety and build stability in the MCP server.

**Non-Goals:**
- Automated crafting/smelting logic (this is just the interaction/opening part; logic stays in the agent/bot).
- Inventory management within the GUI (handled by other potential tools or agent logic).

## Decisions

- **Use Type Casting (`as any`)**: Due to some inconsistencies in `mineflayer` types for specialized methods like `openFurnace` and `openBrewingStand`, type casting is used to ensure functionality without being blocked by strictly incomplete type definitions.
- **Unified Action Schema**: kept the `use` action but expanded its internal logic to detect block types and choose the correct `mineflayer` method (`openFurnace`, `openContainer`, `activateBlock`).

## Risks / Trade-offs

- **[Risk] Type Inaccuracy** → Mitigation: Manual verification of `mineflayer` runtime methods and `pnpm build` checks.
- **[Risk] Action Ambiguity** → Mitigation: Clear descriptions in the Zod schema for the `use` action.
