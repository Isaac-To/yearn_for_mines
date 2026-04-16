## Why

Configuration is scattered across four packages with hardcoded defaults duplicated in `scripts/dev.sh`, `docker-compose.yml`, and each `main.ts` entry point. There's no validation (typos silently use defaults), no discoverability (users must read source to learn what's configurable), and magic numbers (max iterations, LLM temperature, token limits) are buried in implementation files. A new user currently has no `.env.example` or single reference for what they can configure.

## What Changes

- Add a Zod-validated config module to the `shared` package that serves as the single source of truth for all configuration
- Define typed config schemas covering minecraft, mcp-server, agent, llm, mempalace, and web-ui settings — with defaults, descriptions, and validation
- Add `dotenv` to load `.env` files, validated through the Zod schema
- Ship a `.env.example` with documented defaults for every configurable value
- Replace all scattered `process.env` reads and inline defaults in `agent/main.ts`, `mc-mcp-server/main.ts`, and `web-ui/server-main.ts` with imports from the shared config
- Surface magic numbers from `agent-loop.ts` (maxIterations, maxRetries, loopDelayMs), `llm-client.ts` (maxTokens, temperature), and `observation-formatter.ts` (maxObservationTokens) as configurable values
- Add `LLM_API_KEY` support for OpenAI-compatible endpoints that require authentication

## Capabilities

### New Capabilities
- `config`: Zod-validated, typed configuration module in the shared package — single source of truth for all env vars, defaults, magic numbers, and validation

### Modified Capabilities
<!-- No existing specs to modify — this is a new project with no prior specs -->

## Impact

- **shared package**: New `config.ts` module with Zod schemas, `loadConfig()` function, and exported types
- **agent package**: `main.ts` and `agent-loop.ts` replace inline defaults with shared config
- **mc-mcp-server package**: `main.ts` replaces inline defaults with shared config
- **web-ui package**: `server-main.ts` replaces inline defaults with shared config
- **shared/llm-client.ts**: `LlmClientOptions` picks up defaults from config rather than hardcoded values
- **Dependencies**: Add `dotenv` to the shared package
- **Root**: New `.env.example` file for discoverability
- **docker-compose.yml**: Environment section stays as-is (it overrides env vars, which config reads)
- **scripts/dev.sh**: Simplifies — can still set env vars, but defaults come from config schema