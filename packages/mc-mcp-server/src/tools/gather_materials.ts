import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { findClosestMatches } from '../utils/string-match.js';

export function registerGatherMaterialsTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('gather_materials', {
    title: 'Gather Materials',
    description: 'Autonomously find, pathfind, equip tools, mine and collect target block types. The type must be an exact Minecraft block registry name (e.g. \"oak_log\", \"birch_log\", \"spruce_log\", \"coal_ore\", \"iron_ore\", \"cobblestone\", \"dirt\", \"sand\"). Do NOT use generic names like \"wood\" or \"tree\" — use the specific block name like \"oak_log\".',
    inputSchema: { type: z.string().describe('Exact Minecraft block registry name, e.g. \"oak_log\", \"birch_log\", \"cobblestone\"'), amount: z.number().positive().max(64) },
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

    try {
      const blocks = bot.findBlocks({
        matching: blockType.id,
        maxDistance: 64,
        count: amount,
      });

      if (blocks.length === 0) {
        const obs = buildObservation(bot, `Could not find any ${type} nearby to gather.`);
        return textResult(formatObservation(obs));
      }

      const targets = blocks.map(pos => bot.blockAt(pos)).filter(b => b !== null);
      
      await bot.collectBlock.collect(targets, { ignoreNoPath: true });
      
      const obs = buildObservation(bot, `Successfully gathered ${type}.`);
      return textResult(formatObservation(obs));
    } catch (error: any) {
      const obs = buildObservation(bot, `Failed to gather ${type}: ${error.message}`);
      return textResult(formatObservation(obs));
    }
  });
}
