import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { ObservationContext } from '../observation-context.js';

export function registerCombatTool(server: McpServer, botManager: BotManager, obsCtx: ObservationContext): void {
  server.registerTool('combat', {
    title: 'Combat',
    description: 'Engage a specific target.',
    inputSchema: { target: z.string() },
  }, async ({ target }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    const entity = Object.values(bot.entities).find(
      (e: any) => e && e.name && e.name.toLowerCase() === target.toLowerCase() && e !== bot.entity
    );

    if (!entity) {
      return textResult(obsCtx.observe(bot, `Could not find entity: ${target}`));
    }

    try {
      const pathfinder = await import("mineflayer-pathfinder");
      const goal = new pathfinder.goals.GoalFollow(entity, 2);
      await bot.pathfinder.goto(goal);
      bot.attack(entity);

      return textResult(obsCtx.observe(bot, `Engaged ${target} in combat.`));
    } catch (error: any) {
      return textResult(obsCtx.observe(bot, `Failed to fight ${target}: ${error.message}`));
    }
  });
}