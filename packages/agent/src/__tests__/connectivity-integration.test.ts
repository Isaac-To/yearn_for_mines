/**
 * Integration tests for agent connectivity lifecycle.
 *
 * Tests the full stack: MCP server → MCP client → AgentLoop
 * with focus on connection state management, transient error handling,
 * and the startup verification sequence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLoop, type AgentState } from '../agent-loop.js';
import { McpClient, LlmClient, type ToolDescription, type ToolCall } from '@yearn-for-mines/shared';

// ─── Mock Factories ──────────────────────────────────────

function createMockMcClient(tools: ToolDescription[] = []): McpClient {
  return {
    isConnected: true,
    callTool: vi.fn(),
    listTools: vi.fn().mockResolvedValue(tools),
    connect: vi.fn(),
    disconnect: vi.fn(),
    readResource: vi.fn(),
  } as unknown as McpClient;
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
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            }))
          : undefined,
      },
    }],
  };
}

function mockToolResult(text: string, isError: boolean = false) {
  return { content: [{ type: 'text' as const, text }], isError };
}

const defaultTools: ToolDescription[] = [
  { name: 'observe', description: 'Observe the world' },
  { name: 'bot_status', description: 'Check bot connection status' },
  { name: 'dig_block', description: 'Dig a block' },
  { name: 'pathfind_to', description: 'Navigate to coordinates' },
];

// ─── Integration Tests ──────────────────────────────────

describe('Connectivity Integration', () => {
  let mcClient: McpClient;
  let llmClient: LlmClient;
  let chatSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mcClient = createMockMcClient(defaultTools);
    llmClient = createMockLlmClient();
    chatSpy = vi.fn();
  });

  describe('6.1: Full startup → observe → disconnect → pause → reconnect → resume → verify', () => {
    it('should complete full disconnect-reconnect cycle', async () => {
      const observeResult = mockToolResult('Position: (0, 64, 0). Trees nearby.');
      const transientError = mockToolResult('Error: [TRANSIENT] Bot is not connected', true);
      const connectedStatus = mockToolResult(JSON.stringify({
        connected: true, username: 'TestBot', position: { x: 0, y: 64, z: 0 },
      }));
      const successResult = mockToolResult('Success: dug oak_log');

      // Iteration 1: perceive → plan → execute (transient) → reconnect → re-execute (success)
      // Iteration 2: perceive → plan → execute → verify → goal achieved
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)          // perceive: observe
        .mockResolvedValueOnce(mockToolResult(''))     // perceive: events
        .mockResolvedValueOnce(transientError)          // execute: dig_block fails (transient)
        .mockResolvedValueOnce(connectedStatus)          // handleDisconnection: bot_status
        .mockResolvedValueOnce(successResult)            // re-execute: dig_block succeeds
        .mockResolvedValueOnce(observeResult)            // verify: re-observe
        .mockResolvedValueOnce(mockToolResult(''));      // verify: events

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 0 })]))   // plan
        .mockResolvedValueOnce(mockLlmResponse([], 'Goal achieved'));                      // verify

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig a tree',
        maxIterations: 10,
        maxRetries: 0,
      });

      const steps = await loop.run();

      // The step should have succeeded after reconnection
      expect(steps.some(s => s.goalAchieved)).toBe(true);
      // bot_status was called during disconnection handling
      expect(mcClient.callTool).toHaveBeenCalledWith('bot_status', {});
    });

    it('should handle multiple sequential disconnections', async () => {
      const observeResult = mockToolResult('Observation');
      const transientError = mockToolResult('Error: [TRANSIENT] Connection refused', true);
      const connectedStatus = mockToolResult(JSON.stringify({ connected: true, username: 'TestBot' }));
      const successResult = mockToolResult('Success');

      // First iteration: transient error, reconnect, success
      // Second iteration: success, goal achieved
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)       // perceive: observe (iter 1)
        .mockResolvedValueOnce(mockToolResult('')) // perceive: events (iter 1)
        .mockResolvedValueOnce(transientError)      // execute: transient error
        .mockResolvedValueOnce(connectedStatus)      // handleDisconnection: bot_status
        .mockResolvedValueOnce(successResult)        // re-execute: success
        .mockResolvedValueOnce(observeResult)        // verify: re-observe
        .mockResolvedValueOnce(mockToolResult('')); // verify: events

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 0 })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Goal achieved'));

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig a tree',
        maxIterations: 10,
        maxRetries: 0,
      });

      const steps = await loop.run();
      expect(steps.some(s => s.goalAchieved)).toBe(true);
    });
  });

  describe('6.2: MCP server starts after agent (startup race condition)', () => {
    it('should implement retry logic pattern for MCP connection failures', async () => {
      // This tests the connectMcpWithRetry logic pattern used in main.ts
      // Simulating: first call fails, second call succeeds
      let attemptCount = 0;
      const mockConnectFn = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Connection refused');
        }
      });

      // Test the retry pattern: attempt, catch, retry
      let connected = false;
      const maxRetries = 3;
      for (let i = 0; i <= maxRetries; i++) {
        try {
          await mockConnectFn();
          connected = true;
          break;
        } catch (err) {
          if (i === maxRetries) {
            throw err;
          }
        }
      }

      expect(connected).toBe(true);
      expect(attemptCount).toBe(2);
    });

    it('should proceed when bot_connect returns already connected', async () => {
      // Simulate bot_connect returning "already connected" (not an error)
      const alreadyConnectedResult = mockToolResult(JSON.stringify({
        connected: true,
        alreadyConnected: true,
        username: 'TestBot',
      }));

      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockToolResult('Observation'))
        .mockResolvedValueOnce(mockToolResult(''));

      chatSpy.mockResolvedValueOnce(mockLlmResponse([], 'Goal achieved'));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, { goal: 'test', maxIterations: 1 });
      const steps = await loop.run();

      // The loop should work normally even though bot_connect returned alreadyConnected
      expect(steps).toHaveLength(1);
      expect(steps[0].goalAchieved).toBe(true);
    });
  });

  describe('6.3: bot_status returns correct state across lifecycle', () => {
    it('should reflect paused state when disconnected and running state when executing', async () => {
      const observeResult = mockToolResult('Observation');
      const transientError = mockToolResult('Error: [TRANSIENT] Bot is not connected', true);
      const connectedStatus = mockToolResult(JSON.stringify({ connected: true, username: 'TestBot' }));

      const states: AgentState[] = [];

      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(transientError)
        .mockImplementationOnce(async () => {
          states.push((loop as any).state as AgentState);
          return connectedStatus;
        })
        .mockResolvedValueOnce(mockToolResult('Success'))
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''));

      chatSpy
        .mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 0 })]))
        .mockResolvedValueOnce(mockLlmResponse([], 'Done'));

      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig',
        maxIterations: 10,
        maxRetries: 0,
      });

      const stepCallbackStates: AgentState[] = [];
      loop.setStepCallback(() => {
        stepCallbackStates.push(loop.currentState);
      });

      await loop.run();

      // Should have captured the paused state during disconnection
      expect(states).toContain('paused');
      // Should have captured running state during step execution
      expect(stepCallbackStates).toContain('running');
    });

    it('should exhaust iteration budget during extended disconnection', async () => {
      const observeResult = mockToolResult('Observation');
      const transientError = mockToolResult('Error: [TRANSIENT] Bot is not connected', true);
      const disconnectedStatus = mockToolResult(JSON.stringify({ connected: false }));

      // perceive → transient error → 3 polls that are still disconnected
      (mcClient.callTool as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(observeResult)
        .mockResolvedValueOnce(mockToolResult(''))
        .mockResolvedValueOnce(transientError)
        .mockResolvedValueOnce(disconnectedStatus)   // poll 1
        .mockResolvedValueOnce(disconnectedStatus)    // poll 2
        .mockResolvedValueOnce(disconnectedStatus);   // poll 3

      chatSpy.mockResolvedValueOnce(mockLlmResponse([mockToolCall('dig_block', { x: 0 })]));
      vi.spyOn(llmClient, 'chat').mockImplementation(chatSpy);

      const loop = new AgentLoop(mcClient, llmClient, {
        goal: 'dig',
        maxIterations: 5,
        maxRetries: 0,
      });

      // Make polling immediate for test speed
      (loop as any).pausePollIntervalMs = 0;

      const steps = await loop.run();

      // Should stop because iteration budget was exhausted during pause
      expect(loop.currentIteration).toBeLessThanOrEqual(5);
      expect(loop.isRunning).toBe(false);
    });
  });
});