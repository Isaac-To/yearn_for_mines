# Harness improvements and performance evaluation

The project report prioritizes reliable wooden-to-diamond tool acquisition, fewer planning iterations, and lower inference cost. This change fixes execution and measurement defects before making any speed or success-rate claim. The report's baseline column measures prompting iterations; it must not be relabeled as LLM API calls.

## Implemented changes

| Area | Corrected behavior |
| --- | --- |
| Crafting | `amount` means final inventory count. Existing items and recipe yield determine craft executions. The macro alias shares the same implementation. Tables are reused. |
| Gathering | Repeated small batches continue to the total target. `logs` accepts any tree species; exact log IDs require that species. Dry targets are preferred by filtering submerged targets. |
| Search | Loaded sections are visited in distance order, palette-pruned where possible, and retain only the nearest requested matches. Distance is checked before predicates. Radius is capped at 128 and retained results at 128; gathering uses at most 64 blocks. |
| Smelting | One fuel table drives validation; input logs are reserved before choosing fuel. Full requested output determines success. Wait budgets scale with quantity. Furnace windows close on failure. |
| Failure handling | Failed and partial actions set `isError`. Dependent batch actions are skipped with explicit replies. The next plan handles missing prerequisites; unchanged mutations are not blindly retried. |
| Cancellation | MCP deadlines reach server actions. One action owns the bot until its underlying operation settles, including after cancellation. Movement, digging, collection, and windows are stopped. Late guarded mutations cannot restart cancelled work. |
| Context | Pruning removes complete observation/assistant/tool turns. Stalls ignore changing call IDs. Tool schemas are not duplicated in full in the system prompt. Aliases are omitted; memory-enabled runs expose bounded recall/read tools. |
| Observation | Status includes food, oxygen, held item, effects, local terrain, weather/time, and recent important events. Full core-tool outcomes retain inventory and missing prerequisites. |
| Memory | Full action episodes, success verification, failure counterexamples, mid-run recall, scoped facts, local checkpoints and queued uploads. See [MEMORY.md](MEMORY.md) for configuration and live persistence checks. |
| Goals | `AGENT_GOAL_ITEMS` verifies exact inventory totals from current connected state, without an extra LLM verifier. Free-form goals retain periodic LLM verification. |
| Telemetry | JSONL logs distinguish iterations, every attempted LLM call including failures and reflection, reported input/output tokens, inference time, action time, and goal outcome. Missing token usage is marked incomplete. |
| Runtime | Process environment overrides `.env`; MC/MCP addresses are honored. Docker builds shared dependencies and includes the install helper. The dashboard runs and controls a real agent; dev startup includes its backend. |
| Vision | Rendering is lazy and uses an explicit PNG frame renderer with disposal. Missing native dependencies produce a capability error, then the agent continues with structured observations. |

`AGENT_MAX_CONTEXT_TOKENS` uses a character estimate to prune older turns, not a provider tokenizer. A single very large current turn can exceed the estimate. Preserve model context headroom when selecting this setting.

## Running the harness

Run `pnpm dev` for the MCP server, dashboard backend, and Vite UI. Start a goal in the dashboard. Pause takes effect at the next iteration boundary; Stop aborts the current request. `pnpm dev:all:agent` runs a CLI-controlled agent instead. Run one controller against a bot at a time.

Docker defaults to dashboard control. For a CLI-controlled agent, use `docker compose -f docker/docker-compose.yml --profile cli-agent up --build`. Do not start a second dashboard-controlled agent against that same bot.

For an inventory goal, set these variables before starting the agent:

```powershell
$env:AGENT_GOAL = 'Obtain one iron pickaxe'
$env:AGENT_GOAL_ITEMS = '{"iron_pickaxe":1}'
$env:AGENT_TELEMETRY_FILE = Join-Path (Get-Location) 'results/iron-trial-1.jsonl'
```

Targets can contain several items, for example `{"wooden_pickaxe":1,"wooden_axe":1}`. Exact targets take precedence over the goal's prose for completion checks.

## Fresh-world benchmark protocol

The runner supplies four **pickaxe acquisition** cases, from empty inventory: `wooden_pickaxe`, `stone_pickaxe`, `iron_pickaxe`, and `diamond_pickaxe`. Confirm the report's exact tool set before treating these cases as a reproduction of its broader "tools" tasks. Baseline benchmark mode disables memory, vision, and chat to keep these experimental conditions explicit.

`BENCHMARK_MEMORY_MODE=off` is the default. Use `cold` to train a new isolated library, or `warm` with `BENCHMARK_MEMORY_NAMESPACE=<printed cold namespace>` for read-only evaluation against that library. Enabled-memory conditions require a reachable MemPalace service. Namespace/mode and memory metrics are recorded with each run. Never reuse the training world for evaluation; see [MEMORY.md](MEMORY.md).

1. Use the same Minecraft version, difficulty, seed, model settings, and iteration limit for both implementations. Use at least three independently reset trials per case and record success rate as well as successful-run cost. Test several seeds before generalizing.
2. Create a **new Compose project name for each trial**. The separate benchmark compose file uses its own world volume and port 25566. It never resets your development world.
3. Start the local MCP service with port 3001 and direct the benchmark agent to it. The commands below use PowerShell and run from the repository root.

```powershell
# Terminal 1: isolated world; choose a project ID never used for a prior trial.
$env:BENCHMARK_SEED = '20301'
docker compose -p yfm-bench-20301-wood-trial1 -f docker/benchmark.compose.yml up -d --wait

# Terminal 2: benchmark-only MCP server.
$env:MC_HOST = 'localhost'
$env:MC_PORT = '25566'
$env:MCP_PORT = '3001'
pnpm --filter @yearn-for-mines/shared build
pnpm dev:mcp

# Terminal 3: the same world and settings, with the benchmark MCP endpoint.
$env:MC_HOST = 'localhost'
$env:MC_PORT = '25566'
$env:MCP_MC_URL = 'http://localhost:3001/mcp'
$env:BENCHMARK_WORLD_ID = 'yfm-bench-20301-wood-trial1'
$env:BENCHMARK_SEED = '20301'
$env:BENCHMARK_FRESH_WORLD = 'true'
$env:AGENT_TELEMETRY_FILE = Join-Path (Get-Location) 'results/wood-trial1.jsonl'
pnpm --filter @yearn-for-mines/agent benchmark wooden_pickaxe
```

The runner checks survival mode and empty inventory. The world ID, seed, and fresh-world declaration are operator-supplied metadata; an empty inventory alone cannot prove that terrain is fresh. Do not reuse a modified world even after clearing inventory. Stop that trial's isolated server before starting a different project on the same port. No automatic world deletion is performed.

Keep the JSONL files for every run, including failures. Compare iteration counts with iteration counts and API calls with API calls. Token totals are usable only when `tokenUsageComplete` is true; zero reported tokens with incomplete usage does not mean free inference. `tokensPerAchievement` is populated only for a verified success with complete usage. Provider wall time includes request overhead; action time excludes LLM inference.

## Validation and remaining evidence

Validated October 8, 2026 after the memory integration: all four packages build, typecheck, and lint cleanly; all 432 tests pass across 33 files. Both Compose configurations pass `docker compose config --quiet` (the benchmark requires `BENCHMARK_SEED`). The live MemPalace smoke check also verifies action and knowledge-graph persistence across container recreation.

Run `pnpm build`, `pnpm typecheck`, and `pnpm test`. `node scripts/performance-audit.mjs` runs focused regressions, including real MCP schema dispatch and timeout cancellation, bounded nearest-block search, inventory quantity checks, complete tool histories, deterministic goals, and telemetry.

Gameplay tests use controlled world/inventory fixtures; they do not measure Minecraft task success. The MemPalace Docker image was built and exercised against its real HTTP service, including migration of the existing memory data. Live Minecraft performance trials remain unmeasured. Native screenshot output also needs an installed compatible `node-canvas-webgl`/OpenGL runtime and a live world; its lifecycle and failure paths are tested, its visual output is unverified here. No speedup percentage or new success rate has been claimed.
