import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerShutdown, _resetShutdownRegistered } from '../shutdown.js';

describe('registerShutdown', () => {
  const originalExit = process.exit;
  const originalOn = process.on;

  beforeEach(() => {
    _resetShutdownRegistered();
  });

  afterEach(() => {
    _resetShutdownRegistered();
  });

  it('should register SIGINT and SIGTERM handlers', () => {
    const listeners: Record<string, (() => void)[]> = { SIGINT: [], SIGTERM: [] };
    const mockOn = vi.fn((event: string, handler: () => void) => {
      listeners[event]?.push(handler);
      return process;
    });
    Object.defineProperty(process, 'on', { value: mockOn, configurable: true });

    registerShutdown([]);

    expect(mockOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

    Object.defineProperty(process, 'on', { value: originalOn, configurable: true });
  });

  it('should not register handlers twice', () => {
    const mockOn = vi.fn();
    Object.defineProperty(process, 'on', { value: mockOn, configurable: true });

    registerShutdown([]);
    registerShutdown([]);

    // Only 2 calls (SIGINT + SIGTERM) from the first registration
    expect(mockOn).toHaveBeenCalledTimes(2);

    Object.defineProperty(process, 'on', { value: originalOn, configurable: true });
  });

  it('should run cleanup handlers in parallel on SIGINT', async () => {
    const handler1 = vi.fn().mockResolvedValue(undefined);
    const handler2 = vi.fn().mockResolvedValue(undefined);
    const mockExit = vi.fn() as unknown as (code?: number) => never;
    Object.defineProperty(process, 'exit', { value: mockExit, configurable: true });

    // Capture the SIGINT handler
    let sigintHandler: (() => void) | undefined;
    const mockOn = vi.fn((event: string, handler: () => void) => {
      if (event === 'SIGINT') sigintHandler = handler;
      return process;
    });
    Object.defineProperty(process, 'on', { value: mockOn, configurable: true });

    registerShutdown([handler1, handler2]);

    // Trigger the signal
    await sigintHandler!();

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);

    Object.defineProperty(process, 'exit', { value: originalExit, configurable: true });
    Object.defineProperty(process, 'on', { value: originalOn, configurable: true });
  });

  it('should log errors from failing handlers and still exit', async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error('handler failed'));
    const mockExit = vi.fn() as unknown as (code?: number) => never;
    Object.defineProperty(process, 'exit', { value: mockExit, configurable: true });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let sigintHandler: (() => void) | undefined;
    const mockOn = vi.fn((event: string, handler: () => void) => {
      if (event === 'SIGINT') sigintHandler = handler;
      return process;
    });
    Object.defineProperty(process, 'on', { value: mockOn, configurable: true });

    registerShutdown([failingHandler]);

    await sigintHandler!();

    expect(failingHandler).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('Shutdown handler error:', expect.any(Error));
    expect(mockExit).toHaveBeenCalledWith(0);

    consoleSpy.mockRestore();
    Object.defineProperty(process, 'exit', { value: originalExit, configurable: true });
    Object.defineProperty(process, 'on', { value: originalOn, configurable: true });
  });

  it('should force exit with code 1 if cleanup times out', async () => {
    vi.useFakeTimers();

    // Handler that never resolves
    const hangingHandler = vi.fn().mockReturnValue(new Promise(() => {}));
    const mockExit = vi.fn() as unknown as (code?: number) => never;
    Object.defineProperty(process, 'exit', { value: mockExit, configurable: true });

    let sigintHandler: (() => void) | undefined;
    const mockOn = vi.fn((event: string, handler: () => void) => {
      if (event === 'SIGINT') sigintHandler = handler;
      return process;
    });
    Object.defineProperty(process, 'on', { value: mockOn, configurable: true });

    registerShutdown([hangingHandler], { timeoutMs: 5000 });

    // Start shutdown (don't await - it will hang)
    sigintHandler!();

    // Advance past the timeout
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockExit).toHaveBeenCalledWith(1);

    vi.useRealTimers();
    Object.defineProperty(process, 'exit', { value: originalExit, configurable: true });
    Object.defineProperty(process, 'on', { value: originalOn, configurable: true });
  });

  it('should use custom exit code', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const mockExit = vi.fn() as unknown as (code?: number) => never;
    Object.defineProperty(process, 'exit', { value: mockExit, configurable: true });

    let sigintHandler: (() => void) | undefined;
    const mockOn = vi.fn((event: string, handler: () => void) => {
      if (event === 'SIGINT') sigintHandler = handler;
      return process;
    });
    Object.defineProperty(process, 'on', { value: mockOn, configurable: true });

    registerShutdown([handler], { exitCode: 42 });

    await sigintHandler!();

    expect(mockExit).toHaveBeenCalledWith(42);

    Object.defineProperty(process, 'exit', { value: originalExit, configurable: true });
    Object.defineProperty(process, 'on', { value: originalOn, configurable: true });
  });

  it('should ignore duplicate signals during shutdown', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const mockExit = vi.fn() as unknown as (code?: number) => never;
    Object.defineProperty(process, 'exit', { value: mockExit, configurable: true });

    let sigintHandler: (() => void) | undefined;
    const mockOn = vi.fn((event: string, handler: () => void) => {
      if (event === 'SIGINT') sigintHandler = handler;
      return process;
    });
    Object.defineProperty(process, 'on', { value: mockOn, configurable: true });

    registerShutdown([handler]);

    // Call handler twice rapidly
    await sigintHandler!();
    await sigintHandler!();

    // Handler should only be called once (second signal ignored)
    expect(handler).toHaveBeenCalledTimes(1);

    Object.defineProperty(process, 'exit', { value: originalExit, configurable: true });
    Object.defineProperty(process, 'on', { value: originalOn, configurable: true });
  });
});