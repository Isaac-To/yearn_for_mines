import { describe, it, expect } from 'vitest';
import { formatObservation, truncateObservation } from '../observation-formatter.js';
import type { Observation } from '@yearn-for-mines/shared';
import type { EventNotification } from '../events.js';

function createBaseObservation(): Observation {
  return {
    position: { x: 100, y: 64, z: -200, yaw: 90, pitch: 0 },
    health: {
      health: 20, food: 18, foodSaturation: 5.0,
      oxygenLevel: 20, experienceLevel: 5, experienceProgress: 0.5,
      isSleeping: false, gameMode: 'survival',
    },
    statusEffects: [],
    heldItem: null,
    armor: { helmet: null, chestplate: null, leggings: null, boots: null },
    hotbar: [],
    inventory: [],
    inventorySummary: {},
    nearbyBlocks: [],
    nearbyEntities: [],
    nearbyDroppedItems: [],
    environmentalHazards: [],
    weather: { isRaining: false, isThundering: false, rainState: 0, thunderState: 0 },
    timeOfDay: { time: 1000, timeOfDay: 1000, day: true, moonPhase: 0, phase: 'day' },
    biome: 'plains',
    dimension: 'overworld',
    lightLevel: 15,
    groundDistance: 0,
    attackCooldown: { progress: 1, ready: true },
    activeDig: null,
    craftableItems: [],
  };
}

describe('formatObservation', () => {
  it('should format a basic observation', () => {
    const obs = createBaseObservation();
    const text = formatObservation(obs);
    expect(text).toContain('Position & World');
    expect(text).toContain('Health & Status');
    expect(text).toContain('(100.0, 64.0, -200.0)');
    expect(text).toContain('Health: ██████████ 20/20');
    expect(text).toContain('plains');
    expect(text).toContain('overworld');
    expect(text).toContain('Clear');
  });

  it('should format health bars correctly', () => {
    const obs = createBaseObservation();
    obs.health.health = 10;
    obs.health.food = 5;
    const text = formatObservation(obs);
    expect(text).toContain('10/20');
    expect(text).toContain('5/20');
  });

  it('should show oxygen bar when below 20', () => {
    const obs = createBaseObservation();
    obs.health.oxygenLevel = 10;
    const text = formatObservation(obs);
    expect(text).toContain('Oxygen:');
    expect(text).toContain('10/20');
  });

  it('should not show oxygen bar when at max', () => {
    const obs = createBaseObservation();
    const text = formatObservation(obs);
    expect(text).not.toContain('Oxygen:');
  });

  it('should show sleeping status', () => {
    const obs = createBaseObservation();
    obs.health.isSleeping = true;
    const text = formatObservation(obs);
    expect(text).toContain('SLEEPING');
  });

  it('should format hostile entities as threats', () => {
    const obs = createBaseObservation();
    obs.nearbyEntities = [{
      id: 1, type: 'mob', name: 'Zombie', displayName: 'Zombie',
      position: { x: 105, y: 64, z: -195 }, distance: 7.1,
      health: 20, maxHealth: 20, hostility: 'always_hostile', behaviorState: 'idle',
    }];
    const text = formatObservation(obs);
    expect(text).toContain('THREATS');
    expect(text).toContain('Zombie');
    expect(text).toContain('7.1m');
  });

  it('should show attacking entities in threats', () => {
    const obs = createBaseObservation();
    obs.nearbyEntities = [{
      id: 1, type: 'mob', name: 'Spider', displayName: 'Spider',
      position: { x: 102, y: 64, z: -198 }, distance: 3.0,
      hostility: 'always_hostile', behaviorState: 'attacking',
    }];
    const text = formatObservation(obs);
    expect(text).toContain('ATTACKING');
  });

  it('should format environmental hazards in threats', () => {
    const obs = createBaseObservation();
    obs.environmentalHazards = [{
      type: 'lava', position: { x: 110, y: 60, z: -190 }, distance: 15.3, severity: 'deadly',
    }];
    const text = formatObservation(obs);
    expect(text).toContain('lava');
    expect(text).toContain('deadly');
  });

  it('should format held item with durability and enchantments', () => {
    const obs = createBaseObservation();
    obs.heldItem = {
      name: 'diamond_pickaxe', displayName: 'Diamond Pickaxe', count: 1, slot: 0,
      durability: 1200, maxDurability: 1561,
      enchantments: [{ name: 'efficiency', level: 3 }, { name: 'unbreaking', level: 1 }],
    };
    const text = formatObservation(obs);
    expect(text).toContain('Diamond Pickaxe');
    expect(text).toContain('[77%]');
    expect(text).toContain('efficiency3');
    expect(text).toContain('unbreaking');
  });

  it('should format armor pieces', () => {
    const obs = createBaseObservation();
    obs.armor = {
      helmet: 'diamond_helmet',
      chestplate: 'iron_chestplate',
      leggings: null,
      boots: 'leather_boots',
    };
    const text = formatObservation(obs);
    expect(text).toContain('diamond_helmet');
    expect(text).toContain('iron_chestplate');
    expect(text).toContain('leather_boots');
  });

  it('should format status effects', () => {
    const obs = createBaseObservation();
    obs.statusEffects = [
      { name: 'speed', amplifier: 1, duration: 300 },
      { name: 'regeneration', amplifier: 0, duration: 100 },
    ];
    const text = formatObservation(obs);
    expect(text).toContain('speed');
    expect(text).toContain('regeneration');
  });

  it('should format inventory summary', () => {
    const obs = createBaseObservation();
    obs.inventorySummary = { oak_log: 32, cobblestone: 64, diamond: 3 };
    const text = formatObservation(obs);
    expect(text).toContain('cobblestonex64');
    expect(text).toContain('oak_logx32');
    expect(text).toContain('diamondx3');
  });

  it('should format hotbar items', () => {
    const obs = createBaseObservation();
    obs.hotbar = [
      { name: 'stone', displayName: 'Stone', count: 64, slot: 0 },
      { name: 'oak_log', displayName: 'Oak Log', count: 16, slot: 1 },
    ];
    const text = formatObservation(obs);
    expect(text).toContain('Stone x64');
    expect(text).toContain('Oak Log x16');
  });

  it('should format craftable items', () => {
    const obs = createBaseObservation();
    obs.craftableItems = [
      { name: 'stone_pickaxe', displayName: 'Stone Pickaxe', requiresCraftingTable: false },
      { name: 'crafting_table', displayName: 'Crafting Table', requiresCraftingTable: false },
    ];
    const text = formatObservation(obs);
    expect(text).toContain('Stone Pickaxe');
    expect(text).toContain('Crafting Table');
  });

  it('should format weather as raining', () => {
    const obs = createBaseObservation();
    obs.weather = { isRaining: true, isThundering: true, rainState: 0.8, thunderState: 0.6 };
    const text = formatObservation(obs);
    expect(text).toContain('Raining');
    expect(text).toContain('Thundering');
  });

  it('should format time of day with phase', () => {
    const obs = createBaseObservation();
    obs.timeOfDay = { time: 15000, timeOfDay: 15000, day: false, moonPhase: 4, phase: 'night' };
    const text = formatObservation(obs);
    expect(text).toContain('night');
  });

  it('should format dropped items', () => {
    const obs = createBaseObservation();
    obs.nearbyDroppedItems = [{
      name: 'diamond', displayName: 'Diamond', count: 3,
      position: { x: 101, y: 64, z: -199 }, distance: 2.5,
      estimatedDespawnMs: 300000,
    }];
    const text = formatObservation(obs);
    expect(text).toContain('Diamond');
    expect(text).toContain('x3');
    expect(text).toContain('2.5m');
  });

  it('should format nearby blocks grouped by type', () => {
    const obs = createBaseObservation();
    obs.nearbyBlocks = [
      { name: 'stone', displayName: 'Stone', position: { x: 1, y: 60, z: 1 }, diggable: true, effectiveTool: 'pickaxe' },
      { name: 'stone', displayName: 'Stone', position: { x: 2, y: 60, z: 2 }, diggable: true, effectiveTool: 'pickaxe' },
      { name: 'dirt', displayName: 'Dirt', position: { x: 3, y: 60, z: 3 }, diggable: true },
    ];
    const text = formatObservation(obs);
    expect(text).toContain('Stonex2');
    expect(text).toContain('Dirt');
  });

  it('should format event enrichment', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'chat', timestamp: Date.now(), data: { username: 'Steve', message: 'Hello!' } },
      { type: 'entity_spawn', timestamp: Date.now(), data: { name: 'Zombie', position: { x: 105, y: 64, z: -195 } } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Recent Events');
    expect(text).toContain('Steve');
    expect(text).toContain('Zombie');
  });
});

describe('truncateObservation', () => {
  it('should not truncate short observations', () => {
    const obs = createBaseObservation();
    const text = formatObservation(obs);
    const truncated = truncateObservation(text, 2000);
    expect(truncated).toBe(text);
  });

  it('should truncate long observations to fit token limit', () => {
    const obs = createBaseObservation();
    // Add lots of entities to make it long
    for (let i = 0; i < 50; i++) {
      obs.nearbyEntities.push({
        id: i, type: 'mob', name: `Entity${i}`, displayName: `Entity ${i}`,
        position: { x: 100 + i, y: 64, z: -200 }, distance: i,
        hostility: 'passive',
      });
    }
    const text = formatObservation(obs);
    const truncated = truncateObservation(text, 500); // Very small limit
    expect(truncated.length).toBeLessThanOrEqual(500 * 4 + 3); // +3 for "..."
  });

  it('should prioritize position and health sections', () => {
    const obs = createBaseObservation();
    const text = formatObservation(obs);
    const truncated = truncateObservation(text, 2000);
    expect(truncated).toContain('Position & World');
    expect(truncated).toContain('Health & Status');
  });
});

describe('formatObservation - edge cases', () => {
  it('should handle empty observation', () => {
    const obs = createBaseObservation();
    const text = formatObservation(obs);
    expect(text).toContain('none visible');
    expect(text).toContain('Clear');
  });

  it('should handle attack cooldown not ready', () => {
    const obs = createBaseObservation();
    obs.attackCooldown = { progress: 0.3, ready: false };
    const text = formatObservation(obs);
    expect(text).toContain('30% ready');
  });

  it('should handle active dig progress', () => {
    const obs = createBaseObservation();
    obs.activeDig = { blockName: 'stone', position: { x: 100, y: 63, z: -200 }, progress: 0.5 };
    const text = formatObservation(obs);
    expect(text).toContain('Digging');
    expect(text).toContain('50% complete');
  });

  it('should format passive entities without threat icon', () => {
    const obs = createBaseObservation();
    obs.nearbyEntities = [{
      id: 1, type: 'mob', name: 'Cow', displayName: 'Cow',
      position: { x: 105, y: 64, z: -195 }, distance: 7.1,
      hostility: 'passive',
    }];
    const text = formatObservation(obs);
    expect(text).toContain('Cow');
    expect(text).not.toContain('THREATS');
  });

  it('should format craftable items with truncation for many items', () => {
    const obs = createBaseObservation();
    obs.craftableItems = Array.from({ length: 15 }, (_, i) => ({
      name: `item_${i}`, displayName: `Item ${i}`, requiresCraftingTable: false,
    }));
    const text = formatObservation(obs);
    expect(text).toContain('+5 more');
  });
});