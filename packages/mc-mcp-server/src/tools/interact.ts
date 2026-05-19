import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { errorResult } from '@yearn-for-mines/shared';
import { INTERACTABLE_BLOCKS, INTERACTABLE_PATTERNS } from './interact-helpers.js';
import { handleDig, handlePlace } from './interact-world.js';
import { handleUse, handleDeposit, handleWithdraw } from './interact-containers.js';
import {
  handleCraft, handleSmelt, handleSmeltTakeOutput,
  handleEnchant, handleAnvilCombine, handleAnvilRename, handleTrade,
} from './interact-crafting.js';
import { handleEat, handleFish, handleSleep, handleSignEdit } from './interact-utility.js';

const targetSchema = z.union([
  z.string().describe('Name of the block type to find (e.g. "furnace", "chest", "bed")'),
  z.object({ x: z.number(), y: z.number(), z: z.number() }).describe('Specific coordinates'),
]);

export function registerInteractTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('interact', {
    title: 'Unified Interact',
    description: [
      'Interact with the Minecraft world. Each action has specific parameters:',
      '',
      'dig — Break a block at target coordinates. Requires solid block at position.',
      '  target: {x, y, z} block coordinates to dig',
      '',
      'place — Place an item from inventory at target position. Requires a solid block directly below the target position.',
      '  item: item name to place  target: {x, y, z} coordinates',
      '',
      'craft — Craft an item. Auto-finds a crafting table within 6 blocks; returns error if none found.',
      '  item: item name to craft  amount: quantity (default 1)',
      '',
      'smelt — Place input+fuel in a furnace to begin smelting.',
      '  item: input item  fuel: fuel item (e.g. "coal")  amount: quantity (default 1)  target: furnace block name or coordinates',
      '',
      'smelt_take_output — Retrieve finished output from a furnace.',
      '  target: furnace block name or coordinates',
      '',
      'use — Activate/interact with a block (open doors, flip levers, etc.).',
      '  target: block name or {x, y, z} coordinates',
      '',
      'deposit — Move items from inventory into a container.',
      '  item: item name  amount: number of items to transfer (default 1)  target: container block name or coordinates',
      '',
      'withdraw — Move items from a container into inventory.',
      '  item: item name  amount: number of items to transfer (default 1)  target: container block name or coordinates',
      '',
      'enchant — Enchant an item at an enchanting table. Place item+lapis, select slot.',
      '  item: item name from inventory  lapis: lapis item name (default "lapis_lazuli")  enchantmentSlot: slot index 0, 1, or 2 (0=top/lowest level)  target: enchanting_table block',
      '',
      'anvil_combine — Combine two items on an anvil.',
      '  item1: first item name  item2: second item name  name: optional custom name  target: anvil block',
      '',
      'anvil_rename — Rename an item on an anvil.',
      '  item: item name  name: new name  target: anvil block',
      '',
      'trade — Trade with a villager entity. Use observe to see available trades first.',
      '  trade_index: 0-based trade slot index  count: number of trades (default 1)  target_entity: villager entity name',
      '',
      'eat — Consume a food item from inventory.',
      '  item: food item name',
      '',
      'fish — Fish with a fishing rod. Requires a fishing rod in inventory. Catches one item per call.',
      '',
      'sleep — Sleep in a bed until morning. Bot wakes at dawn.',
      '  target: bed block name or coordinates',
      '',
      'sign_edit — Write text on a sign.',
      '  target: sign block name or coordinates  text: text to write  back: write on back side (default false)',
      '',
      `Interactable blocks: ${INTERACTABLE_BLOCKS.join(', ')}, and any block matching: ${INTERACTABLE_PATTERNS.join(', ')}.`,
    ].join('\n'),
    inputSchema: z.discriminatedUnion('action', [
      z.object({
        action: z.literal('dig'),
        target: z.object({ x: z.number(), y: z.number(), z: z.number() }).describe('Block coordinates to dig'),
      }),
      z.object({
        action: z.literal('place'),
        item: z.string().describe('Item name to place'),
        target: z.object({ x: z.number(), y: z.number(), z: z.number() }).describe('Target coordinates'),
      }),
      z.object({
        action: z.literal('craft'),
        item: z.string().describe('Item name to craft'),
        amount: z.number().default(1).describe('Quantity to craft'),
      }),
      z.object({
        action: z.literal('smelt'),
        item: z.string().describe('Input item to smelt'),
        fuel: z.string().describe('Fuel item (e.g. "coal", "oak_planks")'),
        amount: z.number().default(1).describe('Quantity to smelt'),
        target: targetSchema.describe('Furnace block'),
      }),
      z.object({
        action: z.literal('smelt_take_output'),
        target: targetSchema.describe('Furnace block to take output from'),
      }),
      z.object({
        action: z.literal('use'),
        target: targetSchema.describe('Block to use/activate'),
      }),
      z.object({
        action: z.literal('deposit'),
        item: z.string().describe('Item to deposit'),
        amount: z.number().default(1).describe('Number of items to transfer'),
        target: targetSchema.describe('Container block name (e.g. "chest", "barrel") or coordinates'),
      }),
      z.object({
        action: z.literal('withdraw'),
        item: z.string().describe('Item to withdraw'),
        amount: z.number().default(1).describe('Number of items to transfer'),
        target: targetSchema.describe('Container block name (e.g. "chest", "barrel") or coordinates'),
      }),
      z.object({
        action: z.literal('enchant'),
        item: z.string().describe('Item to enchant (from inventory)'),
        lapis: z.string().default('lapis_lazuli').describe('Lapis lazuli item name (default "lapis_lazuli")'),
        enchantmentSlot: z.number().describe('Enchantment slot to select (0, 1, or 2, where 0 is the top slot offering the lowest-level enchantment)'),
        target: targetSchema.describe('Enchanting table'),
      }),
      z.object({
        action: z.literal('anvil_combine'),
        item1: z.string().describe('First item name'),
        item2: z.string().describe('Second item name'),
        name: z.string().optional().describe('Optional custom name for result'),
        target: targetSchema.describe('Anvil block'),
      }),
      z.object({
        action: z.literal('anvil_rename'),
        item: z.string().describe('Item to rename'),
        name: z.string().describe('New name'),
        target: targetSchema.describe('Anvil block'),
      }),
      z.object({
        action: z.literal('trade'),
        trade_index: z.number().describe('Trade slot index (0-based; observe villager first to see available trades)'),
        count: z.number().default(1).describe('Number of trades'),
        target_entity: z.string().describe('Villager entity name'),
      }),
      z.object({
        action: z.literal('eat'),
        item: z.string().describe('Food item to eat'),
      }),
      z.object({
        action: z.literal('fish'),
      }),
      z.object({
        action: z.literal('sleep'),
        target: targetSchema.describe('Bed block. Bot sleeps until morning.'),
      }),
      z.object({
        action: z.literal('sign_edit'),
        target: targetSchema.describe('Sign block'),
        text: z.string().describe('Text to write on sign'),
        back: z.boolean().default(false).describe('Write on back side'),
      }),
    ]),
  }, async (args) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    try {
      switch (args.action) {
        case 'dig':
          return await handleDig(bot, args.target);
        case 'place':
          return await handlePlace(bot, args.item, args.target);
        case 'craft':
          return await handleCraft(bot, args.item, args.amount);
        case 'smelt':
          return await handleSmelt(bot, args.item, args.fuel, args.amount, args.target);
        case 'smelt_take_output':
          return await handleSmeltTakeOutput(bot, args.target);
        case 'use':
          return await handleUse(bot, args.target);
        case 'deposit':
          return await handleDeposit(bot, args.item, args.amount, args.target);
        case 'withdraw':
          return await handleWithdraw(bot, args.item, args.amount, args.target);
        case 'enchant':
          return await handleEnchant(bot, args.item, args.lapis, args.enchantmentSlot, args.target);
        case 'anvil_combine':
          return await handleAnvilCombine(bot, args.item1, args.item2, args.name, args.target);
        case 'anvil_rename':
          return await handleAnvilRename(bot, args.item, args.name, args.target);
        case 'trade':
          return await handleTrade(bot, args.trade_index, args.count, args.target_entity);
        case 'eat':
          return await handleEat(bot, args.item);
        case 'fish':
          return await handleFish(bot);
        case 'sleep':
          return await handleSleep(bot, args.target);
        case 'sign_edit':
          return await handleSignEdit(bot, args.target, args.text, args.back);
        default:
          return errorResult(`Unknown action: ${(args as any).action}`);
      }
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      return errorResult(`Interaction failed: ${msg}`);
    }
  });
}