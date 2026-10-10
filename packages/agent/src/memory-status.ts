import { McpClient, loadConfig } from '@yearn-for-mines/shared';

const config = loadConfig();
if (!config.mempalace.url) throw new Error('Set MCP_MEMPALACE_URL to inspect memory');
const client = new McpClient({ name: 'memory-status', version: '1' });
try {
  await client.connectToUrl(config.mempalace.url, { timeoutMs: 10000 });
  for (const name of ['mempalace_status', 'mempalace_kg_stats']) {
    const result = await client.callTool(name, {}, { timeoutMs: 10000 });
    const text = result.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
    if (result.isError) throw new Error(text);
    const data = JSON.parse(text);
    if (data.error || data.success === false) throw new Error(text);
    // Counts only; avoid dumping the palace protocol or individual memories.
    console.log(JSON.stringify({ tool: name, totalDrawers: data.total_drawers, wings: data.wings, rooms: data.rooms,
      stats: name === 'mempalace_kg_stats' ? data : undefined }));
  }
} finally { await client.disconnect(); }
