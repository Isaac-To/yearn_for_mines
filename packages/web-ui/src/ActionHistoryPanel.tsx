import React from 'react';
import type { ServerMessage } from './useWebSocket';

interface ActionHistoryPanelProps {
  messages: ServerMessage[];
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function messageTypeLabel(type: ServerMessage['type']): string {
  switch (type) {
    case 'bot_status': return 'STATUS';
    case 'agent_step': return 'STEP';
    case 'event': return 'EVENT';
    case 'agent_state': return 'STATE';
    case 'error': return 'ERROR';
  }
}

function messageTypeColor(type: ServerMessage['type']): string {
  switch (type) {
    case 'bot_status': return '#5c6bc0';
    case 'agent_step': return '#2e7d32';
    case 'event': return '#f9a825';
    case 'agent_state': return '#0277bd';
    case 'error': return '#c62828';
  }
}

const ActionHistoryPanel: React.FC<ActionHistoryPanelProps> = ({ messages }) => {
  return (
    <div style={{ padding: '10px', maxHeight: '400px', overflow: 'auto' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Action History</h3>

      {messages.length === 0 && (
        <p style={{ color: '#888', fontSize: '13px' }}>No activity yet.</p>
      )}

      {messages.map((msg, i) => (
        <div
          key={i}
          style={{
            borderBottom: '1px solid #333',
            padding: '6px 0',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                backgroundColor: messageTypeColor(msg.type),
                color: '#fff',
                padding: '1px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: 'bold',
              }}
            >
              {messageTypeLabel(msg.type)}
            </span>
            <span style={{ color: '#888' }}>{formatTime(msg.timestamp)}</span>
          </div>

          {msg.type === 'agent_step' && (
            <div style={{ marginTop: '4px', marginLeft: '8px' }}>
              {(msg.data as any)?.toolCalls?.map((tc: any, j: number) => (
                <div key={j} style={{ color: '#80cbc4' }}>
                  {tc.name}({JSON.stringify(tc.args)})
                </div>
              ))}
              {(msg.data as any)?.toolResults?.map((tr: any, j: number) => (
                <div key={`r${j}`} style={{ color: tr.isError ? '#ef5350' : '#a5d6a7' }}>
                  {tr.name}: {tr.result.substring(0, 120)}
                  {tr.result.length > 120 ? '...' : ''}
                </div>
              ))}
            </div>
          )}

          {msg.type === 'error' && (
            <div style={{ marginTop: '4px', marginLeft: '8px', color: '#ef5350' }}>
              {JSON.stringify(msg.data)}
            </div>
          )}

          {msg.type === 'event' && (
            <div style={{ marginTop: '4px', marginLeft: '8px', color: '#fff176' }}>
              {typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data)}
            </div>
          )}

          {msg.type === 'agent_state' && (
            <div style={{ marginTop: '4px', marginLeft: '8px', color: '#81d4fa' }}>
              State: {(msg.data as any)?.state}
              {(msg.data as any)?.goal ? ` | Goal: ${(msg.data as any).goal}` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ActionHistoryPanel;