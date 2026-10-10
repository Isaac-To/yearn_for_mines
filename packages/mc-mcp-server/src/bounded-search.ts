import type { Bot, FindBlockOptions } from 'mineflayer';
import { Vec3 } from 'vec3';

/** Search loaded sections in distance order, retaining only the nearest requested matches. */
export function boundedFindBlocks(bot: Bot, options: FindBlockOptions): Vec3[] {
  const point = (options.point ?? bot.entity.position).floored();
  const game = bot.game as typeof bot.game & { minY: number; height: number };
  const radius = Math.min(128, Math.max(0, options.maxDistance ?? 16));
  const count = Math.min(128, Math.max(1, Math.floor(options.count ?? 1)));
  const ids = typeof options.matching === 'function' ? null
    : new Set(Array.isArray(options.matching) ? options.matching : [options.matching]);
  const sections: Array<{ x: number; y: number; z: number; distance: number }> = [];
  const axisDistance = (value: number, start: number) => Math.max(start - value, 0, value - start - 15);
  for (let x = Math.floor((point.x - radius) / 16); x <= Math.floor((point.x + radius) / 16); x++) {
    for (let z = Math.floor((point.z - radius) / 16); z <= Math.floor((point.z + radius) / 16); z++) {
      if (!bot.world.getColumn(x, z)) continue;
      const minY = Math.max(game.minY, Math.floor((point.y - radius) / 16) * 16);
      const maxY = Math.min(game.minY + game.height - 1, point.y + radius);
      for (let y = minY; y <= maxY; y += 16) {
        const distance = Math.hypot(axisDistance(point.x, x * 16), axisDistance(point.y, y), axisDistance(point.z, z * 16));
        if (distance <= radius) sections.push({ x: x * 16, y, z: z * 16, distance });
      }
    }
  }
  sections.sort((a, b) => a.distance - b.distance);
  const found: Array<{ position: Vec3; distance: number }> = [];
  const cursor = new Vec3(0, 0, 0);
  for (const section of sections) {
    if (found.length === count && section.distance > found[found.length - 1].distance) break;
    // Palette pruning is safe for numeric IDs; predicates always receive real world blocks.
    const column = bot.world.getColumn(section.x / 16, section.z / 16);
    const palette = (column as unknown as { sections?: Array<{ palette?: number[] } | null> })?.sections?.[(section.y - game.minY) / 16]?.palette;
    if (ids && palette && !palette.some((state: number) => ids.has(bot.registry.blocksByStateId[state]?.id))) continue;
    for (cursor.x = section.x; cursor.x < section.x + 16; cursor.x++) {
      for (cursor.y = section.y; cursor.y < section.y + 16; cursor.y++) {
        for (cursor.z = section.z; cursor.z < section.z + 16; cursor.z++) {
          const distance = cursor.distanceTo(point);
          if (distance > radius || (found.length === count && distance >= found[found.length - 1].distance)) continue;
          const block = bot.blockAt(cursor, options.useExtraInfo !== false);
          if (!block) continue;
          if (ids ? !ids.has(block.type) : typeof options.matching === 'function' && !options.matching(block)) continue;
          if (typeof options.useExtraInfo === 'function' && !options.useExtraInfo(block)) continue;
          found.push({ position: cursor.clone(), distance });
          found.sort((a, b) => a.distance - b.distance);
          if (found.length > count) found.pop();
        }
      }
    }
  }
  return found.map(entry => entry.position);
}
