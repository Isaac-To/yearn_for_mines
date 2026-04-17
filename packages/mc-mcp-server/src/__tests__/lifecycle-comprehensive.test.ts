import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BotManager } from '../bot-manager.js';
import { registerLifecycleTools } from '../tools/lifecycle.js';

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
  return {
    username: 'TestBot',
    entity: { position: { x: 0, y: 64, z: 0 } },
    spawnPoint: { x: 0, y: 64, z: 0 },
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    emit: vi.fn(),
    quit: vi.fn(),
    end: vi.fn(),
    respawn: vi.fn(),
    chat: vi.fn(),
    whisper: vi.fn(),
    setControlState: vi.fn(),
    clearControlStates: vi.fn(),
    look: vi.fn(),
    lookAt: vi.fn(),
    dig: vi.fn(),
    stopDigging: vi.fn(),
    placeBlock: vi.fn(),
    activateBlock: vi.fn(),
    activateEntity: vi.fn(),
    attack: vi.fn(),
    equip: vi.fn(),
    unequip: vi.fn(),
    toss: vi.fn(),
    craft: vi.fn(),
    findBlock: vi.fn(),
    findBlocks: vi.fn(),
    blockAt: vi.fn(),
    canDigBlock: vi.fn(),
    canSeeBlock: vi.fn(),
    nearestEntity: vi.fn(),
    waitForTicks: vi.fn(),
    waitForChunksToLoad: vi.fn(),
  };
}

describe('Lifecycle tools - bot_connect', () => {
  it('should return already connected when bot is already connected', async () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_connect', {
      host: 'localhost', port: 25565, username: 'TestBot', version: '1.21.4', auth: 'offline',
    });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.connected).toBe(true);
    expect(data.alreadyConnected).toBe(true);
  });

  it('should connect successfully with valid bot factory', async () => {
    const factory = vi.fn().mockImplementation(() => {
      const bot = createMockBot();
      setTimeout(() => {
        const onceCalls = (bot.once as any).mock.calls;
        for (const call of onceCalls) {
          if (call[0] === 'spawn') {
            call[1]();
          }
        }
      }, 0);
      return bot;
    });

    const manager = new BotManager(factory);
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_connect', {
      host: 'localhost', port: 25565, username: 'TestBot', version: '1.21.4', auth: 'offline',
    });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.connected).toBe(true);
    expect(data.username).toBe('TestBot');
    expect(data.spawnPoint).toEqual({ x: 0, y: 64, z: 0 });
  });

  it('should handle connection failure as transient error', async () => {
    const factory = vi.fn().mockImplementation(() => {
      throw new Error('Connection failed');
    });

    const manager = new BotManager(factory);
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_connect', {
      host: 'localhost', port: 25565, username: 'TestBot', version: '1.21.4', auth: 'offline',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('[TRANSIENT]');
    expect(result.content[0].text).toContain('Connection failed');
  });

  it('should pass all config parameters to factory', async () => {
    const factory = vi.fn().mockImplementation(() => {
      const bot = createMockBot();
      setTimeout(() => {
        const onceCalls = (bot.once as any).mock.calls;
        for (const call of onceCalls) {
          if (call[0] === 'spawn') {
            call[1]();
          }
        }
      }, 0);
      return bot;
    });

    const manager = new BotManager(factory);
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    await server.callTool('bot_connect', {
      host: '192.168.1.1', port: 25566, username: 'CustomBot', version: '1.20.4', auth: 'microsoft',
    });

    expect(factory).toHaveBeenCalledWith({
      host: '192.168.1.1', port: 25566, username: 'CustomBot', version: '1.20.4', auth: 'microsoft',
    });
  });
});

describe('Lifecycle tools - bot_disconnect', () => {
  it('should disconnect connected bot', async () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_disconnect');
    expect(result.isError).toBe(false);
    expect(manager.isConnected).toBe(false);
    expect(result.content[0].text).toContain('disconnected');
  });

  it('should return error when not connected', async () => {
    const manager = new BotManager();
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_disconnect');
    expect(result.isError).toBe(true);
  });
});

describe('Lifecycle tools - bot_respawn', () => {
  it('should respawn connected bot', async () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_respawn');
    expect(result.isError).toBe(false);
    expect(mockBot.respawn).toHaveBeenCalled();
    const data = JSON.parse(result.content[0].text);
    expect(data.respawned).toBe(true);
    expect(data.spawnPoint).toEqual({ x: 0, y: 64, z: 0 });
  });

  it('should return error when not connected', async () => {
    const manager = new BotManager();
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_respawn');
    expect(result.isError).toBe(true);
  });

  it('should handle respawn error', async () => {
    const mockBot = createMockBot();
    mockBot.respawn = vi.fn().mockImplementation(() => {
      throw new Error('Cannot respawn');
    });
    const manager = new BotManager();
    manager.setBot(mockBot);
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_respawn');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Cannot respawn');
  });
});

describe('registerLifecycleTools', () => {
  it('should register lifecycle tools without errors', () => {
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    const manager = new BotManager();
    registerLifecycleTools(server, manager);
    expect(true).toBe(true);
  });
});

describe('Lifecycle tools - bot_status', () => {
  it('should return disconnected status when bot is not connected', async () => {
    const manager = new BotManager();
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_status');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.connected).toBe(false);
    expect(data.username).toBeNull();
    expect(data.position).toBeNull();
    expect(data.health).toBeNull();
    expect(data.gameMode).toBeNull();
  });

  it('should return connected status when bot is connected', async () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_status');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.connected).toBe(true);
    expect(data.username).toBe('TestBot');
    expect(data.position).toEqual({ x: 0, y: 64, z: 0 });
    expect(data.health).toBe(20);
    expect(data.gameMode).toBe('survival');
  });

  it('should reflect updated position after bot moves', async () => {
    const mockBot = createMockBot();
    mockBot.entity.position = { x: 200, y: 70, z: -300, distanceTo: vi.fn().mockReturnValue(0) };
    const manager = new BotManager();
    manager.setBot(mockBot);
    const server = new MockMcpServer();
    registerLifecycleTools(server as any, manager);

    const result = await server.callTool('bot_status');
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.connected).toBe(true);
    expect(data.position).toEqual({ x: 200, y: 70, z: -300 });
  });
});