## Context

The agent loop's perceive phase currently calls `bot_status` (a minimal MCP tool returning `{ connected, username, position, health, food, experience, gameMode }`) and injects the JSON-serialized result as the "observation" into every planning prompt. Rich observation context (inventory, nearby entities, craftable items, POIs, events) only reaches the LLM as a side-effect string embedded in action tool results via `ObservationContext.observe()`.

This creates a famine/feast cycle:
- **Famine**: During planning, the LLM sees only bare position/health. It decides what to do without knowing what's in inventory or what entities are nearby.
- **Feast**: After an action, the tool result includes 40+ lines of observation. The LLM must parse through action results mixed with world state.

The `ObservationContext` class and `buildObservation()`/`formatObservation()` pipeline already exist and produce rich context frames. The infrastructure is there — it just needs to be wired into the perceive phase.

Stakeholders: agent loop (sole consumer of perceived state), MCP server (produces observations), LLM (receives observations in prompts).

## Goals / Non-Goals

**Goals:**
- Every planning turn starts with full world-state awareness (inventory, entities, craftable items, events)
- The LLM no longer needs to execute an action just to see what's happening
- `bot_status` returns rich observation data instead of minimal JSON
- A dedicated `observe` tool exists for on-demand observation (reconnection recovery, error recovery)
- Tool result observations remain as supplementary confirmation, not the primary perception channel

**Non-Goals:**
- Conversation history summarization or working memory (separate change)
- Workflow/prerequisite hints in tool descriptions (already improved in improve-tool-clarity)
- Structured error recovery hints in tool results (separate change)
- Changing the ObservationBuilder or ObservationFormatter internals
- Removing ObservationContext from tool results (it stays as supplementary confirmation)

## Decisions

### 1. Inject observation via agent-loop perceive phase, not via system prompt

The full observation text is appended to the user message in the plan step, not baked into the system prompt. The system prompt is already rebuilt each turn and includes tool descriptions — adding observation there would bloat it further. Instead, the user message (which already says "Current World State Observation:") gets the formatted observation text.

**Alternative considered**: Add observation to system prompt. Rejected because system prompt is already tool-heavy; observation changes each turn and belongs with the per-turn context.

### 2. Call `buildObservation` + `formatObservation` directly from agent loop via new MCP tool

The agent loop can only interact with the Minecraft server through MCP tool calls. It cannot directly import `ObservationBuilder`. So we add an `observe` MCP tool that returns the formatted observation text, and the agent loop calls it in the perceive phase.

**Alternative considered**: Import observation-builder directly into agent package. Rejected because it would create a direct dependency from agent to mc-mcp-server internals, breaking the MCP boundary.

### 3. Upgrade `bot_status` to include observation data

The `bot_status` tool currently returns `dataResult()` with minimal JSON. It will be upgraded to also include formatted observation text alongside the structured data. This gives any MCP client (not just our agent loop) access to rich world state.

**Alternative considered**: Replace `bot_status` entirely with `observe`. Rejected because `bot_status` serves a different purpose (checking if connected, getting position for verification). Keeping both tools with different scopes is clearer.

**Decision**: `bot_status` returns structured data (expanded to include inventory, entities) via `dataResult()`. `observe` returns human-readable formatted text via `textResult()`. The agent loop uses `observe` for perception and `bot_status` for connection checks only.

### 4. Tool results still include observation context but marked as supplementary

Tool results from `reposition`, `combat`, and `gather_materials` currently embed observation via `obsCtx.observe(bot, outcome)`. These remain unchanged — they provide action-specific context ("I moved here, and here's what I see now"). But they're no longer the LLM's primary source of world state.

### 5. Event flushing: `observe` tool flushes the event buffer

Currently, `ObservationContext.observe()` flushes the `EventManager`. The new `observe` tool will do the same, and the agent loop's perceive call will consume events. Tool-result observations will find the buffer empty (already flushed), which is correct — events shouldn't appear twice.

## Risks / Trade-offs

- **Token budget increase**: Full observation context adds ~500-800 tokens per turn. With 2 turns/second and 100 iteration max, that's 80-160K tokens of observation. Mitigation: observation is high-signal and already present in tool results; the net increase is modest since tool-result observations now supplement rather than replace.
- **`bot_status` BREAKING change**: Expanding the return shape breaks any client expecting only `{ connected, username, position, health, food }`. Mitigation: all fields are additive (new fields, not changed fields); existing field names and types are preserved.
- **Latency**: `observe` calls `buildObservation()` which scans nearby blocks/entities. This adds ~5-10ms per perceive phase. Acceptable given it replaces blind planning.
- **Double observation on same turn**: If perceive calls `observe` and then an action tool also includes observation, the LLM sees similar info twice. Mitigation: this is intentional — perceive observation is pre-action state, tool-result observation is post-action state. Both are valuable.