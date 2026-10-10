# Harness performance review

**Historical audit:** The findings and line numbers below describe the tree before the subsequent fixes. See [BENCHMARKS.md](BENCHMARKS.md) for the implemented changes, validation limits, and repeatable experiments. `scripts/performance-audit.mjs` now runs regression checks that expect the corrected behavior.

Reviewed October 7, 2026 against the current working tree, including the pre-existing local edits. No production source was changed during this review.

The largest obstacles are incorrect tool contracts, incomplete feedback, and recovery behavior. They can make a capable model waste actions, consume materials, or stop early. Fix these before comparing models or tuning inference speed.

## Evidence and limits

- All four packages passed `pnpm -r run typecheck`.
- All 429 existing tests passed across 29 test files: shared 90, agent 63, MCP server 179, web UI 97.
- `scripts/performance-audit.mjs` reproduced 10 defects using current source and isolated fixtures, without contacting live Minecraft, MemPalace, or an LLM. Run with `pnpm --filter @yearn-for-mines/agent exec tsx ../../scripts/performance-audit.mjs`.
- These probes confirm contracts and control flow; they are not live Minecraft benchmarks. Other findings below are supported by source inspection, including the installed Mineflayer and prismarine-viewer implementations. No throughput, GPU utilization, or real task success-rate claim is made.

## Highest priority

### 1. Crafting confuses requested items with recipe executions

**P1 — reproduced.** `packages/mc-mcp-server/src/tools/craft_items.ts:78` and `:259` pass `craftAmount` to `bot.craft`. `tools/macro/craft_macro.ts:144` has the same problem. Mineflayer's installed `lib/plugins/craft.js` treats that argument as the number of recipe executions. Meanwhile, `tools/recipe-table.ts:169` correctly calculates `ceil(amount / outputPerCraft)`, but execution does not use the calculation.

The reproduction requests four sticks. The planner calculates one craft operation, but execution requests four. Depending on inventory, this can make sixteen sticks or partially craft and then fail from missing ingredients. Existing output inventory is also not subtracted consistently: the pre-check treats amount as an inventory target, while recipe planning budgets production for the full amount.

**Fix:** define all quantity arguments explicitly, calculate the remaining output deficit, retain the selected recipe with its plan, execute the required number of crafts, and verify the final inventory target. Include multi-output recipes and nonzero starting inventory in regression coverage.

### 2. Gathering instructions contradict the tool's quantity contract

**P1 — reproduced.** `packages/shared/src/llm-client.ts:106` says to gather only the deficit. `tools/gather_materials.ts:65` describes `amount` as the wanted total inventory count, and `:126` skips when inventory already meets that argument.

With two cobblestone and a requirement for three, following the prompt produces `amount: 1`. The tool skips gathering and leaves inventory at two. Repeating the same sensible plan cannot resolve this.

**Fix:** use one contract everywhere, preferably an explicit `target_inventory_count`, and have the tool calculate the deficit itself. Also distinguish species-specific requests from generic wood: the current counter accepts any log species for an `oak_log` target, although an oak-plank recipe needs oak logs.

### 3. Tool failures often have `isError: false`

**P1 — reproduced and source-confirmed across tools.** `gather_materials.ts:181`, `:427`, and its final catch return `textResult(...)` for missing resources, partial collection, and failures. Many crafting, smelting, movement, and combat failures follow the same pattern. `textResult` defaults to success in `packages/shared/src/types/mcp.ts:51`.

The reproduction cannot find stone, yet receives `isError: false`. The controller's retry logic, batch short-circuiting, and stall detection all depend on `isError`. Consequently, a failed gather can be followed by crafting that depends on the missing material.

**Fix:** return structured outcomes with `status`, inventory delta, target reached, and error category. Mark unmet action postconditions explicitly. Treat partial progress separately from both success and hard failure.

### 4. History pruning and alternative planning can break tool-call protocol

**P1 — both reproduced.** `packages/agent/src/agent-loop.ts:119` keeps the last 40 individual messages. With varying batch sizes, the retained history can begin with a tool reply whose assistant tool call was removed. The audit reproduces exactly that boundary. Pruning runs only after tool execution, so repeated no-tool responses also escape this limit.

At `:766`, alternative planning appends only the failing tool's result before a user message. If the original assistant requested multiple tools, the others are still unanswered. If an alternative succeeds, its result is then attached to the original call's ID without preserving the alternative action in the main history.

**Fix:** compact complete turns, preserving every assistant call and its matching replies. Finish or explicitly skip the current batch before asking for alternatives, and record the alternative assistant/tool turns accurately.

### 5. Timeouts do not cancel the work they time out

**P1 — source-confirmed.** `agent-loop.ts:738` uses a 120-second outer tool deadline, but `packages/shared/src/mcp-client.ts:67` gives the SDK a 300-second deadline. The outer `Promise.race` does not cancel the MCP request or server action. A timed-out action can therefore still run while recovery retries it. Gathering can exceed 120 seconds through several batch and extended-search timeouts.

All thrown execution errors are labeled transient at `agent-loop.ts:762`, and any timeout triggers Minecraft reconnection. `handleDisconnection` calls `bot_connect` on the existing MCP client; it cannot recreate a lost MCP session after a server restart. Abort wrappers reject locally but do not pass cancellation through to `fetch` or MCP. LLM `fetch` has no explicit timeout or abort signal in `llm-client.ts:269`. Status/reconnect race timers are not cleared on early success.

**Fix:** propagate abort signals and one coherent deadline through the layers, cancel bot movement/digging/collection before retrying, distinguish transport failures from task timeouts, and recreate the MCP transport/session when needed. A hanging LLM request needs its own deadline.

### 6. The block-search cap can hide nearby resources

**P1 — confirmed against installed Mineflayer source; no live-world reproduction.** `packages/mc-mcp-server/src/bot-manager.ts:164` counts matching blocks inside the predicate and suppresses matches after 32 common blocks. Mineflayer applies that predicate before its distance filter in installed `mineflayer/lib/plugins/blocks.js:183`, then sorts accepted blocks by distance later.

Matches outside the requested radius can exhaust the cap before a closer candidate is visited. Even within the radius, the cap selects the first candidates encountered in traversal order rather than the nearest candidates. This can return no resource or a poor target despite suitable nearby blocks.

**Fix:** preserve a pure matching predicate. Bound memory with a distance-aware selection algorithm or search implementation, then benchmark nearest-target correctness and peak memory in dense terrain. Simply clipping the final result array does not solve intermediate allocation pressure.

## Further limits on capability and measurement

### 7. Observation loses useful context and truncates feedback blindly

**P2 — source-confirmed.** The active loop perceives `bot_status` at `agent-loop.ts:222`. That includes inventory and nearby entities, but omits terrain, food, oxygen, held-tool durability, time, and events. `EventManager` is constructed in `http-transport.ts` but never attached to the bot. Chat-response logic therefore receives no chat events.

Tool observations scan a 9×9×9 block cube, calculate dig information, sort all points of interest, and keep only the nearest five (`observation-builder.ts:83`, `:362`). Nearby floor blocks can crowd out useful resources and threats. The controller then clips every result to 500 characters (`agent-loop.ts:610`), potentially cutting off recipe details and missing ingredients. `maxObservationTokens` is configured but unused by the loop.

**Fix:** use a compact structured observation with complete inventory and explicit hazards, choose points of interest by relevance as well as distance, and budget context by tokens and field priority. Preserve action outcomes and missing prerequisites intact.

### 8. Stall detection does not recognize normal repeated failures

**P2 — reproduced.** `agent-loop.ts:448` compares serialized tool-call objects, including their IDs. Identical actions with new IDs compare differently. The existing stall test reuses a constant ID, so it passes without covering normal model responses. The detector also requires every result to be an error, missing no-op and partial-progress loops.

**Fix:** compare normalized names and arguments and measure state progress. Trigger recovery after repeated unchanged inventory/position/postconditions, even when transport status says success.

### 9. Memory learning loses outcomes and silently misreports storage

**P2 — reproduced and schema-confirmed.** Reflection receives `{ name, result, isError }`, but `llm-client.ts:127` reads `resultObj.content`. The resulting reflection prompt contains `Outcome: Error: undefined` or `Success: undefined`.

`memory-manager.ts:222` and `:238` call `mempalace_diary_write` with `wing` and `mood`; the local Python wrapper at `docker/mempalace_http.py:246` requires `agent_name` and accepts `topic`. KG query sends subject/predicate instead of required entity, and invalidation sends fact_id instead of subject/predicate/object. Initialization calls `mempalace_add_room`, which the wrapper does not expose, and initialization is not invoked by startup. Several writes return true without checking MCP `isError`; the reproduction reports a failed milestone write as successful.

**Fix:** align the TypeScript adapter with the actual served schemas, preserve reflection outcomes, check tool-result status, and verify a write/read round trip. Keep optional memory retrieval bounded so it cannot hold up task execution for the default five-minute MCP timeout.

### 10. Screenshot capture is incompatible with the installed renderer

**P2 — confirmed against installed dependency source.** `screenshot.ts:36` calls prismarine-viewer headless with `output: 'png'` and `frames: 0`, then `:77` expects `bot.viewer.screenshot()`. The installed headless implementation returns an output client; it does not install that screenshot method. Its output options represent a video/stream destination or a socket address, not a PNG format selection. The headed implementation installs viewer helpers but also has no screenshot method.

The renderer is initialized for every connection even when VLM is disabled. `detach()` only clears fields and does not dispose the rendering resources. Requested screenshot width/height are returned as metadata but never applied to capture. Tests inject an invented `viewer.screenshot` method, masking the integration gap.

**Fix:** implement and smoke-test a real one-frame capture API, initialize it only when requested, validate capability before enabling VLM, and dispose its workers/listeners/output resources. Keep only current useful images in model context.

### 11. Configuration and dashboard wiring prevent representative runs

**P1 for Docker connectivity; P2 for dashboard behavior — source-confirmed.** `packages/agent/src/main.ts:13` derives the MCP URL from bind settings instead of the configured `MCP_MC_URL`. Docker sets that URL to `mc-mcp-server`, but the agent derives localhost. Startup and recovery also call `bot_connect` with `{}`, while lifecycle defaults point to localhost and do not use `MC_HOST`; Docker's configured Minecraft hostname is therefore bypassed.

`loadConfig` uses dotenv `override: true`, so file values take precedence over deliberate process-level overrides. The agent and MCP Dockerfiles build their own packages without first building shared, which exports ignored `dist` files; clean builds depend on whether shared output was copied from the local checkout.

The audit confirms the active registry omits `send_chat` and `observe`, although narration and dashboard polling call them. Dashboard control messages merely broadcast running/stopped/paused states (`web-ui/src/server.ts:116`); they do not control an AgentLoop. The dev command launches Vite but not the dashboard backend, and the browser hardcodes port 8080 even though Docker exposes the dashboard on 5173.

**Fix:** wire service URLs and bot connection settings end to end, let explicit environment values win, build workspace dependencies in Docker, validate the actual tool registry, and connect dashboard controls and telemetry to the running agent.

### 12. Verification and reporting cannot establish best performance

**P2 — source-confirmed.** Verification makes another LLM call whenever a result says “successfully,” even if only an intermediate action succeeded (`agent-loop.ts:807`). Frequent successful actions can therefore approach two inference calls per iteration. The verifier receives only a bot-status snapshot and accepts the model's boolean; construction and other world-changing goals cannot be established reliably from that snapshot alone. When a no-tool plan verifies as complete, the loop exits before reflection, skipping learning for that success path.

`totalLlmCalls` counts completed PLAN and VERIFY calls, but omits failed requests, alternatives, and reflection. No stage-duration, token-usage, or finish-reason metrics are recorded. Tool descriptions appear both in the system prompt and API tool catalog; optional memory exposes its whole tool surface on every plan. A mandatory recipe lookup also duplicates the lookup already performed inside crafting tools. These are likely context/inference costs, but their latency impact needs measurement.

**Fix:** use objective goal predicates wherever possible, verify world-changing goals with appropriate state, and count every LLM request and its usage. Record stage latency, action duration, retries, materials consumed, and task completion. Then compare harness versions on fixed scenarios and seeds with cold/warm memory separated. The default peaceful world is suitable for some tasks but does not exercise hostile survival behavior.

## Additional straightforward improvements

- Smelting's initial fuel allowlist rejects birch planks and other fuels supported by its later efficiency table; reproduced by the audit. Its wait is capped at 180 seconds even for up to 64 inputs, while the controller budgets up to 687 seconds. Any positive output is reported as successful without requiring the requested total. Unify fuel checks and verify the target count.
- Gathering caps initial and extended searches at ten candidates each, even for requests up to 64. Continue searching until the target is reached or meaningful progress stops, rather than returning partial progress as success.
- Crafting cleans up newly placed tables after every operation. The prompt simultaneously demands table reuse within 50 blocks, while implementation searches only 32. Choose one utility-block policy and avoid repeated placement/mining during multi-step recipes.
- Replace unconditional 200 ms per-dig, two-second drop waits, and other settlement sleeps with acknowledged state changes plus bounded fallbacks where practical. Measure first; these delays may also compensate for real server synchronization problems.
- Keep bot actions serialized. The executor already does so; indiscriminate parallel action calls would race over shared movement, held items, and container state. Only independent reads are candidates for concurrency.

## Recommended order

1. Correct quantities and action outcome status; add regression cases that assert actual inventory targets.
2. Preserve valid tool history, normalize stalls, and make timeouts cancel underlying work.
3. Correct block search, configuration, and active tool registration.
4. Repair perception, memory, and vision integrations; connect the dashboard to real execution.
5. Establish repeatable task metrics, then tune prompt size, verification frequency, settlement waits, and model settings using measured results.
