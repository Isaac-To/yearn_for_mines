import { McpClient, LlmClient, loadConfig, registerShutdown } from '@yearn-for-mines/shared';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AgentLoop } from './agent-loop.js';
import { validateLlmModel } from './validate-llm-model.js';

const config = loadConfig();

const mcMcpUrl = config.mcpServer.host === '0.0.0.0'
  ? `http://localhost:${config.mcpServer.port}/mcp`
  : `http://${config.mcpServer.host}:${config.mcpServer.port}/mcp`;

/** Retry connecting to an MCP server, creating a fresh client + transport each attempt. */
async function connectMcpWithRetry(
  url: string,
  opts: { maxRetries: number; retryDelayMs: number; label: string },
): Promise<McpClient> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const client = new McpClient({ name: 'yearn-for-mines-agent', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(url));
    try {
      await client.connect(transport);
      return client;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < opts.maxRetries) {
        console.warn(`[Agent] ${opts.label} attempt ${attempt + 1}/${opts.maxRetries + 1} failed (${msg}), retrying...`);
        await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs));
      }
    }
  }
  throw new Error(
    `Failed to connect ${opts.label} after ${opts.maxRetries + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function main(): Promise<void> {
  console.log('[Agent] Starting Yearn for Mines agent...');
  console.log(`[Agent] Goal: ${config.agent.goal}`);

  // Validate LLM model availability (Ollama only)
  await validateLlmModel(config.llm.baseUrl, config.llm.model);

  // Connect to MC MCP server (with retries for startup race)
  console.log(`[Agent] Connecting to MC MCP server at ${mcMcpUrl}...`);

  let mcClient: McpClient;
  try {
    mcClient = await connectMcpWithRetry(mcMcpUrl, {
      maxRetries: 10,
      retryDelayMs: 1000,
      label: 'MC MCP server',
    });
    console.log('[Agent] Connected to MC MCP server');
  } catch (err) {
    console.error(`[Agent] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Optionally connect to MemPalace
  let mempalaceClient: McpClient | undefined;
  if (config.mempalace.url) {
    console.log(`[Agent] Connecting to MemPalace at ${config.mempalace.url}...`);
    try {
      mempalaceClient = await connectMcpWithRetry(config.mempalace.url, {
        maxRetries: 3,
        retryDelayMs: 1000,
        label: 'MemPalace',
      });
      console.log('[Agent] Connected to MemPalace');
    } catch (err) {
      console.warn(`[Agent] ${err instanceof Error ? err.message : String(err)}`);
      mempalaceClient = undefined;
    }
  }

  // Set up LLM client
  const llmClient = new LlmClient({
    baseUrl: config.llm.baseUrl,
    model: config.llm.model,
    visionModel: config.llm.visionModel,
    apiKey: config.llm.apiKey,
    maxTokens: config.llm.maxTokens,
    temperature: config.llm.temperature,
  });
  console.log(`[Agent] LLM endpoint: ${config.llm.baseUrl} (model: ${config.llm.model})`);

  // Create abort controller for graceful shutdown
  const abortController = new AbortController();

  // Create and run agent loop
  const loop = new AgentLoop(mcClient, llmClient, {
    goal: config.agent.goal,
    maxIterations: config.agent.maxIterations,
    maxRetries: config.agent.maxRetries,
    maxObservationTokens: config.agent.maxObservationTokens,
    enableVlm: config.agent.enableVlm,
    loopDelayMs: config.agent.loopDelayMs,
    signal: abortController.signal,
  }, mempalaceClient);

  loop.setStepCallback((step) => {
    console.log(`[Agent] Step ${step.goalAchieved ? '✓' : '…'}: ${step.toolCalls.map(t => t.name).join(', ') || 'no tools'}`);
    if (step.toolResults.some(r => r.isError)) {
      for (const r of step.toolResults.filter(r => r.isError)) {
        console.warn(`[Agent]   Error in ${r.name}: ${r.result}`);
      }
    }
  });

  // Register graceful shutdown handler
  registerShutdown([
    () => {
      console.log('[Agent] Aborting loop...');
      abortController.abort();
      loop.stop();
    },
    async () => {
      console.log('[Agent] Disconnecting MCP clients...');
      await mcClient.disconnect();
      if (mempalaceClient) {
        await mempalaceClient.disconnect();
      }
    },
  ]);

  try {
    const steps = await loop.run();
    console.log(`[Agent] Completed in ${steps.length} steps`);

    const lastStep = steps[steps.length - 1];
    if (lastStep?.goalAchieved) {
      console.log('[Agent] Goal achieved!');
    } else {
      console.log('[Agent] Goal not achieved within iteration limit');
    }
  } catch (err) {
    console.error(`[Agent] Agent loop failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Cleanup (also runs on normal completion)
  await mcClient.disconnect();
  if (mempalaceClient) {
    await mempalaceClient.disconnect();
  }
  console.log('[Agent] Shutdown complete');
}

main().catch((err) => {
  console.error('[Agent] Fatal error:', err);
  process.exit(1);
});