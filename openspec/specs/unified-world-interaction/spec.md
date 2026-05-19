## ADDED Requirements

### Requirement: Support for Workstation GUIs
The system SHALL provide specific methods to open GUIs for furnaces, blast furnaces, smokers, and brewing stands, and allow inserting/removing items.

#### Scenario: Opening a furnace
- **WHEN** the `interact` tool is called with `action: use` and `target: furnace`
- **THEN** the system SHALL call `bot.openFurnace()` and return a success observation with furnace contents (input, fuel, output).

#### Scenario: Opening a brewing stand
- **WHEN** the `interact` tool is called with `action: use` and `target: brewing_stand`
- **THEN** the system SHALL call `bot.openBrewingStand()` or `bot.activateBlock()` and return a success observation.

#### Scenario: Smelting items in a furnace
- **WHEN** the `interact` tool is called with `action: smelt`, `item`, `fuel`, `amount`, and `target` (furnace block)
- **THEN** the system SHALL open the furnace, place the input item and fuel, close the furnace, and return a success message.

#### Scenario: Taking smelting output from a furnace
- **WHEN** the `interact` tool is called with `action: smelt_take_output` and `target` (furnace block)
- **THEN** the system SHALL open the furnace, take the output item, close the furnace, and return a success message with the item details.

### Requirement: Support for Container GUIs
The system SHALL provide methods to open containers and transfer items between inventory and containers.

#### Scenario: Opening a chest
- **WHEN** the `interact` tool is called with `action: use` and `target: chest`
- **THEN** the system SHALL call `bot.openContainer()` and return a success observation with container contents.

#### Scenario: Depositing items into a container
- **WHEN** the `interact` tool is called with `action: deposit`, `item`, `amount`, and `target` (container block name or coordinates)
- **THEN** the system SHALL open the container, deposit the specified items from inventory, close the container, and return a success message.

#### Scenario: Withdrawing items from a container
- **WHEN** the `interact` tool is called with `action: withdraw`, `item`, `amount`, and `target` (container block name or coordinates)
- **THEN** the system SHALL open the container, withdraw the specified items to inventory, close the container, and return a success message.

#### Scenario: Deposit fails on non-container
- **WHEN** the `interact` tool is called with `action: deposit` and `target` pointing to a non-container block
- **THEN** the system SHALL return an error listing valid container types (chest, barrel, shulker_box, hopper, dispenser, dropper).

### Requirement: Support for Enchanting
The system SHALL provide a method to enchant items at an enchanting table.

#### Scenario: Enchanting an item
- **WHEN** the `interact` tool is called with `action: enchant`, `item`, `lapis`, `level` (0-2), and `target` (enchanting_table block)
- **THEN** the system SHALL open the enchanting table, place the item and lapis, select the enchantment slot, and return a success message with the enchantment result.

### Requirement: Support for Anvil Operations
The system SHALL provide methods to combine items and rename items on an anvil.

#### Scenario: Combining items on an anvil
- **WHEN** the `interact` tool is called with `action: anvil_combine`, `item1`, `item2`, optional `name`, and `target` (anvil block)
- **THEN** the system SHALL open the anvil, combine the two items, close the anvil, and return a success message.

#### Scenario: Renaming an item on an anvil
- **WHEN** the `interact` tool is called with `action: anvil_rename`, `item`, `name`, and `target` (anvil block)
- **THEN** the system SHALL open the anvil, rename the item, close the anvil, and return a success message.

### Requirement: Support for Villager Trading
The system SHALL provide a method to trade with villager entities.

#### Scenario: Trading with a villager
- **WHEN** the `interact` tool is called with `action: trade`, `trade_index`, `count`, and `target_entity` (villager name)
- **THEN** the system SHALL find the villager entity, open the trade interface, execute the trade, close the interface, and return a success message.

### Requirement: Support for Sleep
The system SHALL provide a method to sleep in a bed until morning.

#### Scenario: Sleeping in a bed
- **WHEN** the `interact` tool is called with `action: sleep` and `target` (bed block)
- **THEN** the system SHALL pathfind to the bed, sleep, wait until morning (wake event), and return a success message indicating the bot slept through the night.

### Requirement: Support for Fishing
The system SHALL provide a method to fish with a fishing rod.

#### Scenario: Fishing
- **WHEN** the `interact` tool is called with `action: fish`
- **THEN** the system SHALL equip a fishing rod from inventory, fish, and return a success message.

### Requirement: Support for Sign Editing
The system SHALL provide a method to write text on signs.

#### Scenario: Editing a sign
- **WHEN** the `interact` tool is called with `action: sign_edit`, `target` (sign block), `text`, and optional `back` flag
- **THEN** the system SHALL write the specified text on the sign and return a success message with the sign's position.

### Requirement: Generic Block Interaction
The system SHALL support basic interaction (right-clicking) for all Minecraft interactable blocks including containers, workstations, redstone components, beds, and utility blocks.

#### Scenario: Flipping a lever
- **WHEN** the `interact` tool is called with `action: use` and `target: lever`
- **THEN** the system SHALL call `bot.activateBlock()` and return a success observation.

#### Scenario: Opening a door
- **WHEN** the `interact` tool is called with `action: use` and `target: oak_door`
- **THEN** the system SHALL call `bot.activateBlock()` and return a success observation.

### Requirement: Comprehensive Interactable Block Coverage
The system SHALL recognize all Minecraft interactable blocks for the `use` action, including: furnace, blast_furnace, smoker, brewing_stand, chest, barrel, ender_chest, trapped_chest, shulker_box (all colors), hopper, dispenser, dropper, crafter, crafting_table, enchanting_table, anvil, chipped_anvil, damaged_anvil, smithing_table, grindstone, loom, stonecutter, cartography_table, lectern, beacon, jukebox, lodestone, respawn_anchor, beehive, bee_nest, campfire, soul_campfire, cauldron, composter, flower_pot, bell, cake, fletching_table, chiseled_bookshelf, decorated_pot, conduit, note_block, daylight_detector, tnt, redstone_wire, repeater, comparator, observer, lightning_rod, target, copper_bulb, scaffolding — plus pattern matches for doors, gates, buttons, levers, pressure_plates, trapdoors, rails, signs, beds, banners, and skulls.