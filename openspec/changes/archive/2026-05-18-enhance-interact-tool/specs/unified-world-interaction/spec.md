## ADDED Requirements

### Requirement: Support for Workstation GUIs
The system SHALL provide specific methods to open GUIs for furnaces, blast furnaces, smokers, and brewing stands.

#### Scenario: Opening a furnace
- **WHEN** the `interact` tool is called with `action: use` and `target: furnace`
- **THEN** the system SHALL call `bot.openFurnace()` and return a success observation.

#### Scenario: Opening a brewing stand
- **WHEN** the `interact` tool is called with `action: use` and `target: brewing_stand`
- **THEN** the system SHALL call `bot.openBrewingStand()` and return a success observation.

### Requirement: Support for Container GUIs
The system SHALL provide a generic method to open containers like chests, barrels, and shulker boxes.

#### Scenario: Opening a chest
- **WHEN** the `interact` tool is called with `action: use` and `target: chest`
- **THEN** the system SHALL call `bot.openContainer()` and return a success observation.

### Requirement: Generic Block Interaction
The system SHALL support basic interaction (right-clicking) for mechanical blocks like doors, gates, buttons, and levers.

#### Scenario: Flipping a lever
- **WHEN** the `interact` tool is called with `action: use` and `target: lever`
- **THEN** the system SHALL call `bot.activateBlock()` and return a success observation.
