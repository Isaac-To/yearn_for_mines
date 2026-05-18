## ADDED Requirements

### Requirement: Unified interaction tool
The system SHALL provide a single `interact` tool that handles multiple types of interactions with blocks, entities, and the crafting system.

#### Scenario: Digging a block via unified interaction
- **WHEN** the `interact` tool is called with `action: "dig"` and `target: { x, y, z }`
- **THEN** the bot SHALL navigate to the block and mine it

#### Scenario: Placing a block via unified interaction
- **WHEN** the `interact` tool is called with `action: "place"`, `item: "dirt"`, and `target: { x, y, z }`
- **THEN** the bot SHALL place the specified block at the target location

#### Scenario: Crafting an item via unified interaction
- **WHEN** the `interact` tool is called with `action: "craft"`, `item: "oak_planks"`, and `amount: 4`
- **THEN** the bot SHALL craft the requested items using available materials

#### Scenario: Interacting with a block via unified interaction
- **WHEN** the `interact` tool is called with `action: "use"` and `target: { x, y, z }`
- **THEN** the bot SHALL interact with the block (e.g., opening a chest or using a crafting table)
