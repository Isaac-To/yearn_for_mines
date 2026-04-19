## MODIFIED Requirements

### Requirement: Agent implements perceive-plan-execute-verify-remember loop
The agent controller SHALL implement an autonomous loop that perceives the world state, plans actions using the LLM, executes via MCP tools, verifies outcomes, and persists learnings in MemPalace. The loop SHALL have explicit connection state management with paused and running states.

#### Scenario: Successful wood gathering cycle
- **WHEN** the agent starts with the goal "gather wood" and is in the running state
- **THEN** the agent SHALL perceive the world state via the `observe` tool, generate a plan via the LLM, execute the plan via MCP tools, verify that oak_log was obtained, and store the successful skill in MemPalace

#### Scenario: Plan execution fails
- **WHEN** the agent's plan fails (e.g., cannot find a path to a tree) and the error is permanent
- **THEN** the agent SHALL feed the error back to the LLM, generate a revised plan, and retry up to 3 times before moving to a different approach

#### Scenario: Connection lost during execution
- **WHEN** a tool call returns a transient error (bot disconnected, MCP transport failure, timeout)
- **THEN** the agent SHALL pause the loop, save the last observation and plan, and begin polling `bot_status` until the bot reconnects

#### Scenario: All retries exhausted
- **WHEN** the agent has failed 3 retries on the same sub-goal with permanent errors
- **THEN** the agent SHALL log the failure in MemPalace diary, update the knowledge graph with what didn't work, and attempt an alternative approach or report failure

#### Scenario: Agent resumes after reconnection
- **WHEN** the agent is paused due to disconnection and `bot_status` reports the bot is connected
- **THEN** the agent SHALL re-observe the world state, include the previous plan context in the LLM prompt, and resume the loop