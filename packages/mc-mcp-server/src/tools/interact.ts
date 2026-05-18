import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { findClosestMatches } from '../utils/string-match.js';
import { Vec3 } from 'vec3';

export function registerInteractTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('interact', {
    title: 'Unified Interact',
    description: 'Unified tool for world interaction: dig, place, craft, and use blocks/entities.',
    inputSchema: z.discriminatedUnion('action', [
      z.object({
        action: z.literal('dig'),
        target: z.object({ x: z.number(), y: z.number(), z: z.number() }).describe('Coordinates of the block to dig')
      }),
      z.object({
        action: z.literal('place'),
        item: z.string().describe('Name of the item to place'),
        target: z.object({ x: z.number(), y: z.number(), z: z.number() }).describe('Target coordinates for placement')
      }),
      z.object({
        action: z.literal('craft'),
        item: z.string().describe('Name of the item to craft'),
        amount: z.number().default(1).describe('Quantity to craft')
      }),
      z.object({
        action: z.literal('use'),
        target: z.union([
          z.string().describe('Name of the block type to find and use'),
          z.object({ x: z.number(), y: z.number(), z: z.number() }).describe('Specific coordinates to use')
        ])
      }),
      z.object({
        action: z.literal('eat'),
        item: z.string().describe('Name of the food item to eat')
      })
    ]),
  }, async (args) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    try {
      switch (args.action) {
        case 'dig': {
          const pos = new Vec3(args.target.x, args.target.y, args.target.z);
          const block = bot.blockAt(pos);
          if (!block || block.name === 'air') {
            return textResult(formatObservation(buildObservation(bot, `Cannot dig: No block at ${pos.x}, ${pos.y}, ${pos.z}.`)));
          }
          await bot.dig(block);
          return textResult(formatObservation(buildObservation(bot, `Successfully dug ${block.name} at ${pos.x}, ${pos.y}, ${pos.z}.`)));
        }

        case 'place': {
          const item = bot.inventory.items().find(i => i.name === args.item);
          if (!item) {
            return textResult(formatObservation(buildObservation(bot, `Failed to place: No ${args.item} in inventory.`)));
          }
          const pos = new Vec3(args.target.x, args.target.y, args.target.z);
          const referenceBlock = bot.blockAt(new Vec3(pos.x, pos.y - 1, pos.z));
          if (!referenceBlock || referenceBlock.name === 'air') {
            return textResult(formatObservation(buildObservation(bot, `Failed to place: Need a solid block below target position to attach to.`)));
          }
          await bot.equip(item, 'hand');
          await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
          return textResult(formatObservation(buildObservation(bot, `Successfully placed ${args.item} at ${pos.x}, ${pos.y}, ${pos.z}.`)));
        }

        case 'craft': {
          const itemType = bot.registry.itemsByName[args.item];
          if (!itemType) {
            const suggestions = findClosestMatches(args.item, Object.keys(bot.registry.itemsByName), 3);
            const suggestionsStr = suggestions.length > 0 ? ` Did you mean: '${suggestions.join("', '")}'?` : '';
            return textResult(formatObservation(buildObservation(bot, `Failed to craft: Unknown item '${args.item}'.${suggestionsStr}`)));
          }
          const recipes = bot.recipesFor(itemType.id, null, args.amount, null);
          if (recipes.length === 0) {
            return textResult(formatObservation(buildObservation(bot, `Cannot craft ${args.item}. You might be missing ingredients or a crafting table.`)));
          }
          const table = bot.findBlock({ matching: bot.registry.blocksByName.crafting_table.id, maxDistance: 6 });
          await bot.craft(recipes[0], args.amount, table ?? undefined);
          return textResult(formatObservation(buildObservation(bot, `Successfully crafted ${args.amount}x ${args.item}.`)));
        }

        case 'use': {
          let targetBlock;
          if (typeof args.target === 'string') {
            const blockType = bot.registry.blocksByName[args.target];
            if (!blockType) {
              const suggestions = findClosestMatches(args.target, Object.keys(bot.registry.blocksByName), 3);
              const suggestionsStr = suggestions.length > 0 ? ` Did you mean: '${suggestions.join("', '")}'?` : '';
              return textResult(formatObservation(buildObservation(bot, `Cannot use: Unknown block '${args.target}'.${suggestionsStr}`)));
            }
            targetBlock = bot.findBlock({ matching: blockType.id, maxDistance: 5 });
          } else {
            targetBlock = bot.blockAt(new Vec3(args.target.x, args.target.y, args.target.z));
          }

          if (!targetBlock || targetBlock.name === 'air') {
            return textResult(formatObservation(buildObservation(bot, `Cannot use: Target not in range or not found.`)));
          }
          await bot.lookAt(targetBlock.position);
          await bot.activateBlock(targetBlock);
          return textResult(formatObservation(buildObservation(bot, `Interacted with ${targetBlock.name}.`)));
        }

        case 'eat': {
          const item = bot.inventory.items().find(i => i.name === args.item);
          if (!item) return textResult(formatObservation(buildObservation(bot, `Cannot eat: no ${args.item} in inventory.`)));
          await bot.equip(item, 'hand');
          await bot.consume();
          return textResult(formatObservation(buildObservation(bot, `Ate ${args.item}.`)));
        }

        default:
          return errorResult(`Unknown interaction action`);
      }
    } catch (error: any) {
      return textResult(formatObservation(buildObservation(bot, `Interaction failed: ${error.message}`)));
    }
  });
}
