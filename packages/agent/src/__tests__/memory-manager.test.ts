import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryManager, inferSkillRoom } from '../memory-manager.js';
import { McpClient } from '@yearn-for-mines/shared';
import type { ToolCall } from '@yearn-for-mines/shared';

function mockToolResult(text: string, isError: boolean = false) {
  return {
    content: [{ type: 'text' as const, text }],
    isError,
  };
}

function createMockClient(): McpClient {
  return {
    isConnected: true,
    callTool: vi.fn().mockResolvedValue(mockToolResult('OK')),
    listTools: vi.fn().mockResolvedValue([]),
    connect: vi.fn(),
    disconnect: vi.fn(),
    readResource: vi.fn(),
  } as unknown as McpClient;
}

describe('MemoryManager', () => {
  let client: McpClient;
  let manager: MemoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    manager = new MemoryManager(client);
  });

  describe('initialization', () => {
    it('should report connected when client is connected', () => {
      expect(manager.isConnected).toBe(true);
    });

    it('should return the underlying client', () => {
      expect(manager.getClient()).toBe(client);
    });
  });

  describe('wing/room initialization', () => {
    it('should create minecraft-skills and minecraft-knowledge rooms', async () => {
      await manager.initialize();

      const calls = (client.callTool as ReturnType<typeof vi.fn>).mock.calls;
      const roomNames = calls.map((c: any) => c[1]?.room).filter(Boolean);

      expect(roomNames).toContain('wood-gathering');
      expect(roomNames).toContain('crafting');
      expect(roomNames).toContain('mining');
      expect(roomNames).toContain('navigation');
      expect(roomNames).toContain('combat');
      expect(roomNames).toContain('farming');
      expect(roomNames).toContain('survival');
      expect(roomNames).toContain('blocks');
      expect(roomNames).toContain('items');
      expect(roomNames).toContain('mobs');
      expect(roomNames).toContain('recipes');
      expect(roomNames).toContain('biomes');
      expect(roomNames).toContain('mechanics');
    });

    it('should skip initialization if already done', async () => {
      await manager.initialize();
      const callCount1 = (client.callTool as ReturnType<typeof vi.fn>).mock.calls.length;

      await manager.initialize();
      const callCount2 = (client.callTool as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(callCount2).toBe(callCount1);
    });

    it('should handle initialization failure gracefully', async () => {
      (client.callTool as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed'));
      await expect(manager.initialize()).resolves.toBeUndefined();
    });
  });

  describe('skill storage', () => {
    it('should store a skill as a drawer', async () => {
      (client.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('No existing drawers')) // duplicate check
        .mockResolvedValueOnce(mockToolResult('Drawer added')); // add_drawer

      const result = await manager.storeSkill('gather wood', [
        { id: 'tc1', name: 'pathfind_to', args: { x: 10, y: 64, z: 5 } },
        { id: 'tc2', name: 'dig_block', args: { block: 'oak_log' } },
      ], 'wood-gathering');

      expect(result).toBe(true);
    });

    it('should not store duplicate skills', async () => {
      (client.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('gather wood - existing skill')); // duplicate check

      const result = await manager.storeSkill('gather wood', [], 'wood-gathering');
      expect(result).toBe(false);
    });

    it('should handle storage failure', async () => {
      (client.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('No existing'))
        .mockRejectedValueOnce(new Error('Storage failed'));

      const result = await manager.storeSkill('test', [], 'survival');
      expect(result).toBe(false);
    });
  });

  describe('skill retrieval', () => {
    it('should search MemPalace for relevant skills', async () => {
      (client.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('Found: gather wood skill'));

      const result = await manager.retrieveSkills('gather wood');
      expect(result).toContain('gather wood');
    });

    it('should return undefined on failure', async () => {
      (client.callTool as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed'));

      const result = await manager.retrieveSkills('test');
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty results', async () => {
      (client.callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockToolResult(''));

      const result = await manager.retrieveSkills('test');
      expect(result).toBeUndefined();
    });
  });

  describe('knowledge graph', () => {
    it('should add facts to the KG', async () => {
      const result = await manager.addFact('stone', 'dug_with', 'pickaxe', 'blocks');
      expect(result).toBe(true);
    });

    it('should query facts from the KG', async () => {
      (client.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('stone: dug_with pickaxe'));

      const result = await manager.queryFacts('stone');
      expect(result).toContain('pickaxe');
    });

    it('should invalidate outdated facts', async () => {
      const result = await manager.invalidateFact('fact_123');
      expect(result).toBe(true);
    });

    it('should handle KG failures gracefully', async () => {
      (client.callTool as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed'));

      expect(await manager.addFact('a', 'b', 'c', 'blocks')).toBe(false);
      expect(await manager.queryFacts()).toBeUndefined();
      expect(await manager.invalidateFact('x')).toBe(false);
    });
  });

  describe('diary entries', () => {
    it('should write failure descriptions', async () => {
      const result = await manager.writeFailure(
        'gather wood',
        'Tool not found',
        [{ id: '1', name: 'dig_block', args: {} }],
      );
      expect(result).toBe(true);
    });

    it('should write milestone records', async () => {
      const result = await manager.writeMilestone('gather wood', 'Collected 10 oak logs');
      expect(result).toBe(true);
    });

    it('should handle diary write failures', async () => {
      (client.callTool as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed'));
      expect(await manager.writeFailure('test', 'err', [])).toBe(false);
      expect(await manager.writeMilestone('test', 'details')).toBe(false);
    });
  });

  describe('knowledge bootstrap', () => {
    it('should seed Minecraft knowledge on first run', async () => {
      (client.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('')) // KG query - no bootstrap
        .mockResolvedValue(mockToolResult('OK')); // all add_fact calls

      await manager.bootstrapKnowledge();

      const calls = (client.callTool as ReturnType<typeof vi.fn>).mock.calls;
      const addFactCalls = calls.filter((c: any) => c[0] === 'mempalace_kg_add');
      expect(addFactCalls.length).toBeGreaterThan(0);
    });

    it('should skip bootstrap if already done', async () => {
      (client.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('bootstrap_version v1')); // KG query finds v1

      await manager.bootstrapKnowledge();

      const calls = (client.callTool as ReturnType<typeof vi.fn>).mock.calls;
      // Should only have the query call, no add_fact calls
      expect(calls.length).toBe(1);
    });

    it('should handle bootstrap failure gracefully', async () => {
      (client.callTool as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed'));
      await expect(manager.bootstrapKnowledge()).resolves.toBeUndefined();
    });
  });

  describe('formatSkillSequence', () => {
    it('should format tool calls as a readable skill sequence', () => {
      const toolCalls: ToolCall[] = [
        { id: '1', name: 'find_block', args: { type: 'oak_log' } },
        { id: '2', name: 'pathfind_to', args: { x: 10, y: 64, z: 5 } },
        { id: '3', name: 'dig_block', args: { position: { x: 10, y: 64, z: 5 } } },
      ];

      const result = manager.formatSkillSequence('gather wood', toolCalls);
      expect(result).toContain('Goal: gather wood');
      expect(result).toContain('Step 1: find_block');
      expect(result).toContain('Step 2: pathfind_to');
      expect(result).toContain('Step 3: dig_block');
    });
  });
});

describe('inferSkillRoom', () => {
  it('should infer wood-gathering for tree-related goals', () => {
    expect(inferSkillRoom('find a tree and gather wood')).toBe('wood-gathering');
    expect(inferSkillRoom('chop oak logs')).toBe('wood-gathering');
  });

  it('should infer crafting for craft-related goals', () => {
    expect(inferSkillRoom('craft a stone pickaxe')).toBe('crafting');
    expect(inferSkillRoom('make a crafting table')).toBe('crafting');
  });

  it('should infer mining for dig-related goals', () => {
    expect(inferSkillRoom('mine for diamonds')).toBe('mining');
    expect(inferSkillRoom('dig a tunnel')).toBe('mining');
  });

  it('should infer navigation for movement goals', () => {
    expect(inferSkillRoom('navigate to the village')).toBe('navigation');
    expect(inferSkillRoom('find a desert biome')).toBe('navigation');
  });

  it('should infer combat for fight-related goals', () => {
    expect(inferSkillRoom('fight a zombie')).toBe('combat');
    expect(inferSkillRoom('kill the skeleton')).toBe('combat');
  });

  it('should infer farming for plant-related goals', () => {
    expect(inferSkillRoom('farm wheat')).toBe('farming');
    expect(inferSkillRoom('plant seeds')).toBe('farming');
  });

  it('should default to survival', () => {
    expect(inferSkillRoom('survive the night')).toBe('survival');
    expect(inferSkillRoom('build a shelter')).toBe('survival');
  });
});