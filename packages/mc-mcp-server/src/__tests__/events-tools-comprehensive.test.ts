import { describe, it, expect, vi } from 'vitest';
import { BotManager } from '../bot-manager.js';
import { registerEventTools } from '../tools/events.js';
import { EventManager } from '../events.js';

// Mock McpServer that captures tool handlers for direct invocation
class MockMcpServer {
  tools: Map<string, { handler: (...args: any[]) => Promise<any> }> = new Map();

  registerTool(name: string, _schema: any, handler: (...args: any[]) => Promise<any>) {
    this.tools.set(name, { handler });
  }

  registerResource(_name: string, _uri: string, _config: any, _callback: any) {
    // No-op
  }

  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool.handler(args);
  }
}

function createMockBot(): any {
  const listeners: Map<string, ((...args: any[]) => any)[]> = new Map();
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
    },
    health: 20,
    food: 18,
    foodSaturation: 5.0,
    isRaining: false,
    rainState: 0,
    thunderState: 0,
    experience: { level: 5, points: 50, progress: 0.5 },
    on: vi.fn((event: string, handler: (...args: any[]) => any) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    off: vi.fn((event: string, handler: (...args: any[]) => any) => {
      const list = listeners.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
    }),
    once: vi.fn(),
    _emit(event: string, ...args: any[]) {
      const list = listeners.get(event);
      if (list) {
        for (const handler of list) {
          handler(...args);
        }
      }
    },
  };
}

describe('Event tools - subscribe_events', () => {
  it('should attach event manager to bot', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const eventManager = new EventManager();
    const server = new MockMcpServer();
    registerEventTools(server as any, botManager, eventManager);

    const result = await server.callTool('subscribe_events');
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Subscribed');
    expect(mockBot.on).toHaveBeenCalled();
  });

  it('should return error when bot not connected', async () => {
    const botManager = new BotManager();
    const eventManager = new EventManager();
    const server = new MockMcpServer();
    registerEventTools(server as any, botManager, eventManager);

    const result = await server.callTool('subscribe_events');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not connected');
  });
});

describe('Event tools - unsubscribe_events', () => {
  it('should detach event manager', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const eventManager = new EventManager();
    const server = new MockMcpServer();
    registerEventTools(server as any, botManager, eventManager);

    // Subscribe first
    await server.callTool('subscribe_events');
    const result = await server.callTool('unsubscribe_events');
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Unsubscribed');
  });

  it('should handle unsubscribe when not subscribed', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const eventManager = new EventManager();
    const server = new MockMcpServer();
    registerEventTools(server as any, botManager, eventManager);

    const result = await server.callTool('unsubscribe_events');
    expect(result.isError).toBe(false);
  });
});

describe('Event tools - get_events', () => {
  it('should return events with clear=true', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const eventManager = new EventManager();
    const server = new MockMcpServer();
    registerEventTools(server as any, botManager, eventManager);

    // Subscribe and generate an event
    await server.callTool('subscribe_events');
    mockBot._emit('chat', 'Steve', 'Hello');

    const result = await server.callTool('get_events', { clear: true });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.events).toHaveLength(1);
    expect(data.count).toBe(1);
  });

  it('should return events with clear=false without clearing buffer', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const eventManager = new EventManager();
    const server = new MockMcpServer();
    registerEventTools(server as any, botManager, eventManager);

    // Subscribe and generate an event
    await server.callTool('subscribe_events');
    mockBot._emit('chat', 'Steve', 'Hello');

    const result = await server.callTool('get_events', { clear: false });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.events).toHaveLength(1);
    expect(data.count).toBe(1);

    // Events should still be in the buffer
    const result2 = await server.callTool('get_events', { clear: false });
    const data2 = JSON.parse(result2.content[0].text);
    expect(data2.events).toHaveLength(1);
  });

  it('should return empty events when no events buffered', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const eventManager = new EventManager();
    const server = new MockMcpServer();
    registerEventTools(server as any, botManager, eventManager);

    const result = await server.callTool('get_events', { clear: true });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.events).toHaveLength(0);
    expect(data.count).toBe(0);
  });
});

describe('Event tools - multiple event types through handlers', () => {
  it('should collect and return multiple event types', async () => {
    const mockBot = createMockBot();
    const botManager = new BotManager();
    botManager.setBot(mockBot);
    const eventManager = new EventManager();
    const server = new MockMcpServer();
    registerEventTools(server as any, botManager, eventManager);

    await server.callTool('subscribe_events');
    mockBot._emit('chat', 'Steve', 'Hello');
    mockBot._emit('kicked', 'Server closing');

    const result = await server.callTool('get_events', { clear: true });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.events).toHaveLength(2);
    expect(data.count).toBe(2);
  });
});