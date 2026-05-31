import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { findClosestMatches } from '../utils/string-match.js';

const ALL_LOG_TYPES = [
  'oak_log', 'spruce_log', 'birch_log', 'jungle_log',
  'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log',
  'pale_oak_log', 'bamboo_block',
];

function isLogType(name: string): boolean {
  return ALL_LOG_TYPES.includes(name);
}

function getInventoryCount(bot: any, itemName: string): number {
  let checkItems: string[];
  if (itemName === 'cobblestone') {
    checkItems = ['cobblestone', 'cobbled_deepslate'];
  } else if (isLogType(itemName)) {
    // Count any log species toward the goal
    checkItems = ALL_LOG_TYPES;
  } else {
    checkItems = [itemName];
  }
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

// All log species mapped to themselves so any specific log type triggers a
// multi-block search covering every tree species in the world.
const LOG_ITEM_TO_BLOCK: Record<string, string[]> = Object.fromEntries(
  ALL_LOG_TYPES.map(log => [log, ALL_LOG_TYPES])
);

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
  ...LOG_ITEM_TO_BLOCK,
};

export function registerGatherMaterialsTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('gather_materials', {
    title: 'Gather Materials',
    description: 'Autonomously find, pathfind, equip tools, mine and collect target block types. Pass the block name (e.g. "stone", "oak_log") and the number of items you need in inventory after gathering. When gathering any log type (oak_log, spruce_log, etc.) ALL log species are searched simultaneously so the nearest available tree is used.',
    inputSchema: { type: z.string(), amount: z.number().positive().max(64) },
  }, async ({ type, amount }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    let targetBlockName = type;
    let blockType = bot.registry.blocksByName[targetBlockName];
    let dropItemName = type;
    let isMapped = false;

    // Check ITEM_TO_BLOCK FIRST — this handles cases where the type is also a
    // valid block name (e.g. oak_log) but we still want to search all variants.
    const mappedBlocks = ITEM_TO_BLOCK[type];
    if (mappedBlocks) {
      // Search for whichever mapped block is nearest
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
    } else if (!blockType) {
      // Not in ITEM_TO_BLOCK and not a known block name — try to suggest alternatives
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
    const initialSearchRadius = isCommon ? 16 : 32;

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
      // Helper function to progressively expand search radius for diamonds
      const findBlocksWithExpansion = (): any[] => {
        // Check for diamond-related materials (diamond, diamond_ore, deepslate_diamond_ore, etc.)
        const isDiamondMaterial = type.includes('diamond') || dropItemName.includes('diamond');
        const searchRadii = isDiamondMaterial ? [32, 64, 128, 256] : [initialSearchRadius];
        
        for (const radius of searchRadii) {
          const found = bot.findBlocks({
            matching: matchingIds,
            maxDistance: radius,
            count: Math.min(needed + 2, 10),
          });
          
          if (found.length > 0) {
            if (isDiamondMaterial && radius > initialSearchRadius) {
              console.log(`[gather_materials] Diamond search expanded: found ${found.length} blocks at ${radius} block radius`);
            }
            return found;
          }
          
          if (isDiamondMaterial && radius < 256) {
            console.log(`[gather_materials] No diamonds found at ${radius} block radius, expanding search...`);
          }
        }
        
        return [];
      };

      const blocks = findBlocksWithExpansion();

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
        // Before processing batch, check if we already have enough
        const preCheckCount = getInventoryCount(bot, dropItemName);
        if (preCheckCount >= amount) {
          console.log(`[gather_materials] Already have target amount (${preCheckCount}/${amount}), skipping remaining batches`);
          break;
        }

        let batch = targets.slice(i, i + BATCH_SIZE);
        if (batch.length === 0) break;

        // Only collect blocks we need to reach target (with +1 buffer for safety)
        const blocksNeeded = Math.max(0, amount - preCheckCount);
        const batchSize = Math.min(batch.length, blocksNeeded + 1);
        batch = batch.slice(0, batchSize);

        console.log(`[gather_materials] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} blocks (need ${blocksNeeded} more)`);

        await new Promise<void>((resolve, reject) => {
          let finished = false;

          const cleanup = (fn: () => void) => {
            if (finished) return;
            finished = true;
            bot.removeListener('end', onDisconnect);
            bot.removeListener('kicked', onDisconnect);
            clearInterval(batchCheckInterval);
            clearTimeout(hardTimeout);
            fn();
          };

          const onDisconnect = () => cleanup(() => reject(new Error('Bot disconnected during gathering')));

          // Check inventory between batches (but don't interrupt current batch)
          let batchStartCount = getInventoryCount(bot, dropItemName);
          let lastCheckCount = batchStartCount;
          let staleCount = 0;

          const batchCheckInterval = setInterval(() => {
            const currentCount = getInventoryCount(bot, dropItemName);
            if (currentCount === lastCheckCount) {
              staleCount++;
            } else {
              staleCount = 0;
              lastCheckCount = currentCount;
            }
            
            // If inventory hasn't changed for 3+ checks (0.9s), log progress
            if (staleCount > 3) {
              console.log(`[gather_materials] Batch stalled: collected ${currentCount - batchStartCount} items from batch`);
            }
          }, 300);

          // Calculate timeout based on batch size
          // Each block typically takes 0.5-3 seconds to mine depending on tool and block
          // Use 30s base + 8s per block in batch for safety
          const batchTimeout = 30_000 + (batch.length * 8_000);
          console.log(`[gather_materials] Batch timeout: ${batchTimeout / 1000}s for ${batch.length} blocks`);

          const hardTimeout = setTimeout(() => {
            console.log(`[gather_materials] Batch timeout reached (${batchTimeout / 1000}s), moving to next batch`);
            try {
              bot.pathfinder.setGoal(null);
              bot.stopDigging();
            } catch { /* ignore */ }
            cleanup(() => resolve());
          }, batchTimeout);

          bot.once('end', onDisconnect);
          bot.once('kicked', onDisconnect);

          bot.collectBlock.collect(batch, { ignoreNoPath: true })
            .then(() => {
              const batchCount = getInventoryCount(bot, dropItemName);
              const collected = batchCount - batchStartCount;
              console.log(`[gather_materials] Batch complete: collected ${collected} items (total: ${batchCount}/${amount})`);
              cleanup(() => resolve());
            })
            .catch((err: any) => {
              console.warn(`[gather_materials] Batch error: ${(err as any)?.message}`);
              // Don't reject on batch error — just move to next batch
              cleanup(() => resolve());
            });
        });

        // Check if we have enough before next batch
        const currentCount = getInventoryCount(bot, dropItemName);
        if (currentCount >= amount) {
          console.log(`[gather_materials] Target reached after batch: ${currentCount}/${amount}, stopping collection`);
          break;
        }

        // Yield between batches for drops to settle and bot to recover
        console.log(`[gather_materials] Yield between batches (300ms)`);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
 
      // Extended wait for final drops and collection to complete
      console.log(`[gather_materials] Waiting for drops to settle (2 seconds)...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
 
      let finalCount = getInventoryCount(bot, dropItemName);

      // Check if we already have enough before attempting extended radius search
      if (finalCount >= amount) {
        console.log(`[gather_materials] Already have target amount after main collection: ${finalCount}/${amount}, skipping extended search`);
        const inventoryStr = bot.inventory.items().map((i: any) => `${i.count}x ${i.name}`).join(', ') || 'empty';
        const obs = buildObservation(bot,
          `Successfully gathered ${type}. Now have ${finalCount}x ${dropItemName}. ` +
          `Inventory: [${inventoryStr}]`
        );
        return textResult(formatObservation(obs));
      }

      // Get inventory string for logging (may be used in partial gathering results)
      const inventoryStr = bot.inventory.items().map((i: any) => `${i.count}x ${i.name}`).join(', ') || 'empty';

      if (finalCount < amount) {
        const shortage = amount - finalCount;
        console.log(`[gather_materials] Shortage detected: need ${shortage} more ${dropItemName}`);
        
        // For diamonds, progressively expand radius. For other materials, just try 64
        const isDiamondMaterial = type.includes('diamond') || dropItemName.includes('diamond');
        const extendedRadii = isDiamondMaterial ? [64, 128, 256] : [64];
        
        for (const extendedRadius of extendedRadii) {
          if (finalCount >= amount) break;
          
          const extendedBlocks = bot.findBlocks({
            matching: matchingIds,
            maxDistance: extendedRadius,
            count: Math.min(shortage + 2, 10),
          });

          if (extendedBlocks.length > 0) {
            console.log(`[gather_materials] Found ${extendedBlocks.length} additional blocks at ${extendedRadius} block radius, retrying collection...`);
            
            // Sort and separate water/land again
            extendedBlocks.sort((a: any, b: any) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b));
            const extendedLand: any[] = [];
            const extendedWater: any[] = [];
            for (const pos of extendedBlocks) {
              const b = bot.blockAt(pos);
              if (b !== null) {
                if (isBlockUnderwater(pos)) {
                  extendedWater.push(b);
                } else {
                  extendedLand.push(b);
                }
              }
            }
            const extendedTargets = [...extendedLand, ...extendedWater];

            // Only collect blocks we still need
            const remainingNeeded = Math.max(0, amount - finalCount);
            const limitedTargets = extendedTargets.slice(0, remainingNeeded + 1);
            console.log(`[gather_materials] Limiting extended targets to ${limitedTargets.length} blocks (need ${remainingNeeded} more)`);

            // Process extended targets with timeout per block
            for (let extIdx = 0; extIdx < limitedTargets.length; extIdx++) {
              const block = limitedTargets[extIdx];
              const currentCount = getInventoryCount(bot, dropItemName);
              if (currentCount >= amount) {
                console.log(`[gather_materials] Target reached during extended collection: ${currentCount}/${amount}`);
                break;
              }

              await new Promise<void>((resolve) => {
                let finished = false;

                const cleanup = (fn: () => void) => {
                  if (finished) return;
                  finished = true;
                  bot.removeListener('end', onDisconnect);
                  bot.removeListener('kicked', onDisconnect);
                  clearTimeout(extensionTimeout);
                  fn();
                };

                const onDisconnect = () => cleanup(() => resolve());
                // Shorter timeout for single block in extended search
                const extensionTimeout = setTimeout(() => {
                  try {
                    bot.pathfinder.setGoal(null);
                    bot.stopDigging();
                  } catch { /* ignore */ }
                  cleanup(() => resolve());
                }, 20_000); // 20s per extended block

                bot.once('end', onDisconnect);
                bot.once('kicked', onDisconnect);

                bot.collectBlock.collect([block], { ignoreNoPath: true })
                  .then(() => cleanup(() => resolve()))
                  .catch(() => cleanup(() => resolve()));
              });

              if (extIdx < limitedTargets.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }

            // Final settlement wait
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Update finalCount after extended collection
            finalCount = getInventoryCount(bot, dropItemName);
          } else if (isDiamondMaterial && extendedRadius < 256) {
            console.log(`[gather_materials] No additional diamonds found at ${extendedRadius} block radius, trying further...`);
          }
        }

        const retryCount = getInventoryCount(bot, dropItemName);
        if (retryCount < amount) {
          const obs = buildObservation(bot,
            `Partially gathered ${type}: have ${retryCount}/${amount}x ${dropItemName}. ` +
            `Could not find enough blocks in search radius. Inventory: [${inventoryStr}]`
          );
          return textResult(formatObservation(obs));
        }
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
