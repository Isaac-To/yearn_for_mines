import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../../bot-manager.js';
import { errorResult } from '@yearn-for-mines/shared';
import { craftToTarget } from '../craft_items.js';

/** Compatibility alias; both entry points share recipe and quantity semantics. */
export function registerCraftMacroTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('craft_macro', {
    title: 'Craft Macro', description: 'Compatibility alias for craft_items. count is the TOTAL wanted in inventory.',
    inputSchema: { item_name: z.string(), count: z.number().int().positive().max(64).default(1),
      craft_table_if_missing: z.boolean().default(true), cleanup_table: z.boolean().default(false) },
  }, async (args, extra) => botManager.runAction(extra.signal, async signal => {
    const bot = botManager.currentBot;
    return bot ? craftToTarget(bot, args.item_name, args.count, { signal,
      craftTableIfMissing: args.craft_table_if_missing, cleanupTable: args.cleanup_table }) : errorResult('[DISCONNECTED] Bot not connected');
  }));
}
