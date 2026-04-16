## 1. Create Dockerfile

- [x] 1.1 Create `docker/Dockerfile.mempalace` — single-stage build from `python:3.12-slim` that installs `curl`, `mempalace`, and `chromadb` via pip, sets `CMD` to `mempalace serve --transport streamable-http --port 8080`, and exposes port 8080
- [x] 1.2 Add `.dockerignore` entries if needed for the mempalace build context

## 2. Update Docker Compose

- [x] 2.1 Replace the `mempalace` service `image: python:3.12-slim` with `build` config pointing to `docker/Dockerfile.mempalace` with `context: ..`
- [x] 2.2 Remove the `pip install mempalace chromadb &&` from the mempalace service `command` — the CMD is now in the Dockerfile
- [x] 2.3 Keep `environment` (`MEMPALACE_DATA_DIR`), `volumes`, `ports`, and `healthcheck` as-is

## 3. Verify

- [ ] 3.1 Run `docker compose build mempalace` and confirm the image builds successfully
- [ ] 3.2 Run `docker compose up mempalace` and confirm the container starts serving MCP requests immediately (no pip install delay)
- [ ] 3.3 Confirm the health check passes (`curl -f http://localhost:8081/health` from the host)
- [ ] 3.4 Run the full stack with `docker compose up` and confirm the agent can connect to MemPalace