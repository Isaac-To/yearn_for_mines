# Voyager Minecraft Agent: Crafting Table Implementation Research

## Overview

The Voyager agent (MineDojo/Voyager GitHub repo) uses a well-structured approach to crafting with crafting tables. The implementation separates concerns into:

1. **Skill Layer** - High-level crafting logic (skill library)
2. **Control Primitives** - Reusable helper functions for low-level operations
3. **Mineflayer API** - Direct calls to the Mineflayer bot library

---

## 1. Finding & Placing the Crafting Table

### 1.1 Search for Existing Crafting Table

```javascript
const craftingTable = bot.findBlock({
    matching: mcData.blocksByName.crafting_table.id,
    maxDistance: 32  // Search within 32 block radius
});

if (!craftingTable) {
    // Place a new one if not found
}
```

**Key API Calls:**
- `bot.findBlock({ matching: id, maxDistance: distance })` - Searches for a block type within radius
- Returns block object with `.position` property containing Vec3

### 1.2 Placing a Crafting Table

**From `voyager/control_primitives/placeItem.js`:**

```javascript
async function placeItem(bot, name, position) {
    // Validation
    if (typeof name !== "string") {
        throw new Error(`name for placeItem must be a string`);
    }
    if (!(position instanceof Vec3)) {
        throw new Error(`position for placeItem must be a Vec3`);
    }

    const itemByName = mcData.itemsByName[name];
    const item = bot.inventory.findInventoryItem(itemByName.id);
    if (!item) {
        bot.chat(`No ${name} in inventory`);
        return;
    }

    // Find a reference block (adjacent block to place against)
    const faceVectors = [
        new Vec3(0, -1, 0),  // Below
        new Vec3(0, 1, 0),   // Above
        new Vec3(1, 0, 0),   // Side +X
        new Vec3(-1, 0, 0),  // Side -X
        new Vec3(0, 0, 1),   // Side +Z
        new Vec3(0, 0, -1)   // Side -Z
    ];

    let referenceBlock = null;
    for (const faceVector of faceVectors) {
        const adjacentBlockPos = position.minus(faceVector);
        referenceBlock = bot.blockAt(adjacentBlockPos);
        if (referenceBlock.type !== 0) {
            break;
        }
    }

    try {
        // Navigation: Move to the placement position
        await bot.pathfinder.goto(new GoalPlaceBlock(position, bot.world, {}));

        // Equip the item
        await bot.equip(item, "hand");

        // Place the block against the reference block
        await bot.placeBlock(referenceBlock, faceVector);

        bot.chat(`Placed ${name}`);
        bot.save(`${name}_placed`);
    } catch (err) {
        bot.chat(`Error placing ${name}: ${err.message}`);
        // Retry logic with fallback positions
    }
}
```

**Typical Placement Pattern from Skills:**

```javascript
// Place crafting table 1 block away from bot
const craftingTablePosition = bot.entity.position.offset(1, 0, 0);
await placeItem(bot, "crafting_table", craftingTablePosition);
```

**Key API Calls:**
- `bot.inventory.findInventoryItem(itemId)` - Find item in inventory
- `bot.pathfinder.goto(new GoalPlaceBlock(pos, world, {}))` - Navigate to placement position
- `bot.equip(item, "hand")` - Equip item
- `bot.placeBlock(referenceBlock, faceVector)` - Place block against reference block
- `bot.blockAt(position)` - Get block at position
- `bot.entity.position.offset(x, y, z)` - Offset from current position

---

## 2. Opening the Crafting Table (Implicitly via bot.craft)

Voyager does **NOT** explicitly open the crafting table window. Instead:

1. It navigates to the crafting table
2. Calls the recipe and crafting APIs directly
3. The bot automatically opens/closes the window as needed

**No explicit window opening is required** - mineflayer handles this internally.

---

## 3. Crafting Items - Complete Sequence

### 3.1 Full `craftItem` Control Primitive

**From `voyager/control_primitives/craftItem.js`:**

```javascript
async function craftItem(bot, name, count = 1) {
    // Input validation
    if (typeof name !== "string") {
        throw new Error("name for craftItem must be a string");
    }
    if (typeof count !== "number") {
        throw new Error("count for craftItem must be a number");
    }

    const itemByName = mcData.itemsByName[name];
    if (!itemByName) {
        throw new Error(`No item named ${name}`);
    }

    // STEP 1: Find crafting table within 32 blocks
    const craftingTable = bot.findBlock({
        matching: mcData.blocksByName.crafting_table.id,
        maxDistance: 32,
    });

    // STEP 2: Navigate to the crafting table
    if (!craftingTable) {
        bot.chat("Craft without a crafting table");
    } else {
        await bot.pathfinder.goto(
            new GoalLookAtBlock(craftingTable.position, bot.world)
        );
    }

    // STEP 3: Get the recipe for the item
    const recipe = bot.recipesFor(
        itemByName.id,      // Item ID to craft
        null,               // Source block (null = any)
        1,                  // Result count
        craftingTable       // Crafting surface (crafting table or null for 2x2)
    )[0];

    // STEP 4: Execute the craft
    if (recipe) {
        bot.chat(`I can make ${name}`);
        try {
            await bot.craft(recipe, count, craftingTable);
            bot.chat(`I did the recipe for ${name} ${count} times`);
        } catch (err) {
            bot.chat(`I cannot do the recipe for ${name} ${count} times`);
            // Error handling with feedback function
            failedCraftFeedback(bot, name, itemByName, craftingTable);
        }
    } else {
        // No recipe found
        failedCraftFeedback(bot, name, itemByName, craftingTable);
    }
}
```

### 3.2 Key Mineflayer API Calls

| Call | Purpose |
|------|---------|
| `bot.findBlock({matching: id, maxDistance: 32})` | Find crafting table |
| `bot.pathfinder.goto(new GoalLookAtBlock(pos, world))` | Navigate to face the table |
| `bot.recipesFor(itemId, null, count, craftingTable)` | Get available recipes |
| `bot.craft(recipe, count, craftingTable)` | Execute crafting |
| `bot.recipesAll(itemId, null, craftingTable)` | Get all recipes (for error feedback) |

### 3.3 Complete Crafting Workflow Example

**From `skill_library/trial1/skill/code/craftFurnace.js`:**

```javascript
async function craftFurnace(bot) {
    // PHASE 1: Gather materials
    const cobblestoneCount = bot.inventory.count(
        mcData.itemsByName.cobblestone.id
    );
    
    if (cobblestoneCount < 8) {
        // Mine stone → becomes cobblestone when mined
        await mineBlock(bot, "stone", 8 - cobblestoneCount);
        bot.chat("Collected cobblestone.");
    }

    // PHASE 2: Get/place crafting table
    const craftingTable = bot.findBlock({
        matching: mcData.blocksByName.crafting_table.id,
        maxDistance: 32
    });
    
    if (!craftingTable) {
        // Place one nearby
        const craftingTablePosition = bot.entity.position.offset(1, 0, 0);
        await placeItem(bot, "crafting_table", craftingTablePosition);
        bot.chat("Crafting_table placed.");
    }

    // PHASE 3: Craft the item
    await craftItem(bot, "furnace", 1);
    bot.chat("Crafted a furnace.");
}
```

---

## 4. Error Handling & Feedback

### 4.1 Failed Craft Feedback Function

**From `voyager/control_primitives/craftHelper.js`:**

```javascript
function failedCraftFeedback(bot, name, item, craftingTable) {
    const recipes = bot.recipesAll(item.id, null, craftingTable);
    
    if (!recipes.length) {
        throw new Error(`No crafting table nearby`);
    } else {
        // Find recipe with fewest missing ingredients
        var min = 999;
        var min_recipe = null;
        
        for (const recipe of recipes) {
            const delta = recipe.delta;  // Item delta needed
            var missing = 0;
            
            for (const delta_item of delta) {
                if (delta_item.count < 0) {  // Items we need
                    const inventory_item = bot.inventory.findInventoryItem(
                        mcData.items[delta_item.id].name,
                        null
                    );
                    
                    if (!inventory_item) {
                        missing += -delta_item.count;
                    } else {
                        missing += Math.max(
                            -delta_item.count - inventory_item.count,
                            0
                        );
                    }
                }
            }
            
            if (missing < min) {
                min = missing;
                min_recipe = recipe;
            }
        }
        
        // Provide feedback to LLM about what's missing
        bot.chat(`Missing items for ${name}: ${min} items needed`);
    }
}
```

**Retry Logic:**
- Up to 10 craft failures before giving up
- Provides specific feedback about missing materials
- LLM uses this feedback to decide next steps (mine more, craft prerequisites, etc.)

---

## 5. Inventory Management Patterns

### 5.1 Pre-Craft Inventory Checks

All skills follow this pattern before crafting:

```javascript
// Check if we have enough of each material
const requiredIronIngots = 8;
const ironIngotsCount = bot.inventory.count(mcData.itemsByName.iron_ingot.id);

if (ironIngotsCount < requiredIronIngots) {
    // Mine/smelt/craft what we need
    await mineBlock(bot, "iron_ore", requiredIronIngots - ironIngotsCount);
    await smeltItem(bot, "iron_ore", "coal", requiredIronIngots - ironIngotsCount);
}
```

### 5.2 Inventory API Usage

| Call | Purpose |
|------|---------|
| `bot.inventory.count(itemId)` | Count items by ID |
| `bot.inventory.findInventoryItem(itemId)` | Find specific item |
| `bot.inventory.items()` | Get all inventory items |
| `bot.inventoryUsed()` | Get used inventory slots |

---

## 6. Complete Crafting Sequence (Step-by-Step)

### The Exact Steps Voyager Takes:

1. **Check inventory** - Count required materials
   ```javascript
   bot.inventory.count(itemId)
   ```

2. **Gather materials if needed** - Mine, smelt, or craft prerequisites
   ```javascript
   await mineBlock(bot, "material", count);
   await smeltItem(bot, "ore", "fuel", count);
   await craftItem(bot, "prerequisite", count);
   ```

3. **Find crafting table** - Search nearby
   ```javascript
   bot.findBlock({matching: mcData.blocksByName.crafting_table.id, maxDistance: 32})
   ```

4. **Place crafting table if needed**
   ```javascript
   const pos = bot.entity.position.offset(1, 0, 0);
   await placeItem(bot, "crafting_table", pos);
   ```

5. **Navigate to crafting table** - Face it
   ```javascript
   await bot.pathfinder.goto(new GoalLookAtBlock(tablePos, world))
   ```

6. **Find recipe** - Get the crafting recipe
   ```javascript
   const recipe = bot.recipesFor(itemId, null, 1, craftingTable)[0];
   ```

7. **Execute craft** - Run the recipe
   ```javascript
   await bot.craft(recipe, count, craftingTable);
   ```

8. **Handle errors** - Provide feedback or retry
   ```javascript
   if (craftFailed) {
       failedCraftFeedback(bot, name, item, craftingTable);
   }
   ```

---

## 7. Specific Mineflayer API Patterns

### Navigation to Crafting Table

```javascript
// Goal types used:
const GoalLookAtBlock = require("mineflayer-pathfinder").goals.GoalLookAtBlock;
const GoalPlaceBlock = require("mineflayer-pathfinder").goals.GoalPlaceBlock;

// Navigate to look at the crafting table
await bot.pathfinder.goto(new GoalLookAtBlock(craftingTable.position, bot.world));

// Navigate to place a block nearby
await bot.pathfinder.goto(new GoalPlaceBlock(position, bot.world, {}));
```

### Recipe Resolution

```javascript
// Get recipes that produce an item
const recipes = bot.recipesFor(
    itemId,           // What to craft
    null,             // Source filter (null = any)
    1,                // Count
    craftingTable     // Crafting surface (null for 2x2 inventory)
);

// Get all possible recipes (including impossible ones)
const allRecipes = bot.recipesAll(itemId, null, craftingTable);

// Recipe structure: {delta: [{id, count}, ...], result: {id, count}}
// delta[].count < 0 = needs item, delta[].count > 0 = produces item
```

### Crafting Execution

```javascript
// Execute a recipe
await bot.craft(recipe, count, craftingTable);

// This:
// 1. Opens the crafting window (if at crafting table)
// 2. Places ingredients in the grid
// 3. Collects the result
// 4. Closes the window (automatic)
```

---

## 8. Important Implementation Details

### 8.1 No Explicit Window Opening
- **Mineflayer handles window mechanics automatically**
- No explicit `bot.openWindow()` or similar needed
- Window opens when you call `bot.craft()` near a crafting table
- Window closes automatically after crafting

### 8.2 Pathfinder Usage
- Always use `bot.pathfinder.goto()` with appropriate goal
- `GoalLookAtBlock` - Face the block (needed for crafting)
- `GoalPlaceBlock` - Position for placing blocks

### 8.3 Error Recovery
- Voyager tracks failed attempts (`_craftItemFailCount`)
- After 10 failures, throws error
- LLM uses chat messages to understand failures
- Can request alternative approaches or gather missing items

### 8.4 Recipe Selection
- Takes first valid recipe: `bot.recipesFor(...)[0]`
- If no recipe found or crafting fails, uses `failedCraftFeedback()`
- Feedback tells which items are missing

---

## 9. Key Implementation Files in Voyager

| File | Purpose |
|------|---------|
| `voyager/control_primitives/craftItem.js` | Core crafting function |
| `voyager/control_primitives/placeItem.js` | Block placement logic |
| `voyager/control_primitives/craftHelper.js` | Error feedback and recipe analysis |
| `voyager/control_primitives_context/craftItem.js` | Simplified version for prompt context |
| `skill_library/trial*/skill/code/*.js` | Learned crafting skills |

---

## 10. Quick Reference: Mineflayer API Calls Used

```javascript
// Block finding
bot.findBlock({matching: id, maxDistance: distance})
bot.blockAt(position)

// Navigation
await bot.pathfinder.goto(new GoalLookAtBlock(pos, world))
await bot.pathfinder.goto(new GoalPlaceBlock(pos, world, {}))

// Inventory
bot.inventory.count(itemId)
bot.inventory.findInventoryItem(itemId)
bot.inventory.items()
bot.inventoryUsed()

// Equipment
await bot.equip(item, "hand")

// Interaction
await bot.placeBlock(referenceBlock, faceVector)

// Crafting
bot.recipesFor(itemId, null, count, craftingTable)
bot.recipesAll(itemId, null, craftingTable)
await bot.craft(recipe, count, craftingTable)

// Chat/Logging
bot.chat(message)
bot.save(eventName)
```

---

## Summary

Voyager's crafting approach is **straightforward and modular**:

1. **Prepare materials** - Check inventory, gather/craft what's needed
2. **Locate/place table** - Find existing or place new crafting table
3. **Navigate & position** - Move to face the crafting table
4. **Execute craft** - Get recipe and call `bot.craft()`
5. **Handle feedback** - React to success/failure with chat messages

The LLM agent receives feedback through chat messages and learns from successes/failures, improving its crafting strategies over time. The control primitives abstract away the low-level mineflayer API complexity.
