## Context

The project is a TypeScript monorepo with four packages (shared, mc-mcp-server, agent, web-ui) that each have their own `dev` script using `tsx watch` or `vite`. Currently developers must open 3-4 terminal windows and run `pnpm dev:mcp`, `pnpm dev:agent`, `pnpm dev:web` separately, plus manage a MemPalace process manually. The existing `scripts/dev.sh` launches compiled JS (no hot reload) and uses raw shell process management with `wait` and trap-based cleanup.

The shared package must be built before other packages can import it, since it ships TypeScript that downstream packages resolve via `dist/`.

## Goals / Non-Goals

**Goals:**
- Single `pnpm dev` command starts all services with hot reload
- Color-coded, interleaved log output with service name prefixes
- Graceful shutdown — Ctrl+C kills all child processes cleanly
- Startup ordering: shared build → MCP server → web UI → agent
- Selective service control via flags (`--only`, `--skip-agent`)
- Preserve existing individual `pnpm dev:*` scripts for single-service development

**Non-Goals:**
- Production process management (use Docker Compose for that)
- Auto-restart on crash (that's `tsx watch`'s job for code changes; service crashes from runtime errors should surface in logs)
- MemPalace lifecycle management (it's a separate Python process, not in this monorepo)
- Replacing `tsx watch` or `vite` with custom watch logic

## Decisions

### 1. Use `concurrently` for process orchestration

**Choice**: `concurrently` npm package  
**Alternatives considered**:
- `npm-run-all` / `run-p`: Less control over prefix colors, no built-in kill-others
- Custom Node script: More flexible but reinventing the wheel, harder to maintain
- `foreman` / `Procfile`: Tied to Heroku conventions, less configurable

**Rationale**: `concurrently` is battle-tested, supports prefix coloring, `--kill-others` for cascading shutdown, and custom prefixes. It's the standard choice for monorepo dev scripts.

### 2. Shared build as a prerequisite step

**Choice**: Run `pnpm --filter shared build` as a sequential first step before launching concurrent services  
**Alternatives considered**:
- Let each dev script fail and retry (poor DX — confusing error messages)
- Add a `predev` lifecycle hook (works but obscures the dependency)

**Rationale**: Since `shared` publishes to `dist/` and other packages import from there, it must be built once before any watch mode starts. Running it as a sequential step with a clear success message is the most transparent approach.

### 3. Service selection via npm script arguments

**Choice**: Use `concurrently` with named processes and support a `--only` flag pattern via environment variable or separate scripts  
**Alternatives considered**:
- Separate scripts for each combination (`dev:mcp+web`, `dev:agent+web`, etc.) — combinatoric explosion
- A custom Node.js orchestrator script — over-engineered

**Rationale**: `concurrently` supports `--names` and filtering by name. Using environment variable `SERVICES` or separate npm scripts for common combinations keeps it simple.

### 4. Keep `scripts/dev.sh` for backward compatibility

**Choice**: Simplify `scripts/dev.sh` to delegate to the new `pnpm dev` flow, keeping it as a thin wrapper  
**Rationale**: Existing documentation and Docker setups may reference `scripts/dev.sh`. Keeping it as a compatibility shim prevents breakage.

## Risks / Trade-offs

- **[Port conflicts]** If a service port is already in use, `concurrently` won't detect it upfront → Mitigation: Document expected ports; services will fail with clear "EADDRINUSE" errors from `tsx watch`
- **[Log noise]** Four services interleaving logs can be hard to read → Mitigation: `concurrently` prefixes each line with colored service name; can add `--timestamp` if needed
- **[Build staleness]** `pnpm --filter shared build` only runs once at startup → Mitigation: For shared package changes, developer restarts `pnpm dev` or runs `pnpm --filter shared build` manually. This matches the existing workflow since `tsx watch` in consumer packages will pick up the rebuilt `dist/` files.
- **[Windows compatibility]** `concurrently` works on Windows, but the `SERVICES` env-var pattern may not → Mitigation: Use separate npm scripts for common combos rather than relying on shell variable expansion