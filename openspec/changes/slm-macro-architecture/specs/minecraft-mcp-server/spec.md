## REMOVED Requirements

### Requirement: MCP server exposes observation tools
**Reason**: SLMs struggle with manually linking observations across multiple turns. Replaced by macro-skills that auto-return Context Frames.
**Migration**: Use the new Context Frame returned by macro tools instead.

### Requirement: MCP server exposes movement tools
**Reason**: Too granular for SLM logic (causes turn amplification and loops). Replaced by `reposition`.
**Migration**: Use the `reposition` macro-tool to safely navigate without micromanagement.

### Requirement: MCP server exposes block interaction tools
**Reason**: Digging, placing, and looking are combined into autonomous loops to save context turns.
**Migration**: Use `gather_materials` and `interact` macro-tools.

### Requirement: MCP server exposes crafting tools
**Reason**: Standalone crafting required too much preparatory logic (e.g. checking for and placing a crafting table).
**Migration**: Use the `craft_items` macro-tool that manages its own crafting station setup.

### Requirement: MCP server exposes inventory management tools
**Reason**: Explicitly equipping or dropping is too deep in the mechanics for a goal-oriented SLM.
**Migration**: Managed internally by macro-tools based on context (e.g., `gather_materials` auto-equips the best tool).

### Requirement: MCP server exposes event subscriptions
**Reason**: Manual event fetching takes an explicit action turn, and event subscriptions required parallel polling logic that SLMs ignore.
**Migration**: Events are instead tracked by the backend and filtered into the Context Frame automatically after every action.

### Requirement: MCP server exposes player status HUD tools
**Reason**: Same as observations and events; HUD pulling takes a turn.
**Migration**: HUD data is embedded in the Vital Stats section of the Context Frame returned after every action.

## ADDED Requirements

### Requirement: Context Frame Payload
The MCP server MUST wrap every macro-tool result in a highly filtered Context Frame JSON/text summarizing Outcome, Vital Stats, Inventory Summary, Points of Interest, and Recent Events.

#### Scenario: Tool returns state
- **WHEN** a macro-tool like `gather_materials` completes successfully
- **THEN** it returns a payload containing all five Context Frame sections so the Agent can plan its next move without querying state.