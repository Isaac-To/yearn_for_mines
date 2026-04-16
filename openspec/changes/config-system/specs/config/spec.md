## ADDED Requirements

### Requirement: Config schema defines all application settings
The system SHALL define a Zod-validated config schema in `packages/shared/src/config.ts` that covers all configurable values across all packages: minecraft connection settings, MCP server settings, agent behavior settings, LLM settings, MemPalace URL, and web UI settings. Each field SHALL have a default value and a human-readable description.

#### Scenario: All current env vars are represented
- **WHEN** the config schema is defined
- **THEN** every env var currently read via `process.env` in `agent/main.ts`, `mc-mcp-server/main.ts`, and `web-ui/server-main.ts` SHALL have a corresponding field in the config schema with the same env var name and same default value

#### Scenario: Magic numbers are configurable
- **WHEN** the config schema is defined
- **THEN** `maxIterations` (default 100), `maxRetries` (default 3), `maxObservationTokens` (default 2000), `loopDelayMs` (default 500), `maxTokens` (default 2048), and `temperature` (default 0.7) SHALL each have a corresponding env var (`AGENT_MAX_ITERATIONS`, `AGENT_MAX_RETRIES`, `AGENT_MAX_OBSERVATION_TOKENS`, `AGENT_LOOP_DELAY_MS`, `LLM_MAX_TOKENS`, `LLM_TEMPERATURE`)

### Requirement: loadConfig validates and returns typed config
The system SHALL export a `loadConfig()` function from `@yearn-for-mines/shared` that loads env vars via `dotenv`, validates them against the Zod schema, and returns a frozen, typed `AppConfig` object. Validation errors SHALL produce clear messages listing which env vars are invalid and why.

#### Scenario: Valid configuration loads successfully
- **WHEN** `loadConfig()` is called with valid env vars set
- **THEN** it SHALL return a `Readonly<AppConfig>` object with all values populated from env vars or defaults

#### Scenario: Invalid configuration fails with clear error
- **WHEN** `loadConfig()` is called with an env var that fails Zod validation (e.g., `MCP_PORT=not-a-number`)
- **THEN** it SHALL throw an error listing the invalid field, the expected type, and the provided value

#### Scenario: Missing optional config uses defaults
- **WHEN** `loadConfig()` is called with no env vars set
- **THEN** it SHALL return an `AppConfig` with all default values populated (matching current hardcoded defaults)

### Requirement: Packages use shared config instead of process.env
Each package (`agent`, `mc-mcp-server`, `web-ui`) SHALL replace all direct `process.env` reads in its entry point with the typed config object from `loadConfig()`. No package entry point SHALL read `process.env` directly for values covered by the config schema.

#### Scenario: Agent uses shared config
- **WHEN** `packages/agent/src/main.ts` starts
- **THEN** it SHALL call `loadConfig()` and use `config.mcp.mcUrl`, `config.mempalace.url`, `config.llm.baseUrl`, `config.llm.model`, `config.llm.visionModel`, `config.llm.apiKey`, `config.agent.goal` instead of `process.env` reads

#### Scenario: MC MCP server uses shared config
- **WHEN** `packages/mc-mcp-server/src/main.ts` starts
- **THEN** it SHALL call `loadConfig()` and use `config.minecraft`, `config.mcpServer` instead of `process.env` reads

#### Scenario: Web UI uses shared config
- **WHEN** `packages/web-ui/src/server-main.ts` starts
- **THEN** it SHALL call `loadConfig()` and use `config.webUi` instead of `process.env` reads

### Requirement: Agent loop receives config values
`AgentLoopConfig` defaults and `LlmClientOptions` defaults SHALL be populated from the shared config rather than hardcoded in implementation files.

#### Scenario: Agent loop config from shared
- **WHEN** an `AgentLoop` is created without specifying `maxIterations`, `maxRetries`, `maxObservationTokens`, or `loopDelayMs`
- **THEN** it SHALL use the defaults from the config schema (100, 3, 2000, 500 respectively)

#### Scenario: LLM client config from shared
- **WHEN** an `LlmClient` is created without specifying `maxTokens` or `temperature`
- **THEN** it SHALL use the defaults from the config schema (2048, 0.7 respectively)

### Requirement: .env.example documents all configuration
The repository SHALL include a `.env.example` file at the root listing every configurable env var with its default value and a comment describing what it controls. This file SHALL be the single reference for users setting up the project.

#### Scenario: New user discovers configuration
- **WHEN** a user copies `.env.example` to `.env`
- **THEN** the resulting `.env` file SHALL contain all configurable values with sensible defaults, allowing the project to run without modification for local development with Ollama

### Requirement: LLM API key support
The config schema SHALL include an optional `LLM_API_KEY` env var. When set, the LLM client SHALL include it as a Bearer token in the `Authorization` header for all API requests. When not set, no authorization header SHALL be sent (compatible with local Ollama).

#### Scenario: API key provided
- **WHEN** `LLM_API_KEY` is set in the environment
- **THEN** the `LlmClient` SHALL send `Authorization: Bearer <key>` with every request

#### Scenario: No API key (Ollama local)
- **WHEN** `LLM_API_KEY` is not set
- **THEN** the `LlmClient` SHALL send requests without an `Authorization` header