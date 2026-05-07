import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpClient, LlmClient } from '@yearn-for-mines/shared';
import type { LlmClientOptions, McpToolResult } from '@yearn-for-mines/shared';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AgentLoop } from '@yearn-for-mines/agent';
import type { AgentStep, AgentLoopConfig } from '@yearn-for-mines/agent';

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
  mempalaceMcpUrl?: string;
  llmConfig: LlmClientOptions;
  agentDefaults: {
    goal: string;
    maxIterations: number;
    maxRetries: number;
    maxObservationTokens: number;
    enableVlm: boolean;
    loopDelayMs: number;
  };
}

/** Extract text from an MCP tool result. */
function resultText(result: McpToolResult): string {
  return result.content.filter(c => c.type === 'text').map(c => c.text).join('');
}

/**
 * Dashboard server that bridges the debug UI to the MCP servers and agent.
 * Serves the Vite-built frontend, provides a WebSocket for real-time updates,
 * and embeds the AgentLoop for browser-driven goal control.
 */
export class DashboardServer {
  private app: express.Express;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private mcClient: McpClient;
  private options: DashboardServerOptions;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  // ─── Agent state ────────────────────────────────────────
  private agentLoop: AgentLoop | null = null;
  private abortController: AbortController | null = null;
  private llmClient: LlmClient;
  private mempalaceClient: McpClient | undefined;
  private mcAgentClient: McpClient | null = null;
  private botConnected = false;
  private currentGoal: string | null = null;
  private agentRunning = false;

  constructor(options: DashboardServerOptions) {
    this.options = options;
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.mcClient = new McpClient({ name: 'web-dashboard', version: '0.1.0' });
    this.llmClient = new LlmClient(options.llmConfig);

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
        const result = await this.mcClient.callTool('bot_status', {});
        const text = result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && 'text' in c && c.text !== undefined && c.text !== '')
          .map(c => c.text)
          .join('\n');
        res.json({ connected: true, observation: text });
      } catch {
        res.json({ connected: false, error: 'Failed to fetch status' });
      }
    });

    // REST API: get agent config defaults (so the frontend can pre-fill the goal)
    this.app.get('/api/agent-config', (_req, res) => {
      res.json({
        defaultGoal: this.options.agentDefaults.goal,
        currentGoal: this.currentGoal,
        agentState: this.agentRunning ? 'running' : 'idle',
      });
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

      // Send initial state to newly connected client
      this.sendToClient(ws, {
        type: 'agent_state',
        data: {
          state: this.agentRunning ? 'running' : 'idle',
          goal: this.currentGoal,
        },
        timestamp: Date.now(),
      });
    });
  }

  private handleClientMessage(msg: WsClientMessage): void {
    switch (msg.type) {
      case 'start_agent': {
        const goal = (msg.data?.goal as string) || this.options.agentDefaults.goal;
        void this.startAgent(goal);
        break;
      }
      case 'stop_agent':
        this.stopAgent();
        break;
      case 'set_goal': {
        const newGoal = msg.data?.goal as string;
        if (newGoal) {
          // Stop current loop and start a new one with the new goal
          this.stopAgent();
          void this.startAgent(newGoal);
        }
        break;
      }
      case 'pause_agent':
        // AgentLoop doesn't support pause directly, treat as stop for now
        this.broadcast({ type: 'agent_state', data: { state: 'paused', goal: this.currentGoal }, timestamp: Date.now() });
        break;
      case 'resume_agent':
        if (this.currentGoal && !this.agentRunning) {
          void this.startAgent(this.currentGoal);
        }
        break;
    }
  }

  // ─── Agent Lifecycle ─────────────────────────────────────

  /**
   * Ensure the agent has its own MCP client connected to the MC server.
   * This is separate from the polling mcClient so they don't interfere.
   */
  private async ensureAgentMcpClient(): Promise<McpClient> {
    if (this.mcAgentClient?.isConnected) {
      return this.mcAgentClient;
    }
    const client = new McpClient({ name: 'web-dashboard-agent', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(this.options.mcMcpUrl));
    await client.connect(transport);
    this.mcAgentClient = client;
    return client;
  }

  /**
   * Ensure the bot is connected to the Minecraft server.
   * Retries on transient errors (connection throttle).
   */
  private async ensureBotConnected(mcClient: McpClient): Promise<void> {
    if (this.botConnected) {
      // Verify it's still alive
      try {
        const statusResult = await mcClient.callTool('bot_status', {});
        const statusText = resultText(statusResult);
        const status = JSON.parse(statusText);
        if (status.connected) return;
      } catch {
        // Fall through to reconnect
      }
      this.botConnected = false;
    }

    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await mcClient.callTool('bot_connect', {});
      const text = resultText(result);
      if (!result.isError) {
        this.botConnected = true;
        console.log(`[Dashboard] Bot connected: ${text.substring(0, 200)}`);
        return;
      }
      if (text.includes('[TRANSIENT]') && attempt < maxRetries) {
        const delayMs = Math.min(attempt * 3000, 15000);
        console.warn(`[Dashboard] Bot connection throttled (attempt ${attempt}/${maxRetries}), retrying in ${delayMs / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw new Error(`Bot connection failed: ${text}`);
    }
  }

  /**
   * Optionally connect to MemPalace if configured.
   */
  private async ensureMempalaceClient(): Promise<McpClient | undefined> {
    if (!this.options.mempalaceMcpUrl) return undefined;
    if (this.mempalaceClient?.isConnected) return this.mempalaceClient;

    try {
      const client = new McpClient({ name: 'web-dashboard-mempalace', version: '0.1.0' });
      const transport = new StreamableHTTPClientTransport(new URL(this.options.mempalaceMcpUrl));
      await client.connect(transport);
      this.mempalaceClient = client;
      console.log('[Dashboard] Connected to MemPalace');
      return client;
    } catch (err) {
      console.warn(`[Dashboard] MemPalace connection failed: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  /**
   * Start the agent loop with the given goal.
   */
  private async startAgent(goal: string): Promise<void> {
    if (this.agentRunning) {
      this.stopAgent();
      // Small delay so the previous loop can clean up
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    this.currentGoal = goal;
    this.agentRunning = true;
    this.broadcast({
      type: 'agent_state',
      data: { state: 'running', goal },
      timestamp: Date.now(),
    });

    try {
      // Ensure connections
      const mcClient = await this.ensureAgentMcpClient();
      await this.ensureBotConnected(mcClient);
      const mempalaceClient = await this.ensureMempalaceClient();

      // Create abort controller
      this.abortController = new AbortController();

      // Create agent loop
      const loopConfig: Partial<AgentLoopConfig> & { goal: string } = {
        goal,
        maxIterations: this.options.agentDefaults.maxIterations,
        maxRetries: this.options.agentDefaults.maxRetries,
        maxObservationTokens: this.options.agentDefaults.maxObservationTokens,
        enableVlm: this.options.agentDefaults.enableVlm,
        loopDelayMs: this.options.agentDefaults.loopDelayMs,
        signal: this.abortController.signal,
      };

      this.agentLoop = new AgentLoop(mcClient, this.llmClient, loopConfig, mempalaceClient);

      // Broadcast steps to all connected WebSocket clients
      this.agentLoop.setStepCallback((step: AgentStep) => {
        this.broadcastStep(step);
        console.log(`[Dashboard Agent] Step ${step.goalAchieved ? '✓' : '…'}: ${step.toolCalls.map(t => t.name).join(', ') || 'no tools'}`);
      });

      console.log(`[Dashboard Agent] Starting loop — goal: "${goal}"`);

      // Run loop in background (don't await)
      this.agentLoop.run().then((steps) => {
        const lastStep = steps[steps.length - 1];
        const achieved = lastStep?.goalAchieved ?? false;
        console.log(`[Dashboard Agent] Completed in ${steps.length} steps — goal ${achieved ? 'achieved ✓' : 'not achieved'}`);
        this.agentRunning = false;
        this.agentLoop = null;
        this.broadcast({
          type: 'agent_state',
          data: {
            state: 'idle',
            goal: this.currentGoal,
            result: achieved ? 'achieved' : 'not_achieved',
            steps: steps.length,
          },
          timestamp: Date.now(),
        });
      }).catch((err) => {
        console.error(`[Dashboard Agent] Loop error: ${err instanceof Error ? err.message : String(err)}`);
        this.agentRunning = false;
        this.agentLoop = null;
        this.broadcast({
          type: 'agent_state',
          data: { state: 'idle', goal: this.currentGoal, error: err instanceof Error ? err.message : String(err) },
          timestamp: Date.now(),
        });
      });
    } catch (err) {
      console.error(`[Dashboard Agent] Failed to start: ${err instanceof Error ? err.message : String(err)}`);
      this.agentRunning = false;
      this.broadcast({
        type: 'error',
        data: { message: `Agent failed to start: ${err instanceof Error ? err.message : String(err)}` },
        timestamp: Date.now(),
      });
      this.broadcast({
        type: 'agent_state',
        data: { state: 'idle', goal: this.currentGoal },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Stop the currently running agent loop.
   */
  private stopAgent(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.agentLoop) {
      this.agentLoop.stop();
      this.agentLoop = null;
    }
    this.agentRunning = false;
    this.broadcast({
      type: 'agent_state',
      data: { state: 'idle', goal: this.currentGoal },
      timestamp: Date.now(),
    });
  }

  // ─── Messaging ──────────────────────────────────────────

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
        const result = await this.mcClient.callTool('bot_status', {});
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
    // Connect to MC MCP server for status polling
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
    this.stopAgent();

    for (const ws of this.clients) {
      ws.close();
    }
    this.clients.clear();

    await this.mcClient.disconnect();
    if (this.mcAgentClient) {
      await this.mcAgentClient.disconnect();
    }
    if (this.mempalaceClient) {
      await this.mempalaceClient.disconnect();
    }

    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}