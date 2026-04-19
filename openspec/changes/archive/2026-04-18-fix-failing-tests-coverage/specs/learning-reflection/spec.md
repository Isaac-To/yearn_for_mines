## MODIFIED Requirements

### Requirement: Memory Retrieval (System Prompt Render)
The system SHALL condition the rendering of the "Relevant memories" text in the system prompt based on whether any contextual memories are available for the agent's current task.

#### Scenario: No relevant memories found
- **WHEN** the agent initiates a prompt payload with zero related memory excerpts
- **THEN** the system prompt MUST exclusively omit the "Relevant memories" instructional preamble.
