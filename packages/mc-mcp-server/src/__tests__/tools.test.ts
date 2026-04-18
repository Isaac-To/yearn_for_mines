import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BotManager } from '../bot-manager.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBuildTool } from '../tools/build.js';
import { registerCombatTool } from '../tools/combat.js';
import { registerCraftItemsTool } from '../tools/craft_items.js';
import { registerGatherMaterialsTool } from '../tools/gather_materials.js';
import { registerInteractTool } from '../tools/interact.js';
import { registerRepositionTool } from '../tools/reposition.js';
import { buildObservation } from '../observation-builder.js';
import { formatObservation } from '../observation-formatter.js';
import { Vec3 } from 'vec3';

vi.mock('../observation-builder.js', () => ({
  buildObservation: vi.fn(),
}));

vi.mock('../observation-formatter.js', () => ({
  formatObservation: vi.fn(),
}));

vi.mock('vec3', () => ({
  Vec3: class Vec3 {
    x: number; y: number; z: number;
    constructor(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; }
  },
}));

vi.mock('mineflayer-pathfinder', () => ({
  goals: {
    GoalFollow: vi.fn(),
    GoalNear: vi.fn(),
    GoalGetToBlock: vi.fn(),
  }
}));

describe('Macro Tools', () => {
  let server: McpServer;
  let toolHandlers: Record<string, Function> = {};
  let botManager: BotManager;
  let mockBot: any;

  beforeEach(() => {
    mockBot = {
      entity: { position: { x: 0, y: 0, z: 0 }, username: 'bot' },
      registry: {
        blocksByName: { dirt: { id: 1 }, crafting_table: { id: 2 } },
        itemsByName: { iron_pickaxe: { id: 3 } },
      },
      inventory: {
        items: vi.fn().mockReturnValue([{ name: 'dirt', type: 1 }]),
      },
      entities: {
        1: { name: 'zombie' }
      },
      blockAt: vi.fn().mockReturnValue({ name: 'stone' }),
      findBlocks: vi.fn().mockReturnValue([{ x: 1, y: 1, z: 1 }]),
      findBlock: vi.fn().mockReturnValue({ position: { x: 1, y: 1, z: 1 } }),
      equip: vi.fn().mockResolvedValue(true),
      placeBlock: vi.fn().mockResolvedValue(true),
      recipesFor: vi.fn().mockReturnValue([{}]),
      craft: vi.fn().mockResolvedValue(true),
      attack: vi.fn(),
      pathfinder: { goto: vi.fn().mockResolvedValue(true) },
      collectBlock: { collect: vi.fn().mockResolvedValue(true) },
      consume: vi.fn().mockResolvedValue(true),
      sleep: vi.fn().mockResolvedValue(true),
      lookAt: vi.fn().mockResolvedValue(true),
      activateBlock: vi.fn().mockResolvedValue(true),
    };

    botManager = new BotManager(() => mockBot);
    botManager.setBot(mockBot);

    server = new McpServer({ name: 'test', version: '1' });
    
    // @ts-ignore
    const originalTool = server.registerTool ? server.registerTool.bind(server) : server.tool.bind(server);
    (server as any).registerTool = (...args: any[]) => {
        const name = args[0];
        const callback = args[args.length - 1];
        toolHandlers[name] = callback;
        return originalTool(...args);
    };

    registerBuildTool(server, botManager);
    registerCombatTool(server, botManager);
    registerCraftItemsTool(server, botManager);
    registerGatherMaterialsTool(server, botManager);
    registerInteractTool(server, botManager);
    registerRepositionTool(server, botManager);
    
    vi.mocked(buildObservation).mockReturnValue({} as any);
    vi.mocked(formatObservation).mockReturnValue('obs');
  });

  const callTool = async (name: string, args: any) => {
    const handler = toolHandlers[name];
    if (!handler) throw new Error(`Tool ${name} not found. Keys: ${Object.keys(toolHandlers).join(',')}`);
    return await handler(args, { server: server.server, request: {} as any, context: {} as any });
  };

  it('build tool success', async () => {
    const res = await callTool('build', { blockType: 'dirt', targetPos: { x: 0, y: 0, z: 0 } });
    expect(res.isError).toBeFalsy();
    expect(mockBot.equip).toHaveBeenCalled();
    expect(mockBot.placeBlock).toHaveBeenCalled();
  });

  it('combat tool success', async () => {
    mockBot.entities = { '1': { name: 'zombie', type: 'mob', position: { x: 1, y: 1, z: 1 } } };
    const res = await callTool('combat', { target: 'zombie' });
    expect(res.isError).toBeFalsy();
    expect(mockBot.attack).toHaveBeenCalled();
  });

  it('craft items success', async () => {
    const res = await callTool('craft_items', { recipe: 'iron_pickaxe' });
    expect(res.isError).toBeFalsy();
    expect(mockBot.craft).toHaveBeenCalled();
  });

  it('gather materials success', async () => {
    const res = await callTool('gather_materials', { type: 'dirt', amount: 1 });
    expect(res.isError).toBeFalsy();
    expect(mockBot.collectBlock.collect).toHaveBeenCalled();
  });

  it('interact eat success', async () => {
    const res = await callTool('interact', { action: 'eat', target: 'dirt' });
    expect(res.isError).toBeFalsy();
    expect(mockBot.consume).toHaveBeenCalled();
  });

  it('reposition success', async () => {
    mockBot.entities = { '1': { name: 'zombie', type: 'mob', position: { x: 1, y: 1, z: 1 } } };
    const res = await callTool('reposition', { target: 'zombie', isCoordinate: false, distance: 2 });
    expect(res.isError).toBeFalsy();
    expect(mockBot.pathfinder.goto).toHaveBeenCalled();
  });
});
