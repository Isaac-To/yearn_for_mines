## MODIFIED Requirements

### Requirement: MCP server exposes world interaction tools
The system SHALL provide a unified interaction tool for the agent to manipulate blocks, craft items, and interact with the world, consolidating fine-grained actions into a single polymorphic interface.

#### Scenario: Unified block and world interaction
- **WHEN** the `interact` tool is called with an action (e.g., "dig", "place", "use", "craft") and target parameters
- **THEN** the server SHALL execute the requested interaction (e.g., digging a block, placing a block, using a workstation, or crafting an item) and return the outcome

## REMOVED Requirements

### Requirement: MCP server exposes Mineflayer bot lifecycle management
**Reason**: Infrastructure concerns are now handled automatically by the agent harness.
**Migration**: Remove `bot_connect`, `bot_disconnect`, `bot_respawn`, and `bot_status` tools.

### Requirement: MCP server exposes observation tools
**Reason**: Observations are now automatically injected into the agent's context by the harness.
**Migration**: Remove `observe`, `find_block`, `find_entity`, `get_inventory`, `get_position`, `get_nearby_items`, and `get_hud` tools.

### Requirement: MCP server exposes visual capture tools
**Reason**: Visual data is now automatically injected into the agent's context by the harness when available.
**Migration**: Remove `screenshot` tool.

### Requirement: MCP server exposes crafting tools
**Reason**: Consolidated into the unified `interact` tool.
**Migration**: Use `interact(action="craft", ...)` instead of `craft_item`.

### Requirement: MCP server exposes block interaction tools
**Reason**: Consolidated into the unified `interact` tool.
**Migration**: Use `interact(action="dig", ...)` or `interact(action="place", ...)` instead of `dig_block` or `place_block`.
