import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmClient } from '../llm-client.js';
import type { LlmResponse } from '../llm-client.js';

describe('LlmClient', () => {
  const mockBaseUrl = 'http://localhost:11434/v1';
  const mockModel = 'llama3.2';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a client with required options', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });
      expect(client).toBeDefined();
      expect(client.baseUrl).toBe(mockBaseUrl);
      expect(client.model).toBe(mockModel);
    });

    it('should accept optional vision model', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
        visionModel: 'llava',
      });
      expect(client.visionModel).toBe('llava');
    });

    it('should default vision model to undefined', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });
      expect(client.visionModel).toBeUndefined();
    });

    it('should accept custom maxTokens and temperature', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
        maxTokens: 4096,
        temperature: 0.5,
      });
      expect(client.maxTokens).toBe(4096);
      expect(client.temperature).toBe(0.5);
    });

    it('should use default maxTokens and temperature', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });
      expect(client.maxTokens).toBe(2048);
      expect(client.temperature).toBe(0.7);
    });
  });

  describe('formatSystemPrompt', () => {
    it('should include tool descriptions when provided', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const tools = [
        { name: 'observe', description: 'Get world state' },
        { name: 'dig_block', description: 'Dig a block' },
      ];

      const prompt = client.formatSystemPrompt('Gather wood', tools);
      expect(prompt).toContain('observe');
      expect(prompt).toContain('dig_block');
      expect(prompt).toContain('Gather wood');
    });

    it('should include memory context when provided', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const prompt = client.formatSystemPrompt('Gather wood', [], 'Previously learned: use fists on oak_log');
      expect(prompt).toContain('Previously learned');
    });

    it('should not include tool section when no tools', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const prompt = client.formatSystemPrompt('Gather wood', []);
      expect(prompt).not.toContain('Available tools');
    });

    it('should not include memory section when no context', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const prompt = client.formatSystemPrompt('Gather wood', []);
      expect(prompt).not.toContain('Relevant memories');
    });
  });

  describe('formatMessages', () => {
    it('should format text-only messages', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const messages = client.formatMessages(
        'System prompt',
        'You see oak_log nearby',
      );

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('should format multimodal messages with screenshot', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
        visionModel: 'llava',
      });

      const messages = client.formatMessages(
        'System prompt',
        'You see oak_log nearby',
        'base64pngdata...',
      );

      expect(messages).toHaveLength(2);
      const userContent = messages[1].content;
      expect(Array.isArray(userContent)).toBe(true);
      if (Array.isArray(userContent)) {
        const types = userContent.map((c: { type: string }) => c.type);
        expect(types).toContain('text');
        expect(types).toContain('image_url');
      }
    });

    it('should use text-only format when no vision model even with screenshot', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const messages = client.formatMessages(
        'System prompt',
        'You see oak_log nearby',
        'base64pngdata...',
      );

      expect(messages).toHaveLength(2);
      expect(typeof messages[1].content).toBe('string');
    });
  });

  describe('parseToolCalls', () => {
    it('should parse tool calls from LLM response', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const response = {
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_1',
              function: {
                name: 'observe',
                arguments: '{}',
              },
            }],
          },
        }],
      };

      const calls = client.parseToolCalls(response);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('observe');
      expect(calls[0].args).toEqual({});
    });

    it('should return empty array when no tool calls', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const response = {
        choices: [{
          message: {
            content: 'I need to find a tree first.',
          },
        }],
      };

      const calls = client.parseToolCalls(response);
      expect(calls).toHaveLength(0);
    });

    it('should handle malformed tool call arguments gracefully', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const response = {
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_1',
              function: {
                name: 'dig_block',
                arguments: 'not valid json {',
              },
            }],
          },
        }],
      };

      const calls = client.parseToolCalls(response);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('dig_block');
      expect(calls[0].args).toEqual({});
    });

    it('should handle missing choices', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const calls = client.parseToolCalls({});
      expect(calls).toHaveLength(0);
    });

    it('should parse multiple tool calls', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const response = {
        choices: [{
          message: {
            tool_calls: [
              { id: 'call_1', function: { name: 'observe', arguments: '{}' } },
              { id: 'call_2', function: { name: 'dig_block', arguments: '{"block":"oak_log"}' } },
            ],
          },
        }],
      };

      const calls = client.parseToolCalls(response);
      expect(calls).toHaveLength(2);
      expect(calls[1].args).toEqual({ block: 'oak_log' });
    });
  });

  describe('buildRequestBody', () => {
    it('should build request body with tools', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const tools = [
        { name: 'observe', description: 'Get world state', inputSchema: { type: 'object', properties: {} } },
      ];

      const body = client.buildRequestBody(
        [{ role: 'user', content: 'test' }],
        tools,
      );

      expect(body.model).toBe(mockModel);
      expect(body.max_tokens).toBe(2048);
      expect(body.temperature).toBe(0.7);
      expect(body.tools).toHaveLength(1);
    });

    it('should not include tools in body when empty', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const body = client.buildRequestBody(
        [{ role: 'user', content: 'test' }],
        [],
      );

      expect(body.tools).toBeUndefined();
    });

    it('should use vision model when useVision is true', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
        visionModel: 'llava',
      });

      const body = client.buildRequestBody(
        [{ role: 'user', content: 'test' }],
        [],
        true,
      );

      expect(body.model).toBe('llava');
    });

    it('should use default inputSchema when not provided', () => {
      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const tools = [{ name: 'observe', description: 'Get world state' }];
      const body = client.buildRequestBody(
        [{ role: 'user', content: 'test' }],
        tools,
      );

      expect((body.tools as Array<{ function: { parameters: unknown } }>)[0].function.parameters).toEqual({
        type: 'object',
        properties: {},
      });
    });
  });

  describe('chat', () => {
    it('should send chat completion request and return response', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'I will dig the tree.' } }],
        }),
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const result = await client.chat(
        [{ role: 'user', content: 'Find a tree' }],
        [{ name: 'observe', description: 'Get world state' }],
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        `${mockBaseUrl}/chat/completions`,
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.choices).toBeDefined();
    });

    it('should throw on non-OK response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      await expect(
        client.chat([{ role: 'user', content: 'test' }], []),
      ).rejects.toThrow('LLM API error (500)');
    });
  });

  describe('isAvailable', () => {
    it('should return true when LLM endpoint is reachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as any);

      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const available = await client.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when LLM endpoint is unreachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const available = await client.isAvailable();
      expect(available).toBe(false);
    });

    it('should return false when endpoint returns non-OK', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as any);

      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const available = await client.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('listModels', () => {
    it('should return model names from the endpoint', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          models: [{ name: 'llama3.2' }, { name: 'llava' }],
        }),
      } as any);

      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const models = await client.listModels();
      expect(models).toEqual(['llama3.2', 'llava']);
    });

    it('should return empty array when endpoint is unreachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
      } as any);

      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const models = await client.listModels();
      expect(models).toEqual([]);
    });

    it('should return empty array when no models in response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      } as any);

      const client = new LlmClient({
        baseUrl: mockBaseUrl,
        model: mockModel,
      });

      const models = await client.listModels();
      expect(models).toEqual([]);
    });
  });
});