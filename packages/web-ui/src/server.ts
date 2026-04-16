import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpClient } from '@yearn-for-mines/shared';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Message types sent from server to client over WebSocket.
 */
export interface WsMessage {
  type: 'bot_status' | 'agent_step' | 'event' | 'agent_state' | 'error';
  data: unknown;
  timestamp: number;
}

/**
 * Message types received from client over WebSocket.
 */
export interface WsClientMessage {
  type: 'start_agent' | 'stop_agent' | 'pause_agent' | 'resume_agent' | 'set_goal';
  data?: Record<string, unknown>;
}

export interface DashboardServerOptions {
  port: number;
  mcMcpUrl: string;
  agentMcpUrl?: string;
  mempalaceMcpUrl?: string;
}

/**
 * Dashboard server that bridges the debug UI to the MCP servers and agent.
 * Serves the Vite-built frontend and provides a WebSocket for real-time updates.
 */
export class DashboardServer {
  private app: express.Express;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private mcClient: McpClient;
  private options: DashboardServerOptions;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: DashboardServerOptions) {
    this.options = options;
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.mcClient = new McpClient({ name: 'web-dashboard', version: '0.1.0' });

    this.setupMiddleware();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    const distDir = join(__dirname, '..', 'dist');

    this.app.use(express.json());
    this.app.use(express.static(distDir));

    // REST API for initial data fetches
    this.app.get('/api/status', async (_req, res) => {
      try {
        if (!this.mcClient.isConnected) {
          res.json({ connected: false });
          return;
        }
        const result = await this.mcClient.callTool('observe', {});
        const text = result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && 'text' in c && c.text !== undefined && c.text !== '')
          .map(c => c.text)
          .join('\n');
        res.json({ connected: true, observation: text });
      } catch {
        res.json({ connected: false, error: 'Failed to fetch status' });
      }
    });

    // SPA fallback
    this.app.get('/{*path}', (_req, res) => {
      res.sendFile(join(distDir, 'index.html'));
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as WsClientMessage;
          this.handleClientMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      // Send initial connection confirmation
      this.sendToClient(ws, { type: 'agent_state', data: { state: 'idle' }, timestamp: Date.now() });
    });
  }

  private handleClientMessage(msg: WsClientMessage): void {
    switch (msg.type) {
      case 'start_agent':
        this.broadcast({ type: 'agent_state', data: { state: 'running', goal: msg.data?.goal }, timestamp: Date.now() });
        break;
      case 'stop_agent':
        this.broadcast({ type: 'agent_state', data: { state: 'stopped' }, timestamp: Date.now() });
        break;
      case 'pause_agent':
        this.broadcast({ type: 'agent_state', data: { state: 'paused' }, timestamp: Date.now() });
        break;
      case 'resume_agent':
        this.broadcast({ type: 'agent_state', data: { state: 'running' }, timestamp: Date.now() });
        break;
      case 'set_goal':
        this.broadcast({ type: 'agent_state', data: { state: 'idle', goal: msg.data?.goal }, timestamp: Date.now() });
        break;
    }
  }

  private sendToClient(ws: WebSocket, msg: WsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private broadcast(msg: WsMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  /**
   * Broadcast an agent step to all connected clients.
   */
  broadcastStep(step: unknown): void {
    this.broadcast({ type: 'agent_step', data: step, timestamp: Date.now() });
  }

  /**
   * Broadcast a bot status update to all connected clients.
   */
  broadcastStatus(status: unknown): void {
    this.broadcast({ type: 'bot_status', data: status, timestamp: Date.now() });
  }

  /**
   * Start polling the MC MCP server for bot status updates.
   */
  startStatusPolling(intervalMs: number = 2000): void {
    this.pollInterval = setInterval(async () => {
      if (!this.mcClient.isConnected || this.clients.size === 0) return;

      try {
        const result = await this.mcClient.callTool('observe', {});
        const text = result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && 'text' in c && c.text !== undefined && c.text !== '')
          .map(c => c.text)
          .join('\n');
        this.broadcastStatus({ observation: text });
      } catch {
        // Polling failure is not critical
      }
    }, intervalMs);
  }

  /**
   * Stop polling for status updates.
   */
  stopStatusPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Start the dashboard server.
   */
  async start(): Promise<void> {
    // Connect to MC MCP server
    try {
      const transport = new StreamableHTTPClientTransport(new URL(this.options.mcMcpUrl));
      await this.mcClient.connect(transport);
    } catch (error) {
      console.warn(`[Dashboard] Failed to connect to MC MCP server: ${error instanceof Error ? error.message : String(error)}`);
    }

    return new Promise((resolve) => {
      this.server.listen(this.options.port, () => {
        console.log(`[Dashboard] Server listening on port ${this.options.port}`);
        this.startStatusPolling();
        resolve();
      });
    });
  }

  /**
   * Stop the dashboard server.
   */
  async stop(): Promise<void> {
    this.stopStatusPolling();

    for (const ws of this.clients) {
      ws.close();
    }
    this.clients.clear();

    await this.mcClient.disconnect();

    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}