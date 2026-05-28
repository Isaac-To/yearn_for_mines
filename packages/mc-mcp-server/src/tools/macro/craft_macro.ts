import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../../observation-builder.js';
import { formatObservation } from '../../observation-formatter.js';
import { Vec3 } from 'vec3';
import { resolveRecipePlan, formatRecipePlan } from '../recipe-table.js';
// @ts-expect-error - no types available for internal mineflayer-pathfinder paths
import { GoalNear } from 'mineflayer-pathfinder/lib/goals.js';

export function registerCraftMacroTool(server: McpServer, botManager: BotManager): void {
    server.registerTool('craft_macro', {
        title: 'Craft Macro',
        description: 'Unified macro for crafting items. Handles both 2x2 and 3x3 crafting automatically, including finding and navigating to a crafting table if needed. Can conditionally craft, place, and clean up a crafting table.',
        inputSchema: {
            item_name: z.string(),
            count: z.number().default(1),
            craft_table_if_missing: z.boolean().default(false),
            cleanup_table: z.boolean().default(true)
        },
    }, async ({ item_name, count, craft_table_if_missing, cleanup_table }) => {
        const bot = botManager.currentBot;
        if (!bot) return errorResult('Bot not connected');

        const itemType = bot.registry.itemsByName[item_name];
        if (!itemType) {
            return textResult(formatObservation(buildObservation(bot,
                `Failed to craft: Unknown item '${item_name}'. ` +
                `Do NOT retry with the same name. Use exact Minecraft Java IDs like ` +
                `'oak_planks', 'stick', 'wooden_pickaxe', 'stone_pickaxe'.`
            )));
        }

        // Helper to format inventory for LLM context
        const inventorySnapshot = () =>
            bot.inventory.items().map(i => `${i.count}x ${i.name}`).join(', ') || 'empty';

        // Helper to get count of a specific item for craft verification
        const getInventoryCount = (bot: any, itemName: string) => {
            return bot.inventory.items()
                .filter((i: any) => i.name === itemName)
                .reduce((acc: number, i: any) => acc + i.count, 0);
        };

        const alreadyHave = getInventoryCount(bot, item_name);
        if (alreadyHave >= count) {
            return textResult(formatObservation(buildObservation(bot,
                `Action skipped: Already have ${alreadyHave}x ${item_name}. ` +
                `Inventory: [${inventorySnapshot()}]`
            )));
        }

        try {
            const recipeLookup = resolveRecipePlan(bot, item_name, count ?? 1);
            if ('error' in recipeLookup) {
                return textResult(formatObservation(buildObservation(bot, `Cannot craft ${item_name}: ${recipeLookup.error}`)));
            }

            const recipePlan = recipeLookup.plan;
            if (recipePlan.missingIngredients.length > 0) {
                const missingText = recipePlan.missingIngredients
                    .map((i) => `${i.missing}x ${i.itemName}`)
                    .join(', ');
                return textResult(formatObservation(buildObservation(bot,
                    `Cannot craft ${item_name}: Missing ingredients from recipe table: ${missingText}.\n${formatRecipePlan(recipePlan)}`
                )));
            }

            console.log(`[craft_macro] Recipe table consulted:\n${formatRecipePlan(recipePlan)}`);

            const tableId = bot.registry.blocksByName.crafting_table.id;

            // --- BUG 1 FIX: Check 2x2 first, then 3x3 with actual table reference ---
            // Passing null as the table means mineflayer will NEVER return 3x3 recipes.
            // We must pass a real table block (or one we know exists) to get 3x3 recipes.

            // Step 1: Try 2x2 recipes (no table needed)
            let recipeList = bot.recipesFor(itemType.id, null, count, null);
            if (recipeList.length === 0) {
                recipeList = bot.recipesFor(itemType.id, null, 1, null);
            }

            // Step 2: If no 2x2 recipe, look for a table and try 3x3
            const tableForRecipeLookup = recipeList.length === 0
                ? bot.findBlock({ matching: tableId, maxDistance: 32 })
                : null;

            if (recipeList.length === 0 && tableForRecipeLookup) {
                recipeList = bot.recipesFor(itemType.id, null, count, tableForRecipeLookup);
                if (recipeList.length === 0) {
                    recipeList = bot.recipesFor(itemType.id, null, 1, tableForRecipeLookup);
                }
            }

            // Step 3: If still no recipe (no table nearby yet), try with a dummy table
            // lookup so we can at least detect if the item CAN be crafted at all
            if (recipeList.length === 0) {
                // Use a throwaway lookup with a fake table to test if recipe exists
                // mineflayer recipesFor accepts a block object; we just need any crafting_table
                // If craft_table_if_missing is true we'll place one shortly, so this is fine
                const anywhereTable = { type: tableId, name: 'crafting_table' } as any;
                recipeList = bot.recipesFor(itemType.id, null, 1, anywhereTable);
            }

            if (recipeList.length === 0) {
                const anywhereTable = { type: tableId, name: 'crafting_table' } as any;
                const allRecipes = bot.recipesAll(itemType.id, null, anywhereTable);
                if (allRecipes.length > 0) {
                    const recipeObj = allRecipes[0];
                    const missingIngredients: string[] = [];
                    if (recipeObj.delta) {
                        for (const item of recipeObj.delta) {
                            if (item.count < 0) {
                                const reqCount = Math.abs(item.count) * count;
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
                            `Cannot craft ${item_name}: Missing ingredients: ${missingIngredients.join(', ')}. ` +
                            `Do NOT retry this call. Current inventory: [${inventorySnapshot()}].`
                        )));
                    }
                }
                return textResult(formatObservation(buildObservation(bot,
                    `Cannot craft ${item_name}: No valid recipe found with or without a crafting table. ` +
                    `Do NOT retry this call. ` +
                    `Current inventory: [${inventorySnapshot()}]. ` +
                    `Check that you have the correct ingredients and item name.`
                )));
            }

            const recipe = recipeList[0];

            // --- 2x2 path (no table needed) ---
            if (!recipe.requiresTable) {
                const itemsBefore = getInventoryCount(bot, item_name);
                const craftPromise = bot.craft(recipe, count, undefined);
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
                    if (getInventoryCount(bot, item_name) <= itemsBefore) {
                        throw err;
                    }
                }
                
                await new Promise(resolve => setTimeout(resolve, 300)); // let inventory settle
                return textResult(formatObservation(buildObservation(bot,
                    `Successfully crafted ${count}x ${item_name} using 2x2 grid. ` +
                    `Inventory: [${inventorySnapshot()}]`
                )));
            }

            // --- 3x3 path (table needed) ---
            let table = bot.findBlock({ matching: tableId, maxDistance: 32 });
            let placedNewTable = false;

            if (!table) {
                if (!craft_table_if_missing) {
                    return textResult(formatObservation(buildObservation(bot,
                        `Failed to craft ${item_name}: Requires a crafting table but none found within 32 blocks. ` +
                        `Call again with craft_table_if_missing=true, or manually place a crafting table first. ` +
                        `Inventory: [${inventorySnapshot()}]`
                    )));
                }

                // Craft a table if not in inventory
                const hasTable = bot.inventory.items().some(i => i.name === 'crafting_table');
                if (!hasTable) {
                    const tableRecipes = bot.recipesFor(tableId, null, 1, null);
                    if (tableRecipes.length === 0) {
                        return textResult(formatObservation(buildObservation(bot,
                            `Failed to craft ${item_name}: No crafting table nearby and cannot craft one. ` +
                            `You need 4x oak_planks (or any planks) to craft a crafting table. ` +
                            `Inventory: [${inventorySnapshot()}]. Gather wood first.`
                        )));
                    }
                    await bot.craft(tableRecipes[0], 1, undefined);
                    await new Promise(resolve => setTimeout(resolve, 150));
                }

                // Find placement spot
                const refBlocks = bot.findBlocks({
                    matching: (b) => {
                        const blockType = bot.registry.blocks[b.type];
                        if (!blockType || blockType.boundingBox !== 'block') return false;
                        const above = bot.blockAt(b.position.offset(0, 1, 0));
                        const above2 = bot.blockAt(b.position.offset(0, 2, 0));
                        return above?.name === 'air' && above2?.name === 'air';
                    },
                    maxDistance: 6,
                    count: 1
                });

                if (refBlocks.length === 0) {
                    return textResult(formatObservation(buildObservation(bot,
                        `Failed to craft ${item_name}: No valid spot to place crafting table within 6 blocks. ` +
                        `The bot may be in a confined area. Inventory: [${inventorySnapshot()}]`
                    )));
                }

                const refBlock = bot.blockAt(refBlocks[0]);
                if (!refBlock) throw new Error('Could not find reference block');

                const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table');
                if (!tableItem) throw new Error('Crafting table not in inventory despite just crafting it');

                await bot.equip(tableItem, 'hand');

                // --- BUG 2 FIX: Use top-level import, GoalNear instead of GoalLookAtBlock ---
                try {
                    await bot.pathfinder.goto(new GoalNear(
                        refBlock.position.x, refBlock.position.y, refBlock.position.z, 3
                    ));
                } catch (e) {
                    throw new Error(`Pathfinding to placement spot failed: ${(e as Error).message}`, { cause: e });
                }

                await bot.placeBlock(refBlock, new Vec3(0, 1, 0));
                await new Promise(resolve => setTimeout(resolve, 150));
                placedNewTable = true;
                table = bot.blockAt(refBlock.position.offset(0, 1, 0));
                if (!table) throw new Error('Table placed but block not found at expected position');
            }

            // Navigate to table
            try {
                await bot.pathfinder.goto(new GoalNear(
                    table.position.x, table.position.y, table.position.z, 3
                ));
            } catch (e) {
                throw new Error(`Pathfinding to crafting table failed: ${(e as Error).message}`, { cause: e });
            }

            // Re-fetch recipe now that we definitely have a table reference
            // This ensures the recipe object is bound to the actual table block
            const finalRecipeList = bot.recipesFor(itemType.id, null, count, table);
            const finalRecipe = finalRecipeList.length > 0 ? finalRecipeList[0] : recipe;

            await bot.lookAt(table.position);
            await bot.activateBlock(table);

            // Wait for window to open (up to 500ms)
            for (let i = 0; i < 25; i++) {
                if (bot.currentWindow) break;
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            await new Promise(resolve => setTimeout(resolve, 50)); // window stabilization delay

            const itemsBefore = getInventoryCount(bot, item_name);
            const craftPromise = bot.craft(finalRecipe, count, table);
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
                if (getInventoryCount(bot, item_name) <= itemsBefore) {
                    throw err;
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 300)); // inventory settle

            if (bot.currentWindow) await bot.closeWindow(bot.currentWindow);

            // Cleanup
            let cleanupStatus = '';
            if (placedNewTable && cleanup_table) {
                try {
                    const bestTool = bot.pathfinder.bestHarvestTool(table);
                    if (bestTool) await bot.equip(bestTool, 'hand');
                    await bot.dig(table);
                    cleanupStatus = ' (placed and cleaned up crafting table)';
                } catch {
                    cleanupStatus = ' (placed crafting table, cleanup failed)';
                }
            } else if (placedNewTable) {
                cleanupStatus = ' (placed new crafting table, left in world)';
            }

            await new Promise(resolve => setTimeout(resolve, 150)); // final inventory settle

            return textResult(formatObservation(buildObservation(bot,
                `Successfully crafted ${count}x ${item_name}.${cleanupStatus} ` +
                `Inventory: [${inventorySnapshot()}]`
            )));

        } catch (error: any) {
            // --- BUG 3 FIX: Descriptive error with inventory state and no-retry instruction ---
            return textResult(formatObservation(buildObservation(bot,
                `Failed to craft ${item_name}: ${error.message}. ` +
                `Do NOT retry this exact call. ` +
                `Current inventory: [${inventorySnapshot()}]. ` +
                `Diagnose what is missing and address it first.`
            )));
        }
    });
}
