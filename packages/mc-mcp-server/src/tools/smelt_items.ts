import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { findClosestMatches } from '../utils/string-match.js';
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

function chooseFuel(bot: any, unitsNeeded: number, preferredFuel?: string):
  | { fuelName: string; fuelCount: number; providesUnits: number }
  | { error: string } {
  if (preferredFuel) {
    const unitValue = FUEL_EFFICIENCY[preferredFuel];
    if (!unitValue) {
      return { error: `Unsupported fuel '${preferredFuel}'.` };
    }
    const available = getInventoryCount(bot, preferredFuel);
    const requiredFuelCount = Math.ceil(unitsNeeded / unitValue);
    if (available < requiredFuelCount) {
      return { error: `Not enough ${preferredFuel}. Need ${requiredFuelCount}, have ${available}.` };
    }
    return {
      fuelName: preferredFuel,
      fuelCount: requiredFuelCount,
      providesUnits: requiredFuelCount * unitValue,
    };
  }

  for (const [fuelName, unitValue] of Object.entries(FUEL_EFFICIENCY)) {
    const available = getInventoryCount(bot, fuelName);
    if (available <= 0) continue;
    const requiredFuelCount = Math.ceil(unitsNeeded / unitValue);
    if (available >= requiredFuelCount) {
      return {
        fuelName,
        fuelCount: requiredFuelCount,
        providesUnits: requiredFuelCount * unitValue,
      };
    }
  }

  return { error: `No usable furnace fuel available for ${unitsNeeded} smelting operations.` };
}

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

export function registerSmeltItemsTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('smelt_items', {
    title: 'Smelt Items',
    description: 'Smelt items in a furnace using available fuel. Can place a furnace if missing.',
    inputSchema: {
      output_item: z.string(),
      amount: z.number().int().positive().max(64).default(1),
      fuel_item: z.string().optional(),
      place_furnace_if_missing: z.boolean().default(true),
      cleanup_furnace: z.boolean().default(false),
    },
  }, async ({ output_item, amount, fuel_item, place_furnace_if_missing, cleanup_furnace }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    const recipe = SMELTING_RECIPES[output_item];
    if (!recipe) {
      const suggestions = findClosestMatches(output_item, Object.keys(SMELTING_RECIPES), 3);
      const suggestionStr = suggestions.length > 0 ? ` Did you mean: '${suggestions.join("', '")}'?` : '';
      return textResult(formatObservation(buildObservation(bot,
        `Cannot smelt '${output_item}': no supported smelting recipe found.${suggestionStr}`
      )));
    }

    const outputBefore = getInventoryCount(bot, output_item);
    if (outputBefore >= amount) {
      return textResult(formatObservation(buildObservation(bot,
        `Action skipped: Already have ${outputBefore}x ${output_item} (need ${amount}).`
      )));
    }

    const outputNeeded = amount - outputBefore;
    const inputNeeded = Math.ceil(outputNeeded / recipe.outputPerInput);
    const inputAvailable = getInventoryCount(bot, recipe.input);
    if (inputAvailable < inputNeeded) {
      return textResult(formatObservation(buildObservation(bot,
        `Cannot smelt ${output_item}: Need ${inputNeeded}x ${recipe.input}, have ${inputAvailable}.`
      )));
    }

    const fuelChoice = chooseFuel(bot, inputNeeded, fuel_item);
    if ('error' in fuelChoice) {
      return textResult(formatObservation(buildObservation(bot, `Cannot smelt ${output_item}: ${fuelChoice.error}`)));
    }

    try {
      const furnaceResult = await findOrPlaceFurnace(bot, place_furnace_if_missing ?? true);
      if ('error' in furnaceResult) {
        return textResult(formatObservation(buildObservation(bot, `Cannot smelt ${output_item}: ${furnaceResult.error}`)));
      }

      const { furnaceBlock, placedNewFurnace } = furnaceResult;
      const navigated = await navigateToBlock(bot, furnaceBlock.position, 3);
      if (!navigated) {
        return textResult(formatObservation(buildObservation(bot, `Cannot smelt ${output_item}: Failed to navigate to furnace.`)));
      }

      const furnace: any = await (bot as any).openFurnace(furnaceBlock);
      const inputItem = bot.registry.itemsByName[recipe.input];
      const fuelItem = bot.registry.itemsByName[fuelChoice.fuelName];
      if (!inputItem || !fuelItem) {
        try { furnace.close(); } catch { /* ignore */ }
        return textResult(formatObservation(buildObservation(bot,
          `Cannot smelt ${output_item}: Item registry lookup failed for input or fuel.`
        )));
      }

      await furnace.putInput(inputItem.id, null, inputNeeded);
      await furnace.putFuel(fuelItem.id, null, fuelChoice.fuelCount);

      const maxWaitMs = Math.min(120_000, Math.max(8_000, inputNeeded * 12_000));
      const start = Date.now();

      while (Date.now() - start < maxWaitMs) {
        const currentOutput = furnace.outputItem?.();
        if (currentOutput && currentOutput.name === output_item && currentOutput.count > 0) {
          await furnace.takeOutput();
          const afterTake = getInventoryCount(bot, output_item);
          if (afterTake >= amount) {
            break;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      try { furnace.close(); } catch { /* ignore */ }

      const outputAfter = getInventoryCount(bot, output_item);
      const gained = Math.max(0, outputAfter - outputBefore);
      if (gained <= 0) {
        return textResult(formatObservation(buildObservation(bot,
          `Smelting did not produce ${output_item} in time. Try again with more fuel or wait longer.`
        )));
      }

      let cleanupStatus = '';
      if (placedNewFurnace && cleanup_furnace) {
        try {
          const blockNow = bot.blockAt(furnaceBlock.position);
          if (blockNow && blockNow.type !== 0) {
            await bot.dig(blockNow);
            cleanupStatus = ' (cleaned up furnace)';
          }
        } catch {
          cleanupStatus = ' (furnace cleanup failed)';
        }
      }

      return textResult(formatObservation(buildObservation(bot,
        `Successfully smelted ${gained}x ${output_item} using ${fuelChoice.fuelCount}x ${fuelChoice.fuelName}.${cleanupStatus}`
      )));
    } catch (error: any) {
      return textResult(formatObservation(buildObservation(bot, `Failed to smelt ${output_item}: ${error.message}`)));
    }
  });
}
