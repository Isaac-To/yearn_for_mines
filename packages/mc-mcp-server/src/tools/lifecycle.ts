import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult, dataResult, transientErrorResult } from '@yearn-for-mines/shared';

export function registerBotConnectTool(server: McpServer, botManager: BotManager): void {
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
      // If already connected, return current connection details
      if (botManager.isConnected) {
        const bot = botManager.currentBot;
        return dataResult({
          connected: true,
          username: bot?.username ?? 'Unknown',
          spawnPoint: bot ? { x: bot.spawnPoint.x, y: bot.spawnPoint.y, z: bot.spawnPoint.z } : undefined,
          alreadyConnected: true,
        });
      }

      const result = await botManager.connect({ host, port, username, version, auth });

      if (!result.success) {
        // Connection failures are transient (server may come back up)
        return transientErrorResult(result.error ?? 'Failed to connect');
      }

      return dataResult({
        connected: true,
        username: result.username,
        spawnPoint: result.spawnPoint,
      });
    }
  );
}

export function registerBotDisconnectTool(server: McpServer, botManager: BotManager): void {
  server.registerTool(
    'bot_disconnect',
    {
      title: 'Disconnect Bot',
      description: 'Disconnect the bot from the Minecraft server',
      inputSchema: {},
    },
    async () => {
      const result = botManager.disconnect();

      if (!result.success) {
        return errorResult(result.error ?? 'Failed to disconnect');
      }

      return textResult('Bot disconnected successfully.');
    }
  );
}

export function registerBotRespawnTool(server: McpServer, botManager: BotManager): void {
  server.registerTool(
    'bot_respawn',
    {
      title: 'Respawn Bot',
      description: 'Respawn the bot after death',
      inputSchema: {},
    },
    async () => {
      const result = botManager.respawn();

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

export function registerBotStatusTool(server: McpServer, botManager: BotManager): void {
  server.registerTool(
    'bot_status',
    {
      title: 'Bot Status',
      description: 'Get the current connection status of the bot without side effects',
      inputSchema: {},
    },
    async () => {
      const bot = botManager.currentBot;
      if (!bot) {
        return dataResult({
          connected: false,
          username: null,
          position: null,
          health: null,
          gameMode: null,
          inventory: [],
        });
      }

      const nearbyEntities = Object.values(bot.entities || {})
        .filter((e: any) =>
          e &&
          e !== bot.entity &&
          e.name &&
          e.isValid !== false &&
          e.position &&
          (typeof bot.entity.position.distanceTo === 'function'
            ? bot.entity.position.distanceTo(e.position) <= 16
            : Math.sqrt(
                Math.pow(bot.entity.position.x - e.position.x, 2) +
                Math.pow(bot.entity.position.y - e.position.y, 2) +
                Math.pow(bot.entity.position.z - e.position.z, 2)
              ) <= 16)
        )
        .map((e: any) => {
          const dist = typeof bot.entity.position.distanceTo === 'function'
            ? bot.entity.position.distanceTo(e.position)
            : Math.sqrt(
                Math.pow(bot.entity.position.x - e.position.x, 2) +
                Math.pow(bot.entity.position.y - e.position.y, 2) +
                Math.pow(bot.entity.position.z - e.position.z, 2)
              );
          return {
            name: e.name,
            type: e.type,
            health: e.health ?? null,
            distance: Math.round(dist * 10) / 10,
            position: {
              x: Math.floor(e.position.x),
              y: Math.floor(e.position.y),
              z: Math.floor(e.position.z),
            },
          };
        })
        .sort((a: any, b: any) => a.distance - b.distance)
        .slice(0, 10);

      const inventory = typeof bot.inventory?.items === 'function'
        ? bot.inventory.items().map((i: any) => ({ name: i.name, count: i.count }))
        : [];

      return dataResult({
        connected: true,
        username: bot.username,
        position: {
          x: bot.entity.position.x,
          y: bot.entity.position.y,
          z: bot.entity.position.z,
        },
        health: bot.health ?? 20,
        gameMode: bot.game?.gameMode ?? 'survival',
        inventory,
        nearbyEntities,
      });
    }
  );
}

export function registerLifecycleTools(server: McpServer, botManager: BotManager): void {
  registerBotConnectTool(server, botManager);
  registerBotDisconnectTool(server, botManager);
  registerBotRespawnTool(server, botManager);
  registerBotStatusTool(server, botManager);
}