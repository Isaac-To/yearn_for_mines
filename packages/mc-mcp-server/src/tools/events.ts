import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { EventManager } from '../events.js';
import { textResult, errorResult, dataResult } from '@yearn-for-mines/shared';

function requireBot(botManager: BotManager) {
  const bot = botManager.currentBot;
  if (!bot) {
    throw new Error('Bot is not connected. Use bot_connect first.');
  }
  return bot;
}

export function registerEventTools(server: McpServer, botManager: BotManager, eventManager: EventManager): void {
  // Subscribe to events (start collecting)
  server.registerTool(
    'subscribe_events',
    {
      title: 'Subscribe to Events',
      description: 'Start collecting real-time events from the Minecraft world (block changes, entity spawns, sounds, particles, chat, etc.)',
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot(botManager);
        eventManager.attach(bot);
        return textResult('Subscribed to all event types. Use get_events to retrieve buffered events.');
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to subscribe to events');
      }
    }
  );

  // Unsubscribe from events
  server.registerTool(
    'unsubscribe_events',
    {
      title: 'Unsubscribe from Events',
      description: 'Stop collecting events and clear the event buffer',
      inputSchema: {},
    },
    async () => {
      try {
        eventManager.detach();
        return textResult('Unsubscribed from all events. Buffer cleared.');
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to unsubscribe from events');
      }
    }
  );

  // Get buffered events
  server.registerTool(
    'get_events',
    {
      title: 'Get Events',
      description: 'Retrieve all buffered events since last check and clear the buffer. Events include block changes, entity spawns/despawns, sounds, particles, chat, damage, etc.',
      inputSchema: {
        clear: z.boolean().default(true).describe('Whether to clear the buffer after retrieving events'),
      },
    },
    async ({ clear }) => {
      try {
        const events = clear ? eventManager.flush() : eventManager.peek();
        return dataResult({
          events,
          count: events.length,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to get events');
      }
    }
  );
}