import { DashboardServer } from './server.js';

const port = parseInt(process.env.PORT ?? '8080', 10);
const mcMcpUrl = process.env.MCP_MC_URL ?? 'http://localhost:3000/mcp';

const server = new DashboardServer({
  port,
  mcMcpUrl,
});

server.start().then(() => {
  console.log(`[Dashboard] Running on port ${port}`);
}).catch((err) => {
  console.error('[Dashboard] Failed to start:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('[Dashboard] Shutting down...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Dashboard] Shutting down...');
  await server.stop();
  process.exit(0);
});