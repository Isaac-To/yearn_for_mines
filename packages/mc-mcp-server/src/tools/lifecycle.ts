import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult, dataResult } from '@yearn-for-mines/shared';

export function registerLifecycleTools(server: McpServer, botManager: BotManager): void {
  server.registerTool(
    'bot_connect',
    {
      title: 'Connect Bot',
      description: 'Connect the bot to a Minecraft server',
      inputSchema: {
        host: z.string().default('localhost').describe('Server hostname or IP address'),
        port: z.number().default(25565).describe('Server port'),
        username: z.string().default('YearnForMines').describe('Bot username'),
        version: z.string().default('1.21.4').describe('Minecraft version'),
        auth: z.enum(['offline', 'microsoft']).default('offline').describe('Authentication mode'),
      },
    },
    async ({ host, port, username, version, auth }) => {
      const result = await botManager.connect({ host, port, username, version, auth });

      if (!result.success) {
        return errorResult(result.error ?? 'Failed to connect');
      }

      return dataResult({
        connected: true,
        username: result.username,
        spawnPoint: result.spawnPoint,
      });
    }
  );

  server.registerTool(
    'bot_disconnect',
    {
      title: 'Disconnect Bot',
      description: 'Disconnect the bot from the Minecraft server',
      inputSchema: {},
    },
    async () => {
      const result = await botManager.disconnect();

      if (!result.success) {
        return errorResult(result.error ?? 'Failed to disconnect');
      }

      return textResult('Bot disconnected successfully.');
    }
  );

  server.registerTool(
    'bot_respawn',
    {
      title: 'Respawn Bot',
      description: 'Respawn the bot after death',
      inputSchema: {},
    },
    async () => {
      const result = await botManager.respawn();

      if (!result.success) {
        return errorResult(result.error ?? 'Failed to respawn');
      }

      return dataResult({
        respawned: true,
        spawnPoint: result.spawnPoint,
      });
    }
  );
}