import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpClient } from '../mcp-client.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

// Mock the MCP SDK Client
const mockConnect = vi.fn();
const mockClose = vi.fn();
const mockCallTool = vi.fn();
const mockListTools = vi.fn();
const mockReadResource = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    callTool: mockCallTool,
    listTools: mockListTools,
    readResource: mockReadResource,
  })),
}));

function createMockTransport(): Transport {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onmessage: vi.fn(),
    onclose: vi.fn(),
    onerror: vi.fn(),
  } as unknown as Transport;
}

describe('McpClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
  });

  describe('constructor', () => {
    it('should create a client with default options', () => {
      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });
      expect(client).toBeDefined();
      expect(client.name).toBe('test-client');
      expect(client.version).toBe('1.0.0');
    });

    it('should accept custom reconnect options', () => {
      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
        maxRetries: 5,
        retryDelayMs: 2000,
      });
      expect(client.maxRetries).toBe(5);
      expect(client.retryDelayMs).toBe(2000);
    });

    it('should use default reconnect options', () => {
      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });
      expect(client.maxRetries).toBe(3);
      expect(client.retryDelayMs).toBe(1000);
    });
  });

  describe('connect', () => {
    it('should connect successfully and set isConnected to true', async () => {
      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      expect(client.isConnected).toBe(true);
      expect(mockConnect).toHaveBeenCalledWith(transport);
    });

    it('should set isConnected to false on connection failure', async () => {
      mockConnect.mockRejectedValue(new Error('Connection refused'));

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await expect(client.connect(transport)).rejects.toThrow('Failed to connect MCP client: Connection refused');
      expect(client.isConnected).toBe(false);
    });

    it('should handle non-Error connection failure', async () => {
      mockConnect.mockRejectedValue('string error');

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await expect(client.connect(transport)).rejects.toThrow('Failed to connect MCP client: string error');
      expect(client.isConnected).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect and set isConnected to false', async () => {
      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);
      expect(client.isConnected).toBe(true);

      await client.disconnect();
      expect(client.isConnected).toBe(false);
      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('callTool', () => {
    it('should throw when not connected', async () => {
      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      await expect(client.callTool('observe', {})).rejects.toThrow('MCP client not connected');
    });

    it('should call a tool and return text content', async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Health: 20/20' }],
        isError: false,
      });

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      const result = await client.callTool('observe', {});
      expect(result.content).toEqual([{ type: 'text', text: 'Health: 20/20' }]);
      expect(result.isError).toBe(false);
    });

    it('should handle image content from tool result', async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
        isError: false,
      });

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      const result = await client.callTool('screenshot', {});
      expect(result.content).toEqual([{ type: 'image', data: 'base64data', mimeType: 'image/png' }]);
    });

    it('should handle unknown content types by stringifying', async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: 'resource', uri: 'test://resource' }],
        isError: false,
      });

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      const result = await client.callTool('read_resource', {});
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('resource');
    });

    it('should return isError true when tool reports error', async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Failed to dig' }],
        isError: true,
      });

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      const result = await client.callTool('dig_block', {});
      expect(result.isError).toBe(true);
    });

    it('should default isError to false when not specified', async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
      });

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      const result = await client.callTool('observe', {});
      expect(result.isError).toBe(false);
    });

    it('should handle tool call exceptions gracefully', async () => {
      mockCallTool.mockRejectedValue(new Error('Network error'));

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      const result = await client.callTool('observe', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Network error');
    });

    it('should handle non-Error tool call exceptions', async () => {
      mockCallTool.mockRejectedValue('some string error');

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      const result = await client.callTool('observe', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('some string error');
    });
  });

  describe('listTools', () => {
    it('should throw when not connected', async () => {
      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      await expect(client.listTools()).rejects.toThrow('MCP client not connected');
    });

    it('should list available tools from the server', async () => {
      mockListTools.mockResolvedValue({
        tools: [
          { name: 'observe', description: 'Get world state' },
          { name: 'dig_block', description: 'Dig a block' },
        ],
      });

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      const tools = await client.listTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('observe');
      expect(tools[1].description).toBe('Dig a block');
    });
  });

  describe('readResource', () => {
    it('should throw when not connected', async () => {
      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      await expect(client.readResource('bot://status')).rejects.toThrow('MCP client not connected');
    });

    it('should read a resource and return text content', async () => {
      mockReadResource.mockResolvedValue({
        contents: [{ uri: 'bot://status', text: '{"connected":true}', mimeType: 'application/json' }],
      });

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      const result = await client.readResource('bot://status');
      expect(result.content).toEqual([{ type: 'text', text: '{"connected":true}' }]);
      expect(result.isError).toBe(false);
    });

    it('should handle missing text in resource content', async () => {
      mockReadResource.mockResolvedValue({
        contents: [{ uri: 'bot://status', mimeType: 'application/json' }],
      });

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      const result = await client.readResource('bot://status');
      expect(result.content[0].text).toBe('');
    });

    it('should handle read errors gracefully', async () => {
      mockReadResource.mockRejectedValue(new Error('Resource not found'));

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      const result = await client.readResource('invalid://uri');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Resource not found');
    });

    it('should handle non-Error read exceptions', async () => {
      mockReadResource.mockRejectedValue('connection lost');

      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      const transport = createMockTransport();
      await client.connect(transport);

      const result = await client.readResource('bot://status');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('connection lost');
    });
  });
});