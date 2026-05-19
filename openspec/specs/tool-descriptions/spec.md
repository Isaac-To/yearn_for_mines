### Requirement: Tool descriptions provide structured, scannable action reference
The `interact` tool description SHALL use a structured format with action name headers and one-line summaries, listing each action's parameters inline, rather than a single paragraph listing all actions and parameters.

#### Scenario: Agent reads interact description
- **WHEN** an LLM agent receives the `interact` tool schema
- **THEN** the description SHALL be formatted as a list of action entries, where each entry has the action name, a short summary, and parameter descriptions grouped under it

#### Scenario: Agent distinguishes similar actions
- **WHEN** an LLM agent must choose between `smelt` and `smelt_take_output`
- **THEN** the action summaries SHALL clearly differentiate the two (e.g., "smelt — Place input+fuel in furnace to begin smelting" vs "smelt_take_output — Retrieve finished output from a furnace")

### Requirement: All tool parameters have explicit descriptions
Every Zod parameter across all tools SHALL include a `.describe()` call that specifies the expected value format, valid range, and unit where applicable.

#### Scenario: Combat target parameter described
- **WHEN** the `combat` tool schema is inspected
- **THEN** the `target` parameter SHALL have a description specifying it accepts an entity name or player name (e.g., "Zombie", "oak_villager")

#### Scenario: Reposition target parameter described
- **WHEN** the `reposition` tool schema is inspected
- **THEN** the `target` parameter SHALL have a description specifying the format: either "x, y, z" coordinate string (with `isCoordinateTarget: true`) or a block/entity name

#### Scenario: Reposition distance parameter described
- **WHEN** the `reposition` tool schema is inspected
- **THEN** the `distance` parameter SHALL have a description specifying it is the goal proximity radius in blocks (default 2)

#### Scenario: Gather materials blockType parameter described
- **WHEN** the `gather_materials` tool schema is inspected
- **THEN** the `blockType` parameter SHALL have a description specifying it accepts a Minecraft block/item name (e.g., "oak_log", "iron_ore")

#### Scenario: Gather materials amount parameter described
- **WHEN** the `gather_materials` tool schema is inspected
- **THEN** the `amount` parameter SHALL have a description specifying it is the target count of items to collect (1-64)

### Requirement: Implicit behaviors and constraints are documented in tool descriptions
Tool descriptions SHALL document constraints, auto-behaviors, and assumptions that the LLM agent cannot otherwise discover.

#### Scenario: Interact place requires solid block below
- **WHEN** the `interact` tool description is read
- **THEN** the `place` action documentation SHALL state that a solid block must exist directly below the target position

#### Scenario: Interact craft auto-finds crafting table
- **WHEN** the `interact` tool description is read
- **THEN** the `craft` action documentation SHALL state that the bot auto-finds a crafting table within 6 blocks, and returns an error if none is found

#### Scenario: Interact fish requires fishing rod
- **WHEN** the `interact` tool description is read
- **THEN** the `fish` action documentation SHALL state that a fishing rod must be in the bot's inventory and that one catch is performed per call

#### Scenario: Gather materials search radius
- **WHEN** the `gather_materials` tool description is read
- **THEN** the description SHALL state that it searches for the target block within a 64-block radius

#### Scenario: Combat single-target behavior
- **WHEN** the `combat` tool description is read
- **THEN** the description SHALL state that the bot pathfinds to the target entity and attacks it; one entity per call

### Requirement: Parameter names unambiguously convey expected values
Tool parameter names SHALL clearly indicate what kind of value they accept without needing to read the description.

#### Scenario: Enchantment slot parameter name
- **WHEN** the `interact` tool schema for the `enchant` action is inspected
- **THEN** the slot parameter SHALL be named `enchantmentSlot` (not `level`)

#### Scenario: Block type parameter name
- **WHEN** the `gather_materials` tool schema is inspected
- **THEN** the block selection parameter SHALL be named `blockType` (not `type`)

#### Scenario: Coordinate flag parameter name
- **WHEN** the `reposition` tool schema is inspected
- **THEN** the coordinate mode flag SHALL be named `isCoordinateTarget` (not `isCoordinate`)

### Requirement: Zod schema style is consistent across tools
All tools SHALL use `z.object({...})` for their `inputSchema` definition, not the shorthand object form `{ key: z.string() }`.

#### Scenario: Combat tool uses z.object
- **WHEN** the `combat` tool registration is inspected
- **THEN** its `inputSchema` SHALL use `z.object({ target: z.string().describe(...), ... })`

#### Scenario: Gather materials tool uses z.object
- **WHEN** the `gather_materials` tool registration is inspected
- **THEN** its `inputSchema` SHALL use `z.object({ blockType: z.string().describe(...), amount: z.number().describe(...) })`