## Requirements

### Requirement: Agent reflects on execution episodes
The agent SHALL invoke a reflection step using the LLM to analyze the sequence of tool calls and outcomes from the `execute` and `verify` phases before saving any permanent memory.

#### Scenario: Successful episode reflection
- **WHEN** the agent completes a goal successfully
- **THEN** the agent SHALL analyze why it succeeded, extracting generalized heuristics, pre-conditions, and post-conditions.

#### Scenario: Failed episode reflection
- **WHEN** the agent fails to complete a goal
- **THEN** the agent SHALL analyze why it failed, extracting semantic truths (e.g., tool requirements, anti-patterns) to store in the knowledge graph.
