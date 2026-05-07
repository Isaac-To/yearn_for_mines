import { loadConfig, registerShutdown } from '@yearn-for-mines/shared';
import { DashboardServer } from './server.js';

const config = loadConfig();

const server = new DashboardServer({
  port: config.webUi.port,
  mcMcpUrl: config.webUi.mcMcpUrl,
  mempalaceMcpUrl: config.mempalace.url,
  llmConfig: {
    baseUrl: config.llm.baseUrl,
    model: config.llm.model,
    visionModel: config.llm.visionModel,
    apiKey: config.llm.apiKey,
    maxTokens: config.llm.maxTokens,
    temperature: config.llm.temperature,
  },
  agentDefaults: {
    goal: config.agent.goal,
    maxIterations: config.agent.maxIterations,
    maxRetries: config.agent.maxRetries,
    maxObservationTokens: config.agent.maxObservationTokens,
    enableVlm: config.agent.enableVlm,
    loopDelayMs: config.agent.loopDelayMs,
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
  },
]);