import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { Bot } from 'mineflayer';
import type { BotManager } from '../bot-manager.js';
import { errorResult, type McpToolResult } from '@yearn-for-mines/shared';
import { getInventoryCount, findOrPlaceCraftingTable } from './interact-crafting.js';
import { navigateToBlock } from './interact-world.js';
import { resolveRecipePlan } from './recipe-table.js';
import { outcome, waitForState, messageOf } from './outcome.js';

export async function craftToTarget(bot: Bot, itemName: string, target: number,
  options: { craftTableIfMissing?: boolean; cleanupTable?: boolean; signal?: AbortSignal } = {}): Promise<McpToolResult> {
  const before = getInventoryCount(bot, itemName);
  if (before >= target) return outcome(bot, 'success', `Already have ${before}x ${itemName}.`, { targetReached: true });
  try {
    options.signal?.throwIfAborted();
    let lookup = resolveRecipePlan(bot, itemName, target);
    if ('error' in lookup) return outcome(bot, 'failed', lookup.error);
    if (lookup.plan.missingIngredients.length) return outcome(bot, 'failed', 'Missing crafting ingredients.', {
      target: { item: itemName, count: target }, missingIngredients: lookup.plan.missingIngredients,
    });
    let table: ReturnType<Bot['blockAt']> = null;
    let placed = false;
    if (lookup.plan.requiresCraftingTable) {
      const tableId = bot.registry.blocksByName.crafting_table?.id;
      if (tableId === undefined) return outcome(bot, 'failed', 'Crafting table absent from registry.');
      if (!bot.findBlock({ matching: tableId, maxDistance: 32 }) && !getInventoryCount(bot, 'crafting_table')) {
        if (options.craftTableIfMissing === false) return outcome(bot, 'failed', 'Need a crafting table.');
        const tableRecipe = bot.recipesFor(bot.registry.itemsByName.crafting_table.id, null, 1, null)[0];
        if (!tableRecipe) return outcome(bot, 'failed', 'Need four additional planks to craft a reusable crafting table.');
        await bot.craft(tableRecipe, 1);
        if (!await waitForState(() => getInventoryCount(bot, 'crafting_table') > 0, 1500, options.signal)) {
          return outcome(bot, 'failed', 'Crafting table did not arrive in inventory.');
        }
      }
      const placement = await findOrPlaceCraftingTable(bot, tableId);
      if (placement.error || !placement.tableBlock) return outcome(bot, 'failed', placement.error ?? 'No crafting table found.');
      table = placement.tableBlock;
      placed = placement.placedNewTable;
      if (!table || !await navigateToBlock(bot, table.position, 2)) return outcome(bot, 'failed', 'Cannot reach the crafting table. Reposition or escape the hole.');
      lookup = resolveRecipePlan(bot, itemName, target);
      if ('error' in lookup) return outcome(bot, 'failed', lookup.error);
      if (lookup.plan.missingIngredients.length) return outcome(bot, 'failed', 'Missing ingredients after preparing the crafting table.', {
        missingIngredients: lookup.plan.missingIngredients,
      });
    }
    options.signal?.throwIfAborted();
    await bot.craft(lookup.plan.recipe, lookup.plan.craftsNeeded, table ?? undefined);
    const reached = await waitForState(() => getInventoryCount(bot, itemName) >= target, 1500, options.signal);
    const after = getInventoryCount(bot, itemName);
    if (!reached) return outcome(bot, after > before ? 'partial' : 'failed', `Crafting target not reached: ${after}/${target} ${itemName}.`, { targetReached: false });
    if (options.cleanupTable && placed && table) {
      options.signal?.throwIfAborted();
      await bot.dig(table);
    }
    return outcome(bot, 'success', `Successfully crafted ${after - before}x ${itemName}.`, {
      targetReached: true, target: { item: itemName, count: target }, gained: after - before, craftOperations: lookup.plan.craftsNeeded,
    });
  } catch (error) {
    options.signal?.throwIfAborted();
    return outcome(bot, getInventoryCount(bot, itemName) > before ? 'partial' : 'failed', `Failed to craft ${itemName}: ${messageOf(error)}`);
  }
}

export function registerCraftItemsTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('craft_items', {
    title: 'Craft Items',
    description: 'Craft an exact item to a TOTAL inventory target. Subtracts existing inventory, handles recipe yield, and reuses or creates a crafting table. Returns missing prerequisites. Tables are left for reuse.',
    inputSchema: { recipe: z.string(), amount: z.number().int().positive().max(64).default(1) },
  }, async ({ recipe, amount }, extra) => botManager.runAction(extra.signal, async signal => {
    const bot = botManager.currentBot;
    return bot ? craftToTarget(bot, recipe, amount, { signal }) : errorResult('[DISCONNECTED] Bot not connected');
  }));
}
