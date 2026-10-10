import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpClient } from '@yearn-for-mines/shared';
import type { AgentLoop } from '@yearn-for-mines/agent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Message types sent from server to client over WebSocket.
 */
export interface WsMessage {
  type: 'bot_status' | 'agent_step' | 'event' | 'agent_state' | 'memory' | 'error';
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
  createAgent?: (goal: string, client: McpClient) => Promise<AgentLoop>;
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
  private agent?: AgentLoop;
  private starting = false;
  private polling = false;
  private goal = '';

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
        const result = await this.mcClient.callTool('bot_status', {}, { timeoutMs: 5000 });
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
          void this.handleClientMessage(msg).catch(error => this.broadcast({ type: 'error', data: { message: String(error) }, timestamp: Date.now() }));
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      // Send initial connection confirmation
        this.sendToClient(ws, { type: 'agent_state', data: { state: this.agent?.isRunning ? this.agent.currentState : 'idle', goal: this.goal }, timestamp: Date.now() });
        if (this.agent) this.sendToClient(ws, { type: 'memory', data: { operation: 'status', status: this.agent.memoryStatus }, timestamp: Date.now() });
    });
  }

  private async handleClientMessage(msg: WsClientMessage): Promise<void> {
    switch (msg.type) {
      case 'start_agent':
        if (!this.options.createAgent) throw new Error('Agent control is not configured on this dashboard.');
        if (this.starting || this.agent?.isRunning) throw new Error('An agent is already running.');
        this.goal = typeof msg.data?.goal === 'string' ? msg.data.goal.trim() : this.goal;
        if (!this.goal) throw new Error('Enter a goal before starting.');
        this.starting = true;
        try { this.agent = await this.options.createAgent(this.goal, this.mcClient); }
        finally { this.starting = false; }
        this.agent.setStepCallback(step => this.broadcastStep(step));
          this.agent.setMemoryCallback(event => this.broadcast({ type: 'memory', data: event, timestamp: Date.now() }));
        void this.agent.run().catch(error => this.broadcast({ type: 'error', data: { message: String(error) }, timestamp: Date.now() }))
          .finally(() => this.broadcast({ type: 'agent_state', data: { state: 'stopped', metrics: this.agent?.metrics }, timestamp: Date.now() }));
        this.broadcast({ type: 'agent_state', data: { state: 'running', goal: msg.data?.goal }, timestamp: Date.now() });
        break;
      case 'stop_agent':
        this.agent?.stop();
        this.broadcast({ type: 'agent_state', data: { state: 'stopped' }, timestamp: Date.now() });
        break;
      case 'pause_agent':
        if (!this.agent?.isRunning) throw new Error('No agent is running.');
        this.agent.pause();
        this.broadcast({ type: 'agent_state', data: { state: 'paused' }, timestamp: Date.now() });
        break;
      case 'resume_agent':
        if (!this.agent?.isRunning) throw new Error('No agent is running.');
        this.agent.resume();
        this.broadcast({ type: 'agent_state', data: { state: 'running' }, timestamp: Date.now() });
        break;
      case 'set_goal':
        if (this.agent?.isRunning || this.starting) throw new Error('Stop the agent before changing its goal.');
        this.goal = typeof msg.data?.goal === 'string' ? msg.data.goal : '';
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
    this.stopStatusPolling();
    this.pollInterval = setInterval(async () => {
      if (this.polling || this.clients.size === 0) return;
      this.polling = true;

      try {
        if (!this.mcClient.isConnected) await this.mcClient.connectToUrl(this.options.mcMcpUrl);
        const result = await this.mcClient.callTool('bot_status', {}, { timeoutMs: 5000 });
        const text = result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && 'text' in c && c.text !== undefined && c.text !== '')
          .map(c => c.text)
          .join('\n');
        if (result.isError && /\[TRANSPORT\]/.test(text)) {
          await this.mcClient.reconnect();
          return;
        }
        this.broadcastStatus({ observation: text, connected: !result.isError });
      } catch {
        // Polling failure is not critical
      } finally { this.polling = false; }
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
      await this.mcClient.connectToUrl(this.options.mcMcpUrl);
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
    this.agent?.stop();
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
