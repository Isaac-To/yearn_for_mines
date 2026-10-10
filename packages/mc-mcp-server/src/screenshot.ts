import type { Bot } from 'mineflayer';
import { z } from 'zod/v4';
import { createFrameRenderer, type FrameRenderer } from './frame-renderer.js';

export class ScreenshotCapture {
  private renderer?: FrameRenderer;
  private capturing = false;
  lastError: string | undefined;
  constructor(_mode: 'headless' | 'headed' = 'headless', private factory = createFrameRenderer) {}
  async attach(bot: Bot): Promise<void> {
    this.detach();
    try { this.renderer = this.factory(bot); this.lastError = undefined; }
    catch (error) { this.lastError = `Native screenshot renderer unavailable: ${String(error)}`; }
  }
  detach(): void { this.renderer?.dispose(); this.renderer = undefined; }
  async capture(width = 640, height = 480): Promise<string | null> {
    if (!this.renderer || this.capturing) return null;
    this.capturing = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const buffer = await Promise.race([
        this.renderer.capture(width, height),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Rendering timed out')), 10000); }),
      ]);
      return Buffer.isBuffer(buffer) ? buffer.toString('base64') : null;
    } catch (error) {
      this.lastError = String(error);
      this.detach();
      return null;
    } finally { clearTimeout(timer); this.capturing = false; }
  }
  get isAvailable(): boolean { return this.renderer !== undefined; }
}
export const ScreenshotInputSchema = z.object({
  width: z.number().int().min(64).max(1920).default(640),
  height: z.number().int().min(64).max(1080).default(480),
});
export type ScreenshotInput = z.infer<typeof ScreenshotInputSchema>;
