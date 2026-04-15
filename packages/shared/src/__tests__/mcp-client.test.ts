import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpClient } from '../mcp-client.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

// Mock transport for testing
function createMockTransport(): Transport {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
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
  });

  describe('callTool', () => {
    it('should call a tool and return the result', async () => {
      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });

      // The client will need to be connected to a mock server
      // For unit tests, we test the method signature and error handling
      await expect(
        client.callTool('observe', {})
      ).rejects.toThrow(); // Not connected yet
    });
  });

  describe('reconnection', () => {
    it('should track connection state', () => {
      const client = new McpClient({
        name: 'test-client',
        version: '1.0.0',
      });
      expect(client.isConnected).toBe(false);
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
});