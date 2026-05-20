import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerChatTool } from '../tools/chat.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BotManager } from '../bot-manager.js';

describe('send_chat tool', () => {
  let server: McpServer;
  let botManager: BotManager;
  let mockBot: any;
  const registeredTools: Record<string, any> = {};

  let mockTime = 1000000;

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);
    server = new McpServer({ name: 'test', version: '1.0.0' });
    
    // Spy/mock registerTool on McpServer so we can grab the handler
    vi.spyOn(server, 'registerTool').mockImplementation((name: any, schema: any, handler: any): any => {
      registeredTools[name] = { schema, handler };
      return {} as any;
    });

    botManager = new BotManager();
    mockBot = {
      chat: vi.fn(),
    };
  });

  it('should register the send_chat tool', () => {
    registerChatTool(server, botManager);
    expect(server.registerTool).toHaveBeenCalled();
    expect(registeredTools.send_chat).toBeDefined();
  });

  it('should return error if bot is not connected', async () => {
    registerChatTool(server, botManager);
    const handler = registeredTools.send_chat.handler;
    const result = await handler({ message: 'Hello world' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Bot not connected');
  });

  it('should return error if message is empty or whitespace', async () => {
    registerChatTool(server, botManager);
    botManager.setBot(mockBot);
    const handler = registeredTools.send_chat.handler;

    const resultEmpty = await handler({ message: '' });
    expect(resultEmpty.isError).toBe(true);
    expect(resultEmpty.content[0].text).toContain('Message cannot be empty');

    const resultWhitespace = await handler({ message: '   ' });
    expect(resultWhitespace.isError).toBe(true);
    expect(resultWhitespace.content[0].text).toContain('Message cannot be empty');
  });

  it('should successfully send chat when bot is connected', async () => {
    mockTime += 2000;
    registerChatTool(server, botManager);
    botManager.setBot(mockBot);
    const handler = registeredTools.send_chat.handler;

    const result = await handler({ message: 'Hello server' });
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Sent chat: Hello server');
    expect(mockBot.chat).toHaveBeenCalledWith('Hello server');
  });

  it('should trigger rate limit if sent too quickly', async () => {
    mockTime += 2000;
    registerChatTool(server, botManager);
    botManager.setBot(mockBot);
    const handler = registeredTools.send_chat.handler;

    // First message passes
    const result1 = await handler({ message: 'First' });
    expect(result1.isError).toBe(false);

    // Second message immediately after is rate limited
    const result2 = await handler({ message: 'Second' });
    expect(result2.isError).toBe(true);
    expect(result2.content[0].text).toContain('Rate limited');
  });

  it('should handle bot.chat errors gracefully', async () => {
    mockTime += 2000;
    registerChatTool(server, botManager);
    mockBot.chat.mockImplementation(() => {
      throw new Error('Chat failed');
    });
    botManager.setBot(mockBot);
    const handler = registeredTools.send_chat.handler;

    const result = await handler({ message: 'Hello error' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to send chat: Chat failed');
  });
});
