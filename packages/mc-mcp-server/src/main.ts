import { BotManager } from './bot-manager.js';
import { McpHttpServer } from './http-transport.js';

const port = parseInt(process.env.MCP_PORT ?? '3000', 10);
const host = process.env.MCP_HOST ?? '0.0.0.0';

const botManager = new BotManager();
const server = new McpHttpServer(botManager, {
  port,
  host,
  serverName: 'yearn-for-mines-mcp',
  serverVersion: '0.1.0',
});

server.start().then(() => {
  console.log(`[MC MCP Server] Started on ${host}:${port}`);
}).catch((err) => {
  console.error('[MC MCP Server] Failed to start:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[MC MCP Server] Shutting down...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[MC MCP Server] Shutting down...');
  await server.stop();
  process.exit(0);
});