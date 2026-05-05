import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { findClosestMatches } from '../utils/string-match.js';
import { Vec3 } from 'vec3';
// import * as pathfinderModule from 'mineflayer-pathfinder'

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

    try {
      console.log(`[craft_items] Starting craft for ${recipe}x${craftAmount}`);

      // STEP 1: Try crafting without table first (for 2x2 recipes)
      console.log(`[craft_items] Checking for recipes without crafting table...`);
      let recipesWithout = bot.recipesFor(itemType.id, null, craftAmount, null);
      if (recipesWithout.length === 0) {
        recipesWithout = bot.recipesFor(itemType.id, null, 1, null);
      }

      if (recipesWithout.length > 0) {
        console.log(`[craft_items] Found recipe that works without table`);
        try {
          await bot.craft(recipesWithout[0], craftAmount, undefined);
          console.log(`[craft_items] Successfully crafted using 2x2 grid`);
          const obs = buildObservation(bot, `Successfully crafted ${craftAmount}x ${recipe} using player inventory.`);
          return textResult(formatObservation(obs));
        } catch (error) {
          console.log(`[craft_items] Failed to craft without table: ${(error as any)?.message}`);
          // Fall through to try with table
        }
      }

      // STEP 2: Need crafting table - find or place one
      console.log(`[craft_items] Recipe requires a crafting table, searching...`);
      const tableBlockId = bot.registry.blocksByName.crafting_table?.id;
      if (!tableBlockId) {
        return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Crafting table block not found in registry.`)));
      }

      // Try to find existing table within 32 blocks
      let table = bot.findBlock({ matching: tableBlockId, maxDistance: 32 });
      let placedNewTable = false;

      if (table) {
        console.log(`[craft_items] Found existing crafting table at (${table.position.x}, ${table.position.y}, ${table.position.z})`);
      } else {
        console.log(`[craft_items] No nearby table found, placing one...`);
        const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table');
        if (!tableItem) {
          return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: No crafting table found nearby and none in inventory.`)));
        }

        // Place table near bot (search for valid placement spot)
        if (!bot.entity || !bot.entity.position) {
          return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Bot position is undefined.`)));
        }

        const botPos = bot.entity.position;
        
        // Search for valid placement spots around the bot
        // Try: front, back, left, right (relative to bot's yaw)
        const searchOffsets = [
          new Vec3(1, 0, 0),   // Front (+X)
          new Vec3(-1, 0, 0),  // Back (-X)
          new Vec3(0, 0, 1),   // Right (+Z)
          new Vec3(0, 0, -1),  // Left (-Z)
          new Vec3(2, 0, 0),   // Further front
          new Vec3(-2, 0, 0),  // Further back
          new Vec3(0, 0, 2),   // Further right
          new Vec3(0, 0, -2),  // Further left
        ];

        let validPlacementPos: Vec3 | null = null;
        let validRefBlock: any = null;

        for (const offset of searchOffsets) {
          const candidatePos = new Vec3(botPos.x + offset.x, botPos.y, botPos.z + offset.z);
          const refBlockPos = new Vec3(candidatePos.x, candidatePos.y - 1, candidatePos.z);
          const refBlock = bot.blockAt(refBlockPos);
          const tableSpot = bot.blockAt(candidatePos);
          const aboveSpot = bot.blockAt(new Vec3(candidatePos.x, candidatePos.y + 1, candidatePos.z));

          // Check if this is a valid placement: solid ground, air at placement, air above
          if (refBlock && refBlock.type !== 0 && tableSpot && tableSpot.type === 0 && aboveSpot && aboveSpot.type === 0) {
            validPlacementPos = candidatePos;
            validRefBlock = refBlock;
            console.log(`[craft_items] Found valid placement spot at (${validPlacementPos.x}, ${validPlacementPos.y}, ${validPlacementPos.z})`);
            break;
          }
        }

        if (!validPlacementPos || !validRefBlock) {
          return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: No valid nearby spot to place the crafting table.`)));
        }

        console.log(`[craft_items] Attempting to place table at (${validPlacementPos.x}, ${validPlacementPos.y}, ${validPlacementPos.z})`);

        // Equip and place the table
        try {
          await bot.equip(tableItem, 'hand');
          console.log(`[craft_items] Equipped crafting table`);
          
          // Place the block on the reference block (place upward)
          await bot.placeBlock(validRefBlock, new Vec3(0, 1, 0));
          console.log(`[craft_items] Placed crafting table`);
          placedNewTable = true;

          // Wait briefly for block to register
          await new Promise(resolve => setTimeout(resolve, 100));

          // Get the placed table
          table = bot.blockAt(validPlacementPos);
          if (!table || table.type === 0) {
            console.log(`[craft_items] Warning: Could not locate placed table`);
            return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Failed to verify placed crafting table.`)));
          }
          console.log(`[craft_items] Table placed successfully at (${table.position.x}, ${table.position.y}, ${table.position.z})`);
        } catch (placeError) {
          console.log(`[craft_items] Failed to place table: ${(placeError as any)?.message}`);
          return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Failed to place crafting table. ${(placeError as any)?.message}`)));
        }
      }

      // STEP 3: Get recipes with the crafting table
      console.log(`[craft_items] Getting recipes with crafting table at (${table.position.x}, ${table.position.y}, ${table.position.z})`);
      
      // Log current inventory before recipe lookup
      console.log(`[craft_items] Current inventory:`);
      for (const slot of bot.inventory.slots) {
        if (slot) {
          console.log(`[craft_items]   ${bot.registry.items[slot.type]?.name ?? `item_${slot.type}`}: ${slot.count}`);
        }
      }
      
      let recipes = bot.recipesFor(itemType.id, null, craftAmount, table);
      console.log(`[craft_items] Recipes found for amount ${craftAmount}: ${recipes.length}`);
      
      if (recipes.length === 0) {
        recipes = bot.recipesFor(itemType.id, null, 1, table);
        console.log(`[craft_items] Recipes found for amount 1: ${recipes.length}`);
      }

      if (recipes.length === 0) {
        // Try to get all recipes for this item to see what's available
        console.log(`[craft_items] No recipes found with crafting table, checking all available recipes...`);
        const allRecipes = bot.recipesAll(itemType.id, null, table);
        console.log(`[craft_items] Total recipes available with table: ${allRecipes.length}`);
        
        // Also try without specifying a source block
        const allRecipesNoSource = bot.recipesAll(itemType.id, null, null);
        console.log(`[craft_items] Total recipes available (any source): ${allRecipesNoSource.length}`);
        
        // Try with the crafting table explicitly as source
        const allRecipesWithTable = bot.recipesAll(itemType.id, table, null);
        console.log(`[craft_items] Total recipes with table as source: ${allRecipesWithTable.length}`);
        
        return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: No valid recipe found with crafting table. Try checking inventory for required ingredients.`)));
      }

      const recipeObj = recipes[0];
      console.log(`[craft_items] Selected recipe for crafting`);

      // STEP 4: Navigate to the table (face it)
      try {
        console.log(`[craft_items] Navigating to crafting table...`);
        try {
          const pf = await import('mineflayer-pathfinder');
          if (pf && pf.goals && pf.goals.GoalLookAtBlock) {
            await bot.pathfinder.goto(new pf.goals.GoalLookAtBlock(table.position, bot.world));
          } else {
            console.log(`[craft_items] GoalLookAtBlock not found in pathfinder, using fallback lookAt`);
            await bot.lookAt(table.position);
          }
        } catch (importErr) {
          console.log(`[craft_items] Pathfinder import failed: ${(importErr as any)?.message}, using fallback lookAt`);
          await bot.lookAt(table.position);
        }
        console.log(`[craft_items] Successfully positioned at crafting table`);
      } catch (navError) {
        const errMsg = (navError as any)?.message || String(navError);
        console.log(`[craft_items] Navigation failed: ${errMsg}`);
        if (!placedNewTable) {
          return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Failed to navigate to crafting table. ${errMsg}`)));
        }
        console.log(`[craft_items] Continuing anyway since we placed the table`);
      }

      // STEP 5: Open the crafting table interface
      try {
        console.log(`[craft_items] Opening crafting table interface...`);
        await bot.activateBlock(table);
        // Wait briefly for the window to open
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log(`[craft_items] Crafting table interface opened`);
      } catch (activateError) {
        console.log(`[craft_items] Warning: Failed to activate crafting table: ${(activateError as any)?.message}`);
        // Continue anyway - some recipes might work without explicit activation
      }

      // STEP 6: Craft the item (bot.craft() handles window management)
      let craftAttempts = 0;
      const maxCraftAttempts = 3;
      let craftSucceeded = false;

      while (craftAttempts < maxCraftAttempts && !craftSucceeded) {
        craftAttempts++;
        console.log(`[craft_items] Craft attempt ${craftAttempts}/${maxCraftAttempts}`);

        try {
          // Count items before crafting
          const itemsBefore = bot.inventory.items().filter(i => i.name === recipe).reduce((sum, i) => sum + i.count, 0);
          console.log(`[craft_items] Items before craft: ${itemsBefore}x ${recipe}`);

          console.log(`[craft_items] Crafting ${craftAmount}x ${recipe} with table...`);
          await bot.craft(recipeObj, craftAmount, table);
          console.log(`[craft_items] Craft API call succeeded`);

          // Wait for inventory to update
          await new Promise(resolve => setTimeout(resolve, 200));

          // Verify the item is in inventory
          const itemsAfter = bot.inventory.items().filter(i => i.name === recipe).reduce((sum, i) => sum + i.count, 0);
          console.log(`[craft_items] Items after craft: ${itemsAfter}x ${recipe}`);

          if (itemsAfter > itemsBefore) {
            console.log(`[craft_items] Crafting verified successfully - gained ${itemsAfter - itemsBefore} items`);
            craftSucceeded = true;
          } else {
            console.log(`[craft_items] Verification failed: item count did not increase (before: ${itemsBefore}, after: ${itemsAfter})`);
            
            if (craftAttempts < maxCraftAttempts) {
              console.log(`[craft_items] Retrying crafting...`);
              // Try closing and reopening the crafting table
              try {
                if (bot.currentWindow) {
                  await bot.closeWindow(bot.currentWindow);
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              } catch (e) {
                console.log(`[craft_items] Failed to close window before retry: ${(e as any)?.message}`);
              }

              // Reopen the crafting table
              try {
                await bot.activateBlock(table);
                await new Promise(resolve => setTimeout(resolve, 200));
              } catch (e) {
                console.log(`[craft_items] Failed to reopen crafting table: ${(e as any)?.message}`);
              }
            }
          }
        } catch (craftError) {
          console.log(`[craft_items] Crafting attempt ${craftAttempts} failed: ${(craftError as any)?.message}`);

          if (craftAttempts < maxCraftAttempts) {
            console.log(`[craft_items] Retrying crafting...`);
            // Try closing and reopening the crafting table
            try {
              if (bot.currentWindow) {
                await bot.closeWindow(bot.currentWindow);
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            } catch (e) {
              console.log(`[craft_items] Failed to close window before retry: ${(e as any)?.message}`);
            }

            // Reopen the crafting table
            try {
              await bot.activateBlock(table);
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (e) {
              console.log(`[craft_items] Failed to reopen crafting table: ${(e as any)?.message}`);
            }
          } else {
            // Out of attempts
            console.log(`[craft_items] Crafting failed after ${maxCraftAttempts} attempts`);
            // Try to close the window before returning error
            if (bot.currentWindow) {
              try {
                await bot.closeWindow(bot.currentWindow);
              } catch (e) {
                console.log(`[craft_items] Failed to close window on error: ${(e as any)?.message}`);
              }
            }
            return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Failed to craft after ${maxCraftAttempts} attempts. ${(craftError as any)?.message}`)));
          }
        }
      }

      if (!craftSucceeded) {
        console.log(`[craft_items] Crafting verification failed after ${maxCraftAttempts} attempts`);
        // Try to close the window before returning error
        if (bot.currentWindow) {
          try {
            await bot.closeWindow(bot.currentWindow);
          } catch (e) {
            console.log(`[craft_items] Failed to close window on error: ${(e as any)?.message}`);
          }
        }
        return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Item verification failed after ${maxCraftAttempts} attempts. Check that you have required ingredients.`)));
      }

      // STEP 7: Close the crafting window if it's still open
      try {
        if (bot.currentWindow) {
          console.log(`[craft_items] Closing crafting window...`);
          await bot.closeWindow(bot.currentWindow);
          // Wait a moment for window to fully close
          await new Promise(resolve => setTimeout(resolve, 100));
          console.log(`[craft_items] Crafting window closed`);
        }
      } catch (closeError) {
        console.log(`[craft_items] Warning: Failed to close window: ${(closeError as any)?.message}`);
      }

      // STEP 8: Clean up placed table if needed
      let cleanupMsg = '';
      if (placedNewTable) {
        try {
          console.log(`[craft_items] Cleaning up placed table...`);
          // Wait a bit before trying to dig to ensure server state is updated
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const bestTool = bot.pathfinder.bestHarvestTool(table);
          if (bestTool) {
            await bot.equip(bestTool, 'hand');
          }
          await bot.dig(table);
          console.log(`[craft_items] Table cleaned up successfully`);
          cleanupMsg = ' (and cleaned up temporary table)';
        } catch (cleanupError) {
          console.log(`[craft_items] Cleanup failed: ${(cleanupError as any)?.message}`);
          cleanupMsg = ' (placed table, but cleanup failed)';
        }
      }

      const obs = buildObservation(bot, `Successfully crafted ${craftAmount}x ${recipe}${cleanupMsg}.`);
      return textResult(formatObservation(obs));
    } catch (error: any) {
      console.log(`[craft_items] Unexpected error: ${error.message}`);
      const obs = buildObservation(bot, `Failed to craft ${recipe}: ${error.message}`);
      return textResult(formatObservation(obs));
    }
  });
}
