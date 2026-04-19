## Requirements

### Requirement: Agent implements perceive-plan-execute-verify-remember loop
The agent controller SHALL implement an autonomous loop that perceives the world state, plans actions using the LLM, executes via MCP tools, verifies outcomes, and persists learnings in MemPalace.

#### Scenario: Agent loop runs in a connected state
- **WHEN** the agent loop starts
- **THEN** the Agent SHALL ensure the Minecraft bot is actively connected, otherwise enter a paused state awaiting connection

#### Scenario: Agent pauses loop on connection loss
- **WHEN** the connection to the Minecraft server is lost during the execution of the loop
- **THEN** the agent SHALL pause processing, abort current tool execution, and wait for reconnection instead of polling the LLM

#### Scenario: Successful wood gathering cycle
- **WHEN** the agent starts with the goal "gather wood"
- **THEN** the agent SHALL perceive the world state via the `observe` tool, generate a plan via the LLM, execute the plan via MCP tools, verify that oak_log was obtained, and store the successful skill in MemPalace

#### Scenario: Plan execution fails
- **WHEN** the agent's plan fails (e.g., cannot find a path to a tree)
- **THEN** the agent SHALL feed the error back to the LLM, generate a revised plan, and retry up to 3 times before moving to a different approach

#### Scenario: All retries exhausted
- **WHEN** the agent has failed 3 retries on the same sub-goal
- **THEN** the agent SHALL log the failure in MemPalace diary, update the knowledge graph with what didn't work, and attempt an alternative approach or report failure

### Requirement: Agent perceives world state via structured observations
The agent SHALL call MCP observation tools to build a text representation of the Minecraft world state before each planning step.

#### Scenario: Text observation generation
- **WHEN** the agent enters the perceive phase
- **THEN** the agent SHALL call `observe`, `get_inventory`, and `get_position` tools and format the results into a structured text observation for the LLM

#### Scenario: VLM observation enhancement
- **WHEN** a multimodal model is configured and the `screenshot` tool succeeds
- **THEN** the agent SHALL include the base64 screenshot as an image content block alongside the text observation in the LLM prompt

#### Scenario: VLM observation fallback
- **WHEN** a multimodal model is configured but the `screenshot` tool fails or returns an error
- **THEN** the agent SHALL proceed with text-only observations without blocking the loop

### Requirement: Agent plans using LLM with tool descriptions
The agent SHALL send observations and available tool descriptions to the LLM, requesting a plan of action expressed as tool calls.

#### Scenario: LLM generates a plan
- **WHEN** the agent sends the observation and available MCP tool descriptions to the LLM
- **THEN** the LLM SHALL respond with one or more tool calls that constitute a plan

#### Scenario: LLM response includes tool calls
- **WHEN** the LLM response contains tool call requests
- **THEN** the agent SHALL execute each tool call sequentially against the appropriate MCP server and collect the results

#### Scenario: LLM response is plain text without tool calls
- **WHEN** the LLM response contains no tool calls
- **THEN** the agent SHALL treat the response as a reasoning step and re-prompt with the observation plus the LLM's reasoning

### Requirement: Agent verifies action outcomes
After executing a plan, the agent SHALL verify that the intended outcome was achieved by re-observing the world state.

#### Scenario: Successful verification
- **WHEN** the agent executes a "dig_block" tool call targeting an oak_log
- **THEN** the agent SHALL call `observe` or `get_inventory` to verify that oak_log is now in inventory

#### Scenario: Failed verification
- **WHEN** the agent verifies that the intended outcome was NOT achieved
- **THEN** the agent SHALL feed the verification failure back to the LLM as context for retry planning

### Requirement: Agent persists learnings in MemPalace
The agent SHALL use MemPalace MCP tools to store verified skills, record failures, and maintain temporal knowledge about what works.

#### Scenario: Successful skill stored
- **WHEN** the agent successfully completes a task sequence (e.g., find tree → navigate → dig)
- **THEN** the agent SHALL store the skill code as a MemPalace drawer in the `minecraft-skills` wing under the appropriate room (e.g., `wood-gathering`)

#### Scenario: Failure recorded in diary
- **WHEN** the agent fails a task after all retries
- **THEN** the agent SHALL write a MemPalace diary entry describing what was attempted, what went wrong, and the context

#### Scenario: Knowledge graph updated
- **WHEN** the agent learns a new fact (e.g., "oak_log requires bare hands to dig")
- **THEN** the agent SHALL add a knowledge graph triple (e.g., `oak_log → requires_tool → bare_hands`) with a validity timestamp

#### Scenario: Skill retrieval before planning
- **WHEN** the agent begins a new planning cycle
- **THEN** the agent SHALL search MemPalace for relevant skills using `mempalace_search` with the current goal as query and include retrieved skills in the LLM prompt as context

### Requirement: Agent uses OpenAI-compatible API for LLM inference
The agent SHALL communicate with the LLM using the OpenAI chat completions API format at localhost:11434/v1.

#### Scenario: Standard text prompt
- **WHEN** the agent sends a text-only observation to the LLM
- **THEN** the agent SHALL format the request as an OpenAI chat completion with the observation in the user message and system prompt describing available tools

#### Scenario: Multimodal prompt with screenshot
- **WHEN** the agent has a screenshot available
- **THEN** the agent SHALL format the request with both text and image content blocks in the user message

#### Scenario: LLM API unavailable
- **WHEN** the LLM API at localhost:11434/v1 is unreachable
- **THEN** the agent SHALL log an error and retry with exponential backoff (3 attempts, 2s, 4s, 8s) before entering a paused state

### Requirement: Agent system prompt includes tool descriptions
The agent SHALL construct a system prompt that includes descriptions of all available MCP tools, the current goal, and retrieved MemPalace memories.

#### Scenario: System prompt construction
- **WHEN** the agent begins a new planning cycle
- **THEN** the system prompt SHALL include: (1) role description, (2) available tool list with descriptions, (3) relevant memories from MemPalace search, (4) current goal, (5) instructions for structured output