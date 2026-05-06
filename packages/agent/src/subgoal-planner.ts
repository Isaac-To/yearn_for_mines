import type { LlmClient, LlmMessage } from '@yearn-for-mines/shared';

/**
 * A single sub-goal within a decomposed goal sequence.
 */
export interface SubGoal {
  /** Unique identifier within the plan, e.g. "sg-1" */
  id: string;
  /** Human-readable description, e.g. "Gather 3 oak_log" */
  description: string;
  /** Cue the LLM can use to verify this sub-goal was achieved, e.g. "Inventory contains oak_log >= 3" */
  verificationCue: string;
  /** Max loop iterations to attempt this sub-goal before giving up */
  maxIterations: number;
  /** Optional sub-goal IDs that must be completed before this one */
  dependencies?: string[];
}

/**
 * Overall plan result.
 */
export interface SubGoalPlan {
  subgoals: SubGoal[];
  /** The high-level goal this plan is for */
  goal: string;
}

/**
 * Result of executing a single sub-goal.
 */
export interface SubGoalResult {
  subgoal: SubGoal;
  success: boolean;
  error?: string;
  stepsUsed: number;
}

/**
 * Planner that decomposes high-level goals into structured sub-goal sequences
 * using an LLM call, then manages sequential execution with failure adaptation.
 *
 * Inspired by Voyager's task decomposition (Wang et al., 2305.16291) and
 * Optimus-2's goal conditioning (Li et al., 2502.19902).
 */
export class SubGoalPlanner {
  private llmClient: LlmClient;

  constructor(llmClient: LlmClient) {
    this.llmClient = llmClient;
  }

  /**
   * Build the planner system prompt that instructs the LLM to decompose goals.
   */
  private buildPlannerPrompt(goal: string, observation: string): LlmMessage[] {
    return [
      {
        role: 'system',
        content: `You are a Minecraft task planner. Your job is to break high-level goals into concrete, executable sub-goals.

Rules:
1. Each sub-goal must be achievable with the available MCP tools (gather_materials, craft_macro, craft_items, reposition, build, interact, combat, interact_block_macro)
2. Each sub-goal must be verifiable by checking the agent's observation (inventory contents, position, nearby blocks)
3. Sub-goals must be ordered logically with prerequisites first
4. Keep the total plan to 2-5 sub-goals
5. Be specific about quantities ("Gather 3 oak_log" not "Get wood")
6. Each sub-goal should require roughly 3-10 agent loop iterations

Output ONLY a valid JSON object with no markdown formatting:
{
  "subgoals": [
    {
      "id": "sg-1",
      "description": "Gather 3 oak_log",
      "verificationCue": "Inventory contains oak_log >= 3",
      "maxIterations": 8
    }
  ]
}`,
      },
      {
        role: 'user',
        content: `Goal: ${goal}\n\nCurrent world state:\n${observation}\n\nBreak this goal into sub-goals.`,
      },
    ];
  }

  /**
   * Build a re-planning prompt when a sub-goal has failed.
   */
  private buildReplanPrompt(
    goal: string,
    observation: string,
    failedSubgoal: SubGoal,
    error: string,
    completedDescriptions: string[],
  ): LlmMessage[] {
    const completed = completedDescriptions.length > 0
      ? `\n\nAlready completed sub-goals:\n${completedDescriptions.map(d => `  ✓ ${d}`).join('\n')}`
      : '';

    return [
      {
        role: 'system',
        content: `You are a Minecraft task planner. A sub-goal has failed and you need to replan the remaining work.

Rules:
1. Output sub-goals for the REMAINING work only (skip already completed steps)
2. Try a different approach than what was attempted before
3. If the failed sub-goal is truly impossible with current tools/inventory, suggest an alternative path
4. Keep to 1-4 remaining sub-goals

Output ONLY a valid JSON object with no markdown formatting:
{
  "subgoals": [
    {
      "id": "sg-1",
      "description": "Alternative approach description",
      "verificationCue": "How to verify this worked",
      "maxIterations": 8
    }
  ]
}`,
      },
      {
        role: 'user',
        content: `Original goal: ${goal}
Failed sub-goal: ${failedSubgoal.description}
Error: ${error}
Current world state:
${observation}${completed}

Re-plan the remaining work to achieve the original goal.`,
      },
    ];
  }

  /**
   * Call the LLM to generate a structured sub-goal plan.
   * Returns the plan or null if the LLM fails to produce valid output.
   */
  async planSubGoals(goal: string, observation: string): Promise<SubGoalPlan | null> {
    const messages = this.buildPlannerPrompt(goal, observation);

    try {
      const response = await this.llmClient.chat(messages, []);
      const content = (response as any)?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') return null;

      const parsed = this.parsePlanResponse(content);
      if (!parsed || parsed.subgoals.length === 0) return null;

      return { subgoals: parsed.subgoals, goal };
    } catch {
      return null;
    }
  }

  /**
   * Re-plan after a sub-goal fails.
   */
  async adaptOnFailure(
    goal: string,
    observation: string,
    failedSubgoal: SubGoal,
    error: string,
    completedDescriptions: string[],
  ): Promise<SubGoalPlan | null> {
    const messages = this.buildReplanPrompt(goal, observation, failedSubgoal, error, completedDescriptions);

    try {
      const response = await this.llmClient.chat(messages, []);
      const content = (response as any)?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') return null;

      const parsed = this.parsePlanResponse(content);
      if (!parsed || parsed.subgoals.length === 0) return null;

      // Offset IDs to avoid collision with previous plan
      const adjusted = parsed.subgoals.map((sg, i) => ({
        ...sg,
        id: `rp-${i + 1}`,
      }));

      return { subgoals: adjusted, goal };
    } catch {
      return null;
    }
  }

  /**
   * Extract and parse a JSON sub-goal list from an LLM response.
   * Handles various response formats (raw JSON, JSON in markdown blocks, etc.).
   */
  private parsePlanResponse(content: string): { subgoals: SubGoal[] } | null {
    // Try direct JSON parse first
    try {
      const parsed = JSON.parse(content);
      if (this.isValidPlan(parsed)) return parsed;
    } catch {
      // Not direct JSON, try extracting from markdown or text
    }

    // Try extracting JSON from markdown code block
    const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      try {
        const parsed = JSON.parse(jsonBlockMatch[1].trim());
        if (this.isValidPlan(parsed)) return parsed;
      } catch {
        // Malformed JSON in block
      }
    }

    // Try finding a JSON object anywhere in the text
    const jsonMatch = content.match(/\{[\s\S]*"subgoals"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (this.isValidPlan(parsed)) return parsed;
      } catch {
        // Still malformed
      }
    }

    return null;
  }

  /**
   * Validate that a parsed response has the right shape.
   */
  private isValidPlan(parsed: any): parsed is { subgoals: SubGoal[] } {
    if (!parsed || !Array.isArray(parsed.subgoals)) return false;
    if (parsed.subgoals.length === 0 || parsed.subgoals.length > 10) return false;
    return parsed.subgoals.every(
      (sg: any) =>
        typeof sg.id === 'string' &&
        typeof sg.description === 'string' &&
        typeof sg.verificationCue === 'string' &&
        typeof sg.maxIterations === 'number' &&
        sg.maxIterations > 0,
    );
  }
}
