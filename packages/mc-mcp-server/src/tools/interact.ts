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

const interactableBlocksDesc = `Interactable blocks: ${INTERACTABLE_BLOCKS.join(', ')}, and any block matching: ${INTERACTABLE_PATTERNS.join(', ')}.`;

const botGuard = (botManager: BotManager) => {
  const bot = botManager.currentBot;
  if (!bot) return null;
  return bot;
};

export function registerInteractTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('dig', {
    title: 'Dig',
    description: `Break a block at target coordinates. Requires a solid block at the position. ${interactableBlocksDesc}`,
    inputSchema: z.object({
      target: z.object({ x: z.number(), y: z.number(), z: z.number() }).describe('Block coordinates to dig'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleDig(bot, args.target); }
    catch (error: any) { return errorResult(`Dig failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('place', {
    title: 'Place',
    description: `Place an item from inventory at target position. Requires a solid block directly below the target position. ${interactableBlocksDesc}`,
    inputSchema: z.object({
      item: z.string().describe('Item name to place'),
      target: z.object({ x: z.number(), y: z.number(), z: z.number() }).describe('Target coordinates'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handlePlace(bot, args.item, args.target); }
    catch (error: any) { return errorResult(`Place failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('craft', {
    title: 'Craft',
    description: 'Craft an item. Auto-finds a crafting table within 6 blocks; returns error if none found.',
    inputSchema: z.object({
      item: z.string().describe('Item name to craft'),
      amount: z.number().default(1).describe('Quantity to craft'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleCraft(bot, args.item, args.amount); }
    catch (error: any) { return errorResult(`Craft failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('smelt', {
    title: 'Smelt',
    description: 'Place input+fuel in a furnace to begin smelting.',
    inputSchema: z.object({
      item: z.string().describe('Input item to smelt'),
      fuel: z.string().describe('Fuel item (e.g. "coal", "oak_planks")'),
      amount: z.number().default(1).describe('Quantity to smelt'),
      target: targetSchema.describe('Furnace block'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleSmelt(bot, args.item, args.fuel, args.amount, args.target); }
    catch (error: any) { return errorResult(`Smelt failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('smelt_take_output', {
    title: 'Smelt Take Output',
    description: 'Retrieve finished output from a furnace.',
    inputSchema: z.object({
      target: targetSchema.describe('Furnace block to take output from'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleSmeltTakeOutput(bot, args.target); }
    catch (error: any) { return errorResult(`Smelt take output failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('use', {
    title: 'Use Block',
    description: `Activate/interact with a block (open doors, flip levers, open chests, etc.). ${interactableBlocksDesc}`,
    inputSchema: z.object({
      target: targetSchema.describe('Block to use/activate'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleUse(bot, args.target); }
    catch (error: any) { return errorResult(`Use failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('deposit', {
    title: 'Deposit',
    description: 'Move items from inventory into a container (chest, barrel, furnace, etc.).',
    inputSchema: z.object({
      item: z.string().describe('Item to deposit'),
      amount: z.number().default(1).describe('Number of items to transfer'),
      target: targetSchema.describe('Container block name (e.g. "chest", "barrel") or coordinates'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleDeposit(bot, args.item, args.amount, args.target); }
    catch (error: any) { return errorResult(`Deposit failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('withdraw', {
    title: 'Withdraw',
    description: 'Move items from a container into inventory.',
    inputSchema: z.object({
      item: z.string().describe('Item to withdraw'),
      amount: z.number().default(1).describe('Number of items to transfer'),
      target: targetSchema.describe('Container block name (e.g. "chest", "barrel") or coordinates'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleWithdraw(bot, args.item, args.amount, args.target); }
    catch (error: any) { return errorResult(`Withdraw failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('enchant', {
    title: 'Enchant',
    description: 'Enchant an item at an enchanting table. Place item+lapis, select slot.',
    inputSchema: z.object({
      item: z.string().describe('Item to enchant (from inventory)'),
      lapis: z.string().default('lapis_lazuli').describe('Lapis lazuli item name (default "lapis_lazuli")'),
      enchantmentSlot: z.number().describe('Enchantment slot to select (0, 1, or 2, where 0 is the top slot offering the lowest-level enchantment)'),
      target: targetSchema.describe('Enchanting table'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleEnchant(bot, args.item, args.lapis, args.enchantmentSlot, args.target); }
    catch (error: any) { return errorResult(`Enchant failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('anvil_combine', {
    title: 'Anvil Combine',
    description: 'Combine two items on an anvil.',
    inputSchema: z.object({
      item1: z.string().describe('First item name'),
      item2: z.string().describe('Second item name'),
      name: z.string().optional().describe('Optional custom name for result'),
      target: targetSchema.describe('Anvil block'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleAnvilCombine(bot, args.item1, args.item2, args.name, args.target); }
    catch (error: any) { return errorResult(`Anvil combine failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('anvil_rename', {
    title: 'Anvil Rename',
    description: 'Rename an item on an anvil.',
    inputSchema: z.object({
      item: z.string().describe('Item to rename'),
      name: z.string().describe('New name'),
      target: targetSchema.describe('Anvil block'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleAnvilRename(bot, args.item, args.name, args.target); }
    catch (error: any) { return errorResult(`Anvil rename failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('trade', {
    title: 'Trade',
    description: 'Trade with a villager entity. Use observe to see available trades first.',
    inputSchema: z.object({
      trade_index: z.number().describe('Trade slot index (0-based; observe villager first to see available trades)'),
      count: z.number().default(1).describe('Number of trades'),
      target_entity: z.string().describe('Villager entity name'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleTrade(bot, args.trade_index, args.count, args.target_entity); }
    catch (error: any) { return errorResult(`Trade failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('eat', {
    title: 'Eat',
    description: 'Consume a food item from inventory.',
    inputSchema: z.object({
      item: z.string().describe('Food item to eat'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleEat(bot, args.item); }
    catch (error: any) { return errorResult(`Eat failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('fish', {
    title: 'Fish',
    description: 'Fish with a fishing rod. Requires a fishing rod in inventory. Catches one item per call.',
    inputSchema: z.object({}),
  }, async () => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleFish(bot); }
    catch (error: any) { return errorResult(`Fish failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('sleep', {
    title: 'Sleep',
    description: 'Sleep in a bed until morning. Bot wakes at dawn.',
    inputSchema: z.object({
      target: targetSchema.describe('Bed block name or coordinates'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleSleep(bot, args.target); }
    catch (error: any) { return errorResult(`Sleep failed: ${error instanceof Error ? error.message : String(error)}`); }
  });

  server.registerTool('sign_edit', {
    title: 'Sign Edit',
    description: 'Write text on a sign.',
    inputSchema: z.object({
      target: targetSchema.describe('Sign block name or coordinates'),
      text: z.string().describe('Text to write on sign'),
      back: z.boolean().default(false).describe('Write on back side'),
    }),
  }, async (args) => {
    const bot = botGuard(botManager);
    if (!bot) return errorResult('Bot not connected');
    try { return await handleSignEdit(bot, args.target, args.text, args.back); }
    catch (error: any) { return errorResult(`Sign edit failed: ${error instanceof Error ? error.message : String(error)}`); }
  });
}