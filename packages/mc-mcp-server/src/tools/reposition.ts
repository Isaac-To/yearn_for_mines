import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';

export function registerRepositionTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('reposition', {
    title: 'Reposition',
    description: 'Pathfind to target (e.g. "x,y,z" or "block_name" or "entity_name") via mineflayer-pathfinder.',
    inputSchema: { 
      target: z.string(), 
      isCoordinate: z.boolean().default(false).describe('True if target is "x, y, z"'),
      distance: z.number().default(2) 
    },
  }, async ({ target, isCoordinate, distance }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    try {
      const { goals } = await import("mineflayer-pathfinder");
      let goal;

      if (isCoordinate) {
        const [x, y, z] = target.split(',').map(n => parseInt(n.trim(), 10));
        goal = new goals.GoalNear(x, y, z, distance);
      } else {
        const blockType = bot.registry.blocksByName[target];
        if (blockType) {
          const nearest = bot.findBlock({ matching: blockType.id, maxDistance: 128 });
          if (!nearest) return textResult(formatObservation(buildObservation(bot, `Could not find ${target} nearby.`)));
          goal = new goals.GoalGetToBlock(nearest.position.x, nearest.position.y, nearest.position.z);
        } else {
          // might be entity
          const entity = Object.values(bot.entities).find(e => e.name?.toLowerCase() === target.toLowerCase() && e !== bot.entity);
          if (!entity) return textResult(formatObservation(buildObservation(bot, `Could not find ${target} nearby.`)));
          goal = new goals.GoalFollow(entity, distance);
        }
      }

      await bot.pathfinder.goto(goal);
      return textResult(formatObservation(buildObservation(bot, `Successfully moved near ${target}.`)));
    } catch (error: any) {
      return textResult(formatObservation(buildObservation(bot, `Failed to reach ${target}: ${error.message}`)));
    }
  });
}
