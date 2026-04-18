import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';

export function registerCombatTool(server: McpServer, botManager: BotManager): void {
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
      return textResult(formatObservation(buildObservation(bot, `Could not find entity: ${target}`)));
    }

    try {
      const goal = new (require("mineflayer-pathfinder").goals.GoalFollow)(entity, 2);
      await bot.pathfinder.goto(goal);
      bot.attack(entity);

      const obs = buildObservation(bot, `Engaged ${target} in combat.`);
      return textResult(formatObservation(obs));
    } catch (error: any) {
      const obs = buildObservation(bot, `Failed to fight ${target}: ${error.message}`);
      return textResult(formatObservation(obs));
    }
  });
}
