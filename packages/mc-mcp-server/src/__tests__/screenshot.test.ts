import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScreenshotCapture } from '../screenshot.js';

describe('ScreenshotCapture', () => {
  let capture: ScreenshotCapture;

  beforeEach(() => {
    capture = new ScreenshotCapture('headless');
  });

  it('should start without viewer attached', () => {
    expect(capture.isAvailable).toBe(false);
  });

  it('should return null when not attached', async () => {
    const result = await capture.capture();
    expect(result).toBeNull();
  });

  it('should handle detach when nothing attached', () => {
    expect(() => capture.detach()).not.toThrow();
  });

  it('should set headless mode from constructor', () => {
    const headed = new ScreenshotCapture('headed');
    expect(headed).toBeDefined();
  });

  it('should handle attach failure gracefully', async () => {
    // Create a minimal bot mock
    const mockBot = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
    } as any;

    // This will fail to import prismarine-viewer in test environment
    // but should not throw
    await expect(capture.attach(mockBot)).resolves.toBeUndefined();
    // In test env, viewer init likely fails
    expect(capture.isAvailable).toBe(false);
  });

  it('should return null from capture when viewer not available', async () => {
    const result = await capture.capture();
    expect(result).toBeNull();
  });

  it('should detach cleanly even after failed attach', async () => {
    const mockBot = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
    } as any;

    await capture.attach(mockBot);
    expect(() => capture.detach()).not.toThrow();
  });
});