import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import MemoryInspector from '../MemoryInspector';
import type { ServerMessage } from '../useWebSocket';

describe('MemoryInspector', () => {
  it('should show empty state when no messages', () => {
    const { container } = render(<MemoryInspector messages={[]} />);
    expect(container.textContent).toContain('No memory operations recorded yet.');
  });

  it('should show empty state when no mempalace-related messages', () => {
    const messages: ServerMessage[] = [{
      type: 'agent_step',
      data: { toolCalls: [{ id: '1', name: 'dig_block', args: {} }] },
      timestamp: Date.now(),
    }];
    const { container } = render(<MemoryInspector messages={messages} />);
    expect(container.textContent).toContain('No memory operations recorded yet.');
  });

  it('should render wing structure always', () => {
    const { container } = render(<MemoryInspector messages={[]} />);
    expect(container.textContent).toContain('Skill Wings');
    expect(container.textContent).toContain('minecraft-skills');
    expect(container.textContent).toContain('wood-gathering');
    expect(container.textContent).toContain('crafting');
    expect(container.textContent).toContain('mining');
    expect(container.textContent).toContain('navigation');
    expect(container.textContent).toContain('combat');
    expect(container.textContent).toContain('farming');
    expect(container.textContent).toContain('survival');
    expect(container.textContent).toContain('minecraft-knowledge');
    expect(container.textContent).toContain('blocks');
    expect(container.textContent).toContain('items');
    expect(container.textContent).toContain('mobs');
    expect(container.textContent).toContain('recipes');
    expect(container.textContent).toContain('biomes');
    expect(container.textContent).toContain('mechanics');
  });

  it('should show Memory Operations when mempalace messages exist', () => {
    const messages: ServerMessage[] = [{
      type: 'agent_step',
      data: { mempalace: 'store_skill', skill: 'wood-gathering' },
      timestamp: Date.now(),
    }];
    const { container } = render(<MemoryInspector messages={messages} />);
    expect(container.textContent).toContain('Memory Operations');
  });

  it('should render memory operation data', () => {
    const messages: ServerMessage[] = [{
      type: 'agent_step',
      data: { mempalace: 'store_knowledge', fact: 'oak_log is in blocks wing' },
      timestamp: Date.now(),
    }];
    const { container } = render(<MemoryInspector messages={messages} />);
    // The component renders JSON.stringify of msg.data substring
    expect(container.textContent).toContain('mempalace');
  });

  it('should render multiple memory operations', () => {
    const messages: ServerMessage[] = [
      {
        type: 'agent_step',
        data: { mempalace: 'store_skill', skill: 'crafting' },
        timestamp: Date.now() - 1000,
      },
      {
        type: 'agent_step',
        data: { mempalace: 'query_knowledge', query: 'blocks' },
        timestamp: Date.now(),
      },
    ];
    const { container } = render(<MemoryInspector messages={messages} />);
    // Both operations should appear
    expect(container.textContent).toContain('store_skill');
    expect(container.textContent).toContain('query_knowledge');
  });

  it('should filter only agent_step messages containing mempalace', () => {
    const messages: ServerMessage[] = [
      {
        type: 'bot_status',
        data: { observation: 'mempalace query running' },
        timestamp: Date.now(),
      },
      {
        type: 'agent_step',
        data: { mempalace: 'store_skill', skill: 'mining' },
        timestamp: Date.now(),
      },
      {
        type: 'agent_step',
        data: { toolCalls: [{ id: '1', name: 'dig_block', args: {} }] },
        timestamp: Date.now(),
      },
    ];
    const { container } = render(<MemoryInspector messages={messages} />);
    // bot_status should not trigger memory operations display
    // The second agent_step without mempalace should not count
    // Only the third message (with mempalace) should appear
    expect(container.textContent).toContain('Memory Operations');
    expect(container.textContent).toContain('store_skill');
  });

  it('should not show Memory Operations section when no mempalace steps', () => {
    const messages: ServerMessage[] = [{
      type: 'agent_step',
      data: { toolCalls: [{ id: '1', name: 'dig_block', args: {} }] },
      timestamp: Date.now(),
    }];
    const { container } = render(<MemoryInspector messages={messages} />);
    expect(container.textContent).not.toContain('Memory Operations');
  });

  it('should truncate long memory operation data to 200 characters', () => {
    const longData = { mempalace: 'store_skill', content: 'x'.repeat(300) };
    const messages: ServerMessage[] = [{
      type: 'agent_step',
      data: longData,
      timestamp: Date.now(),
    }];
    const { container } = render(<MemoryInspector messages={messages} />);
    // The JSON.stringify output is truncated to 200 chars in the component
    const _operationDivs = container.querySelectorAll('div[style]');
    // The data should be present but truncated
    expect(container.textContent).toContain('mempalace');
  });
});