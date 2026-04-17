import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { Vec3 } from 'vec3';
import type { BotManager } from '../bot-manager.js';
import { errorResult, dataResult, transientErrorResult } from '@yearn-for-mines/shared';

/** Convert a position (plain object or Vec3) to a Vec3 instance for mineflayer API calls. */
function toVec3(pos: { x: number; y: number; z: number }): Vec3 {
  if (pos instanceof Vec3) return pos;
  return new Vec3(pos.x, pos.y, pos.z);
}

function requireBot(botManager: BotManager) {
  const bot = botManager.currentBot;
  if (!bot) {
    throw new Error('[TRANSIENT] Bot is not connected. Use bot_connect first.');
  }
  return bot;
}

export function registerActionTools(server: McpServer, botManager: BotManager): void {
  // Movement: pathfind to a location
  server.registerTool(
    'pathfind_to',
    {
      title: 'Pathfind To',
      description: 'Navigate the bot to a specific coordinate using the pathfinder plugin. The bot will avoid obstacles and find the optimal path.',
      inputSchema: {
        x: z.number().describe('Target X coordinate'),
        y: z.number().describe('Target Y coordinate'),
        z: z.number().describe('Target Z coordinate'),
        range: z.number().default(2).describe('How close the bot should get to the target (in blocks)'),
      },
    },
    async ({ x, y, z, range }) => {
      try {
        const bot = requireBot(botManager);

        // Check if pathfinder plugin is loaded
        const pathfinder = (bot as any).pathfinder;
        if (!pathfinder) {
          return errorResult('Pathfinder plugin is not loaded. The bot needs the mineflayer-pathfinder plugin.');
        }

        const { goals } = await import('mineflayer-pathfinder');
        const goal = new goals.GoalNear(x, y, z, range);

        return new Promise((resolve) => {
          pathfinder.setGoal(goal);

          bot.once('goal_reached', () => {
            resolve(dataResult({
              reached: true,
              position: { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z },
            }));
          });

          (bot as any).once('path_stop', () => {
            resolve(dataResult({
              reached: false,
              position: { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z },
              reason: 'Path was interrupted',
            }));
          });

          (bot as any).once('path_error', (err: Error) => {
            resolve(errorResult(`Pathfinding error: ${err.message}`));
          });
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to pathfind');
      }
    }
  );

  // Movement: look at a coordinate or entity
  server.registerTool(
    'look_at',
    {
      title: 'Look At',
      description: 'Make the bot look at a specific coordinate',
      inputSchema: {
        x: z.number().describe('X coordinate to look at'),
        y: z.number().describe('Y coordinate to look at'),
        z: z.number().describe('Z coordinate to look at'),
      },
    },
    async ({ x, y, z }) => {
      try {
        const bot = requireBot(botManager);
        await bot.lookAt({ x, y, z } as any);
        return dataResult({
          lookingAt: { x, y, z },
          yaw: bot.entity.yaw,
          pitch: bot.entity.pitch,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to look at coordinate');
      }
    }
  );

  // Block interaction: dig a block
  server.registerTool(
    'dig_block',
    {
      title: 'Dig Block',
      description: 'Dig (break) a block at the specified coordinates. The bot must be close enough and have the right tool equipped.',
      inputSchema: {
        x: z.number().describe('X coordinate of the block'),
        y: z.number().describe('Y coordinate of the block'),
        z: z.number().describe('Z coordinate of the block'),
        force: z.boolean().default(false).describe('Force digging even if the bot may not be able to (creative mode)'),
      },
    },
    async ({ x, y, z, force }) => {
      try {
        const bot = requireBot(botManager);
        const block = bot.blockAt(new Vec3(x, y, z));

        if (!block) {
          return errorResult(`No block found at ${x}, ${y}, ${z}`);
        }

        if (!block.diggable && !force) {
          return errorResult(`Block "${block.name}" at ${x}, ${y}, ${z} is not diggable`);
        }

        // Check if bot can dig the block
        const canDig = bot.canDigBlock(block);
        if (!canDig && !force) {
          return errorResult(`Cannot dig "${block.name}" at ${x}, ${y}, ${z}. Bot may not have the right tool or is too far away.`);
        }

        await bot.dig(block, force);

        return dataResult({
          dug: true,
          blockName: block.name,
          position: { x, y, z },
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to dig block');
      }
    }
  );

  // Block interaction: place a block
  server.registerTool(
    'place_block',
    {
      title: 'Place Block',
      description: 'Place a block from the bot\'s inventory at the specified location. The bot must have the block item in hand.',
      inputSchema: {
        x: z.number().describe('X coordinate of the reference block (block to place against)'),
        y: z.number().describe('Y coordinate of the reference block'),
        z: z.number().describe('Z coordinate of the reference block'),
        face: z.enum(['top', 'bottom', 'north', 'south', 'east', 'west']).default('top').describe('Which face of the reference block to place against'),
        itemName: z.string().describe('Name of the block item to place (must be in inventory)'),
      },
    },
    async ({ x, y, z, face, itemName }) => {
      try {
        const bot = requireBot(botManager);

        // Find the item in inventory
        const item = bot.inventory.items().find((i: any) => i.name === itemName);
        if (!item) {
          return errorResult(`Item "${itemName}" not found in inventory`);
        }

        // Equip the item
        await bot.equip(item, 'hand');

        // Map face name to vec3 direction
        const faceMap: Record<string, { x: number; y: number; z: number }> = {
          top: { x: 0, y: 1, z: 0 },
          bottom: { x: 0, y: -1, z: 0 },
          north: { x: 0, y: 0, z: -1 },
          south: { x: 0, y: 0, z: 1 },
          east: { x: 1, y: 0, z: 0 },
          west: { x: -1, y: 0, z: 0 },
        };

        const faceVec = faceMap[face] ?? faceMap.top;
        const referenceBlock = bot.blockAt(new Vec3(x, y, z));

        if (!referenceBlock) {
          return errorResult(`No reference block found at ${x}, ${y}, ${z}`);
        }

        await bot.placeBlock(referenceBlock, faceVec as any);

        return dataResult({
          placed: true,
          itemName,
          position: { x, y, z },
          face,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to place block');
      }
    }
  );

  // Crafting: craft an item
  server.registerTool(
    'craft_item',
    {
      title: 'Craft Item',
      description: 'Craft an item using the bot\'s current inventory. Requires the right materials and optionally a crafting table.',
      inputSchema: {
        itemName: z.string().describe('Name of the item to craft (e.g. "crafting_table", "stone_pickaxe")'),
        count: z.number().default(1).describe('Number of items to craft'),
        useCraftingTable: z.boolean().default(false).describe('Whether to use a nearby crafting table (required for some recipes)'),
      },
    },
    async ({ itemName, count, useCraftingTable }) => {
      try {
        const bot = requireBot(botManager);

        const itemInfo = bot.registry.itemsByName[itemName];
        if (!itemInfo) {
          return errorResult(`Unknown item: ${itemName}`);
        }

        // Find a recipe for this item
        const recipes = bot.recipesFor(itemInfo.id, null, count, null);
        if (!recipes || recipes.length === 0) {
          return errorResult(`No recipe found for "${itemName}"`);
        }

        // Pick the first available recipe
        const recipe = recipes[0];

        // Find crafting table if needed
        let craftingTable: any = null;
        if (useCraftingTable || (recipe as any).requiresTable) {
          const tablePositions = bot.findBlocks({
            matching: bot.registry.blocksByName.crafting_table?.id ?? -1,
            maxDistance: 4,
            count: 1,
          });
          if (!tablePositions || tablePositions.length === 0) {
            return errorResult('No crafting table found nearby. Place one or use recipes that don\'t require a crafting table.');
          }
          craftingTable = bot.blockAt(tablePositions[0]);
        }

        await bot.craft(recipe, count, craftingTable);

        return dataResult({
          crafted: true,
          itemName,
          count,
          usedCraftingTable: craftingTable !== null,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to craft item');
      }
    }
  );

  // Inventory: equip an item
  server.registerTool(
    'equip_item',
    {
      title: 'Equip Item',
      description: 'Equip an item from the bot\'s inventory to a specific slot (hand, head, torso, legs, feet)',
      inputSchema: {
        itemName: z.string().describe('Name of the item to equip'),
        destination: z.enum(['hand', 'head', 'torso', 'legs', 'feet', 'off-hand']).default('hand').describe('Equipment slot to equip to'),
      },
    },
    async ({ itemName, destination }) => {
      try {
        const bot = requireBot(botManager);

        const item = bot.inventory.items().find((i: any) => i.name === itemName);
        if (!item) {
          return errorResult(`Item "${itemName}" not found in inventory`);
        }

        await bot.equip(item, destination as any);

        return dataResult({
          equipped: true,
          itemName,
          destination,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to equip item');
      }
    }
  );

  // Inventory: drop an item
  server.registerTool(
    'drop_item',
    {
      title: 'Drop Item',
      description: 'Drop an item from the bot\'s inventory on the ground',
      inputSchema: {
        itemName: z.string().describe('Name of the item to drop'),
        count: z.number().default(1).describe('Number of items to drop'),
      },
    },
    async ({ itemName, count }) => {
      try {
        const bot = requireBot(botManager);

        const item = bot.inventory.items().find((i: any) => i.name === itemName);
        if (!item) {
          return errorResult(`Item "${itemName}" not found in inventory`);
        }

        const dropCount = Math.min(count, item.count);
        await bot.toss(item.type, null, dropCount);

        return dataResult({
          dropped: true,
          itemName,
          count: dropCount,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to drop item');
      }
    }
  );

  // Inventory: use an item (eat food, throw potion, etc.)
  server.registerTool(
    'use_item',
    {
      title: 'Use Item',
      description: 'Use the currently held item (eat food, throw potion, use tool, etc.)',
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot(botManager);

        // Activate the held item
        bot.activateItem();

        // Wait a bit for the action to complete
        await bot.waitForTicks(5);

        return dataResult({
          used: true,
          heldItem: bot.heldItem?.name ?? null,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to use item');
      }
    }
  );

  // Chat: send a message
  server.registerTool(
    'chat',
    {
      title: 'Chat',
      description: 'Send a chat message visible to all players on the server',
      inputSchema: {
        message: z.string().describe('Message to send in chat'),
      },
    },
    async ({ message }) => {
      try {
        const bot = requireBot(botManager);
        bot.chat(message);
        return dataResult({
          sent: true,
          message,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to send chat message');
      }
    }
  );

  // Chat: whisper to a specific player
  server.registerTool(
    'whisper',
    {
      title: 'Whisper',
      description: 'Send a private message to a specific player',
      inputSchema: {
        username: z.string().describe('Username of the player to whisper'),
        message: z.string().describe('Message to send'),
      },
    },
    async ({ username, message }) => {
      try {
        const bot = requireBot(botManager);
        bot.whisper(username, message);
        return dataResult({
          sent: true,
          to: username,
          message,
        });
      } catch (err: any) {
        return errorResult(err.message ?? 'Failed to whisper');
      }
    }
  );
}