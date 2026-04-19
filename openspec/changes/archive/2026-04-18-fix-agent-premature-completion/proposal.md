## Why

The agent currently terminates its loop prematurely by marking the overarching goal as achieved if *any* executed tool returns a result containing the word "success" (for example, `mempalace_reconnect` reporting a successful reconnection). This bypasses the actual verification of the world state, causing tasks like "mine diamonds" to be marked complete before they are actually finished. Fixing this is critical to ensure the agent actually completes its assigned goals.

## What Changes

- **Remove success-string shortcut**: Remove the logic in the agent loop that short-circuits verification if a tool result contains "success".
- **Strict Verification**: The agent must rely solely on the LLM's assessment of the re-observed world state against the prompt's goal to determine if the task is complete. (Alternatively, introduce a dedicated `finish_task` tool, but leaning on the LLM's explicit "yes" assessment is the immediate fix).
- **Log clarity**: Improve logging around verification to clearly distinguish between a tool succeeding and the overarching goal being achieved.

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-controller`: Modify the verification requirement to strictly evaluate the post-action world state against the main goal, explicitly forbidding short-circuiting based on individual tool success messages.

## Impact

- **Packages**: `packages/agent/src/agent-loop.ts`
- **Behavior**: The agent will run for more iterations until the LLM explicitly determines the goal is met based on the world state observation, rather than stopping randomly when a tool succeeds.
