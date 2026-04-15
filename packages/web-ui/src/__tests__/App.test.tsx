import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import App from '../App';
import type { WebSocketState } from '../useWebSocket';

// Mock useWebSocket hook
const mockSend = vi.fn();
let mockWsState: WebSocketState = {
  connected: false,
  lastMessage: null,
  messages: [],
  send: mockSend,
};

vi.mock('../useWebSocket', () => ({
  useWebSocket: (_url: string) => mockWsState,
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWsState = {
      connected: false,
      lastMessage: null,
      messages: [],
      send: mockSend,
    };
  });

  it('should render the app title', () => {
    const { container } = render(<App />);
    expect(container.textContent).toContain('Yearn for Mines');
  });

  it('should show Disconnected when not connected', () => {
    mockWsState.connected = false;
    const { container } = render(<App />);
    expect(container.textContent).toContain('Disconnected');
  });

  it('should show Connected when connected', () => {
    mockWsState.connected = true;
    const { container } = render(<App />);
    expect(container.textContent).toContain('Connected');
  });

  it('should render AgentControlPanel with correct props', () => {
    mockWsState.connected = true;
    mockWsState.send = mockSend;
    const { container } = render(<App />);
    // AgentControlPanel renders the agent state badge
    expect(container.textContent).toContain('IDLE');
  });

  it('should render AgentControlPanel with running state from messages', () => {
    mockWsState.connected = true;
    mockWsState.messages = [{
      type: 'agent_state',
      data: { state: 'running' },
      timestamp: Date.now(),
    }];
    const { container } = render(<App />);
    expect(container.textContent).toContain('RUNNING');
  });

  it('should default agent state to idle when no agent_state messages', () => {
    mockWsState.messages = [];
    const { container } = render(<App />);
    expect(container.textContent).toContain('IDLE');
  });

  it('should extract the last agent state from messages', () => {
    mockWsState.messages = [
      { type: 'agent_state', data: { state: 'running' }, timestamp: Date.now() - 1000 },
      { type: 'agent_state', data: { state: 'paused' }, timestamp: Date.now() },
    ];
    const { container } = render(<App />);
    expect(container.textContent).toContain('PAUSED');
  });

  it('should render BotStatusPanel', () => {
    const { container } = render(<App />);
    expect(container.textContent).toContain('Bot Status');
  });

  it('should render ActionHistoryPanel', () => {
    const { container } = render(<App />);
    expect(container.textContent).toContain('Action History');
  });

  it('should render MemoryInspector', () => {
    const { container } = render(<App />);
    expect(container.textContent).toContain('Memory Inspector');
  });

  it('should render ScreenshotView', () => {
    const { container } = render(<App />);
    expect(container.textContent).toContain('Bot Perspective');
  });

  it('should pass messages to BotStatusPanel', () => {
    mockWsState.messages = [{
      type: 'bot_status',
      data: { observation: '=== Health & Status ===\nHealth: 20/20', connected: true },
      timestamp: Date.now(),
    }];
    const { container } = render(<App />);
    // BotStatusPanel should render the health info from the message
    expect(container.textContent).toContain('Health');
  });

  it('should pass messages to ActionHistoryPanel', () => {
    mockWsState.messages = [{
      type: 'agent_step',
      data: { toolCalls: [{ id: '1', name: 'dig_block', args: {} }] },
      timestamp: Date.now(),
    }];
    const { container } = render(<App />);
    expect(container.textContent).toContain('dig_block');
  });

  it('should pass messages to MemoryInspector', () => {
    mockWsState.messages = [{
      type: 'agent_step',
      data: { mempalace: 'store_skill' },
      timestamp: Date.now(),
    }];
    const { container } = render(<App />);
    expect(container.textContent).toContain('Memory Operations');
  });

  it('should pass messages to ScreenshotView', () => {
    mockWsState.messages = [{
      type: 'bot_status',
      data: { screenshot: 'base64data', observation: '' },
      timestamp: Date.now(),
    }];
    const { container } = render(<App />);
    // When screenshot data is present, img element should exist
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
  });
});