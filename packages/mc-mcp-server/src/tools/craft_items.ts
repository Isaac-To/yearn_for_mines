import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { findClosestMatches } from '../utils/string-match.js';
import { Vec3 } from 'vec3';
// import * as pathfinderModule from 'mineflayer-pathfinder'

/** Check if bot is stuck in a hole (surrounded by blocks at ground level) */
function isInHole(bot: any): boolean {
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
async function escapeHole(bot: any, maxAttempts: number = 3): Promise<boolean> {
  console.log(`[craft_items] Bot is in a hole, attempting to escape...`);
  
  if (!bot.entity || !bot.entity.position) return false;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Try to jump and move to a higher Y position
      console.log(`[craft_items] Escape attempt ${attempt + 1}/${maxAttempts}`);
      
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
        console.log(`[craft_items] Successfully escaped hole`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.log(`[craft_items] Escape attempt ${attempt + 1} failed: ${(err as any)?.message}`);
    }
  }
  
  console.log(`[craft_items] Failed to escape hole after ${maxAttempts} attempts`);
  return false;
}

/** Navigate bot to within interaction distance (5 blocks) of a target block */
async function navigateToBlock(bot: any, targetPos: Vec3, maxAttempts: number = 3): Promise<boolean> {
  const INTERACTION_DISTANCE = 5;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const currentDist = bot.entity.position.distanceTo(targetPos);
      console.log(`[craft_items] Navigate attempt ${attempt + 1}: distance to target = ${currentDist.toFixed(1)} blocks`);
      
      // If already close enough, we're done
      if (currentDist <= INTERACTION_DISTANCE) {
        console.log(`[craft_items] Already within interaction distance`);
        return true;
      }
      
      // Try pathfinder first (move within interaction distance)
      try {
        const pf = await import('mineflayer-pathfinder');
        if (pf && pf.goals && pf.goals.GoalNear) {
          // Use GoalNear to get within interaction distance
          await bot.pathfinder.goto(new pf.goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, INTERACTION_DISTANCE));
          console.log(`[craft_items] Pathfinder navigation completed`);
          
          // Verify we're close enough
          const finalDist = bot.entity.position.distanceTo(targetPos);
          if (finalDist <= INTERACTION_DISTANCE) {
            console.log(`[craft_items] Successfully navigated to within ${finalDist.toFixed(1)} blocks`);
            return true;
          }
          console.log(`[craft_items] Pathfinder didn't get close enough (${finalDist.toFixed(1)} blocks)`);
        } else {
          console.log(`[craft_items] GoalNear not found in pathfinder, using fallback`);
          throw new Error('GoalNear not available');
        }
      } catch (pathErr) {
        console.log(`[craft_items] Pathfinder failed: ${(pathErr as any)?.message}, using manual movement`);
        
        // Fallback: Manual movement toward target
        const direction = targetPos.minus(bot.entity.position).normalize();
        
        // Move toward target for a limited time
        const startTime = Date.now();
        const moveTimeMs = 2000; // Try moving for 2 seconds
        
        while (Date.now() - startTime < moveTimeMs) {
          const currentDist = bot.entity.position.distanceTo(targetPos);
          if (currentDist <= INTERACTION_DISTANCE) {
            console.log(`[craft_items] Manual movement succeeded, distance: ${currentDist.toFixed(1)} blocks`);
            return true;
          }
          
          // Set movement controls toward target
          bot.setControlState('forward', true);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        bot.setControlState('forward', false);
        
        const finalDist = bot.entity.position.distanceTo(targetPos);
        if (finalDist <= INTERACTION_DISTANCE) {
          console.log(`[craft_items] Manual movement got us close enough: ${finalDist.toFixed(1)} blocks`);
          return true;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.log(`[craft_items] Navigation attempt ${attempt + 1} error: ${(err as any)?.message}`);
    }
  }
  
  console.log(`[craft_items] Failed to navigate to block after ${maxAttempts} attempts`);
  return false;
}

/** Find valid placement spot with reference block validation (Voyager-style) */
function findValidPlacementSpot(bot: any, centerPos: Vec3, searchOffsets: Vec3[]): { pos: Vec3; refBlock: any } | null {
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

/** Get inventory count of an item by name */
function getInventoryCount(bot: any, itemName: string): number {
  return bot.inventory.items().filter((i: any) => i.name === itemName).reduce((sum: number, i: any) => sum + i.count, 0);
}

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

      // Try to find existing table within 32 blocks (reuse strategy - Voyager pattern)
      let table = bot.findBlock({ matching: tableBlockId, maxDistance: 32 });
      let placedNewTable = false;

      if (table) {
        console.log(`[craft_items] Found existing crafting table at (${table.position.x}, ${table.position.y}, ${table.position.z})`);
        // Quick verify: table exists at expected location
        const tableVerify = bot.blockAt(table.position);
        if (!tableVerify || tableVerify.type === 0) {
          // Table disappeared, will place new one
          console.log(`[craft_items] Existing table disappeared, will place new one`);
          table = null;
        } else {
          // Check distance - skip if too far (faster to place new one)
          const distToTable = bot.entity.position.distanceTo(table.position);
          if (distToTable > 6) {
            console.log(`[craft_items] Table too far (${distToTable.toFixed(1)} blocks), placing new one instead`);
            table = null;
          }
        }
      }

      if (!table) {
        console.log(`[craft_items] No nearby table found, attempting to place one...`);
        const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table');
        if (!tableItem) {
          return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: No crafting table found nearby and none in inventory.`)));
        }

        // Track item count before placement (Voyager pattern)
        const tableCountBefore = getInventoryCount(bot, 'crafting_table');

        if (!bot.entity || !bot.entity.position) {
          return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Bot position is undefined.`)));
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
              console.log(`[craft_items] Bot in hole, attempting escape...`);
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
            console.log(`[craft_items] Placing table at (${placement.pos.x}, ${placement.pos.y}, ${placement.pos.z}) [attempt ${attempt + 1}/3]`);
            await bot.equip(tableItem, 'hand');
            await bot.placeBlock(placement.refBlock, new Vec3(0, 1, 0));
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify placement by checking inventory (Voyager pattern)
            const tableCountAfter = getInventoryCount(bot, 'crafting_table');
            if (tableCountAfter < tableCountBefore) {
              // Item was consumed, placement likely succeeded
              console.log(`[craft_items] Item consumed (${tableCountBefore} → ${tableCountAfter}), verifying block...`);
              table = bot.blockAt(placement.pos);
              if (!table || table.type === 0) {
                // Block not at expected position, search nearby
                const nearbyTable = bot.findBlock({ matching: tableBlockId, maxDistance: 3, point: placement.pos });
                if (nearbyTable) {
                  table = nearbyTable;
                  console.log(`[craft_items] Found placed table at (${table.position.x}, ${table.position.y}, ${table.position.z})`);
                  placed = true;
                } else {
                  placementError = 'Item consumed but block not found';
                  continue;
                }
              } else {
                console.log(`[craft_items] Table verified at expected position`);
                placedNewTable = true;
                placed = true;
              }
            } else {
              // Item still in inventory, placement failed
              placementError = `Item not consumed (${tableCountBefore} still in inventory)`;
              console.log(`[craft_items] Placement failed: ${placementError}`);
              continue;
            }
          } catch (placeErr) {
            placementError = (placeErr as any)?.message || 'Unknown placement error';
            console.log(`[craft_items] Placement attempt ${attempt + 1} failed: ${placementError}`);
          }
        }

        if (!placed) {
          return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Failed to place crafting table. ${placementError}`)));
        }

        // Ensure table is set before proceeding
        if (!table) {
          return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Placement succeeded but table block not found.`)));
        }
      }

      // At this point, table is guaranteed to be set (either found or placed)
      let tableBlock = table as any;
      if (!tableBlock) {
        return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Crafting table block was lost before crafting.`)));
      }
      
      // STEP 3: Get recipes with the crafting table
      console.log(`[craft_items] Getting recipes with crafting table at (${tableBlock.position.x}, ${tableBlock.position.y}, ${tableBlock.position.z})`);
      
      // Get recipes for the requested amount
      let recipes = bot.recipesFor(itemType.id, null, craftAmount, tableBlock);
      
      if (recipes.length === 0) {
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
            
            // Search for placement spot using same helper function
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
      try {
        console.log(`[craft_items] Opening crafting table interface...`);
        
        // Edge case: Verify table still exists before attempting to activate
        const tableCheck = bot.blockAt(table.position);
        if (!tableCheck || tableCheck.type === 0) {
          console.log(`[craft_items] Error: Crafting table has disappeared before activation`);
          return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Crafting table disappeared before interaction.`)));
        }
        
        // Edge case: Clear any existing window first to avoid conflicts
        if (bot.currentWindow) {
          try {
            await bot.closeWindow(bot.currentWindow);
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (e) {
            console.log(`[craft_items] Could not close existing window: ${(e as any)?.message}`);
          }
        }
        
        // Activate the table and wait for window (combined operation)
        await bot.activateBlock(tableBlock);
        
        // Poll for window with shorter timeout (100ms max)
        let windowOpened = false;
        for (let i = 0; i < 10; i++) {
          if (bot.currentWindow) {
            windowOpened = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        if (!windowOpened) {
          console.log(`[craft_items] Warning: Window did not open, continuing anyway`);
        }
      } catch (activateError) {
        console.log(`[craft_items] Warning: Failed to activate crafting table: ${(activateError as any)?.message}`);
        // Edge case: Check if table still exists
        const tableStillExists = bot.blockAt(tableBlock.position);
        if (!tableStillExists || tableStillExists.type === 0) {
          return textResult(formatObservation(buildObservation(bot, `Cannot craft ${recipe}: Crafting table was destroyed.`)));
        }
        console.log(`[craft_items] Continuing craft attempt despite activation error`);
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
          await bot.craft(recipeObj, craftAmount, tableBlock);
          console.log(`[craft_items] Craft API call succeeded`);

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
              // Close and reopen table for next attempt
              try {
                if (bot.currentWindow) {
                  await bot.closeWindow(bot.currentWindow);
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              } catch (e) {
                console.log(`[craft_items] Could not close window: ${(e as any)?.message}`);
              }

              // Reopen the table
              try {
                await bot.activateBlock(table);
                await new Promise(resolve => setTimeout(resolve, 150));
              } catch (e) {
                console.log(`[craft_items] Could not reopen table: ${(e as any)?.message}`);
              }
            }
          }
        } catch (craftError) {
          console.log(`[craft_items] Crafting attempt ${craftAttempts} failed: ${(craftError as any)?.message}`);

          if (craftAttempts < maxCraftAttempts) {
            console.log(`[craft_items] Retrying crafting...`);
            // Close and reopen for retry
            try {
              if (bot.currentWindow) {
                await bot.closeWindow(bot.currentWindow);
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            } catch (e) {
              console.log(`[craft_items] Could not close window: ${(e as any)?.message}`);
            }

            try {
              await bot.activateBlock(tableBlock);
              await new Promise(resolve => setTimeout(resolve, 150));
            } catch (e) {
              console.log(`[craft_items] Could not reopen table: ${(e as any)?.message}`);
            }
          }
        }
      }

      if (!craftSucceeded) {
        console.log(`[craft_items] Crafting failed after ${maxCraftAttempts} attempts`);
        // Try to close window before returning error
        if (bot.currentWindow) {
          try {
            await bot.closeWindow(bot.currentWindow);
          } catch (e) {
            console.log(`[craft_items] Could not close window on error: ${(e as any)?.message}`);
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
          // Check if table still exists and is close enough to cleanup
          const tableForCleanup = bot.blockAt(table.position);
          if (tableForCleanup && tableForCleanup.type !== 0) {
            const distToTable = bot.entity.position.distanceTo(table.position);
            // Only cleanup if close (< 6 blocks), otherwise skip for speed
            if (distToTable <= 6) {
              // Dig the table (skip tool selection for speed, just use hand)
              try {
                await bot.dig(table);
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

      const obs = buildObservation(bot, `Successfully crafted ${craftAmount}x ${recipe}${cleanupMsg}.`);
      return textResult(formatObservation(obs));
    } catch (error: any) {
      console.log(`[craft_items] Unexpected error: ${error.message}`);
      const obs = buildObservation(bot, `Failed to craft ${recipe}: ${error.message}`);
      return textResult(formatObservation(obs));
    }
  });
}
