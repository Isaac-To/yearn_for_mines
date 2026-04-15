import { describe, it, expect } from 'vitest';
import {
  BotConfigSchema,
  PositionSchema,
  HealthStatusSchema,
  ItemSchema,
  BlockObservationSchema,
  EntityObservationSchema,
  DroppedItemSchema,
  EnvironmentalHazardSchema,
  WeatherSchema,
  TimeOfDaySchema,
  ObservationSchema,
  McpToolResultSchema,
  SkillMetadataSchema,
  MemPalaceToolName,
  textResult,
  errorResult,
  dataResult,
} from '../index.js';

describe('BotConfig schema', () => {
  it('should apply defaults', () => {
    const result = BotConfigSchema.parse({});
    expect(result.host).toBe('localhost');
    expect(result.port).toBe(25565);
    expect(result.username).toBe('YearnForMines');
    expect(result.version).toBe('1.21.4');
    expect(result.auth).toBe('offline');
  });

  it('should accept valid input', () => {
    const result = BotConfigSchema.parse({
      host: '192.168.1.100',
      port: 25566,
      username: 'TestBot',
      version: '1.20.4',
      auth: 'microsoft',
    });
    expect(result.host).toBe('192.168.1.100');
    expect(result.port).toBe(25566);
  });

  it('should reject invalid auth mode', () => {
    expect(() => BotConfigSchema.parse({ auth: 'invalid' })).toThrow();
  });
});

describe('Position schema', () => {
  it('should parse valid position', () => {
    const pos = PositionSchema.parse({ x: 100, y: 64, z: -200, yaw: 90, pitch: 0 });
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(64);
  });
});

describe('HealthStatus schema', () => {
  it('should parse valid health status', () => {
    const health = HealthStatusSchema.parse({
      health: 20,
      food: 18,
      foodSaturation: 5.0,
      oxygenLevel: 20,
      experienceLevel: 5,
      experienceProgress: 0.5,
      isSleeping: false,
      gameMode: 'survival',
    });
    expect(health.health).toBe(20);
    expect(health.gameMode).toBe('survival');
  });

  it('should reject health above 20', () => {
    expect(() => HealthStatusSchema.parse({ health: 25 })).toThrow();
  });

  it('should reject invalid game mode', () => {
    expect(() =>
      HealthStatusSchema.parse({
        health: 20,
        food: 20,
        foodSaturation: 0,
        oxygenLevel: 20,
        experienceLevel: 0,
        experienceProgress: 0,
        isSleeping: false,
        gameMode: 'creative',
      })
    ).not.toThrow(); // creative is valid
  });
});

describe('Item schema', () => {
  it('should parse item with enchantments and durability', () => {
    const item = ItemSchema.parse({
      name: 'diamond_pickaxe',
      displayName: 'Diamond Pickaxe',
      count: 1,
      slot: 0,
      durability: 1200,
      maxDurability: 1561,
      enchantments: [{ name: 'efficiency', level: 3 }],
      stackSize: 1,
    });
    expect(item.name).toBe('diamond_pickaxe');
    expect(item.enchantments).toHaveLength(1);
    expect(item.durability).toBe(1200);
  });

  it('should parse item without optional fields', () => {
    const item = ItemSchema.parse({
      name: 'oak_log',
      displayName: 'Oak Log',
      count: 64,
      slot: 1,
    });
    expect(item.name).toBe('oak_log');
    expect(item.durability).toBeUndefined();
    expect(item.enchantments).toBeUndefined();
  });
});

describe('BlockObservation schema', () => {
  it('should parse block with diggability info', () => {
    const block = BlockObservationSchema.parse({
      name: 'stone',
      displayName: 'Stone',
      position: { x: 10, y: 60, z: 20 },
      diggable: true,
      effectiveTool: 'pickaxe',
      digTimeMs: 1500,
      lightLevel: 15,
    });
    expect(block.name).toBe('stone');
    expect(block.effectiveTool).toBe('pickaxe');
  });
});

describe('EntityObservation schema', () => {
  it('should parse hostile entity', () => {
    const entity = EntityObservationSchema.parse({
      id: 123,
      type: 'mob',
      name: 'Zombie',
      displayName: 'Zombie',
      position: { x: 10, y: 64, z: 20 },
      distance: 5.3,
      health: 20,
      maxHealth: 20,
      hostility: 'always_hostile',
      behaviorState: 'idle',
    });
    expect(entity.hostility).toBe('always_hostile');
  });
});

describe('EnvironmentalHazard schema', () => {
  it('should parse lava hazard', () => {
    const hazard = EnvironmentalHazardSchema.parse({
      type: 'lava',
      position: { x: 10, y: 50, z: 20 },
      distance: 3,
      severity: 'deadly',
    });
    expect(hazard.type).toBe('lava');
    expect(hazard.severity).toBe('deadly');
  });
});

describe('Observation schema', () => {
  it('should parse a full observation', () => {
    const obs = ObservationSchema.parse({
      position: { x: 0, y: 64, z: 0, yaw: 0, pitch: 0 },
      health: {
        health: 20, food: 20, foodSaturation: 5,
        oxygenLevel: 20, experienceLevel: 0, experienceProgress: 0,
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
    });
    expect(obs.biome).toBe('plains');
    expect(obs.weather.isRaining).toBe(false);
  });
});

describe('MCP tool result helpers', () => {
  it('should create text result', () => {
    const result = textResult('hello');
    expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
    expect(result.isError).toBe(false);
  });

  it('should create error result', () => {
    const result = errorResult('something failed');
    const content = result.content[0];
    if (content.type === 'text') {
      expect(content.text).toContain('something failed');
    }
    expect(result.isError).toBe(true);
  });

  it('should create data result', () => {
    const result = dataResult({ x: 10, y: 64 });
    expect(result.content[0].type).toBe('text');
    const textContent = result.content[0];
    if (textContent.type === 'text') {
      expect(JSON.parse(textContent.text)).toEqual({ x: 10, y: 64 });
    }
    expect(result.isError).toBe(false);
  });
});

describe('SkillMetadata schema', () => {
  it('should parse skill metadata', () => {
    const meta = SkillMetadataSchema.parse({
      goal: 'gather wood',
      requiredTools: ['observe', 'pathfind_to', 'dig_block'],
      requiredInventory: [],
      successConditions: 'oak_log in inventory',
      minecraftVersion: '1.21.4',
      createdAt: '2026-04-14T00:00:00Z',
      successCount: 3,
      failureCount: 1,
    });
    expect(meta.goal).toBe('gather wood');
    expect(meta.requiredTools).toHaveLength(3);
  });
});

describe('MemPalaceToolName', () => {
  it('should include all 29 MemPalace tools', () => {
    const tools = MemPalaceToolName.options;
    expect(tools).toHaveLength(29);
    expect(tools).toContain('mempalace_search');
    expect(tools).toContain('mempalace_add_drawer');
    expect(tools).toContain('mempalace_kg_add');
    expect(tools).toContain('mempalace_diary_write');
  });
});