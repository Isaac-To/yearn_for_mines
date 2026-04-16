## Context

Yearn for Mines is a TypeScript monorepo with four packages (shared, mc-mcp-server, agent, web-ui). Configuration currently lives as scattered `process.env` reads with inline defaults in each package's `main.ts`, duplicated defaults in `scripts/dev.sh` and `docker-compose.yml`, and magic numbers hardcoded in `agent-loop.ts`, `llm-client.ts`, and `observation-formatter.ts`. There is no validation, no `.env` file, and no discoverability for new users.

## Goals / Non-Goals

**Goals:**
- Single source of truth for all configuration: env var names, defaults, types, and validation
- Catch misconfiguration at startup (typos, missing required values, invalid types)
- Make all magic numbers configurable through env vars
- Provide a `.env.example` that documents every option
- Minimal changes to existing package interfaces — config replaces scattered reads, not architectural patterns

**Non-Goals:**
- Config file formats (YAML, TOML, JSON) — env vars + `.env` are sufficient for this project
- Hot-reloading config at runtime — all config is read once at startup
- Config profiles/presets (dev, prod, docker) — `.env` files and docker-compose env sections handle this
- CLI argument parsing — the agent goal could become a CLI arg, but that's a separate change
- Web UI for configuration — out of scope

## Decisions

### D1: Zod schemas in the shared package

**Decision**: Define all config as Zod schemas in `packages/shared/src/config.ts`, validated and exported as typed objects.

**Why Zod**: Already a project dependency used for MCP tool input validation. Provides runtime validation, TypeScript type inference, and descriptive error messages in one tool. No new dependency category needed.

**Alternatives considered**:
- Plain TypeScript interfaces — no runtime validation, typos in env vars silently fall through to defaults
- `convict` or `node-config` — heavier than needed, adds dependency categories the project doesn't use
- JSON schema — verbose, no TypeScript inference without extra tooling

### D2: Flat env var names with namespaced prefixes

**Decision**: Keep the existing env var naming convention (`MC_HOST`, `MCP_PORT`, `LLM_MODEL`, etc.) rather than introducing nested prefixes like `AGENT__MAX_ITERATIONS`.

**Why**: All env var names are already established and documented in scripts/dev.sh and docker-compose.yml. Renaming them would be a breaking change for anyone using docker-compose or custom .env files. New vars follow existing patterns (e.g., `AGENT_MAX_ITERATIONS`, `LLM_MAX_TOKENS`).

### D3: `.env.example` with dotenv, not config files

**Decision**: Use `dotenv` to load `.env` files at startup. Ship `.env.example` as documentation. No YAML/JSON config files.

**Why**: The project already uses env vars exclusively. `.env` is the standard Node.js approach. Adding a config file format would add a dependency and complexity for no real benefit — all values are flat key-value pairs, not nested structures.

**Alternatives considered**:
- `config/` directory with YAML/JSON — adds yaml parser dep, over-engineering for flat config
- `rc` files — not conventional for Node.js services

### D4: `loadConfig()` returns a frozen, validated object

**Decision**: `loadConfig()` reads env vars (via `dotenv`), validates through Zod schemas, and returns a `Readonly<AppConfig>` object. Call it once per process at startup.

**Why**: Freezing prevents accidental mutation. Single call means validation happens once. Typed return means consuming code never touches `process.env` directly.

### D5: Config schema structure mirrors package boundaries

**Decision**: The config object has named sections matching the packages that consume them:

```
AppConfig {
  minecraft: { host, port, username, version, auth }
  mcpServer: { port, host }
  agent: { goal, maxIterations, maxRetries, maxObservationTokens, enableVlm, loopDelayMs }
  llm: { baseUrl, model, visionModel, apiKey, maxTokens, temperature }
  mempalace: { url }
  webUi: { port, mcMcpUrl }
}
```

**Why**: Each package imports only the section it needs (e.g., `config.mcpServer`), keeping coupling clear. Sections are named after the domain, not after env var prefixes, because `mcpServer` is more readable than `mcp`.

## Risks / Trade-offs

**dotenv load order** → `dotenv` must be called before any code reads `process.env`. The shared `loadConfig()` function handles this, but it MUST be called at the top of each `main.ts` before any other imports that might read env vars.

**Breaking change for docker-compose users** → If we rename env vars, docker-compose env sections break. Mitigation: keep all existing env var names exactly as they are. New env vars are additions, not renames.

**Config bloat** → Every magic number exposed as env var makes `.env.example` longer. Mitigation: only surface values that users meaningfully want to change. Internal thresholds that never need tuning stay as Zod defaults without env var exposure.

**Zod in shared package** → Adding more Zod to shared increases bundle size for the web-ui client bundle. Mitigation: config is server-only code — it reads env vars and won't be imported in browser bundles.