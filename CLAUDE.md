# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build
pnpm -r run build              # Build all packages
pnpm --filter @yearn-for-mines/shared run build   # Build single package

# Test
pnpm -r run test                # Run all tests
pnpm -r run test:coverage       # Run with coverage (95% threshold enforced)
pnpm -r run test:watch          # Watch mode all packages
pnpm --filter @yearn-for-mines/agent run test     # Test single package
npx vitest run src/__tests__/agent-loop.test.ts   # Run single test file

# Type checking & linting
pnpm -r run typecheck           # Type-check all packages
pnpm -r run lint                # Lint all packages

# Dev servers (each in separate terminal)
pnpm dev:mcp                    # MC MCP server with hot reload
pnpm dev:agent                  # Agent with hot reload
pnpm dev:web                    # Web UI dev server
pnpm dev:all                    # All services via scripts/dev.sh
pnpm dev:all:agent              # Same + agent process

# Docker
pnpm docker:up                 # Full stack via docker-compose
pnpm docker:down
```

## Architecture

TypeScript monorepo (pnpm workspaces). Four packages with a strict dependency graph:

```
shared ← mc-mcp-server
shared ← agent ← web-ui
```

No circular dependencies. `shared` has no workspace dependencies.

**Agent Loop** (`packages/agent/src/agent-loop.ts`): perceive → plan (LLM) → execute (MCP tools) → verify → remember (MemPalace). Up to 3 retries per tool call, then tries alternative approach.

**MCP Server** (`packages/mc-mcp-server/src/`): Wraps Mineflayer bot actions as MCP tools over Streamable HTTP. Tools are organized by category in `src/tools/`: `lifecycle`, `observation`, `action`, `events`, `hud`. Every tool follows the pattern: Zod-validated input → `{ content: [...], isError: boolean }` output. Never throw in tool handlers.

**Shared** (`packages/shared/src/`): Zod schemas in `types/`, plus `mcp-client.ts` and `llm-client.ts` wrappers used by both agent and web-ui.

**Web UI** (`packages/web-ui/src/`): Express 5 server (`server.ts`, `server-main.ts`) with WebSocket relay to React frontend. Connects to MC MCP server as an MCP client.

**MemPalace**: Runs in Docker via `docker/Dockerfile.mempalace` and `docker/mempalace_http.py` (FastMCP wrapper over the `mempalace` pip package). 29 MCP tools over Streamable HTTP on port 8080. No local Python venv needed.

**LLM**: Ollama at `http://localhost:11434/v1` (OpenAI-compatible). Model name and vision model set via env vars.

## Coding Standards

- **Strict TypeScript** — no `any`, use Zod for runtime validation. Base config in `tsconfig.base.json` with `strict: true`.
- **ES modules** — `"type": "module"` in all packages, `module: Node16` resolution.
- **Error handling** — MCP tools return `{ content: [...], isError: true/false }`. Never throw in tool handlers.
- **No premature abstractions** — three similar lines > a premature helper.
- **Tests** — co-located as `src/__tests__/` or `*.test.ts`. 95% coverage threshold (branches, functions, lines, statements) enforced in each `vitest.config.ts`.
- **Commits** — descriptive messages, no AI authorship lines (no `Co-Authored-By` clauses).

## Key Files

- `openspec/changes/yearn-for-mines-mvp/` — Full spec, design, and task list
- `packages/shared/src/types/` — All Zod schemas and TypeScript types
- `docker/docker-compose.yml` — Full stack orchestration
- `scripts/dev.sh` — Local dev startup script

## Environment Variables

**MC MCP Server**: `MC_HOST`, `MC_PORT`, `MC_USERNAME`, `MC_VERSION`, `MC_AUTH`, `MCP_PORT`, `MCP_HOST`

**Agent**: `MCP_MC_URL`, `MCP_MEMPALACE_URL`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_VISION_MODEL`, `AGENT_GOAL`

**Web UI**: `PORT`, `MCP_MC_URL`

See `scripts/dev.sh` for defaults.