const fetch = require('node:fetch') || globalThis.fetch;
async function test() {
  const tools = [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather',
      parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] }
    }
  }];
  const body = {
    model: 'llama3.1',
    messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
    tools: tools,
    stream: false
  };
  const res = await fetch('http://localhost:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    console.error('Error', res.status, await res.text());
    return;
  }
  const data = await res.json();
  console.log(JSON.stringify(data.choices[0].message, null, 2));
}
test();
