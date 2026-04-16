## 1. Package.json Script Updates

- [x] 1.1 Update `pnpm dev` script to auto-start Minecraft server and MemPalace with `docker compose up minecraft-server mempalace --wait -d` before the shared build and concurrently command
- [x] 1.2 Update `pnpm dev:webstack` script to auto-start both Minecraft server and MemPalace with `--wait` before the shared build and concurrently command
- [x] 1.3 Migrate `pnpm dev:all` to use `concurrently` directly in package.json (same pattern as `dev:webstack`) with auto-start of both Docker containers, removing dependency on scripts/dev.sh
- [x] 1.4 Migrate `pnpm dev:all:agent` to use `concurrently` directly in package.json (same pattern as `dev` with agent included) with auto-start of both Docker containers, removing dependency on scripts/dev.sh
- [x] 1.5 Add `pnpm dev:minecraft` script: `docker compose -f docker/docker-compose.yml up minecraft-server -d`
- [x] 1.6 Add `pnpm docker:reset` script: `docker compose -f docker/docker-compose.yml down -v && echo "Volumes removed: minecraft-data, mempalace-data"`
- [x] 1.7 Add `postinstall` script that checks for `.env` and copies from `.env.example` if missing

## 2. Delete Deprecated Script

- [x] 2.1 Delete `scripts/dev.sh` and remove any remaining references to it

## 3. LLM Model Validation

- [x] 3.1 Add Ollama model availability check in `packages/agent/src/main.ts` before starting the agent loop — call `GET /api/tags` and verify `LLM_MODEL` is present; print actionable error and exit if not found
- [x] 3.2 Skip the model check when `LLM_BASE_URL` does not point to Ollama (non-localhost:11434 URLs)
- [x] 3.3 Handle Ollama-not-running case gracefully with a clear error message

## 4. Documentation Updates

- [x] 4.1 Update CLAUDE.md Commands section to add `pnpm dev:minecraft`, `pnpm docker:reset`, note that `pnpm dev` and `pnpm dev:webstack` auto-start Docker services, and note that `.env` is auto-created on install
- [x] 4.2 Update README to reflect single-command dev experience — `pnpm dev` starts everything including Minecraft and MemPalace; `pnpm install` auto-creates `.env`
- [x] 4.3 Update .env.example to add a comment noting that Minecraft and MemPalace are auto-started by dev commands

## 5. Verification

- [x] 5.1 Run `pnpm dev` on a cold start (no running containers) and verify Minecraft server and MemPalace start and health-check before Node.js services
- [x] 5.2 Run `pnpm dev` with containers already running and verify it proceeds immediately
- [x] 5.3 Run `pnpm dev:minecraft` and verify only the Minecraft server container starts
- [x] 5.4 Delete `.env`, run `pnpm install`, and verify `.env` is auto-created from `.env.example`
- [x] 5.5 Configure a non-existent `LLM_MODEL` and start the agent — verify it prints the `ollama pull` command and exits
- [x] 5.6 Run `pnpm docker:reset` and verify volumes are removed