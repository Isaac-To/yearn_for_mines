import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScreenshotCapture, ScreenshotInputSchema } from '../screenshot.js';

// Mock prismarine-viewer to test the attach/capture paths
vi.mock('prismarine-viewer', () => ({
  default: {},
  headless: vi.fn(),
  mineflayer: vi.fn(),
}));

describe('ScreenshotCapture - headless mode', () => {
  let capture: ScreenshotCapture;

  beforeEach(() => {
    vi.clearAllMocks();
    capture = new ScreenshotCapture('headless');
  });

  it('should start without viewer attached', () => {
    expect(capture.isAvailable).toBe(false);
  });

  it('should return null from capture when not attached', async () => {
    const result = await capture.capture();
    expect(result).toBeNull();
  });

  it('should handle detach when nothing attached', () => {
    expect(() => capture.detach()).not.toThrow();
    expect(capture.isAvailable).toBe(false);
  });

  it('should attach successfully when prismarine-viewer is available', async () => {
    const pv = await import('prismarine-viewer');
    const mockBot = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
    } as any;

    await capture.attach(mockBot);
    expect(pv.headless).toHaveBeenCalledWith(mockBot, expect.objectContaining({
      viewDistance: 8,
      width: 640,
      height: 480,
      output: 'png',
    }));
    expect(capture.isAvailable).toBe(true);
  });

  it('should detach cleanly after attach', async () => {
    const pv = await import('prismarine-viewer');
    const mockBot = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
    } as any;

    await capture.attach(mockBot);
    expect(capture.isAvailable).toBe(true);
    capture.detach();
    expect(capture.isAvailable).toBe(false);
  });

  it('should detach before re-attaching', async () => {
    const mockBot1 = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
    } as any;
    const mockBot2 = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 10, y: 10, z: 10 } },
    } as any;

    await capture.attach(mockBot1);
    expect(capture.isAvailable).toBe(true);
    await capture.attach(mockBot2);
    expect(capture.isAvailable).toBe(true);
  });

  it('should return null from capture when viewer not available', async () => {
    const result = await capture.capture();
    expect(result).toBeNull();
  });

  it('should return null from capture when bot is null after detach', async () => {
    const mockBot = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
    } as any;
    await capture.attach(mockBot);
    capture.detach();
    const result = await capture.capture();
    expect(result).toBeNull();
  });
});

describe('ScreenshotCapture - headed mode', () => {
  let capture: ScreenshotCapture;

  beforeEach(() => {
    vi.clearAllMocks();
    capture = new ScreenshotCapture('headed');
  });

  it('should create instance in headed mode', () => {
    expect(capture).toBeDefined();
    expect(capture.isAvailable).toBe(false);
  });

  it('should call mineflayer function in headed mode', async () => {
    const pv = await import('prismarine-viewer');
    const mockBot = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
    } as any;

    await capture.attach(mockBot);
    expect(pv.mineflayer).toHaveBeenCalledWith(mockBot, expect.objectContaining({
      viewDistance: 8,
      firstPerson: true,
    }));
    expect(capture.isAvailable).toBe(true);
  });
});

describe('ScreenshotCapture - capture with viewer', () => {
  let capture: ScreenshotCapture;

  beforeEach(() => {
    vi.clearAllMocks();
    capture = new ScreenshotCapture('headless');
  });

  it('should return base64 string when screenshot function returns a Buffer', async () => {
    const pv = await import('prismarine-viewer');
    const testData = Buffer.from('fake png data');
    const mockBot = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
      viewer: {
        screenshot: vi.fn().mockResolvedValue(testData),
      },
    } as any;

    await capture.attach(mockBot);
    expect(capture.isAvailable).toBe(true);

    const result = await capture.capture();
    expect(result).toBe(testData.toString('base64'));
  });

  it('should return null when screenshot function returns non-Buffer', async () => {
    const mockBot = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
      viewer: {
        screenshot: vi.fn().mockResolvedValue('not a buffer'),
      },
    } as any;

    await capture.attach(mockBot);
    const result = await capture.capture();
    expect(result).toBeNull();
  });

  it('should return null when screenshot throws', async () => {
    const mockBot = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
      viewer: {
        screenshot: vi.fn().mockRejectedValue(new Error('Screenshot failed')),
      },
    } as any;

    await capture.attach(mockBot);
    const result = await capture.capture();
    expect(result).toBeNull();
  });

  it('should return null when viewer has no screenshot function', async () => {
    const mockBot = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
      viewer: {}, // no screenshot method
    } as any;

    await capture.attach(mockBot);
    const result = await capture.capture();
    expect(result).toBeNull();
  });

  it('should return null when bot has no viewer property', async () => {
    const mockBot = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
      // no viewer property
    } as any;

    await capture.attach(mockBot);
    const result = await capture.capture();
    expect(result).toBeNull();
  });

  it('should return null when not attached', async () => {
    const result = await capture.capture();
    expect(result).toBeNull();
  });
});

describe('ScreenshotCapture - attach failure', () => {
  it('should handle attach failure gracefully', async () => {
    // With vi.mock at module level, prismarine-viewer is available.
    // The code path where import fails is exercised in the original
    // screenshot.test.ts (without the mock). Here we test that when
    // the mock is available, attach succeeds and sets isAvailable.
    const capture = new ScreenshotCapture('headless');
    const mockBot = {
      on: vi.fn(),
      off: vi.fn(),
      entity: { position: { x: 0, y: 0, z: 0 } },
    } as any;

    await capture.attach(mockBot);
    expect(capture.isAvailable).toBe(true);
  });
});

describe('ScreenshotInputSchema', () => {
  it('should apply default width and height', () => {
    const input = ScreenshotInputSchema.parse({});
    expect(input.width).toBe(640);
    expect(input.height).toBe(480);
  });

  it('should accept custom width and height', () => {
    const input = ScreenshotInputSchema.parse({ width: 1920, height: 1080 });
    expect(input.width).toBe(1920);
    expect(input.height).toBe(1080);
  });

  it('should reject width below 64', () => {
    expect(() => ScreenshotInputSchema.parse({ width: 32 })).toThrow();
  });

  it('should reject width above 1920', () => {
    expect(() => ScreenshotInputSchema.parse({ width: 2000 })).toThrow();
  });

  it('should reject height below 64', () => {
    expect(() => ScreenshotInputSchema.parse({ height: 32 })).toThrow();
  });

  it('should reject height above 1080', () => {
    expect(() => ScreenshotInputSchema.parse({ height: 2000 })).toThrow();
  });

  it('should accept minimum valid values', () => {
    const input = ScreenshotInputSchema.parse({ width: 64, height: 64 });
    expect(input.width).toBe(64);
    expect(input.height).toBe(64);
  });

  it('should accept maximum valid values', () => {
    const input = ScreenshotInputSchema.parse({ width: 1920, height: 1080 });
    expect(input.width).toBe(1920);
    expect(input.height).toBe(1080);
  });
});