## 1. MCP chat tooling

- [ ] 1.1 Add `send_chat` tool schema in shared types and register in MCP server
- [ ] 1.2 Implement `send_chat` handler using Mineflayer `bot.chat()` with validation and rate limit
- [ ] 1.3 Extend observation pipeline to include recent chat events in context frame

## 2. Agent narration and response

- [ ] 2.1 Add agent config toggles for chat narration and response (default on)
- [ ] 2.2 Add narration hooks for start, task changes, failures, completion
- [ ] 2.3 Add chat response handling for messages mentioning bot or operator

## 3. UI and tests

- [ ] 3.1 Update web UI to display chat events in status stream
- [ ] 3.2 Add/adjust tests for new MCP tool and agent chat behavior
