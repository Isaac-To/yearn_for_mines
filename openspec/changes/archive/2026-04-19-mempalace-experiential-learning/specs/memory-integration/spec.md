## MODIFIED Requirements

### Requirement: Agent stores verified skills as MemPalace drawers
The agent SHALL NOT store exact skill sequences as verbatim code. Instead, the agent SHALL utilize an experiential learning cycle (reflection) to analyze episodes (both success and failure) using the LLM. The agent SHALL extract semantic facts to the MemPalace Knowledge Graph and abstract procedural heuristics (strategies) into MemPalace drawers in the `minecraft-skills` wing.

#### Scenario: Skill stored after successful execution
- **WHEN** the agent successfully completes a task sequence (e.g., find_and_chop_tree)
- **THEN** the agent SHALL reflect on the episode and store a generalized heuristic/strategy as a drawer in wing `minecraft-skills`, room `wood-gathering` instead of the raw tool calls.

#### Scenario: Skill includes metadata
- **WHEN** the agent stores a skill drawer
- **THEN** the drawer SHALL include metadata specifying: the goal, context/pre-conditions, generalized strategy steps, and expected post-conditions.
