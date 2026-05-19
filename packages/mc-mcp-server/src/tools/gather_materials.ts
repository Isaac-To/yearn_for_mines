import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { findClosestMatches } from '../utils/string-match.js';

function getInventoryCount(bot: any, itemName: string): number {
  return bot.inventory.items()
    .filter((i: any) => i.name === itemName)
    .reduce((sum: number, i: any) => sum + i.count, 0);
}

// Some blocks drop a different item name (stone -> cobblestone)
const BLOCK_TO_DROP: Record<string, string> = {
  stone: 'cobblestone',
  grass_block: 'dirt',
  gravel: 'gravel', // may drop flint, but usually gravel
};

export function registerGatherMaterialsTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('gather_materials', {
    title: 'Gather Materials',
    description: 'Autonomously find, pathfind, equip tools, mine and collect target block types. Pass the block name (e.g. "stone", "oak_log") and the number of items you need in inventory after gathering.',
    inputSchema: { type: z.string(), amount: z.number().positive().max(64) },
  }, async ({ type, amount }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    const blockType = bot.registry.blocksByName[type];
    if (!blockType) {
      const validNames = Object.keys(bot.registry.blocksByName);
      const suggestions = findClosestMatches(type, validNames, 3);
      if (suggestions.length > 0) {
        return errorResult(`Unknown block type: '${type}'. Did you mean: '${suggestions.join("', '")}'?`);
      }
      return errorResult(`Unknown block type: ${type}`);
    }

    // Determine what item this block drops
    const dropItemName = BLOCK_TO_DROP[type] ?? type;

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

    try {
      const blocks = bot.findBlocks({
        matching: blockType.id,
        maxDistance: 64,
        count: needed + 5, // grab a few extra targets as buffer in case some are unreachable
      });

      if (blocks.length === 0) {
        const obs = buildObservation(bot, `Could not find any ${type} nearby to gather.`);
        return textResult(formatObservation(obs));
      }

      const targets = blocks.map((pos: any) => bot.blockAt(pos)).filter((b: any) => b !== null);

      // Gather with a hard timeout and early-exit inventory check
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

        // Poll inventory every 500ms — stop the moment we have enough
        const inventoryPoller = setInterval(() => {
          const currentCount = getInventoryCount(bot, dropItemName);
          if (currentCount >= amount) {
            console.log(`[gather_materials] Have ${currentCount}x ${dropItemName}, stopping early`);
            try {
              bot.pathfinder.setGoal(null);
              bot.stopDigging();
            } catch (_) { /* ignore */ }
            cleanup(() => resolve());
          }
        }, 500);

        // Hard timeout: 30 seconds max regardless
        const hardTimeout = setTimeout(() => {
          try {
            bot.pathfinder.setGoal(null);
            bot.stopDigging();
          } catch (_) { /* ignore */ }
          cleanup(() => resolve()); // resolve, not reject — return whatever we got
        }, 30_000);

        bot.once('end', onDisconnect);
        bot.once('kicked', onDisconnect);

        bot.collectBlock.collect(targets, { ignoreNoPath: true })
          .then(() => cleanup(() => resolve()))
          .catch((err: any) => cleanup(() => reject(err)));
      });

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
