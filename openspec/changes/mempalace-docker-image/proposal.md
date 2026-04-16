## Why

The MemPalace service currently starts from `python:3.12-slim` and installs `mempalace` + `chromadb` via pip on every container launch. This adds ~30-60 seconds of startup latency and wastes bandwidth reinstalling packages each time. No official Docker image exists for MemPalace on Docker Hub, so we need to build our own.

## What Changes

- Add a `Dockerfile.mempalace` that pre-installs `mempalace` and `chromadb` into a layer, so containers start instantly
- Update `docker-compose.yml` to `build` from the new Dockerfile instead of running `pip install` in the command
- Remove the `pip install` command from the mempalace service definition
- Add `.dockerignore` entries if needed for the mempalace build context

## Capabilities

### New Capabilities
- `mempalace-container`: A pre-built Docker image for the MemPalace MCP server that starts in seconds instead of minutes, with health checks and data persistence

### Modified Capabilities
- `dev-orchestrator`: Docker Compose service definition for mempalace changes from `image: python:3.12-slim` + inline pip install to `build` from Dockerfile

## Impact

- **docker/docker-compose.yml**: mempalace service switches from `image` + `command` to `build` with Dockerfile
- **New file: docker/Dockerfile.mempalace**: Multi-stage or single-stage Dockerfile installing mempalace + chromadb
- **docker/.dockerignore**: May need updates for build context
- **Startup time**: Reduces from ~30-60s (pip install) to ~2-5s (pre-built image)
- **No API or dependency changes**: The service interface (MCP over Streamable HTTP on port 8080) remains identical