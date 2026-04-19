## Context

Currently, the pathfinding module allows the agent to navigate to a target coordinate. However, agents are mostly passive navigators avoiding obstacles or falling when moving. In the context of Minecraft, navigating complex terrain implies breaking blocks in the way or placing blocks to cross gaps. We want to enable the agent to do simple mining and building as an extension of their movement capability so they can explore unstructured environments. The `mineflayer-pathfinder` plugin already has support for some mining and building if provided the correct materials and tools. We need to integrate this more deeply into the MCP tools and prompt logic.

## Goals / Non-Goals

**Goals:**
- Provide MCP tools or configure pathfinder settings allowing the agent to break simple blocks when pathing is obstructed.
- Provide the agent the ability to pillar or bridge using blocks in their inventory.
- Ensure the agent does not attempt to break unbreakable blocks or use tools they don't have.
- Provide feedback to the LLM agent about missing blocks/tools when it attempts pathing that requires them.

**Non-Goals:**
- Building complex structures.
- Automated mining for resources (strip mining, branching etc). This is about movement assistance.
- Detailed pathfinding optimization algorithms.

## Decisions

- **Use mineflayer-pathfinder capabilities directly:** `mineflayer-pathfinder` has built parameters like `canDig` and `canPlace`. We'll expose these as arguments in the movement tools (e.g. `navigate_to` can take a `allowTerrainManipulation` flag), or create explicit `mine_path` and `build_bridge` commands if pathfinder integration is too unreliable. For now, prefer configuring the pathfinder directly to allow digging and placing if the agent wants to.
- **Agent awareness:** Introduce clear tool description to inform the agent that setting `allowTerrainManipulation: true` requires having tools in the inventory for breaking, or dirt/cobble for placing. We must also return a clear error via the MCP tool if the bot tries to construct a path but lacks the required blocks in the inventory so the agent can plan to get them.

## Risks / Trade-offs

- **Risk: Pathfinding gets stuck in an infinite loop of breaking/placing.** Pathfinding can be buggy when combined with block manipulation. → Mitigation: We'll enforce a strict timeout and maximum number of block updates for each pathfinding request.
- **Risk: Breaking blocks that have negative consequences (e.g., gravel falling, breaking a block with lava behind it).** → Mitigation: Enable this only with specific flags, and perhaps hardcode a whitelist/blacklist of blocks that can be broken for pathing.