## 1. System Prompt and LLM Updates

- [x] 1.1 Add a new `reflect` prompt template that instructs the LLM to extract semantic facts and generalized procedural strategies from an episodic sequence of events.
- [x] 1.2 Modify the `plan` prompt template to instruct the agent to use retrieved abstract strategies rather than replaying exact tool steps.

## 2. Refactor Memory Manager

- [x] 2.1 Update `packages/agent/src/memory-manager.ts` to accept the new structures (e.g., pre-conditions, strategy steps, post-conditions) for MemPalace drawers instead of an array of raw tool calls.
- [x] 2.2 Add or refine `mempalace_kg_add` interaction to handle semantic knowledge learned during the reflection phase.

## 3. Update the Agent Loop Structure

- [x] 3.1 Modify `packages/agent/src/agent-loop.ts` to incorporate a new `reflect` phase between `verify` and `remember`.
- [x] 3.2 Change the `rememberSuccess(...)` to invoke the `reflect` phase with both the goal and the successful `toolCalls` sequence to generate abstraction.
- [x] 3.3 Ensure the `reflect` phase is triggered upon failures as well (if applicable based on retry limits or loop structure) to populate the Knowledge Graph with what went wrong.
- [x] 3.4 Update the final storage logic in `agent-loop.ts` (e.g. `this.memoryManager.storeSkill(...)` equivalent) to write the generalized string to MemPalace.
