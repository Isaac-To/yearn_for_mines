import fs from 'fs';

const FORMATTER_PATH = "packages/mc-mcp-server/src/observation-formatter.ts";

const newContent = `import type { ContextFrame } from './observation-builder.js';
import type { EventNotification } from './events.js';

/**
 * Formats a ContextFrame object into a concise human-readable text string
 * suitable for inclusion in an LLM prompt.
 */
export function formatObservation(frame: ContextFrame, events?: EventNotification[]): string {
  const lines: string[] = [];

  if (frame.outcomeDescription) {
    lines.push('=== Outcome ===');
    lines.push(frame.outcomeDescription);
    lines.push('');
  }

  lines.push('=== Vital Stats ===');
  const hBar = formatBar(frame.vitalStats.health, 20, '█', '░');
  const fBar = formatBar(frame.vitalStats.food, 20, '█', '░');
  lines.push(\`Health: ${hBar} \${frame.vitalStats.health}/20\`);
  lines.push(\`Food:   ${fBar} \${frame.vitalStats.food}/20\`);
  if (frame.vitalStats.oxygen < 20) {
    const oBar = formatBar(frame.vitalStats.oxygen, 20, '█', '░');
    lines.push(\`Oxygen: ${oBar} \${frame.vitalStats.oxygen}/20\`);
  }
  const pos = frame.vitalStats.position;
  lines.push(\`Position: (\${pos.x}, \${pos.y}, \${pos.z}) | \${pos.dimension} | \${pos.biome}\`);
  lines.push('');

  lines.push('=== Inventory Summary ===');
  const itemEntries = Object.entries(frame.inventorySummary);
  if (itemEntries.length > 0) {
    const sorted = itemEntries.sort((a, b) => b[1] - a[1]);
    lines.push(sorted.map(([name, count]) => \`\${name}x\${count}\`).join(', '));
  } else {
    lines.push('(empty)');
  }
  lines.push('');

  lines.push('=== Points of Interest ===');
  if (frame.pointsOfInterest.length > 0) {
    for (const poi of frame.pointsOfInterest) {
      const dist = poi.distance.toFixed(1);
      const extra = poi.extra ? \` [\${poi.extra}]\` : '';
      lines.push(\`- \${poi.name} (\${poi.type}) at \${dist}m (\${poi.position.x}, \${poi.position.y}, \${poi.position.z})\${extra}\`);
    }
  } else {
    lines.push('(none nearby)');
  }

  if (events && events.length > 0 || (frame.recentEvents && frame.recentEvents.length > 0)) {
    lines.push('');
    lines.push('=== Recent Events ===');
    const evts = events || frame.recentEvents || [];
    for (const event of evts.slice(0, 10)) {
      lines.push(formatEvent(event));
    }
  }

  return lines.join('\\n');
}

function formatBar(current: number, max: number, filled: string, empty: string): string {
  const ratio = Math.max(0, Math.min(1, current / max));
  const filledCount = Math.round(ratio * 10);
  return filled.repeat(filledCount) + empty.repeat(Math.max(0, 10 - filledCount));
}

function formatEvent(event: any): string {
  return \`[\${new Date(event.timestamp).toLocaleTimeString()}] \${event.type}: \${event.message}\`;
}
`;

fs.writeFileSync(FORMATTER_PATH, newContent);
