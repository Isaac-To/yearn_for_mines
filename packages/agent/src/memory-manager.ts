import type { McpClient } from '@yearn-for-mines/shared';
import type { ToolCall } from '@yearn-for-mines/shared';

/**
 * Manages MemPalace integration for the agent.
 * Handles skill storage, retrieval, knowledge graph management,
 * diary entries, wing/room initialization, and knowledge bootstrapping.
 */
export class MemoryManager {
  private client: McpClient;
  private initialized = false;

  constructor(mempalaceClient: McpClient) {
    this.client = mempalaceClient;
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

  // ─── Wing/Room Initialization ───────────────────────────

  /**
   * Initialize the Minecraft wings and rooms in MemPalace.
   * Safe to call multiple times — will skip if already initialized.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create minecraft-skills wing with rooms
      const skillRooms = [
        'wood-gathering',
        'crafting',
        'mining',
        'navigation',
        'combat',
        'farming',
        'survival',
      ];

      for (const room of skillRooms) {
        await this.client.callTool('mempalace_add_room', {
          wing: 'minecraft-skills',
          room,
        });
      }

      // Create minecraft-knowledge wing with rooms
      const knowledgeRooms = [
        'blocks',
        'items',
        'mobs',
        'recipes',
        'biomes',
        'mechanics',
      ];

      for (const room of knowledgeRooms) {
        await this.client.callTool('mempalace_add_room', {
          wing: 'minecraft-knowledge',
          room,
        });
      }

      this.initialized = true;
    } catch {
      // Initialization failure is not critical
    }
  }

  // ─── Skill Storage ──────────────────────────────────────

  /**
   * Store a verified skill sequence as a drawer in MemPalace.
   * Checks for duplicates before storing.
   */
  async storeSkill(goal: string, toolCalls: ToolCall[], room: string): Promise<boolean> {
    const skillDescription = this.formatSkillSequence(goal, toolCalls);

    // Check for duplicates
    const isDuplicate = await this.checkDuplicate(goal, room);
    if (isDuplicate) return false;

    try {
      await this.client.callTool('mempalace_add_drawer', {
        wing: 'minecraft-skills',
        room,
        label: goal,
        content: skillDescription,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Format a skill sequence as a readable string.
   */
  formatSkillSequence(goal: string, toolCalls: ToolCall[]): string {
    const steps = toolCalls.map((tc, i) =>
      `Step ${i + 1}: ${tc.name}(${JSON.stringify(tc.args)})`
    ).join('\n');
    return `Goal: ${goal}\n\nSequence:\n${steps}`;
  }

  /**
   * Check if a skill with the same goal already exists.
   */
  private async checkDuplicate(goal: string, room: string): Promise<boolean> {
    try {
      const result = await this.client.callTool('mempalace_list_drawers', {
        wing: 'minecraft-skills',
        room,
      });
      const text = this.extractText(result);
      // Check if the goal label appears in the drawer list
      return text.toLowerCase().includes(goal.toLowerCase());
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
      const result = await this.client.callTool('mempalace_search', {
        query: goal,
        limit,
      });
      return this.extractText(result) || undefined;
    } catch {
      return undefined;
    }
  }

  // ─── Knowledge Graph Management ─────────────────────────

  /**
   * Add a fact to the knowledge graph.
   */
  async addFact(subject: string, predicate: string, object: string, room: string): Promise<boolean> {
    try {
      await this.client.callTool('mempalace_kg_add', {
        wing: 'minecraft-knowledge',
        room,
        subject,
        predicate,
        object,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Query facts from the knowledge graph.
   */
  async queryFacts(subject?: string, predicate?: string, room?: string): Promise<string | undefined> {
    try {
      const args: Record<string, unknown> = {};
      if (subject) args.subject = subject;
      if (predicate) args.predicate = predicate;
      if (room) args.room = room;

      const result = await this.client.callTool('mempalace_kg_query', args);
      return this.extractText(result) || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Invalidate an outdated fact from the knowledge graph.
   */
  async invalidateFact(factId: string): Promise<boolean> {
    try {
      await this.client.callTool('mempalace_kg_invalidate', { fact_id: factId });
      return true;
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
      await this.client.callTool('mempalace_diary_write', {
        wing: 'minecraft-skills',
        entry: description,
        mood: 'frustrated',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Write a milestone record to the diary.
   */
  async writeMilestone(goal: string, details: string): Promise<boolean> {
    try {
      await this.client.callTool('mempalace_diary_write', {
        wing: 'minecraft-skills',
        entry: `Milestone: ${goal} — ${details}`,
        mood: 'accomplished',
      });
      return true;
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

  private extractText(result: { content: Array<{ type: string; text?: string }> } | null | undefined): string {
    if (!result?.content) return '';
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