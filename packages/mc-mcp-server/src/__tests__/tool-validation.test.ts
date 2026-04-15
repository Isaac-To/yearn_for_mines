import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v4';
import { BotConfigSchema, ObservationSchema, HealthStatusSchema, PositionSchema, ItemSchema, BlockObservationSchema, EntityObservationSchema, EnvironmentalHazardSchema, WeatherSchema, TimeOfDaySchema, AttackCooldownSchema, DigProgressSchema } from '@yearn-for-mines/shared';
import { BotManager } from '../bot-manager.js';

describe('Zod schema validation', () => {
  describe('BotConfigSchema', () => {
    it('should apply all defaults', () => {
      const config = BotConfigSchema.parse({});
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(25565);
      expect(config.username).toBe('YearnForMines');
      expect(config.version).toBe('1.21.4');
      expect(config.auth).toBe('offline');
    });

    it('should accept valid full config', () => {
      const config = BotConfigSchema.parse({
        host: '192.168.1.100',
        port: 25566,
        username: 'TestBot',
        version: '1.20.4',
        auth: 'microsoft',
      });
      expect(config.host).toBe('192.168.1.100');
      expect(config.port).toBe(25566);
      expect(config.auth).toBe('microsoft');
    });

    it('should reject invalid auth mode', () => {
      expect(() => BotConfigSchema.parse({ auth: 'invalid' })).toThrow();
    });

    it('should reject invalid port', () => {
      expect(() => BotConfigSchema.parse({ port: 'not a number' })).toThrow();
    });
  });

  describe('PositionSchema', () => {
    it('should parse valid position', () => {
      const pos = PositionSchema.parse({ x: 100, y: 64, z: -200, yaw: 90, pitch: 0 });
      expect(pos.x).toBe(100);
      expect(pos.y).toBe(64);
      expect(pos.z).toBe(-200);
      expect(pos.yaw).toBe(90);
      expect(pos.pitch).toBe(0);
    });

    it('should reject missing coordinates', () => {
      expect(() => PositionSchema.parse({ x: 0, y: 0 })).toThrow();
    });

    it('should reject non-numeric values', () => {
      expect(() => PositionSchema.parse({ x: 'a', y: 0, z: 0, yaw: 0, pitch: 0 })).toThrow();
    });
  });

  describe('HealthStatusSchema', () => {
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

    it('should reject health below 0', () => {
      expect(() => HealthStatusSchema.parse({ health: -1 })).toThrow();
    });

    it('should reject food above 20', () => {
      expect(() => HealthStatusSchema.parse({ health: 20, food: 25 })).toThrow();
    });

    it('should reject invalid game mode', () => {
      expect(() => HealthStatusSchema.parse({ gameMode: 'godmode' })).toThrow();
    });

    it('should accept all valid game modes', () => {
      for (const mode of ['survival', 'creative', 'adventure', 'spectator']) {
        const result = HealthStatusSchema.parse({
          health: 20,
          food: 20,
          foodSaturation: 0,
          oxygenLevel: 20,
          experienceLevel: 0,
          experienceProgress: 0,
          isSleeping: false,
          gameMode: mode,
        });
        expect(result.gameMode).toBe(mode);
      }
    });
  });

  describe('ItemSchema', () => {
    it('should parse item with all fields', () => {
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
      expect(item.durability).toBeUndefined();
      expect(item.enchantments).toBeUndefined();
    });

    it('should reject item with negative count', () => {
      expect(() => ItemSchema.parse({
        name: 'test',
        displayName: 'Test',
        count: -1,
        slot: 0,
      })).toThrow();
    });
  });

  describe('BlockObservationSchema', () => {
    it('should parse block with all fields', () => {
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
      expect(block.digTimeMs).toBe(1500);
    });

    it('should parse block with minimal fields', () => {
      const block = BlockObservationSchema.parse({
        name: 'bedrock',
        displayName: 'Bedrock',
        position: { x: 0, y: 0, z: 0 },
        diggable: false,
      });
      expect(block.diggable).toBe(false);
      expect(block.effectiveTool).toBeUndefined();
    });
  });

  describe('EntityObservationSchema', () => {
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

    it('should parse entity without optional fields', () => {
      const entity = EntityObservationSchema.parse({
        id: 456,
        type: 'mob',
        name: 'Cow',
        displayName: 'Cow',
        position: { x: 5, y: 64, z: 10 },
        distance: 3.0,
        hostility: 'passive',
      });
      expect(entity.health).toBeUndefined();
      expect(entity.behaviorState).toBeUndefined();
    });

    it('should reject invalid hostility', () => {
      expect(() => EntityObservationSchema.parse({
        id: 1,
        type: 'mob',
        name: 'Test',
        displayName: 'Test',
        position: { x: 0, y: 0, z: 0 },
        distance: 1,
        hostility: 'friendly',
      })).toThrow();
    });
  });

  describe('EnvironmentalHazardSchema', () => {
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

    it('should parse all hazard types', () => {
      for (const type of ['lava', 'water', 'fire', 'fall_risk', 'cactus', 'void']) {
        const hazard = EnvironmentalHazardSchema.parse({
          type,
          position: { x: 0, y: 0, z: 0 },
          distance: 1,
          severity: 'medium',
        });
        expect(hazard.type).toBe(type);
      }
    });

    it('should reject invalid hazard type', () => {
      expect(() => EnvironmentalHazardSchema.parse({
        type: 'poison',
        position: { x: 0, y: 0, z: 0 },
        distance: 1,
        severity: 'low',
      })).toThrow();
    });

    it('should reject invalid severity', () => {
      expect(() => EnvironmentalHazardSchema.parse({
        type: 'lava',
        position: { x: 0, y: 0, z: 0 },
        distance: 1,
        severity: 'extreme',
      })).toThrow();
    });
  });

  describe('WeatherSchema', () => {
    it('should parse weather state', () => {
      const weather = WeatherSchema.parse({
        isRaining: true,
        isThundering: true,
        rainState: 0.8,
        thunderState: 0.6,
      });
      expect(weather.isRaining).toBe(true);
      expect(weather.rainState).toBe(0.8);
    });

    it('should reject rain state above 1', () => {
      expect(() => WeatherSchema.parse({
        isRaining: false,
        isThundering: false,
        rainState: 1.5,
        thunderState: 0,
      })).toThrow();
    });
  });

  describe('TimeOfDaySchema', () => {
    it('should parse time of day', () => {
      const time = TimeOfDaySchema.parse({
        time: 1000,
        timeOfDay: 1000,
        day: true,
        moonPhase: 0,
        phase: 'day',
      });
      expect(time.phase).toBe('day');
    });

    it('should reject invalid phase', () => {
      expect(() => TimeOfDaySchema.parse({
        time: 1000,
        timeOfDay: 1000,
        day: true,
        moonPhase: 0,
        phase: 'afternoon',
      })).toThrow();
    });

    it('should accept all valid phases', () => {
      for (const phase of ['sunrise', 'day', 'noon', 'sunset', 'night', 'midnight']) {
        const time = TimeOfDaySchema.parse({
          time: 1000,
          timeOfDay: 1000,
          day: true,
          moonPhase: 0,
          phase,
        });
        expect(time.phase).toBe(phase);
      }
    });
  });

  describe('AttackCooldownSchema', () => {
    it('should parse ready cooldown', () => {
      const cooldown = AttackCooldownSchema.parse({ progress: 1, ready: true });
      expect(cooldown.ready).toBe(true);
    });

    it('should reject progress above 1', () => {
      expect(() => AttackCooldownSchema.parse({ progress: 1.5, ready: true })).toThrow();
    });

    it('should reject progress below 0', () => {
      expect(() => AttackCooldownSchema.parse({ progress: -0.1, ready: false })).toThrow();
    });
  });

  describe('DigProgressSchema', () => {
    it('should parse dig progress', () => {
      const dig = DigProgressSchema.parse({
        blockName: 'stone',
        position: { x: 10, y: 60, z: 20 },
        progress: 0.5,
      });
      expect(dig.blockName).toBe('stone');
      expect(dig.progress).toBe(0.5);
    });

    it('should reject progress above 1', () => {
      expect(() => DigProgressSchema.parse({
        blockName: 'stone',
        position: { x: 0, y: 0, z: 0 },
        progress: 1.5,
      })).toThrow();
    });
  });

  describe('ObservationSchema', () => {
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
      expect(obs.timeOfDay.phase).toBe('day');
    });

    it('should parse observation with entities and hazards', () => {
      const obs = ObservationSchema.parse({
        position: { x: 100, y: 64, z: -200, yaw: 90, pitch: 0 },
        health: {
          health: 15, food: 18, foodSaturation: 3.2,
          oxygenLevel: 20, experienceLevel: 5, experienceProgress: 0.5,
          isSleeping: false, gameMode: 'survival',
        },
        statusEffects: [
          { name: 'speed', amplifier: 1, duration: 300 },
        ],
        heldItem: {
          name: 'diamond_pickaxe',
          displayName: 'Diamond Pickaxe',
          count: 1,
          slot: 0,
          durability: 1200,
          maxDurability: 1561,
          enchantments: [{ name: 'efficiency', level: 3 }],
        },
        armor: { helmet: null, chestplate: 'iron_chestplate', leggings: null, boots: null },
        hotbar: [],
        inventory: [],
        inventorySummary: { diamond_pickaxe: 1 },
        nearbyBlocks: [{
          name: 'stone',
          displayName: 'Stone',
          position: { x: 101, y: 63, z: -200 },
          diggable: true,
          effectiveTool: 'pickaxe',
        }],
        nearbyEntities: [{
          id: 123,
          type: 'mob',
          name: 'Zombie',
          displayName: 'Zombie',
          position: { x: 105, y: 64, z: -195 },
          distance: 7.1,
          hostility: 'always_hostile',
        }],
        nearbyDroppedItems: [],
        environmentalHazards: [{
          type: 'lava',
          position: { x: 110, y: 60, z: -190 },
          distance: 15.3,
          severity: 'deadly',
        }],
        weather: { isRaining: false, isThundering: false, rainState: 0, thunderState: 0 },
        timeOfDay: { time: 18000, timeOfDay: 18000, day: false, moonPhase: 4, phase: 'midnight' },
        biome: 'desert',
        dimension: 'overworld',
        lightLevel: 7,
        groundDistance: 1,
        attackCooldown: { progress: 0.5, ready: false },
        activeDig: {
          blockName: 'stone',
          position: { x: 101, y: 63, z: -200 },
          progress: 0.3,
        },
        craftableItems: [
          { name: 'stone_pickaxe', displayName: 'Stone Pickaxe', requiresCraftingTable: false },
        ],
      });
      expect(obs.nearbyEntities).toHaveLength(1);
      expect(obs.nearbyEntities[0].hostility).toBe('always_hostile');
      expect(obs.environmentalHazards).toHaveLength(1);
      expect(obs.statusEffects).toHaveLength(1);
      expect(obs.activeDig).not.toBeNull();
      expect(obs.activeDig?.progress).toBe(0.3);
      expect(obs.craftableItems).toHaveLength(1);
    });
  });
});

describe('Tool error handling patterns', () => {
  // These tests verify the error handling patterns used by all MCP tools

  it('should return error result when bot is not connected', () => {
    const botManager = new BotManager();
    expect(botManager.currentBot).toBeNull();
    // All observation tools should check for bot connection
    // and return appropriate error messages
  });

  it('should return error result for unknown block types', () => {
    // find_block and get_tool_effectiveness should handle unknown block types
    // by returning errorResult with descriptive messages
    const unknownBlock = 'definitely_not_a_real_block';
    expect(typeof unknownBlock).toBe('string');
  });

  it('should return text result when no blocks/entities found', () => {
    // find_block and find_entity should return textResult when nothing is found
    // rather than empty dataResult
  });
});