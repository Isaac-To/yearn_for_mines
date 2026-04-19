import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../../observation-builder.js';
import { formatObservation } from '../../observation-formatter.js';
import { Vec3 } from 'vec3';

export function registerCraftMacroTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('craft_macro', {
    title: 'Craft Macro',
    description: 'Unified macro for crafting items. Handles both 2x2 and 3x3 crafting automatically, including finding and navigating to a crafting table if needed. Can conditionally craft, place, and clean up a crafting table.',
    inputSchema: { 
      item_name: z.string(), 
      count: z.number().default(1),
      craft_table_if_missing: z.boolean().default(false),
      cleanup_table: z.boolean().default(false)
    },
  }, async ({ item_name, count, craft_table_if_missing, cleanup_table }) => {
    const { goals } = await import('mineflayer-pathfinder');
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    const itemType = bot.registry.itemsByName[item_name];
    if (!itemType) {
      return textResult(formatObservation(buildObservation(bot, `Failed to craft: Unknown item '${item_name}'.`)));
    }

    try {
      const recipes = bot.recipesFor(itemType.id, null, count, null);
      if (recipes.length === 0) {
        return textResult(formatObservation(buildObservation(bot, `Cannot craft ${item_name}. Missing ingredients.`)));
      }

      const recipe = recipes[0];
      
      if (!recipe.requiresTable) {
        await bot.craft(recipe, count, undefined);
        return textResult(formatObservation(buildObservation(bot, `Successfully crafted ${count}x ${item_name} using 2x2 grid.`)));
      } else {
        const tableId = bot.registry.blocksByName.crafting_table.id;
        let table = bot.findBlock({ matching: tableId, maxDistance: 32 });
        let placedNewTable = false;

        if (!table) {
          if (!craft_table_if_missing) {
             return textResult(formatObservation(buildObservation(bot, `Failed to craft ${item_name}: Requires a crafting table, but none found nearby.`)));
          }

          // Need a crafting table, check inventory
          let hasTable = bot.inventory.items().some(item => item.name === 'crafting_table');
          if (!hasTable) {
             const tableRecipes = bot.recipesFor(tableId, null, 1, null);
             if (tableRecipes.length === 0) {
                 return textResult(formatObservation(buildObservation(bot, `Failed to craft ${item_name}: No crafting table nearby, and missing ingredients to craft one.`)));
             }
             await bot.craft(tableRecipes[0], 1, undefined);
          }

          // Equip and Place Table
          const refBlocks = bot.findBlocks({
             matching: (b) => {
                const blockType = bot.registry.blocks[b.type];
                if (!blockType || blockType.boundingBox !== 'block') return false;
                const above = bot.blockAt(b.position.offset(0, 1, 0));
                const above2 = bot.blockAt(b.position.offset(0, 2, 0));
                return above?.name === 'air' && above2?.name === 'air';
             },
             maxDistance: 6,
             count: 1
          });

          if (refBlocks.length === 0) {
             return textResult(formatObservation(buildObservation(bot, `Failed to craft ${item_name}: No valid nearby spot to place the crafting table.`)));
          }

          const refBlock = bot.blockAt(refBlocks[0]);
          if (!refBlock) throw new Error('Could not find reference block');

          const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table');
          if (!tableItem) throw new Error('Crafting table not in inventory despite just crafting it');

          await bot.equip(tableItem, 'hand');
          
          bot.pathfinder.setGoal(new goals.GoalLookAtBlock(refBlock.position, bot.world));
          await new Promise<void>((resolve, reject) => {
             const timeout = setTimeout(() => { bot.pathfinder.setGoal(null); reject(new Error('Pathfinding timeout')); }, 5000);
             bot.once('goal_reached', () => { clearTimeout(timeout); resolve(); });
          });

          await bot.placeBlock(refBlock, new Vec3(0, 1, 0));
          placedNewTable = true;
          table = bot.blockAt(refBlock.position.offset(0, 1, 0));
          if (!table) throw new Error('Table was placed but reference is null');
        }

        bot.pathfinder.setGoal(new goals.GoalLookAtBlock(table.position, bot.world));
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => { bot.pathfinder.setGoal(null); reject(new Error('Pathfinding timeout')); }, 10000);
            bot.once('goal_reached', () => { clearTimeout(timeout); resolve(); });
        });

        await bot.lookAt(table.position);
        await bot.craft(recipe, count, table);

        let cleanupStatus = "";
        if (placedNewTable) {
           if (cleanup_table) {
              const bestTool = bot.pathfinder.bestHarvestTool(table);
              if (bestTool) await bot.equip(bestTool, 'hand');
              await bot.dig(table);
              cleanupStatus = " (Placed and then cleaned up new crafting table)";
           } else {
              cleanupStatus = " (Placed new crafting table and left it)";
           }
        }

        return textResult(formatObservation(buildObservation(bot, `Successfully navigated to crafting table and crafted ${count}x ${item_name}.${cleanupStatus}`)));
      }
    } catch (error: any) {
      const obs = buildObservation(bot, `Failed to craft ${item_name}: ${error.message}`);
      return textResult(formatObservation(obs));
    }
  });
}
