## 1. Setup

- [x] 1.1 Add `concurrently` as a dev dependency at the repo root (`pnpm add -D concurrently -w`)
- [x] 1.2 Verify `concurrently` is available by running `npx concurrently --version`

## 2. Root Dev Scripts

- [x] 2.1 Add `dev` script to root `package.json` using `concurrently` to run shared build, then MCP server, web UI, and agent with color-coded prefixes and `--kill-others`
- [x] 2.2 Add `dev:webstack` script to root `package.json` for MCP server + web UI only (no agent)
- [x] 2.3 Ensure `dev` script runs `pnpm --filter @yearn-for-mines/shared build` as a sequential prerequisite before launching concurrent services

## 3. Log Formatting

- [x] 3.1 Configure `concurrently` with `--names` flag for service prefixes (`mcp`, `web`, `agent`) and `--prefix-colors` for distinct colors per service
- [x] 3.2 Test that log output shows interleaved lines with color-coded service name prefixes

## 4. Graceful Shutdown

- [x] 4.1 Configure `concurrently` with `--kill-others-on-fail` so that if one service crashes, all others are terminated
- [x] 4.2 Test Ctrl+C kills all child processes cleanly (no orphan processes)

## 5. Backward Compatibility

- [x] 5.1 Update `scripts/dev.sh` to print a deprecation message pointing to `pnpm dev`
- [x] 5.2 Verify existing `dev:mcp`, `dev:agent`, `dev:web` scripts still work independently in separate terminals

## 6. Validation

- [x] 6.1 Run `pnpm dev` and verify all services start with hot reload
- [x] 6.2 Run `pnpm dev:webstack` and verify only MCP server and web UI start
- [x] 6.3 Kill a service mid-run and verify others are terminated
- [x] 6.4 Press Ctrl+C and verify clean shutdown with no orphan processes