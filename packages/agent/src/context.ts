import type { LlmMessage } from '@yearn-for-mines/shared';

/** Remove complete observation/assistant/tool turns; never split a tool-call batch. */
export function pruneHistory(messages: LlmMessage[], maxTokens: number): LlmMessage[] {
  const system = messages[0]?.role === 'system' ? [messages[0]] : [];
  const turns: LlmMessage[][] = [];
  for (const message of messages.slice(system.length)) {
    if (message.role === 'user' || turns.length === 0) turns.push([]);
    turns[turns.length - 1].push(message);
  }
  // Character estimate is conservative for prose, not a provider tokenizer guarantee.
  while (turns.length > 1 && JSON.stringify([...system, ...turns.flat()]).length > maxTokens * 3) turns.shift();
  return [...system, ...turns.flat()];
}

export function inventoryGoalMet(observation: string, targets: Record<string, number>): boolean {
  try {
    const state = JSON.parse(observation);
    if (state.connected !== true || !Array.isArray(state.inventory) || !Object.keys(targets).length) return false;
    const inventory: Record<string, number> = {};
    for (const item of state.inventory) inventory[item.name] = (inventory[item.name] ?? 0) + item.count;
    return Object.entries(targets).every(([name, count]) => Number.isInteger(count) && count > 0 && inventory[name] >= count);
  } catch { return false; }
}

export function actionSignature(calls: Array<{ name: string; args: Record<string, unknown> }>): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : value;
  return JSON.stringify(calls.map(({ name, args }) => ({ name, args: canonical(args) })));
}
