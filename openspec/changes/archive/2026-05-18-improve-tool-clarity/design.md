## Context

The MCP server exposes 6 tools (`interact`, `combat`, `reposition`, `gather_materials`, `send_chat`, `bot_status`) to LLM agents. Tool descriptions, parameter names, and parameter descriptions are the only interface the agent has to decide which tool to call and what parameters to provide. Current state:

- 3 tools (`combat`, `reposition`, `gather_materials`) have parameters with no `.describe()` — the LLM gets no hint about expected format
- `interact` has a monolithic description listing 16 actions in a single paragraph
- Parameter naming is inconsistent (`type` vs `blockType`, `level` vs `enchantmentSlot`, `target` meaning different things per tool)
- Schema style mixes `z.object({...})` and plain-object shorthand across tools
- Implicit behaviors (search radius, auto-find range, placement constraints) are undocumented

Stakeholders: agent loop (sole consumer of tool schemas), developer-maintainers of the MCP server.

## Goals / Non-Goals

**Goals:**
- Every tool parameter has a `.describe()` with explicit format guidance
- Tool descriptions are structured and scannable (section headers, not walls of text)
- Parameter names unambiguously convey what value is expected
- Implicit behaviors and constraints are documented in descriptions
- Zod schema style is consistent across all tools

**Non-Goals:**
- Splitting `interact` into separate tools (structural refactor out of scope)
- Adding new tools or new actions to existing tools
- Changing handler logic or return types
- Changing the observation pipeline or event system
- Performance optimization

## Decisions

### 1. Rename parameters for clarity (BREAKING)

| Tool | Old Name | New Name | Rationale |
|------|----------|----------|-----------|
| `interact` (enchant) | `level` | `enchantmentSlot` | `level` conflates with Minecraft enchantment level (1-30); actual value is slot index 0-2 |
| `gather_materials` | `type` | `blockType` | `type` is too generic; `blockType` clarifies it's a Minecraft block/item name |
| `reposition` | `isCoordinate` | `isCoordinateTarget` | More specific about what the flag means |

**Alternative considered**: Keep old names, improve only descriptions. Rejected because ambiguous names cause persistent confusion regardless of descriptions.

### 2. Restructure `interact` description with action sections

Use a heading-per-action format:

```
dig — Break a block at target coordinates.
  target: {x, y, z} coordinates
place — Place an item from inventory at target position.
  item: item name to place
  target: {x, y, z} coordinates
...
```

**Alternative considered**: Split `interact` into separate tools. Rejected — too large a structural change, and the discriminated-union schema is mechanically fine. The problem is description quality, not tool count.

### 3. Add `.describe()` to all parameters without descriptions

Every parameter gets a `.describe()` call specifying:
- Expected format (e.g., "Minecraft block name like 'stone', 'oak_planks'")
- Valid range where applicable (e.g., "0-2 for enchantment slot selection")
- Unit where applicable (e.g., "distance in blocks")

### 4. Document implicit behaviors in tool descriptions

Add concrete constraints:
- `interact` `place`: requires solid block below target position
- `interact` `craft`: auto-finds crafting table within 6 blocks; fails if none found
- `interact` `fish`: requires fishing rod in inventory; catches one item per call
- `gather_materials`: searches within 64-block radius
- `combat`: pathfinds to entity then attacks; one target per call
- `reposition`: `distance` is goal proximity radius in blocks (default 2)

### 5. Standardize Zod schema style to `z.object({...})`

All tools use `z.object({...})` for `inputSchema` instead of the shorthand `{ key: z.string() }`. Consistent style reduces cognitive load for maintainers and ensures `.describe()` works uniformly.

## Risks / Trade-offs

- **BREAKING parameter renames** → Agents using old parameter names (`level`, `type`, `isCoordinate`) will fail. Mitigation: this is a development tool, no production consumers; the LLM reads the schema at runtime and will use the new names immediately.
- **Description length** → More detailed descriptions increase token cost per tool call. Mitigation: structured format is more compressible than prose; actual increase is modest (~200-300 tokens total across all tools).
- **Inconsistency with existing specs** → Unified-world-interaction spec uses `level` and other old names. Mitigation: update the spec delta in this change to reflect renames.