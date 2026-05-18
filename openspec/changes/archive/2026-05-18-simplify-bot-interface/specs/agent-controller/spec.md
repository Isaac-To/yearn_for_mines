## MODIFIED Requirements

### Requirement: Agent implements perceive-plan-execute-verify-remember loop
The agent controller SHALL implement an autonomous loop that perceives the world state, plans actions using the LLM, executes via MCP tools, verifies outcomes, and persists learnings in MemPalace.

#### Scenario: Agent loop runs in a connected state
- **WHEN** the agent loop starts
- **THEN** the Agent harness SHALL ensure the Minecraft bot is actively connected, otherwise it MUST wait for connection before initiating the agent loop

#### Scenario: Agent pauses loop on connection loss
- **WHEN** the connection to the Minecraft server is lost during the execution of the loop
- **THEN** the harness SHALL pause processing, abort current tool execution, and wait for reconnection instead of polling the LLM

#### Scenario: Successful wood gathering cycle
- **WHEN** the agent starts with the goal "gather wood"
- **THEN** the agent harness SHALL automatically perceive the world state, generate a plan via the LLM, execute the plan via MCP tools, verify that oak_log was obtained, and store the successful skill in MemPalace

#### Scenario: Plan execution fails
- **WHEN** the agent's plan fails (e.g., cannot find a path to a tree)
- **THEN** the agent SHALL feed the error back to the LLM, generate a revised plan, and retry up to 3 times before moving to a different approach

#### Scenario: All retries exhausted
- **WHEN** the agent has failed 3 retries on the same sub-goal
- **THEN** the agent SHALL log the failure in MemPalace diary, update the knowledge graph with what didn't work, and attempt an alternative approach or report failure

### Requirement: Agent perceives world state via structured observations
The agent harness SHALL automatically build a text representation of the Minecraft world state and inject it into the prompt before each planning step. The agent MUST NOT be required to call a tool to receive this information.

#### Scenario: Automatic text observation injection
- **WHEN** the agent enters the planning phase
- **THEN** the harness SHALL automatically perform an internal observation (blocks, inventory, position, health, status) and format the results into a structured text block injected into the user prompt

#### Scenario: Automatic screenshot injection
- **WHEN** a multimodal model is configured and a screenshot is successfully captured
- **THEN** the harness SHALL include the base64 screenshot as an image content block alongside the text observation in the LLM prompt automatically

#### Scenario: VLM observation fallback
- **WHEN** a multimodal model is configured but the screenshot capture fails or returns an error
- **THEN** the harness SHALL proceed with text-only observations without blocking the loop

### Requirement: Agent plans using LLM with injected state and tool descriptions
The agent SHALL receive automatically injected world observations and available tool descriptions in its context to generate a plan of action expressed as tool calls.

#### Scenario: LLM generates a plan with injected state
- **WHEN** the agent receives the injected world state and available MCP tool descriptions
- **THEN** the LLM SHALL respond with one or more tool calls that constitute a plan

#### Scenario: LLM response includes tool calls
- **WHEN** the LLM response contains tool call requests
- **THEN** the agent SHALL execute each tool call sequentially against the appropriate MCP server and collect the results

#### Scenario: LLM response is plain text without tool calls
- **WHEN** the LLM response contains no tool calls
- **THEN** the agent SHALL treat the response as a reasoning step and re-prompt with a fresh injected observation plus the LLM's reasoning

### Requirement: Agent verifies action outcomes
After executing a plan, the agent SHALL verify whether the overarching goal is achieved by asking the LLM to explicitly assess the re-observed world state against the goal. The agent MUST NOT prematurely mark the goal achieved solely based on the text of a tool's successful execution result (e.g. bypassing verification because a tool result includes the word "success").

#### Scenario: Successful verification
- **WHEN** the agent executes a "dig_block" tool call targeting an oak_log
- **THEN** the harness SHALL provide a fresh injected observation or inventory state for the agent to verify that oak_log is now in inventory and wait for the LLM to explicitly state the goal is achieved

#### Scenario: Tool execution succeeds but goal is not yet achieved
- **WHEN** the agent successfully executes a tool and receives a result containing "Success"
- **THEN** the agent SHALL NOT immediately mark the overarching goal as achieved, but must evaluate the fresh injected world state.

#### Scenario: Failed verification
- **WHEN** the agent verifies that the intended outcome was NOT achieved
- **THEN** the agent SHALL feed the verification failure back to the LLM as context for retry planning

## REMOVED Requirements

### Requirement: Agent manages connection lifecycle
**Reason**: Infrastructure concerns should be handled by the harness to ensure the agent only operates in a ready state.
**Migration**: Remove `bot_connect`, `bot_disconnect`, and `bot_respawn` from MCP server tool list.

### Requirement: Agent sensing tools
**Reason**: Replaced by automatic harness-level injection to reduce token overhead and planning latency.
**Migration**: Remove `observe`, `get_inventory`, `get_position`, and `bot_status` from MCP server tool list.
