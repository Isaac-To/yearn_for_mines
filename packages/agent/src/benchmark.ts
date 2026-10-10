import { McpClient, LlmClient, loadConfig } from '@yearn-for-mines/shared';
import { AgentLoop } from './agent-loop.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const targets = ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe'];
const target = process.argv[2];
if (!targets.includes(target)) throw new Error(`Choose one target: ${targets.join(', ')}`);
const worldId = process.env.BENCHMARK_WORLD_ID;
const seed = process.env.BENCHMARK_SEED;
if (!worldId || !seed || process.env.BENCHMARK_FRESH_WORLD !== 'true') {
  throw new Error('Set BENCHMARK_WORLD_ID, BENCHMARK_SEED, and BENCHMARK_FRESH_WORLD=true after creating a fresh isolated benchmark world. See BENCHMARKS.md.');
}
const config = loadConfig();
const memoryMode = z.enum(['off', 'cold', 'warm']).parse(process.env.BENCHMARK_MEMORY_MODE ?? 'off');
const memoryNamespace = memoryMode === 'cold' ? `bench-${randomUUID().slice(0, 18)}`
  : memoryMode === 'warm' ? z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).parse(process.env.BENCHMARK_MEMORY_NAMESPACE) : 'benchmark-disabled';
let memoryClient: McpClient | undefined;
const client = new McpClient({ name: 'benchmark', version: '1' });
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
try {
  if (memoryMode !== 'off') {
    if (!config.mempalace.url) throw new Error('Memory benchmarks require MCP_MEMPALACE_URL');
    memoryClient = new McpClient({ name: 'benchmark-memory', version: '1' });
    await memoryClient.connectToUrl(config.mempalace.url);
    const wingsResult = await memoryClient.callTool('mempalace_list_wings', {}, { timeoutMs: 10000, signal: controller.signal });
    const wingsData = JSON.parse(wingsResult.content.filter(c => c.type === 'text').map(c => c.text).join('\n'));
    if (wingsResult.isError || wingsData.error || !wingsData.wings) throw new Error('Cannot verify benchmark memory dataset');
    const present = Object.keys(wingsData.wings).some(wing => wing.startsWith(`${memoryNamespace}-`));
    if (memoryMode === 'cold' && present) throw new Error('Cold benchmark namespace already exists');
    if (memoryMode === 'warm' && !present) throw new Error('Warm benchmark namespace has no saved memories');
  }
  await client.connectToUrl(config.agent.mcMcpUrl);
  const connection = await client.callTool('bot_connect', config.minecraft, { timeoutMs: 35000, signal: controller.signal });
  if (connection.isError) throw new Error(JSON.stringify(connection.content));
  const result = await client.callTool('bot_status', {}, { timeoutMs: 10000, signal: controller.signal });
  if (result.isError) throw new Error(JSON.stringify(result.content));
  const state = JSON.parse(result.content.filter(part => part.type === 'text').map(part => part.text).join('\n'));
  if (!state.connected || state.gameMode !== 'survival' || !Array.isArray(state.inventory) || state.inventory.some((item: { count: number }) => item.count > 0)) {
    throw new Error('Benchmark requires a connected survival bot with empty inventory. The runner never resets an existing world.');
  }
  const file = config.agent.telemetryFile || `results/${target}-${Date.now()}.jsonl`;
  const loop = new AgentLoop(client, new LlmClient(config.llm), {
    ...config.agent, goal: `Obtain one ${target} from an empty inventory.`, goalItems: { [target]: 1 },
    memoryMode: memoryMode === 'off' ? 'off' : memoryMode === 'cold' ? 'read-write' : 'read-only',
    memoryNamespace, memoryRequired: memoryMode !== 'off',
    enableVlm: false, enableChatNarration: false, enableChatResponse: false,
    telemetryFile: file, botConfig: config.minecraft, signal: controller.signal,
    runMetadata: { worldId, declaredSeed: seed, freshWorldDeclared: true, startingState: state, memoryMode, memoryNamespace, minecraftVersion: config.minecraft.version, temperature: config.llm.temperature },
  }, memoryClient);
  await loop.run();
  const memoryConditionValid = memoryMode === 'off' || (loop.memoryStatus.availability === 'ready' && loop.memoryStatus.errors === 0 && loop.memoryStatus.pending === 0);
  console.log(JSON.stringify({ target, worldId, seed, memoryMode, memoryNamespace, memoryConditionValid, telemetryFile: file, ...loop.metrics }, null, 2));
  if (!memoryConditionValid) process.exitCode = 1;
} finally { await client.disconnect(); await memoryClient?.disconnect(); }
