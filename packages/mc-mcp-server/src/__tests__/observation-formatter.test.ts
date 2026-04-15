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

  it('should show neutral entities that are attacking as threats', () => {
    const obs = createBaseObservation();
    obs.nearbyEntities = [{
      id: 1, type: 'mob', name: 'Enderman', displayName: 'Enderman',
      position: { x: 102, y: 64, z: -198 }, distance: 5.0,
      hostility: 'neutral', behaviorState: 'attacking',
    }];
    const text = formatObservation(obs);
    expect(text).toContain('THREATS');
    expect(text).toContain('Enderman');
    expect(text).toContain('ATTACKING');
    expect(text).toContain('🟡');
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

  it('should format long-duration status effects with minutes', () => {
    const obs = createBaseObservation();
    obs.statusEffects = [
      { name: 'resistance', amplifier: 2, duration: 6000 }, // 300 seconds = 5m0s
    ];
    const text = formatObservation(obs);
    expect(text).toContain('resistance');
    expect(text).toContain('5m');
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

  it('should add directional context to events with positions', () => {
    const obs = createBaseObservation();
    // Bot is at x=100, z=-200; event is at x=105, z=-195 (NE direction)
    const events: EventNotification[] = [
      { type: 'entity_spawn', timestamp: Date.now(), data: { name: 'Zombie', position: { x: 110, y: 64, z: -190 } } },
      { type: 'sound', timestamp: Date.now(), data: { name: 'entity.zombie_growl', position: { x: 95, y: 64, z: -195 } } },
    ];
    const text = formatObservation(obs, events);
    // Should contain directional info relative to bot position (100, -200)
    expect(text).toContain('to the');
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

describe('formatObservation - event type coverage', () => {
  it('should format block_change event', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'block_change', timestamp: Date.now(), data: { position: { x: 100, y: 64, z: -200 }, oldBlock: 'stone', newBlock: 'air' } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Block changed');
    expect(text).toContain('stone');
    expect(text).toContain('air');
  });

  it('should format entity_despawn event', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'entity_despawn', timestamp: Date.now(), data: { name: 'Sheep' } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Sheep');
    expect(text).toContain('despawned');
  });

  it('should format entity_death event with direction', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'entity_death', timestamp: Date.now(), data: { name: 'Zombie', position: { x: 120, y: 64, z: -200 } } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Zombie');
    expect(text).toContain('died');
    expect(text).toContain('to the');
  });

  it('should format entity_movement event with direction', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'entity_movement', timestamp: Date.now(), data: { name: 'Skeleton', position: { x: 90, y: 64, z: -200 } } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Skeleton');
    expect(text).toContain('moved');
    expect(text).toContain('to the');
  });

  it('should format player_damage event', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'player_damage', timestamp: Date.now(), data: { health: 15, food: 18 } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Took damage');
    expect(text).toContain('15/20');
  });

  it('should format food_change event', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'food_change', timestamp: Date.now(), data: { food: 16, foodSaturation: 3.5 } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Food changed');
    expect(text).toContain('16/20');
  });

  it('should format experience_change event', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'experience_change', timestamp: Date.now(), data: { level: 7, progress: 0.3 } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('XP');
    expect(text).toContain('Level 7');
  });

  it('should format item_pickup event', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'item_pickup', timestamp: Date.now(), data: { name: 'dirt', count: 3 } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Picked up');
    expect(text).toContain('3x dirt');
  });

  it('should format weather_change event with thunder', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'weather_change', timestamp: Date.now(), data: { isRaining: true, thunderState: 0.5 } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Raining');
    expect(text).toContain('Thundering');
  });

  it('should format sound event with position and direction', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'sound', timestamp: Date.now(), data: { name: 'entity.zombie_growl', position: { x: 105, y: 64, z: -200 } } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Heard');
    expect(text).toContain('entity.zombie_growl');
    expect(text).toContain('to the');
  });

  it('should format sound event without position', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'sound', timestamp: Date.now(), data: { name: 'ambient.cave' } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Heard');
    expect(text).toContain('ambient.cave');
  });

  it('should format particle event', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'particle', timestamp: Date.now(), data: { name: 'smoke', position: { x: 100, y: 65, z: -200 } } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('smoke');
  });

  it('should format kicked event', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'kicked', timestamp: Date.now(), data: { reason: 'Server is full' } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Kicked');
    expect(text).toContain('Server is full');
  });

  it('should format death event', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'death', timestamp: Date.now(), data: { position: { x: 100, y: 64, z: -200 } } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('You died');
  });

  it('should format respawn event', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'respawn', timestamp: Date.now(), data: { position: { x: 0, y: 64, z: 0 } } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Respawned');
  });

  it('should handle unknown event type gracefully', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'block_change', timestamp: Date.now(), data: { position: { x: 0, y: 0, z: 0 }, oldBlock: 'stone', newBlock: 'air' } },
      // Force unknown type by casting
      { type: 'chat' as any, timestamp: Date.now(), data: { username: 'test', message: 'hi' } },
    ];
    // Chat event is known, so test with a truly unknown type
    const unknownEvents = [{ type: 'custom_event' as any, timestamp: Date.now(), data: {} }];
    const text = formatObservation(obs, unknownEvents as any);
    expect(text).toContain('Unknown event');
  });

  it('should truncate events when more than 20', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = Array.from({ length: 25 }, (_, i) => ({
      type: 'chat' as const,
      timestamp: Date.now(),
      data: { username: `Player${i}`, message: `Message ${i}` },
    }));
    const text = formatObservation(obs, events);
    expect(text).toContain('+5 more events');
  });
});

describe('truncateObservation - detailed coverage', () => {
  it('should split by section headers correctly', () => {
    const obs = createBaseObservation();
    obs.nearbyEntities = Array.from({ length: 30 }, (_, i) => ({
      id: i, type: 'mob' as const, name: `Entity${i}`, displayName: `Entity ${i}`,
      position: { x: 100 + i, y: 64, z: -200 }, distance: i,
      hostility: 'passive' as const,
    }));
    const text = formatObservation(obs);
    // Use a large enough limit to fit at least position section
    const truncated = truncateObservation(text, 300);
    expect(truncated).toContain('Position & World');
  });

  it('should include remaining sections that fit after priority ordering', () => {
    const obs = createBaseObservation();
    obs.nearbyBlocks = Array.from({ length: 20 }, (_, i) => ({
      name: `block_${i}`, displayName: `Block ${i}`,
      position: { x: i, y: 60, z: i },
      diggable: true,
      effectiveTool: 'pickaxe',
    }));
    const text = formatObservation(obs);
    const truncated = truncateObservation(text, 2000);
    // With a 2000 token limit, everything should fit for a base observation
    expect(truncated).toContain('Position & World');
    expect(truncated).toContain('Health & Status');
  });

  it('should handle final substring truncation when result still exceeds max', () => {
    const obs = createBaseObservation();
    for (let i = 0; i < 100; i++) {
      obs.nearbyEntities.push({
        id: i, type: 'mob' as const, name: `Entity${i}`, displayName: `Entity ${i}`,
        position: { x: 100 + i, y: 64, z: -200 }, distance: i,
        hostility: 'passive' as const,
      });
    }
    const text = formatObservation(obs);
    const truncated = truncateObservation(text, 50);
    // Should end with "..." if truncated
    expect(truncated.length).toBeLessThanOrEqual(50 * 4 + 3);
  });

  it('should handle sections without standard headers', () => {
    const text = 'Some intro text\n=== Position & World ===\nLocation: (0, 0, 0)\n=== Unknown Section ===\ndata here';
    const truncated = truncateObservation(text, 2000);
    expect(truncated).toContain('Position & World');
  });

  it('should include non-priority sections when they fit', () => {
    // Create text with a non-priority section that fits after priority sections
    const text = '=== Position & World ===\nLoc: 0,0,0\n=== Custom Info ===\nData here';
    // Small enough that everything fits
    const truncated = truncateObservation(text, 50);
    expect(truncated).toContain('Position & World');
    // Custom Info is not in priority order, so it gets added in remaining pass
    expect(truncated).toContain('Custom Info');
  });

  it('should apply final substring truncation when result exceeds max', () => {
    // Two small sections that together exceed the limit
    // maxTokens=5 → maxChars=20
    const text = '=== Position & World ===\nLoc\n=== Health & Status ===\nHP';
    const truncated = truncateObservation(text, 5);
    // Result should end with "..." if truncated, or fit within limit
    expect(truncated.length).toBeLessThanOrEqual(5 * 4 + 3);
  });

  it('should include non-priority sections in remaining pass', () => {
    // Priority section too large to fit, but small custom section fits
    const longData = 'x'.repeat(150);
    const text = `=== Position & World ===\n${longData}\n=== Custom ===\nsmall data`;
    const truncated = truncateObservation(text, 10);
    // Position section is too large, Custom section should be included
    expect(truncated).toContain('Custom');
  });

  it('should truncate when join newlines push result over max', () => {
    // Header + section that fit individually, but join newline pushes total over
    const text = 'X\n=== Position & World ===\n123456';
    const truncated = truncateObservation(text, 8);
    // 1 + 1 + 31 = 33 > 32 (maxChars), triggers final truncation
    expect(truncated.endsWith('...')).toBe(true);
  });

  it('should preserve header text before first section', () => {
    // Text with intro before first === header, long enough to trigger truncation
    const longData = 'x'.repeat(200);
    const text = `Bot Status Report\n=== Position & World ===\n${longData}\n=== Health & Status ===\n${longData}`;
    const truncated = truncateObservation(text, 10);
    expect(truncated).toContain('Bot Status Report');
  });

  it('should apply final substring truncation when reassembled text exceeds max', () => {
    // Create sections that individually fit but combined exceed the limit
    // maxTokens=50 → maxChars=200. Each section ~120 chars.
    const line1 = 'a'.repeat(100);
    const line2 = 'b'.repeat(100);
    const text = `=== Position & World ===\n${line1}\n=== Health & Status ===\n${line2}`;
    const truncated = truncateObservation(text, 50);
    // Either the whole text fits or it gets truncated with "..."
    expect(truncated.length).toBeLessThanOrEqual(50 * 4 + 3);
  });
});

describe('formatObservation - additional branch coverage', () => {
  it('should format formatBar with zero health', () => {
    const obs = createBaseObservation();
    obs.health.health = 0;
    obs.health.food = 0;
    const text = formatObservation(obs);
    expect(text).toContain('0/20');
  });

  it('should show low oxygen', () => {
    const obs = createBaseObservation();
    obs.health.oxygenLevel = 5;
    const text = formatObservation(obs);
    expect(text).toContain('Oxygen');
    expect(text).toContain('5/20');
  });

  it('should not show oxygen when at max', () => {
    const obs = createBaseObservation();
    obs.health.oxygenLevel = 20;
    const text = formatObservation(obs);
    expect(text).not.toContain('Oxygen');
  });

  it('should handle severity medium hazard icon', () => {
    const obs = createBaseObservation();
    obs.environmentalHazards = [{
      type: 'cactus', position: { x: 110, y: 60, z: -190 }, distance: 5.0, severity: 'medium',
    }];
    const text = formatObservation(obs);
    expect(text).toContain('cactus');
    expect(text).toContain('medium');
    expect(text).toContain('🟡');
  });

  it('should handle high severity hazard icon', () => {
    const obs = createBaseObservation();
    obs.environmentalHazards = [{
      type: 'fire', position: { x: 110, y: 60, z: -190 }, distance: 5.0, severity: 'high',
    }];
    const text = formatObservation(obs);
    expect(text).toContain('fire');
    expect(text).toContain('high');
    expect(text).toContain('🔴');
  });

  it('should format entity with health info and held item', () => {
    const obs = createBaseObservation();
    obs.nearbyEntities = [{
      id: 1, type: 'mob', name: 'Zombie', displayName: 'Zombie',
      position: { x: 105, y: 64, z: -195 }, distance: 7.1,
      health: 15, maxHealth: 20, hostility: 'always_hostile',
      heldItem: 'iron_sword',
    }];
    const text = formatObservation(obs);
    expect(text).toContain('HP:15/20');
    expect(text).toContain('iron_sword');
  });

  it('should format nearby blocks with more than 10 types', () => {
    const obs = createBaseObservation();
    for (let i = 0; i < 15; i++) {
      obs.nearbyBlocks.push({
        name: `block_${i}`, displayName: `Block ${i}`,
        position: { x: i, y: 60, z: i }, diggable: true, effectiveTool: 'pickaxe',
      });
    }
    const text = formatObservation(obs);
    expect(text).toContain('more types');
  });

  it('should format craftable items with more than 10', () => {
    const obs = createBaseObservation();
    for (let i = 0; i < 15; i++) {
      obs.craftableItems.push({
        name: `item_${i}`, displayName: `Item ${i}`, requiresCraftingTable: false,
      });
    }
    const text = formatObservation(obs);
    expect(text).toContain('+5 more');
  });

  it('should format weather_change event as clear', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'weather_change', timestamp: Date.now(), data: { isRaining: false, rainState: 0, thunderState: 0 } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Clear');
    expect(text).not.toContain('Thundering');
  });

  it('should format event with null position', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'entity_spawn', timestamp: Date.now(), data: { name: 'Zombie', position: null } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Zombie');
    expect(text).toContain('spawned');
  });

  it('should format entity_death event with null position', () => {
    const obs = createBaseObservation();
    const events: EventNotification[] = [
      { type: 'entity_death', timestamp: Date.now(), data: { name: 'Zombie', position: null } },
    ];
    const text = formatObservation(obs, events);
    expect(text).toContain('Zombie');
    expect(text).toContain('died');
  });

  it('should format formatDist for very short distances', () => {
    const obs = createBaseObservation();
    obs.nearbyDroppedItems = [{
      name: 'diamond', displayName: 'Diamond', count: 1,
      position: { x: 100.1, y: 64, z: -200 }, distance: 0.1,
      estimatedDespawnMs: 300000,
    }];
    const text = formatObservation(obs);
    expect(text).toContain('1m');
  });

  it('should format status effect with amplifier > 0', () => {
    const obs = createBaseObservation();
    obs.statusEffects = [
      { name: 'speed', amplifier: 2, duration: 600 },
    ];
    const text = formatObservation(obs);
    expect(text).toContain('speed');
    expect(text).toContain('Lv3');
  });

  it('should format status effect with indefinite duration', () => {
    const obs = createBaseObservation();
    obs.statusEffects = [
      { name: 'regeneration', amplifier: 0, duration: -1 },
    ];
    const text = formatObservation(obs);
    expect(text).toContain('regeneration');
    expect(text).toContain('∞');
  });

  it('should format formatDuration for seconds only', () => {
    const obs = createBaseObservation();
    obs.statusEffects = [
      { name: 'haste', amplifier: 0, duration: 200 }, // 10 seconds
    ];
    const text = formatObservation(obs);
    expect(text).toContain('haste');
    expect(text).toContain('10s');
  });

  it('should not show threat section when no threats', () => {
    const obs = createBaseObservation();
    const text = formatObservation(obs);
    expect(text).not.toContain('THREATS');
  });

  it('should not show attack cooldown when ready', () => {
    const obs = createBaseObservation();
    obs.attackCooldown = { progress: 1, ready: true };
    const text = formatObservation(obs);
    expect(text).not.toContain('Attack Cooldown');
  });

  it('should show attack cooldown when not ready', () => {
    const obs = createBaseObservation();
    obs.attackCooldown = { progress: 0.3, ready: false };
    const text = formatObservation(obs);
    expect(text).toContain('Attack Cooldown');
    expect(text).toContain('30%');
  });

  it('should not show dropped items section when none', () => {
    const obs = createBaseObservation();
    const text = formatObservation(obs);
    expect(text).not.toContain('Dropped Items');
  });

  it('should not show blocks section when none', () => {
    const obs = createBaseObservation();
    const text = formatObservation(obs);
    expect(text).not.toContain('Nearby Blocks');
  });

  it('should not show effects section when none', () => {
    const obs = createBaseObservation();
    const text = formatObservation(obs);
    expect(text).not.toContain('Effects:');
  });

  it('should format moon phase correctly', () => {
    const obs = createBaseObservation();
    obs.timeOfDay = { time: 18000, timeOfDay: 18000, day: false, moonPhase: 4, phase: 'midnight' };
    const text = formatObservation(obs);
    expect(text).toContain('New');
  });

  it('should format moon phase for unknown phase number', () => {
    const obs = createBaseObservation();
    obs.timeOfDay = { time: 18000, timeOfDay: 18000, day: false, moonPhase: 8, phase: 'midnight' };
    const text = formatObservation(obs);
    expect(text).toContain('Phase 8');
  });

  it('should format formatDist for medium distances', () => {
    const obs = createBaseObservation();
    obs.nearbyDroppedItems = [{
      name: 'dirt', displayName: 'Dirt', count: 1,
      position: { x: 105, y: 64, z: -195 }, distance: 5.5,
      estimatedDespawnMs: 300000,
    }];
    const text = formatObservation(obs);
    expect(text).toContain('5.5m');
  });

  it('should show sleeping status', () => {
    const obs = createBaseObservation();
    obs.health.isSleeping = true;
    const text = formatObservation(obs);
    expect(text).toContain('SLEEPING');
  });
});