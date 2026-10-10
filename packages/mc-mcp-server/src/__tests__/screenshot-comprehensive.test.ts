import { describe, it, expect, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import { ScreenshotCapture, ScreenshotInputSchema } from '../screenshot.js';
import type { FrameRenderer } from '../frame-renderer.js';

describe('ScreenshotCapture', () => {
  const bot = {} as Bot;
  function setup() {
    const renderer: FrameRenderer = { capture: vi.fn(async () => Buffer.from('PNG')), dispose: vi.fn() };
    const factory = vi.fn(() => renderer);
    return { renderer, factory, capture: new ScreenshotCapture('headless', factory) };
  }
  it('allocates no renderer until explicitly attached', async () => {
    const { capture, factory } = setup();
    expect(capture.isAvailable).toBe(false);
    expect(await capture.capture()).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });
  it('returns an encoded frame with the requested dimensions', async () => {
    const { capture, renderer } = setup();
    await capture.attach(bot);
    expect(await capture.capture(320, 240)).toBe(Buffer.from('PNG').toString('base64'));
    expect(renderer.capture).toHaveBeenCalledWith(320, 240);
  });
  it('disposes renderer resources on detach and reconnect', async () => {
    const { capture, renderer } = setup();
    await capture.attach(bot);
    await capture.attach(bot);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    capture.detach(); capture.detach();
    expect(renderer.dispose).toHaveBeenCalledTimes(2);
    expect(capture.isAvailable).toBe(false);
  });
  it('reports unavailable native dependencies without claiming support', async () => {
    const capture = new ScreenshotCapture('headless', () => { throw new Error('Missing native canvas'); });
    await capture.attach(bot);
    expect(capture.isAvailable).toBe(false);
    expect(capture.lastError).toContain('Missing native canvas');
  });
  it('disposes on render failure', async () => {
    const { capture, renderer } = setup();
    vi.mocked(renderer.capture).mockRejectedValue(new Error('GPU failure'));
    await capture.attach(bot);
    expect(await capture.capture()).toBeNull();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(capture.isAvailable).toBe(false);
  });
  it('rejects overlapping captures', async () => {
    const { capture, renderer } = setup();
    let finish!: (buffer: Buffer) => void;
    vi.mocked(renderer.capture).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await capture.attach(bot);
    const first = capture.capture();
    expect(await capture.capture()).toBeNull();
    finish(Buffer.from('PNG'));
    expect(await first).toBeTruthy();
    capture.detach();
  });
  it('validates integer dimensions and defaults', () => {
    expect(ScreenshotInputSchema.parse({})).toEqual({ width: 640, height: 480 });
    expect(ScreenshotInputSchema.safeParse({ width: 10 }).success).toBe(false);
    expect(ScreenshotInputSchema.safeParse({ height: 2000 }).success).toBe(false);
    expect(ScreenshotInputSchema.safeParse({ width: 640.5 }).success).toBe(false);
  });
});
