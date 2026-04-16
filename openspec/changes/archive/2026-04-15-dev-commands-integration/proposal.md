## Why

Starting the full development environment currently requires manually orchestrating multiple services and setup steps before writing any code. The `pnpm dev` command auto-starts MemPalace but not the Minecraft server; `.env` must be copied manually; and there's no validation that the configured LLM model is available in Ollama. These fragmented steps create friction and make it harder for new contributors to get running quickly.

## What Changes

- Add Minecraft server auto-start to `pnpm dev`, `pnpm dev:webstack`, `pnpm dev:all`, and `pnpm dev:all:agent` commands (same pattern as existing MemPalace auto-start)
- Add a health-check wait in dev commands so services dependent on Minecraft (MC MCP server) don't attempt to connect before the server is ready
- Add a `pnpm dev:minecraft` convenience script for starting just the Minecraft server container
- Auto-create `.env` from `.env.example` via a `postinstall` hook if `.env` is missing
- Add LLM model validation at agent startup — check if the configured model exists in Ollama and print the `ollama pull` command if not
- Add `pnpm docker:reset` script to wipe Minecraft world and MemPalace data volumes
- Remove `scripts/dev.sh` (fully deprecated) and migrate `dev:all` / `dev:all:agent` logic entirely into `package.json`
- Update README and docs to reflect the simplified workflow

## Capabilities

### New Capabilities
- `dev-commands-integration`: Auto-start and health-check Minecraft server and MemPalace containers, auto-create `.env`, validate LLM model availability, and add Docker convenience commands — all to provide a single-command development experience

### Modified Capabilities
- `dev-orchestrator`: Add Minecraft server auto-start, health-check gating, `.env` auto-creation, and LLM model validation to the existing dev orchestration scripts

## Impact

- `package.json`: Dev scripts need Minecraft server docker compose commands prepended; add `dev:minecraft`, `docker:reset`, `postinstall` scripts; remove `dev:all`/`dev:all:agent` dependency on scripts/dev.sh
- `packages/agent/src/main.ts`: Add LLM model availability check before starting the agent loop
- `scripts/dev.sh`: Delete entirely
- `docker/docker-compose.yml`: No structural changes needed (minecraft-server service already defined)
- `.env.example`: Add comments about auto-started services
- `CLAUDE.md`: Update Commands section to reflect new behavior
- `README.md`: Update Getting Started to reflect single-command workflow