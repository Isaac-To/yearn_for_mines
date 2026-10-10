import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { BotManager } from '../bot-manager.js';
import { ScreenshotCapture } from '../screenshot.js';
import { errorResult, dataResult } from '@yearn-for-mines/shared';

/**
 * Registers the screenshot tool for capturing visual frames from the Minecraft world.
 * The screenshot is returned as base64-encoded PNG data suitable for vision LLMs.
 */
export function registerScreenshotTool(
  server: McpServer,
  botManager: BotManager,
  screenshotCapture: ScreenshotCapture,
): void {
  server.registerTool(
    'screenshot',
    {
      title: 'Capture Screenshot',
      description:
        'Capture a screenshot of the current Minecraft view. Returns base64-encoded PNG image. Useful for visual analysis of the world state, item identification, structure recognition, and spatial planning.',
      inputSchema: {
        width: z
          .number()
          .min(64)
          .max(1920)
          .default(640)
          .describe('Screenshot width in pixels'),
        height: z
          .number()
          .min(64)
          .max(1080)
          .default(480)
          .describe('Screenshot height in pixels'),
      },
    },
    async ({ width, height }) => {
      const bot = botManager.currentBot;
      if (!bot) {
        return errorResult('Bot not connected');
      }

      if (!screenshotCapture.isAvailable) {
        await screenshotCapture.attach(bot);
      }
      if (!screenshotCapture.isAvailable) {
        return errorResult(
          screenshotCapture.lastError ?? 'Screenshot capture not available.',
        );
      }

      try {
        const screenshot = await screenshotCapture.capture(width, height);
        if (!screenshot) {
          return errorResult('Failed to capture screenshot');
        }

        return dataResult({
          screenshot,
          width,
          height,
          format: 'png',
          encoding: 'base64',
          description: `Screenshot of Minecraft view at position ${Math.floor(bot.entity.position.x)}, ${Math.floor(bot.entity.position.y)}, ${Math.floor(bot.entity.position.z)}`,
        });
      } catch (error: any) {
        return errorResult(`Failed to capture screenshot: ${error.message}`);
      }
    },
  );
}
