import type { Bot } from 'mineflayer';
import { dataResult, delay, type McpToolResult } from '@yearn-for-mines/shared';

export function inventoryCounts(bot: Bot): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of bot.inventory.items()) counts[item.name] = (counts[item.name] ?? 0) + item.count;
  return counts;
}

export function outcome(bot: Bot, status: 'success' | 'partial' | 'failed', message: string,
  details: Record<string, unknown> = {}): McpToolResult {
  return { ...dataResult({ status, message, ...details, inventory: inventoryCounts(bot),
    position: bot.entity.position, health: bot.health, food: bot.food }), isError: status !== 'success' };
}

export async function waitForState(check: () => boolean, timeoutMs = 1500, signal?: AbortSignal): Promise<boolean> {
  const start = Date.now();
  while (!check()) {
    signal?.throwIfAborted();
    if (Date.now() - start >= timeoutMs) return false;
    await delay(50, signal);
  }
  return true;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
