import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BotManager } from '../bot-manager.js';
import type { EventManager } from '../events.js';
import { textResult } from '@yearn-for-mines/shared';
import { buildObservation, getCraftableItems } from '../observation-builder.js';
import { formatObservation, truncateObservation } from '../observation-formatter.js';

export function registerObservationTool(server: McpServer, botManager: BotManager, eventManager: EventManager): void {
  server.registerTool(
    'get_observation',
    {
      title: 'Get Observation',
      description: 'Get a detailed text description of the bot\'s current world state: position, health, food, inventory, nearby blocks (within 4m), nearby entities (within 32m), nearby dropped items, craftable items, biome, time of day, weather, light level, and recent events. Always call this FIRST to understand your surroundings before deciding what to do.',
      inputSchema: {},
    },
    async () => {
      const bot = botManager.currentBot;
      if (!bot) {
        return textResult('Bot is not connected. Use bot_connect first.');
      }

      try {
        const frame = buildObservation(bot);

        // Include craftable items
        const craftableItems = getCraftableItems(bot);
        if (craftableItems.length > 0) {
          (frame as any).craftableItems = craftableItems;
        }

        // Flush recent events
        const events = eventManager.flush();

        // Format into readable text
        const formatted = formatObservation(frame, events);
        const truncated = truncateObservation(formatted, 3000);

        return textResult(truncated);
      } catch (error: any) {
        return textResult(`Failed to get observation: ${error.message}`);
      }
    }
  );

  server.registerTool(
    'get_inventory',
    {
      title: 'Get Inventory',
      description: 'Get a detailed listing of the bot\'s current inventory, including held item, armor, hotbar, and all storage slots.',
      inputSchema: {},
    },
    async () => {
      const bot = botManager.currentBot;
      if (!bot) {
        return textResult('Bot is not connected.');
      }

      try {
        const frame = buildObservation(bot);
        const lines: string[] = [];

        lines.push('=== Inventory ===');
        const entries = Object.entries(frame.inventorySummary);
        if (entries.length === 0) {
          lines.push('(empty)');
        } else {
          lines.push(...entries.sort((a, b) => b[1] - a[1]).map(([name, count]) => `  ${name} x${count}`));
        }

        lines.push('');

        // Held item
        const heldItem = bot.heldItem;
        if (heldItem) {
          const durability = heldItem.durabilityUsed !== undefined
            ? ` (${heldItem.durabilityUsed}/${heldItem.maxDurability ?? '?'} durability, ${heldItem.enchants?.length ? `enchants: ${heldItem.enchants.map((e: any) => e.name).join(', ')}` : 'no enchantments'})`
            : '';
          lines.push(`Held item: ${heldItem.name} x${heldItem.count}${durability}`);
        } else {
          lines.push('Held item: (empty hand)');
        }

        // Armor
        const armorSlots = bot.inventory.slots.slice(5, 9);
        const armorLabels = ['Feet', 'Legs', 'Chest', 'Head'];
        const armorItems = armorSlots.map((slot, i) => {
          if (!slot) return `  ${armorLabels[i]}: (empty)`;
          return `  ${armorLabels[i]}: ${slot.name} x${slot.count}`;
        });
        lines.push('Armor:');
        lines.push(...armorItems);

        // Craftable items
        const craftable = getCraftableItems(bot);
        if (craftable.length > 0) {
          lines.push('');
          lines.push('=== Craftable (with current inventory) ===');
          const withTable = craftable.filter(c => c.requiresCraftingTable);
          const withoutTable = craftable.filter(c => !c.requiresCraftingTable);
          if (withoutTable.length > 0) {
            lines.push(`2x2: ${withoutTable.map(c => c.displayName).join(', ')}`);
          }
          if (withTable.length > 0) {
            lines.push(`Table: ${withTable.map(c => c.displayName).join(', ')}`);
          }
        }

        return textResult(lines.join('\n'));
      } catch (error: any) {
        return textResult(`Failed to get inventory: ${error.message}`);
      }
    }
  );

  server.registerTool(
    'get_events',
    {
      title: 'Get Events',
      description: 'Get recent environmental events (block changes, entity spawns, sounds, damage, chat messages, weather changes) that have occurred around the bot since the last check.',
      inputSchema: {},
    },
    async () => {
      const bot = botManager.currentBot;
      if (!bot) {
        return textResult('Bot is not connected.');
      }

      try {
        const events = eventManager.flush();
        if (!events || events.length === 0) {
          return textResult('No recent events.');
        }

        const lines: string[] = ['=== Recent Events ==='];
        for (const event of events.slice(0, 20)) {
          const ts = new Date(event.timestamp).toLocaleTimeString();
          lines.push(`[${ts}] ${event.type}: ${event.data ? JSON.stringify(event.data) : ''}`);
        }

        return textResult(lines.join('\n'));
      } catch (error: any) {
        return textResult(`Failed to get events: ${error.message}`);
      }
    }
  );
}
