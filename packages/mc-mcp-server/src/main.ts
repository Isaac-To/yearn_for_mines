import { loadConfig, registerShutdown } from '@yearn-for-mines/shared';
import { BotManager } from './bot-manager.js';
import { McpHttpServer } from './http-transport.js';

const config = loadConfig();

const botManager = new BotManager();
const server = new McpHttpServer(botManager, {
  port: config.mcpServer.port,
  host: config.mcpServer.host,
  serverName: 'yearn-for-mines-mcp',
  serverVersion: '0.1.0',
});

server.start().then(() => {
  console.log(`[MC MCP Server] Started on ${config.mcpServer.host}:${config.mcpServer.port}`);
}).catch((err) => {
  console.error('[MC MCP Server] Failed to start:', err);
  process.exit(1);
});

// Graceful shutdown
registerShutdown([
  async () => {
    console.log('[MC MCP Server] Shutting down...');
    await server.stop();
    if (botManager.isConnected) {
      botManager.disconnect();
    }
  },
]);