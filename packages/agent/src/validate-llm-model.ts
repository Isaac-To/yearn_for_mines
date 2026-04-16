/**
 * Validates that the configured LLM model is available in the local Ollama instance.
 * Only runs for Ollama endpoints (localhost:11434) — skipped for other providers.
 */

const OLLAMA_HOST = 'localhost:11434';

export async function validateLlmModel(baseUrl: string, model: string): Promise<void> {
  if (!baseUrl.includes(OLLAMA_HOST)) {
    return;
  }

  const tagsUrl = baseUrl.replace(/\/v1$/, '/api/tags');
  try {
    const response = await fetch(tagsUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      console.error(`[Agent] Cannot reach Ollama at ${tagsUrl} (HTTP ${response.status})`);
      process.exit(1);
    }
    const data = await response.json() as { models?: Array<{ name: string }> };
    const modelNames = data.models?.map((m) => m.name.replace(':latest', '')) ?? [];
    if (!modelNames.includes(model)) {
      console.error(`[Agent] Model '${model}' not found in Ollama. Run: ollama pull ${model}`);
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error(`[Agent] Cannot reach Ollaba at ${tagsUrl}. Is Ollama running?`);
      process.exit(1);
    }
    throw err;
  }
}