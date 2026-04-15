import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventManager, EventNotificationSchema } from '../events.js';
import type { Bot } from 'mineflayer';

function createMockBot(): any {
  const listeners: Map<string, Function[]> = new Map();

  const mockBot = {
    entity: {
      position: { x: 100, y: 64, z: -200, distanceTo: (other: any) => Math.sqrt((100 - other.x) ** 2 + (64 - other.y) ** 2 + (-200 - other.z) ** 2) },
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
  };

  return mockBot;
}

describe('EventManager - all event types', () => {
  let eventManager: EventManager;
  let mockBot: any;

  beforeEach(() => {
    eventManager = new EventManager();
    mockBot = createMockBot();
  });

  it('should create with default buffer size', () => {
    const em = new EventManager();
    expect(em.count).toBe(0);
  });

  it('should create with custom buffer size', () => {
    const em = new EventManager(50);
    expect(em.count).toBe(0);
  });

  // blockUpdate event
  it('should collect block change events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('blockUpdate', { position: { x: 10, y: 64, z: 20 }, name: 'stone' }, { position: { x: 10, y: 64, z: 20 }, name: 'air' });
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('block_change');
    expect(events[0].data.oldBlock).toBe('stone');
    expect(events[0].data.newBlock).toBe('air');
  });

  it('should handle blockUpdate with null old block', () => {
    eventManager.attach(mockBot);
    mockBot._emit('blockUpdate', null, { position: { x: 10, y: 64, z: 20 }, name: 'dirt' });
    const events = eventManager.flush();
    expect(events[0].type).toBe('block_change');
    expect(events[0].data.oldBlock).toBeNull();
    expect(events[0].data.newBlock).toBe('dirt');
  });

  it('should handle blockUpdate with null new block', () => {
    eventManager.attach(mockBot);
    mockBot._emit('blockUpdate', { position: { x: 10, y: 64, z: 20 }, name: 'stone' }, null);
    const events = eventManager.flush();
    expect(events[0].type).toBe('block_change');
    expect(events[0].data.newBlock).toBeNull();
  });

  // entitySpawn event
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
    expect(events[0].data.type).toBe('mob');
    expect(events[0].data.position).toEqual({ x: 105, y: 64, z: -195 });
  });

  it('should use username for entity spawn when name is missing', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entitySpawn', {
      id: 124,
      username: 'Steve',
      type: 'player',
      position: { x: 110, y: 64, z: -190 },
    });
    const events = eventManager.flush();
    expect(events[0].data.name).toBe('Steve');
  });

  it('should use unknown when entity has no name or username', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entitySpawn', {
      id: 125,
      type: 'mob',
      position: { x: 110, y: 64, z: -190 },
    });
    const events = eventManager.flush();
    expect(events[0].data.name).toBe('unknown');
  });

  it('should handle entity spawn with name undefined but username present', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entitySpawn', {
      id: 126,
      username: 'Alex',
      type: 'player',
      position: { x: 105, y: 64, z: -195 },
    });
    const events = eventManager.flush();
    expect(events[0].data.name).toBe('Alex');
  });

  it('should handle entity spawn without position', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entitySpawn', {
      id: 126,
      name: 'Skeleton',
      type: 'mob',
    });
    const events = eventManager.flush();
    expect(events[0].data.position).toBeNull();
  });

  it('should ignore self entity spawn events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entitySpawn', mockBot.entity);
    expect(eventManager.count).toBe(0);
  });

  // entityGone event
  it('should collect entity despawn events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityGone', {
      id: 123,
      name: 'Zombie',
    });
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('entity_despawn');
    expect(events[0].data.name).toBe('Zombie');
  });

  it('should use username for entityGone when name is missing', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityGone', {
      id: 124,
      username: 'Steve',
      // name is completely absent, not undefined
    });
    const events = eventManager.flush();
    expect(events[0].data.name).toBe('Steve');
  });

  it('should use unknown for entityGone when both name and username are missing', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityGone', {
      id: 125,
      // neither name nor username
    });
    const events = eventManager.flush();
    expect(events[0].data.name).toBe('unknown');
  });

  it('should ignore self entity despawn events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityGone', mockBot.entity);
    expect(eventManager.count).toBe(0);
  });

  // entityDead event
  it('should collect entity death events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityDead', {
      id: 123,
      name: 'Zombie',
      position: { x: 105, y: 64, z: -195 },
    });
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('entity_death');
    expect(events[0].data.name).toBe('Zombie');
  });

  it('should use username for entityDead when name is missing', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityDead', {
      id: 124,
      username: 'Steve',
      position: { x: 110, y: 64, z: -190 },
    });
    const events = eventManager.flush();
    expect(events[0].data.name).toBe('Steve');
  });

  it('should use unknown for entityDead when both name and username are missing', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityDead', {
      id: 125,
      position: { x: 110, y: 64, z: -190 },
    });
    const events = eventManager.flush();
    expect(events[0].data.name).toBe('unknown');
  });

  it('should handle entity death without position', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityDead', {
      id: 125,
      name: 'Skeleton',
    });
    const events = eventManager.flush();
    expect(events[0].data.position).toBeNull();
  });

  it('should ignore self entity death events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityDead', mockBot.entity);
    expect(eventManager.count).toBe(0);
  });

  // entityMoved event
  it('should collect entity movement events within 16 blocks', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityMoved', {
      id: 123,
      name: 'Zombie',
      position: { x: 108, y: 64, z: -196 },
    });
    expect(eventManager.count).toBe(1);
    const events = eventManager.flush();
    expect(events[0].type).toBe('entity_movement');
    expect(events[0].data.name).toBe('Zombie');
    // Position should be rounded
    expect(events[0].data.position.x).toBe(108);
  });

  it('should ignore entity movement beyond 16 blocks', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityMoved', {
      id: 123,
      name: 'Zombie',
      position: { x: 200, y: 64, z: -200 }, // 100 blocks away
    });
    expect(eventManager.count).toBe(0);
  });

  it('should use username for entityMoved when name is missing', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityMoved', {
      id: 124,
      username: 'Steve',
      position: { x: 105, y: 64, z: -198 },
    });
    const events = eventManager.flush();
    expect(events[0].data.name).toBe('Steve');
  });

  it('should use unknown for entityMoved when both name and username are missing', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityMoved', {
      id: 125,
      position: { x: 105, y: 64, z: -198 },
    });
    const events = eventManager.flush();
    expect(events[0].data.name).toBe('unknown');
  });

  it('should ignore self entity movement events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('entityMoved', mockBot.entity);
    expect(eventManager.count).toBe(0);
  });

  // health event
  it('should collect health change events', () => {
    eventManager.attach(mockBot);
    mockBot.health = 15;
    mockBot.food = 10;
    mockBot._emit('health');
    const events = eventManager.flush();
    expect(events[0].type).toBe('player_damage');
    expect(events[0].data.health).toBe(15);
    expect(events[0].data.food).toBe(10);
  });

  // food event
  it('should collect food change events', () => {
    eventManager.attach(mockBot);
    mockBot.food = 10;
    mockBot.foodSaturation = 3.5;
    mockBot._emit('food');
    const events = eventManager.flush();
    expect(events[0].type).toBe('food_change');
    expect(events[0].data.food).toBe(10);
    expect(events[0].data.foodSaturation).toBe(3.5);
  });

  // experience event
  it('should collect experience change events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('experience');
    const events = eventManager.flush();
    expect(events[0].type).toBe('experience_change');
    expect(events[0].data.level).toBe(5);
    expect(events[0].data.progress).toBe(0.5);
  });

  it('should handle missing experience object', () => {
    eventManager.attach(mockBot);
    mockBot.experience = undefined;
    mockBot._emit('experience');
    const events = eventManager.flush();
    expect(events[0].type).toBe('experience_change');
    expect(events[0].data.level).toBe(0);
    expect(events[0].data.progress).toBe(0);
  });

  // playerCollect event
  it('should collect item pickup events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('playerCollect', { id: 1 }, { name: 'diamond', count: 3 });
    const events = eventManager.flush();
    expect(events[0].type).toBe('item_pickup');
    expect(events[0].data.name).toBe('diamond');
    expect(events[0].data.count).toBe(3);
  });

  it('should handle playerCollect with null item', () => {
    eventManager.attach(mockBot);
    mockBot._emit('playerCollect', { id: 1 }, null);
    const events = eventManager.flush();
    expect(events[0].type).toBe('item_pickup');
    expect(events[0].data.name).toBe('unknown');
    expect(events[0].data.count).toBe(1);
  });

  // rain event
  it('should collect weather change events', () => {
    eventManager.attach(mockBot);
    mockBot.isRaining = true;
    mockBot.rainState = 0.8;
    mockBot.thunderState = 0.5;
    mockBot._emit('rain');
    const events = eventManager.flush();
    expect(events[0].type).toBe('weather_change');
    expect(events[0].data.isRaining).toBe(true);
    expect(events[0].data.rainState).toBe(0.8);
    expect(events[0].data.thunderState).toBe(0.5);
  });

  it('should handle rain event when rainState and thunderState are undefined', () => {
    eventManager.attach(mockBot);
    mockBot.isRaining = false;
    delete mockBot.rainState;
    delete mockBot.thunderState;
    mockBot._emit('rain');
    const events = eventManager.flush();
    expect(events[0].type).toBe('weather_change');
    expect(events[0].data.rainState).toBe(0);
    expect(events[0].data.thunderState).toBe(0);
  });

  // soundEffectHeard event
  it('should collect sound events with position', () => {
    eventManager.attach(mockBot);
    mockBot._emit('soundEffectHeard', 'entity.zombie.growl', { x: 105, y: 64, z: -195 });
    const events = eventManager.flush();
    expect(events[0].type).toBe('sound');
    expect(events[0].data.name).toBe('entity.zombie.growl');
    expect(events[0].data.position).toEqual({ x: 105, y: 64, z: -195 });
  });

  it('should collect sound events without position', () => {
    eventManager.attach(mockBot);
    mockBot._emit('soundEffectHeard', 'ambient.cave', null);
    const events = eventManager.flush();
    expect(events[0].type).toBe('sound');
    expect(events[0].data.name).toBe('ambient.cave');
    expect(events[0].data.position).toBeNull();
  });

  // particle event
  it('should collect particle events with position', () => {
    eventManager.attach(mockBot);
    mockBot._emit('particle', { name: 'smoke', position: { x: 100, y: 65, z: -200 }, count: 5 });
    const events = eventManager.flush();
    expect(events[0].type).toBe('particle');
    expect(events[0].data.name).toBe('smoke');
    expect(events[0].data.position).toEqual({ x: 100, y: 65, z: -200 });
    expect(events[0].data.count).toBe(5);
  });

  it('should collect particle events without position', () => {
    eventManager.attach(mockBot);
    mockBot._emit('particle', { name: 'explosion', count: 10 });
    const events = eventManager.flush();
    expect(events[0].data.position).toBeNull();
    expect(events[0].data.count).toBe(10);
  });

  it('should handle particle with missing count', () => {
    eventManager.attach(mockBot);
    mockBot._emit('particle', { name: 'smoke', position: { x: 0, y: 0, z: 0 } });
    const events = eventManager.flush();
    expect(events[0].data.count).toBe(1); // default
  });

  it('should handle particle without name', () => {
    eventManager.attach(mockBot);
    mockBot._emit('particle', { position: { x: 0, y: 0, z: 0 }, count: 1 });
    const events = eventManager.flush();
    expect(events[0].data.name).toBe('unknown');
  });

  // chat event
  it('should collect chat events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('chat', 'Steve', 'Hello!');
    const events = eventManager.flush();
    expect(events[0].type).toBe('chat');
    expect(events[0].data.username).toBe('Steve');
    expect(events[0].data.message).toBe('Hello!');
  });

  // kicked event
  it('should collect kicked events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('kicked', 'Server closed');
    const events = eventManager.flush();
    expect(events[0].type).toBe('kicked');
    expect(events[0].data.reason).toBe('Server closed');
  });

  // death event
  it('should collect death events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('death');
    const events = eventManager.flush();
    expect(events[0].type).toBe('death');
    expect(events[0].data.position).toEqual({ x: 100, y: 64, z: -200 });
  });

  // respawn event
  it('should collect respawn events', () => {
    eventManager.attach(mockBot);
    mockBot._emit('respawn');
    const events = eventManager.flush();
    expect(events[0].type).toBe('respawn');
    expect(events[0].data.position).toEqual({ x: 100, y: 64, z: -200 });
  });
});

describe('EventManager - buffer management', () => {
  it('should flush events and clear buffer', () => {
    const eventManager = new EventManager();
    const mockBot = createMockBot();
    eventManager.attach(mockBot);
    mockBot._emit('chat', 'Steve', 'Hello');
    mockBot._emit('chat', 'Alex', 'Hi');
    expect(eventManager.count).toBe(2);
    const events = eventManager.flush();
    expect(events).toHaveLength(2);
    expect(eventManager.count).toBe(0);
  });

  it('should peek without clearing buffer', () => {
    const eventManager = new EventManager();
    const mockBot = createMockBot();
    eventManager.attach(mockBot);
    mockBot._emit('chat', 'Steve', 'Hello');
    const events = eventManager.peek();
    expect(events).toHaveLength(1);
    expect(eventManager.count).toBe(1);
  });

  it('should clear buffer', () => {
    const eventManager = new EventManager();
    const mockBot = createMockBot();
    eventManager.attach(mockBot);
    mockBot._emit('chat', 'Steve', 'Hello');
    eventManager.clear();
    expect(eventManager.count).toBe(0);
  });

  it('should trim buffer when it exceeds max size', () => {
    const smallEm = new EventManager(5);
    const mockBot = createMockBot();
    smallEm.attach(mockBot);
    for (let i = 0; i < 7; i++) {
      mockBot._emit('chat', `Player${i}`, `Message ${i}`);
    }
    expect(smallEm.count).toBe(5);
    const events = smallEm.flush();
    expect(events[0].data.username).toBe('Player2');
  });

  it('should include timestamps in events', () => {
    const eventManager = new EventManager();
    const mockBot = createMockBot();
    eventManager.attach(mockBot);
    const before = Date.now();
    mockBot._emit('chat', 'Steve', 'Hello');
    const after = Date.now();
    const events = eventManager.flush();
    expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(events[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('should handle detach when no bot is attached', () => {
    const em = new EventManager();
    em.detach();
    expect(em.count).toBe(0);
  });

  it('should remove all listeners on detach', () => {
    const eventManager = new EventManager();
    const mockBot = createMockBot();
    eventManager.attach(mockBot);
    const onCallCount = mockBot.on.mock.calls.length;
    eventManager.detach();
    expect(mockBot.off).toHaveBeenCalledTimes(onCallCount);
  });

  it('should detach previous bot when attaching to new one', () => {
    const eventManager = new EventManager();
    const mockBot1 = createMockBot();
    const mockBot2 = createMockBot();
    eventManager.attach(mockBot1);
    const onCallCount1 = mockBot1.on.mock.calls.length;
    eventManager.attach(mockBot2);
    // First bot should have been detached
    expect(mockBot1.off).toHaveBeenCalledTimes(onCallCount1);
    expect(mockBot2.on).toHaveBeenCalled();
  });

  it('should reset events on attach', () => {
    const eventManager = new EventManager();
    const mockBot1 = createMockBot();
    eventManager.attach(mockBot1);
    mockBot1._emit('chat', 'Steve', 'Hello');
    expect(eventManager.count).toBe(1);
    const mockBot2 = createMockBot();
    eventManager.attach(mockBot2);
    expect(eventManager.count).toBe(0);
  });
});

describe('EventNotificationSchema', () => {
  it('should validate a valid event notification', () => {
    const event = {
      type: 'chat' as const,
      timestamp: Date.now(),
      data: { username: 'Steve', message: 'Hello!' },
    };
    const result = EventNotificationSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('should validate all valid event types', () => {
    const types = [
      'block_change', 'entity_spawn', 'entity_despawn', 'entity_death',
      'entity_movement', 'player_damage', 'player_heal', 'food_change',
      'experience_change', 'item_pickup', 'weather_change', 'sound',
      'particle', 'chat', 'kicked', 'death', 'respawn',
    ];
    for (const type of types) {
      const event = {
        type,
        timestamp: Date.now(),
        data: {},
      };
      const result = EventNotificationSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid event type', () => {
    const event = {
      type: 'invalid_type',
      timestamp: Date.now(),
      data: {},
    };
    const result = EventNotificationSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('should reject missing timestamp', () => {
    const event = {
      type: 'chat',
      data: {},
    };
    const result = EventNotificationSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});