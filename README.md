# Yearn for Mines

Autonomous Minecraft agent system built as a TypeScript monorepo. It uses MCP (Model Context Protocol) to control a Mineflayer bot, can use MemPalace for persistent memory, and plans actions with an OpenAI-compatible LLM endpoint (Ollama by default).

## Architecture

This repository has four workspace packages:

```
shared ← mc-mcp-server
shared ← agent ← web-ui
```

- `@yearn-for-mines/shared`: shared types/schemas, config loader, MCP + LLM clients, shutdown utilities
- `@yearn-for-mines/mc-mcp-server`: MCP server that wraps Mineflayer bot lifecycle, observation, action, event, and HUD tools
- `@yearn-for-mines/agent`: autonomous agent loop (`perceive -> plan -> execute -> verify -> remember`)
- `@yearn-for-mines/web-ui`: React + Vite frontend with an Express + WebSocket dashboard server

The MCP server exposes tools over Streamable HTTP. The agent and web dashboard both connect as MCP clients.

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (for Minecraft server and MemPalace in local/dev stack)
- Ollama (or another OpenAI-compatible endpoint) for agent planning

## Install

```bash
pnpm install
```

On install, `.env` is created from `.env.example` if missing.

## Development

### Main Dev Flows

```bash
pnpm dev            # Minecraft + MemPalace containers, then MCP + Web + Agent (hot reload)
pnpm dev:webstack   # Minecraft + MemPalace containers, then MCP + Web (no agent)
```

### Service-Specific Dev Commands

```bash
pnpm dev:mcp
pnpm dev:web
pnpm dev:agent
pnpm dev:minecraft
pnpm dev:mempalace
pnpm dev:all        # Alias for dev:webstack
pnpm dev:all:agent  # Alias for dev
```

### Build, Test, Lint, Typecheck

```bash
pnpm build
pnpm test
pnpm test:coverage
pnpm lint
pnpm typecheck
```

Per-package tests are configured with 90% coverage thresholds.

### Docker Compose

```bash
pnpm docker:up
pnpm docker:logs
pnpm docker:down
pnpm docker:reset
```

## Runtime Configuration

Configuration is loaded and validated by `loadConfig()` in `@yearn-for-mines/shared` using Zod.

### Minecraft

| Variable | Default |
|---|---|
| `MC_HOST` | `localhost` |
| `MC_PORT` | `25565` |
| `MC_USERNAME` | `YearnForMines` |
| `MC_VERSION` | `1.21.4` |
| `MC_AUTH` | `offline` |

### MCP Server

| Variable | Default |
|---|---|
| `MCP_PORT` | `3000` |
| `MCP_HOST` | `0.0.0.0` |

### Agent

| Variable | Default |
|---|---|
| `AGENT_GOAL` | `Find a tree and gather wood` |
| `AGENT_MAX_ITERATIONS` | `100` |
| `AGENT_MAX_RETRIES` | `3` |
| `AGENT_MAX_OBSERVATION_TOKENS` | `2000` |
| `AGENT_ENABLE_VLM` | `false` |
| `AGENT_LOOP_DELAY_MS` | `500` |

### LLM

| Variable | Default |
|---|---|
| `LLM_BASE_URL` | `http://localhost:11434/v1` |
| `LLM_MODEL` | `llama3.2` |
| `LLM_VISION_MODEL` | empty |
| `LLM_API_KEY` | empty |
| `LLM_MAX_TOKENS` | `2048` |
| `LLM_TEMPERATURE` | `0.7` |

### MemPalace

| Variable | Default |
|---|---|
| `MCP_MEMPALACE_URL` | `http://localhost:8081/mcp` |

### Web UI

| Variable | Default |
|---|---|
| `PORT` | `8080` |
| `MCP_MC_URL` | `http://localhost:3000/mcp` |

## MCP Surface (MC Server)

### Lifecycle

- `bot_connect`
- `bot_disconnect`
- `bot_respawn`
- `bot_status`

### Observation

- `observe`
- `find_block`
- `find_entity`
- `get_inventory`
- `get_position`
- `get_craftable`
- `get_tool_effectiveness`
- `get_nearby_items`
- `look_at_block`
- `entity_at_cursor`

### Actions

- `pathfind_to`
- `look_at`
- `dig_block`
- `place_block`
- `craft_item`
- `equip_item`
- `drop_item`
- `use_item`
- `chat`
- `whisper`

### Events

- `subscribe_events`
- `unsubscribe_events`
- `get_events`

### HUD

- `get_hud`
- `get_attack_cooldown`
- `get_dig_progress`

### MCP Resource

- `bot://status` (registered as `bot-status`)

## Notes

- The web dashboard currently polls MCP observation/status data and relays WebSocket state updates.
- Agent startup validates model availability and attempts MCP connection retries.
- MemPalace integration is optional and controlled by `MCP_MEMPALACE_URL`.

## License

MIT