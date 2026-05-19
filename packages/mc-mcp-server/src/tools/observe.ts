import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { ObservationContext } from '../observation-context.js';

export function registerObserveTool(server: McpServer, botManager: BotManager, obsCtx: ObservationContext): void {
  server.registerTool('observe', {
    title: 'Observe',
    description: 'Get a comprehensive observation of the bot\'s current world state including inventory, nearby entities, craftable items, points of interest, and recent events. Use this to understand your surroundings before deciding what to do.',
    inputSchema: z.object({}),
  }, async () => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    try {
      const observation = obsCtx.observe(bot);
      return textResult(observation);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      return errorResult(`Observation failed: ${msg}`);
    }
  });
}