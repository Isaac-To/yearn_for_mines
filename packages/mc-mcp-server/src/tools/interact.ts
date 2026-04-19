import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { findClosestMatches } from '../utils/string-match.js';

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
        const itemType = bot.registry.itemsByName[target];
        if (!itemType) {
          const suggestions = findClosestMatches(target, Object.keys(bot.registry.itemsByName), 3);
          const suggestionsStr = suggestions.length > 0 ? ` Did you mean: '${suggestions.join("', '")}'?` : '';
          return textResult(formatObservation(buildObservation(bot, `Cannot eat: Unknown item '${target}'.${suggestionsStr}`)));
        }

        const item = bot.inventory.items().find(i => i.name === target);
        if (!item) return textResult(formatObservation(buildObservation(bot, `Cannot eat: no ${target} in inventory.`)));
        await bot.equip(item, 'hand');
        await bot.consume();
        return textResult(formatObservation(buildObservation(bot, `Ate ${target}.`)));
      }

      const blockType = bot.registry.blocksByName[target];
      if (!blockType) {
        const suggestions = findClosestMatches(target, Object.keys(bot.registry.blocksByName), 3);
        const suggestionsStr = suggestions.length > 0 ? ` Did you mean: '${suggestions.join("', '")}'?` : '';
        return textResult(formatObservation(buildObservation(bot, `Cannot interact: Unknown block '${target}'.${suggestionsStr}`)));
      }

      const point = bot.findBlock({ matching: blockType.id, maxDistance: 5 });
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
