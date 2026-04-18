## Context

The current `mc-mcp-server` exposes over 30 granular tools for observation, HUD retrieval, and atomic actions (`dig_block`, `pathfind_to`, `look_at_block`). The Agent requires significant context window space just to read the schemas, and must spend multiple chained inference turns correctly to interact with the world. Small Language Models (SLMs) get overwhelmed by this surface area, frequently dropping events or failing to string together 10+ command sets just to gather simple materials. By making the backend "smarter", we can let the SLM act purely as a high-level goal planner.

## Goals / Non-Goals

**Goals:**
- Reduce the SLM prompt footprint from 30+ detailed MCP schemas down to ~5 concise schemas.
- Consolidate perception and action: remove independent observation steps by forcing tools to return "Context Frames" outlining the updated world state.
- Implement robust internal logic in the TypeScript backend to handle micro-steps (e.g. pathfind -> look -> equip tool -> dig -> wait for item drop).

**Non-Goals:**
- We are not giving the SLM real code evaluation / `eval()` tools (like Voyager did), as reliable code generation is difficult for constrained SLMs.
- We do not aim to support complex, coordinate-perfect redstone or advanced architectural mapping tasks using these high-level macro-skills right now.

## Decisions

- **Remove Existing Micro-Tools**: Delete `pathfind_to`, `look_at`, `dig_block`, `place_block`, `equip_item`, `drop_item`, `get_inventory`, `observe`, `find_block`, `get_events`, `get_hud`. Keep fundamental lifecycle hooks (`bot_connect`, `bot_status`, `bot_disconnect`).
- **5 Core Macro-Skills**: Define new macro-tools that encapsulate while-loops:
  - `gather_materials(type, amount)`: Finds nearby blocks of `type`, pathfinds, equips optimal matching tools, mines, and waits/moves to collect drops until `amount` is achieved.
  - `craft_items(recipe_output, amount)`: Checks inventory, creates a crafting table locally if required, executes the recipe, re-harvests the crafting table.
  - `reposition(target, distance)`: Navigates cleanly relative to target entities/blocks or explicitly provided coordinates. 
  - `combat(target_type)`: Closes distance, equips weapons, blocks, swings.
  - `interact(action, target)`: For singular environmental interactables (chests, eating food, beds).
- **The Context Frame**: The return payload for all these macro-skills will be a highly filtered "Context Frame" JSON or text block:
  - Outcome Description (e.g. "Gathered 5 oak logs successfully")
  - Vital Stats (health, hunger/food, time of day)
  - Inventory Summary (flattened representation showing { "oak_log": 5, "stone_pickaxe": 1 })
  - Points of Interest (top ~5 nearby blocks/entities of interest within distance)
  - Recent Events (damage received, chat logs during the task).
- **Agent Loop Elimination of Explicit Perception**: In `agent-loop.ts`, remove the standalone `perceive()` step. Start the loop by fetching an initial Context Frame via `bot_status`. Each plan phase creates an action, and the `execute` phase's output is directly injected as the next cycle's perception data.

## Risks / Trade-offs

- **Task Durations / MCP Timeouts**: A `gather_materials` operation capturing 5 specific logs could take 20-30 seconds of real-world time. The MCP client/server HTTP streams require sufficiently large timeouts.
  - *Mitigation*: Ensure any MCP streaming timeouts are extended (e.g. 5 minute bounds in the Node client) and agent abort signals properly respect Node asynchronous waits.
- **Edge cases trapped inside backends**: The Mineflayer bot loops might get stuck indefinitely without the SLM's intervention if pathfinding fails or drops fall into lava.
  - *Mitigation*: Build conservative timeouts (e.g., maximum pathfinding/mining retries) for each macro-skill where the backend bails and returns a Context Frame indicating a partial failure.