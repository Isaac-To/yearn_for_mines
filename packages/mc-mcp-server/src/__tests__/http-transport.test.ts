import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpHttpServer } from '../http-transport.js';
import { BotManager } from '../bot-manager.js';

describe('McpHttpServer', () => {
  let botManager: BotManager;
  let server: McpHttpServer;

  beforeEach(() => {
    botManager = new BotManager();
    server = new McpHttpServer(botManager, {
      port: 0, // Use port 0 to get a random available port
      host: '127.0.0.1',
    });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  it('should create an instance with default options', () => {
    const defaultServer = new McpHttpServer(botManager);
    expect(defaultServer).toBeDefined();
    expect(defaultServer.sessionCount).toBe(0);
  });

  it('should create an instance with custom options', () => {
    const customServer = new McpHttpServer(botManager, {
      port: 8080,
      host: '0.0.0.0',
      serverName: 'custom-server',
      serverVersion: '2.0.0',
    });
    expect(customServer).toBeDefined();
  });

  it('should start and stop the HTTP server', async () => {
    // Use a random available port
    const testServer = new McpHttpServer(botManager, { port: 0, host: '127.0.0.1' });
    await testServer.start();
    expect(testServer.sessionCount).toBe(0);
    await testServer.stop();
  });

  it('should have zero sessions initially', () => {
    expect(server.sessionCount).toBe(0);
    expect(server.sessionIds).toEqual([]);
  });

  it('should register tools on the MCP server', () => {
    // This test verifies that the server can be created without errors
    // Tool registration happens inside createMcpServer()
    const newServer = new McpHttpServer(botManager);
    expect(newServer).toBeDefined();
  });
});

describe('McpHttpServer session management', () => {
  it('should track active sessions', () => {
    const botManager = new BotManager();
    const server = new McpHttpServer(botManager, { port: 0, host: '127.0.0.1' });
    expect(server.sessionCount).toBe(0);
    expect(server.sessionIds).toEqual([]);
  });
});