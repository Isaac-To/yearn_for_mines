## Why

Existing Minecraft MCP servers are thin Mineflayer wrappers that expose individual bot actions without persistent memory, skill composition, or autonomous planning. Meanwhile, Voyager demonstrated that LLM-driven Minecraft agents with skill libraries achieve 3.3x more unique item discovery than baseline approaches — but its memory is limited to flat vector-indexed code snippets with no temporal reasoning, failure tracking, or cross-referencing. There is no system that combines the standardization of MCP tool interfaces with structured persistent memory and local LLM autonomy. This project bridges that gap, starting with a minimal viable demonstration: an agent that can find a tree and gather wood, remembering what it learned.

## What Changes

- **New MCP server** built from scratch wrapping Mineflayer, exposing Minecraft bot actions as standardized MCP tools (observe, find_block, pathfind_to, dig_block, collect_item, craft_item, equip_item, get_inventory, chat, screenshot, place_block, drop_item, use_item, get_position, look_at)
- **New agent controller** (TypeScript) implementing an autonomous perceive-plan-execute-verify-remember loop that connects to the MC MCP server, MemPalace MCP server, and Ollama LLM
- **MemPalace integration** for all agent memory — skill storage (drawers), knowledge graph (temporal facts), diary entries, and semantic search. No separate skill library.
- **VLM observation pipeline** using prismarine-viewer screenshots fed to multimodal Ollama models (text-first design, VLM optional enhancement)
- **Web debug UI** (Express + Vite React) showing bot state, action history, memory view, and LLM prompt history in real-time
- **Monorepo structure** with pnpm workspaces, Vitest testing at 95% coverage, Docker Compose for reproducibility, and Python venv for MemPalace

## Capabilities

### New Capabilities
- `minecraft-mcp-server`: MCP server exposing Mineflayer bot actions as standardized tools with Zod schemas, streamable HTTP transport, and bot lifecycle management
- `agent-controller`: Autonomous agent loop that perceives Minecraft world state, plans via LLM, executes via MCP tools, verifies outcomes, and persists learnings in MemPalace
- `observation-pipeline`: Text and VLM observation formatting from Mineflayer world state, including prismarine-viewer screenshot capture
- `memory-integration`: MemPalace client integration for skill storage, knowledge graph, diary entries, and semantic retrieval across wings (minecraft-skills/wood-gathering, minecraft-skills/crafting, minecraft-skills/navigation)
- `web-debug-ui`: Real-time dashboard for bot status, action log, memory inspector, and LLM prompt history

### Modified Capabilities
<!-- No existing capabilities to modify — this is a greenfield project -->

## Impact

- **New dependencies**: mineflayer, @modelcontextprotocol/sdk, zod, mineflayer-pathfinder, mineflayer-collectblock, prismarine-viewer, express, react, vite, vitest
- **New dependencies (Python)**: mempalace, chromadb
- **Runtime requirements**: Node.js 20+, Python 3.9+, Ollama running locally with a multimodal model (llava/qwen2-vl) and a text model
- **Infrastructure**: Docker Compose for Minecraft server, agent, MCP servers, MemPalace, and web UI
- **API surface**: MCP tools exposed via streamable HTTP transport; OpenAI-compatible API consumed at localhost:11434/v1