## Context

The agent currently verifies task completion by checking if any executed tool returned a result containing the word "success". This causes the agent to mistakenly conclude its overarching goal is achieved when a subsidiary step (like `mempalace_reconnect`) reports success.

## Goals / Non-Goals

**Goals:**
- Ensure the agent loop correctly verifies the main overarching goal.
- Evaluate the state of the world to determine goal completion rather than short-circuiting on individual tool successes.

**Non-Goals:**
- Creating a completely new specialized sub-agent for verification.
- Completely overhauling the LLM prompt structure.

## Decisions

- **Decision 1: Removal of shortcut**: We will remove the `!r.isError && r.result.toLowerCase().includes('success')` check in `packages/agent/src/agent-loop.ts`.
- **Decision 2: LLM Verification Strategy**: The agent will rely on the existing logic that prompts the LLM with the latest world state and asks if the overarching goal is met. The LLM will assess if the goal is completed and respond appropriately. This keeps the fix clean and uses existing behavior that was being shadowed by the shortcut.

## Risks / Trade-offs

- **Risk**: The LLM might hallucinate that a goal is completed when it isn't.
  - **Mitigation**: The current verification prompt explicitly instructs the LLM: `Have you achieved the goal: "{goal}"? If yes, respond without tool calls. If no, continue with tool calls.` We will rely on the LLM's assessment of the world state text. If it hallucinates, it's an LLM capability trace, not a logic bypass trick.
