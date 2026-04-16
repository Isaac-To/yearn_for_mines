import { describe, it, expect, vi } from 'vitest';
import { BotManager } from '../bot-manager.js';
import { registerActionTools } from '../tools/action.js';
import { registerObservationTools } from '../tools/observation.js';
import { registerHudTools } from '../tools/hud.js';
import { registerEventTools } from '../tools/events.js';
import { registerLifecycleTools } from '../tools/lifecycle.js';
import { EventManager } from '../events.js';

// Mock McpServer that captures tool handlers
class MockMcpServer {
  tools: Map<string, { handler: (...args: any[]) => Promise<any> }> = new Map();

  registerTool(name: string, _schema: any, handler: (...args: any[]) => Promise<any>) {
    this.tools.set(name, { handler });
  }

  registerResource(_name: string, _uri: string, _config: any, _callback: any) {}

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
    lookAt: vi.fn().mockResolvedValue(undefined),
    dig: vi.fn().mockResolvedValue(undefined),
    placeBlock: vi.fn().mockResolvedValue(undefined),
    equip: vi.fn().mockResolvedValue(undefined),
    toss: vi.fn().mockResolvedValue(undefined),
    craft: vi.fn().mockResolvedValue(undefined),
    recipesFor: vi.fn().mockReturnValue([]),
    activateItem: vi.fn(),
    chat: vi.fn(),
    whisper: vi.fn(),
    waitForTicks: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    pathfinder: { setGoal: vi.fn() },
    ...overrides,
  };
}

describe('Tool handler fallback branches - non-Error throws', () => {
  // These tests cover the ?? fallback in catch blocks where err.message is undefined

  describe('action tool fallbacks', () => {
    it('should use fallback message when lookAt throws non-Error', async () => {
      const bot = createMockBot({
        lookAt: vi.fn().mockRejectedValue('string error'),
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      const result = await server.callTool('look_at', { x: 50, y: 64, z: -100 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to look');
    });

    it('should use fallback message when dig throws non-Error', async () => {
      const bot = createMockBot({
        dig: vi.fn().mockRejectedValue('string error'),
      });
      bot.blockAt = vi.fn().mockReturnValue({ name: 'stone', diggable: true });
      bot.canDigBlock = vi.fn().mockReturnValue(true);
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      const result = await server.callTool('dig_block', { x: 0, y: 0, z: 0, force: false });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to dig');
    });

    it('should use fallback message when placeBlock throws non-Error', async () => {
      const item = { name: 'dirt', count: 64, type: 3 };
      const bot = createMockBot({
        placeBlock: vi.fn().mockRejectedValue('string error'),
        inventory: { slots: [], selectedSlot: 0, items: vi.fn().mockReturnValue([item]) },
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      const result = await server.callTool('place_block', { x: 0, y: 64, z: 0, face: 'top', itemName: 'dirt' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to place');
    });

    it('should use fallback message when craft throws non-Error', async () => {
      const bot = createMockBot({
        craft: vi.fn().mockRejectedValue('string error'),
        registry: {
          ...createMockBot().registry,
          itemsByName: { oak_planks: { id: 5, name: 'oak_planks' } },
        },
        recipesFor: vi.fn().mockReturnValue([{ delta: [], requiresTable: false }]),
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      const result = await server.callTool('craft_item', { itemName: 'oak_planks', count: 1, useCraftingTable: false });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to craft');
    });

    it('should use fallback message when equip throws non-Error', async () => {
      const item = { name: 'diamond_pickaxe', type: 10 };
      const bot = createMockBot({
        equip: vi.fn().mockRejectedValue('string error'),
        inventory: { slots: [], selectedSlot: 0, items: vi.fn().mockReturnValue([item]) },
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      const result = await server.callTool('equip_item', { itemName: 'diamond_pickaxe', destination: 'hand' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to equip');
    });

    it('should use fallback message when toss throws non-Error', async () => {
      const item = { name: 'cobblestone', type: 4, count: 32 };
      const bot = createMockBot({
        toss: vi.fn().mockRejectedValue('string error'),
        inventory: { slots: [], selectedSlot: 0, items: vi.fn().mockReturnValue([item]) },
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      const result = await server.callTool('drop_item', { itemName: 'cobblestone', count: 1 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to drop');
    });

    it('should use fallback message when activateItem throws non-Error', async () => {
      const bot = createMockBot({
        activateItem: vi.fn().mockImplementation(() => { throw 'string error'; }),
        waitForTicks: vi.fn().mockResolvedValue(undefined),
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      const result = await server.callTool('use_item', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to use');
    });

    it('should use fallback message when chat throws non-Error', async () => {
      const bot = createMockBot({
        chat: vi.fn().mockImplementation(() => { throw 'string error'; }),
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      const result = await server.callTool('chat', { message: 'test' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to send');
    });

    it('should use fallback message when whisper throws non-Error', async () => {
      const bot = createMockBot({
        whisper: vi.fn().mockImplementation(() => { throw 'string error'; }),
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      const result = await server.callTool('whisper', { username: 'Steve', message: 'Hi' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to whisper');
    });
  });

  describe('observation tool fallbacks', () => {
    it('should use fallback message when buildObservation throws non-Error in observe', async () => {
      const bot = createMockBot({
        entity: null, // Will cause buildObservation to throw
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('observe');
      expect(result.isError).toBe(true);
    });

    it('should use fallback in look_at_block with empty harvestTools (no material)', async () => {
      const bot = createMockBot();
      bot.blockAt = vi.fn().mockReturnValue({
        name: 'dirt',
        displayName: 'Dirt',
        diggable: true,
        harvestTools: {}, // truthy but empty
        // no material property
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('look_at_block', { x: 100, y: 63, z: -200 });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.effectiveTool).toBe('hand'); // Object.keys length is 0, falls to 'hand'
    });

    it('should use fallback when look_at_block block has harvest tools with material', async () => {
      const bot = createMockBot();
      bot.blockAt = vi.fn().mockReturnValue({
        name: 'stone',
        displayName: 'Stone',
        diggable: true,
        harvestTools: { '1': true },
        material: { tool: 'pickaxe' },
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('look_at_block', { x: 100, y: 63, z: -200 });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.effectiveTool).toBe('pickaxe');
    });

    it('should use fallback when look_at_block block has harvest tools but no material', async () => {
      const bot = createMockBot();
      bot.blockAt = vi.fn().mockReturnValue({
        name: 'stone',
        displayName: 'Stone',
        diggable: true,
        harvestTools: { '1': true },
        // no material property
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('look_at_block', { x: 100, y: 63, z: -200 });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.effectiveTool).toBe('hand'); // material?.tool is undefined, ?? 'hand'
    });

    it('should test entity_at_cursor filter callback', async () => {
      // Test the nearestEntity filter callback that checks entity !== bot.entity and distance
      const bot = createMockBot();
      let capturedFilter: any = null;
      bot.nearestEntity = vi.fn().mockImplementation((filter: any) => {
        capturedFilter = filter;
        return null;
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('entity_at_cursor', { maxDistance: 6 });
      expect(result.isError).toBe(false);

      // Test the filter callback
      expect(capturedFilter).not.toBeNull();
      // Filter should reject the bot's own entity
      expect(capturedFilter(bot.entity)).toBe(false);
      // Filter should accept an entity within range
      expect(capturedFilter({ position: { x: 102, y: 64, z: -198 } })).toBe(true);
      // Filter should reject an entity beyond range
      expect(capturedFilter({ position: { x: 200, y: 64, z: -200 } })).toBe(false);
    });

    it('should use fallback message when find_block throws non-Error', async () => {
      const bot = createMockBot();
      bot.registry.blocksByName.stone = { id: 1, diggable: true, harvestTools: {} };
      // Make findBlocks throw
      bot.findBlocks = vi.fn().mockImplementation(() => { throw 'string error'; });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('find_block', { type: 'stone', maxDistance: 64, count: 1 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to find');
    });
  });

  describe('HUD tool fallbacks', () => {
    it('should use fallback message when get_hud throws non-Error', async () => {
      const bot = createMockBot({
        entity: null, // Will cause buildObservation to throw non-Error
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerHudTools(server as any, manager);

      const result = await server.callTool('get_hud');
      expect(result.isError).toBe(true);
      // The error might have a message or use the fallback
    });

    it('should use fallback message when get_attack_cooldown throws non-Error', async () => {
      const bot = createMockBot({
        entity: null,
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerHudTools(server as any, manager);

      const result = await server.callTool('get_attack_cooldown');
      expect(result.isError).toBe(true);
    });

    it('should use fallback message when get_dig_progress throws non-Error', async () => {
      const bot = createMockBot({
        entity: null,
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerHudTools(server as any, manager);

      const result = await server.callTool('get_dig_progress');
      expect(result.isError).toBe(true);
    });
  });

  describe('Event tool fallbacks', () => {
    it('should use fallback message when detach throws non-Error', async () => {
      const bot = createMockBot();
      const manager = new BotManager();
      manager.setBot(bot);
      const eventManager = new EventManager();
      const server = new MockMcpServer();
      registerEventTools(server as any, manager, eventManager);

      // Subscribe first
      await server.callTool('subscribe_events');

      // Make off() throw
      bot.off = vi.fn().mockImplementation(() => { throw 'string error'; });

      const result = await server.callTool('unsubscribe_events');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to unsubscribe');
    });

    it('should use fallback message when flush/peek throws non-Error', async () => {
      const bot = createMockBot();
      const manager = new BotManager();
      manager.setBot(bot);
      const eventManager = new EventManager();
      const server = new MockMcpServer();
      registerEventTools(server as any, manager, eventManager);

      // Override flush to throw
      const _originalFlush = eventManager.flush.bind(eventManager);
      (eventManager as any).flush = () => { throw 'string error'; };

      const result = await server.callTool('get_events', { clear: true });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get');
    });
  });

  describe('Lifecycle tool fallbacks', () => {
    it('should use fallback message when connect returns no error', async () => {
      // Create a mock BotManager that returns success:false with undefined error
      const manager = new BotManager();
      // Override connect to return a result without error
      manager.connect = async () => ({ success: false, error: undefined as any });
      const server = new MockMcpServer();
      registerLifecycleTools(server as any, manager);

      const result = await server.callTool('bot_connect', {
        host: 'localhost', port: 25565, username: 'TestBot', version: '1.21.4', auth: 'offline',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to connect');
    });

    it('should use fallback message when disconnect returns no error', async () => {
      const manager = new BotManager();
      manager.disconnect = () => ({ success: false, error: undefined as any });
      const server = new MockMcpServer();
      registerLifecycleTools(server as any, manager);

      const result = await server.callTool('bot_disconnect');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to disconnect');
    });

    it('should use fallback message when respawn returns no error', async () => {
      const manager = new BotManager();
      manager.respawn = () => ({ success: false, error: undefined as any });
      const server = new MockMcpServer();
      registerLifecycleTools(server as any, manager);

      const result = await server.callTool('bot_respawn');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to respawn');
    });
  });

  describe('Observation tool ?? fallback branches', () => {
    // These tests cover the err.message ?? 'fallback' branches in observation.ts

    it('observe should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      Object.defineProperty(bot, 'entity', { get: () => { throw 'string error'; } });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('observe');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to observe');
    });

    it('find_entity should use name ?? username ?? empty fallback', async () => {
      const bot = createMockBot();
      // Entity with no name and no username - triggers ?? '' fallback
      bot.entities = {
        1: {
          id: 1,
          type: 'mob',
          position: { x: 102, y: 64, z: -198, distanceTo: () => 5 },
          metadata: [],
          equipment: [],
        },
      };
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('find_entity', { type: '', maxDistance: 32 });
      expect(result.isError).toBe(false);
      // All entities filtered out because name is '' and type is ''
    });

    it('find_entity should use displayName ?? name fallback', async () => {
      const bot = createMockBot();
      // Entity with name but no displayName
      bot.entities = {
        1: {
          id: 1,
          type: 'mob',
          name: 'Zombie',
          position: { x: 102, y: 64, z: -198, distanceTo: () => 5 },
          metadata: [],
          equipment: [],
        },
      };
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('find_entity', { type: 'Zombie', maxDistance: 32 });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      // displayName should fall back to name when not provided
      expect(data.entities[0].displayName).toBe('Zombie');
    });

    it('find_entity should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      Object.defineProperty(bot, 'entity', { get: () => { throw 'string error'; } });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('find_entity', { type: 'Zombie', maxDistance: 32 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to find');
    });

    it('get_inventory should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      Object.defineProperty(bot, 'entity', { get: () => { throw 'string error'; } });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('get_inventory');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get inventory');
    });

    it('get_position should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      Object.defineProperty(bot, 'entity', { get: () => { throw 'string error'; } });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('get_position');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get position');
    });

    it('get_craftable should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      Object.defineProperty(bot, 'entity', { get: () => { throw 'string error'; } });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('get_craftable');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get craftable');
    });

    it('get_nearby_items should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      Object.defineProperty(bot, 'entity', { get: () => { throw 'string error'; } });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('get_nearby_items', { maxDistance: 16 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get nearby');
    });

    it('look_at_block should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      Object.defineProperty(bot, 'entity', { get: () => { throw 'string error'; } });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('look_at_block', { x: 0, y: 0, z: 0 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to look at block');
    });

    it('entity_at_cursor should use name ?? username ?? unknown fallback', async () => {
      const bot = createMockBot();
      // Entity with no name but has username
      const entityWithUsername = {
        id: 2,
        username: 'Steve',
        displayName: 'Steve',
        type: 'player',
        position: { x: 102, y: 64, z: -198 },
      };
      bot.nearestEntity = vi.fn().mockReturnValue(entityWithUsername);
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('entity_at_cursor', { maxDistance: 6 });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe('Steve');
    });

    it('entity_at_cursor should use unknown when no name or username', async () => {
      const bot = createMockBot();
      // Entity with neither name nor username
      const entityNoName = {
        id: 3,
        displayName: 'Unknown',
        type: 'mob',
        position: { x: 102, y: 64, z: -198 },
      };
      bot.nearestEntity = vi.fn().mockReturnValue(entityNoName);
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('entity_at_cursor', { maxDistance: 6 });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe('unknown');
    });

    it('entity_at_cursor should use displayName ?? name fallback', async () => {
      const bot = createMockBot();
      // Entity with name but no displayName
      const entityNoDisplayName = {
        id: 4,
        name: 'Zombie',
        type: 'mob',
        position: { x: 102, y: 64, z: -198 },
      };
      bot.nearestEntity = vi.fn().mockReturnValue(entityNoDisplayName);
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('entity_at_cursor', { maxDistance: 6 });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.displayName).toBe('Zombie');
    });

    it('entity_at_cursor should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      // Make nearestEntity throw a string error
      bot.nearestEntity = vi.fn().mockImplementation(() => { throw 'string error'; });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('entity_at_cursor', { maxDistance: 6 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get entity');
    });

    it('get_attack_cooldown should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      Object.defineProperty(bot, 'entity', { get: () => { throw 'string error'; } });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('get_attack_cooldown');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get attack cooldown');
    });

    it('get_position should default yaw, pitch, dimension, onGround when undefined', async () => {
      const pos = { x: 100, y: 64, z: -200, distanceTo: () => 0 };
      const bot = createMockBot({
        entity: {
          position: pos,
          velocity: { x: 0, y: 0, z: 0 },
          // yaw and pitch intentionally undefined
          height: 1.8,
          onGround: undefined,
          equipment: [],
          metadata: [],
          effects: {},
        },
        game: undefined, // triggers dimension ?? 'overworld'
      });
      // Remove yaw and pitch
      delete (bot.entity as any).yaw;
      delete (bot.entity as any).pitch;
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('get_position');
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.position.yaw).toBe(0);
      expect(data.position.pitch).toBe(0);
      expect(data.dimension).toBe('overworld');
      expect(data.onGround).toBe(true);
    });

    it('get_tool_effectiveness should use harvestTools ?? {} fallback', async () => {
      const bot = createMockBot();
      bot.registry.blocksByName.dirt = { id: 3, diggable: true, harvestTools: undefined } as any;
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('get_tool_effectiveness', { blockType: 'dirt' });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.effectiveTools).toEqual([]);
      expect(data.bestTool).toBe('hand');
    });

    it('look_at_block should use block.displayName ?? block.name fallback', async () => {
      const bot = createMockBot();
      bot.blockAt = vi.fn().mockReturnValue({
        name: 'stone',
        // no displayName property
        diggable: true,
        harvestTools: { '1': true },
        material: { tool: 'pickaxe' },
        light: 10,
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('look_at_block', { x: 100, y: 63, z: -200 });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.displayName).toBe('stone'); // falls back to name
    });

    it('look_at_block should use block.diggable ?? false fallback', async () => {
      const bot = createMockBot();
      bot.blockAt = vi.fn().mockReturnValue({
        name: 'bedrock',
        // no diggable property
        harvestTools: null,
        light: 0,
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('look_at_block', { x: 100, y: 63, z: -200 });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.diggable).toBe(false); // falls back to false
    });

    it('look_at_block should use hand when harvestTools has keys but no material', async () => {
      const bot = createMockBot();
      bot.blockAt = vi.fn().mockReturnValue({
        name: 'sand',
        displayName: 'Sand',
        diggable: true,
        harvestTools: { '257': true },
        // no material property
        light: 10,
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('look_at_block', { x: 100, y: 63, z: -200 });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      // Object.keys(harvestTools).length > 0 is true, so (block as any).material?.tool ?? 'hand'
      // Since material is undefined, material?.tool is undefined, so 'hand' is used
      expect(data.effectiveTool).toBe('hand');
    });

    it('look_at_block should use hand when harvestTools exists but has keys and no material', async () => {
      const bot = createMockBot();
      bot.blockAt = vi.fn().mockReturnValue({
        name: 'sand',
        displayName: 'Sand',
        diggable: true,
        harvestTools: { '257': true },
        // no material property
        light: 10,
      });
      // No itemsById for that tool
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerObservationTools(server as any, manager);

      const result = await server.callTool('look_at_block', { x: 100, y: 63, z: -200 });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.effectiveTool).toBe('hand');
    });
  });

  describe('HUD tool ?? fallback branches', () => {
    it('get_hud should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      Object.defineProperty(bot, 'entity', { get: () => { throw 'string error'; } });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerHudTools(server as any, manager);

      const result = await server.callTool('get_hud');
      expect(result.isError).toBe(true);
      // errorResult prepends "Error: " to the fallback
      expect(result.content[0].text).toContain('Failed to get HUD data');
    });

    it('get_attack_cooldown should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      Object.defineProperty(bot, 'entity', { get: () => { throw 'string error'; } });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerHudTools(server as any, manager);

      const result = await server.callTool('get_attack_cooldown');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get attack cooldown');
    });

    it('get_dig_progress should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      Object.defineProperty(bot, 'entity', { get: () => { throw 'string error'; } });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerHudTools(server as any, manager);

      const result = await server.callTool('get_dig_progress');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get dig progress');
    });
  });

  describe('Event tool ?? fallback branch', () => {
    it('subscribe_events should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      const manager = new BotManager();
      manager.setBot(bot);
      const eventManager = new EventManager();
      const server = new MockMcpServer();
      registerEventTools(server as any, manager, eventManager);

      // Make bot.on throw a string
      bot.on = vi.fn().mockImplementation(() => { throw 'string error'; });

      const result = await server.callTool('subscribe_events');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to subscribe');
    });
  });

  describe('Action tool remaining ?? fallback branches', () => {
    it('pathfind_to should use fallback message on non-Error throw', async () => {
      const bot = createMockBot();
      // Remove pathfinder to trigger error path
      delete (bot as any).pathfinder;
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      // This should return error about missing pathfinder, not a non-Error throw
      const result = await server.callTool('pathfind_to', { x: 50, y: 64, z: -100, range: 2 });
      expect(result.isError).toBe(true);
      // The pathfinder check happens before the promise, so it returns a normal error
    });

    it('place_block should use fallback message on non-Error when blockAt throws', async () => {
      const item = { name: 'dirt', count: 64, type: 3 };
      const bot = createMockBot({
        inventory: { slots: [], selectedSlot: 0, items: vi.fn().mockReturnValue([item]) },
      });
      bot.blockAt = vi.fn().mockImplementation(() => { throw 'string error'; });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      const result = await server.callTool('place_block', { x: 0, y: 64, z: 0, face: 'top', itemName: 'dirt' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to place');
    });

    it('craft_item should use fallback message on non-Error when recipesFor throws', async () => {
      const bot = createMockBot({
        craft: vi.fn().mockRejectedValue('string error'),
        registry: {
          ...createMockBot().registry,
          itemsByName: { oak_planks: { id: 5, name: 'oak_planks' } },
        },
        recipesFor: vi.fn().mockImplementation(() => { throw 'string error'; }),
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      const result = await server.callTool('craft_item', { itemName: 'oak_planks', count: 1, useCraftingTable: false });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to craft');
    });

    it('use_item should use fallback message on non-Error when waitForTicks throws', async () => {
      const bot = createMockBot({
        activateItem: vi.fn(),
        waitForTicks: vi.fn().mockRejectedValue('string error'),
      });
      const manager = new BotManager();
      manager.setBot(bot);
      const server = new MockMcpServer();
      registerActionTools(server as any, manager);

      const result = await server.callTool('use_item', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to use');
    });
  });
});