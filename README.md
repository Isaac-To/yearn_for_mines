# Yearn for Mines

An autonomous Minecraft agent system that uses MCP (Model Context Protocol) to control a bot with persistent MemPalace memory and a local LLM for planning.

## Architecture

```
┌─────────────┐     MCP/HTTP      ┌──────────────────┐
│   Agent      │◄─────────────────►│  MC MCP Server     │
│  Controller  │                  │  (Mineflayer)       │
│              │     MCP/HTTP      │                    │
│              │◄─────────────────►│  Bot lifecycle,     │
│              │                  │  observation,       │
└──────┬───────┘                  │  actions, events   │
       │                          └────────┬───────────┘
       │ MCP/HTTP                          │ mineflayer
       │                                   ▼
┌──────┴───────┐                  ┌──────────────────┐
│  MemPalace   │                  │  Minecraft Server  │
│  (Memory)    │                  │  (Java/Paper)      │
│              │                  └──────────────────┘
│  Skills, KG, │
│  Diary       │
└──────────────┘

┌─────────────┐     WebSocket     ┌──────────────────┐
│   Web UI     │◄────────────────►│  Dashboard Server  │
│  (React)     │                  │  (Express)          │
│              │                  │                     │
│  Bot Status  │                  │  Bot status polling  │
│  Actions Log │                  │  Agent step relay    │
│  Memory View │                  └─────────────────────┘
│  Screenshots │
└──────────────┘
```

### Packages

| Package | Description |
|---------|-------------|
| `shared` | Zod schemas, TypeScript types, MCP client, LLM client utilities |
| `mc-mcp-server` | MCP server wrapping Mineflayer bot — observation, actions, events, HUD |
| `agent` | Autonomous controller: perceive → plan (LLM) → execute → verify → remember |
| `web-ui` | Debug dashboard: Express + WebSocket server, React frontend |

### Agent Loop

```
perceive → plan (LLM) → execute (MCP tools) → verify → remember (MemPalace)
```

1. **Perceive**: Call `observe` and `get_events` MCP tools
2. **Plan**: Send observation + tool descriptions + memories to LLM, get tool calls
3. **Execute**: Route tool calls to MC server or MemPalace, collect results
4. **Verify**: Re-observe world state, check if goal achieved
5. **Remember**: Store verified skills, record failures, update knowledge graph

Up to 3 retries per tool call, then tries an alternative approach.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Ollama (for local LLM)
- Docker (for Minecraft server and MemPalace)

### Install

```bash
git clone https://github.com/your-org/yearn-for-mines.git
cd yearn-for-mines
pnpm install
```

`.env` is auto-created from `.env.example` on install. Customize it for your setup (defaults work for local Ollama).

### Run Tests

```bash
pnpm test              # Run all tests
pnpm test:coverage     # Run with coverage (95% threshold enforced)
pnpm typecheck         # Type-check all packages
```

### Local Development

A single command starts everything — Minecraft server, MemPalace, and all Node.js services:

```bash
pnpm dev            # All services (MCP + Web UI + Agent) with hot reload
pnpm dev:webstack   # MCP + Web UI only (no agent) with hot reload
```

Both commands auto-start the Minecraft server and MemPalace Docker containers and wait for them to be healthy before launching Node.js services.

Individual services are also available for targeted development:

```bash
pnpm dev:mcp        # MCP server only
pnpm dev:web        # Web UI only
pnpm dev:agent      # Agent only
pnpm dev:minecraft  # Minecraft server Docker container only
```

### Docker Compose (Full Stack)

```bash
pnpm docker:up     # Start all services
pnpm docker:logs   # Follow logs
pnpm docker:down   # Stop all services
pnpm docker:reset  # Stop all and remove data volumes (clean slate)
```

## Configuration

All configuration is validated at startup through a Zod schema in `@yearn-for-mines/shared`. `.env` is auto-created from `.env.example` on `pnpm install` — customize it for your setup. Defaults work for local development with Ollama.

The `loadConfig()` function reads env vars, validates types, and returns a frozen `AppConfig` object. Each package entry point calls it once at startup — no scattered `process.env` reads.

### Minecraft Server

| Variable | Default | Description |
|----------|---------|-------------|
| `MC_HOST` | `localhost` | Minecraft server host |
| `MC_PORT` | `25565` | Minecraft server port |
| `MC_USERNAME` | `YearnForMines` | Bot username |
| `MC_VERSION` | `1.21.4` | Minecraft version |
| `MC_AUTH` | `offline` | Auth mode (`offline` or `microsoft`) |

### MCP Server

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_PORT` | `3000` | MCP HTTP server port |
| `MCP_HOST` | `0.0.0.0` | MCP server bind host |

### Agent

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_GOAL` | `Find a tree and gather wood` | Default agent goal |
| `AGENT_MAX_ITERATIONS` | `100` | Maximum agent loop iterations |
| `AGENT_MAX_RETRIES` | `3` | Retries per tool call before alternative |
| `AGENT_MAX_OBSERVATION_TOKENS` | `2000` | Token limit for observation truncation |
| `AGENT_ENABLE_VLM` | `false` | Enable VLM screenshot analysis (`true`/`1`) |
| `AGENT_LOOP_DELAY_MS` | `500` | Delay between loop iterations (ms) |

### LLM

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible API endpoint |
| `LLM_MODEL` | `llama3.2` | Chat completion model name |
| `LLM_VISION_MODEL` | (none) | Vision model for screenshots |
| `LLM_API_KEY` | (none) | API key for authenticated endpoints |
| `LLM_MAX_TOKENS` | `2048` | Maximum tokens in LLM responses |
| `LLM_TEMPERATURE` | `0.7` | LLM sampling temperature (0–2) |

### MemPalace

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_MEMPALACE_URL` | (none) | MemPalace MCP server URL (omit to disable) |

### Web UI

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Dashboard server port |
| `MCP_MC_URL` | `http://localhost:3000/mcp` | MC MCP server URL |

## MCP Tools

### Bot Lifecycle

| Tool | Description |
|------|-------------|
| `bot_connect` | Connect bot to Minecraft server |
| `bot_disconnect` | Disconnect bot |
| `bot_respawn` | Respawn after death |

### Observation

| Tool | Description |
|------|-------------|
| `observe` | Full world observation (position, health, inventory, nearby entities/blocks) |
| `find_block` | Find nearest block of a type |
| `find_entity` | Find nearest entity of a type |
| `get_inventory` | List inventory items with durability/enchantments |
| `get_position` | Get bot position and orientation |
| `get_hud` | Full heads-up display data |
| `get_craftable` | Items craftable from current inventory |
| `get_tool_effectiveness` | Tool effectiveness against blocks |
| `get_nearby_items` | Dropped items near bot |
| `look_at_block` | Get info about a targeted block |
| `entity_at_cursor` | Get entity bot is looking at |
| `get_attack_cooldown` | Current attack cooldown state |

### Actions

| Tool | Description |
|------|-------------|
| `pathfind_to` | Navigate to coordinates using A* pathfinding |
| `dig_block` | Dig a block at specified coordinates |
| `place_block` | Place a block at specified coordinates |
| `craft_item` | Craft an item from available materials |
| `equip_item` | Equip an item to an armor/held slot |
| `drop_item` | Drop items from inventory |
| `use_item` | Use/activate an item |
| `chat` | Send a chat message |
| `screenshot` | Capture bot's perspective as image |

### Events

| Tool | Description |
|------|-------------|
| `subscribe_events` | Start collecting real-time events |
| `unsubscribe_events` | Stop collecting events |
| `get_events` | Retrieve buffered events since last check |

### HUD

| Tool | Description |
|------|-------------|
| `get_hud` | Full heads-up display (health, food, armor, hotbar, effects) |
| `get_attack_cooldown` | Attack cooldown progress |
| `get_dig_progress` | Block breaking progress |

## MemPalace Memory Structure

```
minecraft-skills/
  wood-gathering/
  crafting/
  mining/
  navigation/
  combat/
  farming/
  survival/
minecraft-knowledge/
  blocks/
  items/
  mobs/
  recipes/
  biomes/
  mechanics/
```

Skills are stored as drawers with step-by-step sequences. The knowledge graph stores facts about Minecraft mechanics. Diary entries record failures and milestones.

## Tech Stack

- **Language**: TypeScript (primary), Python (MemPalace Docker image)
- **Runtime**: Node.js 20+
- **Bot Framework**: Mineflayer 4.37+
- **Protocol**: MCP (Model Context Protocol) via Streamable HTTP
- **LLM**: Ollama (OpenAI-compatible API)
- **Memory**: MemPalace + ChromaDB
- **Frontend**: React 19 + Vite
- **Server**: Express 5 + WebSocket
- **Testing**: Vitest (95% coverage threshold)

## License

MIT