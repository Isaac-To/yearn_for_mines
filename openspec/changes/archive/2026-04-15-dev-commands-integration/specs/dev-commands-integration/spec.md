## ADDED Requirements

### Requirement: Dev commands auto-start Minecraft server and MemPalace
The system SHALL auto-start both the Minecraft server and MemPalace Docker containers when any full-stack dev command is run (`pnpm dev`, `pnpm dev:webstack`, `pnpm dev:all`, `pnpm dev:all:agent`). The auto-start SHALL use `docker compose up minecraft-server mempalace --wait -d` so that both services are healthy before Node.js services begin.

#### Scenario: Developer runs pnpm dev on cold start
- **WHEN** a developer runs `pnpm dev` and no Docker containers are running
- **THEN** Docker compose starts the Minecraft server and MemPalace containers, waits for both health checks to pass, then launches the shared build and downstream Node.js services

#### Scenario: Developer runs pnpm dev when containers already running
- **WHEN** a developer runs `pnpm dev` and both Minecraft server and MemPalace containers are already running and healthy
- **THEN** Docker compose detects the running containers and proceeds immediately without re-creating them, then launches the shared build and downstream Node.js services

#### Scenario: Developer runs pnpm dev:webstack
- **WHEN** a developer runs `pnpm dev:webstack`
- **THEN** Docker compose starts and health-checks both Minecraft server and MemPalace containers before launching the shared build, MCP server, and web UI

### Requirement: Docker compose --wait gates on health checks
The dev commands SHALL use `docker compose up --wait -d` for infrastructure containers so that dependent services only start after health checks pass. This ensures the MC MCP server does not attempt to connect to Minecraft before the server is ready.

#### Scenario: Minecraft server takes time to start
- **WHEN** the Minecraft server container starts but its health check has not yet passed
- **THEN** the `--wait` flag blocks the dev command until the health check succeeds, and progress output is visible in the terminal

#### Scenario: Minecraft server health check fails
- **WHEN** the Minecraft server container starts but its health check never passes within the retry limit
- **THEN** the dev command exits with a non-zero status code and does not launch downstream services

### Requirement: Convenience script for Minecraft server only
The system SHALL provide a `pnpm dev:minecraft` script that starts only the Minecraft server Docker container with `docker compose up minecraft-server -d`.

#### Scenario: Developer runs pnpm dev:minecraft
- **WHEN** a developer runs `pnpm dev:minecraft`
- **THEN** only the Minecraft server container starts (detached), without MemPalace or any Node.js services

### Requirement: Documentation reflects single-command dev experience
The README SHALL document that `pnpm dev` starts all required infrastructure (Minecraft server, MemPalace) automatically. The CLAUDE.md Commands section SHALL list `pnpm dev:minecraft` and note that `pnpm dev` auto-starts Docker services.

#### Scenario: New developer reads README
- **WHEN** a new developer reads the README
- **THEN** the Getting Started section shows `pnpm dev` as the single command to start the full development environment, and notes the Docker requirement

#### Scenario: Developer checks CLAUDE.md for commands
- **WHEN** a developer reads the CLAUDE.md Commands section
- **THEN** the `pnpm dev:minecraft` script is listed and `pnpm dev` is documented as auto-starting Minecraft and MemPalace containers

### Requirement: Auto-create .env from .env.example on install
The system SHALL automatically create a `.env` file from `.env.example` via a `postinstall` hook when `pnpm install` is run and `.env` does not already exist. If `.env` already exists, the hook SHALL do nothing and not overwrite it.

#### Scenario: New developer runs pnpm install with no .env
- **WHEN** a developer runs `pnpm install` and `.env` does not exist
- **THEN** `.env.example` is copied to `.env` and a message is printed indicating the file was created

#### Scenario: Developer runs pnpm install with existing .env
- **WHEN** a developer runs `pnpm install` and `.env` already exists
- **THEN** the postinstall hook does nothing and does not modify the existing `.env`

### Requirement: LLM model validation at agent startup
The agent SHALL validate that the configured `LLM_MODEL` is available in the local Ollama instance before starting the agent loop. If the model is not found, the agent SHALL print an error message with the exact `ollama pull <model>` command and exit with a non-zero status code. If the LLM base URL does not point to Ollama (does not contain `localhost:11434`), the check SHALL be skipped.

#### Scenario: Model is available in Ollama
- **WHEN** the agent starts and `LLM_MODEL` is available in Ollama's model list
- **THEN** the agent proceeds to start normally

#### Scenario: Model is not available in Ollama
- **WHEN** the agent starts and `LLM_MODEL` is not found in Ollama's model list
- **THEN** the agent prints an error: "Model '<model>' not found in Ollama. Run: ollama pull <model>" and exits with code 1

#### Scenario: Ollama is not running
- **WHEN** the agent starts and Ollama is not reachable at the configured URL
- **THEN** the agent prints an error: "Cannot reach Ollama at <url>. Is Ollama running?" and exits with code 1

#### Scenario: Non-Ollama LLM provider
- **WHEN** the agent starts and `LLM_BASE_URL` does not point to Ollama (e.g., OpenAI, Anthropic)
- **THEN** the model availability check is skipped and the agent proceeds normally

### Requirement: Docker reset convenience command
The system SHALL provide a `pnpm docker:reset` script that removes the `minecraft-data` and `mempalace-data` Docker volumes, giving the developer a clean slate for world state and memory.

#### Scenario: Developer runs pnpm docker:reset
- **WHEN** a developer runs `pnpm docker:reset`
- **THEN** the `minecraft-data` and `mempalace-data` Docker volumes are removed, resetting Minecraft world state and MemPalace memory

#### Scenario: Volumes do not exist
- **WHEN** a developer runs `pnpm docker:reset` and the volumes do not exist
- **THEN** the command completes without error (Docker volume rm on a non-existent volume is a no-op with `--force` or the command handles the missing volume gracefully)

### Requirement: Remove deprecated scripts/dev.sh
The `scripts/dev.sh` file SHALL be deleted. The `pnpm dev:all` and `pnpm dev:all:agent` scripts SHALL be updated to use the `concurrently`-based pattern directly in `package.json` instead of delegating to the shell script.

#### Scenario: dev:all works without scripts/dev.sh
- **WHEN** a developer runs `pnpm dev:all`
- **THEN** the same behavior as before is achieved (MCP server + web UI started concurrently) but without invoking scripts/dev.sh

#### Scenario: dev:all:agent works without scripts/dev.sh
- **WHEN** a developer runs `pnpm dev:all:agent`
- **THEN** the same behavior as before is achieved (MCP server + web UI + agent started concurrently) but without invoking scripts/dev.sh