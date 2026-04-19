import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../../observation-builder.js';
import { formatObservation } from '../../observation-formatter.js';
import { Vec3 } from 'vec3';

export function registerInteractBlockMacroTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('interact_block_macro', {
    title: 'Interact Block Macro',
    description: 'Unified macro for finding, pathing to, and interacting with ANY interactable or utility block (like furnace, chest, hopper, lever, button, anvil). Can conditionally craft, place, and clean up the block.',
    inputSchema: { 
      block_name: z.string(),
      craft_if_missing: z.boolean().default(false),
      cleanup_block: z.boolean().default(false),
      cleanup_crafting_table: z.boolean().default(false),
    },
  }, async ({ block_name, craft_if_missing, cleanup_block, cleanup_crafting_table }) => {
    const { goals } = await import('mineflayer-pathfinder');
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    const blockType = bot.registry.blocksByName[block_name];
    if (!blockType) {
      return textResult(formatObservation(buildObservation(bot, `Failed to interact: Unknown block '${block_name}'.`)));
    }

    try {
      let block = bot.findBlock({ matching: blockType.id, maxDistance: 32 });
      let placedNewBlock = false;
      let cleanupTableStatus = "";

      if (!block) {
        if (!craft_if_missing) {
           return textResult(formatObservation(buildObservation(bot, `Failed to interact: ${block_name} not found nearby.`)));
        }

        // Need the block, check inventory
        let hasBlock = bot.inventory.items().some(item => item.name === block_name);
        if (!hasBlock) {
           const recipes = bot.recipesFor(blockType.id, null, 1, null);
           if (recipes.length === 0) {
               return textResult(formatObservation(buildObservation(bot, `Failed to interact ${block_name}: None nearby, and missing ingredients to craft one.`)));
           }
           const recipe = recipes[0];
           
           if (!recipe.requiresTable) {
             await bot.craft(recipe, 1, undefined);
           } else {
             const tableId = bot.registry.blocksByName.crafting_table.id;
             let table = bot.findBlock({ matching: tableId, maxDistance: 32 });
             let placedNewTable = false;
             
             if (!table) {
                // Need a crafting table, check inventory
                let hasTable = bot.inventory.items().some(item => item.name === 'crafting_table');
                if (!hasTable) {
                   const tableRecipes = bot.recipesFor(tableId, null, 1, null);
                   if (tableRecipes.length === 0) {
                       return textResult(formatObservation(buildObservation(bot, `Failed to craft ${block_name}: No crafting table nearby, and missing ingredients to craft one.`)));
                   }
                   await bot.craft(tableRecipes[0], 1, undefined);
                }

                // Equip and Place Table
                const refBlocks = bot.findBlocks({
                   matching: (b) => {
                      const bType = bot.registry.blocks[b.type];
                      if (!bType || bType.boundingBox !== 'block') return false;
                      const above = bot.blockAt(b.position.offset(0, 1, 0));
                      const above2 = bot.blockAt(b.position.offset(0, 2, 0));
                      return above?.name === 'air' && above2?.name === 'air';
                   },
                   maxDistance: 6,
                   count: 1
                });

                if (refBlocks.length === 0) {
                   return textResult(formatObservation(buildObservation(bot, `Failed to craft ${block_name}: No valid nearby spot to place the crafting table.`)));
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
                 const timeout = setTimeout(() => { bot.pathfinder.setGoal(null); reject(new Error('Pathfinding timeout')); }, 5000);
                 bot.once('goal_reached', () => { clearTimeout(timeout); resolve(); });
             });
             await bot.lookAt(table.position);
             await bot.craft(recipe, 1, table);

             if (placedNewTable) {
                if (cleanup_crafting_table) {
                   const bestTool = bot.pathfinder.bestHarvestTool(table);
                   if (bestTool) await bot.equip(bestTool, 'hand');
                   await bot.dig(table);
                   cleanupTableStatus = " (Also crafted, placed, and cleaned up a crafting table)";
                } else {
                   cleanupTableStatus = " (Also crafted and left a new crafting table)";
                }
             }
           }
        }

        // Equip and Place block
        const refBlocks = bot.findBlocks({
           matching: (b) => {
              const bType = bot.registry.blocks[b.type];
              if (!bType || bType.boundingBox !== 'block') return false;
              const above = bot.blockAt(b.position.offset(0, 1, 0));
              const above2 = bot.blockAt(b.position.offset(0, 2, 0));
              return above?.name === 'air' && above2?.name === 'air';
           },
           maxDistance: 6,
           count: 1
        });

        if (refBlocks.length === 0) {
           return textResult(formatObservation(buildObservation(bot, `Failed to interact ${block_name}: No valid nearby spot to place the block.`)));
        }

        const refBlock = bot.blockAt(refBlocks[0]);
        if (!refBlock) throw new Error('Could not find reference block');

        const blockItem = bot.inventory.items().find(i => i.name === block_name);
        if (!blockItem) throw new Error(`${block_name} not in inventory despite just crafting it`);

        await bot.equip(blockItem, 'hand');
        
        bot.pathfinder.setGoal(new goals.GoalLookAtBlock(refBlock.position, bot.world));
        await new Promise<void>((resolve, reject) => {
           const timeout = setTimeout(() => { bot.pathfinder.setGoal(null); reject(new Error('Pathfinding timeout')); }, 5000);
           bot.once('goal_reached', () => { clearTimeout(timeout); resolve(); });
        });

        await bot.placeBlock(refBlock, new Vec3(0, 1, 0));
        placedNewBlock = true;
        block = bot.blockAt(refBlock.position.offset(0, 1, 0));
        if (!block) throw new Error('Block was placed but reference is null');
      }

      bot.pathfinder.setGoal(new goals.GoalLookAtBlock(block.position, bot.world));
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { bot.pathfinder.setGoal(null); reject(new Error('Pathfinding timeout')); }, 10000);
        bot.once('goal_reached', () => { clearTimeout(timeout); resolve(); });
      });

      await bot.lookAt(block.position);
      await bot.activateBlock(block);

      let cleanupStatus = "";
      if (placedNewBlock) {
         if (cleanup_block) {
            const bestTool = bot.pathfinder.bestHarvestTool(block);
            if (bestTool) await bot.equip(bestTool, 'hand');
            await bot.dig(block);
            cleanupStatus = ` (Placed and then cleaned up new ${block_name})`;
         } else {
            cleanupStatus = ` (Placed new ${block_name} and left it)`;
         }
      }

      return textResult(formatObservation(buildObservation(bot, `Successfully navigated to and activated ${block_name}.${cleanupStatus}${cleanupTableStatus}`)));
    } catch (error: any) {
      return textResult(formatObservation(buildObservation(bot, `Failed to interact with ${block_name}: ${error.message}`)));
    }
  });
}
