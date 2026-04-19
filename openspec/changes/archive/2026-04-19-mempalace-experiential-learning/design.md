## Context

Currently, the AI agent in Yearn for Mines bypasses a crucial step of learning: reflection. When a goal is marked as a success, it immediately dumps the verbatim sequence of tool calls (the episodic memory) into a MemPalace drawer as a "skill". This approach is brittle because a hardcoded sequence like `[look_at, move_forward, break_block]` assumes a static environment and fails in different contexts (like uneven terrain). Real human learning involves experiencing an event, reflecting on it, extracting universal facts (semantic knowledge), forming generalized guidelines (procedural knowledge), and then applying those principles in future situations. By implementing this experiential learning cycle, the agent can stop memorizing inflexible macros and start developing robust, context-aware strategies.

## Goals / Non-Goals

**Goals:**
- Implement a `reflect` phase in the agent loop that invokes the LLM to process recent episodes (tool calls and their outcomes).
- Convert episodic memory into semantic facts (knowledge graph) and procedural heuristics (drawers).
- Ensure that the agent can retrieve these generalized heuristics and use them effectively during the `plan` phase.
- Treat both task successes and failures as learning opportunities.

**Non-Goals:**
- Do not fundamentally alter the Minecraft environment API or actions.
- Do not build a completely new external memory system; continue using MemPalace wings, rooms, drawers, and the Knowledge Graph.
- Do not remove the diary/logging functionality. 

## Decisions

1. **Add a `Reflect` Phase to the Agent Loop**
   - *Rationale:* Placing a reflection step immediately after `verify` allows the LLM to analyze the context, the sequence of actions, and the outcome before doing any database writes.
   - *Alternatives Considered:* Performing reflection asynchronously or in a separate agent. This was rejected because immediate reflection keeps the immediate context fresh in the LLM's working memory and is structurally simpler.

2. **Transition Drawers from 'Macros' to 'Heuristics'**
   - *Rationale:* Instead of storing `['look_at_wood', 'walk_forward', 'break_block']`, we store structured natural language: "Pre-condition: empty hand, facing log. Strategy: Find nearest log, break it. Post-condition: +1 log." This enables the system prompt to instruct the LLM on *how* to solve a problem conceptually during the `plan` phase, rather than attempting to brute-force a playback of old commands.

3. **Learn from Failures**
   - *Rationale:* Failures often provide strong semantic facts (e.g. "Wood pickaxe cannot mine iron ore"). Catching these in the reflection phase to populate the Knowledge Graph minimizes repeating the exact same physical mistakes.

## Risks / Trade-offs

- **Risk:** The LLM might generate overly vague heuristics that do not help in the `plan` phase.
  - *Mitigation:* Carefully tune the system prompt for the `reflect` phase to mandate strict structures (Pre-conditions, Actions, Post-conditions).
- **Risk:** Additional LLM calls for reflection will increase latency and token usage per loop.
  - *Mitigation:* This is a necessary trade-off for higher quality, robust memory. The LLM call can be restricted to outputting a structured JSON of facts and strategies.