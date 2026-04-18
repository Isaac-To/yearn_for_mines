## ADDED Requirements

### Requirement: Gather Materials Macro-Skill
The system MUST provide a `gather_materials` macro-skill that autonomously seeks out, pathfinds to, mines, and collects a target block type up to a specified quantity.

#### Scenario: Successful gathering
- **WHEN** the agent calls `gather_materials(type: "oak_log", amount: 5)`
- **THEN** the backend autonomously finds 5 oak logs, pathfinds to each, equips the correct tool, breaks the block, waits for the drop, and returns a Context Frame summarizing the new inventory state and outcome.

### Requirement: Craft Items Macro-Skill
The system MUST provide a `craft_items` macro-skill that autonomously manages the crafting process, including placing a crafting table if required.

#### Scenario: Crafting with a table
- **WHEN** the agent calls `craft_items(recipe: "wooden_pickaxe", amount: 1)` and the recipe requires a crafting table
- **THEN** the backend places a crafting table from inventory (or fails if none exist), crafts the item, breaks the crafting table to retrieve it, and returns the Context Frame.

### Requirement: Reposition Macro-Skill
The system MUST provide a `reposition` macro-skill for navigating to coordinates or named entities/blocks.

#### Scenario: Reposition to an entity
- **WHEN** the agent calls `reposition(target: "cow", distance: 2)`
- **THEN** the backend finds the nearest cow and pathfinds until within 2 blocks, returning the Context Frame.

### Requirement: Combat Macro-Skill
The system MUST provide a `combat` macro-skill for engaging a specific target.

#### Scenario: Defeating a target
- **WHEN** the agent calls `combat(target: "zombie")`
- **THEN** the backend equips weapons, engages the nearest zombie, blocks incoming attacks, and swings until the target is defeated, followed by returning a Context Frame.

### Requirement: Interact Macro-Skill
The system MUST provide an `interact` macro-skill for atomic interactions like sleeping, eating, or opening chests.

#### Scenario: Eating food
- **WHEN** the agent calls `interact(action: "eat", target: "apple")`
- **THEN** the backend equips the apple, holds the use button until consumed, and returns a Context Frame with updated hunger vital stats.
