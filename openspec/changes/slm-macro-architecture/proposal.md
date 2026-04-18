## Why

When targeting Small Language Models (SLMs) with limited reasoning and logic capabilities, presenting a large surface area of 30+ low-level MCP tools (like `dig_block`, `pathfind_to`, `look_at`) overwhelms the agent and fractures execution pipelines. It forces turn amplification where simple tasks (like chopping a tree) take multiple inference turns to execute, driving up token costs and failing due to micromanagement limits. To allow the SLM to focus on long-term goals instead of mechanical maneuvering, we need to upgrade the MCP from a "puppet strings" interface to a "Smart Assistant" interface with macro-skills.

## What Changes

- **Macro-Skill Tools**: Replace the 30+ micro-tools in the MCP server with 6 core high-level tools (`gather_materials`, `craft_items`, `reposition`, `combat`, `interact`, `build`) that encapsulate asynchronous multi-step execution handled by the Mineflayer backend.
- **Unified Perception (Context Frame)**: Remove standalone observation tools (`observe`, `get_hud`, `get_events`). Every macro-tool will now return a highly filtered "Context Frame" summarizing the action outcome, vital stats, inventory changes, and nearby points of interest. 
- **Agent Loop Simplification**: The agent loop no longer needs to run an explicit `perceive` step using observation tools. Instead, the loop will prompt the LLM with the Goal and the last Context Frame, execute a single macro action, and receive the new Context Frame. 

## Capabilities

### New Capabilities
- `slm-macro-skills`: The 5 core asynchronous macro skills (`gather_materials`, `craft_items`, `reposition`, `combat`, `interact`, `build`) that wrap low-level Mineflayer actions.

### Modified Capabilities
- `minecraft-mcp-server`: **BREAKING** Removes the existing 30+ low-level tools (action, hud, observation, lifecycle tools except core connect hooks) and exposes only the new macro-skills.
- `agent-controller`: Updates the main perceive-plan-execute loop to rely on Context Frames returned by tools rather than a separate `perceive()` phase.
- `observation-pipeline`: **BREAKING** Shifts from providing full verbose arrays to returning concise, unified Context Frames.

## Impact

- **Bot Manager & MCP Server (`mc-mcp-server`)**: Complete overhaul of the `src/tools/` directory. 
- **Agent Loop (`agent`)**: Simplify to `Plan (from Context Frame) -> Execute Macro-Skill -> Receive New Context Frame`.
- **Latency**: Actions will now take longer to return (e.g., `gather_materials` might run for 10-20 seconds before returning the context frame), but this eliminates empty transit turns for the SLM.