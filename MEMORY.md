# MemPalace action memory

Normal CLI and dashboard runs now use MemPalace as a persistent library of past actions and outcomes. Set `MCP_MEMPALACE_URL` to enable it. The default mode is `read-write`.

## What the agent remembers

Every episode records its goal, initial and last observed world state, Minecraft version, tool schema fingerprint, actual tool names and arguments, returned results, timings, recalled memory IDs, and final outcome. Each action is labeled completed, failed, skipped, or interrupted. A completed tool call is not proof that the whole goal succeeded.

Successful episodes explicitly record their verification method: `inventory` for exact item targets or `llm` for a model's judgment on a free-form goal. Failed and interrupted episodes are searchable counterexamples. Skipped actions are never labeled as executed. LLM reflection adds an advisory explanation and scoped facts; an invalid reflection does not discard the action evidence.

The planner receives relevant memories before its first action. Retrieval refreshes after failures, inventory changes, and every five iterations by default. Two local tools let it look up a specific subtask:

- `recall_memory(query, entities?)` searches successful episodes, counterexamples, and up to two knowledge-graph entities.
- `read_memory(id, offset?, limit?)` returns starting/final conditions and pages of actual actions from a retrieved memory. Long result text is marked truncated; the full result remains in the archive.

The planner adapts arguments to the current world and executes ordinary Minecraft tools. Historical coordinates, species, quantities, and prerequisites must be checked against current observations. Memory retrieval does not execute gameplay actions. Existing prose-only legacy drawers remain stored, but are not promoted to verified action recipes without compatible evidence from a new run.

## Persistence and outages

MemPalace stores searchable cards in `<namespace>-skills` or `<namespace>-failures` and complete, chunked episode records in `<namespace>-episodes`. Chunking respects MemPalace's drawer-size limit. Identical upload retries are content-addressed; different attempts at the same goal remain available, so improved strategies are not suppressed by goal-name deduplication.

The agent also writes atomic local progress checkpoints and an upload queue under `data/memory` (relative to the repository root). A forced process exit leaves an interrupted checkpoint; graceful completion replaces it with the final episode. Writes that cannot reach MemPalace remain `*.pending.json`; acknowledged uploads become `*.saved.json` audit copies. At the next writable session, the agent retries up to five pending episodes in that namespace. It never replays Minecraft actions when retrying memory writes.

Memory calls have deadlines and a short outage backoff. The dashboard's Memory Inspector shows readiness, retrieved/inspected/saved counts, queued writes, and errors. JSONL telemetry includes memory events and memory request counts/time alongside model and action metrics. Retrieval counts indicate exposure to evidence, not proof that memory caused success.

`pnpm --filter @yearn-for-mines/agent memory:status` checks the configured service and reports stored drawer and knowledge-graph counts.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `MCP_MEMPALACE_URL` | `.env.example`: `http://localhost:8081/mcp` | Empty disables integration. |
| `AGENT_MEMORY_MODE` | `read-write` | `off`, `read-only`, or `read-write`. Read-only does not flush pending writes or reflect into memory. |
| `AGENT_MEMORY_NAMESPACE` | `minecraft` | Separate learning libraries, e.g. `experiment-a`. |
| `AGENT_MEMORY_DIRECTORY` | `data/memory` | Local checkpoints, queued uploads, and audit copies. |
| `AGENT_MEMORY_RECALL_INTERVAL` | `5` | Periodic recall interval; failures/inventory changes also trigger recall. |
| `AGENT_MEMORY_REQUIRED` | `false` | Fail before planning if MemPalace is unavailable, and stop if later required retrieval fails. |

Memories are filtered by namespace, Minecraft version, and the actual tool schema fingerprint. The `minecraft-actions-v1` record contract additionally identifies the harness's action semantics. Bump the contract if action meaning changes without a schema change.

## Docker

The image pins MemPalace 3.10.0. The adapter explicitly supplies `--palace /data/palace` so both vector storage and the knowledge graph use the persistent volume; merely setting a data-directory variable did not persist both. Embeddings have their own persistent cache volume and are warmed before the HTTP endpoint starts. A new installation may take longer while downloading the local embedding model.

Build/start the service with:

```powershell
docker compose -f docker/docker-compose.yml up -d --build --wait mempalace
pnpm dev
```

The CLI and dashboard containers share the `agent-memory` queue volume. Run one controller per Minecraft bot. Keep the memory volumes between runs. If upgrading a previously used container, preserve its old files before recreating it: the former adapter could have stored data under `/root/.mempalace` or `/root/.config/mempalace` outside the volume. This change does not migrate or delete those existing files.

## Evaluating memory

Use the fresh-world protocol in [BENCHMARKS.md](BENCHMARKS.md). `BENCHMARK_MEMORY_MODE` accepts:

- `off`: no retrieval, reflection, or persistence; baseline.
- `cold`: a new automatically generated memory namespace, with reads and writes enabled. The printed namespace is the resulting training library.
- `warm`: requires `BENCHMARK_MEMORY_NAMESPACE` naming an existing library, and uses read-only memory so repeated evaluation does not train on its own test outcomes.

Use a fresh Minecraft world for each condition. Keep training and evaluation seeds separate when measuring generalization. Keep the model, version, tools, and settings constant. Include failures, memory errors, inference cost, and retrieval overhead; a success-rate or speed improvement still requires actual Minecraft trials.

The benchmark summary marks `memoryConditionValid=false` and returns a nonzero exit code if the enabled-memory condition has errors or pending uploads. Do not treat such runs as clean comparisons.

## Integration check

`pnpm --filter @yearn-for-mines/agent memory:smoke write` writes synthetic success/failure fixtures into a unique `smoke-*` namespace, then verifies semantic retrieval, exact actions, and learned facts. It uses `MEMORY_SMOKE_URL` (default `http://localhost:18081/mcp`). It does not call an LLM or control Minecraft. It keeps its manifest in `tmp/mempalace-smoke.json`.

Recreate the test service with the same volumes, then run `pnpm --filter @yearn-for-mines/agent memory:smoke read` to verify storage survived. Synthetic data is separated from gameplay memories by namespace and contract metadata.

The integration follows the [official MemPalace tool contracts](https://mempalaceofficial.com/reference/mcp-tools.html) and the pinned [3.10.0 release](https://pypi.org/project/mempalace/3.10.0/).

## Local migration and verification — October 8, 2026

The existing 3.3.1 service stored its data under `/root/.mempalace`. It was stopped for a consistent backup at `data/memory/migration-backup-20261008`, then its vector store and knowledge graph were copied into the persistent volume before activating 3.10.0. The live endpoint reports all 18 original drawers and 77 current facts. The backup remains available locally and is ignored by Git.

An isolated Docker integration test verified successful episodes, failure counterexamples, exact action arguments/results, and scoped facts before and after deleting/recreating the test container with the same volumes. No live Minecraft performance claim is implied by this synthetic test.
