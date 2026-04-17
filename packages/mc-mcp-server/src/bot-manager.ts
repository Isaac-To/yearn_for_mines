import { createBot } from 'mineflayer';
import type { Bot } from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin as collectBlock } from 'mineflayer-collectblock';
import type { BotConfig } from '@yearn-for-mines/shared';

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

  constructor(botFactory?: BotFactory) {
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

  setBot(bot: Bot): void {
    this.bot = bot;
  }

  async connect(config: BotConfig): Promise<ConnectResult> {
    if (this.bot) {
      return { success: false, error: 'Bot is already connected. Disconnect first.' };
    }

    try {
      const bot = this.botFactory(config);
      bot.loadPlugin(pathfinder);
      bot.loadPlugin(collectBlock);

      // Wait for spawn event with timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timed out after 30 seconds'));
        }, 30000);

        bot.once('spawn', () => {
          clearTimeout(timeout);
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

      this.bot = bot;

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
      this.bot = null;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  disconnect(): DisconnectResult {
    if (!this.bot) {
      return { success: false, error: 'No bot is currently connected.' };
    }

    const bot = this.bot;
    this.bot = null;

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