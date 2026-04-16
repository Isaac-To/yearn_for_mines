/**
 * Registers SIGINT/SIGTERM handlers that run cleanup functions in parallel,
 * then exit. If cleanup exceeds the timeout, forces exit with code 1.
 */
export interface ShutdownOptions {
  /** Maximum time in milliseconds to wait for cleanup before force-exiting. Default: 10000 */
  timeoutMs?: number;
  /** Exit code on successful shutdown. Default: 0 */
  exitCode?: number;
}

type CleanupHandler = () => void | Promise<void>;

let registered = false;

export function registerShutdown(
  handlers: CleanupHandler[],
  options: ShutdownOptions = {},
): void {
  if (registered) return;
  registered = true;

  const timeoutMs = options.timeoutMs ?? 10_000;
  const exitCode = options.exitCode ?? 0;
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nReceived ${signal}, shutting down...`);

    const forceExitTimeout = setTimeout(() => {
      console.error('Shutdown timed out, forcing exit');
      process.exit(1);
    }, timeoutMs);

    const results = await Promise.allSettled(handlers.map(h => h()));
    forceExitTimeout.unref();

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Shutdown handler error:', result.reason);
      }
    }

    process.exit(exitCode);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * Reset the registered flag (for testing only).
 */
export function _resetShutdownRegistered(): void {
  registered = false;
}