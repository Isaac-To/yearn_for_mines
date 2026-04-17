import { z } from 'zod';

// MCP tool result content types
export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const ImageContentSchema = z.object({
  type: z.literal('image'),
  data: z.string(),
  mimeType: z.string(),
});

export const ResourceLinkContentSchema = z.object({
  type: z.literal('resource_link'),
  uri: z.string(),
  name: z.string(),
  mimeType: z.string().optional(),
});

export const McpContentSchema = z.discriminatedUnion('type', [
  TextContentSchema,
  ImageContentSchema,
  ResourceLinkContentSchema,
]);

export type TextContent = z.infer<typeof TextContentSchema>;
export type ImageContent = z.infer<typeof ImageContentSchema>;
export type ResourceLinkContent = z.infer<typeof ResourceLinkContentSchema>;
export type McpContent = z.infer<typeof McpContentSchema>;

// MCP tool result
export const McpToolResultSchema = z.object({
  content: z.array(McpContentSchema),
  isError: z.boolean().default(false),
});

export type McpToolResult = z.infer<typeof McpToolResultSchema>;

// Helper to create a text result
export function textResult(text: string, isError = false): McpToolResult {
  return { content: [{ type: 'text', text }], isError };
}

// Helper to create an error result
export function errorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

// Helper to create a transient error result (connection-related, retriable)
// Transient errors are prefixed with [TRANSIENT] so the agent can distinguish them
export function transientErrorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: `Error: [TRANSIENT] ${message}` }], isError: true };
}

// Helper to create a structured data result
export function dataResult(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: false };
}