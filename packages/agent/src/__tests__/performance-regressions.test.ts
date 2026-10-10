import { describe, it, expect, vi } from 'vitest';
import { LlmClient, type McpClient, type LlmMessage } from '@yearn-for-mines/shared';
import { AgentLoop } from '../agent-loop.js';
import { pruneHistory, inventoryGoalMet, actionSignature } from '../context.js';
import { RunTelemetry } from '../telemetry.js';

describe('harness regressions', () => {
  it('prunes complete multi-tool turns and never leaves orphan results', () => {
    const messages: LlmMessage[] = [{ role: 'system', content: 'rules' }];
    for (let i = 0; i < 30; i++) {
      messages.push({ role: 'user', content: 'state'.repeat(100) });
      messages.push({ role: 'assistant', tool_calls: [0, 1, 2].map(n => ({ id: `${i}-${n}`, type: 'function', function: { name: 'action', arguments: '{}' } })) });
      for (let n = 0; n < 3; n++) messages.push({ role: 'tool', tool_call_id: `${i}-${n}`, content: 'result'.repeat(100) });
    }
    const pruned = pruneHistory(messages, 2000);
    expect(pruned.length).toBeLessThan(messages.length);
    expect(pruned[1].role).toBe('user');
    const ids = pruned.flatMap(message => message.tool_calls?.map(call => call.id) ?? []);
    expect(pruned.filter(message => message.role === 'tool').map(message => message.tool_call_id)).toEqual(ids);
  });
  it('checks complete inventory totals and rejects disconnected or malformed states', () => {
    const target = { iron_pickaxe: 2 };
    expect(inventoryGoalMet(JSON.stringify({ connected: true, inventory: [{ name: 'iron_pickaxe', count: 1 }, { name: 'iron_pickaxe', count: 1 }] }), target)).toBe(true);
    expect(inventoryGoalMet(JSON.stringify({ connected: false, inventory: [{ name: 'iron_pickaxe', count: 2 }] }), target)).toBe(false);
    expect(inventoryGoalMet('Goal successfully achieved', target)).toBe(false);
  });
  it('ignores IDs and argument key order when detecting repeated actions', () => {
    expect(actionSignature([{ name: 'gather', args: { type: 'stone', amount: 3 } }]))
      .toBe(actionSignature([{ name: 'gather', args: { amount: 3, type: 'stone' } }]));
  });
  it('stops the dependent batch after failure and reports every call ID before replanning', async () => {
    const client = {
      listTools: vi.fn(async () => [{ name: 'gather_materials' }, { name: 'craft_items' }]),
      callTool: vi.fn(async (name: string) => ({ content: [{ type: 'text', text: name === 'bot_status' ? '{"connected":true,"inventory":[]}' : 'Missing pickaxe' }], isError: name !== 'bot_status' })),
    } as unknown as McpClient;
    const llm = new LlmClient({ baseUrl: 'http://localhost:1/v1', model: 'test' });
    const chat = vi.spyOn(llm, 'chat').mockImplementation(async messages => {
      if (messages.filter(message => message.role === 'assistant').length) {
        const tools = messages.filter(message => message.role === 'tool');
        expect(tools.map(message => message.tool_call_id)).toEqual(['first', 'second']);
        expect(tools[1].content).toContain('Skipped');
      }
      return { choices: [{ message: { tool_calls: ['first', 'second'].map((id, index) => ({
        id, type: 'function', function: { name: index ? 'craft_items' : 'gather_materials', arguments: '{}' },
      })) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    });
    const loop = new AgentLoop(client, llm, { goal: 'get iron pickaxe', goalItems: { iron_pickaxe: 1 }, maxIterations: 2, loopDelayMs: 0 });
    const steps = await loop.run();
    expect(steps.every(step => !step.goalAchieved)).toBe(true);
    expect(client.callTool).not.toHaveBeenCalledWith('craft_items', expect.anything(), expect.anything());
    expect(chat).toHaveBeenCalledTimes(2);
    expect(loop.metrics).toMatchObject({ llmCalls: 2, promptTokens: 20, completionTokens: 10, tokenUsageComplete: true });
  });
  it('counts failed requests and distinguishes missing usage from zero tokens', () => {
    const telemetry = new RunTelemetry();
    telemetry.recordLlm('plan', 20, undefined, 'timeout');
    telemetry.recordLlm('reflect', 30, { choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } });
    expect(telemetry.summary(1, false)).toMatchObject({ llmCalls: 2, failedLlmCalls: 1, inferenceMs: 50, tokenUsageComplete: false, promptTokens: 5 });
  });
  it('stop aborts an active request even when an external signal was provided', async () => {
    const external = new AbortController();
    let signal!: AbortSignal;
    const client = { listTools: vi.fn(async () => []), callTool: vi.fn(async () => ({ content: [{ type: 'text', text: '{"connected":true,"inventory":[]}' }], isError: false })) } as unknown as McpClient;
    const llm = new LlmClient({ baseUrl: 'http://localhost:1/v1', model: 'test' });
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    vi.spyOn(llm, 'chat').mockImplementation(async (_messages, _tools, _vision, options) => {
      signal = options!.signal!;
      entered();
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      return {};
    });
    const loop = new AgentLoop(client, llm, { goal: 'test', signal: external.signal });
    const running = loop.run();
    await ready; loop.stop(); await running;
    expect(signal.aborted).toBe(true);
    expect(external.signal.aborted).toBe(false);
    expect(loop.isRunning).toBe(false);
    expect(loop.totalLlmCalls).toBe(1);
  });
});
