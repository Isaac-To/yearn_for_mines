import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';
import type { ServerMessage } from '../useWebSocket';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readyState: number = MockWebSocket.CONNECTING;
  sentMessages: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    // Don't auto-open — tests control when to open
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Helper to simulate server messages
  simulateMessage(msg: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

// Replace global WebSocket with mock
const originalWebSocket = global.WebSocket;

beforeEach(() => {
  MockWebSocket.instances = [];
  global.WebSocket = MockWebSocket as any;
});

describe('useWebSocket', () => {
  it('should start disconnected', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));
    expect(result.current.connected).toBe(false);
  });

  it('should connect to WebSocket', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

    await act(() => {
      MockWebSocket.instances[0].open();
    });

    expect(result.current.connected).toBe(true);
  });

  it('should receive and buffer messages', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

    await act(() => {
      MockWebSocket.instances[0].open();
    });

    const msg: ServerMessage = {
      type: 'bot_status',
      data: { observation: 'Health: 20/20' },
      timestamp: Date.now(),
    };

    await act(() => {
      MockWebSocket.instances[0].simulateMessage(msg);
    });

    expect(result.current.lastMessage).toEqual(msg);
    expect(result.current.messages).toHaveLength(1);
  });

  it('should limit message buffer size', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8080', 3));

    await act(() => {
      MockWebSocket.instances[0].open();
    });

    // Send 5 messages
    for (let i = 0; i < 5; i++) {
      await act(() => {
        MockWebSocket.instances[0].simulateMessage({
          type: 'event',
          data: `event ${i}`,
          timestamp: Date.now(),
        });
      });
    }

    expect(result.current.messages).toHaveLength(3);
  });

  it('should send messages through WebSocket', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

    await act(() => {
      MockWebSocket.instances[0].open();
    });

    act(() => {
      result.current.send({ type: 'start_agent', data: { goal: 'test' } });
    });

    expect(MockWebSocket.instances[0].sentMessages).toHaveLength(1);
    expect(JSON.parse(MockWebSocket.instances[0].sentMessages[0])).toEqual({
      type: 'start_agent',
      data: { goal: 'test' },
    });
  });

  it('should not send when WebSocket is not open', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

    // WebSocket is in CONNECTING state, not OPEN
    act(() => {
      result.current.send({ type: 'stop_agent' });
    });

    expect(MockWebSocket.instances[0].sentMessages).toHaveLength(0);
  });

  it('should handle connection close', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

    await act(() => {
      MockWebSocket.instances[0].open();
    });

    expect(result.current.connected).toBe(true);

    await act(() => {
      MockWebSocket.instances[0].close();
    });

    expect(result.current.connected).toBe(false);
  });

  it('should ignore malformed messages', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

    await act(() => {
      MockWebSocket.instances[0].open();
    });

    await act(() => {
      MockWebSocket.instances[0].onmessage?.({ data: 'not json' });
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it('should close WebSocket on unmount', async () => {
    const { unmount } = renderHook(() => useWebSocket('ws://localhost:8080'));

    await act(() => {
      MockWebSocket.instances[0].open();
    });

    const closeSpy = vi.spyOn(MockWebSocket.instances[0], 'close');
    unmount();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('should handle WebSocket error', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

    await act(() => {
      MockWebSocket.instances[0].open();
    });

    expect(result.current.connected).toBe(true);

    await act(() => {
      MockWebSocket.instances[0].onerror?.({} as Event);
    });

    expect(result.current.connected).toBe(false);
  });
});