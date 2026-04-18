## MODIFIED Requirements

### Requirement: Agent implements perceive-plan-execute-verify-remember loop
The Agent MUST implement a continuous loop that:
1. Starts with an initial Context Frame via the `bot_status` or a bootstrap perception.
2. Formulates a plan using an LLM.
3. Maps the plan to single macro-tool invocation (the `execute` phase).
4. Verifies the tool's execution via the returned Context Frame.
5. Remembers the outcome in `MemPalace` if a failure occurred.
6. Uses the newly returned Context Frame directly as the next turn's perception, eliminating independent observation steps.

#### Scenario: Single step execution
- **WHEN** the Agent loop executes a macro-tool
- **THEN** it immediately consumes the returned Context Frame and moves directly to the Plan phase, without issuing any standalone `perceive()` tool calls.

## REMOVED Requirements

### Requirement: Agent perceives world state via structured observations
**Reason**: Explicit perception is eliminated. Tools auto-return the required world state via the structured Context Frame.
**Migration**: Simply parse the output of the prior action macro-tool and pass it to the LLM.