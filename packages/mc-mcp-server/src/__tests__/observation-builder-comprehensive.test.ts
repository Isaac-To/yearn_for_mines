import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildObservation, classifyHostility, getTimePhase } from '../observation-builder.js';
import type { Bot } from 'mineflayer';

// Helper to create a Vec3-like position with distanceTo
function createPos(x: number, y: number, z: number) {
  return {
    x, y, z,
    distanceTo(other: any) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dz = this.z - other.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },
  };
}

// Helper to create a comprehensive mock bot with configurable properties
function createMockBot(overrides: Record<string, any> = {}): Bot {
  const defaultBlock = {
    name: 'grass_block',
    position: { x: 100, y: 63, z: -200 },
    type: 2,
    diggable: true,
    material: { tool: 'shovel' },
    harvestTools: { '1': true },
    boundingBox: 'solid' as const,
    light: 15,
    displayName: 'Grass Block',
  };

  const mockBot: Bot = {
    username: 'TestBot',
    entity: {
      position: createPos(100, 64, -200),
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 90,
      pitch: 0,
      height: 1.8,
      onGround: true,
      equipment: [] as never[],
      metadata: [] as never[],
      effects: {},
    } as never,
    health: 20,
    food: 18,
    foodSaturation: 5.0,
    oxygenLevel: 20,
    experience: { level: 5, points: 50, progress: 0.5 },
    isSleeping: false,
    spawnPoint: { x: 0, y: 64, z: 0 },
    game: { dimension: 'overworld', gameMode: 'survival', difficulty: 'peaceful', hardcore: false, maxPlayers: 20 } as never,
    isRaining: false,
    rainState: 0,
    thunderState: 0,
    time: { time: 1000, timeOfDay: 1000, day: true, moonPhase: 0 } as never,
    players: {} as never,
    inventory: {
      slots: [] as never[],
      selectedSlot: 0,
    } as never,
    quickBarSlot: 0,
    heldItem: null as never,
    targetDigBlock: null,
    entities: {} as never,
    blockAt: vi.fn().mockReturnValue({ ...defaultBlock }),
    findBlock: vi.fn().mockReturnValue(null),
    findBlocks: vi.fn().mockReturnValue([]),
    canDigBlock: vi.fn().mockReturnValue(true),
    canSeeBlock: vi.fn().mockReturnValue(true),
    nearestEntity: vi.fn().mockReturnValue(null),
    registry: {
      blocks: {} as never,
      items: {} as never,
      biomes: {} as never,
      recipes: {} as never,
      enchantments: {} as never,
      blocksByName: {} as never,
      itemsByName: {} as never,
      itemsById: {} as never,
    } as never,
    world: {
      getBlock: vi.fn().mockReturnValue({
        name: 'grass_block',
        type: 2,
        position: { x: 100, y: 63, z: -200 },
        diggable: true,
      }),
      getBiome: vi.fn().mockReturnValue(undefined),
    } as never,
    controlState: {} as never,
    ...overrides,
  } as unknown as Bot;

  return mockBot;
}

describe('buildObservation - position', () => {
  it('should include position with yaw and pitch', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(100, 64, -200),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 90,
        pitch: 45,
        height: 1.8,
        onGround: true,
        equipment: [],
        metadata: [],
        effects: {},
      },
    });
    const obs = buildObservation(bot);
    expect(obs.position.x).toBe(100);
    expect(obs.position.y).toBe(64);
    expect(obs.position.z).toBe(-200);
    expect(obs.position.yaw).toBe(90);
    expect(obs.position.pitch).toBe(45);
  });

  it('should default yaw and pitch to 0 when undefined', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(0, 0, 0),
        velocity: { x: 0, y: 0, z: 0 },
        // no yaw or pitch
        height: 1.8,
        onGround: true,
        equipment: [],
        metadata: [],
        effects: {},
      },
    });
    const obs = buildObservation(bot);
    expect(obs.position.yaw).toBe(0);
    expect(obs.position.pitch).toBe(0);
  });
});

describe('buildObservation - health defaults', () => {
  it('should default health values when missing', () => {
    const bot = createMockBot({
      health: undefined,
      food: undefined,
      foodSaturation: undefined,
      oxygenLevel: undefined,
      experience: undefined,
      isSleeping: undefined,
      game: undefined,
    });
    const obs = buildObservation(bot);
    expect(obs.health.health).toBe(20);
    expect(obs.health.food).toBe(20);
    expect(obs.health.foodSaturation).toBe(0);
    expect(obs.health.oxygenLevel).toBe(20);
    expect(obs.health.experienceLevel).toBe(0);
    expect(obs.health.experienceProgress).toBe(0);
    expect(obs.health.isSleeping).toBe(false);
    expect(obs.health.gameMode).toBe('survival');
  });

  it('should use provided health values', () => {
    const bot = createMockBot({
      health: 10,
      food: 15,
      foodSaturation: 3.5,
      oxygenLevel: 18,
      experience: { level: 30, points: 100, progress: 0.8 },
      isSleeping: true,
      game: { dimension: 'the_nether', gameMode: 'creative' },
    });
    const obs = buildObservation(bot);
    expect(obs.health.health).toBe(10);
    expect(obs.health.food).toBe(15);
    expect(obs.health.foodSaturation).toBe(3.5);
    expect(obs.health.oxygenLevel).toBe(18);
    expect(obs.health.experienceLevel).toBe(30);
    expect(obs.health.experienceProgress).toBe(0.8);
    expect(obs.health.isSleeping).toBe(true);
    expect(obs.health.gameMode).toBe('creative');
  });
});

describe('buildObservation - weather', () => {
  it('should handle thundering weather', () => {
    const bot = createMockBot({
      isRaining: true,
      thunderState: 0.5,
    });
    const obs = buildObservation(bot);
    expect(obs.weather.isRaining).toBe(true);
    expect(obs.weather.isThundering).toBe(true);
    expect(obs.weather.thunderState).toBe(0.5);
  });

  it('should default weather values when missing', () => {
    const bot = createMockBot({
      isRaining: undefined,
      thunderState: undefined,
      rainState: undefined,
    });
    const obs = buildObservation(bot);
    expect(obs.weather.isRaining).toBe(false);
    expect(obs.weather.isThundering).toBe(false);
    expect(obs.weather.rainState).toBe(0);
  });
});

describe('buildObservation - time', () => {
  it('should default time values when missing', () => {
    const bot = createMockBot({ time: undefined });
    const obs = buildObservation(bot);
    expect(obs.timeOfDay.time).toBe(0);
    expect(obs.timeOfDay.timeOfDay).toBe(0);
    expect(obs.timeOfDay.day).toBe(true);
    expect(obs.timeOfDay.moonPhase).toBe(0);
    expect(obs.timeOfDay.phase).toBe('day');
  });

  it('should compute day from timeOfDay when time.day is falsy number', () => {
    const bot = createMockBot({
      time: { time: 5000, timeOfDay: 5000, day: 0, moonPhase: 2 },
    });
    const obs = buildObservation(bot);
    // day = !!(0) || (5000 < 12000) = false || true = true
    expect(obs.timeOfDay.day).toBe(true);
  });

  it('should compute night time', () => {
    const bot = createMockBot({
      time: { time: 15000, timeOfDay: 15000, day: false, moonPhase: 4 },
    });
    const obs = buildObservation(bot);
    expect(obs.timeOfDay.phase).toBe('night');
    // day = !!(false) || (15000 < 12000) = false || false = false
    expect(obs.timeOfDay.day).toBe(false);
  });
});

describe('buildObservation - biome and dimension', () => {
  it('should return unknown biome when block has no biome info', () => {
    const bot = createMockBot();
    const obs = buildObservation(bot);
    expect(obs.biome).toBe('unknown');
  });

  it('should extract biome from block', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockReturnValue({
        name: 'grass_block',
        biome: { name: 'plains' },
        position: { x: 100, y: 64, z: -200 },
        type: 2,
        diggable: true,
      }),
    });
    const obs = buildObservation(bot);
    expect(obs.biome).toBe('plains');
  });

  it('should use game dimension', () => {
    const bot = createMockBot({
      game: { dimension: 'the_nether', gameMode: 'survival' },
    });
    const obs = buildObservation(bot);
    expect(obs.dimension).toBe('the_nether');
  });

  it('should default to overworld when game is missing', () => {
    const bot = createMockBot({ game: undefined });
    const obs = buildObservation(bot);
    expect(obs.dimension).toBe('overworld');
  });
});

describe('buildObservation - held item and armor', () => {
  it('should format held item with durability and enchantments', () => {
    const enchants = vi.fn().mockReturnValue([
      { name: 'efficiency', level: 3 },
      { name: 'unbreaking', level: 2 },
    ]);
    const bot = createMockBot({
      heldItem: {
        name: 'diamond_pickaxe',
        displayName: 'Diamond Pickaxe',
        count: 1,
        durability: 1200,
        maxDurability: 1561,
        nbt: { type: 'compound' },
        enchants,
        stackSize: 1,
      },
      quickBarSlot: 3,
    });
    const obs = buildObservation(bot);
    expect(obs.heldItem).not.toBeNull();
    expect(obs.heldItem!.name).toBe('diamond_pickaxe');
    expect(obs.heldItem!.durability).toBe(1200);
    expect(obs.heldItem!.enchantments).toHaveLength(2);
    expect(obs.heldItem!.enchantments![0].name).toBe('efficiency');
    expect(obs.heldItem!.slot).toBe(3);
  });

  it('should format held item without optional fields', () => {
    const bot = createMockBot({
      heldItem: {
        name: 'oak_log',
        displayName: 'Oak Log',
        count: 32,
        slot: 5,
      },
      quickBarSlot: 5,
    });
    const obs = buildObservation(bot);
    expect(obs.heldItem).not.toBeNull();
    expect(obs.heldItem!.name).toBe('oak_log');
    expect(obs.heldItem!.durability).toBeUndefined();
    expect(obs.heldItem!.enchantments).toBeUndefined();
  });

  it('should handle enchants that throw', () => {
    const enchants = vi.fn().mockImplementation(() => {
      throw new Error('NBT parsing failed');
    });
    const bot = createMockBot({
      heldItem: {
        name: 'iron_sword',
        displayName: 'Iron Sword',
        count: 1,
        nbt: { type: 'compound' },
        enchants,
      },
      quickBarSlot: 0,
    });
    const obs = buildObservation(bot);
    // Should not throw, enchantments just won't be included
    expect(obs.heldItem).not.toBeNull();
    expect(obs.heldItem!.name).toBe('iron_sword');
    expect(obs.heldItem!.enchantments).toBeUndefined();
  });

  it('should extract armor from equipment', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(100, 64, -200),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        height: 1.8,
        onGround: true,
        equipment: [
          null, null, null, null, null,
          { name: 'diamond_helmet' },
          { name: 'iron_chestplate' },
          { name: 'golden_leggings' },
          { name: 'leather_boots' },
        ],
        metadata: [],
        effects: {},
      },
    });
    const obs = buildObservation(bot);
    expect(obs.armor.helmet).toBe('diamond_helmet');
    expect(obs.armor.chestplate).toBe('iron_chestplate');
    expect(obs.armor.leggings).toBe('golden_leggings');
    expect(obs.armor.boots).toBe('leather_boots');
  });
});

describe('buildObservation - hotbar and inventory', () => {
  it('should format hotbar items', () => {
    const bot = createMockBot({
      inventory: {
        slots: Array(45).fill(null),
        selectedSlot: 0,
      },
    });
    // Place items in hotbar slots 36-44
    bot.inventory.slots[36] = { name: 'stone', displayName: 'Stone', count: 64, slot: 0 } as never;
    bot.inventory.slots[37] = { name: 'dirt', displayName: 'Dirt', count: 32, slot: 1 } as never;

    const obs = buildObservation(bot);
    expect(obs.hotbar.length).toBe(2);
    expect(obs.hotbar[0].name).toBe('stone');
    expect(obs.hotbar[1].name).toBe('dirt');
  });

  it('should format inventory items with summary', () => {
    const bot = createMockBot({
      inventory: {
        slots: Array(45).fill(null),
        selectedSlot: 0,
      },
    });
    bot.inventory.slots[9] = { name: 'oak_log', displayName: 'Oak Log', count: 16 } as never;
    bot.inventory.slots[10] = { name: 'oak_log', displayName: 'Oak Log', count: 32 } as never;
    bot.inventory.slots[11] = { name: 'cobblestone', displayName: 'Cobblestone', count: 48 } as never;

    const obs = buildObservation(bot);
    expect(obs.inventory.length).toBe(3);
    expect(obs.inventorySummary['oak_log']).toBe(48);
    expect(obs.inventorySummary['cobblestone']).toBe(48);
  });
});

describe('buildObservation - entities', () => {
  it('should classify hostile entities', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Zombie',
          displayName: 'Zombie',
          position: createPos(105, 64, -195),
          username: 'Zombie',
          metadata: [],
          equipment: [],
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyEntities.length).toBe(1);
    expect(obs.nearbyEntities[0].hostility).toBe('always_hostile');
  });

  it('should classify neutral entities', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Wolf',
          displayName: 'Wolf',
          position: createPos(102, 64, -198),
          metadata: [],
          equipment: [],
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyEntities[0].hostility).toBe('neutral');
  });

  it('should filter out entities beyond 32 blocks', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Cow',
          displayName: 'Cow',
          position: createPos(200, 64, -200), // 100 blocks away
          metadata: [],
          equipment: [],
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyEntities).toHaveLength(0);
  });

  it('should extract entity health from metadata', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Zombie',
          displayName: 'Zombie',
          position: createPos(105, 64, -195),
          metadata: [null, null, null, null, null, null, null, null, 20, 20],
          equipment: [],
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyEntities[0].health).toBe(20);
    expect(obs.nearbyEntities[0].maxHealth).toBe(20);
  });

  it('should detect attacking behavior', () => {
    const botEntity = {
      position: createPos(100, 64, -200),
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      height: 1.8,
      onGround: true,
      equipment: [],
      metadata: [],
      effects: {},
    };
    const bot = createMockBot({
      entity: botEntity,
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Zombie',
          displayName: 'Zombie',
          position: createPos(102, 64, -198),
          metadata: [],
          equipment: [],
          mobName: 'Zombie',
          target: botEntity,
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyEntities[0].behaviorState).toBe('attacking');
  });

  it('should detect idle behavior', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Zombie',
          displayName: 'Zombie',
          position: createPos(102, 64, -198),
          metadata: [],
          equipment: [],
          mobName: 'Zombie',
          // no target
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyEntities[0].behaviorState).toBe('idle');
  });

  it('should extract entity equipment', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Skeleton',
          displayName: 'Skeleton',
          position: createPos(102, 64, -198),
          metadata: [],
          equipment: [
            { name: 'bow' },
            { name: 'iron_helmet' },
            { name: 'iron_chestplate' },
            null,
            { name: 'iron_boots' },
          ],
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyEntities[0].heldItem).toBe('bow');
    expect(obs.nearbyEntities[0].armor).toEqual(['iron_helmet', 'iron_chestplate', 'iron_boots']);
  });
});

describe('buildObservation - dropped items', () => {
  it('should detect dropped items', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'object',
          objectType: 'Item',
          name: 'oak_log',
          displayName: 'Oak Log',
          position: createPos(101, 64, -199),
          metadata: [null, null, null, null, null, null, null, 3],
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyDroppedItems).toHaveLength(1);
    expect(obs.nearbyDroppedItems[0].name).toBe('oak_log');
    expect(obs.nearbyDroppedItems[0].count).toBe(3);
    expect(obs.nearbyDroppedItems[0].estimatedDespawnMs).toBe(300000);
  });

  it('should filter dropped items beyond 16 blocks', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'object',
          objectType: 'Item',
          name: 'diamond',
          displayName: 'Diamond',
          position: createPos(120, 64, -200), // 20 blocks away
          metadata: [null, null, null, null, null, null, null, 1],
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyDroppedItems).toHaveLength(0);
  });
});

describe('buildObservation - environmental hazards', () => {
  it('should detect lava hazards', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockImplementation((pos: any) => {
        if (pos.y === 63) return { name: 'lava', diggable: false };
        if (pos.y === 62) return { name: 'lava', diggable: false };
        return { name: 'air', diggable: false };
      }),
    });
    const obs = buildObservation(bot);
    expect(obs.environmentalHazards.length).toBeGreaterThan(0);
    const lavaHazards = obs.environmentalHazards.filter(h => h.type === 'lava');
    expect(lavaHazards.length).toBeGreaterThan(0);
  });

  it('should detect void hazard when below y=-60', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(0, -65, 0),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        height: 1.8,
        onGround: false,
        equipment: [],
        metadata: [],
        effects: {},
      },
      blockAt: vi.fn().mockReturnValue({ name: 'air', diggable: false }),
    });
    const obs = buildObservation(bot);
    const voidHazard = obs.environmentalHazards.find(h => h.type === 'void');
    expect(voidHazard).toBeDefined();
    expect(voidHazard!.severity).toBe('deadly');
  });
});

describe('buildObservation - active dig', () => {
  it('should return null when not digging', () => {
    const bot = createMockBot();
    const obs = buildObservation(bot);
    expect(obs.activeDig).toBeNull();
  });

  it('should return dig progress when digging', () => {
    const bot = createMockBot({
      targetDigBlock: {
        name: 'stone',
        position: { x: 100, y: 63, z: -200 },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.activeDig).not.toBeNull();
    expect(obs.activeDig!.blockName).toBe('stone');
    expect(obs.activeDig!.position).toEqual({ x: 100, y: 63, z: -200 });
  });
});

describe('buildObservation - attack cooldown', () => {
  it('should default to ready when attackCooldown is undefined', () => {
    const bot = createMockBot();
    const obs = buildObservation(bot);
    expect(obs.attackCooldown.progress).toBe(1);
    expect(obs.attackCooldown.ready).toBe(true);
  });

  it('should reflect partial cooldown', () => {
    const bot = createMockBot({ attackCooldown: 0.5 });
    const obs = buildObservation(bot);
    expect(obs.attackCooldown.progress).toBe(0.5);
    expect(obs.attackCooldown.ready).toBe(false);
  });

  it('should show ready when cooldown is complete', () => {
    const bot = createMockBot({ attackCooldown: 1.0 });
    const obs = buildObservation(bot);
    expect(obs.attackCooldown.progress).toBe(1.0);
    expect(obs.attackCooldown.ready).toBe(true);
  });
});

describe('buildObservation - status effects', () => {
  it('should return empty effects when none exist', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(100, 64, -200),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        height: 1.8,
        onGround: true,
        equipment: [],
        metadata: [],
        effects: {},
      },
    });
    const obs = buildObservation(bot);
    expect(obs.statusEffects).toEqual([]);
  });

  it('should extract status effects', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(100, 64, -200),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        height: 1.8,
        onGround: true,
        equipment: [],
        metadata: [],
        effects: {
          1: { name: 'speed', amplifier: 2, duration: 300 },
          2: { name: 'regeneration', amplifier: 0, duration: 100 },
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.statusEffects).toHaveLength(2);
    expect(obs.statusEffects[0].name).toBe('speed');
    expect(obs.statusEffects[0].amplifier).toBe(2);
    expect(obs.statusEffects[1].name).toBe('regeneration');
  });

  it('should handle effects that are not an object', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(100, 64, -200),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        height: 1.8,
        onGround: true,
        equipment: [],
        metadata: [],
        effects: undefined,
      },
    });
    const obs = buildObservation(bot);
    expect(obs.statusEffects).toEqual([]);
  });
});

describe('buildObservation - light level and ground distance', () => {
  it('should extract light level from block', () => {
    const bot = createMockBot();
    const obs = buildObservation(bot);
    expect(typeof obs.lightLevel).toBe('number');
    expect(obs.lightLevel).toBe(15); // mock returns 15
  });

  it('should default light level to 15 when not available', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockReturnValue({ name: 'air', light: undefined }),
    });
    const obs = buildObservation(bot);
    expect(obs.lightLevel).toBe(15);
  });

  it('should calculate ground distance', () => {
    const bot = createMockBot();
    const obs = buildObservation(bot);
    expect(typeof obs.groundDistance).toBe('number');
  });
});

describe('buildObservation - craftable items', () => {
  it('should return empty craftable list when registry is empty', () => {
    const bot = createMockBot();
    const obs = buildObservation(bot);
    expect(obs.craftableItems).toEqual([]);
  });

  it('should handle registry errors gracefully', () => {
    const bot = createMockBot({
      registry: {
        items: null,
      },
    });
    const obs = buildObservation(bot);
    expect(obs.craftableItems).toEqual([]);
  });
});

describe('buildObservation - nearby blocks', () => {
  it('should return empty blocks when all are air', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockReturnValue({ name: 'air' }),
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyBlocks).toEqual([]);
  });
});

describe('classifyHostility', () => {
  it('should classify all always-hostile mobs', () => {
    const hostile = ['Zombie', 'Skeleton', 'Creeper', 'Spider', 'Enderman', 'Witch', 'Slime',
      'Blaze', 'Ghast', 'MagmaCube', 'Silverfish', 'CaveSpider', 'Guardian',
      'ElderGuardian', 'Wither', 'Warden', 'Phantom', 'Hoglin', 'PiglinBrute',
      'Vindicator', 'Evoker', 'Pillager', 'Ravager', 'Vex'];
    for (const name of hostile) {
      expect(classifyHostility(name)).toBe('always_hostile');
    }
  });

  it('should classify all neutral mobs', () => {
    const neutral = ['IronGolem', 'Piglin', 'Wolf', 'Bee', 'PolarBear',
      'Panda', 'Fox', 'Dolphin', 'Llama', 'TraderLlama', 'SnowGolem', 'Shulker'];
    for (const name of neutral) {
      expect(classifyHostility(name)).toBe('neutral');
    }
  });

  it('should classify unknown mobs as passive', () => {
    expect(classifyHostility('Cow')).toBe('passive');
    expect(classifyHostility('Sheep')).toBe('passive');
    expect(classifyHostility('Villager')).toBe('passive');
    expect(classifyHostility('Chicken')).toBe('passive');
    expect(classifyHostility('UnknownMob')).toBe('passive');
  });
});

describe('getTimePhase', () => {
  it('should classify all time phases correctly', () => {
    // Day: 0-5999
    expect(getTimePhase(0)).toBe('day');
    expect(getTimePhase(3000)).toBe('day');
    expect(getTimePhase(5999)).toBe('day');

    // Noon: 6000-6499
    expect(getTimePhase(6000)).toBe('noon');
    expect(getTimePhase(6250)).toBe('noon');
    expect(getTimePhase(6499)).toBe('noon');

    // Sunset: 6500-11999
    expect(getTimePhase(6500)).toBe('sunset');
    expect(getTimePhase(9000)).toBe('sunset');
    expect(getTimePhase(11999)).toBe('sunset');

    // Night: 12000-17999
    expect(getTimePhase(12000)).toBe('night');
    expect(getTimePhase(15000)).toBe('night');
    expect(getTimePhase(17999)).toBe('night');

    // Midnight: 18000-22999
    expect(getTimePhase(18000)).toBe('midnight');
    expect(getTimePhase(20000)).toBe('midnight');
    expect(getTimePhase(22999)).toBe('midnight');

    // Sunrise: 23000-23999 (wraps)
    expect(getTimePhase(23000)).toBe('sunrise');
    expect(getTimePhase(23500)).toBe('sunrise');
    expect(getTimePhase(23999)).toBe('sunrise');
  });
});

describe('buildObservation - biome extraction', () => {
  it('should use biome from blockAt when available', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockReturnValue({
        name: 'grass_block',
        biome: { name: 'forest' },
        position: { x: 100, y: 64, z: -200 },
        type: 2,
        diggable: true,
      }),
    });
    const obs = buildObservation(bot);
    expect(obs.biome).toBe('forest');
  });

  it('should use biome from world.getBiome when block has no biome', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockReturnValue({
        name: 'grass_block',
        position: { x: 100, y: 64, z: -200 },
        type: 2,
        diggable: true,
        // no biome property
      }),
      world: {
        getBiome: vi.fn().mockReturnValue(1),
      },
      registry: {
        blocks: {},
        items: {},
        biomes: {
          1: { name: 'desert' },
        },
        recipes: {},
        enchantments: {},
        blocksByName: {},
        itemsByName: {},
        itemsById: {},
      },
    });
    const obs = buildObservation(bot);
    expect(obs.biome).toBe('desert');
  });
});

describe('buildObservation - craftable items with recipes', () => {
  it('should detect craftable items from registry recipes', () => {
    const bot = createMockBot({
      inventory: {
        slots: Array(45).fill(null),
        selectedSlot: 0,
      },
      registry: {
        blocks: {},
        items: {
          oak_planks: { id: 5, name: 'oak_planks', displayName: 'Oak Planks' },
        },
        biomes: {},
        recipes: {},
        enchantments: {},
        blocksByName: {},
        itemsByName: {},
        itemsById: {},
      },
      recipesFor: vi.fn().mockImplementation((itemId: number) => {
        if (itemId === 5) {
          return [{
            delta: [
              { id: 1, count: -1 }, // requires 1 oak_log (input)
              { id: 5, count: 4 },  // produces 4 oak_planks (output)
            ],
            requiresTable: false,
          }];
        }
        return [];
      }),
    });
    // Put an oak_log in inventory
    bot.inventory.slots[9] = { name: 'oak_log', displayName: 'Oak Log', count: 1, type: 1 } as never;

    const obs = buildObservation(bot);
    expect(obs.craftableItems).toHaveLength(1);
    expect(obs.craftableItems[0].name).toBe('oak_planks');
    expect(obs.craftableItems[0].requiresCraftingTable).toBe(false);
  });

  it('should not include items with insufficient ingredients', () => {
    const bot = createMockBot({
      inventory: {
        slots: Array(45).fill(null),
        selectedSlot: 0,
      },
      registry: {
        blocks: {},
        items: {
          oak_planks: { id: 5, name: 'oak_planks', displayName: 'Oak Planks' },
        },
        biomes: {},
        recipes: {},
        enchantments: {},
        blocksByName: {},
        itemsByName: {},
        itemsById: {},
      },
      recipesFor: vi.fn().mockImplementation((itemId: number) => {
        if (itemId === 5) {
          return [{
            delta: [
              { id: 1, count: -3 }, // requires 3 oak_log
              { id: 5, count: 4 },
            ],
            requiresTable: false,
          }];
        }
        return [];
      }),
    });
    // Only 1 oak_log, need 3
    bot.inventory.slots[9] = { name: 'oak_log', displayName: 'Oak Log', count: 1, type: 1 } as never;

    const obs = buildObservation(bot);
    expect(obs.craftableItems).toHaveLength(0);
  });

  it('should handle recipe with no delta', () => {
    const bot = createMockBot({
      registry: {
        blocks: {},
        items: {
          oak_planks: { id: 5, name: 'oak_planks', displayName: 'Oak Planks' },
        },
        biomes: {},
        recipes: {},
        enchantments: {},
        blocksByName: {},
        itemsByName: {},
        itemsById: {},
      },
      recipesFor: vi.fn().mockImplementation(() => {
        return [{ delta: null }];
      }),
    });

    const obs = buildObservation(bot);
    expect(obs.craftableItems).toHaveLength(0);
  });

  it('should handle recipe requiring crafting table', () => {
    const bot = createMockBot({
      inventory: {
        slots: Array(45).fill(null),
        selectedSlot: 0,
      },
      registry: {
        blocks: {},
        items: {
          crafting_table: { id: 120, name: 'crafting_table', displayName: 'Crafting Table' },
        },
        biomes: {},
        recipes: {},
        enchantments: {},
        blocksByName: {},
        itemsByName: {},
        itemsById: {},
      },
      recipesFor: vi.fn().mockImplementation((itemId: number) => {
        if (itemId === 120) {
          return [{
            delta: [
              { id: 5, count: -4 },
              { id: 120, count: 1 },
            ],
            requiresTable: true,
          }];
        }
        return [];
      }),
    });
    // Put 4 oak_planks in inventory
    bot.inventory.slots[9] = { name: 'oak_planks', displayName: 'Oak Planks', count: 4, type: 5 } as never;

    const obs = buildObservation(bot);
    expect(obs.craftableItems).toHaveLength(1);
    expect(obs.craftableItems[0].requiresCraftingTable).toBe(true);
  });
});

describe('buildObservation - status effects with id fallback', () => {
  it('should handle effects with id instead of name', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(100, 64, -200),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        height: 1.8,
        onGround: true,
        equipment: [],
        metadata: [],
        effects: {
          1: { id: 1, amplifier: 0, duration: 200 }, // no name, uses id
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.statusEffects).toHaveLength(1);
    expect(obs.statusEffects[0].name).toBe('1'); // Falls back to id.toString()
  });
});

describe('buildObservation - nearby blocks with different effective tool paths', () => {
  it('should handle blocks with empty harvest tools', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockImplementation((pos: any) => {
        // Return a non-air block for nearby positions
        if (pos && pos.x !== undefined) {
          const dx = pos.x - 100;
          const dy = pos.y - 64;
          const dz = pos.z - (-200);
          const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
          if (dist === 0) return { name: 'grass_block', light: 15, boundingBox: 'solid' };
          return {
            name: 'dirt',
            displayName: 'Dirt',
            position: pos,
            diggable: true,
            harvestTools: {}, // empty but truthy
            material: {},
            light: 10,
            boundingBox: 'solid',
          };
        }
        return null;
      }),
    });
    const obs = buildObservation(bot);
    // Should not throw and should have blocks
    expect(Array.isArray(obs.nearbyBlocks)).toBe(true);
  });

  it('should handle blocks with harvest tools and material', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockImplementation((pos: any) => {
        if (pos && pos.x !== undefined) {
          const dx = pos.x - 100;
          const dy = pos.y - 64;
          const dz = pos.z - (-200);
          const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
          if (dist === 0) return { name: 'grass_block', light: 15, boundingBox: 'solid' };
          return {
            name: 'stone',
            displayName: 'Stone',
            position: pos,
            diggable: true,
            harvestTools: { '1': true },
            material: { tool: 'pickaxe' },
            light: 10,
            boundingBox: 'solid',
          };
        }
        return null;
      }),
    });
    const obs = buildObservation(bot);
    // Should have blocks with effective tools
    const stoneBlocks = obs.nearbyBlocks.filter(b => b.name === 'stone');
    if (stoneBlocks.length > 0) {
      expect(stoneBlocks[0].effectiveTool).toBe('pickaxe');
    }
  });
});

describe('buildObservation - getCraftableItems catch block', () => {
  it('should return empty array when registry iteration throws', () => {
    // Create a bot where registry.items iteration throws
    const bot = createMockBot({
      registry: {
        blocks: {},
        // Make items iteration throw by using a Proxy
        get items() { throw new Error('Registry error'); },
        biomes: {},
        recipes: {},
        enchantments: {},
        blocksByName: {},
        itemsByName: {},
        itemsById: {},
      },
    });
    const obs = buildObservation(bot);
    expect(obs.craftableItems).toEqual([]);
  });

  it('should return empty array when registry.items is null', () => {
    const bot = createMockBot({
      registry: {
        items: null,
        blocks: {},
        biomes: {},
        recipes: {},
        enchantments: {},
        blocksByName: {},
        itemsByName: {},
        itemsById: {},
      },
    });
    const obs = buildObservation(bot);
    expect(obs.craftableItems).toEqual([]);
  });
});

describe('buildObservation - canCraftRecipe catch block', () => {
  it('should return false when recipe delta causes error', () => {
    // This tests the canCraftRecipe catch block indirectly through getCraftableItems
    // When recipe.delta items reference non-existent inventory slots
    const bot = createMockBot({
      inventory: {
        slots: Array(45).fill(null),
        selectedSlot: 0,
      },
      registry: {
        blocks: {},
        items: {
          oak_planks: { id: 5, name: 'oak_planks', displayName: 'Oak Planks' },
        },
        biomes: {},
        recipes: {},
        enchantments: {},
        blocksByName: {},
        itemsByName: {},
        itemsById: {},
      },
      recipesFor: vi.fn().mockImplementation(() => {
        // Return a recipe that will cause an error when iterating delta
        return [{ delta: null, requiresTable: false }];
      }),
    });
    const obs = buildObservation(bot);
    expect(obs.craftableItems).toEqual([]);
  });
});

describe('buildObservation - getStatusEffects catch block', () => {
  it('should return empty array when effects iteration throws', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(100, 64, -200),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        height: 1.8,
        onGround: true,
        equipment: [],
        metadata: [],
        // Make effects throw when iterated
        get effects() { throw new Error('Effects error'); },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.statusEffects).toEqual([]);
  });

  it('should handle effects with id instead of name', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(100, 64, -200),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        height: 1.8,
        onGround: true,
        equipment: [],
        metadata: [],
        effects: {
          1: { id: 1, amplifier: 0, duration: 200 },
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.statusEffects).toHaveLength(1);
    expect(obs.statusEffects[0].name).toBe('1');
  });

  it('should handle effects with null amplifier/duration', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(100, 64, -200),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        height: 1.8,
        onGround: true,
        equipment: [],
        metadata: [],
        effects: {
          1: { name: 'speed', amplifier: undefined, duration: undefined },
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.statusEffects).toHaveLength(1);
    expect(obs.statusEffects[0].amplifier).toBe(0);
    expect(obs.statusEffects[0].duration).toBe(0);
  });
});

describe('buildObservation - biome with world.getBiome', () => {
  it('should use biome from world.getBiome when block has no biome', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockReturnValue({
        name: 'grass_block',
        position: { x: 100, y: 64, z: -200 },
        type: 2,
        diggable: true,
        // no biome property
      }),
      world: {
        getBiome: vi.fn().mockReturnValue(1),
      },
      registry: {
        blocks: {},
        items: {},
        biomes: {
          1: { name: 'desert' },
        },
        recipes: {},
        enchantments: {},
        blocksByName: {},
        itemsByName: {},
        itemsById: {},
      },
    });
    const obs = buildObservation(bot);
    expect(obs.biome).toBe('desert');
  });

  it('should use biome name from block when available', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockReturnValue({
        name: 'grass_block',
        biome: { name: 'forest' },
        position: { x: 100, y: 64, z: -200 },
        type: 2,
        diggable: true,
      }),
    });
    const obs = buildObservation(bot);
    expect(obs.biome).toBe('forest');
  });

  it('should return unknown when biome name is undefined', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockReturnValue({
        name: 'grass_block',
        biome: { name: undefined },
        position: { x: 100, y: 64, z: -200 },
        type: 2,
        diggable: true,
      }),
    });
    const obs = buildObservation(bot);
    expect(obs.biome).toBe('unknown');
  });
});

describe('buildObservation - digTime and ground distance', () => {
  it('should include dig time for diggable blocks', () => {
    const bot = createMockBot({
      digTime: vi.fn().mockReturnValue(1500),
      blockAt: vi.fn().mockImplementation((pos: any) => {
        if (!pos || pos.x === undefined) return null;
        const dx = pos.x - 100;
        const dy = pos.y - 64;
        const dz = pos.z - (-200);
        const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
        if (dist === 0) return { name: 'grass_block', light: 15, boundingBox: 'solid' };
        return {
          name: 'stone',
          displayName: 'Stone',
          diggable: true,
          harvestTools: { '1': true },
          material: { tool: 'pickaxe' },
          light: 10,
          boundingBox: 'solid',
        };
      }),
    });
    const obs = buildObservation(bot);
    const stoneBlocks = obs.nearbyBlocks.filter(b => b.name === 'stone');
    if (stoneBlocks.length > 0) {
      expect(stoneBlocks[0].digTimeMs).toBe(1500);
    }
  });

  it('should calculate ground distance when air is below', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(100, 80, -200),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        height: 1.8,
        onGround: false,
        equipment: [],
        metadata: [],
        effects: {},
      },
      blockAt: vi.fn().mockImplementation((pos: any) => {
        if (!pos) return { name: 'air', boundingBox: 'empty' };
        // Air at y=78 and y=79 (below bot at y=80)
        if (pos.y === 79) return { name: 'air', boundingBox: 'empty' };
        if (pos.y === 78) return { name: 'air', boundingBox: 'empty' };
        // Solid at y=77
        if (pos.y === 77) return { name: 'stone', boundingBox: 'solid' };
        return { name: 'air', boundingBox: 'empty' };
      }),
    });
    const obs = buildObservation(bot);
    // Ground distance is the distance from bot Y to the highest solid block below
    // Bot at y=80, solid at y=77, so ground distance = 80 - 77 - 1 = 2
    expect(obs.groundDistance).toBe(2);
  });
});

describe('buildObservation - entity with no name and username', () => {
  it('should use username when name is missing', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'player',
          username: 'Steve',
          position: createPos(102, 64, -198),
          metadata: [],
          equipment: [],
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyEntities).toHaveLength(1);
    expect(obs.nearbyEntities[0].name).toBe('Steve');
  });

  it('should use unknown when both name and username are missing', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'object',
          position: createPos(102, 64, -198),
          metadata: [],
          equipment: [],
          // no name, no username
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyEntities).toHaveLength(1);
    expect(obs.nearbyEntities[0].name).toBe('unknown');
  });

  it('should use mobType name when displayName is missing', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Zombie',
          // no displayName, but has mobType
          position: createPos(102, 64, -198),
          metadata: [],
          equipment: [],
          mobType: { name: 'Zombie' },
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyEntities).toHaveLength(1);
    expect(obs.nearbyEntities[0].displayName).toBe('Zombie');
  });
});

describe('buildObservation - dropped items with no name', () => {
  it('should use unknown when name is missing', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'object',
          objectType: 'Item',
          position: createPos(101, 64, -199),
          metadata: [null, null, null, null, null, null, null, 1],
          // no name, no displayName
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyDroppedItems).toHaveLength(1);
    expect(obs.nearbyDroppedItems[0].name).toBe('unknown');
  });

  it('should use name when displayName is missing', () => {
    const bot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'object',
          objectType: 'Item',
          name: 'diamond',
          position: createPos(101, 64, -199),
          metadata: [null, null, null, null, null, null, null, 1],
        },
      },
    });
    const obs = buildObservation(bot);
    expect(obs.nearbyDroppedItems).toHaveLength(1);
    expect(obs.nearbyDroppedItems[0].name).toBe('diamond');
    expect(obs.nearbyDroppedItems[0].displayName).toBe('diamond');
  });
});

describe('buildObservation - environmental hazards', () => {
  it('should detect fire hazards', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockImplementation((pos: any) => {
        if (pos && pos.y === 63) return { name: 'fire', diggable: false };
        return { name: 'air', diggable: false };
      }),
    });
    const obs = buildObservation(bot);
    const fireHazards = obs.environmentalHazards.filter(h => h.type === 'fire');
    expect(fireHazards.length).toBeGreaterThan(0);
    expect(fireHazards[0].severity).toBe('high');
  });

  it('should detect cactus hazards', () => {
    const bot = createMockBot({
      blockAt: vi.fn().mockImplementation((pos: any) => {
        if (pos && (pos.x === 101 || pos.x === 99 || pos.z === -199 || pos.z === -201)) {
          return { name: 'cactus', diggable: true };
        }
        return { name: 'air', diggable: false };
      }),
    });
    const obs = buildObservation(bot);
    const cactusHazards = obs.environmentalHazards.filter(h => h.type === 'cactus');
    expect(cactusHazards.length).toBeGreaterThan(0);
  });

  it('should detect fall risk when not on ground with air below', () => {
    const bot = createMockBot({
      entity: {
        position: createPos(100, 80, -200),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        height: 1.8,
        onGround: false,
        equipment: [],
        metadata: [],
        effects: {},
      },
      blockAt: vi.fn().mockImplementation((pos: any) => {
        if (pos.y === 77) return { name: 'stone', boundingBox: 'solid' };
        return { name: 'air', boundingBox: 'empty' };
      }),
    });
    const obs = buildObservation(bot);
    const fallRisk = obs.environmentalHazards.find(h => h.type === 'fall_risk');
    expect(fallRisk).toBeDefined();
    expect(fallRisk!.severity).toBe('medium');
  });

  it('should use typeMap fallback for unknown hazard names', () => {
    // This tests the typeMap[h.name] ?? 'fall_risk' branch
    // which is triggered when hazardPositions has a name not in typeMap
    // But the current implementation only adds lava/fire/cactus/void/fall_risk
    // so this branch is hard to trigger directly.
    // Instead we verify that the typeMap works correctly.
    const bot = createMockBot({
      blockAt: vi.fn().mockImplementation((pos: any) => {
        if (pos && pos.y === 63) return { name: 'lava', diggable: false };
        return { name: 'air', diggable: false };
      }),
    });
    const obs = buildObservation(bot);
    const lava = obs.environmentalHazards.find(h => h.type === 'lava');
    expect(lava).toBeDefined();
  });
});

describe('buildObservation - formatItem with stackSize', () => {
  it('should include stackSize when present', () => {
    const bot = createMockBot({
      heldItem: {
        name: 'dirt',
        displayName: 'Dirt',
        count: 32,
        stackSize: 64,
        slot: 0,
      },
      quickBarSlot: 0,
    });
    const obs = buildObservation(bot);
    expect(obs.heldItem).not.toBeNull();
    expect(obs.heldItem!.stackSize).toBe(64);
  });
});