import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { errorResult } from './types/mcp.js';
import type { McpToolResult } from './types/mcp.js';
import type { ToolDescription } from './llm-client.js';

export interface McpClientOptions {
  name: string;
  version: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class McpClient {
  private client: Client;
  private _isConnected = false;
  private reconnectAttempts = 0;
  public readonly maxRetries: number;
  public readonly retryDelayMs: number;
  public readonly name: string;
  public readonly version: string;

  constructor(private options: McpClientOptions) {
    this.name = options.name;
    this.version = options.version;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.client = new Client({
      name: options.name,
      version: options.version,
    });
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(transport: Transport): Promise<void> {
    try {
      await this.client.connect(transport);
      this._isConnected = true;
      this.reconnectAttempts = 0;
    } catch (error) {
      this._isConnected = false;
      throw new Error(
        `Failed to connect MCP client: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    this._isConnected = false;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    if (!this._isConnected) {
      throw new Error(`MCP client not connected. Cannot call tool: ${name}`);
    }

    try {
      const result = await this.client.callTool({ name, arguments: args });

      const content = (result.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>).map(
        (item) => {
          if (item.type === 'text') {
            return { type: 'text' as const, text: item.text ?? '' };
          }
          if (item.type === 'image') {
            return { type: 'image' as const, data: item.data ?? '', mimeType: item.mimeType ?? 'image/png' };
          }
          return { type: 'text' as const, text: JSON.stringify(item) };
        }
      );

      const isError = (result.isError as boolean | undefined) ?? false;

      return {
        content,
        isError,
      };
    } catch (error) {
      return errorResult(
        `Tool call '${name}' failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async listTools(): Promise<ToolDescription[]> {
    if (!this._isConnected) {
      throw new Error('MCP client not connected. Cannot list tools.');
    }

    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      inputSchema: tool.inputSchema,
    }));
  }

  async readResource(uri: string): Promise<McpToolResult> {
    if (!this._isConnected) {
      throw new Error('MCP client not connected. Cannot read resource.');
    }

    try {
      const result = await this.client.readResource({ uri });

      const content = (result.contents as Array<{ uri: string; text?: string; mimeType?: string }>).map(
        (item) => ({
          type: 'text' as const,
          text: item.text ?? '',
        })
      );

      return { content, isError: false };
    } catch (error) {
      return errorResult(
        `Resource read '${uri}' failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}