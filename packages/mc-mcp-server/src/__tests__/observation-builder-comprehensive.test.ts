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