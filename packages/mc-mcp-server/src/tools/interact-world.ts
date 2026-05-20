import { Vec3 } from 'vec3';
// @ts-expect-error - no types for internal pathfinder paths
import { GoalNear } from 'mineflayer-pathfinder/lib/goals.js';
import type { Bot } from 'mineflayer';

/** Check if bot is stuck in a hole (surrounded by blocks at ground level) */
export function isInHole(bot: Bot): boolean {
    if (!bot.entity || !bot.entity.position) return false;
    const pos = bot.entity.position;

    // Check immediate horizontal neighbors at bot's feet
    const checkOffsets = [
        new Vec3(1, 0, 0),
        new Vec3(-1, 0, 0),
        new Vec3(0, 0, 1),
        new Vec3(0, 0, -1),
    ];

    let blockedSides = 0;
    for (const offset of checkOffsets) {
        const checkPos = new Vec3(pos.x + offset.x, pos.y, pos.z + offset.z);
        const block = bot.blockAt(checkPos);
        if (block && block.type !== 0) {
            blockedSides++;
        }
    }

    // In a hole if 3+ sides are blocked
    return blockedSides >= 3;
}

/** Attempt to escape a hole by jumping up and moving outward */
export async function escapeHole(bot: Bot, maxAttempts: number = 3): Promise<boolean> {
    console.log(`[interact-world] Bot is in a hole, attempting to escape...`);

    if (!bot.entity || !bot.entity.position) return false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            // Try to jump and move to a higher Y position
            console.log(`[interact-world] Escape attempt ${attempt + 1}/${maxAttempts}`);

            // Jump to increase Y
            bot.setControlState('jump', true);
            await new Promise(resolve => setTimeout(resolve, 100));
            bot.setControlState('jump', false);

            // Try moving in different directions
            const moveDirections = [
                { forward: true, back: false, left: false, right: false },
                { forward: false, back: true, left: false, right: false },
                { forward: false, back: false, left: true, right: false },
                { forward: false, back: false, left: false, right: true },
            ];

            for (const direction of moveDirections) {
                bot.setControlState('forward', direction.forward);
                bot.setControlState('back', direction.back);
                bot.setControlState('left', direction.left);
                bot.setControlState('right', direction.right);
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Stop all movement
            bot.setControlState('forward', false);
            bot.setControlState('back', false);
            bot.setControlState('left', false);
            bot.setControlState('right', false);

            // Check if we escaped
            if (!isInHole(bot)) {
                console.log(`[interact-world] Successfully escaped hole`);
                await new Promise(resolve => setTimeout(resolve, 200));
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, 300));
        } catch (err) {
            console.log(`[interact-world] Escape attempt ${attempt + 1} failed: ${(err as any)?.message}`);
        }
    }

    console.log(`[interact-world] Failed to escape hole after ${maxAttempts} attempts`);
    return false;
}

/** Navigate bot to within interaction distance (5 blocks) of a target block */
export async function navigateToBlock(bot: Bot, targetPos: Vec3, maxAttempts: number = 3): Promise<boolean> {
    const INTERACTION_DISTANCE = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            if (!bot.entity || !bot.entity.position) return false;
            const currentDist = bot.entity.position.distanceTo(targetPos);
            console.log(`[interact-world] Navigate attempt ${attempt + 1}: distance to target = ${currentDist.toFixed(1)} blocks`);

            // If already close enough, we're done
            if (currentDist <= INTERACTION_DISTANCE) {
                console.log(`[interact-world] Already within interaction distance`);
                return true;
            }

            // Try pathfinder first (move within interaction distance)
            try {
                // Use GoalNear to get within interaction distance
                await (bot as any).pathfinder.goto(new GoalNear(targetPos.x, targetPos.y, targetPos.z, INTERACTION_DISTANCE));
                console.log(`[interact-world] Pathfinder navigation completed`);

                // Verify we're close enough
                const finalDist = bot.entity.position.distanceTo(targetPos);
                if (finalDist <= INTERACTION_DISTANCE) {
                    console.log(`[interact-world] Successfully navigated to within ${finalDist.toFixed(1)} blocks`);
                    return true;
                }
                console.log(`[interact-world] Pathfinder didn't get close enough (${finalDist.toFixed(1)} blocks)`);
            } catch (pathErr) {
                console.log(`[interact-world] Pathfinder failed: ${(pathErr as any)?.message}, using manual movement`);

                // Move toward target for a limited time
                const startTime = Date.now();
                const moveTimeMs = 2000; // Try moving for 2 seconds

                while (Date.now() - startTime < moveTimeMs) {
                    const currentDist = bot.entity.position.distanceTo(targetPos);
                    if (currentDist <= INTERACTION_DISTANCE) {
                        console.log(`[interact-world] Manual movement succeeded, distance: ${currentDist.toFixed(1)} blocks`);
                        return true;
                    }

                    // Set movement controls toward target
                    bot.setControlState('forward', true);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                bot.setControlState('forward', false);

                const finalDist = bot.entity.position.distanceTo(targetPos);
                if (finalDist <= INTERACTION_DISTANCE) {
                    console.log(`[interact-world] Manual movement got us close enough: ${finalDist.toFixed(1)} blocks`);
                    return true;
                }
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
            console.log(`[interact-world] Navigation attempt ${attempt + 1} error: ${(err as any)?.message}`);
        }
    }

    console.log(`[interact-world] Failed to navigate to block after ${maxAttempts} attempts`);
    return false;
}

/** Find valid placement spot with reference block validation (Voyager-style) */
export function findValidPlacementSpot(
    bot: Bot,
    centerPos: Vec3,
    searchOffsets: Vec3[]
): { pos: Vec3; refBlock: any } | null {
    for (const offset of searchOffsets) {
        const candidatePos = new Vec3(centerPos.x + offset.x, centerPos.y, centerPos.z + offset.z);
        const refBlockPos = new Vec3(candidatePos.x, candidatePos.y - 1, candidatePos.z);
        const refBlock = bot.blockAt(refBlockPos);
        const tableSpot = bot.blockAt(candidatePos);
        const aboveSpot = bot.blockAt(new Vec3(candidatePos.x, candidatePos.y + 1, candidatePos.z));

        // Valid if: solid ground below (not water/lava), air at placement, air above
        if (
            refBlock && refBlock.type !== 0 && !refBlock.name.includes('water') && !refBlock.name.includes('lava') &&
            tableSpot && tableSpot.type === 0 &&
            aboveSpot && aboveSpot.type === 0
        ) {
            return { pos: candidatePos, refBlock };
        }
    }
    return null;
}
