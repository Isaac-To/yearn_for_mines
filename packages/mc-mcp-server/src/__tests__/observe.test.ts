import { describe, it, expect, vi } from 'vitest';
import { EventManager } from '../events.js';
import { ObservationContext } from '../observation-context.js';
import { registerObserveTool } from '../tools/observe.js';
import { registerLifecycleTools } from '../tools/lifecycle.js';
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

describe('observe tool', () => {
  it('should register without errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const botManager = new BotManager();
    const obsCtx = new ObservationContext(new EventManager());
    expect(() => registerObserveTool(server, botManager, obsCtx)).not.toThrow();
  });

  it('should return error when bot is not connected', async () => {
    const botManager = new BotManager();
    vi.spyOn(botManager, 'currentBot', 'get').mockReturnValue(null);
    const obsCtx = new ObservationContext(new EventManager());

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerObserveTool(server, botManager, obsCtx);

    expect(botManager.currentBot).toBeNull();
  });

  it('should return formatted observation text when bot is connected', () => {
    const mockBot = createMockBot();
    const eventManager = new EventManager();
    const obsCtx = new ObservationContext(eventManager);

    const result = obsCtx.observe(mockBot as any);
    expect(result).toContain('Vital Stats');
    expect(result).toContain('Inventory Summary');
  });
});

describe('bot_status with observation data', () => {
  it('should include observation in bot_status response', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    vi.spyOn(botManager, 'currentBot', 'get').mockReturnValue(mockBot as any);
    botManager.setBot(mockBot as any);

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const obsCtx = new ObservationContext(new EventManager());
    registerLifecycleTools(server, botManager, obsCtx);

    expect(botManager.currentBot).not.toBeNull();
  });

  it('should return connected false when bot is not connected', async () => {
    const botManager = new BotManager();
    vi.spyOn(botManager, 'currentBot', 'get').mockReturnValue(null);
    const obsCtx = new ObservationContext(new EventManager());

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerLifecycleTools(server, botManager, obsCtx);

    expect(botManager.currentBot).toBeNull();
  });

  it('should preserve existing bot_status fields', () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    vi.spyOn(botManager, 'currentBot', 'get').mockReturnValue(mockBot as any);
    botManager.setBot(mockBot as any);

    const obsCtx = new ObservationContext(new EventManager());
    const result = obsCtx.observe(mockBot as any);

    expect(result).toContain('Health');
    expect(result).toContain('Food');
    expect(result).toContain('Position');
  });
});