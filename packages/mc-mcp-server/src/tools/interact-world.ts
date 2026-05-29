import { Vec3 } from 'vec3';
// @ts-expect-error - no types for internal pathfinder paths
import { GoalNear } from 'mineflayer-pathfinder/lib/goals.js';
import type { Bot } from 'mineflayer';

/** Check if bot is stuck in a hole (surrounded by solid blocks at leg level) */
export function isInHole(bot: Bot): boolean {
    if (!bot.entity || !bot.entity.position) return false;
    const pos = bot.entity.position;
    const floorY = Math.floor(pos.y - 0.1);

    // Check immediate horizontal neighbors at bot's leg level (floorY + 1)
    const checkOffsets = [
        new Vec3(1, 0, 0),
        new Vec3(-1, 0, 0),
        new Vec3(0, 0, 1),
        new Vec3(0, 0, -1),
    ];

    let blockedSides = 0;
    for (const offset of checkOffsets) {
        const checkPos = new Vec3(Math.floor(pos.x) + offset.x, floorY + 1, Math.floor(pos.z) + offset.z);
        const block = bot.blockAt(checkPos);
        if (block) {
            const bType = bot.registry.blocks[block.type];
            if (bType && bType.boundingBox === 'block') {
                blockedSides++;
            }
        }
    }

    // In a hole if 3+ sides are blocked
    return blockedSides >= 3;
}

/** Attempt to escape a hole by jumping up and moving outward */
export async function escapeHole(bot: Bot, maxAttempts: number = 3): Promise<boolean> {
    console.log(`[interact-world] Bot is in a hole, attempting to escape...`);

    if (!bot.entity || !bot.entity.position) return false;

    // Stop pathfinder to prevent manual control conflicts
    if ((bot as any).pathfinder) {
        try {
            (bot as any).pathfinder.setGoal(null);
        } catch { /* ignore */ }
    }

    // Check if we are already out of the hole
    if (!isInHole(bot)) {
        console.log(`[interact-world] Not in a hole.`);
        return true;
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            console.log(`[interact-world] Escape attempt ${attempt + 1}/${maxAttempts}`);

            const pos = bot.entity.position;
            const floorY = Math.floor(pos.y - 0.1);

            // Check if there is a ceiling directly above the bot's head (at floorY + 3)
            const headSpacePos = new Vec3(Math.floor(pos.x), floorY + 3, Math.floor(pos.z));
            const headSpaceBlock = bot.blockAt(headSpacePos);
            const headSpaceBType = headSpaceBlock ? bot.registry.blocks[headSpaceBlock.type] : null;
            if (headSpaceBType && headSpaceBType.boundingBox === 'block') {
                console.log(`[interact-world] Cannot escape hole: solid block directly above head.`);
                return false;
            }

            // 1. Try to jump out horizontally first (if a cardinal direction is clear at head/above-head height)
            const checkOffsets = [
                { dir: new Vec3(1, 0, 0), control: 'right' },
                { dir: new Vec3(-1, 0, 0), control: 'left' },
                { dir: new Vec3(0, 0, 1), control: 'forward' },
                { dir: new Vec3(0, 0, -1), control: 'back' }
            ];

            let jumpedOut = false;
            for (const offset of checkOffsets) {
                const targetX = Math.floor(pos.x) + offset.dir.x;
                const targetZ = Math.floor(pos.z) + offset.dir.z;

                // Check block at head height (floorY + 2) and above head height (floorY + 3) in the target direction
                const wallBlock = bot.blockAt(new Vec3(targetX, floorY + 2, targetZ));
                const wallAboveBlock = bot.blockAt(new Vec3(targetX, floorY + 3, targetZ));

                const wallBType = wallBlock ? bot.registry.blocks[wallBlock.type] : null;
                const wallAboveBType = wallAboveBlock ? bot.registry.blocks[wallAboveBlock.type] : null;

                // If the blocks at head and above-head height are non-solid, we can jump into them
                const headClear = !wallBType || wallBType.boundingBox !== 'block';
                const aboveClear = !wallAboveBType || wallAboveBType.boundingBox !== 'block';

                if (headClear && aboveClear) {
                    console.log(`[interact-world] Attempting to jump-move in direction: ${offset.control}`);
                    
                    // Look in that direction
                    const targetLookPos = new Vec3(targetX + 0.5, floorY + 1.62, targetZ + 0.5);
                    await bot.lookAt(targetLookPos);
                    
                    // Reset all other movement controls to prevent movement conflicts
                    bot.setControlState('forward', false);
                    bot.setControlState('back', false);
                    bot.setControlState('left', false);
                    bot.setControlState('right', false);
                    bot.setControlState('jump', false);
                    bot.setControlState('sprint', false);

                    // Jump and move forward
                    bot.setControlState('jump', true);
                    bot.setControlState('forward', true);
                    
                    await new Promise(resolve => setTimeout(resolve, 350));
                    
                    bot.setControlState('jump', false);
                    bot.setControlState('forward', false);
                    
                    await new Promise(resolve => setTimeout(resolve, 150));

                    if (!isInHole(bot)) {
                        console.log(`[interact-world] Successfully jump-escaped hole`);
                        jumpedOut = true;
                        break;
                    }
                }
            }

            if (jumpedOut) return true;

            // 2. If jumping out horizontally failed, try to pillar up (place block under feet)
            const placeableBlockNames = ['dirt', 'cobblestone', 'stone', 'gravel', 'sand', 'oak_planks', 'spruce_planks', 'birch_planks'];
            const placeableItem = bot.inventory.items().find(i => placeableBlockNames.includes(i.name));

            if (placeableItem) {
                console.log(`[interact-world] Attempting to pillar up using ${placeableItem.name}`);
                
                // Track start position and block below BEFORE jumping
                const startPos = bot.entity.position.clone();
                const belowPos = new Vec3(Math.floor(startPos.x), floorY, Math.floor(startPos.z));
                const blockBelow = bot.blockAt(belowPos);

                if (blockBelow && blockBelow.name !== 'air') {
                    // Equip the item
                    await bot.equip(placeableItem, 'hand');
                    
                    // Look straight down
                    await bot.look(bot.entity.yaw, -Math.PI / 2);
                    
                    // Reset movement controls
                    bot.setControlState('forward', false);
                    bot.setControlState('back', false);
                    bot.setControlState('left', false);
                    bot.setControlState('right', false);
                    bot.setControlState('sprint', false);

                    // Jump
                    bot.setControlState('jump', true);
                    await new Promise(resolve => setTimeout(resolve, 150));
                    
                    // Place block under feet on the block we were standing on
                    try {
                        await bot.placeBlock(blockBelow, new Vec3(0, 1, 0));
                        console.log(`[interact-world] Placed block underneath feet`);
                    } catch (e: any) {
                        console.log(`[interact-world] Failed to place block: ${e.message}`);
                    }
                    
                    bot.setControlState('jump', false);
                    await new Promise(resolve => setTimeout(resolve, 250)); // Wait to land on placed block

                    if (!isInHole(bot)) {
                        console.log(`[interact-world] Successfully pillared out of hole`);
                        return true;
                    }
                } else {
                    console.log(`[interact-world] Cannot pillar: block below feet is not valid or is air.`);
                }
            } else {
                console.log(`[interact-world] No placeable blocks to pillar up.`);
                console.log(`[interact-world] No valid escape options remaining. Aborting escape.`);
                return false;
            }

            await new Promise(resolve => setTimeout(resolve, 200));
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
