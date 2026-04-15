import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BotManager } from '../bot-manager.js';
import { registerHudTools, registerBotStatusResource } from '../tools/hud.js';

// Mock McpServer that captures tool and resource handlers
class MockMcpServer {
  tools: Map<string, { handler: (...args: any[]) => Promise<any> }> = new Map();
  resources: Map<string, { handler: (...args: any[]) => Promise<any> }> = new Map();

  registerTool(name: string, _schema: any, handler: (...args: any[]) => Promise<any>) {
    this.tools.set(name, { handler });
  }

  registerResource(name: string, _uri: string, _config: any, handler: (...args: any[]) => Promise<any>) {
    this.resources.set(name, { handler });
  }

  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool.handler(args);
  }

  async readResource(name: string): Promise<any> {
    const resource = this.resources.get(name);
    if (!resource) throw new Error(`Resource "${name}" not found`);
    return resource.handler();
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
      blocksByName: {} as never,
      itemsByName: {} as never,
      itemsById: {} as never,
    } as never,
    world: { getBiome: vi.fn().mockReturnValue(undefined) } as never,
    controlState: {} as never,
    ...overrides,
  };
}

describe('HUD tools - get_hud', () => {
  let botManager: BotManager;
  let mockBot: any;
  let server: MockMcpServer;

  beforeEach(() => {
    mockBot = createMockBot();
    botManager = new BotManager();
    botManager.setBot(mockBot);
    server = new MockMcpServer();
    registerHudTools(server as any, botManager);
  });

  it('should return HUD data when bot is connected', async () => {
    const result = await server.callTool('get_hud');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('health');
    expect(data).toHaveProperty('heldItem');
    expect(data).toHaveProperty('hotbar');
    expect(data).toHaveProperty('armor');
    expect(data).toHaveProperty('statusEffects');
    expect(data).toHaveProperty('attackCooldown');
    expect(data).toHaveProperty('activeDig');
  });

  it('should return error when bot is not connected', async () => {
    const emptyManager = new BotManager();
    const emptyServer = new MockMcpServer();
    registerHudTools(emptyServer as any, emptyManager);

    const result = await emptyServer.callTool('get_hud');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not connected');
  });

  it('should handle buildObservation throwing an error', async () => {
    // Set up a bot that will cause buildObservation to fail
    const errorBot = createMockBot({
      entity: null, // This will cause an error in buildObservation
    });
    botManager.setBot(errorBot);
    const result = await server.callTool('get_hud');
    expect(result.isError).toBe(true);
  });
});

describe('HUD tools - get_attack_cooldown', () => {
  let botManager: BotManager;
  let mockBot: any;
  let server: MockMcpServer;

  beforeEach(() => {
    mockBot = createMockBot();
    botManager = new BotManager();
    botManager.setBot(mockBot);
    server = new MockMcpServer();
    registerHudTools(server as any, botManager);
  });

  it('should return attack cooldown data', async () => {
    const result = await server.callTool('get_attack_cooldown');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('progress');
    expect(data).toHaveProperty('ready');
  });

  it('should return error when bot is not connected', async () => {
    const emptyManager = new BotManager();
    const emptyServer = new MockMcpServer();
    registerHudTools(emptyServer as any, emptyManager);

    const result = await emptyServer.callTool('get_attack_cooldown');
    expect(result.isError).toBe(true);
  });
});

describe('HUD tools - get_dig_progress', () => {
  let botManager: BotManager;
  let mockBot: any;
  let server: MockMcpServer;

  beforeEach(() => {
    mockBot = createMockBot();
    botManager = new BotManager();
    botManager.setBot(mockBot);
    server = new MockMcpServer();
    registerHudTools(server as any, botManager);
  });

  it('should return text when not digging', async () => {
    const result = await server.callTool('get_dig_progress');
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('No block');
  });

  it('should return progress when digging', async () => {
    mockBot.targetDigBlock = { name: 'stone', position: { x: 100, y: 63, z: -200 } };
    const result = await server.callTool('get_dig_progress');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.blockName).toBe('stone');
  });

  it('should return error when bot is not connected', async () => {
    const emptyManager = new BotManager();
    const emptyServer = new MockMcpServer();
    registerHudTools(emptyServer as any, emptyManager);

    const result = await emptyServer.callTool('get_dig_progress');
    expect(result.isError).toBe(true);
  });
});

describe('Bot status resource', () => {
  it('should return disconnected status when bot is not connected', async () => {
    const botManager = new BotManager();
    const server = new MockMcpServer();
    registerBotStatusResource(server as any, botManager);

    const result = await server.readResource('bot-status');
    const content = JSON.parse(result.contents[0].text);
    expect(content.connected).toBe(false);
    expect(content.username).toBeNull();
    expect(content.position).toBeNull();
    expect(content.health).toBeNull();
  });

  it('should return connected status when bot is connected', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerBotStatusResource(server as any, botManager);

    const result = await server.readResource('bot-status');
    const content = JSON.parse(result.contents[0].text);
    expect(content.connected).toBe(true);
    expect(content.username).toBe('TestBot');
    expect(content.position).toBeDefined();
    expect(content.health).toBeDefined();
    expect(content.weather).toBeDefined();
    expect(content.timeOfDay).toBeDefined();
    expect(content.dimension).toBeDefined();
    expect(content.biome).toBeDefined();
    expect(content.nearbyEntityCount).toBeDefined();
    expect(content.nearbyBlockCount).toBeDefined();
    expect(content.hazardCount).toBeDefined();
    expect(content.inventorySummary).toBeDefined();
    expect(content.attackCooldown).toBeDefined();
  });

  it('should include correct MIME type', async () => {
    const botManager = new BotManager();
    const server = new MockMcpServer();
    registerBotStatusResource(server as any, botManager);

    const result = await server.readResource('bot-status');
    expect(result.contents[0].mimeType).toBe('application/json');
    expect(result.contents[0].uri).toBe('bot://status');
  });

  it('should include entities and blocks counts when present', async () => {
    const mockBot = createMockBot({
      entities: {
        1: {
          id: 1,
          type: 'mob',
          name: 'Zombie',
          displayName: 'Zombie',
          position: { x: 105, y: 64, z: -195, distanceTo: () => 7 },
          metadata: [],
          equipment: [],
        },
      },
    });
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const server = new MockMcpServer();
    registerBotStatusResource(server as any, botManager);

    const result = await server.readResource('bot-status');
    const content = JSON.parse(result.contents[0].text);
    expect(content.connected).toBe(true);
    expect(content.nearbyEntityCount).toBe(1);
  });
});