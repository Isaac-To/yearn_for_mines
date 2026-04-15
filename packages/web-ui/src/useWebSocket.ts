import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Messages from the dashboard server.
 */
export interface ServerMessage {
  type: 'bot_status' | 'agent_step' | 'event' | 'agent_state' | 'error';
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
          return next.length > maxMessages ? next.slice(-maxMessages) : next;
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