import type { Bot } from 'mineflayer';
import { z } from 'zod/v4';

// Event notification types
export const EventNotificationSchema = z.object({
  type: z.enum([
    'block_change',
    'entity_spawn',
    'entity_despawn',
    'entity_death',
    'entity_movement',
    'player_damage',
    'player_heal',
    'food_change',
    'experience_change',
    'item_pickup',
    'weather_change',
    'sound',
    'particle',
    'chat',
    'kicked',
    'death',
    'respawn',
  ]),
  timestamp: z.number(),
  data: z.record(z.string(), z.any()),
});

export type EventNotification = z.infer<typeof EventNotificationSchema>;

type BotEventListener = (...args: any[]) => void;

/**
 * Manages event subscriptions on a Mineflayer bot.
 * Collects real-time events that a player would see/hear on screen
 * and buffers them for retrieval by the agent.
 */
export class EventManager {
  private bot: Bot | null = null;
  private events: EventNotification[] = [];
  private maxBufferSize: number;
  private listeners: Map<string, BotEventListener> = new Map();

  constructor(maxBufferSize: number = 100) {
    this.maxBufferSize = maxBufferSize;
  }

  private on(event: string, handler: BotEventListener): void {
    (this.bot as any).on(event, handler);
    this.listeners.set(event, handler);
  }

  /**
   * Attach event listeners to a bot instance.
   */
  attach(bot: Bot): void {
    this.detach();
    this.bot = bot;
    this.events = [];

    // Block changes
    this.on('blockUpdate', (oldBlock: any, newBlock: any) => {
      this.pushEvent('block_change', {
        position: oldBlock?.position ?? newBlock?.position,
        oldBlock: oldBlock?.name ?? null,
        newBlock: newBlock?.name ?? null,
      });
    });

    // Entity spawn
    this.on('entitySpawn', (entity: any) => {
      if (entity === bot.entity) return;
      this.pushEvent('entity_spawn', {
        id: entity.id,
        name: entity.name ?? entity.username ?? 'unknown',
        type: entity.type,
        position: entity.position ? {
          x: entity.position.x,
          y: entity.position.y,
          z: entity.position.z,
        } : null,
      });
    });

    // Entity despawn (gone)
    this.on('entityGone', (entity: any) => {
      if (entity === bot.entity) return;
      this.pushEvent('entity_despawn', {
        id: entity.id,
        name: entity.name ?? entity.username ?? 'unknown',
      });
    });

    // Entity death
    this.on('entityDead', (entity: any) => {
      if (entity === bot.entity) return;
      this.pushEvent('entity_death', {
        id: entity.id,
        name: entity.name ?? entity.username ?? 'unknown',
        position: entity.position ? {
          x: entity.position.x,
          y: entity.position.y,
          z: entity.position.z,
        } : null,
      });
    });

    // Entity moved
    this.on('entityMoved', (entity: any) => {
      if (entity === bot.entity) return;
      const distance = bot.entity.position.distanceTo(entity.position);
      if (distance > 16) return;
      this.pushEvent('entity_movement', {
        id: entity.id,
        name: entity.name ?? entity.username ?? 'unknown',
        position: {
          x: Math.round(entity.position.x * 10) / 10,
          y: Math.round(entity.position.y * 10) / 10,
          z: Math.round(entity.position.z * 10) / 10,
        },
      });
    });

    // Player damage / health change
    this.on('health', () => {
      this.pushEvent('player_damage', {
        health: bot.health,
        food: bot.food,
      });
    });

    // Food change
    this.on('food', (() => {
      this.pushEvent('food_change', {
        food: bot.food,
        foodSaturation: bot.foodSaturation,
      });
    }) as BotEventListener);

    // Experience change
    this.on('experience', (() => {
      this.pushEvent('experience_change', {
        level: bot.experience?.level ?? 0,
        progress: bot.experience?.progress ?? 0,
      });
    }) as BotEventListener);

    // Item pickup
    this.on('playerCollect', (collector: any, item: any) => {
      this.pushEvent('item_pickup', {
        name: item?.name ?? 'unknown',
        count: item?.count ?? 1,
      });
    });

    // Weather change
    this.on('rain', () => {
      this.pushEvent('weather_change', {
        isRaining: bot.isRaining,
        rainState: (bot as any).rainState ?? 0,
        thunderState: (bot as any).thunderState ?? 0,
      });
    });

    // Sound effects
    this.on('soundEffectHeard', (soundName: string, position: any) => {
      this.pushEvent('sound', {
        name: soundName,
        position: position ? {
          x: position.x,
          y: position.y,
          z: position.z,
        } : null,
      });
    });

    // Particles
    this.on('particle', (particle: any) => {
      this.pushEvent('particle', {
        name: particle.name ?? 'unknown',
        position: particle.position ? {
          x: particle.position.x,
          y: particle.position.y,
          z: particle.position.z,
        } : null,
        count: particle.count ?? 1,
      });
    });

    // Chat messages
    this.on('chat', (username: string, message: string) => {
      this.pushEvent('chat', {
        username,
        message,
      });
    });

    // Kicked from server
    this.on('kicked', (reason: string) => {
      this.pushEvent('kicked', { reason });
    });

    // Bot death
    this.on('death', () => {
      this.pushEvent('death', {
        position: {
          x: bot.entity.position.x,
          y: bot.entity.position.y,
          z: bot.entity.position.z,
        },
      });
    });

    // Bot respawn
    this.on('respawn', () => {
      this.pushEvent('respawn', {
        position: {
          x: bot.entity.position.x,
          y: bot.entity.position.y,
          z: bot.entity.position.z,
        },
      });
    });
  }

  /**
   * Detach all event listeners from the bot.
   */
  detach(): void {
    if (!this.bot) return;

    for (const [event, listener] of this.listeners) {
      (this.bot as any).off(event, listener);
    }
    this.listeners.clear();
    this.bot = null;
  }

  /**
   * Push an event to the buffer, trimming if needed.
   */
  private pushEvent(type: EventNotification['type'], data: Record<string, any>): void {
    this.events.push({
      type,
      timestamp: Date.now(),
      data,
    });

    if (this.events.length > this.maxBufferSize) {
      this.events = this.events.slice(-this.maxBufferSize);
    }
  }

  /**
   * Get all buffered events and clear the buffer.
   */
  flush(): EventNotification[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  /**
   * Get buffered events without clearing.
   */
  peek(): EventNotification[] {
    return [...this.events];
  }

  /**
   * Get the number of buffered events.
   */
  get count(): number {
    return this.events.length;
  }

  /**
   * Clear all buffered events.
   */
  clear(): void {
    this.events = [];
  }
}