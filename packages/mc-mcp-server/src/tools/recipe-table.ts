import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { findClosestMatches } from '../utils/string-match.js';

export interface RecipeIngredientRequirement {
  itemName: string;
  required: number;
  available: number;
  missing: number;
  acquisition: string;
}

export interface RecipePlan {
  itemName: string;
  amount: number;
  targetAcquisition: string;
  outputPerCraft: number;
  craftsNeeded: number;
  requiresCraftingTable: boolean;
  ingredients: RecipeIngredientRequirement[];
  missingIngredients: RecipeIngredientRequirement[];
}

const ITEM_ACQUISITION_METHODS: Record<string, string> = {
  oak_log: 'Chop oak trees with gather_materials(type="oak_log").',
  birch_log: 'Chop birch trees with gather_materials(type="birch_log").',
  spruce_log: 'Chop spruce trees with gather_materials(type="spruce_log").',
  jungle_log: 'Chop jungle trees with gather_materials(type="jungle_log").',
  acacia_log: 'Chop acacia trees with gather_materials(type="acacia_log").',
  dark_oak_log: 'Chop dark oak trees with gather_materials(type="dark_oak_log").',
  mangrove_log: 'Chop mangrove trees with gather_materials(type="mangrove_log").',
  cherry_log: 'Chop cherry trees with gather_materials(type="cherry_log").',
  crafting_table: 'Craft from 4 planks in the 2x2 player grid.',
  stick: 'Craft from 2 planks (vertical) in the 2x2 grid or crafting table.',
  wooden_pickaxe: 'Craft from 3 planks + 2 sticks at a crafting table.',
  stone_pickaxe: 'Craft from 3 cobblestone + 2 sticks at a crafting table.',
  iron_pickaxe: 'Craft from 3 iron_ingot + 2 sticks at a crafting table.',
  cobblestone: 'Mine stone blocks with a pickaxe using gather_materials(type="stone").',
  coal: 'Mine coal_ore/deepslate_coal_ore with a pickaxe or collect drops.',
  iron_ore: 'Mine iron_ore/deepslate_iron_ore with a stone+ pickaxe.',
  raw_iron: 'Smelt not required for acquisition; mine iron ore to get raw_iron.',
  iron_ingot: 'Smelt raw_iron in a furnace with fuel.',
  furnace: 'Craft from 8 cobblestone at a crafting table.',
  torch: 'Craft from coal/charcoal + stick.',
  coal_block: 'Craft from 9 coal at a crafting table.',
  planks: 'Craft from logs in the 2x2 player grid.',
};

function inferAcquisitionMethod(itemName: string): string {
  if (ITEM_ACQUISITION_METHODS[itemName]) {
    return ITEM_ACQUISITION_METHODS[itemName];
  }

  if (itemName.endsWith('_log')) {
    return `Chop ${itemName} from trees with gather_materials(type="${itemName}").`;
  }
  if (itemName.endsWith('_planks') || itemName === 'planks') {
    return 'Craft from logs in the 2x2 player grid.';
  }
  if (itemName.endsWith('_ore')) {
    return `Mine ${itemName} with a suitable pickaxe.`;
  }
  if (itemName.startsWith('deepslate_') && itemName.endsWith('_ore')) {
    return `Mine ${itemName} with a suitable pickaxe in deep underground layers.`;
  }
  if (itemName.endsWith('_ingot')) {
    return `Usually obtained by smelting the corresponding raw material for ${itemName}.`;
  }
  if (itemName.endsWith('_pickaxe')) {
    return `Craft ${itemName} at a crafting table with tier-appropriate materials and sticks.`;
  }

  return `Obtain ${itemName} by gathering, mining, looting, trading, or crafting depending on availability.`;
}

function getInventoryCount(bot: any, itemName: string): number {
  const fromItems = (bot.inventory.items?.() ?? [])
    .filter((i: any) => i.name === itemName)
    .reduce((sum: number, i: any) => sum + i.count, 0);

  const itemType = bot.registry.itemsByName[itemName];
  if (!itemType || !Array.isArray(bot.inventory.slots)) {
    return fromItems;
  }

  const fromSlots = bot.inventory.slots
    .filter((slot: any) => slot && slot.type === itemType.id)
    .reduce((sum: number, slot: any) => sum + slot.count, 0);

  return Math.max(fromItems, fromSlots);
}

function getRecipeOutputCount(recipe: any, targetItemId: number): number {
  if (recipe?.result?.id === targetItemId && typeof recipe?.result?.count === 'number' && recipe.result.count > 0) {
    return recipe.result.count;
  }

  if (Array.isArray(recipe?.delta)) {
    const out = recipe.delta.find((d: any) => d.id === targetItemId && d.count > 0);
    if (out && typeof out.count === 'number' && out.count > 0) {
      return out.count;
    }
  }

  return 1;
}

function recipeKey(recipe: any): string {
  const deltas = Array.isArray(recipe?.delta)
    ? recipe.delta
      .map((d: any) => `${d.id}:${d.count}`)
      .sort()
      .join('|')
    : '';
  const requiresTable = recipe?.requiresTable ? 'table' : 'hand';
  const resultId = recipe?.result?.id ?? 'na';
  const resultCount = recipe?.result?.count ?? 'na';
  return `${requiresTable}:${resultId}:${resultCount}:${deltas}`;
}

export function resolveRecipePlan(bot: any, itemName: string, amount: number):
  | { plan: RecipePlan }
  | { error: string } {
  const itemType = bot.registry.itemsByName[itemName];
  if (!itemType) {
    const validNames = Object.keys(bot.registry.itemsByName);
    const suggestions = findClosestMatches(itemName, validNames, 3);
    const suggestionsStr = suggestions.length > 0 ? ` Did you mean: '${suggestions.join("', '")}'?` : '';
    return { error: `Unknown item '${itemName}'.${suggestionsStr}` };
  }

  const tableBlockId = bot.registry.blocksByName.crafting_table?.id;
  const fakeTable = tableBlockId ? { type: tableBlockId, name: 'crafting_table' } : null;

  const recipesAll = typeof bot.recipesAll === 'function'
    ? bot.recipesAll.bind(bot)
    : undefined;

  let allRecipesNoTable: any[] = [];
  let allRecipesWithTable: any[] = [];

  if (recipesAll) {
    allRecipesNoTable = recipesAll(itemType.id, null, null) ?? [];
    allRecipesWithTable = fakeTable ? (recipesAll(itemType.id, null, fakeTable) ?? []) : [];
  } else if (typeof bot.recipesFor === 'function') {
    allRecipesNoTable = bot.recipesFor(itemType.id, null, 1, null) ?? [];
    allRecipesWithTable = fakeTable ? (bot.recipesFor(itemType.id, null, 1, fakeTable) ?? []) : [];
  }

  const merged = [...allRecipesNoTable, ...allRecipesWithTable];
  const deduped = new Map<string, any>();
  for (const recipe of merged) {
    deduped.set(recipeKey(recipe), recipe);
  }

  const recipes = Array.from(deduped.values());
  if (recipes.length === 0) {
    return { error: `No recipe found for '${itemName}' in the Minecraft 1.21.4 recipe table.` };
  }

  const evaluated = recipes.map((recipe) => {
    const outputPerCraft = getRecipeOutputCount(recipe, itemType.id);
    const craftsNeeded = Math.max(1, Math.ceil(amount / outputPerCraft));

    const ingredients: RecipeIngredientRequirement[] = [];
    if (Array.isArray(recipe.delta)) {
      for (const delta of recipe.delta) {
        if (delta.count >= 0) continue;
        const ingredientName = bot.registry.items[delta.id]?.name ?? `item_${delta.id}`;
        const required = Math.abs(delta.count) * craftsNeeded;
        const available = getInventoryCount(bot, ingredientName);
        const missing = Math.max(0, required - available);
        const acquisition = inferAcquisitionMethod(ingredientName);
        ingredients.push({ itemName: ingredientName, required, available, missing, acquisition });
      }
    }

    const missingIngredients = ingredients.filter((i) => i.missing > 0);
    const totalMissing = missingIngredients.reduce((sum, i) => sum + i.missing, 0);

    return {
      recipe,
      outputPerCraft,
      craftsNeeded,
      ingredients,
      missingIngredients,
      totalMissing,
      requiresCraftingTable: Boolean(recipe.requiresTable),
    };
  });

  evaluated.sort((a, b) => {
    if (a.totalMissing !== b.totalMissing) return a.totalMissing - b.totalMissing;
    if (a.requiresCraftingTable !== b.requiresCraftingTable) return Number(a.requiresCraftingTable) - Number(b.requiresCraftingTable);
    return a.ingredients.length - b.ingredients.length;
  });

  const best = evaluated[0];

  return {
    plan: {
      itemName,
      amount,
      targetAcquisition: inferAcquisitionMethod(itemName),
      outputPerCraft: best.outputPerCraft,
      craftsNeeded: best.craftsNeeded,
      requiresCraftingTable: best.requiresCraftingTable,
      ingredients: best.ingredients,
      missingIngredients: best.missingIngredients,
    },
  };
}

export function formatRecipePlan(plan: RecipePlan): string {
  const ingredientText = plan.ingredients.length > 0
    ? plan.ingredients
      .map((i) => `${i.required}x ${i.itemName} (have ${i.available}) | How to obtain: ${i.acquisition}`)
      .join('\n  - ')
    : 'No ingredients required';

  const missingText = plan.missingIngredients.length > 0
    ? plan.missingIngredients.map((i) => `${i.missing}x ${i.itemName}`).join(', ')
    : 'None';

  return [
    `Recipe lookup for ${plan.amount}x ${plan.itemName} (Minecraft 1.21.4):`,
    `- How to obtain target item: ${plan.targetAcquisition}`,
    `- Output per craft: ${plan.outputPerCraft}`,
    `- Craft operations needed: ${plan.craftsNeeded}`,
    `- Requires crafting table: ${plan.requiresCraftingTable ? 'yes' : 'no'}`,
    `- Ingredients: ${plan.ingredients.length > 0 ? `\n  - ${ingredientText}` : ingredientText}`,
    `- Missing ingredients: ${missingText}`,
  ].join('\n');
}

export function registerRecipeLookupTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('get_recipe', {
    title: 'Get Recipe',
    description: 'Look up a Minecraft 1.21.4 crafting recipe for an item and report required and missing ingredients for the requested amount.',
    inputSchema: {
      item_name: z.string(),
      amount: z.number().int().positive().max(64).default(1),
    },
  }, async ({ item_name, amount }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    const recipeResult = resolveRecipePlan(bot, item_name, amount ?? 1);
    if ('error' in recipeResult) {
      return textResult(formatObservation(buildObservation(bot, `Recipe lookup failed: ${recipeResult.error}`)));
    }

    return textResult(formatObservation(buildObservation(bot, formatRecipePlan(recipeResult.plan))));
  });
}
