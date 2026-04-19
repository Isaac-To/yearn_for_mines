## Why

The current agent directly saves exact sequences of tool calls (its working memory) straight into long-term MemPalace storage when a goal is achieved. This makes the agent's memory rigid and brittle, as sequences that work in one environmental context (e.g., harvesting wood on flat terrain) will fail when replayed in different conditions. To make the agent robust and generalize its skills, it needs a reflection step based on human experiential learning, allowing it to convert specific episodes into adaptable heuristics and factual knowledge before saving to MemPalace.

## What Changes

- Add a dedicated `reflect` phase to the agent loop (`perceive ➔ plan ➔ execute ➔ verify ➔ reflect ➔ remember`).
- Modify the `rememberSuccess` logic to consolidate memory instead of saving raw tool calls.
- The reflection phase will use the LLM to analyze the episode (both successes and failures) to extract semantic facts and procedural strategies.
- Save semantic truths to the MemPalace Knowledge Graph (`mempalace_kg_add`).
- Save procedural heuristics to structural drawers (`mempalace_add_drawer`), rather than exact macros.
- Update planning to use these generalized strategies from memory to generate context-aware tool calls.

## Capabilities

### New Capabilities

- `learning-reflection`: Introduces the reflection step to analyze episodic execution, extracting generalized strategies and semantic truths from both successful and failed attempts.

### Modified Capabilities

- `memory-integration`: Alters how procedural memory (drawers) and semantic memory (knowledge graph) are populated. It shifts from saving exact tool call sequences to saving LLM-summarized heuristics and universal facts.

## Impact

- **Agent Loop**: `packages/agent/src/agent-loop.ts` will have an added reflection state and modified completion logic.
- **Memory Manager**: `packages/agent/src/memory-manager.ts` will need updates to handle new types of abstractions instead of raw tool sequences.
- **LLM Integration**: New prompts required for the reflection and consolidation phase.
- **MemPalace Interactions**: Increased use of structured natural language in drawers rather than strict JSON tool sequences.
