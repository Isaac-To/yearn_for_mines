import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BotManager } from '../bot-manager.js';
import { registerLifecycleTools } from '../tools/lifecycle.js';
import type { Bot } from 'mineflayer';
import type { BotConfig } from '@yearn-for-mines/shared';

// Create a mock bot with all required Bot properties for testing
function createMockBot(): Bot {
  return {
    username: 'TestBot',
    entity: { position: { x: 0, y: 64, z: 0 } } as never,
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
  } as unknown as Bot;
}

describe('BotManager', () => {
  let botManager: BotManager;

  beforeEach(() => {
    botManager = new BotManager();
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('should not allow duplicate connections', async () => {
      const mockBot = createMockBot();
      botManager.setBot(mockBot);

      const result = await botManager.connect({
        host: 'localhost',
        port: 25565,
        username: 'TestBot',
        version: '1.21.4',
        auth: 'offline',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already connected');
    });

    it('should handle connection errors', async () => {
      const factory = vi.fn().mockImplementation(() => {
        throw new Error('Connection refused');
      });
      const manager = new BotManager(factory);

      const result = await manager.connect({
        host: 'unreachable',
        port: 25565,
        username: 'TestBot',
        version: '1.21.4',
        auth: 'offline',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });
  });

  describe('disconnect', () => {
    it('should disconnect a connected bot', () => {
      const mockBot = createMockBot();
      botManager.setBot(mockBot);
      expect(botManager.isConnected).toBe(true);

      const result = botManager.disconnect();
      expect(result).toEqual({ success: true }); // Note: disconnect is sync in our impl but we should handle it
    });

    it('should return error when no bot is connected', () => {
      const result = botManager.disconnect();
      expect(result.success).toBe(false);
      expect(result.error).toContain('currently connected');
    });
  });

  describe('respawn', () => {
    it('should respawn the bot', () => {
      const mockBot = createMockBot();
      botManager.setBot(mockBot);

      const result = botManager.respawn();
      expect(result.success).toBe(true);
      expect(mockBot.respawn).toHaveBeenCalled();
    });

    it('should return error when no bot is connected', () => {
      const result = botManager.respawn();
      expect(result.success).toBe(false);
      expect(result.error).toContain('currently connected');
    });
  });

  describe('isConnected', () => {
    it('should report false when not connected', () => {
      expect(botManager.isConnected).toBe(false);
    });

    it('should report true when connected', () => {
      const mockBot = createMockBot();
      botManager.setBot(mockBot);
      expect(botManager.isConnected).toBe(true);
    });

    it('should report false after disconnect', () => {
      const mockBot = createMockBot();
      botManager.setBot(mockBot);
      botManager.disconnect();
      expect(botManager.isConnected).toBe(false);
    });
  });

  describe('currentBot', () => {
    it('should return null when not connected', () => {
      expect(botManager.currentBot).toBeNull();
    });

    it('should return the bot when connected', () => {
      const mockBot = createMockBot();
      botManager.setBot(mockBot);
      expect(botManager.currentBot).toBe(mockBot);
    });
  });
});

describe('registerLifecycleTools', () => {
  it('should register lifecycle tools without errors', () => {
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    const manager = new BotManager();
    // Should not throw
    registerLifecycleTools(server, manager);
    expect(true).toBe(true);
  });
});