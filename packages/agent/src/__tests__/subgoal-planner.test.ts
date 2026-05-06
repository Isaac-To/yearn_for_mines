import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubGoalPlanner, type SubGoal } from '../subgoal-planner.js';
import { LlmClient } from '@yearn-for-mines/shared';

function createMockLlmClient(): LlmClient {
  return new LlmClient({
    baseUrl: 'http://localhost:11434/v1',
    model: 'test-model',
  });
}

function mockChatResponse(planner: SubGoalPlanner, responseText: string) {
  vi.spyOn(planner as any, 'llmClient', 'get').mockReturnValue({
    chat: vi.fn().mockResolvedValue({
      choices: [{ message: { content: responseText } }],
    }),
  } as any);
  return planner;
}

describe('SubGoalPlanner', () => {
  let planner: SubGoalPlanner;
  let llmClient: LlmClient;

  beforeEach(() => {
    llmClient = createMockLlmClient();
    planner = new SubGoalPlanner(llmClient);
  });

  describe('planSubGoals', () => {
    it('parses a valid JSON sub-goal plan from LLM response', async () => {
      const validResponse = JSON.stringify({
        subgoals: [
          { id: 'sg-1', description: 'Gather 3 oak_log', verificationCue: 'Inventory has oak_log >= 3', maxIterations: 8 },
          { id: 'sg-2', description: 'Craft oak_planks', verificationCue: 'Inventory has oak_planks', maxIterations: 5 },
          { id: 'sg-3', description: 'Craft a crafting_table', verificationCue: 'Inventory has crafting_table', maxIterations: 5 },
        ],
      });

      vi.spyOn(llmClient, 'chat').mockResolvedValue({
        choices: [{ message: { content: validResponse } }],
      });

      const plan = await planner.planSubGoals('craft a wooden pickaxe', 'Position: (0, 64, 0)');
      expect(plan).not.toBeNull();
      expect(plan!.subgoals).toHaveLength(3);
      expect(plan!.subgoals[0].description).toBe('Gather 3 oak_log');
      expect(plan!.subgoals[0].maxIterations).toBe(8);
    });

    it('parses JSON from a markdown code block', async () => {
      const markdownResponse = 'Here is my plan:\n\n```json\n{\n  "subgoals": [\n    { "id": "sg-1", "description": "Mine stone", "verificationCue": "stone in inventory", "maxIterations": 5 }\n  ]\n}\n```\n\nLet me know if you need changes.';

      vi.spyOn(llmClient, 'chat').mockResolvedValue({
        choices: [{ message: { content: markdownResponse } }],
      });

      const plan = await planner.planSubGoals('get stone', 'observation');
      expect(plan).not.toBeNull();
      expect(plan!.subgoals).toHaveLength(1);
      expect(plan!.subgoals[0].description).toBe('Mine stone');
    });

    it('returns null on malformed JSON', async () => {
      vi.spyOn(llmClient, 'chat').mockResolvedValue({
        choices: [{ message: { content: 'This is not JSON at all' } }],
      });

      const plan = await planner.planSubGoals('test', 'obs');
      expect(plan).toBeNull();
    });

    it('returns null on empty sub-goals array', async () => {
      vi.spyOn(llmClient, 'chat').mockResolvedValue({
        choices: [{ message: { content: '{"subgoals": []}' } }],
      });

      const plan = await planner.planSubGoals('test', 'obs');
      expect(plan).toBeNull();
    });

    it('returns null on missing subgoals key', async () => {
      vi.spyOn(llmClient, 'chat').mockResolvedValue({
        choices: [{ message: { content: '{"items": [{"id": "a"}]}' } }],
      });

      const plan = await planner.planSubGoals('test', 'obs');
      expect(plan).toBeNull();
    });

    it('returns null when LLM call fails', async () => {
      vi.spyOn(llmClient, 'chat').mockRejectedValue(new Error('API error'));

      const plan = await planner.planSubGoals('test', 'obs');
      expect(plan).toBeNull();
    });

    it('rejects sub-goals with missing fields', async () => {
      vi.spyOn(llmClient, 'chat').mockResolvedValue({
        choices: [{ message: { content: '{"subgoals": [{"id": "sg-1", "description": "test"}]}' } }],
      });

      const plan = await planner.planSubGoals('test', 'obs');
      expect(plan).toBeNull();
    });

    it('rejects more than 10 sub-goals', async () => {
      const manySubgoals = Array.from({ length: 15 }, (_, i) => ({
        id: `sg-${i + 1}`,
        description: `Step ${i + 1}`,
        verificationCue: `done ${i + 1}`,
        maxIterations: 3,
      }));
      vi.spyOn(llmClient, 'chat').mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ subgoals: manySubgoals }) } }],
      });

      const plan = await planner.planSubGoals('test', 'obs');
      expect(plan).toBeNull();
    });
  });

  describe('adaptOnFailure', () => {
    it('generates a revised plan after sub-goal failure', async () => {
      const failedSubgoal: SubGoal = {
        id: 'sg-2',
        description: 'Craft oak_planks from logs',
        verificationCue: 'Inventory has oak_planks',
        maxIterations: 5,
      };

      const validResponse = JSON.stringify({
        subgoals: [
          { id: 'new-1', description: 'Chop more oak_log first', verificationCue: 'logs >= 4', maxIterations: 8 },
        ],
      });

      vi.spyOn(llmClient, 'chat').mockResolvedValue({
        choices: [{ message: { content: validResponse } }],
      });

      const plan = await planner.adaptOnFailure(
        'Craft a wooden pickaxe',
        'Position: (0, 64, 0)',
        failedSubgoal,
        'Not enough logs in inventory',
        ['Gather 3 oak_log'],
      );

      expect(plan).not.toBeNull();
      expect(plan!.subgoals).toHaveLength(1);
      // IDs should be offset to avoid collision
      expect(plan!.subgoals[0].id).toBe('rp-1');
    });

    it('returns null when re-planning LLM fails', async () => {
      vi.spyOn(llmClient, 'chat').mockRejectedValue(new Error('API error'));

      const plan = await planner.adaptOnFailure(
        'test', 'obs',
        { id: 'sg-1', description: 'do x', verificationCue: 'x done', maxIterations: 3 },
        'error msg', [],
      );
      expect(plan).toBeNull();
    });
  });

  describe('parsePlanResponse (private)', () => {
    it('extracts JSON from raw text without code blocks', () => {
      // Access private method via prototype
      const parseFn = (SubGoalPlanner.prototype as any).parsePlanResponse.bind(planner);
      
      const result = parseFn('Some text {"subgoals": [{"id": "a", "description": "b", "verificationCue": "c", "maxIterations": 3}]} more text');
      expect(result).not.toBeNull();
      expect(result!.subgoals).toHaveLength(1);
    });
  });
});
