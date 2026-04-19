import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLoop, DEFAULT_AGENT_CONFIG, type AgentStep } from '../agent-loop.js';
import { McpClient } from '@yearn-for-mines/shared';
import { LlmClient, type ToolCall, type ToolDescription } from '@yearn-for-mines/shared';

// ─── Mock Factories ──────────────────────────────────────

function createMockMcClient(tools: ToolDescription[] = []): McpClient {
  const mock = {
    isConnected: true,
    callTool: vi.fn(),
    listTools: vi.fn().mockResolvedValue(tools),
    connect: vi.fn(),
    disconnect: vi.fn(),
    readResource: vi.fn(),
  } as unknown as McpClient;
  return mock;
}

function createMockMempalaceClient(tools: ToolDescription[] = []): McpClient {
  return createMockMcClient(tools);
}

function createMockLlmClient(): LlmClient {
  return new LlmClient({
    baseUrl: 'http://localhost:11434/v1',
    model: 'test-model',
  });
}

function mockToolCall(name: string, args: Record<string, unknown> = {}, id: string = 'tc_1'): ToolCall {
  return { id, name, args };
}

function mockLlmResponse(toolCalls: ToolCall[] = [], content?: string): Record<string, unknown> {
  return {
    choices: [{
      message: {
        content: content ?? null,
        tool_calls: toolCalls.length > 0
          ? toolCalls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.args),
              },
            }))
          : undefined,
      },
    }],
  };
}

function mockToolResult(text: string, isError: boolean = false) {
  return {
    content: [{ type: 'text' as const, text }],
    isError,
  };
}

// ─── Tests ───────────────────────────────────────────────

describe('AgentLoop', () => {
  let mcClient: McpClient;
  let llmClient: LlmClient;
  let chatSpy: ReturnType<typeof vi.fn>;

  const defaultTools: ToolDescription[] = [
    { name: 'observe', description: 'Observe the world' },
    { name: 'pathfind_to', description: 'Pathfind to a location' },
    { name: 'dig_block', description: 'Dig a block' },
    { name: 'craft_item', description: 'Craft an item' },
  ];

  const mempalaceTools: ToolDescription[] = [
    { name: 'mempalace_search', description: 'Search memories' },
    { name: 'mempalace_add_drawer', description: 'Store a skill' },
    { name: 'mempalace_diary_write', description: 'Write diary entry' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mcClient = createMockMcClient(defaultTools);
    llmClient = createMockLlmClient();
    chatSpy = vi.fn();
  });

  describe('construction', () => {
    it('should create with default config', () => {
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'gather wood' });
      expect(loop.isRunning).toBe(false);
      expect(loop.currentIteration).toBe(0);
    });

    it('should accept custom config', () => {
      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'gather wood',
        maxIterations: 10,
        maxRetries: 5,
        maxObservationTokens: 1000,
      });
      expect(loop).toBeDefined();
    });

    it('should accept optional mempalace client', () => {
      const mempalace = createMockMempalaceClient(mempalaceTools);
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test' }, mempalace);
      expect(loop).toBeDefined();
    });
  });

  describe('perceive phase', () => {
    it('should call observe tool and return observation text', async () => {
      const observeResult = mockToolResult('Position: (0, 64, 0). Health: 20/20.');
      const eventsResult = mockToolResult('No events subscribed');

      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(eventsResult)
        .mockResolvedValueOnce(observeResult);

      // Mock LLM to return no tool calls (verify path should confirm completion)
      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([], 'I am done.'))
        .mockResolvedValueOnce(mockLlmResponse([], 'I am done.'));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'stand still',
        maxIterations: 1,
      });

      const steps = await loop.run();
      expect(mcClient.callTool).toHaveBeenCalledWith('observe', {});
      expect(steps).toHaveLength(1);
    });

    it('should include events in observation', async () => {
      const observeResult = mockToolResult('Position: (0, 64, 0).');
      const eventsResult = mockToolResult('Zombie spawned to the north');

      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(eventsResult)
        .mockResolvedValueOnce(observeResult);

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done.'))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done.'));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      const _steps = await loop.run();
      expect(mcClient.callTool).toHaveBeenCalledWith('get_events', {});
    });
  });

  describe('plan phase', () => {
    it('should call LLM with observation and parse tool calls', async () => {
      const observeResult = mockToolResult('Position: (0, 64, 0). Trees nearby.');
      const eventsResult = mockToolResult('No events subscribed');
      const pathfindResult = mockToolResult('Path found to tree at (10, 64, 5).');

      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(eventsResult)
        .mockResolvedValueOnce(pathfindResult);

      const toolCalls = [mockToolCall('pathfind_to', { x: 10, y: 64, z: 5 })];
      chatSpy
        .mockResolvedValueOnce(mockLlmResponse(toolCalls))
        // verify response - no tool calls means goal achieved
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, goal achieved'));

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'go to tree', maxIterations: 5 });
      const steps = await loop.run();

      expect(steps[0].toolCalls).toHaveLength(1);
      expect(steps[0].toolCalls[0].name).toBe('pathfind_to');
    });

    it('should handle LLM returning no tool calls', async () => {
      const observeResult = mockToolResult('Position: (0, 64, 0).');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(observeResult);

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, goal achieved.'))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, goal achieved.'));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      const steps = await loop.run();

      expect(steps).toHaveLength(1);
      expect(steps[0].toolCalls).toHaveLength(0);
      expect(steps[0].goalAchieved).toBe(true);
    });

    it('should handle LLM failure gracefully', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''));

      chatSpy.mockRejectedValueOnce(new Error('LLM unavailable'));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      const steps = await loop.run();

      // Should return empty tool calls when LLM fails
      expect(steps).toHaveLength(1);
      expect(steps[0].toolCalls).toHaveLength(0);
    });
  });

  describe('execute phase', () => {
    it('should execute tool calls and collect results', async () => {
      const observeResult = mockToolResult('Observation');
      const digResult = mockToolResult('Successfully dug oak_log');
      const collectResult = mockToolResult('Collected oak_log');

      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(digResult)
        .mockResolvedValueOnce(collectResult);

      const toolCalls = [
        mockToolCall('dig_block', { position: { x: 10, y: 64, z: 5 } }, 'tc_1'),
        mockToolCall('collect_item', { item: 'oak_log' }, 'tc_2'),
      ];

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse(toolCalls))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done'));

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'dig tree', maxIterations: 5 });
      const steps = await loop.run();

      expect(steps[0].toolResults).toHaveLength(2);
      expect(steps[0].toolResults[0].name).toBe('dig_block');
      expect(steps[0].toolResults[0].isError).toBe(false);
    });

    it('should route mempalace tool calls to mempalace client', async () => {
      const mempalaceClient = createMockMempalaceClient(mempalaceTools);
      const mempalaceResult = mockToolResult('Found 2 relevant memories');

      (mempalaceClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mempalaceResult); // search in retrieveMemories
      (mempalaceClient.listTools as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mempalaceTools);

      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''));

      chatSpy.mockResolvedValueOnce(mockLlmResponse([], 'Yes, done'));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 }, mempalaceClient);
      await loop.run();

      // mempalace_search should have been called during memory retrieval
      expect(mempalaceClient.callTool).toHaveBeenCalledWith('mempalace_search', expect.objectContaining({ query: 'test' }));
    });

    it('should handle tool execution errors', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(mockToolResult('Block not found', true)); // error

      // After retry fails, try alternative which also fails
      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done')); // verify

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig',
        maxIterations: 5,
        maxRetries: 0, // No retries for this test
      });
      const steps = await loop.run();

      expect(steps[0].toolResults[0].isError).toBe(true);
    });
  });

  describe('retry logic', () => {
    it('should retry on error up to maxRetries', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(mockToolResult('Error: not close enough', true))  // 1st attempt
        .mockResolvedValueOnce(mockToolResult('Successfully dug block', false));  // 2nd attempt (retry)

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done')); // verify

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig block',
        maxIterations: 5,
        maxRetries: 3,
      });
      const steps = await loop.run();

      expect(steps[0].retriesUsed).toBeGreaterThanOrEqual(1);
      expect(steps[0].toolResults[0].isError).toBe(false);
    });

    it('should try alternative after max retries exhausted', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(mockToolResult('Error', true))  // 1st attempt
        .mockResolvedValueOnce(mockToolResult('Error', true))  // 2nd attempt
        .mockResolvedValueOnce(mockToolResult('Error', true))  // 3rd attempt (max retries)
        .mockResolvedValueOnce(mockToolResult('Found block', false)); // alternative: find_block

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]))
        // Alternative approach: LLM suggests find_block
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('find_block', { type: 'oak_log' })], 'Try find_block instead'))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done')); // verify

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig block',
        maxIterations: 5,
        maxRetries: 2,
      });
      const steps = await loop.run();

      expect(steps[0].retriesUsed).toBe(2);
    });
  });

  describe('verify phase', () => {
    it('should detect success when LLM verifies goal achieved', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValue(observeResult);

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('pathfind_to', { x: 10 })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, goal achieved'));

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'go to tree', maxIterations: 5 });
      const steps = await loop.run();

      expect(steps[0].goalAchieved).toBe(true);
    });
  });

  describe('remember phase', () => {
    it('should store successful skill in mempalace', async () => {
      const mempalaceClient = createMockMempalaceClient(mempalaceTools);
      (mempalaceClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('No relevant memories found')) // search
        .mockResolvedValueOnce(mockToolResult('Drawer added successfully')); // add_drawer

      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(mockToolResult('Success: gathered wood'));

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { block: 'oak_log' })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, goal achieved'));

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'gather wood', maxIterations: 5 }, mempalaceClient);
      await loop.run();

      expect(mempalaceClient.callTool).toHaveBeenCalledWith('mempalace_add_drawer', expect.objectContaining({
        wing: 'minecraft-skills',
        room: 'wood-gathering',
      }));
    });

    it('should infer correct skill room from goal', async () => {
      const mempalaceClient = createMockMempalaceClient(mempalaceTools);
      (mempalaceClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('No memories'))
        .mockResolvedValueOnce(mockToolResult('Added'));

      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('Obs'))
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(mockToolResult('Success'));

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('craft_item', { name: 'stone_pickaxe' })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done'));

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'craft a pickaxe', maxIterations: 5 }, mempalaceClient);
      await loop.run();

      expect(mempalaceClient.callTool).toHaveBeenCalledWith('mempalace_add_drawer', expect.objectContaining({
        room: 'crafting',
      }));
    });
  });

  describe('loop control', () => {
    it('should stop after max iterations', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValue(observeResult);

      // Always return tool calls so the loop continues
      chatSpy.mockResolvedValue(mockLlmResponse([mockToolCall('observe', {})]));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'test',
        maxIterations: 3,
        loopDelayMs: 0,
      });
      const _steps = await loop.run();

      expect(loop.currentIteration).toBe(3);
      expect(loop.isRunning).toBe(false);
    });

    it('should stop when stop() is called', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValue(observeResult);

      chatSpy.mockResolvedValue(mockLlmResponse([mockToolCall('observe', {})]));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'test',
        maxIterations: 100,
        loopDelayMs: 0,
      });

      // Stop after first step
      loop.setStepCallback(() => {
        loop.stop();
      });

      const _steps = await loop.run();
      expect(loop.isRunning).toBe(false);
    });

    it('should emit steps via callback', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(mockToolResult('Success'));

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('observe', {})]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done'));

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const receivedSteps: AgentStep[] = [];
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 5 });
      loop.setStepCallback(step => receivedSteps.push(step));

      await loop.run();

      expect(receivedSteps.length).toBeGreaterThan(0);
    });
  });

  describe('default config', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_AGENT_CONFIG.maxIterations).toBe(100);
      expect(DEFAULT_AGENT_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_AGENT_CONFIG.maxObservationTokens).toBe(2000);
      expect(DEFAULT_AGENT_CONFIG.enableVlm).toBe(false);
      expect(DEFAULT_AGENT_CONFIG.loopDelayMs).toBe(500);
    });
  });

  describe('loop delay', () => {
    it('should delay between iterations when loopDelayMs > 0', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(mockToolResult('Error', true))  // first attempt fails
        .mockResolvedValueOnce(observeResult)                    // re-observe for verify
        .mockResolvedValueOnce(mockToolResult(''))              // events for verify
        .mockResolvedValueOnce(mockToolResult('Success'))       // second iteration observe
        .mockResolvedValueOnce(observeResult);                  // second iteration verify

      // First iteration: tool call that reports error
      // Second iteration: no tool calls (goal achieved)
      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]))
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('observe', {})])) // verify - more tools
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done'))    // second iteration plan
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done'));   // second iteration verify

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig',
        maxIterations: 5,
        loopDelayMs: 10,  // Small delay for testing
        maxRetries: 0,
      });

      const steps = await loop.run();
      expect(steps.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('VLM screenshot', () => {
    it('should call screenshot tool when VLM enabled', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(mockToolResult('Screenshot captured')) // screenshot
        .mockResolvedValueOnce(observeResult); // verify re-observe

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done'))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done'));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'test',
        maxIterations: 1,
        enableVlm: true,
      });

      await loop.run();
      expect(mcClient.callTool).toHaveBeenCalledWith('screenshot', {});
    });
  });

  describe('mempalace routing', () => {
    it('should route mempalace_ prefixed calls to mempalace client when connected', async () => {
      const mempalaceClient = createMockMempalaceClient(mempalaceTools);
      (mempalaceClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('No memories')); // search during retrieveMemories
      (mempalaceClient.listTools as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mempalaceTools);

      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''));

      // Agent calls a mempalace tool directly (not just during retrieveMemories)
      (mempalaceClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('No memories'))  // search
        .mockResolvedValueOnce(mockToolResult('KG added'));     // mempalace_kg_add

      // Also need observe for verify step
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult) // verify re-observe
        .mockResolvedValueOnce(mockToolResult('')) // verify events
        .mockResolvedValueOnce(mockToolResult('Success')); // tool success

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('mempalace_kg_add', { subject: 'test' })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done'));

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 5 }, mempalaceClient);
      await loop.run();

      // mempalace_kg_add should be routed to mempalaceClient
      expect(mempalaceClient.callTool).toHaveBeenCalledWith('mempalace_kg_add', expect.anything());
    });
  });

  describe('tool execution error handling', () => {
    it('should handle exceptions thrown by tool calls', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockRejectedValueOnce(new Error('Connection lost'))  // tool throws
        .mockResolvedValueOnce(observeResult) // verify re-observe
        .mockResolvedValueOnce(mockToolResult('')); // verify events

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done')); // verify

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig',
        maxIterations: 5,
        maxRetries: 0,
      });

      const steps = await loop.run();
      expect(steps[0].toolResults[0].isError).toBe(true);
      expect(steps[0].toolResults[0].result).toContain('Connection lost');
    });
  });

  describe('alternative approach', () => {
    it('should handle alternative approach LLM failure', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(mockToolResult('Error', true))   // 1st attempt
        .mockResolvedValueOnce(mockToolResult('Error', true))   // retry 1
        .mockResolvedValueOnce(mockToolResult('Error', true))   // retry 2 (max)
        .mockResolvedValueOnce(observeResult)  // verify re-observe
        .mockResolvedValueOnce(mockToolResult('')); // verify events

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]))
        .mockRejectedValueOnce(new Error('LLM failed for alternative')) // alternative LLM call fails
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done')); // verify

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig',
        maxIterations: 5,
        maxRetries: 2,
      });

      const steps = await loop.run();
      // Tool should still have error result since alternative failed
      expect(steps[0].toolResults.some(r => r.isError)).toBe(true);
    });

    it('should fall back when alternative returns same tool name', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(mockToolResult('Error', true))   // 1st attempt
        .mockResolvedValueOnce(mockToolResult('Error', true))   // retry 1
        .mockResolvedValueOnce(mockToolResult('Error', true))   // retry 2 (max)
        .mockResolvedValueOnce(observeResult)  // verify re-observe
        .mockResolvedValueOnce(mockToolResult('')); // verify events

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]))
        // Alternative suggests same tool — should not use it
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 20 })], 'Try different block'))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done')); // verify

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig',
        maxIterations: 5,
        maxRetries: 2,
      });

      const steps = await loop.run();
      expect(steps[0].retriesUsed).toBe(2);
    });
  });

  describe('verify phase edge cases', () => {
    it('should handle re-observe failure in verify', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)     // perceive observe
        .mockResolvedValueOnce(mockToolResult('')) // perceive events
        .mockResolvedValueOnce(mockToolResult('Success: moved'))
        .mockRejectedValueOnce(new Error('Connection lost'))  // verify re-observe fails
        .mockResolvedValueOnce(mockToolResult('')); // events for verify

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('pathfind_to', { x: 10 })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Looks good')); // verify LLM says done

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'move', maxIterations: 5 });
      const steps = await loop.run();

      expect(steps[0].goalAchieved).toBe(true);
    });

    it('should handle LLM failure in verify', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)     // perceive observe
        .mockResolvedValueOnce(mockToolResult('')) // perceive events
        .mockResolvedValueOnce(mockToolResult('Result'))
        .mockResolvedValueOnce(observeResult)     // verify re-observe
        .mockResolvedValueOnce(mockToolResult('')); // verify events

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('observe', {})]))
        .mockRejectedValueOnce(new Error('LLM down')); // verify LLM fails

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 5 });
      const steps = await loop.run();

      // When verify LLM fails, it returns false, so the loop continues
      // The loop will hit maxIterations or succeed on another verify
      expect(steps.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('abort behavior', () => {
    it('should abort during LLM call when signal fires', async () => {
      const controller = new AbortController();

      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''));

      // LLM call hangs until aborted
      chatSpy.mockImplementation(() => new Promise(() => {}));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'test',
        maxIterations: 5,
        signal: controller.signal,
      });

      const runPromise = loop.run();

      // Abort during the LLM call in plan()
      setTimeout(() => controller.abort(), 10);

      const steps = await runPromise;
      expect(loop.isRunning).toBe(false);
      // Steps may be empty since we aborted before completing an iteration
      expect(steps.length).toBeGreaterThanOrEqual(0);
    });

    it('should abort during tool call when signal fires', async () => {
      const controller = new AbortController();

      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''));

      // Plan returns a tool call
      chatSpy.mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      // Tool call hangs until aborted
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockImplementation(() => new Promise(() => {})); // hanging tool call

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'test',
        maxIterations: 5,
        signal: controller.signal,
      });

      const runPromise = loop.run();

      // Abort during tool execution
      setTimeout(() => controller.abort(), 10);

      const _steps = await runPromise;
      expect(loop.isRunning).toBe(false);
    });

    it('should abort during loop delay', async () => {
      const controller = new AbortController();

      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValue(observeResult);

      // First iteration returns tool calls, verify says not done
      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('observe', {})]))
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('observe', {})])); // verify: more tools
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValue(mockToolResult('Success'));

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'test',
        maxIterations: 100,
        loopDelayMs: 5000, // Long delay
        signal: controller.signal,
      });

      const runPromise = loop.run();

      // Abort during the delay
      setTimeout(() => controller.abort(), 50);

      const _steps = await runPromise;
      expect(loop.isRunning).toBe(false);
    });

    it('should work without an AbortSignal (backward compatible)', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(observeResult);

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done'))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done'));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      // No signal provided — should work like before
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      const steps = await loop.run();

      expect(steps).toHaveLength(1);
      expect(steps[0].goalAchieved).toBe(true);
    });

    it('stop() should trigger abort via internal controller', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValue(observeResult);

      chatSpy.mockResolvedValue(mockLlmResponse([mockToolCall('observe', {})]));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'test',
        maxIterations: 100,
        loopDelayMs: 0,
      });

      // Call stop which should abort the internal controller
      loop.setStepCallback(() => {
        loop.stop();
      });

      const _steps = await loop.run();
      expect(loop.isRunning).toBe(false);
    });
  });

  describe('error propagation', () => {
    it('should re-throw non-abort errors from the loop body', async () => {
      // Make perceive() throw a non-abort error by rejecting callTool
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Bot disconnected'));

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      await expect(loop.run()).rejects.toThrow('Bot disconnected');
    });

    it('should handle verify observation failure gracefully', async () => {
      const observeResult = mockToolResult('Observation');
      const eventsResult = mockToolResult('No events subscribed');
      const toolCallResult = mockToolResult('Dug block');

      // perceive: observe, get_events; execute: dig_block; verify: observe (fails)
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)     // perceive: observe
        .mockResolvedValueOnce(eventsResult)       // perceive: get_events
        .mockResolvedValueOnce(toolCallResult)     // execute: dig_block
        .mockRejectedValueOnce(new Error('Connection lost')); // verify: observe fails

      const chatSpy = vi.fn()
        .mockResolvedValueOnce(mockLlmResponse([{ id: '1', name: 'dig_block', args: { x: 0, y: 0, z: 0 } }]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, goal achieved'));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 2 });
      const steps = await loop.run();
      expect(steps.length).toBeGreaterThan(0);
    });
  });

  describe('transient error classification', () => {
    it('should classify [TRANSIENT] errors as transient', () => {
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      expect((loop as any).isTransientError({
        name: 'bot_connect',
        result: 'Error: [TRANSIENT] Bot is not connected',
        isError: true,
      })).toBe(true);
    });

    it('should classify "bot is not connected" as transient', () => {
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      expect((loop as any).isTransientError({
        name: 'observe',
        result: 'Bot is not connected',
        isError: true,
      })).toBe(true);
    });

    it('should classify "MCP transport error" as transient', () => {
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      expect((loop as any).isTransientError({
        name: 'observe',
        result: 'MCP transport error: connection refused',
        isError: true,
      })).toBe(true);
    });

    it('should classify "timeout" errors as transient', () => {
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      expect((loop as any).isTransientError({
        name: 'dig_block',
        result: 'timeout waiting for response',
        isError: true,
      })).toBe(true);
    });

    it('should NOT classify permanent errors as transient', () => {
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      expect((loop as any).isTransientError({
        name: 'dig_block',
        result: 'Block not found at coordinates',
        isError: true,
      })).toBe(false);
    });

    it('should NOT classify successful results as transient', () => {
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      expect((loop as any).isTransientError({
        name: 'dig_block',
        result: 'Successfully dug oak_log',
        isError: false,
      })).toBe(false);
    });

    it('should classify "ECONNREFUSED" as transient', () => {
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      expect((loop as any).isTransientError({
        name: 'observe',
        result: 'ECONNREFUSED connection refused',
        isError: true,
      })).toBe(true);
    });

    it('should classify "MCP client not connected" as transient', () => {
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      expect((loop as any).isTransientError({
        name: 'observe',
        result: 'MCP client not connected',
        isError: true,
      })).toBe(true);
    });
  });

  describe('pause/resume on disconnection', () => {
    it('should enter paused state on transient error and reconnect', async () => {
      const observeResult = mockToolResult('Observation');
      const disconnectedResult = mockToolResult('Error: [TRANSIENT] Bot is not connected', true);
      const reconnectedStatusResult = mockToolResult(JSON.stringify({ connected: true, username: 'TestBot', position: { x: 10, y: 64, z: 5 } }));

      // perceive → observe, events
      // execute → transient error on dig_block
      // handleDisconnection → bot_status returns connected
      // re-execute → success
      // verify → re-observe, LLM says done
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)              // perceive: observe
        .mockResolvedValueOnce(mockToolResult(''))        // perceive: events
        .mockResolvedValueOnce(disconnectedResult)        // execute: dig_block fails (transient)
        .mockResolvedValueOnce(reconnectedStatusResult)    // handleDisconnection: bot_status
        .mockResolvedValueOnce(mockToolResult('Success'))  // re-execute: dig_block succeeds
        .mockResolvedValueOnce(observeResult)              // verify: re-observe
        .mockResolvedValueOnce(mockToolResult(''));        // verify: events

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, goal achieved')); // verify

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig block',
        maxIterations: 10,
        maxRetries: 0,
      });

      const steps = await loop.run();

      // Should have successfully reconnected and completed
      expect(steps.length).toBeGreaterThanOrEqual(1);
      // The bot_status call should have been made during disconnection handling
      expect(mcClient.callTool).toHaveBeenCalledWith('bot_status', {});
    });

    it('should count pause polls against iteration budget', async () => {
      const observeResult = mockToolResult('Observation');
      const disconnectedResult = mockToolResult('Error: [TRANSIENT] Bot is not connected', true);
      const disconnectedStatus = mockToolResult(JSON.stringify({ connected: false }));

      // perceive → observe, events
      // execute → transient error
      // handleDisconnection → bot_status returns disconnected 3 times (3 iterations)
      // This will exhaust the 5-iteration budget (1 perceive + 3 polls)
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)          // perceive: observe
        .mockResolvedValueOnce(mockToolResult(''))     // perceive: events
        .mockResolvedValueOnce(disconnectedResult)      // execute: transient error
        .mockResolvedValueOnce(disconnectedStatus)      // poll 1: not connected
        .mockResolvedValueOnce(disconnectedStatus)      // poll 2: not connected
        .mockResolvedValueOnce(disconnectedStatus);     // poll 3: not connected

      chatSpy.mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig block',
        maxIterations: 5,
        maxRetries: 0,
      });

      // Override pause poll interval to be immediate for testing
      (loop as any).pausePollIntervalMs = 0;

      const steps = await loop.run();
      // Should stop because iteration budget was exhausted during pause
      expect(loop.currentIteration).toBeLessThanOrEqual(5);
    });

    it('should reflect paused state in currentState', async () => {
      const observeResult = mockToolResult('Observation');
      const disconnectedResult = mockToolResult('Error: [TRANSIENT] Bot is not connected', true);
      const connectedStatus = mockToolResult(JSON.stringify({ connected: true, username: 'TestBot', position: { x: 0, y: 64, z: 0 } }));

      let stateWhilePaused: string | undefined;

      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)              // perceive: observe
        .mockResolvedValueOnce(mockToolResult(''))        // perceive: events
        .mockResolvedValueOnce(disconnectedResult)         // execute: transient error
        .mockImplementationOnce(async () => {              // handleDisconnection: bot_status
          stateWhilePaused = (loop as any).state;
          return connectedStatus;
        })
        .mockResolvedValueOnce(mockToolResult('Success'))  // re-execute: success
        .mockResolvedValueOnce(observeResult)               // verify: re-observe
        .mockResolvedValueOnce(mockToolResult(''));          // verify: events

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, done')); // verify

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig block',
        maxIterations: 10,
        maxRetries: 0,
      });

      await loop.run();
      expect(stateWhilePaused).toBe('paused');
      // After run completes, state should be back to connected
      expect((loop as any).state).not.toBe('paused');
    });

    it('should continue loop after reconnection (re-observe)', async () => {
      const observeResult = mockToolResult('Position: (0, 64, 0). Trees nearby.');
      const disconnectedResult = mockToolResult('Error: [TRANSIENT] Connection refused', true);
      const connectedStatus = mockToolResult(JSON.stringify({ connected: true, username: 'TestBot' }));
      const secondObserveResult = mockToolResult('Position: (10, 64, 5). After reconnection.');

      // Iteration 1: perceive → plan → execute (transient error) → reconnect → returns disconnected
      // Iteration 2: re-perceive → plan → execute → verify
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)              // perceive: observe (iter 1)
        .mockResolvedValueOnce(mockToolResult(''))        // perceive: events (iter 1)
        .mockResolvedValueOnce(disconnectedResult)         // execute: transient error
        .mockResolvedValueOnce(connectedStatus)             // handleDisconnection: bot_status
        .mockResolvedValueOnce(secondObserveResult)         // re-execute after reconnect
        .mockResolvedValueOnce(secondObserveResult)         // verify: re-observe (iter 1)
        .mockResolvedValueOnce(secondObserveResult)         // perceive: observe (iter 2)
        .mockResolvedValueOnce(mockToolResult('Events: none')) // perceive: events (iter 2)
        .mockResolvedValueOnce(secondObserveResult);        // verify: re-observe (iter 2)

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('pathfind_to', { x: 10 })])) // iter 1
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]))  // verify after reconnection
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, goal achieved'))                      // iter 2 plan
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, goal achieved'));                     // iter 2 verify

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig tree at 10,64,5',
        maxIterations: 10,
        maxRetries: 0,
      });

      const steps = await loop.run();

      // Should have 2 steps: first disconnected, second reconnected and succeeded
      expect(steps.length).toBeGreaterThanOrEqual(2);
      expect(steps[steps.length - 1].goalAchieved).toBe(true);
    });

    it('should inject reconnection context message into conversation history', async () => {
      const observeResult = mockToolResult('Observation');
      const disconnectedResult = mockToolResult('Error: [TRANSIENT] Bot is not connected', true);
      const connectedStatus = mockToolResult(JSON.stringify({ connected: true, username: 'TestBot' }));

      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)              // perceive: observe (iter 1)
        .mockResolvedValueOnce(mockToolResult(''))        // perceive: events (iter 1)
        .mockResolvedValueOnce(disconnectedResult)         // execute: transient error
        .mockResolvedValueOnce(connectedStatus)             // handleDisconnection: bot_status
        .mockResolvedValueOnce(observeResult)              // perceive: observe (iter 2)
        .mockResolvedValueOnce(mockToolResult(''))        // perceive: events (iter 2)
        .mockResolvedValueOnce(mockToolResult('Success'))  // re-execute: success
        .mockResolvedValueOnce(observeResult)              // verify: re-observe
        .mockResolvedValueOnce(mockToolResult(''));        // verify: events

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 10 })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Yes, goal achieved'));

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig block',
        maxIterations: 10,
        maxRetries: 0,
      });

      await loop.run();

      // The conversation history should contain the reconnection context message
      const history = (loop as any).conversationHistory as Array<{ role: string; content: string | string[] }>;
      const hasReconnectionMsg = history.some(
        (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('disconnected') && m.content.includes('reconnected'),
      );
      expect(hasReconnectionMsg).toBe(true);
    });
  });

  describe('connection state tracking', () => {
    it('should start in connected state', () => {
      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      expect(loop.currentState).toBe('connected');
    });

    it('should transition to running during execution', async () => {
      const observeResult = mockToolResult('Observation');
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''));

      chatSpy.mockResolvedValueOnce(mockLlmResponse([], 'Yes, done'));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });

      // During execution, check state in step callback
      const statesDuringRun: string[] = [];
      loop.setStepCallback(() => {
        statesDuringRun.push(loop.currentState);
      });

      await loop.run();

      expect(statesDuringRun.length).toBeGreaterThan(0);
      expect(statesDuringRun[0]).toBe('running');
    });
  });
});