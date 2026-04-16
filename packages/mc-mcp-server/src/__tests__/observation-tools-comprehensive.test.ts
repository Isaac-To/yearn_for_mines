import { describe, it, expect, vi } from 'vitest';
import { BotManager } from '../bot-manager.js';
import { registerObservationTools } from '../tools/observation.js';

// Mock McpServer that captures tool handlers for direct invocation
class MockMcpServer {
  tools: Map<string, { handler: (...args: any[]) => Promise<any> }> = new Map();

  registerTool(name: string, _schema: any, handler: (...args: any[]) => Promise<any>) {
    this.tools.set(name, { handler });
  }

  registerResource(_name: string, _uri: string, _config: any, _callback: any) {
    // No-op for testing
  }

  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool.handler(args);
  }
}

function createMockBot(overrides: Record<string, any> = {}): any {
  const pos = { x: 100, y: 64, z: -200, distanceTo: (other: any) => Math.sqrt((100 - other.x) ** 2 + (64 - other.y) ** 2 + (-200 - other.z) ** 2) };
  return {
    username: 'TestBot',
    entity: {
      position: pos,
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      height: 1.8,
      onGround: true,
      equipment: [],
      metadata: [],
      effects: {},
    },
    health: 20,
    food: 18,
    foodSaturation: 5.0,
    oxygenLevel: 20,
    experience: { level: 5, points: 50, progress: 0.5 },
    isSleeping: false,
    spawnPoint: { x: 0, y: 64, z: 0 },
    game: { dimension: 'overworld', gameMode: 'survival' } as never,
    isRaining: false,
    rainState: 0,
    thunderState: 0,
    time: { time: 1000, timeOfDay: 1000, day: true, moonPhase: 0 } as never,
    players: {} as never,
    inventory: {
      slots: [] as never[],
      selectedSlot: 0,
      items: vi.fn().mockReturnValue([]),
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
      harvestTools: { '1': true },
      displayName: 'Grass Block',
      material: { tool: 'shovel' },
      light: 15,
      boundingBox: 'solid',
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
      blocksByName: { crafting_table: { id: 120 }, stone: { id: 1, diggable: true, harvestTools: {} } } as never,
      itemsByName: { oak_planks: { id: 5 }, crafting_table: { id: 120 }, stone: { id: 1 } } as never,
      itemsById: { 1: { name: 'stone' }, 5: { name: 'oak_planks' } } as never,
    } as never,
    world: { getBiome: vi.fn().mockReturnValue(undefined) } as never,
    controlState: {} as never,
    ...overrides,
  };
}

describe('Observation tools - observe', () => {
  it('should return full observation when bot is connected', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('observe');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.position.x).toBe(100);
    expect(data.health.health).toBe(20);
  });

  it('should return error when bot is not connected', async () => {
    const botManager = new BotManager();
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('observe');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not connected');
  });
});

describe('Observation tools - find_block', () => {
  it('should return error for unknown block type', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('find_block', { type: 'nonexistent_block', maxDistance: 64, count: 1 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown block type');
  });

  it('should return text when no blocks found', async () => {
    const mockBot = createMockBot();
    mockBot.registry.blocksByName.stone = { id: 1, diggable: true, harvestTools: {} };
    mockBot.findBlocks = vi.fn().mockReturnValue([]);
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('find_block', { type: 'stone', maxDistance: 64, count: 1 });
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('No "stone" blocks found');
  });

  it('should return found blocks', async () => {
    const mockBot = createMockBot();
    mockBot.registry.blocksByName.stone = { id: 1, diggable: true, harvestTools: {} };
    mockBot.findBlocks = vi.fn().mockReturnValue([{ x: 110, y: 60, z: -190 }]);
    mockBot.blockAt = vi.fn().mockReturnValue({
      name: 'stone',
      displayName: 'Stone',
      diggable: true,
    });
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('find_block', { type: 'stone', maxDistance: 64, count: 1 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.blocks).toHaveLength(1);
    expect(data.blocks[0].name).toBe('stone');
    expect(data.count).toBe(1);
  });

  it('should handle find_block with null block at position', async () => {
    const mockBot = createMockBot();
    mockBot.registry.blocksByName.stone = { id: 1, diggable: true, harvestTools: {} };
    mockBot.findBlocks = vi.fn().mockReturnValue([{ x: 110, y: 60, z: -190 }]);
    mockBot.blockAt = vi.fn().mockReturnValue(null);
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('find_block', { type: 'stone', maxDistance: 64, count: 1 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.blocks[0].name).toBe('stone'); // Falls back to type
  });

  it('should return error when bot not connected', async () => {
    const botManager = new BotManager();
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('find_block', { type: 'stone', maxDistance: 64, count: 1 });
    expect(result.isError).toBe(true);
  });
});

describe('Observation tools - find_entity', () => {
  it('should return matching entities', async () => {
    const mockBot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Zombie',
          displayName: 'Zombie',
          position: { x: 105, y: 64, z: -195 },
        },
      },
    });
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('find_entity', { type: 'Zombie', maxDistance: 32 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.entities).toHaveLength(1);
    expect(data.entities[0].name).toBe('Zombie');
    expect(data.count).toBe(1);
  });

  it('should return text when no entities found', async () => {
    const mockBot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Zombie',
          displayName: 'Zombie',
          position: { x: 105, y: 64, z: -195 },
        },
      },
    });
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('find_entity', { type: 'Cow', maxDistance: 32 });
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('No "Cow" entities found');
  });

  it('should filter entities beyond maxDistance', async () => {
    const mockBot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Zombie',
          displayName: 'Zombie',
          position: { x: 300, y: 64, z: -200 }, // 200 blocks away from bot at (100, 64, -200)
        },
      },
    });
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('find_entity', { type: 'Zombie', maxDistance: 10 });
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('No "Zombie" entities found');
  });

  it('should use username when name is missing', async () => {
    const mockBot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'player',
          username: 'Steve',
          displayName: 'Steve',
          position: { x: 105, y: 64, z: -195 },
        },
      },
    });
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('find_entity', { type: 'Steve', maxDistance: 32 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.entities).toHaveLength(1);
  });

  it('should match entity names case-insensitively', async () => {
    const mockBot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Zombie',
          displayName: 'Zombie',
          position: { x: 105, y: 64, z: -195 },
        },
      },
    });
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('find_entity', { type: 'zombie', maxDistance: 32 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.entities).toHaveLength(1);
  });

  it('should return error when bot not connected', async () => {
    const botManager = new BotManager();
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('find_entity', { type: 'Zombie', maxDistance: 32 });
    expect(result.isError).toBe(true);
  });
});

describe('Observation tools - get_inventory', () => {
  it('should return inventory data', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('get_inventory');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('heldItem');
    expect(data).toHaveProperty('hotbar');
    expect(data).toHaveProperty('inventory');
    expect(data).toHaveProperty('inventorySummary');
    expect(data).toHaveProperty('armor');
    expect(data).toHaveProperty('craftableItems');
  });

  it('should return error when bot not connected', async () => {
    const botManager = new BotManager();
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('get_inventory');
    expect(result.isError).toBe(true);
  });
});

describe('Observation tools - get_position', () => {
  it('should return position data', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('get_position');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.position.x).toBe(100);
    expect(data.dimension).toBe('overworld');
    expect(data).toHaveProperty('spawnPoint');
    expect(data).toHaveProperty('onGround');
  });

  it('should return error when bot not connected', async () => {
    const botManager = new BotManager();
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('get_position');
    expect(result.isError).toBe(true);
  });
});

describe('Observation tools - get_craftable', () => {
  it('should return craftable items', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('get_craftable');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('craftableItems');
  });

  it('should return error when bot not connected', async () => {
    const botManager = new BotManager();
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('get_craftable');
    expect(result.isError).toBe(true);
  });
});

describe('Observation tools - get_tool_effectiveness', () => {
  it('should return error for unknown block type', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('get_tool_effectiveness', { blockType: 'nonexistent' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown block type');
  });

  it('should return effectiveness data for block with harvest tools', async () => {
    const mockBot = createMockBot();
    mockBot.registry.blocksByName.stone = {
      id: 1,
      diggable: true,
      harvestTools: { '1': true, '2': true },
    };
    mockBot.registry.itemsById = {
      1: { name: 'wooden_pickaxe' },
      2: { name: 'stone_pickaxe' },
    };
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('get_tool_effectiveness', { blockType: 'stone' });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.block).toBe('stone');
    expect(data.diggable).toBe(true);
    expect(data.effectiveTools.length).toBeGreaterThan(0);
  });

  it('should handle block without harvest tools', async () => {
    const mockBot = createMockBot();
    mockBot.registry.blocksByName.dirt = {
      id: 3,
      diggable: true,
      harvestTools: undefined,
    };
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('get_tool_effectiveness', { blockType: 'dirt' });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.effectiveTools).toEqual([]);
    expect(data.bestTool).toBe('hand');
  });

  it('should return error when bot not connected', async () => {
    const botManager = new BotManager();
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('get_tool_effectiveness', { blockType: 'stone' });
    expect(result.isError).toBe(true);
  });
});

describe('Observation tools - get_nearby_items', () => {
  it('should return items within maxDistance', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('get_nearby_items', { maxDistance: 16 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('count');
  });

  it('should return error when bot not connected', async () => {
    const botManager = new BotManager();
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('get_nearby_items', { maxDistance: 16 });
    expect(result.isError).toBe(true);
  });
});

describe('Observation tools - look_at_block', () => {
  it('should return block info at coordinates', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('look_at_block', { x: 100, y: 63, z: -200 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('diggable');
    expect(data).toHaveProperty('distance');
  });

  it('should return error when no block at coordinates', async () => {
    const mockBot = createMockBot();
    mockBot.blockAt = vi.fn().mockReturnValue(null);
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('look_at_block', { x: 0, y: 0, z: 0 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No block found');
  });

  it('should handle block with harvest tools', async () => {
    const mockBot = createMockBot();
    mockBot.blockAt = vi.fn().mockReturnValue({
      name: 'stone',
      displayName: 'Stone',
      diggable: true,
      harvestTools: { '1': true },
      material: { tool: 'pickaxe' },
      light: 10,
    });
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('look_at_block', { x: 100, y: 63, z: -200 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.effectiveTool).toBe('pickaxe');
    expect(data.lightLevel).toBe(10);
  });

  it('should handle block without harvest tools', async () => {
    const mockBot = createMockBot();
    mockBot.blockAt = vi.fn().mockReturnValue({
      name: 'dirt',
      displayName: 'Dirt',
      diggable: true,
      harvestTools: null,
    });
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('look_at_block', { x: 100, y: 63, z: -200 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.effectiveTool).toBe('hand');
  });

  it('should return error when bot not connected', async () => {
    const botManager = new BotManager();
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('look_at_block', { x: 0, y: 0, z: 0 });
    expect(result.isError).toBe(true);
  });
});

describe('Observation tools - entity_at_cursor', () => {
  it('should return text when no entity in range', async () => {
    const mockBot = createMockBot();
    mockBot.nearestEntity = vi.fn().mockReturnValue(null);
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('entity_at_cursor', { maxDistance: 6 });
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('No entity in range');
  });

  it('should return entity data when entity in range', async () => {
    const mockBot = createMockBot();
    const testEntity = {
      id: 1,
      name: 'Zombie',
      displayName: 'Zombie',
      type: 'mob',
      position: { x: 102, y: 64, z: -198 },
    };
    mockBot.nearestEntity = vi.fn().mockReturnValue(testEntity);
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('entity_at_cursor', { maxDistance: 6 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe(1);
    expect(data.name).toBe('Zombie');
  });

  it('should handle entity with username instead of name', async () => {
    const mockBot = createMockBot();
    const testEntity = {
      id: 2,
      username: 'Steve',
      displayName: 'Steve',
      type: 'player',
      position: { x: 102, y: 64, z: -198 },
    };
    mockBot.nearestEntity = vi.fn().mockReturnValue(testEntity);
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('entity_at_cursor', { maxDistance: 6 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.name).toBe('Steve');
  });

  it('should return error when bot not connected', async () => {
    const botManager = new BotManager();
    const server = new MockMcpServer();
    registerObservationTools(server as any, botManager);

    const result = await server.callTool('entity_at_cursor', { maxDistance: 6 });
    expect(result.isError).toBe(true);
  });
});

