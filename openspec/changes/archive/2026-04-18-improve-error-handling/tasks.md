## 1. Agent Loop Action Tracking

- [x] 1.1 In `packages/agent/src/agent-loop.ts`, introduce a mechanism to track recent executed tool calls and their structured responses.
- [x] 1.2 In `packages/agent/src/agent-loop.ts`, create a heuristic to determine if the agent is repeating the identical action with the exact identical arguments that resulted in an error `N` times in a row (e.g. 3).

## 2. Injections and Logging

- [x] 2.1 Integrate the detection logic in the main loop so that right before calling the LLM `chat` or completion function, it injects a meta-instruction like `"You have been failing parsing XYZ repetitively..."` when the stall threshold is reached.
- [x] 2.2 Add unit tests specifying mock identical tools calls and assuring that the meta-instruction is embedded into the message history array handed over to LLM.