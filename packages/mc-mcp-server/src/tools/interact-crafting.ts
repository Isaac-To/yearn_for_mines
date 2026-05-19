import type { Bot } from 'mineflayer';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { findClosestMatches } from '../utils/string-match.js';
import {
  resolveTargetBlock,
  isFurnaceBlock,
} from './interact-helpers.js';

export async function handleCraft(bot: Bot, item: string, amount: number): Promise<any> {
  const itemType = bot.registry.itemsByName[item];
  if (!itemType) {
    const suggestions = findClosestMatches(item, Object.keys(bot.registry.itemsByName), 3);
    const suggestionsStr = suggestions.length > 0 ? ` Did you mean: '${suggestions.join("', '")}'?` : '';
    return errorResult(`Unknown item '${item}'.${suggestionsStr}`);
  }
  const table = bot.findBlock({
    matching: bot.registry.blocksByName.crafting_table.id,
    maxDistance: 6,
  });
  const recipes = bot.recipesFor(itemType.id, null, amount, table);
  if (recipes.length === 0) {
    const allRecipes = bot.recipesFor(itemType.id, null, amount, null);
    if (allRecipes.length > 0 && !table) {
      return errorResult(`Cannot craft ${item}: requires a crafting table nearby. No crafting table found within 6 blocks. Place one near you first, then try again.`);
    }
    const inventoryNames = bot.inventory.items().map(i => i.name).join(', ');
    return errorResult(`Cannot craft ${item}. Missing ingredients. Current inventory: ${inventoryNames || '(empty)'}`);
  }
  await bot.craft(recipes[0], amount, table ?? undefined);
  return textResult(`Successfully crafted ${amount}x ${item}.`);
}

export async function handleSmelt(bot: Bot, item: string, fuel: string, amount: number, target: string | { x: number; y: number; z: number }): Promise<any> {
  const furnaceBlock = resolveTargetBlock(bot, target);
  if (!furnaceBlock || !isFurnaceBlock(furnaceBlock.name)) {
    return errorResult('Cannot smelt: furnace not found. Target a furnace, blast_furnace, or smoker.');
  }
  const itemType = bot.registry.itemsByName[item];
  if (!itemType) {
    const suggestions = findClosestMatches(item, Object.keys(bot.registry.itemsByName), 3);
    return errorResult(`Unknown item '${item}'. Did you mean: '${suggestions.join("', '")}'?`);
  }
  const fuelType = bot.registry.itemsByName[fuel];
  if (!fuelType) {
    const suggestions = findClosestMatches(fuel, Object.keys(bot.registry.itemsByName), 3);
    return errorResult(`Unknown fuel '${fuel}'. Did you mean: '${suggestions.join("', '")}'?`);
  }

  const furnace = await bot.openFurnace(furnaceBlock);
  try {
    await furnace.putInput(itemType.id, null, amount);
    await furnace.putFuel(fuelType.id, null, amount);
    return textResult(`Placed ${amount}x ${item} and ${amount}x ${fuel} in ${furnaceBlock.name}. Smelting will begin automatically.`);
  } finally {
    furnace.close();
  }
}

export async function handleSmeltTakeOutput(bot: Bot, target: string | { x: number; y: number; z: number }): Promise<any> {
  const furnaceBlock = resolveTargetBlock(bot, target);
  if (!furnaceBlock || !isFurnaceBlock(furnaceBlock.name)) {
    return errorResult('Cannot take output: furnace not found.');
  }
  const furnace = await bot.openFurnace(furnaceBlock);
  try {
    const output = furnace.outputItem();
    if (!output) {
      return errorResult('No smelting output ready in furnace.');
    }
    await furnace.takeOutput();
    return textResult(`Took ${output.name}x${output.count} from ${furnaceBlock.name} output.`);
  } finally {
    furnace.close();
  }
}

export async function handleEnchant(bot: Bot, item: string, lapis: string, level: number, target: string | { x: number; y: number; z: number }): Promise<any> {
  const tableBlock = resolveTargetBlock(bot, target);
  if (!tableBlock || tableBlock.name !== 'enchanting_table') {
    return errorResult('Cannot enchant: enchanting_table not found.');
  }
  const invItem = bot.inventory.items().find(i => i.name === item);
  if (!invItem) {
    return errorResult(`No ${item} in inventory to enchant.`);
  }
  const lapisItem = bot.registry.itemsByName[lapis];
  if (!lapisItem) {
    return errorResult(`Unknown item '${lapis}' for lapis.`);
  }

  const table = await bot.openEnchantmentTable(tableBlock);
  try {
    await table.putTargetItem(invItem as any);

    const lapisSlot = bot.inventory.items().find(i => i.name === lapis);
    if (lapisSlot) {
      await table.putLapis(lapisSlot as any);
    }

    if (level < 0 || level > 2) {
      return errorResult('Enchantment level must be 0, 1, or 2.');
    }

    const result = await table.enchant(level);
    return textResult(`Enchanted item with enchantment option ${level}. Result: ${result?.name ?? 'unknown'}.`);
  } finally {
    table.close();
  }
}

export async function handleAnvilCombine(bot: Bot, item1: string, item2: string, name: string | undefined, target: string | { x: number; y: number; z: number }): Promise<any> {
  const anvilBlock = resolveTargetBlock(bot, target);
  if (!anvilBlock || !anvilBlock.name.includes('anvil')) {
    return errorResult('Cannot use anvil: anvil not found.');
  }
  const inv1 = bot.inventory.items().find(i => i.name === item1);
  if (!inv1) return errorResult(`No ${item1} in inventory.`);
  const inv2 = bot.inventory.items().find(i => i.name === item2);
  if (!inv2) return errorResult(`No ${item2} in inventory.`);

  const anvil = await bot.openAnvil(anvilBlock);
  try {
    await anvil.combine(inv1 as any, inv2 as any, name || undefined);
    return textResult(`Combined ${item1} and ${item2} on anvil${name ? ` with name '${name}'` : ''}.`);
  } finally {
    (anvil as any).close();
  }
}

export async function handleAnvilRename(bot: Bot, item: string, name: string, target: string | { x: number; y: number; z: number }): Promise<any> {
  const anvilBlock = resolveTargetBlock(bot, target);
  if (!anvilBlock || !anvilBlock.name.includes('anvil')) {
    return errorResult('Cannot use anvil: anvil not found.');
  }
  const invItem = bot.inventory.items().find(i => i.name === item);
  if (!invItem) return errorResult(`No ${item} in inventory.`);

  const anvil = await bot.openAnvil(anvilBlock);
  try {
    await anvil.rename(invItem as any, name);
    return textResult(`Renamed ${item} to '${name}' on anvil.`);
  } finally {
    (anvil as any).close();
  }
}

export async function handleTrade(bot: Bot, tradeIndex: number, count: number, targetEntity: string): Promise<any> {
  const entity = Object.values(bot.entities).find(
    (e: any) => e.name === targetEntity || e.username === targetEntity
  );
  if (!entity) {
    return errorResult(`Cannot trade: entity '${targetEntity}' not found nearby.`);
  }
  const villager = await bot.openVillager(entity as any);
  try {
    await bot.trade(villager, tradeIndex, count);
    return textResult(`Traded ${count}x of trade #${tradeIndex} with ${targetEntity}.`);
  } finally {
    villager.close();
  }
}