## Context

The current architecture exposes infrastructure tools (connect/disconnect) and environment sensing tools (observe/inventory) as explicit actions the LLM must choose to take. This results in "empty" turns where the agent just observes without acting, or gets stuck in lifecycle loops. By moving sensing into the harness and consolidating interactions, we reduce the planning space and make the agent more reactive to its environment.

## Goals / Non-Goals

**Goals:**
- Move bot lifecycle (connect/respawn) to the agent harness.
- Inject world state (observation, inventory, status) automatically into the LLM context.
- Consolidate all object/block interactions into a single `interact` tool.
- Remove redundant MCP tools from the registry.

**Non-Goals:**
- Redesigning the observation format itself.
- Changing how the pathfinder works.
- Redesigning MemPalace integration.

## Decisions

### Decision 1: Harness-Level Connection Management
**Rationale:** The agent should not be responsible for establishing its own socket connection to Minecraft. This should be a prerequisite for the agent loop to start.
- **Alternative considered:** Keep `bot_connect` but make it a "virtual" tool handled by the agent package. Rejected because it still wastes a planning turn.

### Decision 2: Automatic Context Injection
**Rationale:** Standardizing on "Observation-First" turns. The agent loop will perform an `observe` call internally before every LLM call and inject it into the system or user prompt.
- **Alternative considered:** Keep `observe` as a tool but encourage frequent usage. Rejected because the model often skips it to save tokens, leading to hallucinations.

### Decision 3: The "Super-Interact" Tool
**Rationale:** `craft_items`, `interact_block`, and basic `interact` all boil down to "use X on Y" or "make X from Y". A single tool with a polymorphic schema reduces the number of tool definitions the model must process.
- **Alternative considered:** Keep them separate for better schema validation. Rejected in favor of a flexible schema that validates based on the `action` type.

## Risks / Trade-offs

- [Risk] → **Increased prompt size** per turn due to mandatory observation injection.
- [Mitigation] → Use `truncateObservation` utility to keep world state within reasonable limits.
- [Risk] → **Loss of control** over when the bot connects.
- [Mitigation] → Ensure the harness has robust retry and auto-connect logic before starting the agent loop.
