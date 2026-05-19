import type { Bot } from 'mineflayer';
import { textResult, errorResult } from '@yearn-for-mines/shared';
import { findClosestMatches } from '../utils/string-match.js';
import {
  resolveTargetBlock,
  isContainerBlock,
  isFurnaceBlock,
} from './interact-helpers.js';

export async function handleUse(bot: Bot, target: string | { x: number; y: number; z: number }): Promise<any> {
  const targetBlock = resolveTargetBlock(bot, target);
  if (!targetBlock || targetBlock.name === 'air') {
    if (typeof target === 'string') {
      const blockType = bot.registry.blocksByName[target];
      if (!blockType) {
        const suggestions = findClosestMatches(target, Object.keys(bot.registry.blocksByName), 3);
        return errorResult(`Unknown block '${target}'. Did you mean: '${suggestions.join("', '")}'?`);
      }
    }
    return errorResult('Cannot use: Target not in range or not found.');
  }

  await bot.lookAt(targetBlock.position);

  if (isFurnaceBlock(targetBlock.name)) {
    const furnace = await bot.openFurnace(targetBlock);
    return textResult(`Opened ${targetBlock.name}. Input: ${furnace.inputItem()?.name ?? 'empty'}, Fuel: ${furnace.fuelItem()?.name ?? 'empty'}, Output: ${furnace.outputItem()?.name ?? 'empty'}.`);
  }

  if (targetBlock.name === 'brewing_stand') {
    await bot.activateBlock(targetBlock);
    return textResult(`Interacted with brewing_stand.`);
  }

  if (isContainerBlock(targetBlock.name)) {
    const container = await bot.openContainer(targetBlock);
    const contents = container.slots
      .filter((s: any) => s)
      .map((s: any) => `${s.name}x${s.count}`)
      .join(', ') || 'empty';
    container.close();
    return textResult(`Opened ${targetBlock.name}. Contents: ${contents}.`);
  }

  if (targetBlock.name === 'enchanting_table') {
    await bot.activateBlock(targetBlock);
    return textResult('Opened enchanting_table.');
  }

  if (targetBlock.name === 'anvil' || targetBlock.name === 'chipped_anvil' || targetBlock.name === 'damaged_anvil') {
    await bot.activateBlock(targetBlock);
    return textResult(`Opened ${targetBlock.name}.`);
  }

  await bot.activateBlock(targetBlock);
  return textResult(`Interacted with ${targetBlock.name}.`);
}

export async function handleDeposit(bot: Bot, item: string, amount: number, target: string | { x: number; y: number; z: number }): Promise<any> {
  const containerBlock = resolveTargetBlock(bot, target);
  if (!containerBlock) return errorResult('Cannot deposit: container not found.');
  if (!isContainerBlock(containerBlock.name) && !isFurnaceBlock(containerBlock.name)) {
    return errorResult(`Cannot deposit: ${containerBlock.name} is not a container or furnace.`);
  }
  const itemType = bot.registry.itemsByName[item];
  if (!itemType) {
    const suggestions = findClosestMatches(item, Object.keys(bot.registry.itemsByName), 3);
    return errorResult(`Unknown item '${item}'. Did you mean: '${suggestions.join("', '")}'?`);
  }

  if (isFurnaceBlock(containerBlock.name)) {
    const furnace = await bot.openFurnace(containerBlock);
    try {
      await furnace.putInput(itemType.id, null, amount);
      return textResult(`Deposited ${amount}x ${item} as input into ${containerBlock.name}.`);
    } finally {
      furnace.close();
    }
  }

  const chest = await bot.openContainer(containerBlock);
  try {
    await chest.deposit(itemType.id, null, amount);
    return textResult(`Deposited ${amount}x ${item} into ${containerBlock.name}.`);
  } finally {
    chest.close();
  }
}

export async function handleWithdraw(bot: Bot, item: string, amount: number, target: string | { x: number; y: number; z: number }): Promise<any> {
  const containerBlock = resolveTargetBlock(bot, target);
  if (!containerBlock) return errorResult('Cannot withdraw: container not found.');
  if (!isContainerBlock(containerBlock.name) && !isFurnaceBlock(containerBlock.name)) {
    return errorResult(`Cannot withdraw: ${containerBlock.name} is not a container or furnace.`);
  }
  const itemType = bot.registry.itemsByName[item];
  if (!itemType) {
    const suggestions = findClosestMatches(item, Object.keys(bot.registry.itemsByName), 3);
    return errorResult(`Unknown item '${item}'. Did you mean: '${suggestions.join("', '")}'?`);
  }

  if (isFurnaceBlock(containerBlock.name)) {
    const furnace = await bot.openFurnace(containerBlock);
    try {
      await furnace.takeOutput();
      return textResult(`Withdrew output from ${containerBlock.name}.`);
    } finally {
      furnace.close();
    }
  }

  const chest = await bot.openContainer(containerBlock);
  try {
    await chest.withdraw(itemType.id, null, amount);
    return textResult(`Withdrew ${amount}x ${item} from ${containerBlock.name}.`);
  } finally {
    chest.close();
  }
}