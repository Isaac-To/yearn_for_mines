import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';

export function registerInteractTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('interact', {
    title: 'Interact',
    description: 'Atomic interactions: eat, sleep, open.',
    inputSchema: { action: z.enum(['eat', 'sleep', 'open']), target: z.string() },
  }, async ({ action, target }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    try {
      if (action === 'eat') {
        const item = bot.inventory.items().find(i => i.name === target);
        if (!item) return textResult(formatObservation(buildObservation(bot, `Cannot eat: no ${target} in inventory.`)));
        await bot.equip(item, 'hand');
        await bot.consume();
        return textResult(formatObservation(buildObservation(bot, `Ate ${target}.`)));
      }

      const point = bot.findBlock({ matching: bot.registry.blocksByName[target]?.id, maxDistance: 5 });
      if (!point) return textResult(formatObservation(buildObservation(bot, `Cannot interact: ${target} not in range.`)));

      if (action === 'sleep') {
        await bot.sleep(point);
        return textResult(formatObservation(buildObservation(bot, `Slept in ${target}.`)));
      }

      if (action === 'open') {
        // Just look at it
        await bot.lookAt(point.position);
        await bot.activateBlock(point);
        return textResult(formatObservation(buildObservation(bot, `Opened ${target}.`)));
      }

      return textResult(formatObservation(buildObservation(bot, `Unknown action ${action}.`)));
    } catch (error: any) {
      return textResult(formatObservation(buildObservation(bot, `Failed to ${action} ${target}: ${error.message}`)));
    }
  });
}
