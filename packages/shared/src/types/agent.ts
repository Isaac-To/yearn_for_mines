import { z } from 'zod';

// Agent connection state machine
export const AgentStateSchema = z.enum(['connecting', 'connected', 'running', 'paused']);
export type AgentState = z.infer<typeof AgentStateSchema>;

// Transient error classification for tool results
export const ToolErrorSchema = z.object({
  message: z.string(),
  transient: z.boolean().default(false),
});
export type ToolError = z.infer<typeof ToolErrorSchema>;

// Task management schemas
export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    description: z.string(),
    status: TaskStatusSchema,
    subtasks: z.array(TaskSchema),
  })
);

export type Task = {
  id: string;
  description: string;
  status: TaskStatus;
  subtasks: Task[];
};
