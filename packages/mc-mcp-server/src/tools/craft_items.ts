import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { findClosestMatches } from '../utils/string-match.js';
import { Vec3 } from 'vec3';
import { getInventoryCount, findOrPlaceCraftingTable } from './interact-crafting.js';
import { navigateToBlock, findValidPlacementSpot } from './interact-world.js';
import { openContainer, closeContainer } from './interact-containers.js';
import { resolveRecipePlan, formatRecipePlan } from './recipe-table.js';

export function registerCraftItemsTool(server: McpServer, botManager: BotManager): void {
    server.registerTool('craft_items', {
        title: 'Craft Items',
        description: 'Autonomously manages the crafting process, including placing a crafting table if needed. Follows the Voyager algorithm: find/place table → navigate → craft → cleanup. The recipe param must be the exact item name like "iron_pickaxe".',
        inputSchema: { recipe: z.string(), amount: z.number().default(1) },
    }, async ({ recipe, amount }) => {
        const bot = botManager.currentBot;
        if (!bot) return errorResult('Bot not connected');

        const craftAmount = amount ?? 1;

        const itemType = bot.registry.itemsByName[recipe];
        if (!itemType) {
            const validNames = Object.keys(bot.registry.itemsByName);
            const suggestions = findClosestMatches(recipe, validNames, 3);
            const suggestionsStr = suggestions.length > 0 ? ` Did you mean: '${suggestions.join("', '")}'?` : '';
            return textResult(formatObservation(buildObservation(bot, `Failed to craft: Unknown item '${recipe}'.${suggestionsStr}`)));
        }

        const alreadyHave = getInventoryCount(bot, recipe);
        if (alreadyHave >= craftAmount) {
            const inventorySnapshot = () => bot.inventory.items().map((i: any) => `${i.count}x ${i.name}`).join(', ') || 'empty';
            return textResult(formatObservation(buildObservation(bot,
                `Action skipped: Already have ${alreadyHave}x ${recipe} (need ${craftAmount}). ` +
                `Inventory: [${inventorySnapshot()}]`
            )));
        }

        try {
            console.log(`[craft_items] Starting craft for ${recipe}x${craftAmount}`);

            const recipeLookup = resolveRecipePlan(bot, recipe, craftAmount);
            if ('error' in recipeLookup) {
                return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: ${recipeLookup.error}`)));
            }

            const recipePlan = recipeLookup.plan;
            if (recipePlan.missingIngredients.length > 0) {
                const missingText = recipePlan.missingIngredients
                    .map((i) => `${i.missing}x ${i.itemName}`)
                    .join(', ');
                return textResult(formatObservation(buildObservation(bot,
                    `Cannot craft ${recipe}: Missing ingredients from recipe table: ${missingText}.\n${formatRecipePlan(recipePlan)}`
                )));
            }

            console.log(`[craft_items] Recipe table consulted:\n${formatRecipePlan(recipePlan)}`);

            // Cache tableBlockId to avoid multiple registry lookups
            const tableBlockId = bot.registry.blocksByName.crafting_table?.id;
            if (!tableBlockId) {
                return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Crafting table block not found in registry.`)));
            }

            // STEP 1: Try crafting without table first (for 2x2 recipes)
            console.log(`[craft_items] Checking for recipes without crafting table...`);
            let recipesWithout = bot.recipesFor(itemType.id, null, craftAmount, null);
            if (recipesWithout.length === 0) {
                recipesWithout = bot.recipesFor(itemType.id, null, 1, null);
            }

            if (recipesWithout.length > 0) {
                console.log(`[craft_items] Found recipe that works without table`);
                try {
                    const itemsBefore = getInventoryCount(bot, recipe);
                    const craftPromise = bot.craft(recipesWithout[0], craftAmount, undefined);
                    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
                    const timeoutPromise = new Promise<void>((_, reject) => {
                        timeoutHandle = setTimeout(() => {
                            try { bot.pathfinder.setGoal(null); } catch { /* ignore */ }
                            try { bot.stopDigging(); } catch { /* ignore */ }
                            reject(new Error('Craft timeout after 3000ms'));
                        }, 3000);
                    });
                    
                    try {
                        await Promise.race([craftPromise, timeoutPromise]);
                        if (timeoutHandle) clearTimeout(timeoutHandle);
                    } catch (err: any) {
                        if (timeoutHandle) clearTimeout(timeoutHandle);
                        await new Promise(resolve => setTimeout(resolve, 200));
                        if (getInventoryCount(bot, recipe) <= itemsBefore) {
                            throw err;
                        }
                    }
                    
                    console.log(`[craft_items] Successfully crafted using 2x2 grid`);
                    await new Promise(resolve => setTimeout(resolve, 300));
                    const obs = buildObservation(bot, `Successfully crafted ${craftAmount}x ${recipe} using player inventory.`);
                    return textResult(formatObservation(obs));
                } catch (error) {
                    console.log(`[craft_items] Failed to craft without table: ${(error as any)?.message}`);
                    // Fall through to try with table
                }
            }

            // STEP 2: Need crafting table - find or place one
            console.log(`[craft_items] Recipe requires a crafting table, searching...`);
            const tableResult = await findOrPlaceCraftingTable(bot, tableBlockId);
            if (tableResult.error) {
                return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: ${tableResult.error}`)));
            }

            let tableBlock = tableResult.tableBlock;
            let placedNewTable = tableResult.placedNewTable;

            // STEP 3: Get recipes with the crafting table
            console.log(`[craft_items] Getting recipes with crafting table at (${tableBlock.position.x}, ${tableBlock.position.y}, ${tableBlock.position.z})`);
            const recipes = bot.recipesFor(itemType.id, null, craftAmount, tableBlock);

            if (recipes.length === 0) {
                const allRecipes = bot.recipesAll(itemType.id, null, tableBlock);
                if (allRecipes.length > 0) {
                    const recipeObj = allRecipes[0];
                    const missingIngredients: string[] = [];
                    if (recipeObj.delta) {
                        for (const item of recipeObj.delta) {
                            if (item.count < 0) {
                                const reqCount = Math.abs(item.count) * craftAmount;
                                const hasCount = getInventoryCount(bot, bot.registry.items[item.id].name);
                                if (hasCount < reqCount) {
                                    const missingCount = reqCount - hasCount;
                                    missingIngredients.push(`${missingCount}x ${bot.registry.items[item.id].name}`);
                                }
                            }
                        }
                    }
                    if (missingIngredients.length > 0) {
                        return textResult(formatObservation(buildObservation(bot,
                            `Cannot craft ${recipe}: Missing ingredients: ${missingIngredients.join(', ')}.`
                        )));
                    }
                }
                return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: No valid recipe found. Check inventory for required ingredients.`)));
            }

            const recipeObj = recipes[0];
            console.log(`[craft_items] Selected recipe for crafting`);

            // STEP 4: Navigate to the table (get within interaction distance)
            try {
                console.log(`[craft_items] Navigating to crafting table...`);
                const navigated = await navigateToBlock(bot, tableBlock.position, 3);

                if (navigated) {
                    console.log(`[craft_items] Successfully navigated to crafting table`);
                } else {
                    console.log(`[craft_items] Failed to navigate to crafting table`);

                    // If this was an existing table that we couldn't navigate to, try placing a new one instead
                    if (!placedNewTable) {
                        console.log(`[craft_items] Could not reach existing table, attempting to place a new one nearby...`);

                        const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table');
                        if (!tableItem) {
                            return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Could not navigate to existing table and no crafting table in inventory to place a new one.`)));
                        }

                        if (!bot.entity || !bot.entity.position) {
                            return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Bot position is undefined.`)));
                        }

                        const botPos = bot.entity.position;
                        const searchOffsets = [
                            new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1),
                            new Vec3(2, 0, 0), new Vec3(-2, 0, 0), new Vec3(0, 0, 2), new Vec3(0, 0, -2),
                        ];

                        const newPlacement = findValidPlacementSpot(bot, botPos, searchOffsets);
                        if (!newPlacement) {
                            return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Could not navigate to existing table and no valid spot to place a new one.`)));
                        }

                        // Place the new table (Voyager pattern: explicit item verification)
                        try {
                            const tableCountBefore = getInventoryCount(bot, 'crafting_table');
                            console.log(`[craft_items] Placing fallback table, items before: ${tableCountBefore}`);

                            await bot.equip(tableItem, 'hand');
                            await bot.placeBlock(newPlacement.refBlock, new Vec3(0, 1, 0));
                            await new Promise(resolve => setTimeout(resolve, 100));

                            // Verify by checking inventory (Voyager pattern)
                            const tableCountAfter = getInventoryCount(bot, 'crafting_table');
                            if (tableCountAfter < tableCountBefore) {
                                console.log(`[craft_items] Item consumed (${tableCountBefore} → ${tableCountAfter}), verifying block...`);
                                tableBlock = bot.blockAt(newPlacement.pos) as any;
                                if (!tableBlock || tableBlock.type === 0) {
                                    const nearbyTable = bot.findBlock({ matching: tableBlockId, maxDistance: 3, point: newPlacement.pos });
                                    if (nearbyTable) {
                                        tableBlock = nearbyTable as any;
                                        console.log(`[craft_items] Found fallback table at (${tableBlock.position.x}, ${tableBlock.position.y}, ${tableBlock.position.z})`);
                                        placedNewTable = true;
                                    } else {
                                        return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Item consumed but fallback table not found.`)));
                                    }
                                } else {
                                    console.log(`[craft_items] Fallback table verified at (${tableBlock.position.x}, ${tableBlock.position.y}, ${tableBlock.position.z})`);
                                    placedNewTable = true;
                                }
                            } else {
                                return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Failed to place fallback table (item not consumed).`)));
                            }
                        } catch (placeErr) {
                            console.log(`[craft_items] Failed to place fallback table: ${(placeErr as any)?.message}`);
                            return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Could not place fallback table. ${(placeErr as any)?.message}`)));
                        }
                    } else {
                        // Already placed a new table, but can't navigate to it - error
                        return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Failed to navigate to placed crafting table. ${(navigated as any)?.message}`)));
                    }
                }
            } catch (navError) {
                const errMsg = (navError as any)?.message || String(navError);
                console.log(`[craft_items] Navigation error: ${errMsg}`);
                if (!placedNewTable) {
                    return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Failed to navigate to crafting table. ${errMsg}`)));
                }
                console.log(`[craft_items] Continuing anyway since we placed the table`);
            }

            // STEP 5: Open the crafting table interface
            console.log(`[craft_items] Opening crafting table interface...`);
            const opened = await openContainer(bot, tableBlock);
            if (!opened) {
                console.log(`[craft_items] Warning: Window did not open or table block was lost, continuing anyway`);
            }

            // STEP 6: Craft the item with explicit verification (Voyager pattern)
            let craftAttempts = 0;
            const maxCraftAttempts = 3;
            let craftSucceeded = false;

            while (craftAttempts < maxCraftAttempts && !craftSucceeded) {
                craftAttempts++;
                console.log(`[craft_items] Craft attempt ${craftAttempts}/${maxCraftAttempts}`);

                // Skip verification of newly placed table (we know it exists)
                // Only verify existing tables on first attempt
                if (!placedNewTable && craftAttempts === 1) {
                    const tableStillExists = bot.blockAt(tableBlock.position);
                    if (!tableStillExists || tableStillExists.type === 0) {
                        return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Crafting table was destroyed.`)));
                    }
                }

                try {
                    // Track items before crafting (Voyager pattern - explicit verification)
                    const itemsBefore = getInventoryCount(bot, recipe);
                    console.log(`[craft_items] Items before craft: ${itemsBefore}x ${recipe}`);

                    console.log(`[craft_items] Crafting ${craftAmount}x ${recipe}...`);
                    const craftPromise = bot.craft(recipeObj, craftAmount, tableBlock);
                    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
                    const timeoutPromise = new Promise<void>((_, reject) => {
                        timeoutHandle = setTimeout(() => {
                            try { bot.pathfinder.setGoal(null); } catch { /* ignore */ }
                            try { bot.stopDigging(); } catch { /* ignore */ }
                            reject(new Error('Craft timeout after 3000ms'));
                        }, 3000);
                    });
                    try {
                        await Promise.race([craftPromise, timeoutPromise]);
                        if (timeoutHandle) clearTimeout(timeoutHandle);
                        console.log(`[craft_items] Craft API call succeeded`);
                    } catch (err: any) {
                        if (timeoutHandle) clearTimeout(timeoutHandle);
                        await new Promise(resolve => setTimeout(resolve, 200));
                        const itemsAfterTimeout = getInventoryCount(bot, recipe);
                        if (itemsAfterTimeout > itemsBefore) {
                            console.log(`[craft_items] Craft succeeded despite timeout (inventory confirms it)`);
                            craftSucceeded = true;
                            continue;
                        }
                        throw err;
                    }

                    // Wait for inventory to update
                    await new Promise(resolve => setTimeout(resolve, 100));

                    // Verify by checking inventory (Voyager pattern - outcome verification)
                    const itemsAfter = getInventoryCount(bot, recipe);
                    console.log(`[craft_items] Items after craft: ${itemsAfter}x ${recipe}`);

                    if (itemsAfter > itemsBefore) {
                        const gained = itemsAfter - itemsBefore;
                        console.log(`[craft_items] Crafting verified: gained ${gained}x ${recipe}`);
                        craftSucceeded = true;
                    } else {
                        console.log(`[craft_items] Verification failed: item count did not increase (before: ${itemsBefore}, after: ${itemsAfter})`);

                        if (craftAttempts < maxCraftAttempts) {
                            console.log(`[craft_items] Retrying crafting...`);
                            await closeContainer(bot);

                            // Reopen the table
                            try {
                                await openContainer(bot, tableBlock);
                            } catch (e) {
                                console.log(`[craft_items] Could not reopen table: ${(e as any)?.message}`);
                            }
                        }
                    }
                } catch (craftError) {
                    console.log(`[craft_items] Crafting attempt ${craftAttempts} failed: ${(craftError as any)?.message}`);

                    if (craftAttempts < maxCraftAttempts) {
                        console.log(`[craft_items] Retrying crafting...`);
                        await closeContainer(bot);

                        try {
                            await openContainer(bot, tableBlock);
                        } catch (e) {
                            console.log(`[craft_items] Could not reopen table: ${(e as any)?.message}`);
                        }
                    }
                }
            }

            if (!craftSucceeded) {
                console.log(`[craft_items] Crafting failed after ${maxCraftAttempts} attempts`);
                await closeContainer(bot);
                return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Item verification failed after ${maxCraftAttempts} attempts. Check that you have required ingredients.`)));
            }

            // STEP 7: Close the crafting window if it's still open
            await closeContainer(bot);

            // STEP 8: Clean up placed table if needed
            let cleanupMsg = '';
            if (placedNewTable) {
                try {
                    const tableForCleanup = bot.blockAt(tableBlock.position);
                    if (tableForCleanup && tableForCleanup.type !== 0) {
                        const distToTable = bot.entity.position.distanceTo(tableBlock.position);
                        // Only cleanup if close (< 6 blocks), otherwise skip for speed
                        if (distToTable <= 6) {
                            try {
                                await bot.dig(tableBlock);
                                cleanupMsg = ' (cleaned up)';
                            } catch (digError) {
                                console.log(`[craft_items] Cleanup dig failed: ${(digError as any)?.message}`);
                            }
                        } else {
                            cleanupMsg = ' (table left in place)';
                        }
                    }
                } catch (cleanupError) {
                    console.log(`[craft_items] Cleanup error: ${(cleanupError as any)?.message}`);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 300));
            const obs = buildObservation(bot, `Successfully crafted ${craftAmount}x ${recipe}${cleanupMsg}.`);
            return textResult(formatObservation(obs));
        } catch (error: any) {
            console.log(`[craft_items] Unexpected error: ${error.message}`);
            const obs = buildObservation(bot, `Failed to craft ${recipe}: ${error.message}`);
            return textResult(formatObservation(obs));
        }
    });
}
