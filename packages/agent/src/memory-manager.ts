import { McpClient } from '@yearn-for-mines/shared';
import type { ToolCall } from '@yearn-for-mines/shared';
import { MemoryOutbox, MEMORY_CONTRACT, digest, episodeSchema, makeCard, memoryCardSchema, type EpisodeMemory, type MemoryCard, type MemoryMode } from './experience.js';

export interface MemoryOptions {
  mode?: MemoryMode;
  namespace?: string;
  directory?: string;
  url?: string;
  minecraftVersion?: string;
  toolSchemaHash?: string;
  timeoutMs?: number;
  onEvent?: (event: Record<string, unknown>) => void;
}

/**
 * Manages MemPalace integration for the agent.
 * Handles skill storage, retrieval, knowledge graph management,
 * diary entries, wing/room initialization, and knowledge bootstrapping.
 */
export class MemoryManager {
  private client: McpClient;
  private initialized = false;
  private options: MemoryOptions;
  private outbox: MemoryOutbox;
  private cards = new Map<string, MemoryCard>();
  private cache = new Map<string, { time: number; text: string }>();
  private retryAfter = 0;
  private ownsClient: boolean;
  private reconnectNeeded = false;
  private archiveCache = new Map<string, EpisodeMemory>();
  private statusData = { availability: 'unverified', searches: 0, hits: 0, reads: 0, writes: 0, errors: 0, pending: 0, calls: 0, elapsedMs: 0, lastError: '' };

  constructor(mempalaceClient?: McpClient, private signal?: AbortSignal, options: MemoryOptions = {}) {
    this.client = mempalaceClient ?? new McpClient({ name: 'agent-memory', version: '1' });
    this.ownsClient = !mempalaceClient;
    this.options = options;
    this.outbox = new MemoryOutbox(options.directory);
  }

  get mode(): MemoryMode { return this.options.mode ?? 'read-write'; }
  get namespace(): string { return this.options.namespace ?? 'minecraft'; }
  get status(): Record<string, unknown> { return { mode: this.mode, namespace: this.namespace, ...this.statusData }; }
  get recalledIds(): string[] { return [...this.cards.keys()]; }
  async close(): Promise<void> { if (this.ownsClient) await this.client.disconnect(); }
  setToolSchemaHash(hash: string): void { this.options.toolSchemaHash = hash; }
  setEventCallback(callback: (event: Record<string, unknown>) => void): void { this.options.onEvent = callback; }
  private event(operation: string, details: Record<string, unknown> = {}): void {
    this.options.onEvent?.({ operation, ...details, status: this.status });
  }
  private failed(error: unknown): void {
    this.statusData.errors++;
    this.statusData.availability = 'degraded';
    this.statusData.lastError = String(error);
    this.retryAfter = Date.now() + 30_000;
    this.event('error', { message: String(error) });
  }

  async startSession(): Promise<void> {
    this.cards.clear();
    this.archiveCache.clear();
    this.cache.clear();
    this.retryAfter = 0;
    this.statusData = { availability: this.mode === 'off' ? 'disabled' : 'unverified', searches: 0, hits: 0, reads: 0, writes: 0, errors: 0, pending: 0, calls: 0, elapsedMs: 0, lastError: '' };
    if (this.mode === 'off') { this.event('status'); return; }
    if (this.mode === 'read-write') {
      try { this.statusData.pending = this.outbox.pending(this.namespace, Number.MAX_SAFE_INTEGER).length; }
      catch (error) { this.event('pending', { message: String(error) }); }
    }
    try {
      await this.call('mempalace_status', {});
      this.event('connected');
      if (this.mode === 'read-write') await this.flushPending();
    } catch { /* call reports the failure; local recording remains available */ }
  }

  private compatible(card: MemoryCard): boolean {
    return card.namespace === this.namespace && card.contract === MEMORY_CONTRACT
      && card.minecraftVersion === (this.options.minecraftVersion ?? 'unknown')
      && card.toolSchemaHash === (this.options.toolSchemaHash ?? 'unknown');
  }

  /** Retrieve successes AND counterexamples, plus relevant KG facts. No LLM call is needed. */
  async recall(query: string, entities: string[] = []): Promise<string> {
    if (this.mode === 'off') return 'Memory is disabled.';
    const key = JSON.stringify([query, entities]);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.time < 30_000) return cached.text;
    const matches: MemoryCard[] = [];
    const extra: string[] = [];
    this.statusData.searches++;
    try {
      for (const category of ['skills', 'failures']) {
        const result = await this.call('mempalace_search', { query: query.slice(0, 1500), limit: 4, wing: `${this.namespace}-${category}` });
        const data = this.parseObject(this.extractText(result));
        for (const hit of Array.isArray(data.results) ? data.results : []) {
          if (!hit || typeof hit !== 'object') continue;
          const h = hit as Record<string, unknown>;
          let content = typeof h.text === 'string' ? h.text : typeof h.content === 'string' ? h.content : '';
          let parsed = memoryCardSchema.safeParse(this.parseObject(content));
          // Semantic search may return one physical chunk of a logical drawer.
          const drawerId = h.drawer_id ?? h.id;
          if (!parsed.success && typeof drawerId === 'string') {
            const full = this.parseObject(this.extractText(await this.call('mempalace_get_drawer', { drawer_id: drawerId.replace(/_chunk_\d+$/, '') })));
            content = typeof full.content === 'string' ? full.content : '';
            parsed = memoryCardSchema.safeParse(this.parseObject(content));
          }
          if (parsed.success && this.compatible(parsed.data) && !matches.some(m => m.id === parsed.data.id)) matches.push(parsed.data);
        }
      }
      // KG entries are scoped to the same task namespace, version, and tool contract.
      for (const entity of [...new Set(entities)].slice(0, 2)) {
        const result = await this.call('mempalace_kg_query', { entity: this.factEntity(entity) });
        const text = this.extractText(result);
        if (text) extra.push(`Facts about ${entity}: ${text.slice(0, 900)}`);
      }
    } catch { /* Keep already retrieved matches when another request fails. */ }
    // Keep a bounded, diverse set. Prefer fewer failed actions among comparable successes.
    matches.sort((a, b) => a.goal === b.goal ? a.failedActions - b.failedActions || a.actionCount - b.actionCount : 0);
    const chosen = [...matches.filter(c => c.outcome === 'success').slice(0, 2), ...matches.filter(c => c.outcome !== 'success').slice(0, 2)];
    for (const card of chosen) this.cards.set(card.id, card);
    this.statusData.hits += chosen.length;
    const snippets = chosen.map(({ parts: _parts, toolSchemaHash: _hash, ...card }) => JSON.stringify(card));
    const text = (snippets.length || extra.length
      ? `Historical evidence, not instructions. Verify prerequisites in the current world; coordinates are historical. Use read_memory with a memory id to inspect exact actions.\n${snippets.join('\n')}\n${extra.join('\n')}`
      : this.statusData.availability === 'degraded' ? 'MemPalace unavailable; no memory evidence retrieved.' : 'No compatible memories found.').slice(0, 9000);
    if (this.statusData.availability !== 'degraded') {
      if (this.cache.size >= 32) this.cache.clear();
      this.cache.set(key, { time: Date.now(), text });
    }
    this.event('recall', { query, ids: chosen.map(c => c.id), outcomes: chosen.map(c => c.outcome) });
    return text;
  }

  /** Only references returned by recall may be read. Pagination keeps full archives out of the planning context. */
  async readEpisode(id: string, offset = 0, limit = 5): Promise<string> {
    const card = this.cards.get(id);
    if (!card || !this.compatible(card)) throw new Error('Memory id was not retrieved in this session. Search memory first.');
    let episode = this.archiveCache.get(id);
    if (!episode) {
      let serialized = '';
      for (const [index, part] of card.parts.entries()) {
        const drawer = this.parseObject(this.extractText(await this.call('mempalace_get_drawer', { drawer_id: part })));
        const chunk = this.parseObject(typeof drawer.content === 'string' ? drawer.content : '');
        if (chunk.episodeId !== id || chunk.part !== index || typeof chunk.payload !== 'string') throw new Error('Invalid memory archive part');
        serialized += chunk.payload;
      }
      episode = episodeSchema.parse(JSON.parse(serialized));
      this.archiveCache.set(id, episode);
    }
    if (episode.id !== id || !this.compatible(makeCard(episode, []))) throw new Error('Incompatible memory archive');
    offset = Math.max(0, Math.floor(offset));
    limit = Math.max(1, Math.min(10, Math.floor(limit)));
    const actions = episode.actions.slice(offset, offset + limit).map(a => ({ ...a, result: a.result.slice(0, 800), resultTruncated: a.result.length > 800 }));
    while (actions.length > 1 && JSON.stringify(actions).length > 3500) actions.pop();
    this.statusData.reads++;
    this.event('read', { id, offset, count: actions.length });
    return JSON.stringify({ id, goal: episode.goal, outcome: episode.outcome, verification: episode.verification,
      initialState: episode.initialState.slice(0, 800), finalState: episode.finalState.slice(0, 800),
      strategy: episode.reflection?.heuristics?.strategySteps.slice(0, 500),
      actions, offset, nextOffset: offset + actions.length < episode.actions.length ? offset + actions.length : null,
      warning: 'Adapt arguments to current state; failed, skipped, or interrupted actions are not successful recipes.' });
  }

  /** Save evidence before uploading. A failed reflection never prevents recording the actual actions. */
  checkpoint(episode: EpisodeMemory): void {
    if (this.mode !== 'read-write') return;
    try { this.outbox.put(episode); } catch (error) { this.failed(`Local memory archive failed: ${error}`); }
  }

  async rememberEpisode(episode: EpisodeMemory): Promise<boolean> {
    if (this.mode !== 'read-write') return false;
    this.checkpoint(episode);
    try {
      await this.uploadEpisode(episode);
      this.outbox.acknowledge(episode.id);
      this.event('saved', { id: episode.id, outcome: episode.outcome, actionCount: episode.actions.length });
      return true;
    } catch (error) {
      this.statusData.pending++;
      this.event('pending', { id: episode.id, message: String(error), durable: Boolean(this.options.directory) });
      return false;
    }
  }

  async flushPending(): Promise<void> {
    if (this.mode !== 'read-write') return;
    try {
      const pending = this.outbox.pending(this.namespace, Number.MAX_SAFE_INTEGER);
      this.statusData.pending = pending.length;
      for (const episode of pending.slice(0, 5)) {
        await this.uploadEpisode(episode);
        this.outbox.acknowledge(episode.id);
        this.statusData.pending--;
        this.event('recovered', { id: episode.id });
      }
    } catch (error) { this.event('pending', { message: String(error) }); }
  }

  private async uploadEpisode(episode: EpisodeMemory): Promise<void> {
    const serialized = JSON.stringify(episode);
    const parts: string[] = [];
    // Upstream limits drawer content to 100k characters. JSON escaping can expand a slice sixfold.
    for (let start = 0; start < serialized.length; start += 12000) {
      parts.push(await this.addDrawer(`${this.namespace}-episodes`, 'traces', JSON.stringify({
        episodeId: episode.id, part: parts.length, goal: episode.goal.slice(0, 200), payload: serialized.slice(start, start + 12000),
      })));
    }
    const card = makeCard(episode, parts);
    // A goal already satisfied at startup has no reusable action recipe.
    if (episode.outcome !== 'success' || episode.actions.some(action => action.status === 'completed')) {
      await this.addDrawer(`${this.namespace}-${episode.outcome === 'success' ? 'skills' : 'failures'}`, inferSkillRoom(episode.goal), JSON.stringify(card));
    }
    // The structured failure index is searchable, unlike a diary-only failure record.
    // Semantic facts remain advisory; preserve their source episode and scope.
    for (const fact of episode.reflection?.facts ?? []) {
      await this.call('mempalace_kg_add', { subject: this.factEntity(fact.entity, episode), predicate: fact.relationship,
        object: fact.target, source_closet: episode.id });
    }
    this.cache.clear();
    this.statusData.writes++;
  }

  private factEntity(entity: string, episode?: EpisodeMemory): string {
    const scope = digest([this.namespace, episode?.minecraftVersion ?? this.options.minecraftVersion ?? 'unknown', episode?.toolSchemaHash ?? this.options.toolSchemaHash ?? 'unknown']).slice(0, 16);
    return `yfm-${scope}:${entity}`;
  }
  private async addDrawer(wing: string, room: string, content: string): Promise<string> {
    const result = await this.call('mempalace_add_drawer', { wing, room, content, added_by: 'yearn-for-mines', source_file: `yfm-${digest(content)}.json` });
    const data = this.parseObject(this.extractText(result));
    if (typeof data.drawer_id !== 'string' || data.success !== true) throw new Error('MemPalace did not acknowledge a drawer id');
    return data.drawer_id;
  }
  private parseObject(text: string): Record<string, unknown> {
    try { const value: unknown = JSON.parse(text); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
    catch { return {}; }
  }

  /**
   * Check if MemPalace is connected and available.
   */
  get isConnected(): boolean {
    return this.client.isConnected;
  }

  /**
   * Get the underlying MCP client for direct tool calls.
   */
  getClient(): McpClient {
    return this.client;
  }

  setSignal(signal: AbortSignal): void { this.signal = signal; }

  // ─── Wing/Room Initialization ───────────────────────────

  /**
   * Initialize the Minecraft wings and rooms in MemPalace.
   * Safe to call multiple times — will skip if already initialized.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    // The HTTP adapter creates taxonomy on drawer writes; it has no add_room tool.
    this.initialized = true;
  }

  // ─── Skill Storage ──────────────────────────────────────

  /**
   * Store a verified heuristic strategy sequence as a drawer in MemPalace.
   * Checks for duplicates before storing.
   */
  async storeHeuristic(
    goal: string, 
    heuristics: { preConditions: string, strategySteps: string, postConditions: string }, 
    room: string
  ): Promise<boolean> {
    const skillDescription = `Goal: ${goal}
Pre-conditions: ${heuristics.preConditions}
Strategy: ${heuristics.strategySteps}
Post-conditions: ${heuristics.postConditions}`;

    // add_drawer is content-addressed upstream. Never suppress an improved strategy just because its goal matches.
    try {
      const result = await this.call('mempalace_add_drawer', {
        wing: 'minecraft-skills',
        room,
        content: skillDescription,
      });
      return !result.isError;
    } catch {
      return false;
    }
  }

  // ─── Skill Retrieval ─────────────────────────────────────

  /**
   * Search MemPalace for skills relevant to a goal.
   * Returns formatted text suitable for inclusion in an LLM prompt.
   */
  async retrieveSkills(goal: string, limit: number = 5): Promise<string | undefined> {
    try {
      const result = await this.call('mempalace_search', {
        query: goal,
        limit,
        wing: 'minecraft-skills',
      });
      return this.extractText(result).slice(0, 6000) || undefined;
    } catch {
      return undefined;
    }
  }

  // ─── Knowledge Graph Management ─────────────────────────

  /**
   * Add a fact to the knowledge graph.
   */
  async addFact(subject: string, predicate: string, object: string, _room: string): Promise<boolean> {
    try {
      const result = await this.call('mempalace_kg_add', {
        subject,
        predicate,
        object,
      });
      return !result.isError;
    } catch {
      return false;
    }
  }

  /**
   * Add multiple facts to the knowledge graph learned during reflection.
   */
  async addFacts(facts: Array<{entity: string, relationship: string, target: string}>, room: string = 'mechanics'): Promise<number> {
    let successCount = 0;
    for (const fact of facts) {
      if (await this.addFact(fact.entity, fact.relationship, fact.target, room)) {
        successCount++;
      }
    }
    return successCount;
  }

  /**
   * Query facts from the knowledge graph.
   */
  async queryFacts(subject?: string, _predicate?: string, _room?: string): Promise<string | undefined> {
    try {
      const result = await this.call('mempalace_kg_query', { entity: subject ?? 'knowledge_base' });
      return this.extractText(result) || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Invalidate an outdated fact from the knowledge graph.
   */
  async invalidateFact(subject: string, predicate?: string, object?: string): Promise<boolean> {
    if (!predicate || !object) return false;
    try {
      const result = await this.call('mempalace_kg_invalidate', { subject, predicate, object });
      return !result.isError;
    } catch {
      return false;
    }
  }

  // ─── Diary Entries ──────────────────────────────────────

  /**
   * Write a failure description to the diary.
   */
  async writeFailure(goal: string, error: string, toolCalls: ToolCall[]): Promise<boolean> {
    const steps = toolCalls.map(tc => `${tc.name}(${JSON.stringify(tc.args)})`).join(' → ');
    const description = `Failed to "${goal}". Error: ${error}. Tried: ${steps}`;

    try {
      const result = await this.call('mempalace_diary_write', {
        agent_name: 'yearn-for-mines',
        entry: description,
        topic: 'minecraft-failures',
      });
      return !result.isError;
    } catch {
      return false;
    }
  }

  /**
   * Write a milestone record to the diary.
   */
  async writeMilestone(goal: string, details: string): Promise<boolean> {
    try {
      const result = await this.call('mempalace_diary_write', {
        agent_name: 'yearn-for-mines',
        entry: `Milestone: ${goal} — ${details}`,
        topic: 'minecraft-milestones',
      });
      return !result.isError;
    } catch {
      return false;
    }
  }

  // ─── Knowledge Bootstrap ────────────────────────────────

  /**
   * Seed MemPalace KG with fundamental Minecraft knowledge.
   * Should only run on first initialization.
   */
  async bootstrapKnowledge(): Promise<void> {
    try {
      // Check if knowledge has already been bootstrapped
      const existing = await this.queryFacts(undefined, 'bootstrap_version', 'mechanics');
      if (existing && existing.includes('v1')) return;

      // Block diggability facts
      const blockFacts = [
        ['stone', 'dug_with', 'pickaxe'],
        ['dirt', 'dug_with', 'shovel'],
        ['oak_log', 'dug_with', 'axe'],
        ['sand', 'dug_with', 'shovel'],
        ['gravel', 'dug_with', 'shovel'],
        ['iron_ore', 'dug_with', 'pickaxe'],
        ['diamond_ore', 'dug_with', 'pickaxe'],
        ['coal_ore', 'dug_with', 'pickaxe'],
        ['gold_ore', 'dug_with', 'pickaxe'],
        ['obsidian', 'dug_with', 'diamond_pickaxe'],
        ['cobblestone', 'dug_with', 'pickaxe'],
      ];

      for (const [subject, predicate, object] of blockFacts) {
        await this.addFact(subject, predicate, object, 'blocks');
      }

      // Mob hostility facts
      const mobFacts = [
        ['zombie', 'hostility', 'always_hostile'],
        ['skeleton', 'hostility', 'always_hostile'],
        ['creeper', 'hostility', 'always_hostile'],
        ['spider', 'hostility', 'always_hostile'],
        ['enderman', 'hostility', 'neutral'],
        ['iron_golem', 'hostility', 'neutral'],
        ['cow', 'hostility', 'passive'],
        ['sheep', 'hostility', 'passive'],
        ['pig', 'hostility', 'passive'],
        ['villager', 'hostility', 'passive'],
      ];

      for (const [subject, predicate, object] of mobFacts) {
        await this.addFact(subject, predicate, object, 'mobs');
      }

      // Common recipes
      const recipeFacts = [
        ['crafting_table', 'recipe', '4 oak_planks (2x2)'],
        ['wooden_pickaxe', 'recipe', '3 oak_planks + 2 sticks'],
        ['stone_pickaxe', 'recipe', '3 cobblestone + 2 sticks'],
        ['iron_pickaxe', 'recipe', '3 iron_ingot + 2 sticks'],
        ['furnace', 'recipe', '8 cobblestone'],
        ['stick', 'recipe', '2 oak_planks'],
        ['oak_planks', 'recipe', '1 oak_log'],
        ['chest', 'recipe', '8 oak_planks'],
      ];

      for (const [subject, predicate, object] of recipeFacts) {
        await this.addFact(subject, predicate, object, 'recipes');
      }

      // Survival mechanics
      const survivalFacts = [
        ['health', 'max_value', '20'],
        ['food', 'max_value', '20'],
        ['oxygen', 'max_value', '20'],
        ['fall_damage', 'threshold', '3 blocks'],
        ['lava', 'damage', 'deadly'],
        ['fire', 'damage', 'high'],
        ['water', 'damage', 'drowning'],
      ];

      for (const [subject, predicate, object] of survivalFacts) {
        await this.addFact(subject, predicate, object, 'mechanics');
      }

      // Tool durability
      const durabilityFacts = [
        ['wooden_pickaxe', 'durability', '59'],
        ['stone_pickaxe', 'durability', '131'],
        ['iron_pickaxe', 'durability', '250'],
        ['diamond_pickaxe', 'durability', '1561'],
        ['wooden_axe', 'durability', '59'],
        ['stone_axe', 'durability', '131'],
        ['iron_axe', 'durability', '250'],
        ['diamond_axe', 'durability', '1561'],
        ['wooden_shovel', 'durability', '59'],
        ['stone_shovel', 'durability', '131'],
        ['iron_shovel', 'durability', '250'],
        ['diamond_shovel', 'durability', '1561'],
      ];

      for (const [subject, predicate, object] of durabilityFacts) {
        await this.addFact(subject, predicate, object, 'items');
      }

      // Mark bootstrap as complete
      await this.addFact('knowledge_base', 'bootstrap_version', 'v1', 'mechanics');
    } catch {
      // Bootstrap failure is not critical
    }
  }

  // ─── Utilities ──────────────────────────────────────────

  private async call(name: string, args: Record<string, unknown>) {
    if (this.mode === 'off') throw new Error('Memory is disabled');
    if (this.mode === 'read-only' && /add|write|invalidate|update|delete/.test(name)) throw new Error('Memory is read-only');
    if (Date.now() < this.retryAfter) throw new Error(this.statusData.lastError || 'MemPalace retry backoff');
    const started = Date.now();
    this.statusData.calls++;
    try {
      if (this.reconnectNeeded && this.options.url) {
        await this.client.disconnect().catch(() => {});
        await this.client.connectToUrl(this.options.url, { timeoutMs: this.options.timeoutMs ?? 5000, signal: this.signal });
        this.reconnectNeeded = false;
      } else if (!this.client.isConnected && this.options.url) await this.client.connectToUrl(this.options.url, { timeoutMs: this.options.timeoutMs ?? 5000, signal: this.signal });
      const result = await this.client.callTool(name, args, { timeoutMs: this.options.timeoutMs ?? 5000, signal: this.signal });
      const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      const payload = this.parseObject(text);
      if (result.isError || payload.error || payload.success === false) {
        if (/TRANSPORT|session|fetch failed|not connected/i.test(text)) this.reconnectNeeded = true;
        throw new Error(text || `${name} failed`);
      }
      this.statusData.availability = 'ready';
      this.statusData.lastError = '';
      return result;
    } catch (error) { this.failed(error); throw error; }
    finally { this.statusData.elapsedMs += Date.now() - started; }
  }

  private extractText(result: { content: Array<{ type: string; text?: string }>; isError?: boolean } | null | undefined): string {
    if (!result?.content || result.isError) return '';
    return result.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!)
      .join('\n');
  }
}

/**
 * Infer the appropriate MemPalace skill room from a goal description.
 */
export function inferSkillRoom(goal: string): string {
  const g = goal.toLowerCase();
  if (g.includes('wood') || g.includes('tree') || g.includes('log')) return 'wood-gathering';
  if (g.includes('craft') || g.includes('make') || g.includes('smelt')) return 'crafting';
  if (g.includes('mine') || g.includes('dig') || g.includes('excavate')) return 'mining';
  if (g.includes('navigate') || g.includes('find') || g.includes('go to') || g.includes('path')) return 'navigation';
  if (g.includes('fight') || g.includes('kill') || g.includes('attack') || g.includes('combat')) return 'combat';
  if (g.includes('farm') || g.includes('plant') || g.includes('grow') || g.includes('harvest')) return 'farming';
  return 'survival';
}
