import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventManager } from '../events.js';
import type { Bot } from 'mineflayer';

function createMockBot(): Bot {
  const listeners: Map<string, Function[]> = new Map();

  const mockBot = {
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
    experience: { level: 5, points: 50, progress: 0.5 },
    isSleeping: false,
    isRaining: false,
    on: vi.fn((event: string, handler: Function) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    off: vi.fn((event: string, handler: Function) => {
      const list = listeners.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
    }),
    once: vi.fn(),
    // Helper to emit events in tests
    _emit(event: string, ...args: any[]) {
      const list = listeners.get(event);
      if (list) {
        for (const handler of list) {
          handler(...args);
        }
      }
    },
  } as unknown as Bot;

  return mockBot;
}

describe('EventManager', () => {
  let eventManager: EventManager;
  let mockBot: any;

  beforeEach(() => {
    eventManager = new EventManager();
    mockBot = createMockBot();
  });

  it('should create an instance with default buffer size', () => {
    const em = new EventManager();
    expect(em.count).toBe(0);
  });

  it('should create an instance with custom buffer size', () => {
    const em = new EventManager(50);
    expect(em.count).toBe(0);
  });

  it('should attach to a bot and register event listeners', () => {
    eventManager.attach(mockBot);
    // Verify that on() was called for multiple events
    expect(mockBot.on).toHaveBeenCalled();
    expect(mockBot.on.mock.calls.length).toBeGreaterThan(5);
  });

  it('should detach from a bot and remove all listeners', () => {
    eventManager.attach(mockBot);
    eventManager.detach();
    expect(mockBot.off).toHaveBeenCalled();
    expect(mockBot.off.mock.calls.length).toBe(mockBot.on.mock.calls.length);
  });

  it('should collect chat events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('chat', 'Steve', 'Hello!');
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('chat');
    expect(events[0].data.username).toBe('Steve');
    expect(events[0].data.message).toBe('Hello!');
  });

  it('should collect death events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('death');
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('death');
  });

  it('should collect entity spawn events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entitySpawn', {
      id: 123,
      name: 'Zombie',
      type: 'mob',
      position: { x: 105, y: 64, z: -195 },
    });
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('entity_spawn');
    expect(events[0].data.name).toBe('Zombie');
  });

  it('should ignore self entity spawn events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entitySpawn', mockBot.entity);
    expect(eventManager.count).toBe(0);
  });

  it('should collect entity despawn events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityGone', {
      id: 123,
      name: 'Zombie',
    });
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('entity_despawn');
  });

  it('should collect kicked events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('kicked', 'Server closed');
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('kicked');
    expect(events[0].data.reason).toBe('Server closed');
  });

  it('should collect health change events', () => {
    eventManager.attach(mockBot);
    mockBot.health = 15;
    mockBot._emit('health');
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('player_damage');
    expect(events[0].data.health).toBe(15);
  });

  it('should collect food change events', () => {
    eventManager.attach(mockBot);
    mockBot.food = 10;
    mockBot._emit('food');
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('food_change');
    expect(events[0].data.food).toBe(10);
  });

  it('should collect experience change events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('experience');
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('experience_change');
  });

  it('should collect respawn events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('respawn');
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('respawn');
  });

  it('should flush events and clear buffer', () => {
    eventManager.attach(mockBot);
    mockBot._emit('chat', 'Steve', 'Hello');
    mockBot._emit('chat', 'Alex', 'Hi');
    expect(eventManager.count).toBe(2);
    const events = eventManager.flush();
    expect(events).toHaveLength(2);
    expect(eventManager.count).toBe(0);
  });

  it('should peek without clearing buffer', () => {
    eventManager.attach(mockBot);
    mockBot._emit('chat', 'Steve', 'Hello');
    const events = eventManager.peek();
    expect(events).toHaveLength(1);
    expect(eventManager.count).toBe(1); // Still in buffer
  });

  it('should clear buffer', () => {
    eventManager.attach(mockBot);
    mockBot._emit('chat', 'Steve', 'Hello');
    eventManager.clear();
    expect(eventManager.count).toBe(0);
  });

  it('should trim buffer when it exceeds max size', () => {
    const smallEm = new EventManager(5);
    smallEm.attach(mockBot);
    // Push 7 events
    for (let i = 0; i < 7; i++) {
      mockBot._emit('chat', `Player${i}`, `Message ${i}`);
    }
    // Buffer should be trimmed to 5
    expect(smallEm.count).toBe(5);
    const events = smallEm.flush();
    // Should keep the last 5 events
    expect(events[0].data.username).toBe('Player2');
  });

  it('should handle detach when no bot is attached', () => {
    const em = new EventManager();
    em.detach(); // Should not throw
    expect(em.count).toBe(0);
  });

  it('should include timestamps in events', () => {
    eventManager.attach(mockBot);
    const before = Date.now();
    mockBot._emit('chat', 'Steve', 'Hello');
    const after = Date.now();
    const events = eventManager.flush();
    expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(events[0].timestamp).toBeLessThanOrEqual(after);
  });
});