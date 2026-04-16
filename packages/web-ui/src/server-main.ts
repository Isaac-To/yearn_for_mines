import { loadConfig, registerShutdown } from '@yearn-for-mines/shared';
import { DashboardServer } from './server.js';

const config = loadConfig();

const server = new DashboardServer({
  port: config.webUi.port,
  mcMcpUrl: config.webUi.mcMcpUrl,
});

server.start().then(() => {
  console.log(`[Dashboard] Running on port ${config.webUi.port}`);
}).catch((err) => {
  console.error('[Dashboard] Failed to start:', err);
  process.exit(1);
});

registerShutdown([
  async () => {
    console.log('[Dashboard] Shutting down...');
    await server.stop();
  },
]);