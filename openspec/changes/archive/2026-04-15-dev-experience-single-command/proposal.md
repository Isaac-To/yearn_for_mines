## Why

Starting the development environment requires running 3-4 separate commands in separate terminals (`pnpm dev:mcp`, `pnpm dev:agent`, `pnpm dev:web`, and optionally MemPalace), plus a manual build step before `dev:all`. The existing `scripts/dev.sh` launches compiled JS (not hot-reloading), has no process orchestration (crashes in one service kill the whole script or go unnoticed), and doesn't integrate with the project's `tsx watch` dev scripts. Developers currently juggle multiple terminals, lose logs across services, and have no single command to spin up a working dev environment with auto-reload.

## What Changes

- Add a single `pnpm dev` command that launches all services with hot reload using `concurrently` for process orchestration
- Each service runs its existing `tsx watch` / `vite` dev script — no new build step needed before dev
- Consolidated log output with color-coded service prefixes and per-service log streaming
- Graceful shutdown (Ctrl+C kills all services, not just the foreground one)
- Health checks and startup ordering: shared build first, then MCP server, then web UI, then agent
- Optional flags: `--only mcp,web` to start a subset of services, `--skip-agent` for front-end-only work
- Add `concurrently` as a dev dependency at the repo root

## Capabilities

### New Capabilities
- `dev-orchestrator`: Single-command dev experience that starts all services with hot reload, color-coded logs, graceful shutdown, and selective service control

### Modified Capabilities
<!-- No existing specs to modify — dev-orchestrator is a new capability -->

## Impact

- **Root `package.json`**: New `dev` script using `concurrently`; add `concurrently` as a devDependency
- **Root `package.json`**: Existing `dev:all` / `dev:all:agent` scripts can be deprecated in favor of the new `dev` command
- **`scripts/dev.sh`**: Can be simplified or replaced entirely by the new npm script
- **`packages/shared`**: Must be built once before other services can start; the orchestrator handles this as a prerequisite step
- **Dependencies**: Add `concurrently` (dev dependency at repo root)