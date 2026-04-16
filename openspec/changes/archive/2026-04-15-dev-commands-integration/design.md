## Context

The current dev startup flow requires developers to manually start external services (MemPalace and Minecraft server) before running any dev commands. `pnpm dev` already auto-starts MemPalace via a `docker compose up mempalace -d` prefix, but the Minecraft server — which the MC MCP server depends on — must be started separately. This means developers need to:

1. Run `docker compose -f docker/docker-compose.yml up minecraft-server` in one terminal
2. Wait ~60-120s for the Minecraft server health check to pass
3. Run `pnpm dev` in another terminal

The docker-compose.yml already defines both services with proper health checks and dependency ordering, but only the Docker stack path (`pnpm docker:up`) leverages this automatically.

## Goals / Non-Goals

**Goals:**
- Single `pnpm dev` command starts everything: Minecraft server + MemPalace + Node.js services
- Health-check gating so dependent services don't connect before infrastructure is ready
- Auto-create `.env` from `.env.example` on `pnpm install` if missing
- Validate LLM model availability at agent startup with actionable error messages
- Add Docker convenience commands (`docker:reset`, `dev:minecraft`)
- Remove deprecated `scripts/dev.sh` and consolidate all dev orchestration into `package.json`
- Update README and documentation to reflect the simplified workflow

**Non-Goals:**
- Replacing the `concurrently`-based dev orchestrator with a different tool
- Adding interactive prompts or TUI for service selection
- Changing the Docker compose service definitions or health checks
- Supporting remote Minecraft servers differently than local Docker ones
- Adding pre-commit hooks (husky/lint-staged) — separate change
- Adding Docker Compose profiles — separate change

## Decisions

### 1. Minecraft auto-start via docker compose prefix (same pattern as MemPalace)

Append `docker compose -f docker/docker-compose.yml up minecraft-server -d` to the existing docker compose prefix in dev scripts, alongside the existing MemPalace start.

**Rationale**: Consistent with the existing pattern. No new tooling. Docker compose is idempotent — `up -d` on an already-running service is a no-op.

**Alternative considered**: A startup script that checks/waits for services. Rejected because it adds indirection and the docker compose prefix approach already works for MemPalace.

### 2. Health-check wait via docker compose up with `--wait`

Use `docker compose up minecraft-server mempalace --wait -d` instead of plain `up -d`. The `--wait` flag blocks until all service health checks pass.

**Rationale**: `--wait` is the native Docker Compose mechanism for health-check gating. It ensures Minecraft server is accepting connections before the MC MCP server tries to join. No custom polling script needed.

**Alternative considered**: Adding a `sleep` or custom wait-for-healthy script. Rejected because `--wait` is built-in and more reliable.

### 3. Update package.json scripts, not scripts/dev.sh

The `scripts/dev.sh` is already deprecated (it prints a deprecation notice). All real dev commands live in `package.json`. Update `package.json` scripts only.

**Rationale**: scripts/dev.sh already redirects users to `pnpm dev`. Adding changes there would increase maintenance burden for a deprecated path.

### 4. Add `pnpm dev:minecraft` convenience script

Add a dedicated `dev:minecraft` script for developers who only need the Minecraft server running (e.g., to connect a local MCP server to an existing Docker Minecraft instance).

**Rationale**: Mirrors the existing `dev:mempalace` pattern. Low cost, useful for incremental workflows.

### 5. Auto-create `.env` via postinstall hook

Add a `postinstall` script in `package.json` that checks if `.env` exists at the project root. If not, copy `.env.example` to `.env` and print a message. If it does exist, do nothing.

**Rationale**: Eliminates the common first-step friction of manually copying `.env.example`. The postinstall hook runs automatically after `pnpm install`, which is the natural first command for any new developer.

**Alternative considered**: A separate `pnpm setup` script. Rejected because it requires the developer to know to run it — postinstall is automatic and zero-discovery-cost.

### 6. LLM model validation at agent startup

Add a check in `packages/agent/src/main.ts` (before the agent loop starts) that verifies the configured `LLM_MODEL` is available in Ollama by calling `GET /api/tags`. If the model is not found, print an error message with the exact `ollama pull <model>` command and exit with a non-zero code.

**Rationale**: A missing model causes confusing runtime failures (the LLM client returns 404 errors that don't clearly indicate the root cause). A proactive check with an actionable message eliminates this debugging step entirely.

**Alternative considered**: Checking in the shared `llm-client.ts` wrapper. Rejected because the check is Ollama-specific and the LLM client should remain provider-agnostic (it already supports `LLM_API_KEY` for non-Ollama providers). The agent entry point is the right place for an Ollama-specific validation.

### 7. `pnpm docker:reset` convenience script

Add a `docker:reset` script that removes the `minecraft-data` and `mempalace-data` Docker volumes, giving developers a clean slate for world state and memory.

**Rationale**: Common need during testing. Currently requires looking up volume names and running manual `docker volume rm` commands. A one-liner script removes this friction.

### 8. Remove scripts/dev.sh

Delete `scripts/dev.sh` entirely and migrate `dev:all` and `dev:all:agent` to use the same `concurrently`-based pattern as `dev` and `dev:webstack` directly in `package.json`.

**Rationale**: The script is already deprecated (prints a deprecation notice) but is still referenced by `dev:all` and `dev:all:agent`. This creates confusion — is it deprecated or not? Fully removing it eliminates the ambiguity and consolidates all dev orchestration into one place.

### 9. README and docs update

Update the README to reflect the single-command dev experience and remove references to manually starting Minecraft/MemPalace separately. Update CLAUDE.md Commands section.

**Rationale**: Documentation should match the new simplified workflow.

## Risks / Trade-offs

- **Minecraft server startup time** → The Minecraft server takes 60-120s to become healthy on first start. `docker compose up --wait -d` will block during this time, making `pnpm dev` slower on cold starts. Mitigation: Docker volume persistence means subsequent starts are much faster (~15-30s). The `--wait` output shows progress.

- **Docker dependency** → All dev commands now implicitly require Docker. Developers without Docker can still use individual scripts (`pnpm dev:mcp`) with an external Minecraft server. Mitigation: Document this in README.

- **Port conflicts** → If a Minecraft server is already running on 25565, `docker compose up` will fail. Mitigation: Docker compose is idempotent for already-running containers from the same compose project; conflicts only happen with external servers, which is an edge case we can document.

- **postinstall .env overwrite** → If `.env.example` is updated after a developer has customized `.env`, postinstall won't overwrite it (it only creates if missing). But developers won't be notified of new options. Mitigation: Add a comment in `.env.example` telling developers to diff against their `.env` after updates.

- **Ollama model check adds latency** → The `GET /api/tags` call at agent startup adds a small network round-trip. Mitigation: The call is fast (<100ms locally) and only happens once at startup. If Ollama is not running at all, the check fails fast with a clear message instead of hanging on the first LLM call.

- **docker:reset is destructive** → `pnpm docker:reset` deletes all Minecraft world data and MemPalace memory without confirmation. Mitigation: The command name `reset` strongly implies destructive behavior. Document clearly in CLAUDE.md.