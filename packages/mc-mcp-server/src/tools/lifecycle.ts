import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult, transientErrorResult, dataResult, BotConfigSchema } from '@yearn-for-mines/shared';
import { ObservationContext } from '../observation-context.js';

export function registerLifecycleTools(server: McpServer, botManager: BotManager, obsCtx: ObservationContext): void {
  server.registerTool('bot_status', {
    title: 'Bot Status',
    description: 'Get the current status of the bot, including position, connection state, inventory summary, nearby entities, and craftable items.',
    inputSchema: z.object({}),
  }, async () => {
    const bot = botManager.currentBot;
    if (!bot) {
      return dataResult({ connected: false });
    }

    const observation = obsCtx.observe(bot);

    return dataResult({
      connected: true,
      username: bot.username,
      position: bot.entity.position,
      health: bot.health,
      food: bot.food,
      experience: bot.experience,
      gameMode: (bot as any).gameMode,
      observation,
    });
  });
}
