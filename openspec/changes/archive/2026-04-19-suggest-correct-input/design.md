## Context

The Minecraft agent often hallucinates block/item names (e.g. `diamond` instead of `diamond_ore` or `diamond_sword`) which leads to tool invocation failures with generic "Unknown block type" errors. Since the agent does not receive a hint of what it should have guessed, it enters retry loops or fails completely. The goal is to provide a "Did you mean X?" hint in the tool response.

## Goals / Non-Goals

**Goals:**
- Provide nearest-neighbor string matching to suggest a valid Minecraft block/item name when an invalid one is passed.
- Update `gather_materials` and other key MCP tools in `mc-mcp-server` to gracefully handle and suggest valid inputs.
- Reduce agent stagnation by giving constructive feedback.

**Non-Goals:**
- Create a complete NLP synonym matching engine (e.g. knowing "wood" means "oak_log").
- Alter the underlying bot execution logic; the correction happens at the parameter validation/tool execution edge.

## Decisions

- **Fuzzy Matching Algorithm**: We will implement a basic Levenshtein distance (or similar fast string similarity) algorithm in a new utility function `findClosestMatch` inside the `mc-mcp-server`. We should check the `mineflayer` built-in registry to look up all block/item names. If an exact match fails, we compute the distance to all items in the registry and return the top 1-3.
- **Error Response Structure**: Since MCP tools return `{ content: [...], isError: boolean }`, we will format the text output to state: `"Error: Unknown block type '${input}'. Did you mean: '${suggestion1}', '${suggestion2}'?"`.
- **Package Placement**: This logic naturally sits in the `mc-mcp-server` where the `mineflayer` registry is queried, removing the need for `shared` to know about the Minecraft registry.

## Risks / Trade-offs

- **Performance Risk**: Comparing an input against hundreds of block names could be slow if done poorly. 
  *Mitigation*: Pre-cache the list of valid block/item names on startup. Use an optimized Levenshtein implementation or just a simpler subset/includes check before full Levenshtein.
- **Accuracy Risk**: The closest match by distance might not be semantically correct.
  *Mitigation*: We'll return top 2-3 suggestions so the LLM has a better chance of picking the right one.
