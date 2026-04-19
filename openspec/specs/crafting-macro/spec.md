## ADDED Requirements

### Requirement: Unified Crafting Macro Tool
The minecraft-mcp-server SHALL provide a `craft_macro` tool that accepts a recipe target (item name), amount, and optional flags `craft_table_if_missing` and `cleanup_table`.

#### Scenario: 2x2 player crafting
- **WHEN** the `craft_macro` is invoked for an item that only requires the player's 2x2 grid (like 'stick' or 'crafting_table')
- **THEN** the bot SHALL perform the craft immediately without requiring an external crafting table block.

#### Scenario: 3x3 table crafting
- **WHEN** the `craft_macro` is invoked for a 3x3 recipe (like 'wooden_pickaxe') 
- **THEN** the bot SHALL pathfind to the nearest crafting table, look at it, and execute the craft. Returns failure if no crafting table is nearby and `craft_table_if_missing` is false.

#### Scenario: 3x3 table crafting with table generation
- **WHEN** a 3x3 recipe is requested, no table is nearby, and `craft_table_if_missing` is true
- **THEN** the bot SHALL craft a table (if not in inventory), place it nearby, perform the recipe craft, and conditionally mine it afterward if `cleanup_table` is true.
