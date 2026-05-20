import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { isInHole, escapeHole, findValidPlacementSpot } from './interact-world.js';

/** Get inventory count of an item by name */
export function getInventoryCount(bot: Bot, itemName: string): number {
    return bot.inventory.items()
        .filter((i: any) => i.name === itemName)
        .reduce((sum: number, i: any) => sum + i.count, 0);
}

interface FindOrPlaceResult {
    tableBlock?: any;
    placedNewTable: boolean;
    error?: string;
}

/**
 * Finds a crafting table within 32 blocks or attempts to place one from the bot's inventory.
 * Automatically handles escaping from holes if stuck before placing.
 */
export async function findOrPlaceCraftingTable(bot: Bot, tableBlockId: number): Promise<FindOrPlaceResult> {
    console.log(`[interact-crafting] Searching for crafting table...`);

    // Try to find existing table within 32 blocks (reuse strategy - Voyager pattern)
    let table = bot.findBlock({ matching: tableBlockId, maxDistance: 32 });
    let placedNewTable = false;

    if (table) {
        console.log(`[interact-crafting] Found existing crafting table at (${table.position.x}, ${table.position.y}, ${table.position.z})`);
        // Quick verify: table exists at expected location
        const tableVerify = bot.blockAt(table.position);
        if (!tableVerify || tableVerify.type === 0) {
            // Table disappeared, will place new one
            console.log(`[interact-crafting] Existing table disappeared, will place new one`);
            table = null;
        } else {
            // Check distance - skip if too far (faster to place new one)
            const distToTable = bot.entity.position.distanceTo(table.position);
            if (distToTable > 32) {
                console.log(`[interact-crafting] Table too far (${distToTable.toFixed(1)} blocks), placing new one instead`);
                table = null;
            }
        }
    }

    if (!table) {
        console.log(`[interact-crafting] No nearby table found, attempting to place one...`);
        const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table');
        if (!tableItem) {
            return { placedNewTable: false, error: 'No crafting table found nearby and none in inventory.' };
        }

        // Track item count before placement (Voyager pattern)
        const tableCountBefore = getInventoryCount(bot, 'crafting_table');

        if (!bot.entity || !bot.entity.position) {
            return { placedNewTable: false, error: 'Bot position is undefined.' };
        }

        const botPos = bot.entity.position;
        const searchOffsets = [
            new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1),
            new Vec3(2, 0, 0), new Vec3(-2, 0, 0), new Vec3(0, 0, 2), new Vec3(0, 0, -2),
        ];

        let placed = false;
        let placementError = '';

        // Try placement with multiple attempts (Voyager-style failure handling)
        for (let attempt = 0; attempt < 3 && !placed; attempt++) {
            let placement = findValidPlacementSpot(bot, botPos, searchOffsets);
            if (!placement) {
                placementError = 'No valid placement spot found';
                // If in hole, try to escape
                if (attempt === 0 && isInHole(bot)) {
                    console.log(`[interact-crafting] Bot in hole, attempting escape...`);
                    const escaped = await escapeHole(bot, 2);
                    if (escaped) {
                        // Retry after escape
                        const newBotPos = bot.entity.position;
                        placement = findValidPlacementSpot(bot, newBotPos, searchOffsets);
                    }
                }
                if (!placement) continue;
            }

            try {
                console.log(`[interact-crafting] Placing table at (${placement.pos.x}, ${placement.pos.y}, ${placement.pos.z}) [attempt ${attempt + 1}/3]`);
                await bot.equip(tableItem, 'hand');
                await bot.placeBlock(placement.refBlock, new Vec3(0, 1, 0));
                await new Promise(resolve => setTimeout(resolve, 100));

                // Verify placement by checking inventory (Voyager pattern)
                const tableCountAfter = getInventoryCount(bot, 'crafting_table');
                if (tableCountAfter < tableCountBefore) {
                    // Item was consumed, placement likely succeeded
                    console.log(`[interact-crafting] Item consumed (${tableCountBefore} → ${tableCountAfter}), verifying block...`);
                    table = bot.blockAt(placement.pos);
                    if (!table || table.type === 0) {
                        // Block not at expected position, search nearby
                        const nearbyTable = bot.findBlock({ matching: tableBlockId, maxDistance: 3, point: placement.pos });
                        if (nearbyTable) {
                            table = nearbyTable;
                            console.log(`[interact-crafting] Found placed table at (${table.position.x}, ${table.position.y}, ${table.position.z})`);
                            placed = true;
                        } else {
                            placementError = 'Item consumed but block not found';
                            continue;
                        }
                    } else {
                        console.log(`[interact-crafting] Table verified at expected position`);
                        placedNewTable = true;
                        placed = true;
                    }
                } else {
                    // Item still in inventory, placement failed
                    placementError = `Item not consumed (${tableCountBefore} still in inventory)`;
                    console.log(`[interact-crafting] Placement failed: ${placementError}`);
                    continue;
                }
            } catch (placeErr) {
                placementError = (placeErr as any)?.message || 'Unknown placement error';
                console.log(`[interact-crafting] Placement attempt ${attempt + 1} failed: ${placementError}`);
            }
        }

        if (!placed) {
            return { placedNewTable: false, error: `Failed to place crafting table. ${placementError}` };
        }

        // Ensure table is set before proceeding
        if (!table) {
            return { placedNewTable: false, error: 'Placement succeeded but table block not found.' };
        }
    }

    return { tableBlock: table, placedNewTable };
}
