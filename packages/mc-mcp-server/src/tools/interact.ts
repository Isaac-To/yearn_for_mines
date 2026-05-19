import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { findClosestMatches } from '../utils/string-match.js';
import { ObservationContext } from '../observation-context.js';
import { Vec3 } from 'vec3';

export function registerInteractTool(server: McpServer, botManager: BotManager, obsCtx: ObservationContext): void {
  server.registerTool('interact', {
    title: 'Unified Interact',
    description: 'Unified tool for world interaction: dig, place, craft, use (containers, workstations, redstone), and eat. For craft: items requiring a 3x3 crafting table (like chest, furnace) need a crafting_table within 6 blocks. Use action "place" to place a crafting_table first if needed, then "craft" the item.',
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
          z.string().describe('Name of the block type to find and use (e.g. "furnace", "brewing_stand", "chest")'),
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

    const interactableBlocks = [
      'furnace', 'blast_furnace', 'smoker', 'brewing_stand', 'chest', 'barrel', 
      'ender_chest', 'shulker_box', 'trapped_chest', 'hopper', 'dispenser', 
      'dropper', 'crafter', 'crafting_table', 'enchanting_table', 'anvil', 
      'chipped_anvil', 'damaged_anvil', 'smithing_table', 'grindstone', 'loom', 
      'stonecutter', 'cartography_table', 'lectern', 'beacon', 'jukebox', 
      'lodestone', 'respawn_anchor', 'beehive', 'bee_nest', 'campfire', 
      'soul_campfire', 'cauldron', 'composter', 'flower_pot', 'bell', 'cake'
    ];

    try {
      switch (args.action) {
        case 'dig': {
          const pos = new Vec3(args.target.x, args.target.y, args.target.z);
          const block = bot.blockAt(pos);
          if (!block || block.name === 'air') {
            return errorResult(`Cannot dig: No block at ${pos.x}, ${pos.y}, ${pos.z}.`);
          }
          await bot.dig(block);
          return textResult(obsCtx.observe(bot, `Successfully dug ${block.name} at ${pos.x}, ${pos.y}, ${pos.z}.`));
        }

        case 'place': {
          const item = bot.inventory.items().find(i => i.name === args.item);
          if (!item) {
            return errorResult(`No ${args.item} in inventory. Available items: ${bot.inventory.items().map(i => i.name).join(', ') || '(empty)'}`);
          }
          const pos = new Vec3(args.target.x, args.target.y, args.target.z);
          const referenceBlock = bot.blockAt(new Vec3(pos.x, pos.y - 1, pos.z));
          if (!referenceBlock || referenceBlock.name === 'air') {
            return errorResult(`Cannot place ${args.item}: need a solid block below target position to attach to.`);
          }
          await bot.equip(item, 'hand');
          await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
          return textResult(obsCtx.observe(bot, `Successfully placed ${args.item} at ${pos.x}, ${pos.y}, ${pos.z}.`));
        }

        case 'craft': {
          const itemType = bot.registry.itemsByName[args.item];
          if (!itemType) {
            const suggestions = findClosestMatches(args.item, Object.keys(bot.registry.itemsByName), 3);
            const suggestionsStr = suggestions.length > 0 ? ` Did you mean: '${suggestions.join("', '")}'?` : '';
            return errorResult(`Unknown item '${args.item}'.${suggestionsStr}`);
          }
          const table = bot.findBlock({ matching: bot.registry.blocksByName.crafting_table.id, maxDistance: 6 });
          const recipes = bot.recipesFor(itemType.id, null, args.amount, table);
          if (recipes.length === 0) {
            const allRecipes = bot.recipesFor(itemType.id, null, args.amount, null);
            if (allRecipes.length > 0 && !table) {
              return errorResult(`Cannot craft ${args.item}: requires a crafting table nearby. No crafting table found within 6 blocks. Place one near you first, then try again.`);
            }
            const inventoryNames = bot.inventory.items().map(i => i.name).join(', ');
            return errorResult(`Cannot craft ${args.item}. Missing ingredients. Current inventory: ${inventoryNames || '(empty)'}`);
          }
          await bot.craft(recipes[0], args.amount, table ?? undefined);
          return textResult(obsCtx.observe(bot, `Successfully crafted ${args.amount}x ${args.item}.`));
        }

        case 'use': {
          let targetBlock;
          if (typeof args.target === 'string') {
            const blockType = bot.registry.blocksByName[args.target];
            if (!blockType) {
              const suggestions = findClosestMatches(args.target, Object.keys(bot.registry.blocksByName), 3);
              const suggestionsStr = suggestions.length > 0 ? ` Did you mean: '${suggestions.join("', '")}'?` : '';
              return errorResult(`Unknown block '${args.target}'.${suggestionsStr}`);
            }
            targetBlock = bot.findBlock({ matching: blockType.id, maxDistance: 5 });
          } else {
            targetBlock = bot.blockAt(new Vec3(args.target.x, args.target.y, args.target.z));
          }

          if (!targetBlock || targetBlock.name === 'air') {
            return errorResult(`Cannot use: Target not in range or not found.`);
          }

          const isInteractable = interactableBlocks.includes(targetBlock.name) || 
                                targetBlock.name.includes('door') || 
                                targetBlock.name.includes('gate') || 
                                targetBlock.name.includes('button') || 
                                targetBlock.name.includes('lever') || 
                                targetBlock.name.includes('pressure_plate');

          if (!isInteractable) {
             // Fallback: check if it has a GUI/is usable via trial and error or just allow it
          }

          await bot.lookAt(targetBlock.position);
          
          if (targetBlock.name === 'furnace' || targetBlock.name === 'blast_furnace' || targetBlock.name === 'smoker') {
            await (bot as any).openFurnace(targetBlock);
            return textResult(obsCtx.observe(bot, `Opened ${targetBlock.name} GUI.`));
          }
          
          if (targetBlock.name === 'brewing_stand') {
            if (typeof (bot as any).openBrewingStand === 'function') {
              await (bot as any).openBrewingStand(targetBlock);
            } else {
              await bot.activateBlock(targetBlock);
            }
            return textResult(obsCtx.observe(bot, `Opened brewing stand GUI.`));
          }

          if (targetBlock.name.includes('chest') || targetBlock.name === 'barrel' || targetBlock.name.includes('shulker_box')) {
            await bot.openContainer(targetBlock);
            return textResult(obsCtx.observe(bot, `Opened ${targetBlock.name} container.`));
          }

          await bot.activateBlock(targetBlock);
          return textResult(obsCtx.observe(bot, `Interacted with ${targetBlock.name}.`));
        }

        case 'eat': {
          const item = bot.inventory.items().find(i => i.name === args.item);
          if (!item) return errorResult(`Cannot eat: no ${args.item} in inventory.`);
          await bot.equip(item, 'hand');
          await bot.consume();
          return textResult(obsCtx.observe(bot, `Ate ${args.item}.`));
        }

        default:
          return errorResult(`Unknown interaction action`);
      }
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      return errorResult(`Interaction failed: ${msg}`);
    }
  });
}