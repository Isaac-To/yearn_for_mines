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