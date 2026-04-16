#!/usr/bin/env bash
set -euo pipefail

# Yearn for Mines — Local Development Startup Script
# Starts all services needed for local development

echo "=== Yearn for Mines — Local Development ==="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: node is required"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "Error: pnpm is required"; exit 1; }

# Configuration
MC_HOST="${MC_HOST:-localhost}"
MC_PORT="${MC_PORT:-25565}"
MC_USERNAME="${MC_USERNAME:-YearnForMines}"
MC_VERSION="${MC_VERSION:-1.21.4}"
MCP_PORT="${MCP_PORT:-3000}"
MCP_HOST="${MCP_HOST:-127.0.0.1}"
LLM_BASE_URL="${LLM_BASE_URL:-http://localhost:11434/v1}"
LLM_MODEL="${LLM_MODEL:-gemma4:31b-cloud}"
MCP_MEMPALACE_URL="${MCP_MEMPALACE_URL:-}"
AGENT_GOAL="${AGENT_GOAL:-Find a tree and gather wood}"
WEB_PORT="${WEB_PORT:-8080}"

echo ""
echo "Configuration:"
echo "  MC Host:       $MC_HOST:$MC_PORT"
echo "  MCP Server:    $MCP_HOST:$MCP_PORT"
echo "  LLM:           $LLM_BASE_URL (model: $LLM_MODEL)"
echo "  MemPalace:     ${MCP_MEMPALACE_URL:-not configured}"
echo "  Agent Goal:    $AGENT_GOAL"
echo "  Web UI:        http://localhost:$WEB_PORT"
echo ""

# Build all packages
echo "Building packages..."
pnpm -r run build

echo ""
echo "Starting services in background..."
echo "Press Ctrl+C to stop all services."
echo ""

# Trap exit to kill background processes
PIDS=()
cleanup() {
  echo ""
  echo "Stopping services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  exit 0
}
trap cleanup INT TERM

# Start MC MCP server
echo "Starting MC MCP server on port $MCP_PORT..."
MC_HOST="$MC_HOST" MC_PORT="$MC_PORT" MC_USERNAME="$MC_USERNAME" MC_VERSION="$MC_VERSION" MC_AUTH=offline MCP_PORT="$MCP_PORT" MCP_HOST="$MCP_HOST" node packages/mc-mcp-server/dist/main.js &
PIDS+=($!)

# Wait for MCP server to start
sleep 2

# Start web UI server
echo "Starting Web UI server on port $WEB_PORT..."
PORT="$WEB_PORT" MCP_MC_URL="http://localhost:$MCP_PORT/mcp" npx tsx packages/web-ui/src/server-main.ts &
PIDS+=($!)

# Start agent (optional, requires LLM)
if [ "${1:-}" = "--with-agent" ]; then
  echo "Starting agent with goal: $AGENT_GOAL"
  MCP_MC_URL="http://localhost:$MCP_PORT/mcp" \
  LLM_BASE_URL="$LLM_BASE_URL" \
  LLM_MODEL="$LLM_MODEL" \
  AGENT_GOAL="$AGENT_GOAL" \
  ${MCP_MEMPALACE_URL:+MCP_MEMPALACE_URL="$MCP_MEMPALACE_URL"} \
  node packages/agent/dist/main.js &
  PIDS+=($!)
fi

echo ""
echo "Services running. Open http://localhost:$WEB_PORT for the debug dashboard."
echo ""

# Wait for any process to exit
wait