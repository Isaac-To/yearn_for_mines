## ADDED Requirements

### Requirement: Single command starts all dev services
The system SHALL provide a `pnpm dev` command that starts all development services (shared build, MCP server, web UI, agent) with a single invocation. Docker Compose SHALL build the MemPalace image from a local Dockerfile instead of pulling `python:3.12-slim` and installing packages at runtime.

#### Scenario: Developer runs pnpm dev
- **WHEN** a developer runs `pnpm dev`
- **THEN** the shared package is built first, then MCP server, web UI, and agent start concurrently with hot reload enabled

#### Scenario: Developer runs pnpm dev:webstack
- **WHEN** a developer runs `pnpm dev:webstack`
- **THEN** the shared package is built first, then only MCP server and web UI start (no agent process)

#### Scenario: Docker Compose builds MemPalace from Dockerfile
- **WHEN** `docker compose up` or `docker compose build` is run
- **THEN** the MemPalace service builds from `docker/Dockerfile.mempalace` instead of using `image: python:3.12-slim` with an inline `pip install` command

### Requirement: Startup ordering and prerequisite build
The orchestrator SHALL build the shared package as a sequential prerequisite before launching any watch-mode services.

#### Scenario: Shared package build succeeds
- **WHEN** `pnpm dev` is run and the shared package build completes successfully
- **THEN** all downstream services are launched concurrently

#### Scenario: Shared package build fails
- **WHEN** `pnpm dev` is run and the shared package build fails
- **THEN** no downstream services are started and the command exits with a non-zero status code

### Requirement: Color-coded log output
Each service's log output SHALL be prefixed with a color-coded service name for easy identification in interleaved output.

#### Scenario: Logs from multiple services appear interleaved
- **WHEN** multiple services are running and producing log output
- **THEN** each line is prefixed with the service name (e.g., `[mcp]`, `[web]`, `[agent]`) and the prefix is color-coded per service

### Requirement: Graceful shutdown
Pressing Ctrl+C SHALL terminate all running services cleanly without leaving orphan processes, and SHALL propagate the signal through `concurrently` to each child process so that each process's own shutdown handler runs.

#### Scenario: Developer presses Ctrl+C
- **WHEN** a developer presses Ctrl+C while `pnpm dev` is running
- **THEN** concurrently propagates SIGINT to all child processes, each child process runs its own shutdown handler, and the command exits cleanly

#### Scenario: One service crashes
- **WHEN** one service exits with a non-zero status code
- **THEN** all other services are terminated (kill-others behavior) and each service's shutdown handler runs

#### Scenario: Shutdown completes within timeout
- **WHEN** all child processes complete their shutdown handlers within 10 seconds
- **THEN** the orchestrator exits cleanly with code 0

#### Scenario: Shutdown times out
- **WHEN** one or more child processes do not complete shutdown within the grace period
- **THEN** the orchestrator forces termination and exits with code 1

### Requirement: Selective service control
The system SHALL support running a subset of services for targeted development workflows.

#### Scenario: Run only MCP server and web UI
- **WHEN** a developer runs `pnpm dev:webstack`
- **THEN** only the MCP server and web UI are started with hot reload, without the agent

#### Scenario: Run all services including agent
- **WHEN** a developer runs `pnpm dev`
- **THEN** all services including the agent are started with hot reload

### Requirement: Preserve individual dev scripts
The existing `pnpm dev:mcp`, `pnpm dev:agent`, and `pnpm dev:web` scripts SHALL continue to work unchanged for single-service development.

#### Scenario: Developer runs single-service dev script
- **WHEN** a developer runs `pnpm dev:mcp` in an isolated terminal
- **THEN** only the MCP server starts with hot reload, identical to the current behavior