## MODIFIED Requirements

### Requirement: Text observation formatter produces comprehensive world state
The text observation formatter MUST compress the full world state into a concise "Context Frame" that avoids raw arrays and instead focuses on highly summarized elements suitable for Small Language Models (SLMs). The output is limited to:
- **Outcome Description**: What just changed.
- **Vital Stats**: Current Health, Food index, and Time of Day.
- **Inventory Summary**: Consolidated summary of non-empty slots (e.g. `{ "oak_log": 5 }`).
- **Points of Interest**: Top categorized proximal items, entities, and blocks (limited to closest 5 unique types).
- **Recent Events**: Filtered essential chat and damage logs mapped to the execution time window.

#### Scenario: Summarizing raw arrays
- **WHEN** building a Context Frame from 36 inventory slots filled with varying durability pickaxes and 22 empty spaces
- **THEN** the formatter condenses it to a single text representation like "3x wooden_pickaxe, 12x cobblestone".