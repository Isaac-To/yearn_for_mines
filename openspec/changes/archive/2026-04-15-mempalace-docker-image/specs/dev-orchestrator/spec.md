## MODIFIED Requirements

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