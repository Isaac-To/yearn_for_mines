## 1. Create Dockerfile

- [x] 1.1 Create `docker/Dockerfile.mempalace` — single-stage build from `python:3.12-slim` that installs `curl`, `mempalace`, `chromadb`, and `mcp` via pip, copies the streamable HTTP wrapper script, and exposes port 8080
- [x] 1.2 Add `.dockerignore` entries if needed for the mempalace build context — not needed (installs from PyPI)

## 2. Create streamable HTTP wrapper

- [x] 2.1 Create `docker/mempalace_http.py` — FastMCP wrapper that registers all mempalace tools and serves via streamable HTTP (the original `mempalace serve` command didn't exist; mempalace only supports stdio transport)
- [x] 2.2 Fix dict-to-string serialization: add `_s()` helper to JSON-serialize dict results from mempalace tool functions

## 3. Update Docker Compose

- [x] 3.1 Replace the `mempalace` service `image: python:3.12-slim` with `build` config pointing to `docker/Dockerfile.mempalace` with `context: ..`
- [x] 3.2 Remove the `pip install mempalace chromadb &&` from the mempalace service `command` — the CMD is now in the Dockerfile
- [x] 3.3 Update health check from `/health` (doesn't exist) to MCP `initialize` POST to `/mcp`

## 4. Verify

- [x] 4.1 Run `docker compose build mempalace` and confirm the image builds successfully
- [x] 4.2 Run `docker compose up mempalace` and confirm the container starts serving MCP requests immediately (no pip install delay)
- [x] 4.3 Confirm the health check passes
- [x] 4.4 Confirm MCP tool calls work via the `/mcp` endpoint