import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { findClosestMatches } from '../utils/string-match.js';

function getInventoryCount(bot: any, itemName: string): number {
  const checkItems = itemName === 'cobblestone' ? ['cobblestone', 'cobbled_deepslate'] : [itemName];
  return bot.inventory.items()
    .filter((i: any) => checkItems.includes(i.name))
    .reduce((sum: number, i: any) => sum + i.count, 0);
}

// Some blocks drop a different item name (stone -> cobblestone)
const BLOCK_TO_DROP: Record<string, string> = {
  stone: 'cobblestone',
  grass_block: 'dirt',
  gravel: 'gravel', // may drop flint, but usually gravel
};

const ITEM_TO_BLOCK: Record<string, string[]> = {
  raw_iron: ['iron_ore', 'deepslate_iron_ore'],
  raw_gold: ['gold_ore', 'deepslate_gold_ore'],
  raw_copper: ['copper_ore', 'deepslate_copper_ore'],
  diamond: ['diamond_ore', 'deepslate_diamond_ore'],
  coal: ['coal_ore', 'deepslate_coal_ore'],
  flint: ['gravel'],
  redstone: ['redstone_ore', 'deepslate_redstone_ore'],
  lapis_lazuli: ['lapis_ore', 'deepslate_lapis_ore'],
  emerald: ['emerald_ore', 'deepslate_emerald_ore'],
  cobblestone: ['stone', 'deepslate'],
};

export function registerGatherMaterialsTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('gather_materials', {
    title: 'Gather Materials',
    description: 'Autonomously find, pathfind, equip tools, mine and collect target block types. Pass the block name (e.g. "stone", "oak_log") and the number of items you need in inventory after gathering.',
    inputSchema: { type: z.string(), amount: z.number().positive().max(64) },
  }, async ({ type, amount }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    let targetBlockName = type;
    let blockType = bot.registry.blocksByName[targetBlockName];
    let dropItemName = type;
    let isMapped = false;

    if (!blockType) {
      // Check if it's an item that drops from a block
      const mappedBlocks = ITEM_TO_BLOCK[type];
      if (mappedBlocks) {
        // Find whichever mapped block exists nearby
        let foundBlockName: string | null = null;
        for (const blockName of mappedBlocks) {
          const mappedType = bot.registry.blocksByName[blockName];
          if (mappedType) {
            const found = bot.findBlocks({ matching: mappedType.id, maxDistance: 32, count: 1 });
            if (found.length > 0) {
              foundBlockName = blockName;
              break;
            }
          }
        }
        const finalBlockName = foundBlockName ?? mappedBlocks[0];
        const mappedType = bot.registry.blocksByName[finalBlockName];
        if (mappedType) {
          targetBlockName = finalBlockName;
          blockType = mappedType;
          dropItemName = type;
          isMapped = true;
        }
      }
    }

    if (!blockType) {
      const validNames = Object.keys(bot.registry.blocksByName);
      const suggestions = findClosestMatches(type, validNames, 3);
      if (suggestions.length > 0) {
        return errorResult(`Unknown block type: '${type}'. Did you mean: '${suggestions.join("', '")}'?`);
      }
      return errorResult(`Unknown block type: ${type}`);
    }

    // Determine what item this block drops
    if (!isMapped) {
      dropItemName = BLOCK_TO_DROP[targetBlockName] ?? type;
    }

    // PRE-CHECK: already have enough?
    const alreadyHave = getInventoryCount(bot, dropItemName);
    if (alreadyHave >= amount) {
      const obs = buildObservation(bot,
        `Action skipped: Already have ${alreadyHave}x ${dropItemName} in inventory (need ${amount}). ` +
        `No gathering needed.`
      );
      return textResult(formatObservation(obs));
    }

    const needed = amount - alreadyHave;
    console.log(`[gather_materials] Need ${needed} more ${dropItemName} (have ${alreadyHave}/${amount})`);

    const isCommon = ['stone', 'deepslate', 'dirt', 'grass_block', 'sand', 'gravel', 'netherrack', 'basalt', 'cobblestone', 'cobbled_deepslate'].includes(type);
    const searchRadius = isCommon ? 16 : 32;

    // Build the list of matching block IDs to search for
    const matchingIds: number[] = [];
    if (isMapped && ITEM_TO_BLOCK[type]) {
      for (const blockName of ITEM_TO_BLOCK[type]) {
        const b = bot.registry.blocksByName[blockName];
        if (b) matchingIds.push(b.id);
      }
    } else {
      matchingIds.push(blockType.id);
    }

    try {
      const blocks = bot.findBlocks({
        matching: matchingIds,
        maxDistance: searchRadius,
        count: Math.min(needed + 2, 10),
      });

      if (blocks.length === 0) {
        const obs = buildObservation(bot, `Could not find any ${type} nearby to gather.`);
        return textResult(formatObservation(obs));
      }

      // Helper to check if a block position is in or directly under water
      const isBlockUnderwater = (pos: any) => {
        if (!pos || typeof pos.offset !== 'function') return false;
        for (let dy = 0; dy <= 2; dy++) {
          const checkBlock = bot.blockAt(pos.offset(0, dy, 0));
          if (checkBlock && (checkBlock.name === 'water' || checkBlock.name === 'flowing_water')) {
            return true;
          }
        }
        return false;
      };

      // Explicitly sort blocks by distance to target the closest block first
      blocks.sort((a: any, b: any) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b));

      // Separate blocks into land and water targets
      const landTargets: any[] = [];
      const waterTargets: any[] = [];

      for (const pos of blocks) {
        const b = bot.blockAt(pos);
        if (b !== null) {
          if (isBlockUnderwater(pos)) {
            waterTargets.push(b);
          } else {
            landTargets.push(b);
          }
        }
      }

      // Prioritize land targets, only falling back to water targets if no land targets exist
      const targets = [...landTargets, ...waterTargets];

      // Batched collection — process BATCH_SIZE blocks at a time to limit memory pressure
      const BATCH_SIZE = 4;

      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        // Early exit if we already have enough
        const currentCount = getInventoryCount(bot, dropItemName);
        if (currentCount >= amount) break;

        const batch = targets.slice(i, i + BATCH_SIZE);

        await new Promise<void>((resolve, reject) => {
          let finished = false;

          const cleanup = (fn: () => void) => {
            if (finished) return;
            finished = true;
            bot.removeListener('end', onDisconnect);
            bot.removeListener('kicked', onDisconnect);
            clearInterval(inventoryPoller);
            clearTimeout(hardTimeout);
            fn();
          };

          const onDisconnect = () => cleanup(() => reject(new Error('Bot disconnected during gathering')));

          // Poll inventory every 300ms — stop the moment we have enough
          const inventoryPoller = setInterval(() => {
            const currentCount = getInventoryCount(bot, dropItemName);
            if (currentCount >= amount) {
              console.log(`[gather_materials] Have ${currentCount}x ${dropItemName}, stopping early`);
              try {
                bot.pathfinder.setGoal(null);
                bot.stopDigging();
              } catch { /* ignore */ }
              cleanup(() => resolve());
            }
          }, 300);

          // 12s per batch — well under keepalive threshold
          const hardTimeout = setTimeout(() => {
            try {
              bot.pathfinder.setGoal(null);
              bot.stopDigging();
            } catch { /* ignore */ }
            cleanup(() => resolve()); // resolve, not reject — return whatever we got
          }, 12_000);

          bot.once('end', onDisconnect);
          bot.once('kicked', onDisconnect);

          bot.collectBlock.collect(batch, { ignoreNoPath: true })
            .then(() => cleanup(() => resolve()))
            .catch((err: any) => cleanup(() => reject(err)));
        });

        // Brief yield between batches for GC and keepalive
        await new Promise(resolve => setTimeout(resolve, 150));
      }
 
      // Wait 2 seconds for drops to be collected
      await new Promise(resolve => setTimeout(resolve, 2000));
 
      const finalCount = getInventoryCount(bot, dropItemName);
      const inventoryStr = bot.inventory.items().map((i: any) => `${i.count}x ${i.name}`).join(', ') || 'empty';

      if (finalCount < amount) {
        const obs = buildObservation(bot,
          `Partially gathered ${type}: have ${finalCount}/${amount}x ${dropItemName}. ` +
          `Could not find enough nearby. Inventory: [${inventoryStr}]`
        );
        return textResult(formatObservation(obs));
      }

      const obs = buildObservation(bot,
        `Successfully gathered ${type}. Now have ${finalCount}x ${dropItemName}. ` +
        `Inventory: [${inventoryStr}]`
      );
      return textResult(formatObservation(obs));
    } catch (error: any) {
      const obs = buildObservation(bot, `Failed to gather ${type}: ${error.message}`);
      return textResult(formatObservation(obs));
    }
  });
}
