import { describe, expect, it, vi } from 'vitest';
import { LlmClient, type McpClient, type LlmResponse } from '@yearn-for-mines/shared';
import { AgentLoop } from '../agent-loop.js';
import { palaceFixture } from './memory-fixture.js';

const ok = (data: unknown, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(data) }], isError });
const plan = (name: string, args: Record<string, unknown>, id = 'action'): LlmResponse & Record<string, unknown> => ({ choices: [{ message: { tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
const options = { goal: 'Obtain one wooden_pickaxe', goalItems: { wooden_pickaxe: 1 }, botConfig: { version: '1.21.4' },
  memoryNamespace: 'test-library', maxIterations: 5, loopDelayMs: 0, enableChatNarration: false, enableChatResponse: false };
function minecraft() {
  let crafted = false;
  const callTool = vi.fn(async (name: string) => {
    if (name === 'craft_items') { crafted = true; return ok({ targetReached: true, inventory: [{ name: 'wooden_pickaxe', count: 1 }] }); }
    return ok({ connected: true, inventory: crafted ? [{ name: 'wooden_pickaxe', count: 1 }] : [] });
  });
  return { callTool, client: { isConnected: true, callTool, listTools: async () => [{ name: 'craft_items', description: 'craft', inputSchema: { type: 'object' } }] } as unknown as McpClient };
}
function llm() { return new LlmClient({ baseUrl: 'http://unused.test', model: 'test' }); }

describe('agent learns and reuses action memories', () => {
  it('saves verified actions even if reflection fails, and a later run can inspect them', async () => {
    const palace = palaceFixture();
    const firstLlm = llm();
    vi.spyOn(firstLlm, 'chat').mockResolvedValueOnce(plan('craft_items', { item: 'wooden_pickaxe', amount: 1 })).mockRejectedValueOnce(new Error('Reflection unavailable'));
    const first = new AgentLoop(minecraft().client, firstLlm, options, palace.client);
    const events: Record<string, unknown>[] = [];
    first.setMemoryCallback(event => events.push(event));
    await first.run();
    const card = [...palace.drawers.values()].find(d => d.wing === 'test-library-skills');
    expect(card).toBeDefined();
    const id = JSON.parse(card!.content).id;
    expect(JSON.parse(card!.content)).toMatchObject({ outcome: 'success', verification: 'inventory', actionCount: 1 });
    expect(events.some(e => e.operation === 'saved')).toBe(true);
    const writes = palace.drawers.size;

    const secondLlm = llm();
    const secondChat = vi.spyOn(secondLlm, 'chat')
      .mockResolvedValueOnce(plan('read_memory', { id }, 'read'))
      .mockResolvedValueOnce(plan('craft_items', { item: 'wooden_pickaxe', amount: 1 }, 'craft'));
    const secondMc = minecraft();
    const second = new AgentLoop(secondMc.client, secondLlm, { ...options, memoryMode: 'read-only' }, palace.client);
    await second.run();
    expect(second.metrics).toMatchObject({ achieved: true, actionCalls: 1, memory: { reads: 1, hits: 1, writes: 0 } });
    expect(palace.drawers.size).toBe(writes);
    expect(secondMc.callTool.mock.calls.some(([name]) => name === 'read_memory')).toBe(false);
    const context = JSON.stringify(secondChat.mock.calls);
    expect(context).toContain(id);
    expect(context).toContain('targetReached');
  });

  it('records failed and skipped actions separately and refreshes memory after failure', async () => {
    const palace = palaceFixture();
    const mc = minecraft();
    mc.callTool.mockImplementation(async (name: string) => name === 'bot_status' ? ok({ connected: true, inventory: [] }) : ok({ error: 'Missing sticks' }, true));
    const model = llm();
    const batch = plan('craft_items', { item: 'wooden_pickaxe', amount: 1 });
    batch.choices[0].message.tool_calls!.push({ id: 'dependent', type: 'function', function: { name: 'craft_items', arguments: '{"item":"wooden_axe","amount":1}' } });
    vi.spyOn(model, 'chat').mockResolvedValueOnce(batch).mockResolvedValueOnce(plan('craft_items', { item: 'stick', amount: 2 })).mockResolvedValue({ choices: [{ message: { content: 'not valid reflection' } }] });
    const loop = new AgentLoop(mc.client, model, { ...options, maxIterations: 2 }, palace.client);
    await loop.run();
    expect(loop.metrics).toMatchObject({ memory: { searches: 2 } });
    const trace = [...palace.drawers.values()].filter(d => d.wing.endsWith('-episodes')).map(d => JSON.parse(d.content).payload).join('');
    expect(JSON.parse(trace).actions.map((a: { status: string }) => a.status)).toEqual(['failed', 'skipped', 'failed']);
    expect(JSON.parse(trace).outcome).toBe('failure');
  });

  it('records an interrupted in-flight action without calling reflection or claiming success', async () => {
    const palace = palaceFixture();
    const mc = minecraft();
    const controller = new AbortController();
    mc.callTool.mockImplementation(async (name: string) => {
      if (name === 'craft_items') { controller.abort(); throw new DOMException('stopped', 'AbortError'); }
      return ok({ connected: true, inventory: [] });
    });
    const model = llm();
    const chat = vi.spyOn(model, 'chat').mockResolvedValue(plan('craft_items', { item: 'wooden_pickaxe', amount: 1 }));
    const loop = new AgentLoop(mc.client, model, { ...options, signal: controller.signal }, palace.client);
    await loop.run();
    expect(chat).toHaveBeenCalledTimes(1);
    const card = [...palace.drawers.values()].find(d => d.wing.endsWith('-failures'));
    expect(JSON.parse(card!.content)).toMatchObject({ outcome: 'interrupted', verification: 'none', actionCount: 1 });
    expect(JSON.parse(card!.content).actions[0]).toContain('interrupted');
  });

  it('refuses required-memory runs before planning if MemPalace is unavailable', async () => {
    const palace = palaceFixture(); palace.setUnavailable(true);
    const model = llm(); const chat = vi.spyOn(model, 'chat');
    const mc = minecraft();
    const loop = new AgentLoop(mc.client, model, { ...options, memoryRequired: true }, palace.client);
    await expect(loop.run()).rejects.toThrow('required but unavailable');
    expect(chat).not.toHaveBeenCalled();
    expect(mc.callTool).not.toHaveBeenCalled();
  });
});
