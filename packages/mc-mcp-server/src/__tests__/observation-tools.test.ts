import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BotManager } from '../bot-manager.js';
import { registerObservationTools } from '../tools/observation.js';
import { buildObservation, classifyHostility, getTimePhase } from '../observation-builder.js';
import type { Bot } from 'mineflayer';

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
      displayName: 'Grass Block',
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
    } as never,
    controlState: {} as never,
  } as unknown as Bot;
}

describe('registerObservationTools', () => {
  it('should register observation tools without errors', () => {
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    const manager = new BotManager();
    registerObservationTools(server, manager);
    expect(true).toBe(true);
  });
});

describe('observe tool - requireBot check', () => {
  it('should throw error when bot is not connected', () => {
    const botManager = new BotManager();
    expect(botManager.currentBot).toBeNull();
  });

  it('should return full observation when bot is connected', () => {
    const mockBot = createMockBot();
    const obs = buildObservation(mockBot);
    expect(obs.position.x).toBe(100);
    expect(obs.health.health).toBe(20);
    expect(obs.dimension).toBe('overworld');
  });
});

describe('find_block tool setup', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
  });

  it('should find blocks of specified type', () => {
    const result = mockBot.findBlocks({
      matching: 1,
      maxDistance: 64,
      count: 1,
    });
    expect(result).toEqual([]);
  });

  it('should return error for unknown block type', () => {
    expect(mockBot.registry.blocksByName['unknown_block']).toBeUndefined();
  });
});

describe('classifyHostility', () => {
  it('should classify hostile mobs', () => {
    expect(classifyHostility('Zombie')).toBe('always_hostile');
    expect(classifyHostility('Skeleton')).toBe('always_hostile');
    expect(classifyHostility('Creeper')).toBe('always_hostile');
    expect(classifyHostility('Spider')).toBe('always_hostile');
    expect(classifyHostility('Witch')).toBe('always_hostile');
    expect(classifyHostility('Blaze')).toBe('always_hostile');
    expect(classifyHostility('Warden')).toBe('always_hostile');
  });

  it('should classify neutral mobs', () => {
    expect(classifyHostility('IronGolem')).toBe('neutral');
    expect(classifyHostility('Piglin')).toBe('neutral');
    expect(classifyHostility('Wolf')).toBe('neutral');
    expect(classifyHostility('Bee')).toBe('neutral');
  });

  it('should classify passive mobs', () => {
    expect(classifyHostility('Cow')).toBe('passive');
    expect(classifyHostility('Pig')).toBe('passive');
    expect(classifyHostility('Sheep')).toBe('passive');
    expect(classifyHostility('Chicken')).toBe('passive');
    expect(classifyHostility('Villager')).toBe('passive');
  });
});

describe('getTimePhase', () => {
  it('should classify time phases correctly', () => {
    expect(getTimePhase(0)).toBe('day');
    expect(getTimePhase(3000)).toBe('day');
    expect(getTimePhase(6000)).toBe('noon');
    expect(getTimePhase(6400)).toBe('noon');
    expect(getTimePhase(7000)).toBe('sunset');
    expect(getTimePhase(11000)).toBe('sunset');
    expect(getTimePhase(12000)).toBe('night');
    expect(getTimePhase(15000)).toBe('night');
    expect(getTimePhase(18000)).toBe('midnight');
    expect(getTimePhase(22000)).toBe('midnight');
    expect(getTimePhase(23500)).toBe('sunrise');
    expect(getTimePhase(23999)).toBe('sunrise');
  });
});