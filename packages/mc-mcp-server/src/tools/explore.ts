import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { Vec3 } from 'vec3';
// @ts-expect-error - no types for internal pathfinder paths
import { GoalNear, GoalXZ } from 'mineflayer-pathfinder/lib/goals.js';

async function getSurfaceY(bot: any, x: number, z: number): Promise<number | null> {
  for (let y = 320; y > 40; y--) {
    const block = bot.blockAt(new Vec3(x, y, z));
    const blockBelow = bot.blockAt(new Vec3(x, y - 1, z));
    if (
      block && (block.name === 'air' || block.name === 'cave_air') &&
      blockBelow && blockBelow.name !== 'air' && blockBelow.name !== 'cave_air' &&
      !blockBelow.name.includes('water') && !blockBelow.name.includes('lava')
    ) {
      return y;
    }
  }
  return null;
}

export function registerExploreTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('explore', {
    title: 'Explore',
    description: 'Walk in a random direction to discover new terrain and blocks. Useful when resources are not found nearby.',
    inputSchema: z.object({
      distance: z.number().default(20).describe('Approximate distance to explore. Defaults to 20.'),
    }),
  }, async ({ distance }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    try {
      const { Movements } = await import("mineflayer-pathfinder");
      const defaultMove = new Movements(bot);
      defaultMove.canDig = false; // don't dig during exploration
      defaultMove.allow1by1towers = false;
      bot.pathfinder.setMovements(defaultMove);

      const pos = bot.entity.position;
      const angle = Math.random() * Math.PI * 2;
      const dx = Math.round(Math.cos(angle) * distance);
      const dz = Math.round(Math.sin(angle) * distance);

      const targetX = Math.floor(pos.x + dx);
      const targetZ = Math.floor(pos.z + dz);

      // Find the surface Y at the target XZ by scanning downward from 320
      let targetY = Math.floor(pos.y);
      for (let y = 320; y > 40; y--) {
        const block = bot.blockAt(new Vec3(targetX, y, targetZ));
        const blockBelow = bot.blockAt(new Vec3(targetX, y - 1, targetZ));
        if (
          block && (block.name === 'air' || block.name === 'cave_air') &&
          blockBelow && blockBelow.name !== 'air' && blockBelow.name !== 'cave_air' &&
          !blockBelow.name.includes('water') && !blockBelow.name.includes('lava')
        ) {
          targetY = y;
          break;
        }
      }

      // Also ensure the bot itself is at surface before exploring
      const currentY = Math.floor(pos.y);
      const botSurface = await getSurfaceY(bot, Math.floor(pos.x), Math.floor(pos.z));
      if (botSurface !== null && Math.abs(currentY - botSurface) > 3) {
        // Bot is underground — go to surface first
        const surfaceGoal = new GoalNear(Math.floor(pos.x), botSurface, Math.floor(pos.z), 2);
        const surfaceMove = new Movements(bot);
        surfaceMove.canDig = true;
        bot.pathfinder.setMovements(surfaceMove);
        try {
          await bot.pathfinder.goto(surfaceGoal);
        } catch { /* continue anyway */ }
        bot.pathfinder.setMovements(defaultMove);
      }

      // Use GoalXZ which delegates Y-axis finding to pathfinder
      const goal = new GoalXZ(targetX, targetZ);
      const startPos = pos.clone();
      
      try {
        await bot.pathfinder.goto(goal);
      } catch (err: any) {
        // GoalXZ sometimes throws if it gets as close as it can but doesn't reach exact XZ.
        // We can ignore it if we moved significantly.
        console.log(`[explore] goto threw: ${err.message}, checking if we moved anyway`);
      }

      const endPos = bot.entity.position;
      const actualDistance = startPos.distanceTo(endPos);

      if (actualDistance < 2) {
        return textResult(formatObservation(buildObservation(bot,
          `Failed to explore: Bot is stuck at (${endPos.x.toFixed(1)}, ${endPos.y.toFixed(1)}, ${endPos.z.toFixed(1)}). Try mining blocks around you or repositioning to escape.`
        )));
      }

      return textResult(formatObservation(buildObservation(bot,
        `Successfully explored ${actualDistance.toFixed(1)} blocks in direction (${dx}, ${dz}) to find new terrain.`
      )));
    } catch (error: any) {
      return textResult(formatObservation(buildObservation(bot,
        `Failed to explore: ${error.message}`
      )));
    }
  });
}
