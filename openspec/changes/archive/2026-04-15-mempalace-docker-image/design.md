## Context

MemPalace is the agent's memory subsystem — a Python package (`mempalace`) that runs as an MCP server over Streamable HTTP. Currently, the `docker-compose.yml` starts it from `python:3.12-slim` and runs `pip install mempalace chromadb` on every container launch. This takes 30-60 seconds and is wasteful since the packages don't change between restarts.

No official Docker image exists for MemPalace on Docker Hub or GitHub Container Registry. The [official repo](https://github.com/MemPalace/mempalace) only provides pip-based installation.

## Goals / Non-Goals

**Goals:**
- Pre-install `mempalace` and `chromadb` into a Docker image layer so containers start in seconds
- Keep the service interface identical: MCP over Streamable HTTP on port 8080, data persisted in a volume
- Minimize image size and build time
- Follow the same Dockerfile patterns used by the other services in this project (`Dockerfile.mc-mcp-server`, `Dockerfile.agent`, `Dockerfile.web-ui`)

**Non-Goals:**
- Publishing the image to a container registry (keep it local-only for now)
- Changing the MemPalace configuration, API, or MCP tool interface
- Multi-arch builds (arm64/amd64) — not needed for current development workflow
- Version pinning beyond what the pip default provides (can add later)

## Decisions

### 1. Single-stage Dockerfile based on `python:3.12-slim`

**Decision**: Use a single-stage build from `python:3.12-slim` that installs `mempalace` and `chromadb` via pip.

**Rationale**: MemPalace is a pure-Python package with no native compilation step. A multi-stage build adds complexity without reducing the final image size since there's no build artifact to discard. `python:3.12-slim` is already the base used in the current compose setup.

**Alternatives considered**:
- **Multi-stage build**: Unnecessary — no compiled artifacts to separate from runtime
- **Alpine-based image**: `chromadb` has dependencies that don't play well with Alpine (glibc vs musl), and the size savings are minimal compared to the compatibility risk
- **`ubuntu` base**: Larger than `python:3.12-slim` for no benefit

### 2. Use `mempalace serve` as the CMD

**Decision**: Set `CMD ["mempalace", "serve", "--transport", "streamable-http", "--port", "8080"]` in the Dockerfile and remove the command from `docker-compose.yml`.

**Rationale**: The command is deterministic and never changes between environments. The port and transport are baked into the image, matching the current compose setup. Only `MEMPALACE_DATA_DIR` needs to stay as an environment variable since it points to a volume mount path.

### 3. Build from project root context

**Decision**: Use `context: ..` and `dockerfile: docker/Dockerfile.mempalace` in `docker-compose.yml`, matching the pattern used by `mc-mcp-server`, `agent`, and `web-ui`.

**Rationale**: Consistency with existing services. No Python source code needs to be copied into the image (we install from PyPI), but keeping the same context pattern makes the compose file uniform.

### 4. Keep health check in compose

**Decision**: Leave the `healthcheck` configuration in `docker-compose.yml` rather than baking it into the Dockerfile.

**Rationale**: Health checks are environment-specific (different orchestration tools may want different intervals). Docker Compose is the right place for this. Also, `curl` needs to be available in the image for the health check — we'll install it.

## Risks / Trade-offs

- **[Image size]** `chromadb` pulls in heavy dependencies (including ONNX runtime for embeddings). The image will be ~500MB+. → *Mitigation*: Accept this for now; it's a one-time build cost and the running container is fast. Could optimize later with a custom ChromaDB server or by excluding unused embeddings models.
- **[No version pinning]** Currently `pip install mempalace chromadb` installs the latest version. → *Mitigation*: Accept for now; add version pinning (`mempalace==3.3.0 chromadb>=0.4.0`) in a follow-up if reproducibility becomes important.
- **[No curl in slim image]** `python:3.12-slim` doesn't include `curl`, which the health check needs. → *Mitigation*: Install `curl` via `apt-get` in the Dockerfile (adds ~1MB).