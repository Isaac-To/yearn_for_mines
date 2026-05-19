import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

type Block = NonNullable<ReturnType<Bot['blockAt']>>

export const CONTAINER_BLOCKS = [
  'chest', 'barrel', 'ender_chest', 'trapped_chest',
  'hopper', 'dispenser', 'dropper',
];

export const FURNACE_BLOCKS = ['furnace', 'blast_furnace', 'smoker'];

export const INTERACTABLE_BLOCKS = [
  'furnace', 'blast_furnace', 'smoker', 'brewing_stand',
  'chest', 'barrel', 'ender_chest', 'trapped_chest',
  'shulker_box', 'hopper', 'dispenser', 'dropper',
  'crafter', 'crafting_table', 'enchanting_table',
  'anvil', 'chipped_anvil', 'damaged_anvil',
  'smithing_table', 'grindstone', 'loom', 'stonecutter',
  'cartography_table', 'lectern', 'beacon', 'jukebox',
  'lodestone', 'respawn_anchor', 'beehive', 'bee_nest',
  'campfire', 'soul_campfire', 'cauldron', 'composter',
  'flower_pot', 'bell', 'cake', 'fletching_table',
  'chiseled_bookshelf', 'decorated_pot',
  'conduit', 'note_block', 'daylight_detector',
  'tnt', 'redstone_wire', 'repeater', 'comparator',
  'observer', 'lightning_rod', 'target',
  'copper_bulb', 'scaffolding',
];

export const INTERACTABLE_PATTERNS = [
  'door', 'gate', 'button', 'lever', 'pressure_plate',
  'trapdoor', 'rail', 'sign', 'bed', 'banner',
  'shulker_box', 'head', 'skull',
];

export function isContainerBlock(name: string): boolean {
  return CONTAINER_BLOCKS.includes(name) || name.includes('shulker_box');
}

export function isFurnaceBlock(name: string): boolean {
  return FURNACE_BLOCKS.includes(name);
}

export function isInteractable(name: string): boolean {
  return INTERACTABLE_BLOCKS.includes(name) ||
    INTERACTABLE_PATTERNS.some(pattern => name.includes(pattern));
}

export function resolveTargetBlock(bot: Bot, target: string | { x: number; y: number; z: number }): Block | null {
  if (typeof target === 'string') {
    const blockType = bot.registry.blocksByName[target];
    if (!blockType) return null;
    return bot.findBlock({ matching: blockType.id, maxDistance: 5 });
  }
  return bot.blockAt(new Vec3(target.x, target.y, target.z));
}