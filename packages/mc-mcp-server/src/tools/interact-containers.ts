import type { Bot } from 'mineflayer';

/**
 * Safely opens a container block (e.g., crafting table, chest) and waits for its window to open.
 * Closes any already open window first.
 */
export async function openContainer(bot: Bot, containerBlock: any): Promise<boolean> {
    // Verify block still exists before attempting to activate
    const blockCheck = bot.blockAt(containerBlock.position);
    if (!blockCheck || blockCheck.type === 0) {
        console.log(`[interact-containers] Error: Block has disappeared before activation`);
        return false;
    }

    // Clear any existing window first to avoid conflicts
    if (bot.currentWindow) {
        try {
            await bot.closeWindow(bot.currentWindow);
            await new Promise(resolve => setTimeout(resolve, 50));
        } catch (e) {
            console.log(`[interact-containers] Could not close existing window: ${(e as any)?.message}`);
        }
    }

    // Activate the block and wait for window (combined operation)
    await bot.activateBlock(containerBlock);

    // Poll for window with shorter timeout (up to 500ms max)
    let windowOpened = false;
    for (let i = 0; i < 25; i++) {
        if (bot.currentWindow) {
            windowOpened = true;
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 20));
    }

    await new Promise(resolve => setTimeout(resolve, 50));
    return windowOpened;
}

/**
 * Safely closes any currently open window on the bot.
 */
export async function closeContainer(bot: Bot): Promise<void> {
    try {
        if (bot.currentWindow) {
            console.log(`[interact-containers] Closing window...`);
            await bot.closeWindow(bot.currentWindow);
            // Wait a moment for window to fully close
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log(`[interact-containers] Window closed`);
        }
    } catch (closeError) {
        console.log(`[interact-containers] Warning: Failed to close window: ${(closeError as any)?.message}`);
    }
}
