## Requirements

### Requirement: Agent stores verified skills as MemPalace drawers
The agent SHALL use `mempalace_add_drawer` to store successfully executed skill sequences as verbatim code in the `minecraft-skills` wing.

#### Scenario: Skill stored after successful execution
- **WHEN** the agent successfully completes a task sequence (e.g., find_and_chop_tree)
- **THEN** the agent SHALL store the skill code as a drawer in wing `minecraft-skills`, room `wood-gathering` (or appropriate room), with content containing the executable skill code

#### Scenario: Skill includes metadata
- **WHEN** the agent stores a skill drawer
- **THEN** the drawer SHALL include metadata specifying: the goal, required tools, required inventory items, success conditions, and Minecraft version

### Requirement: Agent retrieves relevant skills before planning
The agent SHALL use `mempalace_search` to find previously stored skills relevant to the current goal before generating a new plan.

#### Scenario: Relevant skill found
- **WHEN** the agent begins planning for "gather wood" and searches MemPalace
- **THEN** the agent SHALL find previously stored skills in `minecraft-skills/wood-gathering` and include them in the LLM prompt as in-context examples

#### Scenario: No relevant skills found
- **WHEN** the agent searches for skills in a domain it hasn't encountered before
- **THEN** the search SHALL return empty results and the agent SHALL proceed without skill context, noting in the LLM prompt that this is a novel task

### Requirement: Agent maintains temporal knowledge graph
The agent SHALL use `mempalace_kg_add` to record facts about the Minecraft world with temporal validity.

#### Scenario: Fact added to knowledge graph
- **WHEN** the agent learns that oak_log can be dug with bare hands
- **THEN** the agent SHALL add a triple: (oak_log, requires_tool, bare_hands) with valid_from timestamp

#### Scenario: Fact invalidated
- **WHEN** the agent learns that a previously stored fact is incorrect (e.g., stone actually requires a pickaxe, not bare hands)
- **THEN** the agent SHALL use `mempalace_kg_invalidate` to mark the old fact as ended and add the corrected fact

#### Scenario: Fact queried for planning
- **WHEN** the agent needs to know what tool is required to dig stone
- **THEN** the agent SHALL use `mempalace_kg_query` to retrieve the current valid fact about stone digging requirements

### Requirement: Agent writes diary entries for session context
The agent SHALL use `mempalace_diary_write` to record session events, failures, and decisions.

#### Scenario: Failure diary entry
- **WHEN** the agent fails to complete a task after all retries
- **THEN** the agent SHALL write a diary entry describing: the goal, what was attempted, the error encountered, and context about why it failed

#### Scenario: Milestone diary entry
- **WHEN** the agent achieves a significant milestone (e.g., first wood gathered)
- **THEN** the agent SHALL write a diary entry recording the achievement and its context

### Requirement: Agent uses MemPalace wings organized by Minecraft skill domain
The agent SHALL organize MemPalace memories into wings and rooms mapped to Minecraft skill domains.

#### Scenario: Wing and room structure
- **WHEN** the agent initializes MemPalace for the first time
- **THEN** the following structure SHALL be created or verified: wing `minecraft-skills` with rooms `wood-gathering`, `crafting`, `mining`, `navigation`, `combat`, `farming`, `survival`, and wing `minecraft-knowledge` with rooms `blocks`, `items`, `mobs`, `recipes`, `biomes`, `mechanics`

#### Scenario: New room created for new domain
- **WHEN** the agent encounters a task in a domain without an existing room
- **THEN** the agent SHALL create a new room under the appropriate wing for that domain

### Requirement: Agent bootstraps Minecraft domain knowledge in knowledge graph
The agent SHALL seed MemPalace's knowledge graph with fundamental Minecraft knowledge that a player would intuitively know, enabling the agent to make informed decisions without trial-and-error on basics.

#### Scenario: Block knowledge bootstrapped
- **WHEN** the agent initializes for the first time
- **THEN** the agent SHALL add knowledge graph triples for basic block properties: (oak_log, can_dig_with, bare_hands), (stone, requires_tool, wooden_pickaxe_or_better), (dirt, can_dig_with, bare_hands), (coal_ore, requires_tool, wooden_pickaxe_or_better), (iron_ore, requires_tool, stone_pickaxe_or_better), (bedrock, cannot_dig, true), and similar entries for common blocks

#### Scenario: Crafting knowledge bootstrapped
- **WHEN** the agent initializes for the first time
- **THEN** the agent SHALL add knowledge graph triples for basic crafting recipes: (oak_planks, crafted_from, oak_log), (crafting_table, crafted_from, oak_planks), (wooden_pickaxe, crafted_from, planks_and_sticks), (stick, crafted_from, planks), and similar entries for the early-game tech tree

#### Scenario: Mob knowledge bootstrapped
- **WHEN** the agent initializes for the first time
- **THEN** the agent SHALL add knowledge graph triples for common mobs: (zombie, is_hostile, true), (skeleton, is_hostile, true), (creeper, is_hostile, true), (cow, is_hostile, false), (sheep, is_hostile, false), (spider, is_hostile, at_night), (iron_golem, is_neutral, true), and similar entries

#### Scenario: Survival knowledge bootstrapped
- **WHEN** the agent initializes for the first time
- **THEN** the agent SHALL add knowledge graph triples for survival mechanics: (fall_damage, starts_at, 3_blocks), (lava, is_deadly, true), (water, can_drown_in, true), (hostile_mobs, spawn_in_light, below_7), (food, restores, hunger_and_saturation), (wooden_tools, durability, 59), (stone_tools, durability, 131), and similar entries

#### Scenario: Knowledge seeded only on first run
- **WHEN** the agent starts and knowledge graph already has entries
- **THEN** the agent SHALL NOT re-seed duplicate knowledge, checking with `mempalace_kg_query` before adding

### Requirement: Agent checks for duplicates before storing skills
The agent SHALL use `mempalace_check_duplicate` before storing a new skill to avoid redundant entries.

#### Scenario: Duplicate skill detected
- **WHEN** the agent attempts to store a skill that is semantically similar to an existing one
- **THEN** the agent SHALL update the existing drawer rather than creating a duplicate

#### Scenario: New skill is unique
- **WHEN** the agent attempts to store a skill that has no similar existing entry
- **THEN** the agent SHALL create a new drawer