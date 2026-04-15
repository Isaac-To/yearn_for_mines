import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ScreenshotView from '../ScreenshotView';
import type { ServerMessage } from '../useWebSocket';

describe('ScreenshotView', () => {
  it('should show placeholder when no messages', () => {
    const { container } = render(<ScreenshotView messages={[]} />);
    expect(container.textContent).toContain('VLM screenshot not available');
  });

  it('should show placeholder when no bot_status messages', () => {
    const messages: ServerMessage[] = [{
      type: 'agent_step',
      data: { toolCalls: [] },
      timestamp: Date.now(),
    }];
    const { container } = render(<ScreenshotView messages={messages} />);
    expect(container.textContent).toContain('VLM screenshot not available');
  });

  it('should show placeholder when bot_status has no screenshot', () => {
    const messages: ServerMessage[] = [{
      type: 'bot_status',
      data: { observation: 'Health: 20/20', connected: true },
      timestamp: Date.now(),
    }];
    const { container } = render(<ScreenshotView messages={messages} />);
    expect(container.textContent).toContain('VLM screenshot not available');
  });

  it('should render img when screenshot data is provided', () => {
    const messages: ServerMessage[] = [{
      type: 'bot_status',
      data: { screenshot: 'iVBORw0KGgoAAAANSUhEUg==', observation: '' },
      timestamp: Date.now(),
    }];
    const { container } = render(<ScreenshotView messages={messages} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
    expect(img?.getAttribute('alt')).toBe('Bot perspective');
  });

  it('should use the last screenshot from multiple bot_status messages', () => {
    const messages: ServerMessage[] = [
      {
        type: 'bot_status',
        data: { screenshot: 'firstScreenshot', observation: '' },
        timestamp: Date.now() - 1000,
      },
      {
        type: 'bot_status',
        data: { screenshot: 'latestScreenshot', observation: '' },
        timestamp: Date.now(),
      },
    ];
    const { container } = render(<ScreenshotView messages={messages} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,latestScreenshot');
  });

  it('should show placeholder when screenshot field is falsy', () => {
    const messages: ServerMessage[] = [{
      type: 'bot_status',
      data: { screenshot: null, observation: '' },
      timestamp: Date.now(),
    }];
    const { container } = render(<ScreenshotView messages={messages} />);
    expect(container.textContent).toContain('VLM screenshot not available');
  });

  it('should show placeholder when screenshot field is empty string', () => {
    const messages: ServerMessage[] = [{
      type: 'bot_status',
      data: { screenshot: '', observation: '' },
      timestamp: Date.now(),
    }];
    const { container } = render(<ScreenshotView messages={messages} />);
    // Empty string is falsy in JS, so placeholder should show
    expect(container.textContent).toContain('VLM screenshot not available');
  });

  it('should render the section header', () => {
    const { container } = render(<ScreenshotView messages={[]} />);
    expect(container.textContent).toContain('Bot Perspective');
  });

  it('should ignore screenshot data in non-bot_status messages', () => {
    const messages: ServerMessage[] = [{
      type: 'agent_step',
      data: { screenshot: 'someData' },
      timestamp: Date.now(),
    }];
    const { container } = render(<ScreenshotView messages={messages} />);
    expect(container.textContent).toContain('VLM screenshot not available');
  });
});