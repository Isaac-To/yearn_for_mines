import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryManager } from '../memory-manager.js';
import { episode, palaceFixture } from './memory-fixture.js';

const scope = { namespace: 'test-library', minecraftVersion: '1.21.4', toolSchemaHash: 'test-schema' };
const temporary: string[] = [];
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); vi.useRealTimers(); });
function directory(): string { const path = mkdtempSync(join(tmpdir(), 'yfm-memory-test-')); temporary.push(path); return path; }

describe('episodic memory', () => {
  it('archives already-satisfied goals without ranking zero-action runs as reusable recipes', async () => {
    const palace = palaceFixture();
    const manager = new MemoryManager(palace.client, undefined, scope);
    const run = episode({ actions: [] });
    expect(await manager.rememberEpisode(run)).toBe(true);
    expect([...palace.drawers.values()].some(d => d.wing.endsWith('-episodes'))).toBe(true);
    expect(await manager.recall(run.goal)).not.toContain(run.id);
  });
  it('preserves actual actions across managers and hydrates chunked search results', async () => {
    const palace = palaceFixture();
    const run = episode();
    const writer = new MemoryManager(palace.client, undefined, scope);
    expect(await writer.rememberEpisode(run)).toBe(true);
    const reader = new MemoryManager(palace.client, undefined, scope);
    const context = await reader.recall('wooden pickaxe');
    expect(context).toContain(run.id);
    expect(context).toContain('inventory');
    const page = JSON.parse(await reader.readEpisode(run.id));
    expect(page.actions[0]).toMatchObject(run.actions[0]);
    expect(page.initialState).toBe(run.initialState);
    expect(page.finalState).toBe(run.finalState);
    expect(reader.status).toMatchObject({ hits: 1, reads: 1, availability: 'ready' });
  });

  it('keeps improved strategies for the same goal and failed attempts as counterexamples', async () => {
    const palace = palaceFixture();
    const manager = new MemoryManager(palace.client, undefined, scope);
    const first = episode();
    const improved = episode({ actions: [{ ...first.actions[0], args: { item: 'wooden_pickaxe', amount: 2 } }] });
    const failure = episode({ outcome: 'failure', verification: 'none', actions: [{ ...first.actions[0], status: 'failed', result: 'Missing sticks' }] });
    for (const run of [first, improved, failure]) expect(await manager.rememberEpisode(run)).toBe(true);
    const context = await manager.recall('wooden pickaxe');
    for (const run of [first, improved, failure]) expect(context).toContain(run.id);
    expect(JSON.parse(await manager.readEpisode(failure.id)).actions[0].status).toBe('failed');
  });

  it('rejects memories from another namespace, Minecraft version, or tool contract', async () => {
    const palace = palaceFixture();
    const writer = new MemoryManager(palace.client, undefined, scope);
    const run = episode();
    await writer.rememberEpisode(run);
    for (const changed of [{ namespace: 'other' }, { minecraftVersion: 'old' }, { toolSchemaHash: 'old' }]) {
      const reader = new MemoryManager(palace.client, undefined, { ...scope, ...changed });
      expect(await reader.recall(run.goal)).not.toContain(run.id);
      await expect(reader.readEpisode(run.id)).rejects.toThrow('not retrieved');
    }
  });

  it('queues application-level write failures durably and recovers after a process restart', async () => {
    const palace = palaceFixture();
    const options = { ...scope, directory: directory() };
    const run = episode();
    palace.setUnavailable(true);
    const writer = new MemoryManager(palace.client, undefined, options);
    expect(await writer.rememberEpisode(run)).toBe(false);
    expect(writer.status).toMatchObject({ availability: 'degraded', pending: 1, writes: 0 });
    expect(JSON.parse(readFileSync(join(options.directory, run.id + '.pending.json'), 'utf8')).actions).toEqual(run.actions);
    palace.setUnavailable(false);
    const recovered = new MemoryManager(palace.client, undefined, options);
    await recovered.startSession();
    expect(recovered.status).toMatchObject({ availability: 'ready', pending: 0, writes: 1 });
    expect(readdirSync(options.directory)).toEqual([run.id + '.saved.json']);
    expect(await recovered.recall(run.goal)).toContain(run.id);
  });

  it('does not read or write when off, and read-only never flushes queued training episodes', async () => {
    const palace = palaceFixture();
    const options = { ...scope, directory: directory() };
    const run = episode();
    const off = new MemoryManager(palace.client, undefined, { ...options, mode: 'off' });
    await off.startSession(); await off.recall('test'); await off.rememberEpisode(run);
    expect(palace.callTool).not.toHaveBeenCalled();
    expect(readdirSync(options.directory)).toEqual([]);
    new MemoryManager(palace.client, undefined, options).checkpoint(run);
    const reader = new MemoryManager(palace.client, undefined, { ...options, mode: 'read-only' });
    await reader.startSession(); await reader.recall('test'); await reader.rememberEpisode(run);
    expect(palace.callTool.mock.calls.every(([name]) => !/add|write/.test(name))).toBe(true);
    expect(readdirSync(options.directory)).toEqual([run.id + '.pending.json']);
  });

  it('archives results larger than the upstream drawer limit losslessly and pages actions', async () => {
    const palace = palaceFixture();
    const manager = new MemoryManager(palace.client, undefined, scope);
    const run = episode();
    run.actions = Array.from({ length: 8 }, (_, index) => ({ ...run.actions[0], id: 'call-' + index, result: 'observed '.repeat(15000) + 'end-' + index }));
    expect(await manager.rememberEpisode(run)).toBe(true);
    expect([...palace.drawers.values()].every(d => d.content.length < 100000)).toBe(true);
    await manager.recall(run.goal);
    const firstPage = JSON.parse(await manager.readEpisode(run.id, 0, 10));
    expect(firstPage.actions[0].resultTruncated).toBe(true);
    expect(firstPage.nextOffset).toBeGreaterThan(0);
    const secondPage = JSON.parse(await manager.readEpisode(run.id, firstPage.nextOffset, 1));
    expect(secondPage.actions[0].id).toBe('call-' + firstPage.nextOffset);
    const serialized = [...palace.drawers.values()].filter(d => d.wing.endsWith('-episodes')).map(d => JSON.parse(d.content).payload).join('');
    expect(JSON.parse(serialized).actions).toEqual(run.actions);
  });

  it('retrieves scoped learned facts and caches repeated requests', async () => {
    const palace = palaceFixture();
    const manager = new MemoryManager(palace.client, undefined, scope);
    const run = episode({ reflection: { facts: [{ entity: 'wooden_pickaxe', relationship: 'required', target: 'sticks' }] } });
    await manager.rememberEpisode(run);
    expect(await manager.recall(run.goal, ['wooden_pickaxe'])).toContain('sticks');
    const calls = palace.callTool.mock.calls.length;
    await manager.recall(run.goal, ['wooden_pickaxe']);
    expect(palace.callTool.mock.calls.length).toBe(calls);
  });
});
