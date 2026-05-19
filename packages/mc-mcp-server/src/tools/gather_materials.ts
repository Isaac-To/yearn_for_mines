import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { ObservationContext } from '../observation-context.js';
import { findClosestMatches } from '../utils/string-match.js';

export function registerGatherMaterialsTool(server: McpServer, botManager: BotManager, obsCtx: ObservationContext): void {
  server.registerTool('gather_materials', {
    title: 'Gather Materials',
    description: 'Autonomously find, pathfind, equip tools, mine and collect target block types. Searches within a 64-block radius. Auto-equips the best available tool for the block type.',
    inputSchema: z.object({ blockType: z.string().describe('Minecraft block/item name to gather (e.g. "oak_log", "iron_ore", "cobblestone")'), amount: z.number().positive().max(64).describe('Target count of items to collect (1-64)') }),
  }, async ({ blockType, amount }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');
    
    const blockTypeReg = bot.registry.blocksByName[blockType];
    if (!blockTypeReg) {
      const validNames = Object.keys(bot.registry.blocksByName);
      const suggestions = findClosestMatches(blockType, validNames, 3);
      const errorMsg = suggestions.length > 0 
        ? `Unknown block type: '${blockType}'. Did you mean: '${suggestions.join("', '")}'?`
        : `Unknown block type: ${blockType}`;
      
      return textResult(obsCtx.observe(bot, `Failed to gather ${blockType}: ${errorMsg}`));
    }

    try {
      const blocks = bot.findBlocks({
        matching: blockTypeReg.id,
        maxDistance: 64,
        count: amount,
      });

      if (blocks.length === 0) {
        return textResult(obsCtx.observe(bot, `Could not find any ${blockType} nearby to gather.`));
      }

      const targets = blocks.map(pos => bot.blockAt(pos)).filter(b => b !== null);
      
      await bot.collectBlock.collect(targets, { ignoreNoPath: true });
      
      return textResult(obsCtx.observe(bot, `Successfully gathered ${blockType}.`));
    } catch (error: any) {
      return textResult(obsCtx.observe(bot, `Failed to gather ${blockType}: ${error.message}`));
    }
  });
}