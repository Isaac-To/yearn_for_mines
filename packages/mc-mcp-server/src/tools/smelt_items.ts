import { outcome, messageOf } from './outcome.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { delay, errorResult } from '@yearn-for-mines/shared';
import { Vec3 } from 'vec3';
import { getInventoryCount } from './interact-crafting.js';
import { findValidPlacementSpot, navigateToBlock } from './interact-world.js';

const SMELTING_RECIPES: Record<string, { input: string; outputPerInput: number }> = {
  iron_ingot: { input: 'raw_iron', outputPerInput: 1 },
  gold_ingot: { input: 'raw_gold', outputPerInput: 1 },
  copper_ingot: { input: 'raw_copper', outputPerInput: 1 },
  glass: { input: 'sand', outputPerInput: 1 },
  smooth_stone: { input: 'stone', outputPerInput: 1 },
  stone: { input: 'cobblestone', outputPerInput: 1 },
  charcoal: { input: 'oak_log', outputPerInput: 1 },
};

const FUEL_EFFICIENCY: Record<string, number> = {
  coal: 8,
  charcoal: 8,
  blaze_rod: 12,
  coal_block: 80,
  oak_planks: 1,
  spruce_planks: 1,
  birch_planks: 1,
  jungle_planks: 1,
  acacia_planks: 1,
  dark_oak_planks: 1,
  mangrove_planks: 1,
  cherry_planks: 1,
  oak_log: 1,
  spruce_log: 1,
  birch_log: 1,
  jungle_log: 1,
  acacia_log: 1,
  dark_oak_log: 1,
  mangrove_log: 1,
  cherry_log: 1,
};

async function findOrPlaceFurnace(bot: any, placeIfMissing: boolean): Promise<
  | { furnaceBlock: any; placedNewFurnace: boolean }
  | { error: string }
> {
  const furnaceBlockId = bot.registry.blocksByName.furnace?.id;
  if (!furnaceBlockId) {
    return { error: 'Furnace block not found in registry.' };
  }

  let furnaceBlock = bot.findBlock({ matching: furnaceBlockId, maxDistance: 32 });
  if (furnaceBlock) {
    return { furnaceBlock, placedNewFurnace: false };
  }

  if (!placeIfMissing) {
    return { error: 'No furnace found nearby.' };
  }

  const furnaceItem = bot.inventory.items().find((i: any) => i.name === 'furnace');
  if (!furnaceItem) {
    return { error: 'No furnace found nearby and no furnace item in inventory.' };
  }

  const botPos = bot.entity?.position;
  if (!botPos) {
    return { error: 'Bot position is undefined.' };
  }

  const searchOffsets = [
    new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1),
    new Vec3(2, 0, 0), new Vec3(-2, 0, 0), new Vec3(0, 0, 2), new Vec3(0, 0, -2),
  ];
  const placement = findValidPlacementSpot(bot, botPos, searchOffsets);
  if (!placement) {
    return { error: 'No valid nearby spot to place a furnace.' };
  }

  await bot.equip(furnaceItem, 'hand');
  await bot.placeBlock(placement.refBlock, new Vec3(0, 1, 0));
  await new Promise(resolve => setTimeout(resolve, 100));

  furnaceBlock = bot.blockAt(placement.pos);
  if (!furnaceBlock || furnaceBlock.type === 0) {
    const nearby = bot.findBlock({ matching: furnaceBlockId, maxDistance: 3, point: placement.pos });
    furnaceBlock = nearby;
  }

  if (!furnaceBlock || furnaceBlock.type === 0) {
    return { error: 'Furnace placement failed: block not found after placement.' };
  }

  return { furnaceBlock, placedNewFurnace: true };
}

export function registerSmeltItemsTool(server: McpServer, manager: BotManager): void {
  server.registerTool('smelt_items', {
    title: 'Smelt Items',
    description: 'Smelt until inventory contains amount of output_item. Reuses nearby furnaces and waits for the full target.',
    inputSchema: {
      output_item: z.string(), amount: z.number().int().positive().max(64).default(1),
      fuel_item: z.string().optional(), place_furnace_if_missing: z.boolean().default(true),
      cleanup_furnace: z.boolean().default(false),
    },
  }, async ({ output_item, amount, fuel_item, place_furnace_if_missing, cleanup_furnace }, extra) => manager.runAction(extra.signal, async signal => {
    const bot = manager.currentBot;
    if (!bot) return errorResult('[DISCONNECTED] Bot not connected');
    const before = getInventoryCount(bot, output_item);
    if (before >= amount) return outcome(bot, 'success', 'Inventory target already met.', { targetReached: true });
    let recipe = SMELTING_RECIPES[output_item];
    if (output_item === 'charcoal') {
      const log = bot.inventory.items().find(item => item.name.endsWith('_log'));
      if (log) recipe = { input: log.name, outputPerInput: 1 };
    }
    if (!recipe) return outcome(bot, 'failed', `Unsupported smelting recipe: ${output_item}`);
    const needed = Math.ceil((amount - before) / recipe.outputPerInput);
    let furnace: Awaited<ReturnType<typeof bot.openFurnace>> | undefined;
    try {
      signal.throwIfAborted();
      const placement = await findOrPlaceFurnace(bot, place_furnace_if_missing);
      if ('error' in placement) return outcome(bot, 'failed', placement.error);
      if (!await navigateToBlock(bot, placement.furnaceBlock.position, 2)) return outcome(bot, 'failed', 'Furnace is unreachable.');
      signal.throwIfAborted();
      furnace = await bot.openFurnace(placement.furnaceBlock);
      signal.throwIfAborted();
      if (output_item === 'charcoal' && furnace.inputItem()?.name.endsWith('_log')) {
        recipe = { input: furnace.inputItem()!.name, outputPerInput: 1 };
      }
      // Do not mix recipes with leftovers from another operation.
      if (furnace.inputItem() && furnace.inputItem()?.name !== recipe.input) await furnace.takeInput();
      if (furnace.outputItem()) await furnace.takeOutput();
      const nowNeeded = Math.max(0, amount - getInventoryCount(bot, output_item));
      if (nowNeeded > 0) {
        const existingInputs = furnace.inputItem()?.count ?? 0;
        const toInsert = Math.max(0, nowNeeded - existingInputs);
        if (getInventoryCount(bot, recipe.input) < toInsert) {
          return outcome(bot, 'failed', `Need ${toInsert}x ${recipe.input} in inventory in addition to furnace contents.`, {
            missingIngredients: { [recipe.input]: toInsert - getInventoryCount(bot, recipe.input) },
          });
        }
        // Reserve input logs and include fuel already inside a reused furnace.
        const currentFuel = furnace.fuelItem();
        const fuels = Object.entries(FUEL_EFFICIENCY).filter(([name]) => !fuel_item || name === fuel_item)
          .map(([name, units]) => ({ name, units, available: getInventoryCount(bot, name) - (name === recipe.input ? toInsert : 0),
            existing: currentFuel?.name === name ? currentFuel.count : 0 }))
          .filter(fuel => (fuel.available + fuel.existing) * fuel.units >= nowNeeded)
          .sort((a, b) => b.existing - a.existing || b.units - a.units);
        const fuel = fuels[0];
        if (!fuel && !furnace.fuel) return outcome(bot, 'failed', `Insufficient supported fuel for ${nowNeeded} inputs after reserving smelting materials.`);
        if (toInsert) await furnace.putInput(bot.registry.itemsByName[recipe.input].id, null, toInsert);
        signal.throwIfAborted();
        if (fuel) {
          if (furnace.fuelItem() && furnace.fuelItem()?.name !== fuel.name) await furnace.takeFuel();
          const fuelCount = Math.max(0, Math.ceil(nowNeeded / fuel.units) - (furnace.fuelItem()?.count ?? 0));
          if (fuelCount) await furnace.putFuel(bot.registry.itemsByName[fuel.name].id, null, fuelCount);
        }
      }
      const deadline = Date.now() + needed * 10_500 + 15_000;
      let lastProgress = Date.now();
      let previous = getInventoryCount(bot, output_item);
      while (getInventoryCount(bot, output_item) < amount && Date.now() < deadline) {
        signal.throwIfAborted();
        if (furnace.outputItem()?.name === output_item) await furnace.takeOutput();
        const current = getInventoryCount(bot, output_item);
        if (current > previous) { lastProgress = Date.now(); previous = current; }
        if (Date.now() - lastProgress > 30_000) break;
        await delay(250, signal);
      }
      furnace.close();
      furnace = undefined;
      const after = getInventoryCount(bot, output_item);
      if (after >= amount && placement.placedNewFurnace && cleanup_furnace) {
        signal.throwIfAborted();
        await bot.dig(placement.furnaceBlock);
      }
      return outcome(bot, after >= amount ? 'success' : after > before ? 'partial' : 'failed',
        after >= amount ? `Smelted ${output_item} to target.` : 'Smelting stalled before the full target; inspect remaining fuel and furnace contents.',
        { item: output_item, target: amount, targetReached: after >= amount, gained: after - before });
    } catch (error) {
      signal.throwIfAborted();
      return outcome(bot, getInventoryCount(bot, output_item) > before ? 'partial' : 'failed', messageOf(error));
    } finally {
      try { furnace?.close(); } catch { /* disconnected or already closed */ }
    }
  }));
}
