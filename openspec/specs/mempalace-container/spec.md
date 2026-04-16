## Requirements

### Requirement: Pre-built Docker image for MemPalace
The system SHALL provide a Dockerfile (`docker/Dockerfile.mempalace`) that builds a Docker image with `mempalace` and `chromadb` pre-installed, so that containers start without running `pip install` at runtime.

#### Scenario: Building the MemPalace image
- **WHEN** `docker build -f docker/Dockerfile.mempalace ..` is run
- **THEN** the resulting image contains `mempalace` and `chromadb` installed via pip, with `curl` available for health checks, and `mempalace serve` as the default command

#### Scenario: Starting the MemPalace container
- **WHEN** the MemPalace container starts
- **THEN** it immediately begins serving MCP requests over Streamable HTTP on port 8080 without any package installation delay

### Requirement: MemPalace container starts with streamable-http transport
The Dockerfile SHALL set the default CMD to `mempalace serve --transport streamable-http --port 8080`.

#### Scenario: Default container command
- **WHEN** the container starts without overriding the command
- **THEN** it runs `mempalace serve --transport streamable-http --port 8080`

### Requirement: Data persistence via environment variable
The container SHALL respect the `MEMPALACE_DATA_DIR` environment variable for persisting data to a volume mount.

#### Scenario: Data is persisted across restarts
- **WHEN** the container is started with `MEMPALACE_DATA_DIR=/data` and a volume mounted at `/data`
- **THEN** MemPalace stores its data in `/data` and the data survives container restarts

### Requirement: Health check support
The Docker image SHALL include `curl` so that Docker health checks can probe the `/health` endpoint.

#### Scenario: Health check curl
- **WHEN** `curl -f http://localhost:8080/health` is executed inside the container
- **THEN** it returns a successful response if MemPalace is running

### Requirement: Build context consistency
The Dockerfile SHALL be located at `docker/Dockerfile.mempalace` and build from the project root context (`..`), consistent with the other service Dockerfiles.

#### Scenario: Docker compose build
- **WHEN** `docker compose build mempalace` is run from the `docker/` directory
- **THEN** the image is built using `context: ..` and `dockerfile: docker/Dockerfile.mempalace`