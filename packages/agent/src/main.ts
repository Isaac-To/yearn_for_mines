import { McpClient } from '@yearn-for-mines/shared';
import { LlmClient } from '@yearn-for-mines/shared';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AgentLoop } from './agent-loop.js';

const mcMcpUrl = process.env.MCP_MC_URL ?? 'http://localhost:3000/mcp';
const mempalaceMcpUrl = process.env.MCP_MEMPALACE_URL;
const llmBaseUrl = process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1';
const llmModel = process.env.LLM_MODEL ?? 'llama3.2';
const llmVisionModel = process.env.LLM_VISION_MODEL;
const goal = process.env.AGENT_GOAL ?? 'Find a tree and gather wood';

async function main(): Promise<void> {
  console.log('[Agent] Starting Yearn for Mines agent...');
  console.log(`[Agent] Goal: ${goal}`);

  // Connect to MC MCP server
  const mcClient = new McpClient({ name: 'yearn-for-mines-agent', version: '0.1.0' });
  console.log(`[Agent] Connecting to MC MCP server at ${mcMcpUrl}...`);

  try {
    const mcTransport = new StreamableHTTPClientTransport(new URL(mcMcpUrl));
    await mcClient.connect(mcTransport);
    console.log('[Agent] Connected to MC MCP server');
  } catch (err) {
    console.error(`[Agent] Failed to connect to MC MCP server: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Optionally connect to MemPalace
  let mempalaceClient: McpClient | undefined;
  if (mempalaceMcpUrl) {
    console.log(`[Agent] Connecting to MemPalace at ${mempalaceMcpUrl}...`);
    try {
      mempalaceClient = new McpClient({ name: 'yearn-for-mines-agent', version: '0.1.0' });
      const mempalaceTransport = new StreamableHTTPClientTransport(new URL(mempalaceMcpUrl));
      await mempalaceClient.connect(mempalaceTransport);
      console.log('[Agent] Connected to MemPalace');
    } catch (err) {
      console.warn(`[Agent] Failed to connect to MemPalace: ${err instanceof Error ? err.message : String(err)}`);
      mempalaceClient = undefined;
    }
  }

  // Set up LLM client
  const llmClient = new LlmClient({
    baseUrl: llmBaseUrl,
    model: llmModel,
    visionModel: llmVisionModel,
  });
  console.log(`[Agent] LLM endpoint: ${llmBaseUrl} (model: ${llmModel})`);

  // Create and run agent loop
  const loop = new AgentLoop(mcClient, llmClient, {
    goal,
    enableVlm: !!llmVisionModel,
  }, mempalaceClient);

  loop.setStepCallback((step) => {
    console.log(`[Agent] Step ${step.goalAchieved ? '✓' : '…'}: ${step.toolCalls.map(t => t.name).join(', ') || 'no tools'}`);
    if (step.toolResults.some(r => r.isError)) {
      for (const r of step.toolResults.filter(r => r.isError)) {
        console.warn(`[Agent]   Error in ${r.name}: ${r.result}`);
      }
    }
  });

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

  // Cleanup
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