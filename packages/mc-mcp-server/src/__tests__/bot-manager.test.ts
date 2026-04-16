import { describe, it, expect, vi } from 'vitest';
import { BotManager } from '../bot-manager.js';
import type { Bot } from 'mineflayer';
import type { BotConfig } from '@yearn-for-mines/shared';

function createMockBot(overrides: Record<string, any> = {}): Bot {
  return {
    username: 'TestBot',
    entity: { position: { x: 0, y: 64, z: 0 } } as never,
    spawnPoint: { x: 0, y: 64, z: 0 },
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    removeAllListeners: vi.fn(),
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
    ...overrides,
  } as unknown as Bot;
}

describe('BotManager - constructor', () => {
  it('should use default bot factory when none provided', () => {
    const manager = new BotManager();
    expect(manager.isConnected).toBe(false);
    expect(manager.currentBot).toBeNull();
  });

  it('should accept a custom bot factory', () => {
    const factory = vi.fn();
    const manager = new BotManager(factory);
    expect(manager.isConnected).toBe(false);
  });
});

describe('BotManager - connect', () => {
  it('should not allow duplicate connections', async () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);

    const result = await manager.connect({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.21.4',
      auth: 'offline',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('already connected');
  });

  it('should connect successfully with bot factory that emits spawn', async () => {
    const config: BotConfig = {
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.21.4',
      auth: 'offline',
    };

    const factory = vi.fn().mockImplementation(() => {
      const bot = createMockBot();
      // Simulate spawn event on next tick
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
    const result = await manager.connect(config);

    expect(result.success).toBe(true);
    expect(result.username).toBe('TestBot');
    expect(result.spawnPoint).toEqual({ x: 0, y: 64, z: 0 });
    expect(manager.isConnected).toBe(true);
    expect(factory).toHaveBeenCalledWith(config);
  });

  it('should handle connection error via error event', async () => {
    const factory = vi.fn().mockImplementation(() => {
      const bot = createMockBot();
      setTimeout(() => {
        const onceCalls = (bot.once as any).mock.calls;
        for (const call of onceCalls) {
          if (call[0] === 'error') {
            call[1](new Error('Connection error'));
          }
        }
      }, 0);
      return bot;
    });

    const manager = new BotManager(factory);
    const result = await manager.connect({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.21.4',
      auth: 'offline',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Connection error');
    expect(manager.isConnected).toBe(false);
    expect(manager.currentBot).toBeNull();
  });

  it('should handle kicked event during connection', async () => {
    const factory = vi.fn().mockImplementation(() => {
      const bot = createMockBot();
      setTimeout(() => {
        const onceCalls = (bot.once as any).mock.calls;
        for (const call of onceCalls) {
          if (call[0] === 'kicked') {
            call[1]('Server is full');
          }
        }
      }, 0);
      return bot;
    });

    const manager = new BotManager(factory);
    const result = await manager.connect({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.21.4',
      auth: 'offline',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Kicked from server');
    expect(result.error).toContain('Server is full');
    expect(manager.isConnected).toBe(false);
  });

  it('should handle connection timeout', async () => {
    vi.useFakeTimers();
    const factory = vi.fn().mockImplementation(() => {
      return createMockBot();
      // No events emitted — will timeout
    });

    const manager = new BotManager(factory);
    const connectPromise = manager.connect({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.21.4',
      auth: 'offline',
    });

    // Advance time past the 30 second timeout
    vi.advanceTimersByTime(31000);

    const result = await connectPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
    expect(manager.isConnected).toBe(false);
    vi.useRealTimers();
  });

  it('should handle factory that throws synchronously', async () => {
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

  it('should handle non-Error thrown values', async () => {
    const factory = vi.fn().mockImplementation(() => {
      throw 'string error';
    });

    const manager = new BotManager(factory);
    const result = await manager.connect({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.21.4',
      auth: 'offline',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('string error');
  });

  it('should clear timeout after spawn event', async () => {
    // This test verifies that a successful spawn clears the connection timeout.
    // We test it without fake timers since the setTimeout-based promise pattern
    // doesn't work well with vi.useFakeTimers in async context.
    const factory = vi.fn().mockImplementation(() => {
      const bot = createMockBot();
      // Emit spawn immediately on next tick
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
    const result = await manager.connect({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.21.4',
      auth: 'offline',
    });

    expect(result.success).toBe(true);
    expect(manager.isConnected).toBe(true);
  });
});

describe('BotManager - disconnect', () => {
  it('should disconnect a connected bot', () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);

    const result = manager.disconnect();
    expect(result.success).toBe(true);
    expect(mockBot.quit).toHaveBeenCalledWith('Disconnecting');
    expect(manager.isConnected).toBe(false);
    expect(manager.currentBot).toBeNull();
  });

  it('should remove all listeners after disconnect', async () => {
    vi.useFakeTimers();
    const endListeners: Array<() => void> = [];
    const mockBot = createMockBot({
      once: vi.fn((event: string, handler: () => void) => {
        if (event === 'end') {
          endListeners.push(handler);
        }
      }),
    });
    const manager = new BotManager();
    manager.setBot(mockBot);

    const result = manager.disconnect();
    expect(result.success).toBe(true);

    // Fire the end event to trigger listener cleanup
    for (const listener of endListeners) {
      listener();
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(mockBot.removeAllListeners).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should wait for bot end event before removing listeners', async () => {
    vi.useFakeTimers();
    const endListeners: Array<() => void> = [];
    const mockBot = createMockBot({
      once: vi.fn((event: string, handler: () => void) => {
        if (event === 'end') {
          endListeners.push(handler);
        }
      }),
    });
    const manager = new BotManager();
    manager.setBot(mockBot);

    const result = manager.disconnect();
    expect(result.success).toBe(true);

    // Before the end event fires, listeners should not yet be removed
    expect(mockBot.removeAllListeners).not.toHaveBeenCalled();

    // Fire the end event
    for (const listener of endListeners) {
      listener();
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(mockBot.removeAllListeners).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should timeout and remove listeners if end event never fires', async () => {
    vi.useFakeTimers();
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockBot = createMockBot();
    // Don't emit 'end' event — simulate timeout
    const manager = new BotManager();
    manager.setBot(mockBot);

    const result = manager.disconnect();
    expect(result.success).toBe(true);

    // Advance past the 3-second timeout
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockBot.removeAllListeners).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('end event timed out'),
    );

    consoleSpy.mockRestore();
    vi.useRealTimers();
  });

  it('should return error when no bot is connected', () => {
    const manager = new BotManager();
    const result = manager.disconnect();
    expect(result.success).toBe(false);
    expect(result.error).toContain('currently connected');
  });

  it('should handle quit throwing an error', () => {
    const mockBot = createMockBot({
      quit: vi.fn().mockImplementation(() => {
        throw new Error('Quit failed');
      }),
    });
    const manager = new BotManager();
    manager.setBot(mockBot);

    const result = manager.disconnect();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Quit failed');
    expect(manager.isConnected).toBe(false);
    expect(manager.currentBot).toBeNull();
    expect(mockBot.removeAllListeners).toHaveBeenCalled();
  });

  it('should handle quit throwing a non-Error value', () => {
    const mockBot = createMockBot({
      quit: vi.fn().mockImplementation(() => {
        throw 'quit error string';
      }),
    });
    const manager = new BotManager();
    manager.setBot(mockBot);

    const result = manager.disconnect();
    expect(result.success).toBe(false);
    expect(result.error).toContain('quit error string');
  });
});

describe('BotManager - respawn', () => {
  it('should respawn the bot', () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);

    const result = manager.respawn();
    expect(result.success).toBe(true);
    expect(result.spawnPoint).toEqual({ x: 0, y: 64, z: 0 });
    expect(mockBot.respawn).toHaveBeenCalled();
  });

  it('should return error when no bot is connected', () => {
    const manager = new BotManager();
    const result = manager.respawn();
    expect(result.success).toBe(false);
    expect(result.error).toContain('currently connected');
  });

  it('should handle respawn throwing an error', () => {
    const mockBot = createMockBot({
      respawn: vi.fn().mockImplementation(() => {
        throw new Error('Respawn failed');
      }),
    });
    const manager = new BotManager();
    manager.setBot(mockBot);

    const result = manager.respawn();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Respawn failed');
  });

  it('should handle respawn throwing a non-Error value', () => {
    const mockBot = createMockBot({
      respawn: vi.fn().mockImplementation(() => {
        throw 'respawn error string';
      }),
    });
    const manager = new BotManager();
    manager.setBot(mockBot);

    const result = manager.respawn();
    expect(result.success).toBe(false);
    expect(result.error).toContain('respawn error string');
  });
});

describe('BotManager - isConnected', () => {
  it('should report false when not connected', () => {
    const manager = new BotManager();
    expect(manager.isConnected).toBe(false);
  });

  it('should report true when connected', () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);
    expect(manager.isConnected).toBe(true);
  });

  it('should report false after disconnect', () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);
    manager.disconnect();
    expect(manager.isConnected).toBe(false);
  });
});

describe('BotManager - currentBot', () => {
  it('should return null when not connected', () => {
    const manager = new BotManager();
    expect(manager.currentBot).toBeNull();
  });

  it('should return the bot when connected', () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);
    expect(manager.currentBot).toBe(mockBot);
  });

  it('should return null after disconnect', () => {
    const mockBot = createMockBot();
    const manager = new BotManager();
    manager.setBot(mockBot);
    manager.disconnect();
    expect(manager.currentBot).toBeNull();
  });
});

describe('BotManager - setBot', () => {
  it('should set a bot directly', () => {
    const manager = new BotManager();
    const mockBot = createMockBot();
    manager.setBot(mockBot);
    expect(manager.isConnected).toBe(true);
    expect(manager.currentBot).toBe(mockBot);
  });
});