import type { Bot } from 'mineflayer';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { resolveTargetBlock } from './interact-helpers.js';
import { once } from 'node:events';

export async function handleEat(bot: Bot, item: string) {
  const invItem = bot.inventory.items().find(i => i.name === item);
  if (!invItem) return errorResult(`Cannot eat: no ${item} in inventory.`);
  await bot.equip(invItem, 'hand');
  await bot.consume();
  return textResult(`Ate ${item}.`);
}

export async function handleFish(bot: Bot) {
  const fishingRod = bot.inventory.items().find(i =>
    i.name.includes('fishing_rod') || i.name === 'fishing_rod'
  );
  if (!fishingRod) return errorResult('Cannot fish: no fishing rod in inventory.');
  await bot.equip(fishingRod, 'hand');
  await bot.fish();
  return textResult('Caught a fish.');
}

export async function handleSleep(bot: Bot, target: string | { x: number; y: number; z: number }) {
  const block = resolveTargetBlock(bot, target);
  if (!block || !block.name.includes('bed')) {
    return errorResult('Cannot sleep: bed not found. Target a bed block.');
  }
  await bot.sleep(block as any);
  await once(bot, 'wake');
  return textResult('Slept through the night.');
}

export async function handleSignEdit(bot: Bot, target: string | { x: number; y: number; z: number }, text: string, back?: boolean) {
  const block = resolveTargetBlock(bot, target);
  if (!block || !block.name.includes('sign')) {
    return errorResult('Cannot edit sign: sign not found.');
  }
  bot.updateSign(block, text, back);
  return textResult(`Updated sign at (${block.position.x}, ${block.position.y}, ${block.position.z}).`);
}