## MODIFIED Requirements

### Requirement: Agent verifies action outcomes
After executing a plan, the agent SHALL verify whether the overarching goal is achieved by asking the LLM to explicitly assess the re-observed world state against the goal. The agent MUST NOT prematurely mark the goal achieved solely based on the text of a tool's successful execution result (e.g. bypassing verification because a tool result includes the word "success").

#### Scenario: Successful verification
- **WHEN** the agent executes a "dig_block" tool call targeting an oak_log
- **THEN** the agent SHALL call `observe` or `get_inventory` to verify that oak_log is now in inventory and wait for the LLM to explicitly state the goal is achieved

#### Scenario: Failed verification
- **WHEN** the agent verifies that the intended outcome was NOT achieved
- **THEN** the agent SHALL feed the verification failure back to the LLM as context for retry planning

#### Scenario: Tool execution succeeds but goal is not yet achieved
- **WHEN** the agent successfully executes a tool (like `mempalace_reconnect`) and receives a result containing "Success"
- **THEN** the agent SHALL NOT immediately mark the overarching goal as achieved, but must evaluate the world state.
