import type { Bot } from 'mineflayer';
import type { EventManager } from './events.js';
import { buildObservation, type ContextFrame } from './observation-builder.js';
import { formatObservation } from './observation-formatter.js';

export class ObservationContext {
  private eventManager: EventManager;

  constructor(eventManager: EventManager) {
    this.eventManager = eventManager;
  }

  observe(bot: Bot, outcomeDescription?: string): string {
    const frame = buildObservation(bot, outcomeDescription);
    const events = this.eventManager.flush();
    if (events.length > 0) {
      frame.recentEvents = events;
    }
    return formatObservation(frame, events);
  }
}