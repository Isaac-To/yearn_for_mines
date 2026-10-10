import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { McpClient } from '@yearn-for-mines/shared';
import { MemoryManager } from './memory-manager.js';
import { MEMORY_CONTRACT, type EpisodeMemory } from './experience.js';

// Uses an isolated namespace; never touches the gameplay library. Run again with "read" after restarting the service.
const manifest = resolve(process.argv[3] ?? '../../tmp/mempalace-smoke.json');
const mode = process.argv[2] ?? 'write';
const client = new McpClient({ name: 'memory-smoke', version: '1' });
try {
  await client.connectToUrl(process.env.MEMORY_SMOKE_URL ?? 'http://localhost:18081/mcp');
  let run: EpisodeMemory;
  if (mode === 'write') {
    run = { id: randomUUID(), contract: MEMORY_CONTRACT, namespace: `smoke-${randomUUID().slice(0, 12)}`,
      minecraftVersion: 'fixture-only', toolSchemaHash: 'fixture-only', goal: 'Synthetic fixture: craft wooden_pickaxe',
      startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), outcome: 'success', verification: 'inventory',
      reason: 'Synthetic integration fixture; no Minecraft actions were performed', initialState: '{"inventory":[]}',
      finalState: '{"inventory":[{"name":"wooden_pickaxe","count":1}]}',
      actions: [{ id: 'fixture-action', name: 'craft_items', args: { item: 'wooden_pickaxe', amount: 1 }, result: '{"targetReached":true}', status: 'completed', elapsedMs: 1 }],
      recalledIds: [], reflection: { facts: [{ entity: 'wooden_pickaxe', relationship: 'fixture_result', target: 'one item observed' }] }, metrics: { llmCalls: 0 } };
    mkdirSync(resolve(manifest, '..'), { recursive: true });
    writeFileSync(manifest, JSON.stringify(run));
    const writer = new MemoryManager(client, undefined, { namespace: run.namespace, minecraftVersion: run.minecraftVersion, toolSchemaHash: run.toolSchemaHash, timeoutMs: 120000 });
    await writer.startSession();
    assert.equal(await writer.rememberEpisode(run), true, JSON.stringify(writer.status));
    assert.equal(await writer.rememberEpisode({ ...run, id: randomUUID(), outcome: 'failure', verification: 'none', reflection: undefined,
      reason: 'Synthetic counterexample: Missing sticks', actions: [{ ...run.actions[0], status: 'failed', result: 'Missing sticks' }] }), true, JSON.stringify(writer.status));
  } else if (mode === 'read') run = JSON.parse(readFileSync(manifest, 'utf8'));
  else throw new Error('Use write or read');
  const reader = new MemoryManager(client, undefined, { namespace: run.namespace, minecraftVersion: run.minecraftVersion, toolSchemaHash: run.toolSchemaHash, mode: 'read-only', timeoutMs: 120000 });
  await reader.startSession();
  const context = await reader.recall('craft wooden_pickaxe', ['wooden_pickaxe']);
  assert.ok(context.includes(run.id), context);
  assert.ok(context.includes('Missing sticks'), context);
  assert.ok(context.includes('one item observed'), context);
  const page = JSON.parse(await reader.readEpisode(run.id));
  assert.deepEqual(page.actions[0].args, run.actions[0].args);
  assert.equal(page.actions[0].result, run.actions[0].result);
  assert.equal(page.verification, 'inventory');
  console.log(JSON.stringify({ passed: true, mode, namespace: run.namespace, id: run.id, status: reader.status }));
} finally { await client.disconnect(); }
