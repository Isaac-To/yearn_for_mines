const content = `{"name": "mempalace_diary_write", "args": ["Agent", "Next step: Mine the nearest tree to get wood."]}`;

function parseToolCallsFallback(content: string) {
  const toolCalls = [];
  try {
    const match = content.match(/(\{[\s\S]*\})/);
    console.log('Match length:', match ? match[1].length : 'null');
    if (match) {
      const parsed = JSON.parse(match[1]);
      console.log('Parsed type:', typeof parsed);
      const items = Array.isArray(parsed) ? parsed : (parsed.commands ? parsed.commands : [parsed]);
      console.log('Items length:', items.length);
      
      for (const item of items) {
          const name = item.name || item.command || item.action;
          console.log('Name is:', name);
          if (name && typeof name === 'string') {
            const args = item.kwargs || item.args || item.parameters || {};
            const safeArgs = typeof args === 'object' && args !== null ? args : {};
            
            toolCalls.push({
              name,
              args: safeArgs
            });
          }
      }
    }
  } catch (e) {
    console.log('Error:', e);
  }
  return toolCalls;
}

console.log('Result:', parseToolCallsFallback(content));
