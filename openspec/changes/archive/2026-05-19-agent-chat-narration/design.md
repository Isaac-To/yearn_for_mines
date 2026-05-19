## Context

Agent currently logs to stdout only. Minecraft chat events exist in MCP server event manager but are not exposed as tools or used in agent planning. Users need in-world feedback and ability to send instructions via chat while agent runs. System uses MCP tools and agent loop with retries; avoid extra micro-tools and keep macro architecture.

## Goals / Non-Goals

**Goals:**
- Provide MCP tool to send chat messages from agent to Minecraft.
- Surface recent chat events to agent planning context.
- Add agent-side narration and user response hooks with minimal loop disruption.
- Keep chat handling rate-limited and safe for long runs.

**Non-Goals:**
- Full conversational memory or persona systems.
- Natural language command parsing beyond basic instruction/routing.
- Multi-user authorization or permissions.

## Decisions

- Add `send_chat` MCP tool in `mc-mcp-server` backed by `bot.chat()`.
  - Rationale: explicit tool aligns with MCP architecture and avoids direct socket use in agent.
  - Alternative: reuse `interact` tool. Rejected: wrong domain and schema.
- Extend observation pipeline to include recent chat events (from EventManager) in `buildObservation`/`formatObservation` output.
  - Rationale: keep agent planning prompt informed without extra tool calls.
  - Alternative: add `get_events` tool. Rejected: removed by macro architecture.
- Add agent-side narration policy: emit chat for key phases (start, task switch, failure, completion) with throttling and dedupe.
  - Rationale: concise updates; avoid spamming.
  - Alternative: mirror all logs to chat. Rejected: noisy.
- Add user message response path: when new chat events from player(s) detected, agent replies in chat with acknowledgement and adjusts plan if message requests action.
  - Rationale: minimal control loop; let LLM decide action based on message context.

## Risks / Trade-offs

- Chat spam → Mitigation: rate-limit and collapse repeated messages.
- Sensitive info in chat → Mitigation: do not echo system prompts or raw tool errors; use short summaries.
- Event buffer overflow → Mitigation: cap stored events and only forward recent chat lines.
- LLM instruction conflicts via chat → Mitigation: treat chat as additional context; keep goal priority explicit.

## Migration Plan

- Add new MCP tool and shared schema changes.
- Wire chat events into context frame and formatter.
- Add agent narration/response logic and config toggles if needed.
- Update tests and web UI event display as needed.
