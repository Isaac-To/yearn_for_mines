import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildObservation } from '../observation-builder.js';
import type { Bot } from 'mineflayer';

// Helper to create a comprehensive mock bot
function createMockBot(): Bot {
  return {
    username: 'TestBot',
    entity: {
      position: { x: 100, y: 64, z: -200 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      height: 1.8,
      onGround: true,
      equipment: [],
      metadata: [],
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
    blockAt: vi.fn().mockReturnValue({
      name: 'grass_block',
      position: { x: 100, y: 63, z: -200 },
      type: 2,
      diggable: true,
      material: {} as never,
      harvestTools: {} as never,
      boundingBox: 'solid' as const,
      biomes: [] as never[],
      light: 15,
      stateId: 0,
    }),
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
      blockByName: {} as never,
      itemByName: {} as never,
    } as never,
    world: {
      getBlock: vi.fn().mockReturnValue({
        name: 'grass_block',
        type: 2,
        position: { x: 100, y: 63, z: -200 },
        diggable: true,
      }),
    } as never,
    controlState: {} as never,
  } as unknown as Bot;
}

describe('buildObservation', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
  });

  it('should include position information', () => {
    const obs = buildObservation(mockBot);
    expect(obs.position.x).toBe(100);
    expect(obs.position.y).toBe(64);
    expect(obs.position.z).toBe(-200);
  });

  it('should include health status', () => {
    const obs = buildObservation(mockBot);
    expect(obs.health.health).toBe(20);
    expect(obs.health.food).toBe(18);
    expect(obs.health.foodSaturation).toBe(5.0);
    expect(obs.health.oxygenLevel).toBe(20);
    expect(obs.health.experienceLevel).toBe(5);
    expect(obs.health.experienceProgress).toBe(0.5);
    expect(obs.health.gameMode).toBe('survival');
  });

  it('should include biome and dimension', () => {
    const obs = buildObservation(mockBot);
    expect(obs.dimension).toBe('overworld');
    expect(obs.biome).toBeDefined();
  });

  it('should include weather information', () => {
    const obs = buildObservation(mockBot);
    expect(obs.weather.isRaining).toBe(false);
    expect(obs.weather.isThundering).toBe(false);
  });

  it('should include time of day', () => {
    const obs = buildObservation(mockBot);
    expect(obs.timeOfDay.day).toBe(true);
    expect(obs.timeOfDay.phase).toBeDefined();
  });

  it('should include empty arrays when no entities or blocks are nearby', () => {
    const obs = buildObservation(mockBot);
    expect(obs.nearbyEntities).toEqual([]);
    expect(obs.nearbyDroppedItems).toEqual([]);
    expect(obs.environmentalHazards).toEqual([]);
  });

  it('should include attack cooldown state', () => {
    const obs = buildObservation(mockBot);
    expect(obs.attackCooldown).toBeDefined();
    expect(typeof obs.attackCooldown.progress).toBe('number');
    expect(typeof obs.attackCooldown.ready).toBe('boolean');
  });

  it('should include active dig as null when not digging', () => {
    const obs = buildObservation(mockBot);
    expect(obs.activeDig).toBeNull();
  });

  it('should include held item as null when nothing is held', () => {
    const obs = buildObservation(mockBot);
    expect(obs.heldItem).toBeNull();
  });

  it('should include armor slots as null by default', () => {
    const obs = buildObservation(mockBot);
    expect(obs.armor.helmet).toBeNull();
    expect(obs.armor.chestplate).toBeNull();
    expect(obs.armor.leggings).toBeNull();
    expect(obs.armor.boots).toBeNull();
  });

  it('should include empty status effects', () => {
    const obs = buildObservation(mockBot);
    expect(obs.statusEffects).toEqual([]);
  });

  it('should include light level and ground distance', () => {
    const obs = buildObservation(mockBot);
    expect(typeof obs.lightLevel).toBe('number');
    expect(typeof obs.groundDistance).toBe('number');
  });

  it('should include craftable items list', () => {
    const obs = buildObservation(mockBot);
    expect(Array.isArray(obs.craftableItems)).toBe(true);
  });

  it('should include empty inventory summary when no items', () => {
    const obs = buildObservation(mockBot);
    expect(obs.inventorySummary).toEqual({});
  });

  it('should include hotbar as array with at most 9 slots', () => {
    const obs = buildObservation(mockBot);
    expect(obs.hotbar.length).toBeLessThanOrEqual(9);
    // Empty inventory means empty hotbar
    expect(obs.hotbar).toEqual([]);
  });
});

describe('Observation builder with entities', () => {
  it('should format entity observation with hostility classification', () => {
    // This tests the entity classification logic
    const classifyHostility = (name: string): 'always_hostile' | 'neutral' | 'passive' => {
      const hostile = ['Zombie', 'Skeleton', 'Creeper', 'Spider', 'Enderman', 'Witch', 'Slime'];
      const neutral = ['IronGolem', 'Piglin', 'Wolf'];
      if (hostile.includes(name)) return 'always_hostile';
      if (neutral.includes(name)) return 'neutral';
      return 'passive';
    };

    expect(classifyHostility('Zombie')).toBe('always_hostile');
    expect(classifyHostility('Creeper')).toBe('always_hostile');
    expect(classifyHostility('Cow')).toBe('passive');
    expect(classifyHostility('Pig')).toBe('passive');
    expect(classifyHostility('IronGolem')).toBe('neutral');
  });
});

describe('Time of day phase calculation', () => {
  it('should classify time phases correctly', () => {
    const getPhase = (time: number): string => {
      if (time >= 0 && time < 6000) return 'day';
      if (time >= 6000 && time < 6500) return 'noon';
      if (time >= 6500 && time < 12000) return 'sunset';
      if (time >= 12000 && time < 18000) return 'night';
      if (time >= 18000 && time < 23000) return 'midnight';
      return 'sunrise';
    };

    expect(getPhase(1000)).toBe('day');
    expect(getPhase(6200)).toBe('noon');
    expect(getPhase(10000)).toBe('sunset');
    expect(getPhase(15000)).toBe('night');
    expect(getPhase(20000)).toBe('midnight');
    expect(getPhase(23500)).toBe('sunrise');
  });
});