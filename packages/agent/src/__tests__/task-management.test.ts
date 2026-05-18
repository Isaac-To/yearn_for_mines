import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../agent-loop.js';
import { McpClient, LlmClient, type Task } from '@yearn-for-mines/shared';

describe('AgentLoop Task Management', () => {
  it('should add tasks and subtasks', async () => {
    // Mock clients
    const mcClient = {
      isConnected: true,
      callTool: async () => ({ content: [], isError: false }),
      listTools: async () => [],
    } as unknown as McpClient;

    const llmClient = {} as LlmClient;

    const loop = new AgentLoop(mcClient, llmClient, { goal: 'test' });

    // Test add_task
    const result1 = (loop as any).handleAddTask({ description: 'Task 1' });
    expect(result1.isError).toBe(false);
    expect(result1.result).toContain('Task added with ID: 1');
    expect((loop as any).taskList).toHaveLength(1);
    expect((loop as any).taskList[0].description).toBe('Task 1');

    // Test add_task with parent
    const result2 = (loop as any).handleAddTask({ description: 'Task 1.1', parentId: '1' });
    expect(result2.isError).toBe(false);
    expect(result2.result).toContain('Task added with ID: 1.1');
    expect((loop as any).taskList[0].subtasks).toHaveLength(1);
    expect((loop as any).taskList[0].subtasks[0].description).toBe('Task 1.1');
  });

  it('should update task status', async () => {
    const mcClient = { isConnected: true } as unknown as McpClient;
    const llmClient = {} as LlmClient;
    const loop = new AgentLoop(mcClient, llmClient, { goal: 'test' });

    (loop as any).handleAddTask({ description: 'Task 1' });
    
    const result = (loop as any).handleUpdateTaskStatus({ id: '1', status: 'completed' });
    expect(result.isError).toBe(false);
    expect((loop as any).taskList[0].status).toBe('completed');
  });

  it('should format task list for prompt', async () => {
    const mcClient = { isConnected: true } as unknown as McpClient;
    const llmClient = {} as LlmClient;
    const loop = new AgentLoop(mcClient, llmClient, { goal: 'test' });

    (loop as any).handleAddTask({ description: 'Task 1' });
    (loop as any).handleAddTask({ description: 'Task 1.1', parentId: '1' });
    
    const formatted = (loop as any).formatTaskList((loop as any).taskList);
    expect(formatted).toContain('[#1] Task 1');
    expect(formatted).toContain('  ⚪ [#1.1] Task 1.1');
  });
});
