## MODIFIED Requirements

### Requirement: Single command starts all dev services
The system SHALL provide a `pnpm dev` command that starts all development services with a single invocation. Docker Compose SHALL build the MemPalace image from a local Dockerfile instead of pulling `python:3.12-slim` and installing packages at runtime. Docker Compose SHALL also start and health-check the Minecraft server container before launching Node.js services.

#### Scenario: Developer runs pnpm dev
- **WHEN** a developer runs `pnpm dev`
- **THEN** Docker compose starts the Minecraft server and MemPalace containers with `--wait`, the shared package is built first, then MCP server, web UI, and agent start concurrently with hot reload enabled

#### Scenario: Developer runs pnpm dev:webstack
- **WHEN** a developer runs `pnpm dev:webstack`
- **THEN** Docker compose starts the Minecraft server and MemPalace containers with `--wait`, the shared package is built first, then only MCP server and web UI start (no agent process)

#### Scenario: Docker Compose builds MemPalace from Dockerfile
- **WHEN** `docker compose up` or `docker compose build` is run
- **THEN** the MemPalace service builds from `docker/Dockerfile.mempalace` instead of using `image: python:3.12-slim` with an inline `pip install` command

### Requirement: Selective service control
The system SHALL support running a subset of services for targeted development workflows. Individual dev scripts (`pnpm dev:mcp`, `pnpm dev:agent`, `pnpm dev:web`) SHALL continue to work unchanged. A `pnpm dev:minecraft` script SHALL start only the Minecraft server container.

#### Scenario: Run only MCP server and web UI
- **WHEN** a developer runs `pnpm dev:webstack`
- **THEN** only the MCP server and web UI are started with hot reload, without the agent

#### Scenario: Run all services including agent
- **WHEN** a developer runs `pnpm dev`
- **THEN** all services including the agent are started with hot reload

#### Scenario: Run only Minecraft server
- **WHEN** a developer runs `pnpm dev:minecraft`
- **THEN** only the Minecraft server Docker container starts in detached mode

### Requirement: Startup ordering and prerequisite build
The orchestrator SHALL build the shared package as a sequential prerequisite before launching any watch-mode services. The orchestrator SHALL also auto-create `.env` from `.env.example` via a postinstall hook if `.env` does not exist.

#### Scenario: Shared package build succeeds
- **WHEN** `pnpm dev` is run and the shared package build completes successfully
- **THEN** all downstream services are launched concurrently

#### Scenario: Shared package build fails
- **WHEN** `pnpm dev` is run and the shared package build fails
- **THEN** no downstream services are started and the command exits with a non-zero status code

#### Scenario: .env auto-created on pnpm install
- **WHEN** `pnpm install` is run and `.env` does not exist
- **THEN** `.env` is created from `.env.example` and a message is printed

#### Scenario: .env not overwritten if it exists
- **WHEN** `pnpm install` is run and `.env` already exists
- **THEN** the postinstall hook does nothing