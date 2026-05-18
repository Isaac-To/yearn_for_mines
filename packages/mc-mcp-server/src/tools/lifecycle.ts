import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult, transientErrorResult, dataResult, BotConfigSchema } from '@yearn-for-mines/shared';

export function registerLifecycleTools(server: McpServer, botManager: BotManager): void {
  server.registerTool('bot_status', {
    title: 'Bot Status',
    description: 'Get the current status of the bot, including position and connection state.',
    inputSchema: z.object({}),
  }, async () => {
    const bot = botManager.currentBot;
    if (!bot) {
      return dataResult({ connected: false });
    }

    return dataResult({
      connected: true,
      username: bot.username,
      position: bot.entity.position,
      health: bot.health,
      food: bot.food,
      experience: bot.experience,
      gameMode: (bot as any).gameMode,
    });
  });
}
