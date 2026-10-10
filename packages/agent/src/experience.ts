import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const MEMORY_CONTRACT = 'minecraft-actions-v1';
export type MemoryMode = 'off' | 'read-only' | 'read-write';
export const actionMemorySchema = z.object({
  id: z.string(), name: z.string(), args: z.record(z.unknown()), result: z.string(),
  status: z.enum(['completed', 'failed', 'skipped', 'interrupted']), elapsedMs: z.number(),
});
export type ActionMemory = z.infer<typeof actionMemorySchema>;
export const reflectionSchema = z.object({
  facts: z.array(z.object({ entity: z.string().max(120), relationship: z.string().max(120), target: z.string().max(500) })).max(12).default([]),
  heuristics: z.object({ preConditions: z.string().max(2000), strategySteps: z.string().max(4000), postConditions: z.string().max(2000) }).optional(),
});
export const episodeSchema = z.object({
  id: z.string().uuid(), contract: z.literal(MEMORY_CONTRACT), namespace: z.string(),
  minecraftVersion: z.string(), toolSchemaHash: z.string(), goal: z.string(),
  goalItems: z.record(z.number()).optional(), startedAt: z.string(), endedAt: z.string(),
  outcome: z.enum(['success', 'failure', 'interrupted']), verification: z.enum(['inventory', 'llm', 'none']),
  reason: z.string(), initialState: z.string(), finalState: z.string(),
  actions: z.array(actionMemorySchema), recalledIds: z.array(z.string()),
  reflection: reflectionSchema.optional(), metrics: z.record(z.unknown()),
});
export type EpisodeMemory = z.infer<typeof episodeSchema>;

export const memoryCardSchema = z.object({
  id: z.string(), contract: z.literal(MEMORY_CONTRACT), namespace: z.string(), minecraftVersion: z.string(), toolSchemaHash: z.string(),
  goal: z.string(), outcome: z.enum(['success', 'failure', 'interrupted']), verification: z.enum(['inventory', 'llm', 'none']),
  reason: z.string(), actionCount: z.number(), failedActions: z.number(),
  initialState: z.string(), finalState: z.string(), actions: z.array(z.string()),
  parts: z.array(z.string().max(200)).min(1).max(512), endedAt: z.string(), llmCalls: z.number().optional(),
  strategy: z.string().optional(),
});
export type MemoryCard = z.infer<typeof memoryCardSchema>;

export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Keep evidence useful in prompts without forwarding chat or image payloads. Full tool results stay in the archive. */
export function memoryState(observation: string): string {
  try {
    const s = JSON.parse(observation);
    return JSON.stringify({ connected: s.connected, inventory: s.inventory, position: s.position,
      dimension: s.dimension, health: s.health, food: s.food, gameMode: s.gameMode,
      heldItem: s.heldItem, actionState: s.actionState });
  } catch { return observation.slice(0, 2000); }
}

export function makeCard(episode: EpisodeMemory, parts: string[]): MemoryCard {
  return { id: episode.id, contract: episode.contract, namespace: episode.namespace,
    minecraftVersion: episode.minecraftVersion, toolSchemaHash: episode.toolSchemaHash,
    goal: episode.goal, outcome: episode.outcome, verification: episode.verification, reason: episode.reason,
    initialState: episode.initialState.slice(0, 1200), finalState: episode.finalState.slice(0, 1200),
    actionCount: episode.actions.length, failedActions: episode.actions.filter(a => a.status === 'failed').length,
    actions: episode.actions.slice(0, 12).map(a => `${a.status}: ${a.name}(${JSON.stringify(a.args)})`.slice(0, 300)),
    parts, endedAt: episode.endedAt,
    llmCalls: typeof episode.metrics.llmCalls === 'number' ? episode.metrics.llmCalls : undefined,
    strategy: episode.reflection?.heuristics?.strategySteps.slice(0, 1500) };
}

/** Atomic per-episode files: failed uploads survive process restarts. Successful files remain as an audit archive. */
export class MemoryOutbox {
  constructor(private directory?: string) {}
  put(episode: EpisodeMemory): void {
    if (!this.directory) return;
    mkdirSync(this.directory, { recursive: true });
    const file = join(this.directory, `${episode.id}.pending.json`);
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, JSON.stringify(episode));
    renameSync(temporary, file);
  }
  pending(namespace: string, limit = 5): EpisodeMemory[] {
    if (!this.directory) return [];
    mkdirSync(this.directory, { recursive: true });
    const episodes: EpisodeMemory[] = [];
    for (const name of readdirSync(this.directory).filter(n => n.endsWith('.pending.json')).sort()) {
      // A corrupt file remains available for inspection instead of being discarded.
      try {
        const parsed = episodeSchema.safeParse(JSON.parse(readFileSync(join(this.directory, name), 'utf8')));
        if (parsed.success && parsed.data.namespace === namespace) episodes.push(parsed.data);
        else if (!parsed.success) console.warn(`[Memory] Invalid queued episode retained for inspection: ${name}`);
      } catch { console.warn(`[Memory] Unreadable queued episode retained for inspection: ${name}`); }
      if (episodes.length >= limit) break;
    }
    return episodes;
  }
  acknowledge(id: string): void {
    if (!this.directory) return;
    renameSync(join(this.directory, `${id}.pending.json`), join(this.directory, `${id}.saved.json`));
  }
}
