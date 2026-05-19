# Yearn for Mines

Autonomous Minecraft agent system built as a TypeScript monorepo. It uses MCP (Model Context Protocol) to control a Mineflayer bot, can use MemPalace for persistent memory, and plans actions with an OpenAI-compatible LLM endpoint (Ollama by default).

## Architecture

This repository has four workspace packages:

```
shared ← mc-mcp-server
shared ← agent
shared ← web-ui
```

- `@yearn-for-mines/shared`: shared types/schemas, config loader (`loadConfig`), MCP client (`McpClient`), LLM client (`LlmClient`), shutdown utilities
- `@yearn-for-mines/mc-mcp-server`: MCP server that wraps Mineflayer bot lifecycle, observation builder, and action tools (7 MCP tools total)
- `@yearn-for-mines/agent`: autonomous agent loop (`perceive -> plan -> execute -> verify -> remember`) with task management and MemPalace memory integration
- `@yearn-for-mines/web-ui`: React + Vite frontend with an Express + WebSocket dashboard server — imports only from `shared`

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
This bootstrap is implemented with a Node script so it works across macOS, Linux, and Windows shells.

## Development

### Main Dev Flows

```bash
pnpm dev            # Minecraft + MemPalace containers, then MCP + Web + Agent (hot reload)
pnpm dev:webstack   # Minecraft + MemPalace containers, then MCP + Web (no agent)
```

The dev entrypoint uses a cross-platform Node helper that:
- Starts required containers with `docker compose up ... --wait` when supported.
- Falls back to `docker compose up -d` plus health polling for older Compose versions.

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

For Dockerized `agent`, `docker/docker-compose.yml` defaults `LLM_BASE_URL` to `http://host.docker.internal:11434/v1` and also maps `host.docker.internal` via `host-gateway` for Linux compatibility.

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

Seven tools are registered. Bot lifecycle (connect/disconnect/respawn) is handled automatically by `BotManager` at startup and shutdown, not via tool calls. Events are collected by `EventManager` and flushed into every `observe` call automatically — no explicit subscribe/unsubscribe needed.

### `bot_status`

Returns structured JSON: connected, username, position, health, food, experience, gameMode, and full observation.

### `observe`

Comprehensive world state as formatted text — vitals, inventory, craftable items, nearby blocks/entities/dropped items (with tool effectiveness info), points of interest, and any pending events. Replaces the former individual observation tools (`find_block`, `find_entity`, `get_inventory`, `get_position`, `get_craftable`, `get_tool_effectiveness`, `get_nearby_items`, `look_at_block`, `entity_at_cursor`).

### `send_chat`

Send a chat message (rate-limited to 1/s, max 256 chars).

### `reposition`

Pathfind to coordinates, a block name, or an entity name. Supports distance and terrain-manipulation options. Replaces the former `pathfind_to` and `look_at` tools.

### `combat`

Pathfind to a named entity and attack it.

### `gather_materials`

Autonomous block-type collection within a 64-block radius (uses collectBlock plugin).

### `interact`

A single discriminated-union tool with 16 actions: `dig`, `place`, `craft`, `smelt`, `smelt_take_output`, `use`, `deposit`, `withdraw`, `enchant`, `anvil_combine`, `anvil_rename`, `trade`, `eat`, `fish`, `sleep`, `sign_edit`. Replaces the former individual action tools (`dig_block`, `place_block`, `craft_item`, `use_item`). Equipment is auto-selected for place/eat actions — no separate `equip_item` tool.

### Agent Virtual Tools

The agent injects two additional tools into its own tool list for task management:

- `add_task` — add a task (supports `parentId` for subtasks)
- `update_task_status` — update task status: pending / in_progress / completed / failed

## Notes

- The web dashboard polls MCP `observe` and `bot_status` via `McpClient`, then relays state over WebSocket.
- The agent auto-manages bot lifecycle — `bot_connect`/`bot_disconnect`/`bot_respawn` are not exposed as MCP tools.
- Events (block changes, entity movements, chat, death) are auto-collected by `EventManager` and included in every `observe` response.
- `ScreenshotCapture` (prismarine-viewer) and HUD type schemas (`AttackCooldown`, `DigProgress`) exist in code but are not yet wired into MCP tools.
- Agent startup validates model availability and retries MCP connections.
- MemPalace integration is optional and controlled by `MCP_MEMPALACE_URL`.
- Docker Compose defaults the agent to `gemma4:31b-cloud` (override via `LLM_MODEL`), with `LLM_BASE_URL` pointing to `host.docker.internal`.

## License

MIT