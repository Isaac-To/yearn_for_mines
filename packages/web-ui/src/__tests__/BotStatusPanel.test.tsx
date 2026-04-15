import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import BotStatusPanel from '../BotStatusPanel';
import type { ServerMessage } from '../useWebSocket';

describe('BotStatusPanel', () => {
  it('should show no bot connected when no messages', () => {
    const { container } = render(<BotStatusPanel messages={[]} />);
    expect(container.textContent).toContain('No bot connected');
  });

  it('should render health bar from observation', () => {
    const messages: ServerMessage[] = [{
      type: 'bot_status',
      data: { observation: '=== Health & Status ===\nHealth: ██████████ 20/20\nFood:   █████████░ 18/20' },
      timestamp: Date.now(),
    }];

    const { container } = render(<BotStatusPanel messages={messages} />);
    expect(container.textContent).toContain('Health');
    expect(container.textContent).toContain('Food');
  });

  it('should render position and biome', () => {
    const messages: ServerMessage[] = [{
      type: 'bot_status',
      data: {
        observation: '=== Position & World ===\nLocation: (100.0, 64.0, -200.0)\nDimension: overworld | Biome: plains',
        connected: true,
      },
      timestamp: Date.now(),
    }];

    const { container } = render(<BotStatusPanel messages={messages} />);
    expect(container.textContent).toContain('(100.0');
    expect(container.textContent).toContain('plains');
  });

  it('should show raw observation in details', () => {
    const messages: ServerMessage[] = [{
      type: 'bot_status',
      data: { observation: '=== Position & World ===\nLocation: (0, 64, 0)' },
      timestamp: Date.now(),
    }];

    const { container } = render(<BotStatusPanel messages={messages} />);
    expect(container.innerHTML).toContain('Raw Observation');
  });
});