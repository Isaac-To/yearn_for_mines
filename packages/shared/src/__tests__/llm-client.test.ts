import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmClient } from '../llm-client.js';

describe('LlmClient', () => {
  const mockBaseUrl = 'http://localhost:11434/v1';
  const mockModel = 'llama3.2';

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
  });
});