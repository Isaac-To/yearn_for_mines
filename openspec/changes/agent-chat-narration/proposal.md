## Why

Agent opaque to players and user. Need in-game visibility and response loop to keep humans informed and allow chat-driven guidance.

## What Changes

- Add MCP tool to send Minecraft chat from agent (rate-limited, length-capped).
- Pipe in-game chat events into agent observations for planning context.
- Add optional agent narration to Minecraft chat for key actions and failures.
- Add user chat handling so agent can respond to player messages and adapt plan when asked.

## Capabilities

### New Capabilities
- `in-game-chat`: Send and receive Minecraft chat, with agent narration and user message handling.

### Modified Capabilities
- `agent-controller`: Agent loop incorporates chat events and emits narration/response messages.
- `minecraft-mcp-server`: MCP tool surface and event payloads include chat send/receive.

## Impact

- `packages/mc-mcp-server` new tool and event flow.
- `packages/agent` new narration/response loop.
- `packages/shared` tool schemas and message types.
- `packages/web-ui` may display chat events.
