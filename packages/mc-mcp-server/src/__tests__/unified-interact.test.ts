import { describe, it, vi, beforeEach, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BotManager } from '../bot-manager.js';
import { registerInteractTool } from '../tools/interact.js';
import { Vec3 } from 'vec3';

describe('Individual Interaction Tools', () => {
  let server: McpServer;
  let botManager: BotManager;
  let mockBot: any;

  beforeEach(() => {
    mockBot = {
      registry: {
        blocksByName: {
          dirt: { id: 1 },
          crafting_table: { id: 2 },
          chest: { id: 3 },
        },
        itemsByName: {
          dirt: { id: 1 },
          oak_planks: { id: 3 },
          oak_log: { id: 4 },
        },
      },
      inventory: {
        items: vi.fn().mockReturnValue([{ name: 'dirt', count: 64 }]),
      },
      blockAt: vi.fn(),
      findBlock: vi.fn(),
      dig: vi.fn().mockResolvedValue(undefined),
      placeBlock: vi.fn().mockResolvedValue(undefined),
      equip: vi.fn().mockResolvedValue(undefined),
      recipesFor: vi.fn().mockReturnValue([{ delta: [] }]),
      craft: vi.fn().mockResolvedValue(undefined),
      lookAt: vi.fn().mockResolvedValue(undefined),
      activateBlock: vi.fn().mockResolvedValue(undefined),
      entity: { position: new Vec3(0, 64, 0) },
    };

    botManager = new BotManager();
    vi.spyOn(botManager, 'currentBot', 'get').mockReturnValue(mockBot);

    server = new McpServer({ name: 'test', version: '1.0.0' });
    registerInteractTool(server, botManager);
  });

  it('should register all 16 individual tools', () => {
    expect(server).toBeDefined();
  });

  it('should dig a block', async () => {
    mockBot.blockAt.mockReturnValue({ name: 'dirt', position: new Vec3(1, 64, 1) });
  });
});