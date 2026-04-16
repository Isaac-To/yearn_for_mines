// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardServer } from '../server';
import WebSocket from 'ws';
import http from 'node:http';

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

  /**
   * Helper: create a server and start listening, bypassing MCP connection.
   */
  async function startServer(): Promise<{ server: DashboardServer; port: number }> {
    const s = new DashboardServer({
      port: 0,
      mcMcpUrl: 'http://localhost:3001/mcp',
    });

    // Start the HTTP server directly, bypassing MCP connection in start()
    const httpServer = (s as any).server as http.Server;
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const addr = httpServer.address() as { port: number };
    return { server: s, port: addr.port };
  }

  /**
   * Helper: connect a WS client and set up message collection immediately.
   * Returns the ws and a function to drain N messages.
   */
  async function connectAndCollect(port: number): Promise<{
    ws: WebSocket;
    nextMessage: () => Promise<string>;
    nextMessages: (n: number) => Promise<string[]>;
  }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      const queue: string[] = [];
      const waiters: Array<{ count: number; resolve: (msgs: string[]) => void }> = [];

      ws.on('open', () => {
        resolve({
          ws,
          nextMessage: () => new Promise<string>((res) => {
            if (queue.length > 0) {
              res(queue.shift()!);
            } else {
              waiters.push({ count: 1, resolve: (msgs) => res(msgs[0]) });
            }
          }),
          nextMessages: (n: number) => new Promise<string[]>((res) => {
            if (queue.length >= n) {
              res(queue.splice(0, n));
            } else {
              waiters.push({ count: n, resolve: res });
            }
          }),
        });
      });

      ws.on('message', (data) => {
        const msg = data.toString();
        queue.push(msg);

        // Check if any waiter can be fulfilled
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (queue.length >= waiters[i].count) {
            const waiter = waiters.splice(i, 1)[0];
            waiter.resolve(queue.splice(0, waiter.count));
          }
        }
      });

      ws.on('error', reject);
    });
  }

  it('should construct with options', () => {
    server = new DashboardServer({
      port: 0,
      mcMcpUrl: 'http://localhost:3001/mcp',
    });
    expect(server).toBeDefined();
  });

  it('should broadcast messages to connected clients', async () => {
    const { server: s } = await startServer();
    server = s;

    const msg = { type: 'agent_state' as const, data: { state: 'running' }, timestamp: Date.now() };
    expect(() => server.broadcastStep(msg)).not.toThrow();
    expect(() => server.broadcastStatus({ observation: 'test' })).not.toThrow();
  });

  it('should stop cleanly', async () => {
    const { server: s } = await startServer();
    server = s;

    server.startStatusPolling(100);
    server.stopStatusPolling();

    await expect(server.stop()).resolves.toBeUndefined();
  });

  it('should handle startStatusPolling and stopStatusPolling', () => {
    server = new DashboardServer({
      port: 0,
      mcMcpUrl: 'http://localhost:3001/mcp',
    });

    server.startStatusPolling(5000);
    server.stopStatusPolling();
    server.stopStatusPolling();
  });

  // --- WebSocket client message handling ---

  it('should handle start_agent message and broadcast running state', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const { ws, nextMessages } = await connectAndCollect(p);
    // Drain initial agent_state idle
    await nextMessages(1);

    ws.send(JSON.stringify({ type: 'start_agent', data: { goal: 'gather wood' } }));
    const msgs = await nextMessages(1);
    const msg = JSON.parse(msgs[0]);
    expect(msg.type).toBe('agent_state');
    expect(msg.data.state).toBe('running');
    expect(msg.data.goal).toBe('gather wood');
    ws.close();
  });

  it('should handle stop_agent message and broadcast stopped state', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const { ws, nextMessages } = await connectAndCollect(p);
    await nextMessages(1); // Drain initial

    ws.send(JSON.stringify({ type: 'stop_agent' }));
    const msgs = await nextMessages(1);
    const msg = JSON.parse(msgs[0]);
    expect(msg.type).toBe('agent_state');
    expect(msg.data.state).toBe('stopped');
    ws.close();
  });

  it('should handle pause_agent message and broadcast paused state', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const { ws, nextMessages } = await connectAndCollect(p);
    await nextMessages(1);

    ws.send(JSON.stringify({ type: 'pause_agent' }));
    const msgs = await nextMessages(1);
    const msg = JSON.parse(msgs[0]);
    expect(msg.type).toBe('agent_state');
    expect(msg.data.state).toBe('paused');
    ws.close();
  });

  it('should handle resume_agent message and broadcast running state', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const { ws, nextMessages } = await connectAndCollect(p);
    await nextMessages(1);

    ws.send(JSON.stringify({ type: 'resume_agent' }));
    const msgs = await nextMessages(1);
    const msg = JSON.parse(msgs[0]);
    expect(msg.type).toBe('agent_state');
    expect(msg.data.state).toBe('running');
    ws.close();
  });

  it('should handle set_goal message and broadcast idle state with goal', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const { ws, nextMessages } = await connectAndCollect(p);
    await nextMessages(1);

    ws.send(JSON.stringify({ type: 'set_goal', data: { goal: 'build a house' } }));
    const msgs = await nextMessages(1);
    const msg = JSON.parse(msgs[0]);
    expect(msg.type).toBe('agent_state');
    expect(msg.data.state).toBe('idle');
    expect(msg.data.goal).toBe('build a house');
    ws.close();
  });

  it('should ignore malformed WebSocket messages', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const { ws, nextMessage } = await connectAndCollect(p);
    // Drain initial message
    const initial = await nextMessage();
    expect(JSON.parse(initial).type).toBe('agent_state');

    // Send invalid JSON — should not crash the server
    ws.send('not valid json');

    // Server should still be functional — send a valid message after
    ws.send(JSON.stringify({ type: 'stop_agent' }));
    const response = await nextMessage();
    const msg = JSON.parse(response);
    expect(msg.type).toBe('agent_state');
    expect(msg.data.state).toBe('stopped');
    ws.close();
  });

  // --- WebSocket client disconnect cleanup ---

  it('should remove client from set on disconnect', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const { ws } = await connectAndCollect(p);
    expect((server as any).clients.size).toBe(1);

    ws.close();
    await new Promise(resolve => setTimeout(resolve, 100));

    expect((server as any).clients.size).toBe(0);
  });

  it('should clean up all clients on server stop', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const c1 = await connectAndCollect(p);
    const c2 = await connectAndCollect(p);

    expect((server as any).clients.size).toBe(2);

    await server.stop();
    expect((server as any).clients.size).toBe(0);
  });

  it('should not broadcast to disconnected clients', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const { ws } = await connectAndCollect(p);
    ws.close();
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(() => server.broadcastStep({ action: 'test' })).not.toThrow();
  });

  // --- REST API /api/status ---

  it('should return connected: false from /api/status when MCP client not connected', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const response = await fetch(`http://localhost:${p}/api/status`);
    const body = await response.json();
    expect(body.connected).toBe(false);
  });

  it('should serve SPA fallback for non-API routes', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    // The SPA fallback route handler should be exercised.
    // Express 5 returns 200 even when sendFile fails due to missing file
    // (it sends the error page). The key point is the route is hit.
    const response = await fetch(`http://localhost:${p}/some/page`);
    expect(response.status).toBe(200);
  });

  // --- Status polling ---

  it('should start and stop status polling', async () => {
    const { server: s } = await startServer();
    server = s;

    server.startStatusPolling(5000);
    server.stopStatusPolling();
  });

  it('should clear poll interval on stop', async () => {
    const { server: s } = await startServer();
    server = s;

    server.startStatusPolling(1000);
    expect((server as any).pollInterval).not.toBeNull();

    server.stopStatusPolling();
    expect((server as any).pollInterval).toBeNull();
  });

  it('should handle double stop of status polling gracefully', async () => {
    const { server: s } = await startServer();
    server = s;

    server.startStatusPolling(1000);
    server.stopStatusPolling();
    server.stopStatusPolling();
    expect((server as any).pollInterval).toBeNull();
  });

  // --- Initial WebSocket message on connection ---

  it('should send initial agent_state idle on client connection', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const { ws, nextMessage } = await connectAndCollect(p);
    const msg = JSON.parse(await nextMessage());
    expect(msg.type).toBe('agent_state');
    expect(msg.data.state).toBe('idle');
    ws.close();
  });

  // --- broadcast methods ---

  it('should broadcast agent_step via broadcastStep', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const { ws, nextMessages } = await connectAndCollect(p);
    await nextMessages(1); // Drain initial

    const stepData = { toolCalls: [{ name: 'dig' }], toolResults: [] };
    server.broadcastStep(stepData);
    const msgs = await nextMessages(1);
    const msg = JSON.parse(msgs[0]);
    expect(msg.type).toBe('agent_step');
    expect(msg.data).toEqual(stepData);
    ws.close();
  });

  it('should broadcast bot_status via broadcastStatus', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const { ws, nextMessages } = await connectAndCollect(p);
    await nextMessages(1); // Drain initial

    const statusData = { observation: 'Health: 20/20' };
    server.broadcastStatus(statusData);
    const msgs = await nextMessages(1);
    const msg = JSON.parse(msgs[0]);
    expect(msg.type).toBe('bot_status');
    expect(msg.data).toEqual(statusData);
    ws.close();
  });

  it('should broadcast to multiple connected clients', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const c1 = await connectAndCollect(p);
    const c2 = await connectAndCollect(p);

    // Drain initial messages
    await c1.nextMessages(1);
    await c2.nextMessages(1);

    server.broadcastStatus({ observation: 'test' });

    const received1 = await c1.nextMessages(1);
    const received2 = await c2.nextMessages(1);

    expect(JSON.parse(received1[0]).type).toBe('bot_status');
    expect(JSON.parse(received2[0]).type).toBe('bot_status');

    c1.ws.close();
    c2.ws.close();
  });

  // --- REST API /api/status when MCP client is connected ---

  it('should return connected: true with observation from /api/status when MCP client connected', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    // Mock McpClient to simulate connected state
    const mcClient = (server as any).mcClient;
    mcClient._isConnected = true;
    mcClient.callTool = vi.fn().mockResolvedValue({
      content: [
        { type: 'text', text: 'Health: 20/20' },
        { type: 'text', text: 'Food: 18/20' },
      ],
      isError: false,
    });

    const response = await fetch(`http://localhost:${p}/api/status`);
    const body = await response.json();
    expect(body.connected).toBe(true);
    expect(body.observation).toContain('Health: 20/20');
    expect(body.observation).toContain('Food: 18/20');
    expect(mcClient.callTool).toHaveBeenCalledWith('observe', {});
  });

  it('should return error from /api/status when MCP callTool throws', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const mcClient = (server as any).mcClient;
    mcClient._isConnected = true;
    mcClient.callTool = vi.fn().mockRejectedValue(new Error('Connection lost'));

    const response = await fetch(`http://localhost:${p}/api/status`);
    const body = await response.json();
    expect(body.connected).toBe(false);
    expect(body.error).toBe('Failed to fetch status');
  });

  it('should filter non-text content from /api/status response', async () => {
    const { server: s, port: p } = await startServer();
    server = s;

    const mcClient = (server as any).mcClient;
    mcClient._isConnected = true;
    mcClient.callTool = vi.fn().mockResolvedValue({
      content: [
        { type: 'text', text: 'Observation text' },
        { type: 'image', data: 'base64data', mimeType: 'image/png' },
        { type: 'text', text: '' }, // Empty text should be filtered out
      ],
      isError: false,
    });

    const response = await fetch(`http://localhost:${p}/api/status`);
    const body = await response.json();
    expect(body.connected).toBe(true);
    expect(body.observation).toBe('Observation text');
  });

  // --- Status polling with connected MCP client ---

  it('should poll MCP server and broadcast status when connected and clients exist', async () => {
    vi.useFakeTimers();
    const { server: s, port: p } = await startServer();
    server = s;

    // Mock McpClient to simulate connected state
    const mcClient = (server as any).mcClient;
    mcClient._isConnected = true;
    mcClient.callTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Polled observation' }],
      isError: false,
    });

    // Connect a client
    const { ws, nextMessages } = await connectAndCollect(p);
    await nextMessages(1); // Drain initial

    // Start polling with a short interval
    server.startStatusPolling(100);

    // Advance timer to trigger a poll
    await vi.advanceTimersByTimeAsync(150);

    // The client should receive the polled status
    const msgs = await nextMessages(1);
    const msg = JSON.parse(msgs[0]);
    expect(msg.type).toBe('bot_status');
    expect(msg.data.observation).toBe('Polled observation');

    server.stopStatusPolling();
    vi.useRealTimers();
    ws.close();
  });

  it('should skip polling when no clients are connected', async () => {
    vi.useFakeTimers();
    const { server: s } = await startServer();
    server = s;

    const mcClient = (server as any).mcClient;
    mcClient._isConnected = true;
    mcClient.callTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Should not appear' }],
      isError: false,
    });

    // No clients connected, start polling
    server.startStatusPolling(100);

    await vi.advanceTimersByTimeAsync(250);

    // callTool should not have been called (no clients)
    expect(mcClient.callTool).not.toHaveBeenCalled();

    server.stopStatusPolling();
    vi.useRealTimers();
  });

  it('should skip polling when MCP client is not connected', async () => {
    vi.useFakeTimers();
    const { server: s, port: p } = await startServer();
    server = s;

    const mcClient = (server as any).mcClient;
    mcClient._isConnected = false;
    mcClient.callTool = vi.fn();

    // Connect a client but MCP is not connected
    const { ws, nextMessages } = await connectAndCollect(p);
    await nextMessages(1); // Drain initial

    server.startStatusPolling(100);
    await vi.advanceTimersByTimeAsync(250);

    expect(mcClient.callTool).not.toHaveBeenCalled();

    server.stopStatusPolling();
    vi.useRealTimers();
    ws.close();
  });

  it('should handle poll errors gracefully', async () => {
    vi.useFakeTimers();
    const { server: s, port: p } = await startServer();
    server = s;

    const mcClient = (server as any).mcClient;
    mcClient._isConnected = true;
    mcClient.callTool = vi.fn().mockRejectedValue(new Error('Poll failed'));

    const { ws, nextMessages } = await connectAndCollect(p);
    await nextMessages(1); // Drain initial

    server.startStatusPolling(100);
    // Should not throw even though callTool rejects
    await vi.advanceTimersByTimeAsync(150);

    server.stopStatusPolling();
    vi.useRealTimers();
    ws.close();
  });

  // --- start() method ---

  it('should start server and attempt MCP connection', async () => {
    const s = new DashboardServer({
      port: 0,
      mcMcpUrl: 'http://localhost:99999/mcp', // Invalid port to fail fast
    });
    server = s;

    // start() will try to connect to MCP (which fails), then listen
    // Suppress console.warn for expected failure message
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await server.start();
    warnSpy.mockRestore();

    // Server should be listening
    const addr = (server as any).server.address() as { port: number };
    expect(addr.port).toBeGreaterThan(0);

    // Polling should have been started
    expect((server as any).pollInterval).not.toBeNull();
  });

  it('should log warning when MCP connection fails during start', async () => {
    const s = new DashboardServer({
      port: 0,
      mcMcpUrl: 'http://localhost:99999/mcp',
    });
    server = s;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await server.start();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to connect to MC MCP server')
    );
    warnSpy.mockRestore();
  });
});