import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BotManager } from '../bot-manager.js';
import { registerActionTools } from '../tools/action.js';
import { registerObservationTools } from '../tools/observation.js';
import { registerHudTools } from '../tools/hud.js';
import { registerEventTools } from '../tools/events.js';
import { registerLifecycleTools } from '../tools/lifecycle.js';
import { EventManager } from '../events.js';
import type { Bot } from 'mineflayer';

// Utility to create a mock bot with realistic defaults
function createMockBot(overrides: Record<string, any> = {}): Bot {
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
    } as never,
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
    inventory: { slots: [] as never[], selectedSlot: 0, items: vi.fn().mockReturnValue([]) } as never,
    quickBarSlot: 0,
    heldItem: null as never,
    targetDigBlock: null,
    entities: {} as never,
    blockAt: vi.fn().mockReturnValue({
      name: 'grass_block', position: { x: 100, y: 63, z: -200 }, type: 2,
      diggable: true, harvestTools: { '1': true }, displayName: 'Grass Block',
      material: { tool: 'shovel' }, light: 15,
    }),
    findBlock: vi.fn().mockReturnValue(null),
    findBlocks: vi.fn().mockReturnValue([]),
    canDigBlock: vi.fn().mockReturnValue(true),
    canSeeBlock: vi.fn().mockReturnValue(true),
    nearestEntity: vi.fn().mockReturnValue(null),
    registry: {
      blocks: {} as never, items: {} as never, biomes: {} as never,
      recipes: {} as never, enchantments: {} as never,
      blocksByName: { crafting_table: { id: 120 }, stone: { id: 1, diggable: true, harvestTools: {} } } as never,
      itemsByName: { oak_planks: { id: 5 }, crafting_table: { id: 120 }, stone: { id: 1 } } as never,
      itemsById: { 1: { name: 'stone' }, 5: { name: 'oak_planks' } } as never,
    } as never,
    world: { getBiome: vi.fn().mockReturnValue(undefined) } as never,
    controlState: {} as never,
    // Action mocks
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
    respawn: vi.fn(),
    quit: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    pathfinder: { setGoal: vi.fn() },
    ...overrides,
  } as unknown as Bot;
}

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

describe('Observation tool handlers', () => {
  let botManager: BotManager;
  let mockBot: Bot;
  let server: MockMcpServer;

  beforeEach(() => {
    mockBot = createMockBot();
    botManager = new BotManager();
    botManager.setBot(mockBot);
    server = new MockMcpServer();
    registerObservationTools(server as any, botManager);
  });

  it('observe should return full observation', async () => {
    const result = await server.callTool('observe');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.position.x).toBe(100);
    expect(data.health.health).toBe(20);
    expect(data.dimension).toBe('overworld');
  });

  it('find_block should return error for unknown block type', async () => {
    const result = await server.callTool('find_block', { type: 'nonexistent_block', maxDistance: 64, count: 1 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown block type');
  });

  it('find_block should return text when no blocks found', async () => {
    (mockBot as any).registry.blocksByName.stone = { id: 1, diggable: true, harvestTools: {} };
    (mockBot as any).findBlocks = vi.fn().mockReturnValue([]);
    const result = await server.callTool('find_block', { type: 'stone', maxDistance: 64, count: 1 });
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('No "stone" blocks found');
  });

  it('get_inventory should return inventory data', async () => {
    const result = await server.callTool('get_inventory');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('heldItem');
    expect(data).toHaveProperty('hotbar');
    expect(data).toHaveProperty('inventory');
    expect(data).toHaveProperty('inventorySummary');
    expect(data).toHaveProperty('armor');
  });

  it('get_position should return position data', async () => {
    const result = await server.callTool('get_position');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.position.x).toBe(100);
    expect(data.dimension).toBe('overworld');
    expect(data).toHaveProperty('spawnPoint');
    expect(data).toHaveProperty('onGround');
  });

  it('get_craftable should return craftable items', async () => {
    const result = await server.callTool('get_craftable');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('craftableItems');
  });

  it('get_tool_effectiveness should return error for unknown block', async () => {
    const result = await server.callTool('get_tool_effectiveness', { blockType: 'nonexistent' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown block type');
  });

  it('get_tool_effectiveness should return effectiveness data for known block', async () => {
    const result = await server.callTool('get_tool_effectiveness', { blockType: 'stone' });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('block');
    expect(data).toHaveProperty('diggable');
  });

  it('get_nearby_items should return items', async () => {
    const result = await server.callTool('get_nearby_items', { maxDistance: 16 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('count');
  });

  it('look_at_block should return block info', async () => {
    const result = await server.callTool('look_at_block', { x: 100, y: 63, z: -200 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('diggable');
    expect(data).toHaveProperty('distance');
  });

  it('entity_at_cursor should return text when no entity in range', async () => {
    (mockBot as any).nearestEntity = vi.fn().mockReturnValue(null);
    const result = await server.callTool('entity_at_cursor', { maxDistance: 6 });
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('No entity in range');
  });

});

describe('Observation tool handlers - no bot connected', () => {
  let botManager: BotManager;
  let server: MockMcpServer;

  beforeEach(() => {
    botManager = new BotManager();
    server = new MockMcpServer();
    registerObservationTools(server as any, botManager);
  });

  it('observe should return error when bot not connected', async () => {
    const result = await server.callTool('observe');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not connected');
  });

  it('find_block should return error when bot not connected', async () => {
    const result = await server.callTool('find_block', { type: 'stone', maxDistance: 64, count: 1 });
    expect(result.isError).toBe(true);
  });

  it('get_inventory should return error when bot not connected', async () => {
    const result = await server.callTool('get_inventory');
    expect(result.isError).toBe(true);
  });

  it('get_position should return error when bot not connected', async () => {
    const result = await server.callTool('get_position');
    expect(result.isError).toBe(true);
  });

  it('get_craftable should return error when bot not connected', async () => {
    const result = await server.callTool('get_craftable');
    expect(result.isError).toBe(true);
  });

  it('get_tool_effectiveness should return error when bot not connected', async () => {
    const result = await server.callTool('get_tool_effectiveness', { blockType: 'stone' });
    expect(result.isError).toBe(true);
  });

  it('get_nearby_items should return error when bot not connected', async () => {
    const result = await server.callTool('get_nearby_items', { maxDistance: 16 });
    expect(result.isError).toBe(true);
  });

  it('look_at_block should return error when bot not connected', async () => {
    const result = await server.callTool('look_at_block', { x: 0, y: 0, z: 0 });
    expect(result.isError).toBe(true);
  });

  it('entity_at_cursor should return error when bot not connected', async () => {
    const result = await server.callTool('entity_at_cursor', { maxDistance: 6 });
    expect(result.isError).toBe(true);
  });

});

describe('Action tool handlers', () => {
  let botManager: BotManager;
  let mockBot: Bot;
  let server: MockMcpServer;

  beforeEach(() => {
    mockBot = createMockBot();
    botManager = new BotManager();
    botManager.setBot(mockBot);
    server = new MockMcpServer();
    registerActionTools(server as any, botManager);
  });

  it('chat should send message', async () => {
    const result = await server.callTool('chat', { message: 'Hello world' });
    expect(result.isError).toBe(false);
    expect(mockBot.chat).toHaveBeenCalledWith('Hello world');
  });

  it('whisper should send private message', async () => {
    const result = await server.callTool('whisper', { username: 'Steve', message: 'Hi' });
    expect(result.isError).toBe(false);
    expect(mockBot.whisper).toHaveBeenCalledWith('Steve', 'Hi');
  });

  it('look_at should call bot.lookAt', async () => {
    await server.callTool('look_at', { x: 50, y: 64, z: -100 });
    expect(mockBot.lookAt).toHaveBeenCalled();
  });

  it('dig_block should return error for null block', async () => {
    (mockBot as any).blockAt = vi.fn().mockReturnValue(null);
    const result = await server.callTool('dig_block', { x: 0, y: 0, z: 0, force: false });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No block found');
  });

  it('dig_block should return error for non-diggable block', async () => {
    (mockBot as any).blockAt = vi.fn().mockReturnValue({ name: 'bedrock', diggable: false });
    (mockBot as any).canDigBlock = vi.fn().mockReturnValue(false);
    const result = await server.callTool('dig_block', { x: 0, y: 0, z: 0, force: false });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not diggable');
  });

  it('dig_block should dig when block is diggable', async () => {
    (mockBot as any).blockAt = vi.fn().mockReturnValue({
      name: 'stone', diggable: true, position: { x: 0, y: 0, z: 0 },
    });
    (mockBot as any).canDigBlock = vi.fn().mockReturnValue(true);
    const result = await server.callTool('dig_block', { x: 0, y: 0, z: 0, force: false });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.dug).toBe(true);
  });

  it('craft_item should return error for unknown item', async () => {
    const result = await server.callTool('craft_item', { itemName: 'nonexistent', count: 1, useCraftingTable: false });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown item');
  });

  it('craft_item should return error when no recipe found', async () => {
    (mockBot as any).registry.itemsByName.oak_planks = { id: 5, name: 'oak_planks' };
    (mockBot as any).recipesFor = vi.fn().mockReturnValue([]);
    const result = await server.callTool('craft_item', { itemName: 'oak_planks', count: 1, useCraftingTable: false });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No recipe found');
  });

  it('equip_item should return error when item not in inventory', async () => {
    (mockBot as any).inventory.items = vi.fn().mockReturnValue([]);
    const result = await server.callTool('equip_item', { itemName: 'diamond_sword', destination: 'hand' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found in inventory');
  });

  it('drop_item should return error when item not in inventory', async () => {
    (mockBot as any).inventory.items = vi.fn().mockReturnValue([]);
    const result = await server.callTool('drop_item', { itemName: 'cobblestone', count: 1 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found in inventory');
  });

  it('use_item should call activateItem', async () => {
    const result = await server.callTool('use_item', {});
    expect(result.isError).toBe(false);
    expect(mockBot.activateItem).toHaveBeenCalled();
  });

  it('pathfind_to should return error when pathfinder not loaded', async () => {
    const noPathfinderBot = createMockBot({ pathfinder: undefined });
    botManager.setBot(noPathfinderBot);
    const result = await server.callTool('pathfind_to', { x: 100, y: 64, z: -200, range: 2 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Pathfinder plugin');
  });

  it('action tools should return error when bot not connected', async () => {
    const emptyManager = new BotManager();
    const emptyServer = new MockMcpServer();
    registerActionTools(emptyServer as any, emptyManager);

    const result = await emptyServer.callTool('chat', { message: 'test' });
    expect(result.isError).toBe(true);
  });
});

describe('HUD tool handlers', () => {
  let botManager: BotManager;
  let mockBot: Bot;
  let server: MockMcpServer;

  beforeEach(() => {
    mockBot = createMockBot();
    botManager = new BotManager();
    botManager.setBot(mockBot);
    server = new MockMcpServer();
    registerHudTools(server as any, botManager);
  });

  it('get_hud should return HUD data', async () => {
    const result = await server.callTool('get_hud');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('health');
    expect(data).toHaveProperty('attackCooldown');
  });

  it('get_attack_cooldown should return cooldown data', async () => {
    const result = await server.callTool('get_attack_cooldown');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('progress');
    expect(data).toHaveProperty('ready');
  });

  it('get_dig_progress should return text when not digging', async () => {
    const result = await server.callTool('get_dig_progress');
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('No block');
  });

  it('get_dig_progress should return progress when digging', async () => {
    (mockBot as any).targetDigBlock = { name: 'stone', position: { x: 100, y: 63, z: -200 } };
    const result = await server.callTool('get_dig_progress');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.blockName).toBe('stone');
  });

  it('should return error when bot not connected', async () => {
    const emptyManager = new BotManager();
    const emptyServer = new MockMcpServer();
    registerHudTools(emptyServer as any, emptyManager);

    const result = await emptyServer.callTool('get_hud');
    expect(result.isError).toBe(true);
  });
});

describe('Event tool handlers', () => {
  let botManager: BotManager;
  let mockBot: Bot;
  let server: MockMcpServer;
  let eventManager: EventManager;

  beforeEach(() => {
    mockBot = createMockBot();
    botManager = new BotManager();
    botManager.setBot(mockBot);
    eventManager = new EventManager();
    server = new MockMcpServer();
    registerEventTools(server as any, botManager, eventManager);
  });

  it('subscribe_events should attach to bot', async () => {
    const result = await server.callTool('subscribe_events');
    expect(result.isError).toBe(false);
    expect(mockBot.on).toHaveBeenCalled();
  });

  it('unsubscribe_events should detach from bot', async () => {
    await server.callTool('subscribe_events');
    const result = await server.callTool('unsubscribe_events');
    expect(result.isError).toBe(false);
  });

  it('get_events should return events after chat', async () => {
    await server.callTool('subscribe_events');
    // The EventManager attaches via bot.on(), and mock bot's on() is a vi.fn()
    // We can't easily emit events through the mock, so just verify flush works
    const result = await server.callTool('get_events', { clear: true });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('events');
    expect(data).toHaveProperty('count');
  });

  it('get_events should return error when bot not connected', async () => {
    const emptyManager = new BotManager();
    const emptyServer = new MockMcpServer();
    const emptyEventManager = new EventManager();
    registerEventTools(emptyServer as any, emptyManager, emptyEventManager);

    const result = await emptyServer.callTool('subscribe_events');
    expect(result.isError).toBe(true);
  });
});

describe('Lifecycle tool handlers', () => {
  it('bot_connect should reject when already connected', async () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_connect', {
      host: 'localhost', port: 25565, username: 'TestBot', version: '1.21.4', auth: 'offline',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already connected');
  });

  it('bot_disconnect should disconnect connected bot', async () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_disconnect');
    expect(result.isError).toBe(false);
    expect(manager.isConnected).toBe(false);
  });

  it('bot_respawn should respawn connected bot', async () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_respawn');
    expect(result.isError).toBe(false);
    expect(mockBot.respawn).toHaveBeenCalled();
  });

  it('bot_disconnect should return error when not connected', async () => {
    const manager = new BotManager();
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_disconnect');
    expect(result.isError).toBe(true);
  });

  it('bot_respawn should return error when not connected', async () => {
    const manager = new BotManager();
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_respawn');
    expect(result.isError).toBe(true);
  });
});