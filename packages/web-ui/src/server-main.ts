import { loadConfig, registerShutdown, LlmClient, McpClient } from '@yearn-for-mines/shared';
import { AgentLoop } from '@yearn-for-mines/agent';
import { DashboardServer } from './server.js';

const config = loadConfig();
let memoryClient: McpClient | undefined;

const server = new DashboardServer({
  port: config.webUi.port,
  mcMcpUrl: config.webUi.mcMcpUrl,
  createAgent: async (goal, client) => {
    if (!client.isConnected) await client.connectToUrl(config.webUi.mcMcpUrl);
    const result = await client.callTool('bot_connect', config.minecraft, { timeoutMs: 35000 });
    if (result.isError) throw new Error(JSON.stringify(result.content));
    if (config.agent.memoryMode !== 'off' && config.mempalace.url && !memoryClient?.isConnected) {
      memoryClient = new McpClient({ name: 'dashboard-memory', version: '1' });
      try { await memoryClient.connectToUrl(config.mempalace.url); }
      catch (error) { console.warn('[Dashboard] Memory unavailable:', String(error)); await memoryClient.disconnect().catch(() => {}); memoryClient = undefined; }
    }
    return new AgentLoop(client, new LlmClient(config.llm), { ...config.agent, memoryUrl: config.mempalace.url, goal, botConfig: config.minecraft }, memoryClient);
  },
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
    await memoryClient?.disconnect();
  },
]);
