import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BotManager } from '../bot-manager.js';
import { buildObservation } from '../observation-builder.js';
import { textResult, errorResult, dataResult } from '@yearn-for-mines/shared';

function requireBot(botManager: BotManager) {
  const bot = botManager.currentBot;
  if (!bot) {
    throw new Error('Bot is not connected. Use bot_connect first.');
  }
  return bot;
}

export function registerHudTools(server: McpServer, botManager: BotManager): void {
  // Full heads-up display data (mirrors what a player sees on screen)
  server.registerTool(
    'get_hud',
    {
      title: 'Get HUD',
      description: 'Get the full heads-up display data that a Minecraft player would see on screen: health bar, hunger bar, saturation, oxygen bubbles, experience, armor, hotbar items, status effects, attack cooldown, active dig progress',
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot(botManager);
        const observation = buildObservation(bot);
        return dataResult({
          health: observation.health,
          heldItem: observation.heldItem,
          hotbar: observation.hotbar,
          armor: observation.armor,
          statusEffects: observation.statusEffects,
          attackCooldown: observation.attackCooldown,
          activeDig: observation.activeDig,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to get HUD data');
      }
    }
  );

  // Attack cooldown state
  server.registerTool(
    'get_attack_cooldown',
    {
      title: 'Get Attack Cooldown',
      description: 'Get the bot\'s current attack cooldown progress and whether the attack is ready',
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot(botManager);
        const observation = buildObservation(bot);
        return dataResult(observation.attackCooldown);
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to get attack cooldown');
      }
    }
  );

  // Block breaking progress
  server.registerTool(
    'get_dig_progress',
    {
      title: 'Get Dig Progress',
      description: 'Get the current block breaking progress, including which block is being dug and how far along the break is',
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot(botManager);
        const observation = buildObservation(bot);
        if (!observation.activeDig) {
          return textResult('No block is currently being dug.');
        }
        return dataResult(observation.activeDig);
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to get dig progress');
      }
    }
  );
}

/**
 * Register the bot://status MCP resource.
 * This provides real-time bot state as a resource that can be read.
 */
export function registerBotStatusResource(server: McpServer, botManager: BotManager): void {
  server.registerResource(
    'bot-status',
    'bot://status',
    {
      description: 'Real-time bot status: connection state, position, health, inventory summary',
      mimeType: 'application/json',
    },
    async () => {
      const bot = botManager.currentBot;
      if (!bot) {
        return {
          contents: [{
            uri: 'bot://status',
            mimeType: 'application/json',
            text: JSON.stringify({
              connected: false,
              username: null,
              position: null,
              health: null,
              food: null,
              inventory: null,
            }),
          }],
        };
      }

      const observation = buildObservation(bot);

      return {
        contents: [{
          uri: 'bot://status',
          mimeType: 'application/json',
          text: JSON.stringify({
            connected: true,
            username: bot.username,
            position: observation.position,
            health: observation.health,
            weather: observation.weather,
            timeOfDay: observation.timeOfDay,
            dimension: observation.dimension,
            biome: observation.biome,
            nearbyEntityCount: observation.nearbyEntities.length,
            nearbyBlockCount: observation.nearbyBlocks.length,
            hazardCount: observation.environmentalHazards.length,
            inventorySummary: observation.inventorySummary,
            attackCooldown: observation.attackCooldown,
          }),
        }],
      };
    }
  );
}