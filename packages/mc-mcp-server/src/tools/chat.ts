import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { textResult, errorResult } from '@yearn-for-mines/shared';

const MAX_MESSAGE_LENGTH = 256;
const RATE_LIMIT_MS = 1000;

let lastSendTime = 0;

export function registerChatTool(server: McpServer, botManager: BotManager): void {
  server.registerTool('send_chat', {
    title: 'Send Chat',
    description: 'Send a chat message in Minecraft. Use for narrating actions or responding to players.',
    inputSchema: { message: z.string().max(MAX_MESSAGE_LENGTH).describe('The chat message to send') },
  }, async ({ message }) => {
    const bot = botManager.currentBot;
    if (!bot) return errorResult('Bot not connected');

    if (!message || message.trim().length === 0) {
      return errorResult('Message cannot be empty');
    }

    const now = Date.now();
    if (now - lastSendTime < RATE_LIMIT_MS) {
      return errorResult('Rate limited: please wait before sending another message');
    }
    lastSendTime = now;

    try {
      bot.chat(message.trim());
      return textResult(`Sent chat: ${message.trim()}`);
    } catch (error: any) {
      return errorResult(`Failed to send chat: ${error.message}`);
    }
  });
}