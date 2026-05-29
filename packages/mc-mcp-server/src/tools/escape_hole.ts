import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { isInHole, escapeHole } from './interact-world.js';

export function registerEscapeHoleTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('escape_hole', {
    title: 'Escape Hole',
    description: 'Escape from a hole or pit by placing blocks below the bot to climb up to ground level. Requires dirt, stone, cobblestone, or similar placeable blocks in inventory.',
    inputSchema: z.object({
      maxHeight: z.number().default(64).describe('Maximum blocks to climb. Defaults to 64.'),
    }),
  }, async ({ maxHeight }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    try {
      if (!isInHole(bot)) {
        return textResult(formatObservation(buildObservation(bot, 'Not in a hole.')));
      }

      const escaped = await escapeHole(bot, maxHeight);
      if (escaped) {
        return textResult(formatObservation(buildObservation(bot, 'Successfully escaped the hole!')));
      } else {
        return textResult(formatObservation(buildObservation(bot, 'Failed to escape the hole. Try gathering more placeable blocks.')));
      }
    } catch (error: any) {
      const obs = buildObservation(bot, `Failed to escape hole: ${error.message}`);
      return textResult(formatObservation(obs));
    }
  });
}
