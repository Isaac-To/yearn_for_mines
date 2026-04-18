import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { Vec3 } from 'vec3';

export function registerBuildTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('build', {
    title: 'Build',
    description: 'Place blocks natively. Provide blockType and targetPos (where the block will be placed, must be adjacent to an existing block).',
    inputSchema: { 
      blockType: z.string(),
      targetPos: z.object({ x: z.number(), y: z.number(), z: z.number() })
    },
  }, async ({ blockType, targetPos }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    const item = bot.inventory.items().find(i => i.name === blockType);
    if (!item) {
      const obs = buildObservation(bot, `Failed to build: No ${blockType} in inventory.`);
      return textResult(formatObservation(obs));
    }

    try {
      const pos = new Vec3(targetPos.x, targetPos.y, targetPos.z);
      // To place a block, we need a reference block. We assume the user wants to place IT on top of targetPos.y-1 
      const referenceBlock = bot.blockAt(new Vec3(pos.x, pos.y - 1, pos.z));
      if (!referenceBlock || referenceBlock.name === 'air') {
        const obs = buildObservation(bot, `Failed to build: Need a solid block below target position to attach to.`);
        return textResult(formatObservation(obs));
      }

      await bot.equip(item, 'hand');
      await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));

      const obs = buildObservation(bot, `Successfully built ${blockType} at ${pos.x},${pos.y},${pos.z}.`);
      return textResult(formatObservation(obs));
    } catch (error: any) {
      const obs = buildObservation(bot, `Failed to build ${blockType}: ${error.message}`);
      return textResult(formatObservation(obs));
    }
  });
}
