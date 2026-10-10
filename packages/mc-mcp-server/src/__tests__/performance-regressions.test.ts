import { describe, it, expect, vi } from 'vitest';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BotManager } from '../bot-manager.js';
import { boundedFindBlocks } from '../bounded-search.js';
import { registerCraftItemsTool } from '../tools/craft_items.js';
import { registerGatherMaterialsTool } from '../tools/gather_materials.js';
import { McpClient, textResult } from '@yearn-for-mines/shared';

describe('performance correctness regressions', () => {
  it('keeps the nearest matches rather than the first matches visited in a section', () => {
    const point = new Vec3(15, 15, 15);
    const bot = {
      entity: { position: point }, game: { minY: 0, height: 32 },
      world: { getColumn: () => ({}) },
      blockAt: (position: Vec3) => ({ type: 1, position: position.clone() }),
    } as unknown as Bot;
    const found = boundedFindBlocks(bot, { matching: 1, maxDistance: 1, count: 4 });
    expect(found[0]).toEqual(point);
    expect(found).toHaveLength(4);
    expect(found.every(position => position.distanceTo(point) <= 1)).toBe(true);
  });

  it('does not call predicate matchers on palette entries or out-of-radius blocks', () => {
    const bot = {
      entity: { position: new Vec3(-1, 0, -1) }, game: { minY: -64, height: 384 },
      world: { getColumn: () => ({}) },
      blockAt: (position: Vec3) => ({ type: 2, position: position.clone() }),
    } as unknown as Bot;
    const predicate = vi.fn(block => {
      expect(block.position.distanceTo(bot.entity.position)).toBeLessThanOrEqual(2);
      return true;
    });
    const found = boundedFindBlocks(bot, { matching: predicate, maxDistance: 2, count: 2 });
    expect(found[0]).toEqual(bot.entity.position);
    expect(predicate).toHaveBeenCalled();
  });

  it('retains action ownership after cancellation until the operation settles', async () => {
    const manager = new BotManager();
    const controller = new AbortController();
    let release!: () => void;
    let operationSignal!: AbortSignal;
    const running = manager.runAction(controller.signal, async signal => {
      operationSignal = signal;
      await new Promise<void>(resolve => { release = resolve; });
      signal.throwIfAborted();
      return textResult('done');
    });
    controller.abort();
    expect(operationSignal.aborted).toBe(true);
    const second = vi.fn(async () => textResult('overlap'));
    expect((await manager.runAction(new AbortController().signal, second)).isError).toBe(true);
    expect(second).not.toHaveBeenCalled();
    release();
    expect((await running).isError).toBe(true);
    expect((await manager.runAction(new AbortController().signal, async () => textResult('next'))).isError).toBe(false);
  });

  it('uses real MCP schemas and converts desired planks into recipe executions', async () => {
    const inventory = new Map([['oak_log', 10], ['oak_planks', 2]]);
    const recipe = { requiresTable: false, result: { id: 2, count: 4 }, delta: [{ id: 1, count: -1 }, { id: 2, count: 4 }] };
    const craft = vi.fn(async (_recipe, executions: number) => {
      inventory.set('oak_log', inventory.get('oak_log')! - executions);
      inventory.set('oak_planks', inventory.get('oak_planks')! + executions * 4);
    });
    const bot = {
      entity: { position: new Vec3(0, 64, 0) }, health: 20, food: 20,
      inventory: { items: () => [...inventory].map(([name, count]) => ({ name, count })) },
      registry: { itemsByName: { oak_log: { id: 1 }, oak_planks: { id: 2 } }, items: { 1: { name: 'oak_log' }, 2: { name: 'oak_planks' } }, blocksByName: {} },
      recipesAll: () => [recipe], craft,
    } as unknown as Bot;
    const manager = new BotManager(); manager.setBot(bot);
    const server = new McpServer({ name: 'regression', version: '1' });
    registerCraftItemsTool(server, manager);
    const client = new Client({ name: 'test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a); await client.connect(b);
    try {
      const result = await client.callTool({ name: 'craft_items', arguments: { recipe: 'oak_planks', amount: 6 } });
      expect(result.isError).toBe(false);
      expect(craft).toHaveBeenCalledWith(recipe, 1, undefined);
      expect(inventory.get('oak_planks')).toBe(6);
      await client.callTool({ name: 'craft_items', arguments: { recipe: 'oak_planks', amount: 6 } });
      expect(craft).toHaveBeenCalledTimes(1);
      const failure = await client.callTool({ name: 'craft_items', arguments: { recipe: 'missing_item', amount: 1 } });
      expect(failure.isError).toBe(true);
    } finally { await client.close(); await server.close(); }
  });

  it('propagates an MCP timeout to the server action without allowing overlap', async () => {
    const manager = new BotManager();
    const server = new McpServer({ name: 'cancellation', version: '1' });
    let release!: () => void;
    let signal!: AbortSignal;
    server.registerTool('long_action', { inputSchema: {} }, async (_args, extra) => manager.runAction(extra.signal, async actionSignal => {
      signal = actionSignal;
      await new Promise<void>(resolve => { release = resolve; });
      actionSignal.throwIfAborted();
      return textResult('done');
    }));
    const client = new McpClient({ name: 'test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a); await client.connect(b);
    try {
      const timedOut = await client.callTool('long_action', {}, { timeoutMs: 30 });
      expect(timedOut.isError).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(signal.aborted).toBe(true);
      const busy = await client.callTool('long_action', {}, { timeoutMs: 1000 });
      expect(busy.content[0]).toMatchObject({ text: expect.stringContaining('[BUSY]') });
      release();
      await new Promise(resolve => setTimeout(resolve, 10));
    } finally { release?.(); await client.disconnect(); await server.close(); }
  });

  it('gathers beyond the former ten-block limit and preserves species requirements', async () => {
    let count = 0;
    let rounds = 0;
    const bot = {
      entity: { position: new Vec3(0, 64, 0) }, health: 20, food: 20,
      inventory: { items: () => [{ name: 'oak_log', count }, { name: 'spruce_log', count: 64 }] },
      registry: { blocksByName: { oak_log: { id: 1 }, spruce_log: { id: 2 } } },
      findBlocks: () => Array.from({ length: 4 }, (_, i) => new Vec3(++rounds, 64, i)),
      blockAt: (position: Vec3) => ({ type: 1, name: 'oak_log', position }),
      collectBlock: { collect: async (blocks: unknown[]) => { count += blocks.length; } },
    } as unknown as Bot;
    const manager = new BotManager(); manager.setBot(bot);
    const server = new McpServer({ name: 'gather-test', version: '1' });
    registerGatherMaterialsTool(server, manager);
    const client = new Client({ name: 'test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a); await client.connect(b);
    try {
      const result = await client.callTool({ name: 'gather_materials', arguments: { type: 'oak_log', amount: 24 } });
      expect(result.isError).toBe(false);
      expect(count).toBe(24);
    } finally { await client.close(); await server.close(); }
  });
});
