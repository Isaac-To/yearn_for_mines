import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { validateLlmModel } from '../validate-llm-model.js';

class ExitRequested extends Error {
  constructor() {
    super('process.exit(1) called');
    this.name = 'ExitRequested';
  }
}

describe('validateLlmModel', () => {
  const originalExit = process.exit;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.exit = vi.fn((() => { throw new ExitRequested(); }) as never) as never;
  });

  afterAll(() => {
    process.exit = originalExit;
  });

  it('should skip validation for non-Ollama endpoints', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await validateLlmModel('https://api.openai.com/v1', 'gpt-4');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should pass when model exists in Ollama', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3.2:latest' }] }),
    } as Response);

    await validateLlmModel('http://localhost:11434/v1', 'llama3.2');
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('should exit when model is not found in Ollama', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'other-model:latest' }] }),
    } as Response);

    await expect(
      validateLlmModel('http://localhost:11434/v1', 'missing-model')
    ).rejects.toThrow('process.exit(1) called');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Model 'missing-model' not found in Ollama")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should exit when Ollama returns non-OK response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await expect(
      validateLlmModel('http://localhost:11434/v1', 'llama3.2')
    ).rejects.toThrow('process.exit(1) called');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot reach Ollama')
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should exit on fetch timeout', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('The operation was aborted', 'TimeoutError')
    );

    await expect(
      validateLlmModel('http://localhost:11434/v1', 'llama3.2')
    ).rejects.toThrow('process.exit(1) called');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Is Ollama running?')
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should exit when Ollama response has no models array', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    await expect(
      validateLlmModel('http://localhost:11434/v1', 'llama3.2')
    ).rejects.toThrow('process.exit(1) called');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Model 'llama3.2' not found in Ollama")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should throw non-timeout errors', async () => {
    const error = new TypeError('fetch failed');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);

    await expect(
      validateLlmModel('http://localhost:11434/v1', 'llama3.2')
    ).rejects.toThrow('fetch failed');
  });
});