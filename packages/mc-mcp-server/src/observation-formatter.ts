import type { Observation, BlockObservation, EntityObservation, EnvironmentalHazard, DroppedItem, Item } from '@yearn-for-mines/shared';
import type { EventNotification } from './events.js';

/**
 * Formats an Observation object into a human-readable text string
 * suitable for inclusion in an LLM prompt.
 *
 * Priority ordering (most important first):
 * 1. Position, dimension, biome
 * 2. Health, food, oxygen (survival-critical)
 * 3. Threats (hostile entities nearby, environmental hazards)
 * 4. Active dig progress, attack cooldown
 * 5. Inventory and held item
 * 6. Nearby blocks and items
 * 7. Weather and time
 * 8. Status effects
 */
export function formatObservation(observation: Observation, events?: EventNotification[]): string {
  const lines: string[] = [];

  // Section 1: Position and World State
  lines.push('=== Position & World ===');
  lines.push(`Location: (${observation.position.x.toFixed(1)}, ${observation.position.y.toFixed(1)}, ${observation.position.z.toFixed(1)})`);
  lines.push(`Facing: yaw=${observation.position.yaw.toFixed(1)}, pitch=${observation.position.pitch.toFixed(1)}`);
  lines.push(`Dimension: ${observation.dimension} | Biome: ${observation.biome}`);
  lines.push(`On Ground: ${observation.position.yaw !== undefined ? 'yes' : 'unknown'}`);

  // Section 2: Health (survival-critical)
  lines.push('');
  lines.push('=== Health & Status ===');
  const healthBar = formatBar(observation.health.health, 20, '█', '░');
  const foodBar = formatBar(observation.health.food, 20, '█', '░');
  lines.push(`Health: ${healthBar} ${observation.health.health}/20`);
  lines.push(`Food:   ${foodBar} ${observation.health.food}/20 (saturation: ${observation.health.foodSaturation.toFixed(1)})`);
  if (observation.health.oxygenLevel < 20) {
    lines.push(`Oxygen: ${formatBar(observation.health.oxygenLevel, 20, '█', '░')} ${observation.health.oxygenLevel}/20`);
  }
  lines.push(`XP: Level ${observation.health.experienceLevel} (${(observation.health.experienceProgress * 100).toFixed(0)}%)`);
  lines.push(`Game Mode: ${observation.health.gameMode}`);
  if (observation.health.isSleeping) {
    lines.push('Currently: SLEEPING');
  }

  // Section 3: Threats (most important for survival)
  const threats = formatThreats(observation);
  if (threats.length > 0) {
    lines.push('');
    lines.push('⚠ THREATS ⚠');
    for (const threat of threats) {
      lines.push(threat);
    }
  }

  // Section 4: Combat State
  if (!observation.attackCooldown.ready) {
    lines.push('');
    lines.push(`Attack Cooldown: ${(observation.attackCooldown.progress * 100).toFixed(0)}% ready`);
  }
  if (observation.activeDig) {
    lines.push(`Digging: ${observation.activeDig.blockName} at (${observation.activeDig.position.x}, ${observation.activeDig.position.y}, ${observation.activeDig.position.z}) - ${(observation.activeDig.progress * 100).toFixed(0)}% complete`);
  }

  // Section 5: Held Item & Armor
  lines.push('');
  lines.push('=== Equipment ===');
  if (observation.heldItem) {
    const held = formatItem(observation.heldItem);
    lines.push(`Held: ${held}`);
  } else {
    lines.push('Held: (nothing)');
  }

  const armorPieces: string[] = [];
  if (observation.armor.helmet) armorPieces.push(`[${observation.armor.helmet}]`);
  if (observation.armor.chestplate) armorPieces.push(`[${observation.armor.chestplate}]`);
  if (observation.armor.leggings) armorPieces.push(`[${observation.armor.leggings}]`);
  if (observation.armor.boots) armorPieces.push(`[${observation.armor.boots}]`);
  if (armorPieces.length > 0) {
    lines.push(`Armor: ${armorPieces.join(' ')}`);
  }

  // Status Effects
  if (observation.statusEffects.length > 0) {
    const effects = observation.statusEffects
      .map(e => `${e.name} ${e.amplifier > 0 ? `Lv${e.amplifier + 1}` : ''} (${formatDuration(e.duration)})`)
      .join(', ');
    lines.push(`Effects: ${effects}`);
  }

  // Section 6: Inventory Summary
  lines.push('');
  lines.push('=== Inventory ===');
  if (observation.hotbar.length > 0) {
    const hotbarStr = observation.hotbar
      .map((item, i) => `${i}: ${formatItem(item)}`)
      .join(' | ');
    lines.push(`Hotbar: ${hotbarStr}`);
  }

  const itemEntries = Object.entries(observation.inventorySummary);
  if (itemEntries.length > 0) {
    // Show most relevant items first
    const sorted = itemEntries.sort((a, b) => b[1] - a[1]);
    lines.push(`Items: ${sorted.map(([name, count]) => `${name}x${count}`).join(', ')}`);
  }

  if (observation.craftableItems.length > 0 && observation.craftableItems.length <= 10) {
    lines.push(`Can Craft: ${observation.craftableItems.map(i => i.displayName).join(', ')}`);
  } else if (observation.craftableItems.length > 10) {
    lines.push(`Can Craft: ${observation.craftableItems.slice(0, 10).map(i => i.displayName).join(', ')} (+${observation.craftableItems.length - 10} more)`);
  }

  // Section 7: Nearby Entities
  lines.push('');
  lines.push('=== Nearby Entities ===');
  if (observation.nearbyEntities.length === 0) {
    lines.push('(none visible)');
  } else {
    for (const entity of observation.nearbyEntities) {
      const threatIcon = entity.hostility === 'always_hostile' ? '🔴' : entity.hostility === 'neutral' ? '🟡' : '🟢';
      const healthStr = entity.health !== undefined ? ` HP:${entity.health}/${entity.maxHealth ?? '?'}` : '';
      const stateStr = entity.behaviorState ? ` (${entity.behaviorState})` : '';
      const heldStr = entity.heldItem ? ` holding:${entity.heldItem}` : '';
      lines.push(`${threatIcon} ${entity.displayName}${healthStr} at ${formatDist(entity.distance)}${stateStr}${heldStr}`);
    }
  }

  // Section 8: Nearby Items
  if (observation.nearbyDroppedItems.length > 0) {
    lines.push('');
    lines.push('=== Dropped Items ===');
    for (const item of observation.nearbyDroppedItems) {
      lines.push(`📦 ${item.displayName} x${item.count} at ${formatDist(item.distance)}`);
    }
  }

  // Section 9: Nearby Blocks (abbreviated)
  if (observation.nearbyBlocks.length > 0) {
    lines.push('');
    lines.push('=== Nearby Blocks ===');
    // Group blocks by type for brevity
    const blockCounts: Record<string, number> = {};
    for (const block of observation.nearbyBlocks) {
      blockCounts[block.displayName] = (blockCounts[block.displayName] ?? 0) + 1;
    }
    const blockStrs = Object.entries(blockCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => count > 1 ? `${name}x${count}` : name);
    lines.push(blockStrs.join(', '));
    if (Object.keys(blockCounts).length > 10) {
      lines.push(`(+${Object.keys(blockCounts).length - 10} more types)`);
    }
  }

  // Section 10: Weather & Time
  lines.push('');
  lines.push('=== World ===');
  const timeStr = formatTimeOfDay(observation.timeOfDay);
  lines.push(`Time: ${timeStr} (${observation.timeOfDay.phase}) | Moon: ${formatMoonPhase(observation.timeOfDay.moonPhase)}`);
  const weatherParts: string[] = [];
  if (observation.weather.isRaining) weatherParts.push('🌧 Raining');
  if (observation.weather.isThundering) weatherParts.push('⛈ Thundering');
  if (weatherParts.length > 0) {
    lines.push(`Weather: ${weatherParts.join(' ')}`);
  } else {
    lines.push('Weather: Clear');
  }
  lines.push(`Light Level: ${observation.lightLevel}/15 | Ground Distance: ${observation.groundDistance}`);

  // Section 11: Event Enrichment
  if (events && events.length > 0) {
    lines.push('');
    lines.push('=== Recent Events ===');
    const botPos = observation.position;
    for (const event of events.slice(0, 20)) {
      lines.push(formatEvent(event, botPos));
    }
    if (events.length > 20) {
      lines.push(`(+${events.length - 20} more events)`);
    }
  }

  return lines.join('\n');
}

function formatBar(current: number, max: number, filled: string, empty: string): string {
  const ratio = current / max;
  const filledCount = Math.round(ratio * 10);
  return filled.repeat(filledCount) + empty.repeat(10 - filledCount);
}

function formatItem(item: Item): string {
  let str = item.displayName;
  if (item.count > 1) str += ` x${item.count}`;
  if (item.durability !== undefined && item.maxDurability !== undefined) {
    const pct = ((item.durability / item.maxDurability) * 100).toFixed(0);
    str += ` [${pct}%]`;
  }
  if (item.enchantments && item.enchantments.length > 0) {
    const enchStrs = item.enchantments.map(e => `${e.name}${e.level > 1 ? e.level : ''}`);
    str += ` <${enchStrs.join(', ')}>`;
  }
  return str;
}

function formatDist(distance: number): string {
  if (distance < 1) return '1m';
  if (distance < 10) return `${distance.toFixed(1)}m`;
  return `${Math.round(distance)}m`;
}

function formatDuration(ticks: number): string {
  if (ticks < 0) return '∞';
  const seconds = Math.floor(ticks / 20);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m${secs}s`;
}

function formatTimeOfDay(timeOfDay: Observation['timeOfDay']): string {
  const hours = Math.floor(timeOfDay.timeOfDay / 1000);
  const minutes = Math.floor((timeOfDay.timeOfDay % 1000) / 1000 * 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function formatMoonPhase(phase: number): string {
  const phases = ['🌕 Full', '🌖 Waning Gibbous', '🌗 Last Quarter', '🌘 Waning Crescent', '🌑 New', '🌒 Waxing Crescent', '🌓 First Quarter', '🌔 Waxing Gibbous'];
  return phases[phase] ?? `Phase ${phase}`;
}

function formatThreats(observation: Observation): string[] {
  const threats: string[] = [];

  // Hostile entities nearby
  const hostiles = observation.nearbyEntities.filter(e => e.hostility === 'always_hostile');
  if (hostiles.length > 0) {
    for (const entity of hostiles) {
      const health = entity.health !== undefined ? ` (HP:${entity.health}/${entity.maxHealth ?? '?'})` : '';
      const state = entity.behaviorState === 'attacking' ? ' ⚔ ATTACKING' : '';
      threats.push(`🔴 ${entity.displayName} at ${formatDist(entity.distance)}${health}${state}`);
    }
  }

  // Neutral entities that might attack
  const neutralAttacking = observation.nearbyEntities.filter(e => e.hostility === 'neutral' && e.behaviorState === 'attacking');
  for (const entity of neutralAttacking) {
    threats.push(`🟡 ${entity.displayName} at ${formatDist(entity.distance)} - ATTACKING`);
  }

  // Environmental hazards
  for (const hazard of observation.environmentalHazards) {
    const icon = hazard.severity === 'deadly' ? '💀' : hazard.severity === 'high' ? '🔴' : '🟡';
    threats.push(`${icon} ${hazard.type} at ${formatDist(hazard.distance)} (${hazard.severity})`);
  }

  return threats;
}

function formatEvent(event: EventNotification, botPos?: Observation['position']): string {
  const time = new Date(event.timestamp).toLocaleTimeString();

  // Helper to get direction from event position relative to bot
  const direction = (pos: { x: number; y: number; z: number } | null | undefined): string => {
    if (!pos || !botPos) return '';
    const dx = pos.x - botPos.x;
    const dz = pos.z - botPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1) return '';
    const angle = Math.atan2(-dx, dz) * (180 / Math.PI); // 0=South, 90=East, etc.
    const dirs = ['south', 'southwest', 'west', 'northwest', 'north', 'northeast', 'east', 'southeast'];
    const idx = Math.round(((angle + 360) % 360) / 45) % 8;
    return ` to the ${dirs[idx]}`;
  };

  switch (event.type) {
    case 'block_change':
      return `[${time}] Block changed: ${event.data.oldBlock ?? '?'} → ${event.data.newBlock ?? '?'} at (${event.data.position?.x}, ${event.data.position?.y}, ${event.data.position?.z})`;
    case 'entity_spawn': {
      const dir = direction(event.data.position);
      return `[${time}] ${event.data.name} spawned${dir} at (${event.data.position?.x?.toFixed(1)}, ${event.data.position?.y?.toFixed(1)}, ${event.data.position?.z?.toFixed(1)})`;
    }
    case 'entity_despawn':
      return `[${time}] ${event.data.name} despawned`;
    case 'entity_death': {
      const dir = direction(event.data.position);
      return `[${time}] ${event.data.name} died${dir} at (${event.data.position?.x?.toFixed(1)}, ${event.data.position?.y?.toFixed(1)}, ${event.data.position?.z?.toFixed(1)})`;
    }
    case 'entity_movement': {
      const dir = direction(event.data.position);
      return `[${time}] ${event.data.name} moved${dir} to (${event.data.position?.x}, ${event.data.position?.y}, ${event.data.position?.z})`;
    }
    case 'player_damage':
      return `[${time}] Took damage! HP: ${event.data.health}/20 | Food: ${event.data.food}/20`;
    case 'food_change':
      return `[${time}] Food changed: ${event.data.food}/20 (saturation: ${event.data.foodSaturation?.toFixed(1)})`;
    case 'experience_change':
      return `[${time}] XP: Level ${event.data.level} (${(event.data.progress * 100).toFixed(0)}%)`;
    case 'item_pickup':
      return `[${time}] Picked up ${event.data.count}x ${event.data.name}`;
    case 'weather_change':
      return `[${time}] Weather: ${event.data.isRaining ? 'Raining' : 'Clear'}${event.data.thunderState > 0 ? ' (Thundering)' : ''}`;
    case 'sound': {
      const dir = direction(event.data.position);
      return `[${time}] 🔊 Heard: ${event.data.name}${dir}${event.data.position ? ` from (${event.data.position.x}, ${event.data.position.y}, ${event.data.position.z})` : ''}`;
    }
    case 'particle': {
      const dir = direction(event.data.position);
      return `[${time}] ✨ ${event.data.name}${dir} at (${event.data.position?.x}, ${event.data.position?.y}, ${event.data.position?.z})`;
    }
    case 'chat':
      return `[${time}] 💬 <${event.data.username}> ${event.data.message}`;
    case 'kicked':
      return `[${time}] ⚠ Kicked from server: ${event.data.reason}`;
    case 'death':
      return `[${time}] 💀 You died at (${event.data.position?.x}, ${event.data.position?.y}, ${event.data.position?.z})`;
    case 'respawn':
      return `[${time}] ✨ Respawned at (${event.data.position?.x}, ${event.data.position?.y}, ${event.data.position?.z})`;
    default:
      return `[${time}] Unknown event: ${event.type}`;
  }
}

/**
 * Truncates an observation text to fit within a token limit.
 * Priority ordering ensures critical info is kept first.
 * Approximate: 1 token ≈ 4 characters.
 */
export function truncateObservation(text: string, maxTokens: number = 2000): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;

  // Split by sections (marked by === headers)
  const sections = text.split('\n=== ');
  const priorityOrder = [
    'Position & World',
    'Health & Status',
    'THREATS',
    'Equipment',
    'Nearby Entities',
    'Inventory',
    'Dropped Items',
    'Nearby Blocks',
    'World',
    'Recent Events',
  ];

  // Reassemble in priority order
  const sectionMap = new Map<string, string>();
  for (const section of sections) {
    const headerEnd = section.indexOf(' ===');
    if (headerEnd > 0) {
      const header = section.substring(0, headerEnd);
      sectionMap.set(header, '=== ' + section);
    } else {
      sectionMap.set('__header__', section);
    }
  }

  const result: string[] = [];
  let currentLength = 0;

  // Add header first
  const header = sectionMap.get('__header__');
  if (header) {
    result.push(header);
    currentLength += header.length;
  }

  // Add sections in priority order
  for (const priority of priorityOrder) {
    const section = sectionMap.get(priority);
    if (section && currentLength + section.length <= maxChars) {
      result.push(section);
      currentLength += section.length;
      sectionMap.delete(priority);
    }
  }

  // Add remaining sections that fit
  for (const [key, section] of sectionMap) {
    if (key === '__header__') continue;
    if (currentLength + section.length <= maxChars) {
      result.push(section);
      currentLength += section.length;
    }
  }

  const resultText = result.join('\n');
  if (resultText.length > maxChars) {
    return resultText.substring(0, maxChars - 3) + '...';
  }
  return resultText;
}