import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { textResult, errorResult } from '@yearn-for-mines/shared';

export async function handleDig(bot: Bot, target: { x: number; y: number; z: number }) {
  const pos = new Vec3(target.x, target.y, target.z);
  const block = bot.blockAt(pos);
  if (!block || block.name === 'air') {
    return errorResult(`Cannot dig: No block at ${pos.x}, ${pos.y}, ${pos.z}.`);
  }
  await bot.dig(block);
  return textResult(`Successfully dug ${block.name} at ${pos.x}, ${pos.y}, ${pos.z}.`);
}

export async function handlePlace(bot: Bot, item: string, target: { x: number; y: number; z: number }) {
  const invItem = bot.inventory.items().find(i => i.name === item);
  if (!invItem) {
    return errorResult(`No ${item} in inventory. Available items: ${bot.inventory.items().map(i => i.name).join(', ') || '(empty)'}`);
  }
  const pos = new Vec3(target.x, target.y, target.z);
  const referenceBlock = bot.blockAt(new Vec3(pos.x, pos.y - 1, pos.z));
  if (!referenceBlock || referenceBlock.name === 'air') {
    return errorResult(`Cannot place ${item}: need a solid block below target position to attach to.`);
  }
  await bot.equip(invItem, 'hand');
  await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
  return textResult(`Successfully placed ${item} at ${pos.x}, ${pos.y}, ${pos.z}.`);
}