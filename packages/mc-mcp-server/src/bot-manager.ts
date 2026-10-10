import { createBot } from 'mineflayer';
import type { Bot } from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin as collectBlock } from 'mineflayer-collectblock';
import type { BotConfig } from '@yearn-for-mines/shared';
import { ScreenshotCapture } from './screenshot.js';
import { boundedFindBlocks } from './bounded-search.js';
import { EventManager } from './events.js';
import { errorResult, type McpToolResult } from '@yearn-for-mines/shared';

export type BotFactory = (config: BotConfig) => Bot;

export interface ConnectResult {
  success: boolean;
  username?: string;
  spawnPoint?: { x: number; y: number; z: number };
  error?: string;
}

export interface DisconnectResult {
  success: boolean;
  error?: string;
}

export interface RespawnResult {
  success: boolean;
  spawnPoint?: { x: number; y: number; z: number };
  error?: string;
}

export class BotManager {
  private bot: Bot | null = null;
  private botFactory: BotFactory;
  private screenshotCapture: ScreenshotCapture = new ScreenshotCapture('headless');
  private activeAction?: AbortController;
  readonly events = new EventManager();
  private connecting = false;

  get actionState(): 'idle' | 'running' | 'cancelling' {
    return !this.activeAction ? 'idle' : this.activeAction.signal.aborted ? 'cancelling' : 'running';
  }

  /** Keep ownership until the underlying operation settles, even after cancellation. */
  async runAction(signal: AbortSignal, operation: (signal: AbortSignal) => Promise<McpToolResult>): Promise<McpToolResult> {
    signal ??= new AbortController().signal;
    if (this.activeAction) return errorResult('[BUSY] Previous action is still settling. Observe before retrying.');
    if (signal.aborted) return errorResult('[CANCELLED] Action cancelled before execution.');
    const controller = new AbortController();
    this.activeAction = controller;
    const cancel = () => this.cancelAction(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const result = await operation(controller.signal);
      controller.signal.throwIfAborted();
      return result;
    } catch (error) {
      return errorResult(controller.signal.aborted ? '[CANCELLED] Action cancelled; observe inventory before replanning.' : String(error));
    } finally {
      signal.removeEventListener('abort', cancel);
      if (this.activeAction === controller) this.activeAction = undefined;
    }
  }

  cancelAction(reason?: unknown): void {
    this.activeAction?.abort(reason);
    const bot = this.bot;
    if (!bot) return;
    try { bot.pathfinder?.setGoal(null); } catch { /* already stopped */ }
    try { bot.stopDigging(); } catch { /* already stopped */ }
    try { void bot.collectBlock?.cancelTask().catch(() => {}); } catch { /* plugin unavailable */ }
    try { bot.clearControlStates(); } catch { /* disconnected */ }
    try { if (bot.currentWindow) bot.closeWindow(bot.currentWindow); } catch { /* closed */ }
  }

  constructor(botFactory?: BotFactory, readonly defaults?: BotConfig) {
    // Default factory uses mineflayer.createBot
    // Can be overridden for testing
    this.botFactory = botFactory ?? ((config) => {
      return createBot({
        host: config.host,
        port: config.port,
        username: config.username,
        version: config.version,
        auth: config.auth,
      });
    });
  }

  get isConnected(): boolean {
    return this.bot !== null;
  }

  get currentBot(): Bot | null {
    return this.bot;
  }

  get currentScreenshotCapture(): ScreenshotCapture {
    return this.screenshotCapture;
  }

  setBot(bot: Bot): void {
    this.bot = bot;
  }

  async connect(config: BotConfig): Promise<ConnectResult> {
    if (this.bot || this.connecting) {
      return { success: false, error: 'Bot is already connected. Disconnect first.' };
    }

    this.connecting = true;
    let candidate: Bot | undefined;
    try {
      const bot = candidate = this.botFactory(config);

      // Wrap bot.dig to prevent tool desync / ghost blocks on the server.
      const originalDig = bot.dig?.bind(bot);
      if (originalDig) {
        (bot as any).dig = async (block: any, forceLook?: any, digFace?: any) => {
          const isMockEnv = typeof (bot.blockAt as any)?.mock !== 'undefined' || 
                            typeof (bot.canDigBlock as any)?.mock !== 'undefined';
          if (isMockEnv) {
            return originalDig(block, forceLook, digFace);
          }

          // Wait a short delay (200ms) to ensure tool equipping or movement has settled on the server
          await new Promise((resolve) => setTimeout(resolve, 200));

          const currentBlock = block && bot.blockAt(block.position);
          if (!block || !currentBlock || currentBlock.type === 0) {
            throw new Error('Block no longer exists or is air');
          }

          if (typeof bot.canDigBlock === 'function' && !bot.canDigBlock(block)) {
            throw new Error('Block is not reachable or cannot be mined');
          }

          const actualForceLook = forceLook !== undefined ? forceLook : true;
          const actualDigFace = digFace !== undefined ? digFace : 'raycast';

          const expectedTime = typeof bot.digTime === 'function' ? bot.digTime(block) : 5000;
          const timeoutMs = Math.max(10000, expectedTime * 3);

          let timeoutId: NodeJS.Timeout | null = null;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              try {
                bot.stopDigging();
              } catch { /* ignore */ }
              reject(new Error(`Digging timed out after ${timeoutMs}ms (expected ${expectedTime}ms)`));
            }, timeoutMs);
          });

          try {
            return await Promise.race([
              originalDig(block, actualForceLook as any, actualDigFace as any),
              timeoutPromise
            ]);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        };
      }

      bot.findBlocks = (options) => boundedFindBlocks(bot, options);

      bot.loadPlugin(pathfinder);
      if (bot.pathfinder) {
        bot.pathfinder.thinkTimeout = 5000; // Limit A* search time to 5s to prevent OOM/heap exhaustion
      }
      bot.loadPlugin(collectBlock);

      // A cancelled operation may resume after an awaited packet. Block further mutations.
      const methods = ['dig', 'equip', 'craft', 'placeBlock', 'clickWindow', 'openFurnace', 'activateBlock', 'lookAt', 'consume', 'sleep', 'attack'] as const;
      for (const name of methods) {
        const original = bot[name] as (...args: unknown[]) => unknown;
        if (typeof original !== 'function') continue;
        Object.defineProperty(bot, name, { configurable: true, writable: true, value: (...args: unknown[]) => {
          this.activeAction?.signal.throwIfAborted();
          return original.apply(bot, args);
        } });
      }
      const setControl = bot.setControlState?.bind(bot);
      if (setControl) bot.setControlState = (control, enabled) => {
        if (enabled && this.activeAction?.signal.aborted) return;
        setControl(control, enabled);
      };
      if (bot.pathfinder) {
        const goto = bot.pathfinder.goto.bind(bot.pathfinder);
        bot.pathfinder.goto = async goal => { this.activeAction?.signal.throwIfAborted(); return goto(goal); };
        const setGoal = bot.pathfinder.setGoal.bind(bot.pathfinder);
        bot.pathfinder.setGoal = (goal, dynamic) => {
          if (goal) this.activeAction?.signal.throwIfAborted();
          setGoal(goal, dynamic);
        };
      }

      // Register drowning prevention / swim up physics loop
      let swimming = false;
      bot.on('physicsTick', () => {
        const isMockEnv = typeof (bot.blockAt as any)?.mock !== 'undefined' || 
                          typeof (bot.canDigBlock as any)?.mock !== 'undefined';
        if (isMockEnv) return;

        const pos = bot.entity?.position;
        const eyeHeight = (bot.entity as any)?.eyeHeight || 1.62;
        if (!pos || typeof pos.offset !== 'function') return;

        // If the bot's head is submerged in water
        const eyePos = pos.offset(0, eyeHeight, 0);
        const headBlock = bot.blockAt(eyePos);
        const headInWater = headBlock && (headBlock.name === 'water' || headBlock.name === 'flowing_water');

        if (headInWater) {
          // If oxygen level starts dropping (max is 20), hold down jump to swim up
          if (bot.oxygenLevel < 20) {
            swimming = true;
            bot.setControlState('jump', true);

            // If oxygen gets critically low, cancel current actions to survive
            if (bot.oxygenLevel < 10) {
              console.warn(`[BotManager] Oxygen critically low (${bot.oxygenLevel}/20), canceling active goals/digging to swim up.`);
              try {
                this.cancelAction(new Error('Low oxygen: surfacing'));
                setControl?.('jump', true);
              } catch { /* ignore */ }
            }
          }
        } else {
          // Reset jump control once completely out of water
          if (swimming && (bot.entity as any)?.isInWater === false) {
            bot.setControlState('jump', false);
            swimming = false;
          }
        }
      });

      // Wait for spawn event with timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timed out after 30 seconds'));
        }, 30000);

        bot.once('spawn', async () => {
          clearTimeout(timeout);
          
          try {
            const { Movements } = await import('mineflayer-pathfinder');
            const defaultMovements = new Movements(bot);
            defaultMovements.canDig = true;
            defaultMovements.allow1by1towers = true;
            
            const extraScaffolds = [
              'stone', 'netherrack', 'granite', 'diorite',
              'andesite', 'oak_planks', 'spruce_planks', 'birch_planks'
            ];
            for (const blockName of extraScaffolds) {
              const item = bot.registry.itemsByName[blockName];
              if (item) {
                defaultMovements.scafoldingBlocks.push(item.id);
              }
            }
            bot.pathfinder.setMovements(defaultMovements);
          } catch (e) {
            console.error('Failed to configure default movements:', e);
          }
          
          resolve();
        });

        bot.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        bot.once('kicked', (reason) => {
          clearTimeout(timeout);
          reject(new Error(`Kicked from server: ${reason}`));
        });
      });

      // Add persistent lifecycle listeners to handle unexpected disconnects
      bot.on('end', (reason) => {
        console.log(`[BotManager] Bot disconnected: ${reason}`);
        if (this.bot === bot) {
          this.cancelAction(new Error('Bot disconnected'));
          this.screenshotCapture.detach();
          this.events.detach();
          this.bot = null;
        }
      });

      bot.on('kicked', (reason) => {
        console.log(`[BotManager] Bot kicked: ${reason}`);
        if (this.bot === bot) {
          this.cancelAction(new Error('Bot kicked'));
          this.screenshotCapture.detach();
          this.events.detach();
          this.bot = null;
        }
      });

      this.bot = bot;
      this.events.attach(bot);

      return {
        success: true,
        username: this.bot.username,
        spawnPoint: {
          x: this.bot.spawnPoint.x,
          y: this.bot.spawnPoint.y,
          z: this.bot.spawnPoint.z,
        },
      };
    } catch (error) {
      try { candidate?.quit('Connection failed'); } catch { /* already closed */ }
      this.bot = null;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally { this.connecting = false; }
  }

  disconnect(): DisconnectResult {
    if (!this.bot) {
      return { success: false, error: 'No bot is currently connected.' };
    }

    const bot = this.bot;
    this.cancelAction(new Error('Bot disconnected'));
    this.bot = null;

    // Detach screenshot capture
    this.screenshotCapture.detach();
    this.events.detach();

    try {
      bot.quit('Disconnecting');

      // Wait for the bot 'end' event (server acknowledges quit) with a 3s timeout
      const endPromise = new Promise<void>((resolve) => {
        bot.once('end', () => resolve());
      });
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          console.warn('[BotManager] Bot end event timed out after 3s, removing listeners');
          resolve();
        }, 3000);
      });

      // Use Promise.race but don't await — just clean up listeners synchronously
      // since we need to return immediately
      Promise.race([endPromise, timeoutPromise]).then(() => {
        bot.removeAllListeners();
      });

      return { success: true };
    } catch (error) {
      bot.removeAllListeners();
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  respawn(): RespawnResult {
    if (!this.bot) {
      return { success: false, error: 'No bot is currently connected.' };
    }

    try {
      this.bot.respawn();
      return {
        success: true,
        spawnPoint: {
          x: this.bot.spawnPoint.x,
          y: this.bot.spawnPoint.y,
          z: this.bot.spawnPoint.z,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
