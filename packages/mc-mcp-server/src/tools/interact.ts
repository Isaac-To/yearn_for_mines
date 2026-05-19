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
    description: `Unified tool for world interaction. Actions: dig, place, craft, smelt, use, deposit, withdraw, enchant, anvil_combine, anvil_rename, trade, eat, fish, sleep, sign_edit. ` +
      `Craft needs crafting_table nearby for 3x3 recipes. Smelt places input+fuel in furnace. ` +
      `Deposit/withdraw move items between inventory and containers. ` +
      `Enchant places item+lapis in enchanting table. ` +
      `Anvil combine/rename uses anvil. Trade with villager entities. ` +
      `Sleep sleeps in a bed until morning. Sign_edit writes text on signs. ` +
      `Interactable blocks: ${INTERACTABLE_BLOCKS.join(', ')}, and any block matching: ${INTERACTABLE_PATTERNS.join(', ')}.`,
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
        amount: z.number().default(1).describe('Quantity'),
        target: targetSchema.describe('Container block'),
      }),
      z.object({
        action: z.literal('withdraw'),
        item: z.string().describe('Item to withdraw'),
        amount: z.number().default(1).describe('Quantity'),
        target: targetSchema.describe('Container block'),
      }),
      z.object({
        action: z.literal('enchant'),
        item: z.string().describe('Item to enchant (from inventory)'),
        lapis: z.string().default('lapis_lazuli').describe('Lapis item name'),
        level: z.number().describe('Enchantment slot 0-2'),
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
        trade_index: z.number().describe('Trade slot index (0-based)'),
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
          return await handleEnchant(bot, args.item, args.lapis, args.level, args.target);
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