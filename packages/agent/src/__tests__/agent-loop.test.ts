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

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  describe('abort behavior', () => {




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

  

  

  

  describe('stall detection', () => {
    it('injects meta-instruction after 3 identical failing tool calls', async () => {
      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'test stall',
        maxIterations: 5,
        maxRetries: 0
      });

      const toolCall: ToolCall = {
        id: 'call_123',
        name: 'test_action',
        args: { arg: 'val' },
      };

      const observeResult = mockToolResult('Obs');
      const failResult = mockToolResult('Error X', true);

      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValue(failResult); // always fail

      // LLM plans action infinitely
      chatSpy.mockResolvedValue(mockLlmResponse([toolCall]));

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      await loop.run();

      const history = (loop as any).conversationHistory as Array<{ role: string; content: string | string[] }>;
      const hasInjection = history.some(m => 
        m.role === 'user' && 
        typeof m.content === 'string' && 
        m.content.includes('[SYSTEM INJECTION] You have been repetitively failing')
      );
      
      expect(hasInjection).toBe(true);
    });
  });
  
});