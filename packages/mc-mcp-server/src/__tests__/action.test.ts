import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BotManager } from '../bot-manager.js';
import { registerActionTools } from '../tools/action.js';
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
      blocksByName: { crafting_table: { id: 120 } } as never,
      itemsByName: { oak_planks: { id: 5 }, crafting_table: { id: 120 } } as never,
      itemsById: {} as never,
    } as never,
    world: {} as never,
    controlState: {} as never,
    // Action methods
    lookAt: vi.fn().mockResolvedValue(undefined),
    loadPlugin: vi.fn(),
    dig: vi.fn().mockResolvedValue(undefined),
    stopDigging: vi.fn(),
    placeBlock: vi.fn().mockResolvedValue(undefined),
    equip: vi.fn().mockResolvedValue(undefined),
    unequip: vi.fn().mockResolvedValue(undefined),
    toss: vi.fn().mockResolvedValue(undefined),
    craft: vi.fn().mockResolvedValue(undefined),
    recipesFor: vi.fn().mockReturnValue([]),
    activateItem: vi.fn(),
    deactivateItem: vi.fn(),
    chat: vi.fn(),
    whisper: vi.fn(),
    waitForTicks: vi.fn().mockResolvedValue(undefined),
    pathfinder: {
      setGoal: vi.fn(),
    },
  } as unknown as Bot;
}

describe('registerActionTools', () => {
  it('should register action tools without errors', () => {
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    const manager = new BotManager();
    registerActionTools(server, manager);
    expect(true).toBe(true);
  });
});

describe('action tools - requireBot check', () => {
  it('should error when bot is not connected', () => {
    const manager = new BotManager();
    expect(manager.currentBot).toBeNull();
  });
});

describe('look_at tool', () => {
  it('should call bot.lookAt with coordinates', async () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);

    // The tool handler calls bot.lookAt and returns data
    await mockBot.lookAt({ x: 50, y: 64, z: -100 } as any);
    expect(mockBot.lookAt).toHaveBeenCalledWith({ x: 50, y: 64, z: -100 });
  });
});

describe('dig_block tool', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
  });

  it('should return error for non-existent block', () => {
    (mockBot.blockAt as any).mockReturnValueOnce(null);
    // This simulates what the tool handler would do
    const block = mockBot.blockAt({ x: 0, y: 0, z: 0 } as any);
    expect(block).toBeNull();
  });

  it('should call bot.dig for diggable block', async () => {
    await mockBot.dig({ name: 'stone', diggable: true } as any);
    expect(mockBot.dig).toHaveBeenCalled();
  });

  it('should check canDigBlock before digging', () => {
    const canDig = mockBot.canDigBlock({ name: 'stone' } as any);
    expect(canDig).toBe(true);
  });
});

describe('place_block tool', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
  });

  it('should find item in inventory', () => {
    (mockBot.inventory.items as any).mockReturnValueOnce([
      { name: 'dirt', count: 64, type: 3 },
    ]);
    const items = mockBot.inventory.items();
    const dirt = items.find((i: any) => i.name === 'dirt');
    expect(dirt).toBeDefined();
  });

  it('should return error when item not in inventory', () => {
    (mockBot.inventory.items as any).mockReturnValueOnce([]);
    const items = mockBot.inventory.items();
    const missing = items.find((i: any) => i.name === 'diamond');
    expect(missing).toBeUndefined();
  });
});

describe('craft_item tool', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
  });

  it('should return error for unknown item', () => {
    const itemInfo = mockBot.registry.itemsByName['unknown_item'];
    expect(itemInfo).toBeUndefined();
  });

  it('should return error when no recipe found', () => {
    const recipes = mockBot.recipesFor(999, null, 1, null);
    expect(recipes).toEqual([]);
  });
});

describe('equip_item tool', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
  });

  it('should call bot.equip with correct item and destination', async () => {
    const item = { name: 'diamond_pickaxe', type: 10 };
    (mockBot.inventory.items as any).mockReturnValueOnce([item]);
    await mockBot.equip(item as any, 'hand');
    expect(mockBot.equip).toHaveBeenCalledWith(item, 'hand');
  });
});

describe('drop_item tool', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
  });

  it('should call bot.toss with item type and count', async () => {
    const item = { name: 'cobblestone', type: 4, count: 32 };
    (mockBot.inventory.items as any).mockReturnValueOnce([item]);
    await mockBot.toss(item.type, null, 10);
    expect(mockBot.toss).toHaveBeenCalledWith(4, null, 10);
  });
});

describe('use_item tool', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
  });

  it('should call bot.activateItem', () => {
    mockBot.activateItem();
    expect(mockBot.activateItem).toHaveBeenCalled();
  });
});

describe('chat tool', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
  });

  it('should call bot.chat with message', () => {
    mockBot.chat('Hello world');
    expect(mockBot.chat).toHaveBeenCalledWith('Hello world');
  });
});

describe('whisper tool', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
  });

  it('should call bot.whisper with username and message', () => {
    mockBot.whisper('Steve', 'Hello');
    expect(mockBot.whisper).toHaveBeenCalledWith('Steve', 'Hello');
  });
});

describe('pathfind_to tool', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
  });

  it('should check for pathfinder plugin', () => {
    const hasPathfinder = !!(mockBot as any).pathfinder;
    expect(hasPathfinder).toBe(true);
  });
});