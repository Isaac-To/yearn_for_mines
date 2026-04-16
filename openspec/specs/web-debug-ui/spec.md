## Requirements

### Requirement: Web debug UI displays real-time bot status
The dashboard SHALL show the bot's current state including position, health, food, held item, biome, and connection status, updating in real-time via WebSocket.

#### Scenario: Bot status displayed on load
- **WHEN** the web UI is opened
- **THEN** the dashboard SHALL immediately show the bot's current status including position coordinates, health bar, food bar, held item name, biome type, and connection indicator

#### Scenario: Bot status updates in real-time
- **WHEN** the bot moves, takes damage, or changes inventory
- **THEN** the dashboard SHALL update the displayed status within 1 second via WebSocket push

### Requirement: Web debug UI displays action history
The dashboard SHALL show a scrollable log of all actions taken by the agent, including tool calls, LLM responses, and verification results.

#### Scenario: Action log displayed
- **WHEN** the agent makes a tool call (e.g., `dig_block`)
- **THEN** the dashboard SHALL display a timestamped entry with the tool name, input parameters, and result

#### Scenario: LLM prompts and responses visible
- **WHEN** the agent sends a prompt to the LLM and receives a response
- **THEN** the dashboard SHALL display both the prompt (truncated if long) and the response, with the ability to expand for full view

#### Scenario: Error actions highlighted
- **WHEN** a tool call returns an error
- **THEN** the dashboard SHALL highlight the entry in red and display the error message

### Requirement: Web debug UI displays memory inspector
The dashboard SHALL provide a view into the agent's MemPalace memories including stored skills, knowledge graph entries, and diary entries.

#### Scenario: Skill list displayed
- **WHEN** the memory inspector is opened
- **THEN** the dashboard SHALL show a list of all stored skills organized by wing and room, with search functionality

#### Scenario: Knowledge graph browser
- **WHEN** the knowledge graph tab is selected
- **THEN** the dashboard SHALL show recent triples with subject, predicate, object, and validity period

#### Scenario: Diary entries displayed
- **WHEN** the diary tab is selected
- **THEN** the dashboard SHALL show chronological diary entries with timestamps

### Requirement: Web debug UI provides agent control panel
The dashboard SHALL provide controls to start, stop, pause, and configure the agent loop.

#### Scenario: Start agent
- **WHEN** the user clicks "Start" with a valid goal (e.g., "gather wood")
- **THEN** the agent SHALL begin the perceive-plan-execute-verify-remember loop with the specified goal

#### Scenario: Pause agent
- **WHEN** the user clicks "Pause"
- **THEN** the agent SHALL stop executing actions after the current step completes, remaining connected to the Minecraft server

#### Scenario: Resume agent
- **WHEN** the user clicks "Resume"
- **THEN** the agent SHALL resume the loop from the last observation

#### Scenario: Stop agent
- **WHEN** the user clicks "Stop"
- **THEN** the agent SHALL terminate the loop and disconnect from Minecraft

### Requirement: Web debug UI shows screenshot view
When VLM is enabled, the dashboard SHALL display the bot's current screenshot view, refreshing on each observation cycle.

#### Scenario: Screenshot displayed
- **WHEN** VLM mode is enabled and the agent captures a screenshot
- **THEN** the dashboard SHALL display the screenshot image, updating on each perceive cycle

#### Scenario: Screenshot not available
- **WHEN** VLM mode is disabled or prismarine-viewer is not available
- **THEN** the dashboard SHALL show a placeholder indicating that VLM is not active