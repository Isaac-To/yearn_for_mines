## 1. Shared Config Module

- [x] 1.1 Add `dotenv` dependency to `packages/shared/package.json`
- [x] 1.2 Create `packages/shared/src/config.ts` with Zod schemas for all config sections (minecraft, mcpServer, agent, llm, mempalace, webUi) including all current env vars and new magic-number env vars (AGENT_MAX_ITERATIONS, AGENT_MAX_RETRIES, AGENT_MAX_OBSERVATION_TOKENS, AGENT_LOOP_DELAY_MS, LLM_MAX_TOKENS, LLM_TEMPERATURE, LLM_API_KEY)
- [x] 1.3 Implement `loadConfig()` function that calls `dotenv.config()`, validates env vars against schemas, and returns a frozen `Readonly<AppConfig>` object with clear error messages on validation failure
- [x] 1.4 Export config types and `loadConfig` from `packages/shared/src/index.ts` and `loadConfig` from `packages/shared/src/index.ts`

## 2. Package Entry Points

- [x] 2.1 Update `packages/agent/src/main.ts` to call `loadConfig()` and use typed config instead of all `process.env` reads
- [x] 2.2 Update `packages/mc-mcp-server/src/main.ts` to call `loadConfig()` and use typed config instead of all `process.env` reads
- [x] 2.3 Update `packages/web-ui/src/server-main.ts` to call `loadConfig()` and use typed config instead of all `process.env` reads

## 3. Magic Numbers

- [x] 3.1 Update `packages/agent/src/agent-loop.ts` — `DEFAULT_AGENT_CONFIG` defaults should match config schema values, and `main.ts` should pass config values into `AgentLoop` constructor
- [x] 3.2 Update `packages/shared/src/llm-client.ts` — `LlmClient` constructor should accept `apiKey` and use config defaults for `maxTokens` and `temperature`; add `Authorization` header when apiKey is set
- [x] 3.3 Update `packages/mc-mcp-server/src/observation-formatter.ts` — default value (2000) already matches config schema default; callers can pass `config.agent.maxObservationTokens` explicitly — `truncateObservation` default should reference config value

## 4. Discoverability

- [x] 4.1 Create root `.env.example` with all env vars, default values, and comments explaining each option with all env vars, default values, and comments explaining each option

## 5. Tests

- [x] 5.1 Add `packages/shared/src/__tests__/config.test.ts` — test schema validation, defaults, invalid input error messages, dotenv loading
- [x] 5.2 Update existing tests that use `process.env` directly to work with `loadConfig()` — no changes needed, existing tests construct objects manually without `process.env` that use `process.env` directly to work with `loadConfig()`
- [x] 5.3 Run full test suite (`pnpm -r run test`) and type checking (`pnpm -r run typecheck`) to verify no regressions