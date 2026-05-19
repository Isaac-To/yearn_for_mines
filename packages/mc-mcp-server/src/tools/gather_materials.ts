import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { ObservationContext } from '../observation-context.js';
import { findClosestMatches } from '../utils/string-match.js';

export function registerGatherMaterialsTool(server: McpServer, botManager: BotManager, obsCtx: ObservationContext): void {
  server.registerTool('gather_materials', {
    title: 'Gather Materials',
    description: 'Autonomously find, pathfind, equip tools, mine and collect target block types.',
    inputSchema: { type: z.string(), amount: z.number().positive().max(64) },
  }, async ({ type, amount }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');
    
    const blockType = bot.registry.blocksByName[type];
    if (!blockType) {
      const validNames = Object.keys(bot.registry.blocksByName);
      const suggestions = findClosestMatches(type, validNames, 3);
      const errorMsg = suggestions.length > 0 
        ? `Unknown block type: '${type}'. Did you mean: '${suggestions.join("', '")}'?`
        : `Unknown block type: ${type}`;
      
      return textResult(obsCtx.observe(bot, `Failed to gather ${type}: ${errorMsg}`));
    }

    try {
      const blocks = bot.findBlocks({
        matching: blockType.id,
        maxDistance: 64,
        count: amount,
      });

      if (blocks.length === 0) {
        return textResult(obsCtx.observe(bot, `Could not find any ${type} nearby to gather.`));
      }

      const targets = blocks.map(pos => bot.blockAt(pos)).filter(b => b !== null);
      
      await bot.collectBlock.collect(targets, { ignoreNoPath: true });
      
      return textResult(obsCtx.observe(bot, `Successfully gathered ${type}.`));
    } catch (error: any) {
      return textResult(obsCtx.observe(bot, `Failed to gather ${type}: ${error.message}`));
    }
  });
}