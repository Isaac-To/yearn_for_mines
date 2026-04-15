import type { Bot } from 'mineflayer';
import { z } from 'zod/v4';

/**
 * Manages prismarine-viewer for screenshot capture.
 * Uses headless rendering for VLM input (no display needed).
 *
 * prismarine-viewer requires native canvas dependencies (node-canvas)
 * which may not be available in all environments, so we use dynamic
 * imports and graceful fallback.
 */
export class ScreenshotCapture {
  private bot: Bot | null = null;
  private viewerActive = false;
  private mode: 'headless' | 'headed';

  constructor(mode: 'headless' | 'headed' = 'headless') {
    this.mode = mode;
  }

  /**
   * Attach viewer to a bot instance.
   * For headless mode, uses prismarine-viewer's headless function.
   * For headed mode, uses the mineflayer function which starts a web viewer.
   *
   * Falls back gracefully if prismarine-viewer or its canvas dependency
   * is not available.
   */
  async attach(bot: Bot): Promise<void> {
    this.detach();
    this.bot = bot;

    try {
      const pv = await import('prismarine-viewer');
      if (this.mode === 'headless') {
        pv.headless(bot, {
          viewDistance: 8,
          width: 640,
          height: 480,
          output: 'png',
          frames: 0,
          jpegOption: {},
        });
      } else {
        pv.mineflayer(bot, {
          viewDistance: 8,
          firstPerson: true,
        });
      }
      this.viewerActive = true;
    } catch {
      // prismarine-viewer may not be available (missing canvas dependency)
      this.viewerActive = false;
    }
  }

  /**
   * Detach viewer from bot.
   */
  detach(): void {
    this.viewerActive = false;
    this.bot = null;
  }

  /**
   * Capture a screenshot as a base64-encoded PNG.
   * Returns null if screenshot capture is not available.
   */
  async capture(): Promise<string | null> {
    if (!this.bot || !this.viewerActive) return null;

    try {
      const botViewer = (this.bot as any).viewer;
      if (!botViewer) return null;

      // prismarine-viewer stores a screenshot function on the viewer
      if (typeof botViewer.screenshot === 'function') {
        const buffer: Buffer = await botViewer.screenshot();
        if (Buffer.isBuffer(buffer)) {
          return buffer.toString('base64');
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if screenshot capture is available.
   */
  get isAvailable(): boolean {
    return this.viewerActive && this.bot !== null;
  }
}

/**
 * Schema for screenshot tool input.
 */
export const ScreenshotInputSchema = z.object({
  width: z.number().min(64).max(1920).default(640).describe('Screenshot width in pixels'),
  height: z.number().min(64).max(1080).default(480).describe('Screenshot height in pixels'),
});

export type ScreenshotInput = z.infer<typeof ScreenshotInputSchema>;