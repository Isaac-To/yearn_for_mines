## MODIFIED Requirements

### Requirement: Support for Enchanting
The system SHALL provide a method to enchant items at an enchanting table. The slot parameter SHALL be named `enchantmentSlot` (renamed from `level`). The `enchantmentSlot` parameter SHALL have a description: "Enchantment slot to select (0, 1, or 2, where 0 is the top slot offering the lowest-level enchantment)".

#### Scenario: Enchanting an item
- **WHEN** the `interact` tool is called with `action: enchant`, `item`, `lapis`, `enchantmentSlot` (0-2), and `target` (enchanting_table block)
- **THEN** the system SHALL open the enchanting table, place the item and lapis, select the enchantment slot, and return a success message with the enchantment result.

### Requirement: Support for Workstation GUIs
The system SHALL provide specific methods to open GUIs for furnaces, blast furnaces, smokers, and brewing stands, and allow inserting/removing items. The `smelt` action SHALL document that it auto-finds a crafting table-like furnace within 6 blocks. The `smelt_take_output` action SHALL be described as retrieving finished output from a furnace (renamed from the less-clear "take output" phrasing).

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
The system SHALL provide methods to open containers and transfer items between inventory and containers. The `deposit` and `withdraw` actions SHALL describe `amount` as "Number of items to transfer" (not just "Quantity"). The `target` parameter SHALL describe accepted formats: "Container block name (e.g. 'chest') or coordinates {x, y, z}".

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

### Requirement: Support for Sleep
The system SHALL provide a method to sleep in a bed until morning.

#### Scenario: Sleeping in a bed
- **WHEN** the `interact` tool is called with `action: sleep` and `target` (bed block)
- **THEN** the system SHALL pathfind to the bed, sleep, wait until morning (wake event), and return a success message indicating the bot slept through the night.

### Requirement: Support for Fishing
The system SHALL provide a method to fish with a fishing rod. The `fish` action description SHALL document that a fishing rod must be in inventory and that one catch is performed per call.

#### Scenario: Fishing
- **WHEN** the `interact` tool is called with `action: fish`
- **THEN** the system SHALL equip a fishing rod from inventory, fish, and return a success message.

### Requirement: Support for Sign Editing
The system SHALL provide a method to write text on signs.

#### Scenario: Editing a sign
- **WHEN** the `interact` tool is called with `action: sign_edit`, `target` (sign block), `text`, and optional `back` flag
- **THEN** the system SHALL write the specified text on the sign and return a success message with the sign's position.

### Requirement: Support for Anvil Operations
The system SHALL provide methods to combine items and rename items on an anvil.

#### Scenario: Combining items on an anvil
- **WHEN** the `interact` tool is called with `action: anvil_combine`, `item1`, `item2`, optional `name`, and `target` (anvil block)
- **THEN** the system SHALL open the anvil, combine the two items, close the anvil, and return a success message.

#### Scenario: Renaming an item on an anvil
- **WHEN** the `interact` tool is called with `action: anvil_rename`, `item`, `name`, and `target` (anvil block)
- **THEN** the system SHALL open the anvil, rename the item, close the anvil, and return a success message.

### Requirement: Support for Villager Trading
The system SHALL provide a method to trade with villager entities. The `trade_index` parameter SHALL have a description: "Trade slot index (0-based; see available trades by observing villager)."

#### Scenario: Trading with a villager
- **WHEN** the `interact` tool is called with `action: trade`, `trade_index`, `count`, and `target_entity` (villager name)
- **THEN** the system SHALL find the villager entity, open the trade interface, execute the trade, close the interface, and return a success message.

### Requirement: Generic Block Interaction
The system SHALL support basic interaction (right-clicking) for all Minecraft interactable blocks including containers, workstations, redstone components, beds, and utility blocks. The `place` action SHALL document that a solid block must exist directly below the target position.

#### Scenario: Flipping a lever
- **WHEN** the `interact` tool is called with `action: use` and `target: lever`
- **THEN** the system SHALL call `bot.activateBlock()` and return a success observation.

#### Scenario: Opening a door
- **WHEN** the `interact` tool is called with `action: use` and `target: oak_door`
- **THEN** the system SHALL call `bot.activateBlock()` and return a success observation.