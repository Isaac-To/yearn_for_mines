## Context

The agent currently requires step-by-step logic to achieve straightforward Minecraft objectives like crafting items or interacting with utility blocks (furnaces, hoppers). This relies on generating exact coordinates, explicit pathfinding, gazing, and multiple MCP interactions, creating a high surface area for error due to hallucinations or synchronization issues with the server state.

By rolling these sequences directly into internal server-side macro logic, we can leverage `mineflayer` API's natively capable algorithms (like `bot.recipesFor` and `bot.craft`) inside a single agent tool call.

## Goals / Non-Goals

**Goals:**
- Provide a `craft_macro` tool that intelligently delegates between personal inventory crafting (2x2) and a crafting table (3x3).
- Abstract navigation towards the crafting table if one is required and available nearby.
- Provide a `interact_block_macro` tool that automates pathing to and activating utility blocks (furnaces, brewing stands, chests, hoppers).

**Non-Goals:**
- Recursively searching for or gathering missing ingredients (the agent still plans this).
- Crafting items iteratively from base ingredients (e.g. creating logs -> planks -> sticks -> crafting table in one step)—the scope is single-item recipes.

## Decisions

- **Single Tool Exposure**: Instead of replacing the atomic tools, we will expose composite ones (`craft_item` and `interact_with_block`) alongside them.
- **Handling Crafting Recipes**: We will query `bot.recipesFor()`. If `recipe.requiresTable` is false, proceed immediately. If `true`, we find the nearest crafting table `bot.findBlock({ matching: mcData.blocksByName.crafting_table.id })`, path to it with `pathfinder`, and trigger `bot.craft(recipe, count, craftingTable)`.
- **Handling Generic Interaction**: For blocks that open a window (e.g., furnaces, chests), we will use generic interaction, or optionally provide specific Window objects back to the agent if needed. For now, the physical interaction (walking + right-clicking) is sufficient to fulfill the requirement.

## Risks / Trade-offs

- **Risk:** The bot fails to pathfind to the detected block due to terrain complexity.
  - **Mitigation:** The macro will cleanly time out or catch the pathfinding exception and report a structured summary (e.g., "cannot reach crafting table") back to the agent.
- **Trade-off:** Opaque execution. The agent doesn't see the intermediate physical steps it took to craft the item, which might hurt debugging context for the LLM. Mitigation: the tool will return a verbose success string detailing what occurred natively.
