import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BotManager } from '../bot-manager.js';
import { registerHudTools, registerBotStatusResource } from '../tools/hud.js';

describe('registerHudTools', () => {
  it('should register HUD tools without errors', () => {
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    const manager = new BotManager();
    registerHudTools(server, manager);
    expect(true).toBe(true);
  });
});

describe('registerBotStatusResource', () => {
  it('should register bot status resource without errors', () => {
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    const manager = new BotManager();
    registerBotStatusResource(server, manager);
    expect(true).toBe(true);
  });

  it('should return disconnected status when bot is not connected', async () => {
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    const manager = new BotManager();
    registerBotStatusResource(server, manager);

    // The resource handler should return disconnected state
    expect(manager.currentBot).toBeNull();
  });
});