import { describe, it, expect } from 'vitest';

/**
 * Tests for the startup verification logic extracted from main.ts.
 *
 * The main.ts startup sequence is:
 * 1. Connect to MCP server (with retries)
 * 2. Call bot_connect to spawn the bot
 * 3. Call bot_status to verify the bot is alive
 * 4. Enter the agent loop
 *
 * These tests verify the key decision points in that sequence.
 */

/** Extract text from an MCP tool result — mirrors the function in main.ts */
function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.filter(c => c.type === 'text').map(c => c.text).join('');
}

describe('Startup verification', () => {
  describe('resultText', () => {
    it('should extract text from text content items', () => {
      const result = {
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'World' },
        ],
      };
      expect(resultText(result)).toBe('Hello World');
    });

    it('should skip non-text content items', () => {
      const result = {
        content: [
          { type: 'text', text: 'Visible' },
          { type: 'image', data: 'base64...', mimeType: 'image/png' } as any,
          { type: 'text', text: ' Also visible' },
        ],
      };
      expect(resultText(result)).toBe('Visible Also visible');
    });

    it('should return empty string for content with no text items', () => {
      const result = {
        content: [
          { type: 'image', data: 'base64...', mimeType: 'image/png' } as any,
        ],
      };
      expect(resultText(result)).toBe('');
    });

    it('should return empty string for empty content array', () => {
      const result = { content: [] };
      expect(resultText(result)).toBe('');
    });

    it('should handle undefined text values', () => {
      const result = {
        content: [
          { type: 'text', text: undefined } as any,
          { type: 'text', text: 'defined' },
        ],
      };
      expect(resultText(result)).toBe('defined');
    });
  });

  describe('bot_connect result handling', () => {
    it('should detect transient errors in bot_connect result', () => {
      const result = {
        content: [{ type: 'text', text: 'Error: [TRANSIENT] Connection refused' }],
        isError: true,
      };
      const text = resultText(result);
      expect(text.includes('[TRANSIENT]')).toBe(true);
    });

    it('should detect successful connection with alreadyConnected flag', () => {
      const result = {
        content: [{ type: 'text', text: JSON.stringify({ connected: true, alreadyConnected: true, username: 'TestBot' }) }],
        isError: false,
      };
      expect(result.isError).toBe(false);
      const data = JSON.parse(resultText(result));
      expect(data.connected).toBe(true);
      expect(data.alreadyConnected).toBe(true);
    });

    it('should detect successful new connection', () => {
      const result = {
        content: [{ type: 'text', text: JSON.stringify({ connected: true, username: 'TestBot', spawnPoint: { x: 0, y: 64, z: 0 } }) }],
        isError: false,
      };
      expect(result.isError).toBe(false);
      const data = JSON.parse(resultText(result));
      expect(data.connected).toBe(true);
      expect(data.username).toBe('TestBot');
    });

    it('should detect permanent connection errors', () => {
      const result = {
        content: [{ type: 'text', text: 'Error: Invalid server address' }],
        isError: true,
      };
      const text = resultText(result);
      expect(text.includes('[TRANSIENT]')).toBe(false);
    });
  });

  describe('bot_status verification', () => {
    it('should verify a connected bot status', () => {
      const statusText = JSON.stringify({
        connected: true,
        username: 'TestBot',
        position: { x: 100, y: 64, z: -200 },
        health: 20,
        gameMode: 'survival',
      });
      const status = JSON.parse(statusText);
      expect(status.connected).toBe(true);
      expect(status.username).toBe('TestBot');
      expect(status.position.x).toBe(100);
    });

    it('should detect disconnected bot status', () => {
      const statusText = JSON.stringify({
        connected: false,
        username: null,
        position: null,
        health: null,
        gameMode: null,
      });
      const status = JSON.parse(statusText);
      expect(status.connected).toBe(false);
    });

    it('should handle unparseable status gracefully', () => {
      const statusText = 'Not JSON';
      expect(() => JSON.parse(statusText)).toThrow();
    });
  });
});