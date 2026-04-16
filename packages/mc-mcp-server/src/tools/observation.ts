import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { Vec3 } from 'vec3';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult, dataResult } from '@yearn-for-mines/shared';
import { buildObservation, classifyHostility } from '../observation-builder.js';

/** Convert a position (plain object or Vec3) to a Vec3 instance for mineflayer API calls. */
function toVec3(pos: { x: number; y: number; z: number }): Vec3 {
  if (pos instanceof Vec3) return pos;
  return new Vec3(pos.x, pos.y, pos.z);
}

function requireBot(botManager: BotManager) {
  const bot = botManager.currentBot;
  if (!bot) {
    throw new Error('Bot is not connected. Use bot_connect first.');
  }
  return bot;
}

export function registerObservationTools(server: McpServer, botManager: BotManager): void {
  // Comprehensive observation tool
  server.registerTool(
    'observe',
    {
      title: 'Observe World',
      description: 'Get a comprehensive observation of the bot\'s world state including position, health, inventory, nearby entities, blocks, weather, time, and more',
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot(botManager);
        const observation = buildObservation(bot);
        return dataResult(observation);
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to observe world state');
      }
    }
  );

  // Find a specific block type nearby
  server.registerTool(
    'find_block',
    {
      title: 'Find Block',
      description: 'Find blocks of a specific type near the bot',
      inputSchema: {
        type: z.string().describe('Block type name (e.g. "oak_log", "stone", "diamond_ore")'),
        maxDistance: z.number().default(64).describe('Maximum search distance in blocks'),
        count: z.number().default(1).describe('Maximum number of blocks to find'),
      },
    },
    async ({ type, maxDistance, count }) => {
      try {
        const bot = requireBot(botManager);
        const blockType = bot.registry.blocksByName[type];
        if (!blockType) {
          return errorResult(`Unknown block type: ${type}`);
        }

        const positions = bot.findBlocks({
          matching: blockType.id,
          maxDistance,
          count,
        });

        if (!positions || positions.length === 0) {
          return textResult(`No "${type}" blocks found within ${maxDistance} blocks.`);
        }

        const results = positions.map((pos: any) => {
          const block = bot.blockAt(toVec3(pos));
          const distance = bot.entity.position.distanceTo(toVec3(pos));
          return {
            position: { x: pos.x, y: pos.y, z: pos.z },
            distance: Math.round(distance * 10) / 10,
            name: block?.name ?? type,
            displayName: block?.displayName ?? type,
            diggable: block?.diggable ?? true,
          };
        });

        return dataResult({ blocks: results, count: results.length });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to find blocks');
      }
    }
  );

  // Find a specific entity nearby
  server.registerTool(
    'find_entity',
    {
      title: 'Find Entity',
      description: 'Find entities of a specific type near the bot',
      inputSchema: {
        type: z.string().describe('Entity type name (e.g. "Zombie", "Cow", "Creeper")'),
        maxDistance: z.number().default(32).describe('Maximum search distance in blocks'),
      },
    },
    async ({ type, maxDistance }) => {
      try {
        const bot = requireBot(botManager);
        const botPos = bot.entity.position;
        const matches: any[] = [];

        for (const entity of Object.values(bot.entities)) {
          if (entity === bot.entity) continue;

          const name = entity.name ?? (entity as any).username ?? '';
          if (name.toLowerCase() !== type.toLowerCase()) continue;

          const distance = botPos.distanceTo(entity.position);
          if (distance > maxDistance) continue;

          matches.push({
            id: entity.id,
            name,
            displayName: entity.displayName ?? name,
            position: {
              x: entity.position.x,
              y: entity.position.y,
              z: entity.position.z,
            },
            distance: Math.round(distance * 10) / 10,
            hostility: classifyHostility(name),
          });
        }

        if (matches.length === 0) {
          return textResult(`No "${type}" entities found within ${maxDistance} blocks.`);
        }

        return dataResult({ entities: matches, count: matches.length });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to find entities');
      }
    }
  );

  // Get full inventory details
  server.registerTool(
    'get_inventory',
    {
      title: 'Get Inventory',
      description: 'Get the bot\'s full inventory with item details including durability and enchantments',
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot(botManager);
        const observation = buildObservation(bot);
        return dataResult({
          heldItem: observation.heldItem,
          hotbar: observation.hotbar,
          inventory: observation.inventory,
          inventorySummary: observation.inventorySummary,
          armor: observation.armor,
          craftableItems: observation.craftableItems,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to get inventory');
      }
    }
  );

  // Get current position
  server.registerTool(
    'get_position',
    {
      title: 'Get Position',
      description: 'Get the bot\'s current position, orientation, and dimension',
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot(botManager);
        const pos = bot.entity.position;
        return dataResult({
          position: {
            x: pos.x,
            y: pos.y,
            z: pos.z,
            yaw: bot.entity.yaw ?? 0,
            pitch: bot.entity.pitch ?? 0,
          },
          dimension: bot.game?.dimension ?? 'overworld',
          spawnPoint: {
            x: bot.spawnPoint.x,
            y: bot.spawnPoint.y,
            z: bot.spawnPoint.z,
          },
          onGround: bot.entity.onGround ?? true,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to get position');
      }
    }
  );

  // Get craftable items
  server.registerTool(
    'get_craftable',
    {
      title: 'Get Craftable Items',
      description: 'Get items that can be crafted from the bot\'s current inventory',
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot(botManager);
        const observation = buildObservation(bot);
        return dataResult({ craftableItems: observation.craftableItems });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to get craftable items');
      }
    }
  );

  // Get tool effectiveness for a block
  server.registerTool(
    'get_tool_effectiveness',
    {
      title: 'Get Tool Effectiveness',
      description: 'Get which tools are effective against a specific block and estimated dig times',
      inputSchema: {
        blockType: z.string().describe('Block type name (e.g. "stone", "oak_log")'),
      },
    },
    async ({ blockType }) => {
      try {
        const bot = requireBot(botManager);
        const blockInfo = bot.registry.blocksByName[blockType];
        if (!blockInfo) {
          return errorResult(`Unknown block type: ${blockType}`);
        }

        const harvestTools = blockInfo.harvestTools ?? {};
        const effectiveTools: { tool: string; speed: string }[] = [];

        for (const [toolId] of Object.entries(harvestTools)) {
          const item = (bot.registry as any).itemsById[Number(toolId)];
          if (item) {
            effectiveTools.push({
              tool: item.name,
              speed: 'effective',
            });
          }
        }

        return dataResult({
          block: blockType,
          diggable: blockInfo.diggable ?? true,
          effectiveTools,
          bestTool: effectiveTools.length > 0 ? effectiveTools[0].tool : 'hand',
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to get tool effectiveness');
      }
    }
  );

  // Get nearby dropped items
  server.registerTool(
    'get_nearby_items',
    {
      title: 'Get Nearby Items',
      description: 'Get items dropped on the ground near the bot',
      inputSchema: {
        maxDistance: z.number().default(16).describe('Maximum search distance in blocks'),
      },
    },
    async ({ maxDistance }) => {
      try {
        const bot = requireBot(botManager);
        const observation = buildObservation(bot);
        const filtered = observation.nearbyDroppedItems.filter(
          (item) => item.distance <= maxDistance
        );
        return dataResult({ items: filtered, count: filtered.length });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to get nearby items');
      }
    }
  );

  // Look at a specific block
  server.registerTool(
    'look_at_block',
    {
      title: 'Look At Block',
      description: 'Get information about the block the bot is looking at or at specific coordinates',
      inputSchema: {
        x: z.number().describe('X coordinate of the block'),
        y: z.number().describe('Y coordinate of the block'),
        z: z.number().describe('Z coordinate of the block'),
      },
    },
    async ({ x, y, z }) => {
      try {
        const bot = requireBot(botManager);
        const block = bot.blockAt(toVec3({ x, y, z }));
        if (!block) {
          return errorResult(`No block found at ${x}, ${y}, ${z}`);
        }

        const distance = bot.entity.position.distanceTo(toVec3({ x, y, z }));
        const effectiveTool = block.harvestTools
          ? Object.keys(block.harvestTools).length > 0
            ? (block as any).material?.tool ?? 'hand'
            : 'hand'
          : 'hand';

        return dataResult({
          name: block.name,
          displayName: block.displayName ?? block.name,
          position: { x, y, z },
          diggable: block.diggable ?? false,
          effectiveTool,
          lightLevel: (block as any).light ?? undefined,
          distance: Math.round(distance * 10) / 10,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to look at block');
      }
    }
  );

  // Get entity at cursor (what the bot is looking at)
  server.registerTool(
    'entity_at_cursor',
    {
      title: 'Entity At Cursor',
      description: 'Get the entity that the bot is currently looking at',
      inputSchema: {
        maxDistance: z.number().default(6).describe('Maximum distance to check for entities'),
      },
    },
    async ({ maxDistance }) => {
      try {
        const bot = requireBot(botManager);
        const entity = bot.nearestEntity((e: any) => {
          if (e === bot.entity) return false;
          const distance = bot.entity.position.distanceTo(e.position);
          return distance <= maxDistance;
        });

        if (!entity) {
          return textResult('No entity in range.');
        }

        const name = entity.name ?? (entity as any).username ?? 'unknown';
        const distance = bot.entity.position.distanceTo(entity.position);

        return dataResult({
          id: entity.id,
          name,
          displayName: entity.displayName ?? name,
          position: {
            x: entity.position.x,
            y: entity.position.y,
            z: entity.position.z,
          },
          distance: Math.round(distance * 10) / 10,
          hostility: classifyHostility(name),
          type: entity.type,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to get entity at cursor');
      }
    }
  );

}