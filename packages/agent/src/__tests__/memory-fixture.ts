import { vi } from 'vitest';
import type { McpClient } from '@yearn-for-mines/shared';
import { randomUUID } from 'node:crypto';
import { digest, MEMORY_CONTRACT, type EpisodeMemory } from '../experience.js';

export function palaceFixture() {
  const drawers = new Map<string, { wing: string; content: string }>();
  const facts = new Map<string, unknown[]>();
  let unavailable = false;
  const result = (data: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(data) }], isError: false });
  const callTool = vi.fn(async (name: string, args: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
    options?.signal?.throwIfAborted();
    if (unavailable) return result({ success: false, error: 'database offline' });
    if (name === 'mempalace_status') return result({ total_drawers: drawers.size });
    if (name === 'mempalace_add_drawer') {
      const id = digest(args);
      drawers.set(id, { wing: String(args.wing), content: String(args.content) });
      return result({ success: true, drawer_id: id });
    }
    if (name === 'mempalace_get_drawer') return result({ content: drawers.get(String(args.drawer_id))?.content });
    if (name === 'mempalace_search') return result({ results: [...drawers.entries()]
      .filter(([, value]) => value.wing === args.wing).slice(0, Number(args.limit ?? 5))
      .map(([id, value]) => ({ drawer_id: id + '_chunk_000000', text: value.content.slice(0, 800), wing: value.wing, similarity: 0.95 })) });
    if (name === 'mempalace_kg_add') { facts.set(String(args.subject), [args]); return result({ success: true }); }
    if (name === 'mempalace_kg_query') return result({ facts: facts.get(String(args.entity)) ?? [] });
    throw new Error('Unsupported fixture tool: ' + name);
  });
  return { drawers, facts, callTool, setUnavailable: (value: boolean) => { unavailable = value; },
    client: { isConnected: true, callTool, disconnect: vi.fn() } as unknown as McpClient };
}

export function episode(overrides: Partial<EpisodeMemory> = {}): EpisodeMemory {
  return { id: randomUUID(), contract: MEMORY_CONTRACT, namespace: 'test-library', minecraftVersion: '1.21.4',
    toolSchemaHash: 'test-schema', goal: 'Obtain one wooden_pickaxe', goalItems: { wooden_pickaxe: 1 },
    startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), outcome: 'success', verification: 'inventory', reason: 'Inventory target verified',
    initialState: '{"connected":true,"inventory":[{"name":"oak_log","count":3}]}',
    finalState: '{"connected":true,"inventory":[{"name":"wooden_pickaxe","count":1}]}',
    actions: [{ id: 'call-1', name: 'craft_items', args: { item: 'wooden_pickaxe', amount: 1 }, result: '{"targetReached":true}', status: 'completed', elapsedMs: 20 }],
    recalledIds: [], metrics: { llmCalls: 2 }, ...overrides };
}
