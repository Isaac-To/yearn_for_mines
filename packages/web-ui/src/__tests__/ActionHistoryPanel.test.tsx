import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ActionHistoryPanel from '../ActionHistoryPanel';
import type { ServerMessage } from '../useWebSocket';

describe('ActionHistoryPanel', () => {
  it('should show no activity when empty', () => {
    const { container } = render(<ActionHistoryPanel messages={[]} />);
    expect(container.textContent).toContain('No activity yet');
  });

  it('should render agent step messages', () => {
    const messages: ServerMessage[] = [{
      type: 'agent_step',
      data: {
        toolCalls: [{ id: '1', name: 'dig_block', args: { x: 10 } }],
        toolResults: [{ name: 'dig_block', result: 'Success', isError: false }],
      },
      timestamp: Date.now(),
    }];

    const { container } = render(<ActionHistoryPanel messages={messages} />);
    expect(container.textContent).toContain('dig_block');
    expect(container.textContent).toContain('Success');
  });

  it('should highlight errors in red', () => {
    const messages: ServerMessage[] = [{
      type: 'agent_step',
      data: {
        toolCalls: [{ id: '1', name: 'pathfind_to', args: {} }],
        toolResults: [{ name: 'pathfind_to', result: 'No path found', isError: true }],
      },
      timestamp: Date.now(),
    }];

    const { container } = render(<ActionHistoryPanel messages={messages} />);
    expect(container.textContent).toContain('No path found');
  });

  it('should render agent state changes', () => {
    const messages: ServerMessage[] = [{
      type: 'agent_state',
      data: { state: 'running', goal: 'gather wood' },
      timestamp: Date.now(),
    }];

    const { container } = render(<ActionHistoryPanel messages={messages} />);
    expect(container.textContent).toContain('running');
    expect(container.textContent).toContain('gather wood');
  });

  it('should render error messages', () => {
    const messages: ServerMessage[] = [{
      type: 'error',
      data: 'Connection lost',
      timestamp: Date.now(),
    }];

    const { container } = render(<ActionHistoryPanel messages={messages} />);
    expect(container.textContent).toContain('Connection lost');
  });
});