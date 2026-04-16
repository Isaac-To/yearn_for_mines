## 1. Shared shutdown utility

- [x] 1.1 Add `registerShutdown(handlers, options)` function to `packages/shared/src/` that registers SIGINT/SIGTERM handlers, runs all cleanup handlers in parallel with `Promise.allSettled`, and force-exits after a configurable timeout (default 10s)
- [x] 1.2 Export `registerShutdown` from `packages/shared/src/index.ts`
- [x] 1.3 Add unit tests for `registerShutdown` covering: normal shutdown, handler errors, timeout force-exit, multiple handlers

## 2. Agent loop abort mechanism

- [x] 2.1 Add optional `AbortSignal` parameter to `AgentLoop` constructor and store it as `this.abortSignal`
- [x] 2.2 Abort the LLM call in `plan()` by wrapping `llmClient.chat()` in a `Promise.race` that rejects on abort
- [x] 2.3 Abort tool execution in `executeToolCall()` by wrapping `client.callTool()` in a `Promise.race` that rejects on abort
- [x] 2.4 Abort the loop delay (`setTimeout` in `run()`) by using an abort-aware delay that resolves immediately on signal
- [x] 2.5 Abort the `perceive()` MCP calls by wrapping `mcClient.callTool()` in a `Promise.race` that rejects on abort
- [x] 2.6 Add abort-awareness to `verify()` LLM call
- [x] 2.7 Update `stop()` to also abort via the signal (call `abortController.abort()` if internally managed)
- [x] 2.8 Add tests for abort behavior: abort during LLM call, abort during tool call, abort during delay, no signal backward compat

## 3. Agent process shutdown handler

- [x] 3.1 In `packages/agent/src/main.ts`, create an `AbortController` and pass its signal to `AgentLoop`
- [x] 3.2 Register shutdown handler using `registerShutdown` from shared: abort the loop, disconnect MCP clients, exit 0
- [x] 3.3 Ensure the cleanup block at the bottom of `main()` still runs on normal completion (no signal needed)

## 4. BotManager cleanup improvements

- [x] 4.1 Update `BotManager.disconnect()` to call `bot.removeAllListeners()` after `bot.quit()`
- [x] 4.2 Add a 3-second timeout wait for the bot `end` event after calling `quit()`
- [x] 4.3 Log a warning if `end` event times out but still return success
- [x] 4.4 Update existing BotManager tests for the new disconnect behavior

## 5. Refactor existing shutdown handlers

- [x] 5.1 Replace inline SIGINT/SIGTERM handlers in `packages/mc-mcp-server/src/main.ts` with `registerShutdown` from shared
- [x] 5.2 Replace inline SIGINT/SIGTERM handlers in `packages/web-ui/src/server-main.ts` with `registerShutdown` from shared
- [x] 5.3 Verify both processes still shut down correctly (manual or integration test)

## 6. Docker Compose configuration

- [x] 6.1 Add `stop_grace_period: 15s` to the `agent` service in `docker/docker-compose.yml`
- [x] 6.2 Add `stop_grace_period: 10s` to `mc-mcp-server`, `web-ui`, and `mempalace` services

## 7. Dev scripts cleanup

- [x] 7.1 Remove the `trap` handler and `PIDS` array from `scripts/dev.sh` since `concurrently` handles signal propagation
- [x] 7.2 Verify Ctrl+C correctly terminates all child processes when using `concurrently`