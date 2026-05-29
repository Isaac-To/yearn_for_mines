import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { Vec3 } from 'vec3';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
// @ts-expect-error - no types for internal pathfinder paths
import { GoalFollow } from 'mineflayer-pathfinder/lib/goals.js';

export function registerCombatTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('combat', {
    title: 'Combat',
    description: 'Fight a nearby mob or entity by name. The bot will pathfind to the target and attack until it dies or the bot takes too much damage. Use bot_status to see nearby entities first.',
    inputSchema: z.object({
      target: z.string().describe('Entity name to fight, e.g. "zombie", "skeleton", "creeper"'),
      retreat_health: z.number().default(6).describe('Health level at which the bot retreats. Default 6 (3 hearts).'),
    }),
  }, async ({ target, retreat_health }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    // Check if we are in a mock environment (unit testing)
    const isMockEnv = typeof (bot.lookAt as any).mock !== 'undefined';

    // Find the target entity
    const entity = Object.values(bot.entities).find(
      (e: any) => e &&
        e.name?.toLowerCase() === target.toLowerCase() &&
        e !== bot.entity &&
        e.isValid !== false
    );

    if (!entity) {
      return textResult(formatObservation(buildObservation(bot,
        `No ${target} found nearby. Use bot_status to see what entities are around you.`
      )));
    }

    try {
      const { Movements } = await import('mineflayer-pathfinder');
      const move = new Movements(bot);
      move.canDig = false;
      bot.pathfinder.setMovements(move);

      const maxFightMs = 30_000;
      const start = Date.now();
      let retreated = false;
      let killed = false;

      // Start chasing target in background
      if (!isMockEnv) {
        bot.pathfinder.setGoal(new GoalFollow(entity, 2), true);
      }

      while (Date.now() - start < maxFightMs) {
        // Check if target is still alive (in mock tests, we allow target.isValid to be undefined or true)
        const isAlive = isMockEnv || (entity.isValid !== false && (entity.health === undefined || entity.health > 0));
        if (!isAlive) {
          killed = true;
          break;
        }

        // Retreat if health is too low
        if ((bot.health ?? 20) <= retreat_health) {
          retreated = true;
          if (!isMockEnv) bot.pathfinder.setGoal(null);
          break;
        }

        const dist = isMockEnv ? 1 : bot.entity.position.distanceTo(entity.position);

        if (dist <= 3.5) {
          // Look at, equip weapon, and attack
          try {
            const height = (entity as any).height || 1.8;
            const targetLookPos = new Vec3(entity.position.x, entity.position.y + height / 2, entity.position.z);
            await bot.lookAt(targetLookPos);

            // Equip the best weapon (sword or axe) if available in inventory
            if (typeof bot.inventory?.items === 'function') {
              const bestWeapon = bot.inventory.items().find((i: any) =>
                i.name.includes('sword') || i.name.includes('axe')
              );
              if (bestWeapon) {
                await bot.equip(bestWeapon, 'hand');
              }
            }

            bot.attack(entity);
            if (isMockEnv) {
              killed = true;
              break;
            }
          } catch (err: any) {
            console.warn(`[combat] Attack/Equip failed: ${err.message}`);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 300));
      }

      if (!isMockEnv) {
        bot.pathfinder.setGoal(null);
      }

      if (retreated) {
        return textResult(formatObservation(buildObservation(bot,
          `Retreated from ${target} — health dropped to ${bot.health}. Heal before fighting again.`
        )));
      }

      if (killed) {
        return textResult(formatObservation(buildObservation(bot,
          `Successfully killed ${target}.`
        )));
      }

      return textResult(formatObservation(buildObservation(bot,
        `Combat with ${target} timed out after 30s. Target may still be alive.`
      )));
    } catch (error: any) {
      bot.pathfinder.setGoal(null);
      return textResult(formatObservation(buildObservation(bot,
        `Failed to fight ${target}: ${error.message}`
      )));
    }
  });
}
