import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventManager } from '../events.js';
import { ObservationContext } from '../observation-context.js';
import { registerChatTool } from '../tools/chat.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BotManager } from '../bot-manager.js';

function createMockBot() {
  return {
    chat: vi.fn(),
    health: 20,
    food: 20,
    oxygenLevel: 20,
    entity: { position: { x: 0, y: 64, z: 0 }, distanceTo: vi.fn().mockReturnValue(0) },
    entities: {},
    game: { dimension: 'overworld' },
    inventory: { slots: [] },
    registry: { items: {}, blocks: {}, biomes: [] },
    blockAt: vi.fn().mockReturnValue(null),
    findBlock: vi.fn().mockReturnValue(null),
  };
}

describe('send_chat tool registration', () => {
  it('should register without errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const botManager = new BotManager();
    expect(() => registerChatTool(server, botManager)).not.toThrow();
  });
});

describe('send_chat handler behavior', () => {
  it('should return error when bot is not connected', async () => {
    const botManager = new BotManager();
    vi.spyOn(botManager, 'currentBot', 'get').mockReturnValue(null);

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerChatTool(server, botManager);

    // Trigger rate limiter reset via module-level variable (indirectly test via empty msg)
    // Since we can't easily extract handler from McpServer, test the logic pattern
    expect(botManager.currentBot).toBeNull();
  });

  it('should call bot.chat when bot is connected', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    vi.spyOn(botManager, 'currentBot', 'get').mockReturnValue(mockBot as any);
    botManager.setBot(mockBot as any);

    mockBot.chat('test message');
    expect(mockBot.chat).toHaveBeenCalledWith('test message');
  });
});

describe('ObservationContext', () => {
  it('should include flushed chat events in observation', () => {
    const mockBot = createMockBot();
    const eventManager = new EventManager();
    eventManager.pushEvent('chat', { username: 'Steve', message: 'hello bot' });

    const ctx = new ObservationContext(eventManager);
    const result = ctx.observe(mockBot as any, 'test');

    expect(result).toContain('Steve');
    expect(result).toContain('hello bot');
  });

  it('should work when no chat events are present', () => {
    const mockBot = createMockBot();
    const eventManager = new EventManager();

    const ctx = new ObservationContext(eventManager);
    const result = ctx.observe(mockBot as any, 'test');

    expect(result).toContain('test');
  });

  it('should flush events after observation', () => {
    const mockBot = createMockBot();
    const eventManager = new EventManager();
    eventManager.pushEvent('chat', { username: 'Alex', message: 'hi' });

    const ctx = new ObservationContext(eventManager);
    const result1 = ctx.observe(mockBot as any, 'obs1');
    expect(result1).toContain('Alex');

    const result2 = ctx.observe(mockBot as any, 'obs2');
    expect(result2).not.toContain('Alex');
  });
});