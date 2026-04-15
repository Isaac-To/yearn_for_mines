# Yearn for Mines — Project Guide

## Architecture

TypeScript monorepo (pnpm workspaces) with 4 packages:

```
packages/
  shared/          → Zod schemas, types, utilities (no runtime deps beyond zod)
  mc-mcp-server/   → MCP server wrapping Mineflayer bot actions
  agent/           → Autonomous agent controller (perceive-plan-execute-verify-remember)
  web-ui/          → Debug dashboard (Express + Vite React)
```

**Languages:** TypeScript (primary), Python (MemPalace only, not in our codebase)

**Runtimes:** Node.js 20+, Python 3.9+ (for MemPalace)

## Key Design Decisions

1. **MCP server built from scratch** — not forking existing Minecraft MCP servers. Our tools are designed for autonomous agent use (structured errors, verification data)
2. **MemPalace-only memory** — no separate skill library. Drawers store skill code, KG stores facts, diary stores failures
3. **Agent is MCP client** — connects to both MC MCP server and MemPalace MCP server as separate processes via Streamable HTTP
4. **Text-first observations** — core agent loop works with text-only. VLM screenshots are optional enhancement
5. **TDD approach** — write tests first, then implement. 95% coverage threshold in Vitest
6. **Streamable HTTP transport** for MCP servers (not stdio) — enables web UI to connect as MCP client too

## Coding Standards

- **Strict TypeScript** — no `any`, use Zod for runtime validation
- **ES modules** — `"type": "module"` in all packages
- **Error handling** — all MCP tools return `{ content: [...], isError: true/false }`. Never throw in tool handlers
- **No premature abstractions** — three similar lines of code is better than a premature helper
- **Test structure** — co-locate tests as `src/__tests__/` or `*.test.ts` files alongside source
- **Coverage** — 95% threshold enforced in `vitest.config.ts` per package
- **Commits** — descriptive messages, no AI authorship lines

## Package Dependency Graph

```
shared ← mc-mcp-server
shared ← agent
shared ← web-ui
```

No circular dependencies. `shared` has no dependencies on other workspace packages.

## External Dependencies

| Dependency | Purpose | Package |
|---|---|---|
| mineflayer | Minecraft bot control | mc-mcp-server |
| mineflayer-pathfinder | A* pathfinding | mc-mcp-server |
| mineflayer-collectblock | Block collection | mc-mcp-server |
| prismarine-viewer | Screenshot/rendering | mc-mcp-server |
| @modelcontextprotocol/sdk | MCP server/client | mc-mcp-server, agent |
| zod | Schema validation | all |
| openai | Ollama API client | agent |
| express | Web server | web-ui (future) |
| react | UI framework | web-ui (future) |
| vitest | Testing | all |

## MCP Server Tool Design

Every MCP tool in mc-mcp-server follows this pattern:
- Input: Zod-validated schema
- Output: Structured JSON with `{ content: [...], isError: boolean }`
- Errors: Return `isError: true` with descriptive message, never throw

## Agent Loop

```
perceive → plan (LLM) → execute (MCP tools) → verify → remember (MemPalace)
```

Retries: up to 3 with error feedback, then alternative approach.

## MemPalace Wing Structure

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

## Running Tests

```bash
pnpm -r run test              # Run all tests
pnpm -r run test:coverage     # Run with coverage
pnpm -r run test:watch        # Watch mode
```

## Key Files

- `openspec/changes/yearn-for-mines-mvp/` — Full spec, design, and task list
- `packages/shared/src/types/` — All Zod schemas and TypeScript types
- `docker/docker-compose.yml` — Full stack orchestration

## MemPalace

Runs as a separate Python process. Not part of our TypeScript codebase. Install via `pip install mempalace chromadb` in `python/.venv/`. Has 29 MCP tools accessible via Streamable HTTP.

## LLM Endpoint

Ollama at `http://localhost:11434/v1` — OpenAI-compatible API. Configure model name and vision model in environment variables.