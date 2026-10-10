import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bot } from 'mineflayer';
import type { BotManager } from '../bot-manager.js';
import { errorResult, delay } from '@yearn-for-mines/shared';
import { outcome, messageOf, waitForState } from './outcome.js';
import { findClosestMatches } from '../utils/string-match.js';

const LOGS = ['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log', 'pale_oak_log'];
const SOURCES: Record<string, string[]> = {
  logs: LOGS, raw_iron: ['iron_ore', 'deepslate_iron_ore'],
  raw_gold: ['gold_ore', 'deepslate_gold_ore'], raw_copper: ['copper_ore', 'deepslate_copper_ore'],
  diamond: ['diamond_ore', 'deepslate_diamond_ore'], coal: ['coal_ore', 'deepslate_coal_ore'],
  redstone: ['redstone_ore', 'deepslate_redstone_ore'], lapis_lazuli: ['lapis_ore', 'deepslate_lapis_ore'],
  emerald: ['emerald_ore', 'deepslate_emerald_ore'], cobblestone: ['stone', 'cobblestone'], flint: ['gravel'],
};
const DROPS: Record<string, string> = {
  stone: 'cobblestone', deepslate: 'cobbled_deepslate', grass_block: 'dirt',
  iron_ore: 'raw_iron', deepslate_iron_ore: 'raw_iron', gold_ore: 'raw_gold', deepslate_gold_ore: 'raw_gold',
  copper_ore: 'raw_copper', deepslate_copper_ore: 'raw_copper', diamond_ore: 'diamond', deepslate_diamond_ore: 'diamond',
  coal_ore: 'coal', deepslate_coal_ore: 'coal', redstone_ore: 'redstone', deepslate_redstone_ore: 'redstone',
  lapis_ore: 'lapis_lazuli', deepslate_lapis_ore: 'lapis_lazuli', emerald_ore: 'emerald', deepslate_emerald_ore: 'emerald',
};
const count = (bot: Bot, name: string) => bot.inventory.items()
  .filter(item => name === 'logs' ? LOGS.includes(item.name) : item.name === name)
  .reduce((total, item) => total + item.count, 0);

export function registerGatherMaterialsTool(server: McpServer, manager: BotManager): void {
  server.registerTool('gather_materials', {
    title: 'Gather Materials',
    description: 'Find, equip, mine and collect until inventory reaches amount. Use logs for any tree species; a specific log name requires that species. Searches loaded terrain up to 64 blocks.',
    inputSchema: { type: z.string(), amount: z.number().int().positive().max(64) },
  }, async ({ type, amount }, extra) => manager.runAction(extra.signal, async signal => {
    const bot = manager.currentBot;
    if (!bot) return errorResult('[DISCONNECTED] Bot not connected');
    const item = DROPS[type] ?? type;
    const before = count(bot, item);
    if (before >= amount) return outcome(bot, 'success', 'Inventory target already met.', { item, target: amount, targetReached: true });
    const ids = (SOURCES[type] ?? [type]).map(name => bot.registry.blocksByName[name]?.id).filter((id): id is number => id !== undefined);
    if (!ids.length) {
      const suggestions = findClosestMatches(type, Object.keys(bot.registry.blocksByName), 3);
      return outcome(bot, 'failed', `Unknown block type: '${type}'. Did you mean: '${suggestions.join("', '")}'?`);
    }
    const skipped = new Set<string>();
    let reason = 'No reachable dry targets remain in loaded terrain. Explore or reposition.';
    let staleBatches = 0;
    try {
      // Re-scan after each small batch so large targets are not limited to the first ten blocks.
      while (count(bot, item) < amount && skipped.size < 128 && staleBatches < 3) {
        signal.throwIfAborted();
        let targets: NonNullable<ReturnType<Bot['blockAt']>>[] = [];
        for (const radius of [16, 32, 64]) {
          targets = bot.findBlocks({
            matching: ids,
            useExtraInfo: block => !skipped.has(block.position.toString()) &&
              ![0, 1, 2].some(dy => /water|lava/.test(bot.blockAt(block.position.offset(0, dy, 0))?.name ?? '')),
            maxDistance: radius, count: 32,
          }).map(pos => bot.blockAt(pos)).filter((block): block is NonNullable<typeof block> => block !== null);
          if (targets.length) break;
        }
        if (!targets.length) break;
        const batch = targets.slice(0, Math.min(4, amount - count(bot, item)));
        batch.forEach(block => skipped.add(block.position.toString()));
        const batchBefore = count(bot, item);
        // Cancel the entire action on a hung batch. Never launch another collector while it settles.
        const timer = setTimeout(() => manager.cancelAction(new Error('Gather batch timed out')), 30_000 + batch.length * 8_000);
        try { await bot.collectBlock.collect(batch, { ignoreNoPath: false }); }
        catch (error) { reason = messageOf(error); }
        finally { clearTimeout(timer); }
        signal.throwIfAborted();
        await waitForState(() => count(bot, item) > batchBefore, 1000, signal);
        staleBatches = count(bot, item) > batchBefore ? 0 : staleBatches + 1;
        await delay(50, signal);
      }
      const after = count(bot, item);
      return outcome(bot, after >= amount ? 'success' : after > before ? 'partial' : 'failed',
        after >= amount ? `Gathered ${item} to target.` : reason,
        { item, target: amount, targetReached: after >= amount, count: after, gained: after - before });
    } catch (error) {
      signal.throwIfAborted();
      return outcome(bot, count(bot, item) > before ? 'partial' : 'failed', messageOf(error), { item, target: amount, targetReached: false });
    }
  }));
}
