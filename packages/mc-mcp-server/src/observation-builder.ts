import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import type { BlockObservation, EntityObservation, DroppedItem } from '@yearn-for-mines/shared';

export interface PointOfInterest {
  name: string;
  type: 'entity' | 'block' | 'item';
  distance: number;
  position: { x: number; y: number; z: number };
  extra?: string;
}

export interface ContextFrame {
  outcomeDescription?: string;
  vitalStats: {
    health: number;
    food: number;
    oxygen: number;
    position: { x: number; y: number; z: number; dimension: string; biome: string };
  };
  inventorySummary: Record<string, number>;
  pointsOfInterest: PointOfInterest[];
  recentEvents?: any[];
}

/** Convert a position (plain object or Vec3) to a Vec3 instance for mineflayer API calls. */
function toVec3(pos: { x: number; y: number; z: number }): Vec3 {
  if (pos instanceof Vec3) return pos;
  return new Vec3(pos.x, pos.y, pos.z);
}

// Hostility classification for Minecraft entities
const ALWAYS_HOSTILE = new Set([
  'Zombie', 'Skeleton', 'Creeper', 'Spider', 'Enderman', 'Witch', 'Slime',
  'Blaze', 'Ghast', 'MagmaCube', 'Silverfish', 'CaveSpider', 'Guardian',
  'ElderGuardian', 'Wither', 'Warden', 'Phantom', 'Hoglin', 'PiglinBrute',
  'Vindicator', 'Evoker', 'Pillager', 'Ravager', 'Vex',
]);

const NEUTRAL = new Set([
  'IronGolem', 'Piglin', 'Wolf', 'Enderman', 'Bee', 'PolarBear',
  'Panda', 'Fox', 'Bee', 'Dolphin', 'Llama', 'TraderLlama',
  'SnowGolem', 'Shulker',
]);

function classifyHostility(name: string): 'always_hostile' | 'neutral' | 'passive' {
  if (ALWAYS_HOSTILE.has(name)) return 'always_hostile';
  if (NEUTRAL.has(name)) return 'neutral';
  return 'passive';
}

function getTimePhase(time: number): 'sunrise' | 'day' | 'noon' | 'sunset' | 'night' | 'midnight' {
  if (time >= 0 && time < 6000) return 'day';
  if (time >= 6000 && time < 6500) return 'noon';
  if (time >= 6500 && time < 12000) return 'sunset';
  if (time >= 12000 && time < 18000) return 'night';
  if (time >= 18000 && time < 23000) return 'midnight';
  return 'sunrise';
}

function getBiomeName(bot: Bot): string {
  // biomeAt was added in newer mineflayer versions; fall back to blockAt lookup
  const block = bot.blockAt(toVec3(bot.entity.position).floored());
  if (block && (block as any).biome) {
    return (block as any).biome.name ?? 'unknown';
  }
  // Try the registry approach
  try {
    const biomeId = (bot.world as any)?.getBiome?.(
      Math.floor(bot.entity.position.x),
      Math.floor(bot.entity.position.y),
      Math.floor(bot.entity.position.z),
    );
    if (biomeId !== undefined && bot.registry.biomes[biomeId]) {
      return bot.registry.biomes[biomeId].name ?? 'unknown';
    }
  } catch {
    // fall through
  }
  return 'unknown';
}

function getNearbyBlocks(bot: Bot): BlockObservation[] {
  const blocks: BlockObservation[] = [];
  const pos = bot.entity.position;
  const range = 4; // blocks within 4 meters

  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      for (let dz = -range; dz <= range; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const blockPos = {
          x: Math.floor(pos.x) + dx,
          y: Math.floor(pos.y) + dy,
          z: Math.floor(pos.z) + dz,
        };
        const block = bot.blockAt(toVec3(blockPos));
        if (!block || block.name === 'air') continue;

        const effectiveTool = block.harvestTools
          ? Object.keys(block.harvestTools).length > 0
            ? (block as any).material?.tool ?? 'hand'
            : 'hand'
          : 'hand';

        blocks.push({
          name: block.name,
          displayName: block.displayName ?? block.name,
          position: { x: blockPos.x, y: blockPos.y, z: blockPos.z },
          diggable: block.diggable ?? false,
          effectiveTool,
          digTimeMs: block.diggable
            ? bot.digTime?.(block) ?? undefined
            : undefined,
          lightLevel: (block as any).light ?? undefined,
        });
      }
    }
  }

  return blocks;
}

function getNearbyEntities(bot: Bot): EntityObservation[] {
  const entities: EntityObservation[] = [];
  const botPos = bot.entity.position;

  for (const entity of Object.values(bot.entities)) {
    if (entity === bot.entity) continue;

    const distance = botPos.distanceTo(entity.position);

    // Only include entities within 32 blocks
    if (distance > 32) continue;

    const name = entity.name ?? entity.username ?? 'unknown';
    const displayName = entity.displayName ?? name;

    let type: 'player' | 'mob' | 'object' | 'global' | 'other' = 'other';
    if (entity.type === 'player') type = 'player';
    else if (entity.type === 'mob') type = 'mob';
    else if (entity.type === 'object') type = 'object';
    else if (entity.type === 'global') type = 'global';

    // Extract health from metadata if available
    let health: number | undefined;
    let maxHealth: number | undefined;
    const metadata = entity.metadata;
    if (metadata && Array.isArray(metadata)) {
      // Health is typically at index 8 for living entities (Float)
      const rawHealth = metadata[8];
      if (typeof rawHealth === 'number') {
        health = rawHealth;
        // Max health is typically at index 9
        const rawMax = metadata[9];
        if (typeof rawMax === 'number') maxHealth = rawMax;
      }
    }

    // Determine behavior state
    let behaviorState: 'idle' | 'attacking' | 'fleeing' | undefined;
    if ((entity as any).mobName) {
      // Check if the entity is targeting the bot
      const target = (entity as any).target;
      if (target === bot.entity) behaviorState = 'attacking';
      else behaviorState = 'idle';
    }

    // Extract held item and armor
    let heldItem: string | undefined;
    const equipment = entity.equipment;
    if (equipment && equipment.length > 0 && equipment[0]) {
      heldItem = equipment[0].name;
    }

    const armor: string[] = [];
    if (equipment) {
      // Slots 1-4 are armor (head, chest, legs, feet)
      for (let i = 1; i <= 4; i++) {
        const armorItem = equipment[i];
        if (armorItem) armor.push(armorItem.name);
      }
    }

    entities.push({
      id: entity.id,
      type,
      name,
      displayName,
      position: {
        x: entity.position.x,
        y: entity.position.y,
        z: entity.position.z,
      },
      distance: Math.round(distance * 10) / 10,
      health,
      maxHealth,
      hostility: classifyHostility(name),
      behaviorState,
      heldItem,
      armor: armor.length > 0 ? armor : undefined,
    });
  }

  // Sort by distance (nearest first)
  entities.sort((a, b) => a.distance - b.distance);
  return entities;
}

export function getNearbyDroppedItems(bot: Bot): DroppedItem[] {
  const items: DroppedItem[] = [];
  const botPos = bot.entity.position;

  for (const entity of Object.values(bot.entities)) {
    if (entity.displayName !== 'Item') continue;

    const distance = botPos.distanceTo(entity.position);
    if (distance > 16) continue;

    const name = entity.name ?? 'unknown';
    const displayName = entity.displayName ?? name;
    const count = (entity as any).metadata?.[7] ?? 1;

    // Dropped items despawn after 5 minutes (6000 ticks = 300000ms)
    // This is approximate; we don't track actual spawn time
    items.push({
      name,
      displayName,
      count,
      position: {
        x: entity.position.x,
        y: entity.position.y,
        z: entity.position.z,
      },
      distance: Math.round(distance * 10) / 10,
      estimatedDespawnMs: 300000,
    });
  }

  items.sort((a, b) => a.distance - b.distance);
  return items;
}





function getInventorySummary(bot: Bot): Record<string, number> {
  const summary: Record<string, number> = {};
  const inventory = bot.inventory;

  for (const slot of inventory.slots) {
    if (!slot) continue;
    summary[slot.name] = (summary[slot.name] ?? 0) + slot.count;
  }

  return summary;
}




export function getCraftableItems(bot: Bot): { name: string; displayName: string; requiresCraftingTable: boolean }[] {
  const craftable: { name: string; displayName: string; requiresCraftingTable: boolean }[] = [];
  const _tableRecipes: any[] = [];

  try {
    // Get all recipes the bot can make with current inventory
    for (const name in bot.registry.items) {
      const item = bot.registry.items[name];
      if (!item) continue;

      const recipes = bot.recipesFor(item.id, null, 1, null);
      if (!recipes || recipes.length === 0) continue;

      for (const recipe of recipes) {
        // Check if the bot has all required ingredients
        if (canCraftRecipe(bot, recipe)) {
          craftable.push({
            name: item.name,
            displayName: item.displayName ?? item.name,
            requiresCraftingTable: recipe.requiresTable ?? false,
          });
          break; // Only need one recipe per item
        }
      }
    }
  } catch {
    // Recipe lookup can fail in test environments or before bot is connected
  }

  return craftable;
}

function canCraftRecipe(bot: Bot, recipe: any): boolean {
  try {
    if (!recipe || !recipe.delta) return false;

    // delta contains positive (outputs) and negative (inputs) values
    for (const item of recipe.delta) {
      if (item.count < 0) {
        // This is an ingredient - check if we have enough
        const count = countItemInInventory(bot, item.id);
        if (count < Math.abs(item.count)) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function countItemInInventory(bot: Bot, itemId: number): number {
  let count = 0;
  const inventory = bot.inventory;
  for (const slot of inventory.slots) {
    if (slot && slot.type === itemId) {
      count += slot.count;
    }
  }
  return count;
}



export function buildObservation(bot: Bot, outcomeDescription?: string): ContextFrame {
  const pos = bot.entity.position;

  // Get all PoIs and sort by distance
  const posVec = new Vec3(pos.x, pos.y, pos.z);
  const rawEntities = getNearbyEntities(bot);
  const rawBlocks = getNearbyBlocks(bot);
  const rawItems = getNearbyDroppedItems(bot);
  
  const allPois: PointOfInterest[] = [
    ...rawEntities.map(e => ({
      name: e.displayName,
      type: 'entity' as const,
      distance: e.distance,
      position: e.position,
      extra: `hostility: ${e.hostility}${e.health ? `, HP: ${e.health}` : ''}`
    })),
    ...rawItems.map(i => ({
      name: i.displayName,
      type: 'item' as const,
      distance: i.distance,
      position: i.position,
      extra: `count: ${i.count}`
    })),
    ...rawBlocks.map(b => {
      const bPos = new Vec3(b.position.x, b.position.y, b.position.z);
      return {
        name: b.displayName,
        type: 'block' as const,
        distance: posVec.distanceTo(bPos),
        position: b.position
      };
    })
  ];
  
  allPois.sort((a, b) => a.distance - b.distance);
  const pointsOfInterest = allPois.slice(0, 5);

  return {
    outcomeDescription,
    vitalStats: {
      health: bot.health ?? 20,
      food: bot.food ?? 20,
      oxygen: bot.oxygenLevel ?? 20,
      position: { x: Number(pos.x.toFixed(1)), y: Number(pos.y.toFixed(1)), z: Number(pos.z.toFixed(1)), dimension: bot.game?.dimension ?? 'overworld', biome: getBiomeName(bot) },
    },
    inventorySummary: getInventorySummary(bot),
    pointsOfInterest,
  };
}

export { classifyHostility, getTimePhase };