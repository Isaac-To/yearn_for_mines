import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import MemoryInspector from '../MemoryInspector';
import type { ServerMessage } from '../useWebSocket';

describe('MemoryInspector', () => {
  it('shows an honest empty state before a run', () => {
    const { container } = render(<MemoryInspector messages={[]} />);
    expect(container.textContent).toContain('No memory operations recorded yet');
  });
  it('shows actual retrieval, persistence and queued-write counts', () => {
    const messages: ServerMessage[] = [{ type: 'memory', timestamp: 1, data: {
      operation: 'saved', id: 'episode-123', status: { mode: 'read-write', namespace: 'minecraft', availability: 'ready', hits: 4, reads: 2, writes: 1, pending: 0 },
    } }];
    const { container } = render(<MemoryInspector messages={messages} />);
    expect(container.textContent).toContain('ready');
    expect(container.textContent).toContain('Retrieved: 4');
    expect(container.textContent).toContain('Inspected: 2');
    expect(container.textContent).toContain('Saved: 1');
  });
  it('surfaces persistence failures rather than reporting saved memory', () => {
    const messages: ServerMessage[] = [{ type: 'memory', timestamp: 1, data: {
      operation: 'pending', status: { mode: 'read-write', availability: 'degraded', pending: 1, lastError: 'database offline' },
    } }];
    const { getByRole, container } = render(<MemoryInspector messages={messages} />);
    expect(getByRole('alert').textContent).toContain('database offline');
    expect(container.textContent).toContain('Queued: 1');
    expect(container.textContent).toContain('Saved: 0');
  });
  it('does not mistake Minecraft action text for memory operations', () => {
    const messages: ServerMessage[] = [{ type: 'agent_step', timestamp: 1, data: { content: 'mempalace' } }];
    const { container } = render(<MemoryInspector messages={messages} />);
    expect(container.textContent).not.toContain('Memory Operations');
  });
});
