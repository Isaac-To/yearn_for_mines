import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { findClosestMatches } from '../utils/string-match.js';

export function registerCraftItemsTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('craft_items', {
    title: 'Craft Items',
    description: 'Autonomously manages the crafting process. The recipe param must be the exact item name like "iron_pickaxe".',
    inputSchema: { recipe: z.string(), amount: z.number().default(1) },
  }, async ({ recipe, amount }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    const itemType = bot.registry.itemsByName[recipe];
    if (!itemType) {
      const validNames = Object.keys(bot.registry.itemsByName);
      const suggestions = findClosestMatches(recipe, validNames, 3);
      const suggestionsStr = suggestions.length > 0 ? ` Did you mean: '${suggestions.join("', '")}'?` : '';
      return textResult(formatObservation(buildObservation(bot, `Failed to craft: Unknown item '${recipe}'.${suggestionsStr}`)));
    }

    try {
      const recipes = bot.recipesFor(itemType.id, null, amount, null);
      if (recipes.length === 0) {
        return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}. You might be missing ingredients or a crafting table.`)));
      }

      const table = bot.findBlock({ matching: bot.registry.blocksByName.crafting_table.id, maxDistance: 6 });
      
      await bot.craft(recipes[0], amount, table ?? undefined);

      const obs = buildObservation(bot, `Successfully crafted ${amount}x ${recipe}.`);
      return textResult(formatObservation(obs));
    } catch (error: any) {
      const obs = buildObservation(bot, `Failed to craft ${recipe}: ${error.message}`);
      return textResult(formatObservation(obs));
    }
  });
}
