import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { BotManager } from './bot-manager.js';
import { EventManager } from './events.js';
import { registerLifecycleTools } from './tools/lifecycle.js';

export interface HttpTransportOptions {
  port: number;
  host: string;
  serverName: string;
  serverVersion: string;
}

interface SessionState {
  id: string;
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  createdAt: Date;
}

/**
 * Manages MCP server sessions over Streamable HTTP transport.
 *
 * Each client connection gets its own McpServer + StreamableHTTPServerTransport instance,
 * but they all share the same BotManager (and thus the same bot connection).
 *
 * This allows multiple agents/clients to observe the same bot simultaneously.
 */
export class McpHttpServer {
  private httpServer: http.Server | null = null;
  private sessions: Map<string, SessionState> = new Map();
  private botManager: BotManager;
  private eventManager: EventManager;
  private options: HttpTransportOptions;

  constructor(botManager: BotManager, options: Partial<HttpTransportOptions> = {}) {
    this.botManager = botManager;
    this.eventManager = new EventManager();
    this.options = {
      port: options.port ?? 3000,
      host: options.host ?? '127.0.0.1',
      serverName: options.serverName ?? 'yearn-for-mines-mcp',
      serverVersion: options.serverVersion ?? '0.1.0',
    };
  }

  /**
   * Creates a new McpServer instance with all tools registered.
   */
  private createMcpServer(): McpServer {
    const server = new McpServer({
      name: this.options.serverName,
      version: this.options.serverVersion,
    });

    registerLifecycleTools(server, this.botManager);
    registerObservationTools(server, this.botManager, this.eventManager);
    registerActionTools(server, this.botManager);
    registerEventTools(server, this.botManager, this.eventManager);
    registerHudTools(server, this.botManager);
    registerBotStatusResource(server, this.botManager);

    return server;
  }

  /**
   * Creates a new session with its own transport.
   */
  private async createSession(): Promise<SessionState> {
    const sessionId = randomUUID();
    const server = this.createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: (id: string) => {
        console.log(`[MCP] Session initialized: ${id}`);
      },
      onsessionclosed: (id: string) => {
        console.log(`[MCP] Session closed: ${id}`);
        this.sessions.delete(id);
      },
    });

    // Connect server to transport
    await server.connect(transport);

    const state: SessionState = {
      id: sessionId,
      server,
      transport,
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, state);
    return state;
  }

  /**
   * Handles incoming HTTP requests.
   * For initialization requests (no session ID), creates a new session.
   * For subsequent requests, routes to the existing session's transport.
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    try {
      // Check for session ID in headers
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      let session: SessionState | undefined;

      if (sessionId) {
        // Route to existing session
        session = this.sessions.get(sessionId);
        if (!session) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }
      } else {
        // Create new session for initialization requests
        session = await this.createSession();
      }

      await session.transport.handleRequest(req, res);
    } catch (error) {
      console.error('[MCP] Error handling request:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  }

  /**
   * Starts the HTTP server.
   */
  async start(): Promise<void> {
    this.httpServer = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    return new Promise<void>((resolve, reject) => {
      this.httpServer!.on('error', reject);
      this.httpServer!.listen(this.options.port, this.options.host, () => {
        console.log(
          `[MCP] Streamable HTTP server listening on ${this.options.host}:${this.options.port}`,
        );
        resolve();
      });
    });
  }

  /**
   * Stops the HTTP server and closes all sessions.
   */
  async stop(): Promise<void> {
    // Close all sessions
    for (const [sessionId, session] of this.sessions) {
      try {
        await session.transport.close();
      } catch (error) {
        console.error(`[MCP] Error closing session ${sessionId}:`, error);
      }
    }
    this.sessions.clear();

    // Close HTTP server
    if (this.httpServer) {
      return new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  /**
   * Gets the number of active sessions.
   */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Gets session IDs for monitoring.
   */
  get sessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }
}