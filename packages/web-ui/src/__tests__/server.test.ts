import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardServer } from '../server';

describe('DashboardServer', () => {
  let server: DashboardServer;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  it('should construct with options', () => {
    server = new DashboardServer({
      port: 0, // Use port 0 for random available port
      mcMcpUrl: 'http://localhost:3001/mcp',
    });
    expect(server).toBeDefined();
  });

  it('should broadcast messages to connected clients', async () => {
    server = new DashboardServer({
      port: 0,
      mcMcpUrl: 'http://localhost:3001/mcp',
    });

    // Start without MCP connection (will fail silently)
    // We just test the WebSocket server
    const startPromise = server.start();
    // Don't await — MCP connection will fail, but server should still start
    // Give it time to attempt connection
    await new Promise(resolve => setTimeout(resolve, 100));

    // The broadcast method should work
    const msg = { type: 'agent_state' as const, data: { state: 'running' }, timestamp: Date.now() };
    expect(() => server.broadcastStep(msg)).not.toThrow();
    expect(() => server.broadcastStatus({ observation: 'test' })).not.toThrow();
  });

  it('should stop cleanly', async () => {
    server = new DashboardServer({
      port: 0,
      mcMcpUrl: 'http://localhost:3001/mcp',
    });

    // startStatusPolling should work
    server.startStatusPolling(100);
    server.stopStatusPolling();

    // Stop should not throw even without start
    await expect(server.stop()).resolves.toBeUndefined();
  });

  it('should handle startStatusPolling and stopStatusPolling', () => {
    server = new DashboardServer({
      port: 0,
      mcMcpUrl: 'http://localhost:3001/mcp',
    });

    // Should not throw
    server.startStatusPolling(5000);
    server.stopStatusPolling();
    server.stopStatusPolling(); // Double stop should be safe
  });
});