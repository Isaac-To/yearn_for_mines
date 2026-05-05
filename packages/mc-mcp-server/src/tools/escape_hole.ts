import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { Vec3 } from 'vec3';

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
      // Check if sky is visible above (not in hole)
      let skyVisible = false;
      for (let y = bot.entity.position.y + 1; y <= bot.entity.position.y + 256; y++) {
        const block = bot.blockAt(new Vec3(bot.entity.position.x, y, bot.entity.position.z));
        if (!block || block.name === 'air') {
          skyVisible = true;
          break;
        }
      }

      if (skyVisible) {
        return textResult(formatObservation(buildObservation(bot, 'Not in a hole - sky is visible above.')));
      }

      // Find placeable block in inventory (dirt, cobblestone, stone, etc.)
      const placeableBlocks = ['dirt', 'cobblestone', 'stone', 'gravel', 'sand', 'oak_planks', 'spruce_planks', 'birch_planks'];
      let placeableItem = null;

      for (const blockName of placeableBlocks) {
        const item = bot.inventory.items().find(i => i.name === blockName);
        if (item) {
          placeableItem = item;
          break;
        }
      }

      if (!placeableItem) {
        return textResult(formatObservation(buildObservation(bot, 'Cannot escape hole: No placeable blocks in inventory. Need dirt, cobblestone, stone, gravel, sand, or planks.')));
      }

      // Equip the placeable block
      await bot.equip(placeableItem, 'hand');

      // Place blocks below bot to climb up
      const startY = Math.floor(bot.entity.position.y);
      const targetY = Math.min(startY + maxHeight, 256); // Don't go above world height
      let blocksPlaced = 0;
      const maxBlocks = 256; // Safety limit

      for (let y = startY - 1; y < targetY && blocksPlaced < maxBlocks; y++) {
        // Check if we can see sky now
        let currentSkyVisible = false;
        for (let checkY = Math.floor(bot.entity.position.y) + 1; checkY <= Math.floor(bot.entity.position.y) + 256; checkY++) {
          const block = bot.blockAt(new Vec3(Math.floor(bot.entity.position.x), checkY, Math.floor(bot.entity.position.z)));
          if (!block || block.name === 'air') {
            currentSkyVisible = true;
            break;
          }
        }
        if (currentSkyVisible) break;

        // Place block below current position
        const belowPos = new Vec3(Math.floor(bot.entity.position.x), y, Math.floor(bot.entity.position.z));
        const blockBelow = bot.blockAt(belowPos);

        if (blockBelow && blockBelow.name === 'air') {
          // Need to find a solid block to place on
          const blockUnderBelow = bot.blockAt(belowPos.offset(0, -1, 0));
          if (blockUnderBelow && blockUnderBelow.name !== 'air') {
            await bot.placeBlock(blockUnderBelow, new Vec3(0, 1, 0));
            blocksPlaced++;
            // Wait for block placement to complete
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        // Move up to the newly placed block
        if (blocksPlaced > 0) {
          await bot.setControlState('jump', true);
          await new Promise(resolve => setTimeout(resolve, 100));
          await bot.setControlState('jump', false);
        }
      }

      // Final check if escaped
      let finalSkyVisible = false;
      for (let y = Math.floor(bot.entity.position.y) + 1; y <= Math.floor(bot.entity.position.y) + 256; y++) {
        const block = bot.blockAt(new Vec3(Math.floor(bot.entity.position.x), y, Math.floor(bot.entity.position.z)));
        if (!block || block.name === 'air') {
          finalSkyVisible = true;
          break;
        }
      }

      if (finalSkyVisible) {
        return textResult(formatObservation(buildObservation(bot, `Successfully escaped hole by placing ${blocksPlaced} blocks and climbing to safety!`)));
      } else {
        return textResult(formatObservation(buildObservation(bot, `Climbed ${blocksPlaced} blocks but still in hole. Try again or use reposition with allowTerrainManipulation: true.`)));
      }
    } catch (error: any) {
      const obs = buildObservation(bot, `Failed to escape hole: ${error.message}`);
      return textResult(formatObservation(obs));
    }
  });
}
