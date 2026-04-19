## Why

Agents currently stall or get stuck in repetitive loops when they encounter errors trying to accomplish a task. By improving error handling and adding mechanisms to break out of stalls, we can increase agent autonomy and success rates during long-running tasks. We need this now to make the agent a more resilient and self-correcting entity within the game.

## What Changes

- Introduce robust error parsing from MCP tool execution to provide the LLM with actionable context rather than opaque failures.
- Implement stall detection logic to identify when the agent repeats the same failing actions.
- Automatically prompt the agent to explicitly reflect and devise an alternative plan when a stall is detected.
- Modify the agent loop to gracefully handle connection timeouts and unexpected MCP errors without crashing.

## Capabilities

### New Capabilities
- `agent-error-handling`: Enhancing stall detection, retry limits, and actionable error feedback within the agent execution loop.

### Modified Capabilities

## Impact

- **Agent Loop**: The core execution cycle (`packages/agent/src/agent-loop.ts`) will need updates to track action history and handle errors more intelligently.
- **MCP Server Tools**: May need consistent error formatting to ensure the agent receives semantic error hints instead of pure stack traces.