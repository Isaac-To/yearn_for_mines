import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { ObservationContext } from '../observation-context.js';
import { findClosestMatches } from '../utils/string-match.js';

export function registerRepositionTool(server: McpServer, botManager: BotManager, obsCtx: ObservationContext): void {
  server.registerTool('reposition', {
    title: 'Reposition',
    description: 'Pathfind to a target location or entity via mineflayer-pathfinder. Target can be coordinates (e.g. "100, 64, -200" with isCoordinateTarget=true), a block name (e.g. "oak_log"), or an entity name (e.g. "sheep").',
    inputSchema: z.object({ 
      target: z.string().describe('Destination: coordinate string "x, y, z" (set isCoordinateTarget=true), block name, or entity name'),
      isCoordinateTarget: z.boolean().default(false).describe('Set to true when target is a coordinate string like "100, 64, -200"; leave false for block/entity names'),
      distance: z.number().default(2).describe('Goal proximity radius in blocks (how close to get before stopping; default 2)'),
      allowTerrainManipulation: z.boolean().default(false).describe('Whether to allow breaking and placing blocks to cross obstacles or bridge gaps. Must have appropriate tools and placing blocks in inventory.')
    }),
  }, async (args) => {
    const { target, isCoordinateTarget, distance, allowTerrainManipulation } = args;
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    try {
      const { goals, Movements } = await import("mineflayer-pathfinder");
      
      const defaultMove = new Movements(bot);
      defaultMove.canDig = allowTerrainManipulation;
      defaultMove.allow1by1towers = allowTerrainManipulation;
      if (allowTerrainManipulation) {
        const extraScaffolds = [
          'stone', 'netherrack', 'sand', 'gravel', 'granite', 'diorite',
          'andesite', 'oak_planks', 'spruce_planks', 'birch_planks'
        ];
        for (const blockName of extraScaffolds) {
          const item = bot.registry.itemsByName[blockName];
          if (item) {
            defaultMove.scafoldingBlocks.push(item.id);
          }
        }
      }
      bot.pathfinder.setMovements(defaultMove);
      
      let goal;

      if (isCoordinateTarget) {
        const [x, y, z] = target.split(',').map(n => parseInt(n.trim(), 10));
        goal = new goals.GoalNear(x, y, z, distance);
      } else {
        const blockType = bot.registry.blocksByName[target];
        if (blockType) {
          const nearest = bot.findBlock({ matching: blockType.id, maxDistance: 128 });
          if (!nearest) return textResult(obsCtx.observe(bot, `Could not find ${target} nearby.`));
          goal = new goals.GoalGetToBlock(nearest.position.x, nearest.position.y, nearest.position.z);
        } else {
          const entity = Object.values(bot.entities).find(e => e.name?.toLowerCase() === target.toLowerCase() && e !== bot.entity);
          if (!entity) {
            const validBlockNames = Object.keys(bot.registry.blocksByName);
            const validEntityNames = Object.keys(bot.registry.entitiesByName);
            const validNames = [...validBlockNames, ...validEntityNames];
            const suggestions = findClosestMatches(target, validNames, 3);
            const suggestionsStr = suggestions.length > 0 ? ` Did you mean: '${suggestions.join("', '")}'?` : '';
            return textResult(obsCtx.observe(bot, `Could not find block or entity '${target}' nearby.${suggestionsStr}`));
          }
          goal = new goals.GoalFollow(entity, distance);
        }
      }

      await bot.pathfinder.goto(goal);
      return textResult(obsCtx.observe(bot, `Successfully moved near ${target}.`));
    } catch (error: any) {
      let errorMessage = error.message;
      if (allowTerrainManipulation) {
        let hasScaffolding = false;
        const inventoryItems = bot.inventory.items();
        const scaffoldingIds = bot.pathfinder.movements ? bot.pathfinder.movements.scafoldingBlocks : [];
        for (const item of inventoryItems) {
          if (scaffoldingIds.includes(item.type)) {
            hasScaffolding = true;
            break;
          }
        }
        if (!hasScaffolding) {
          errorMessage += " (Hint: Pathfinding failed. You have allowTerrainManipulation enabled but lack suitable scaffolding blocks like dirt or cobblestone in your inventory.)";
        }
      }
      return textResult(obsCtx.observe(bot, `Failed to reach ${target}: ${errorMessage}`));
    }
  });
}