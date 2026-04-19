## ADDED Requirements

### Requirement: Unified Block Interaction Macro
The minecraft-mcp-server SHALL provide an `interact_block_macro` tool that accepts ANY interactable block name (e.g., 'furnace', 'chest', 'hopper', 'lever', 'button', 'chest', 'enchanting_table') and optional flags `craft_if_missing`, `cleanup_block`, and `cleanup_crafting_table`.

#### Scenario: Interacting with nearby block
- **WHEN** the `interact_block_macro` is invoked with a valid block type
- **THEN** the bot SHALL locate the nearest block of that type, pathfind to it, look at it, and perform a physical interaction. Returns failure if block not found and `craft_if_missing` is false.

#### Scenario: Interacting with block generation
- **WHEN** the `interact_block_macro` is invoked, no block is nearby, and `craft_if_missing` is true
- **THEN** the bot SHALL craft the block (creating and using a crafting table if necessary, cleaning up the crafting table if `cleanup_crafting_table` is true), place the new block nearby, perform the physical interaction, and conditionally mine it afterward if `cleanup_block` is true.
