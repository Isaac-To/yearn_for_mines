import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Messages from the dashboard server.
 */
export interface ServerMessage {
  type: 'bot_status' | 'agent_step' | 'event' | 'agent_state' | 'memory' | 'error';
  data: unknown;
  timestamp: number;
}

/**
 * Messages sent to the dashboard server.
 */
export interface ClientMessage {
  type: 'start_agent' | 'stop_agent' | 'pause_agent' | 'resume_agent' | 'set_goal';
  data?: Record<string, unknown>;
}

export interface WebSocketState {
  connected: boolean;
  lastMessage: ServerMessage | null;
  messages: ServerMessage[];
  send: (msg: ClientMessage) => void;
}

/**
 * React hook for WebSocket connection to the dashboard server.
 * Buffers recent messages and provides a send function.
 */
export function useWebSocket(url: string, maxMessages: number = 100): WebSocketState {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);
  const [messages, setMessages] = useState<ServerMessage[]>([]);

  useEffect(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        setLastMessage(msg);
        setMessages(prev => {
          const next = [...prev, msg];
          if (next.length <= maxMessages) return next;
          // Keep the latest state snapshots visible even during long stretches of status polling.
          const sticky = ['agent_state', 'memory'].map(type => next.filter(m => m.type === type).at(-1))
            .filter((message): message is ServerMessage => Boolean(message)).slice(-maxMessages);
          const remaining = Math.max(0, maxMessages - sticky.length);
          const recent = remaining ? next.filter(message => !sticky.includes(message)).slice(-remaining) : [];
          return next.filter(message => sticky.includes(message) || recent.includes(message));
        });
      } catch {
        // Ignore malformed messages
      }
    };

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [url, maxMessages]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { connected, lastMessage, messages, send };
}
