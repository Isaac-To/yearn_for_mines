import React from 'react';
import type { ServerMessage } from './useWebSocket';

const MemoryInspector: React.FC<{ messages: ServerMessage[] }> = ({ messages }) => {
  const operations = messages.filter(m => m.type === 'memory');
  const latest = operations.at(-1)?.data as { status?: { mode?: string; namespace?: string; availability?: string; hits?: number; reads?: number; writes?: number; pending?: number; lastError?: string } } | undefined;
  const status = latest?.status;
  return <div style={{ padding: '10px' }}>
    <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>Memory Inspector</h3>
    {!status && <p style={{ color: '#aaa' }}>No memory operations recorded yet. Start an agent run to check MemPalace.</p>}
    {status && <>
      <p>MemPalace: <strong>{status.availability}</strong> · {status.mode}</p>
      <p>Library: {status.namespace ?? 'none'}</p>
      <p>Retrieved: {status.hits ?? 0} · Inspected: {status.reads ?? 0} · Saved: {status.writes ?? 0} · Queued: {status.pending ?? 0}</p>
      {status.lastError && <p role="alert" style={{ color: '#ef9a9a' }}>{status.lastError}</p>}
    </>}
    <p style={{ fontSize: '12px', color: '#aaa' }}>Successes retain their actions and verification evidence. Failures and interrupted attempts are stored separately. Queued episodes upload when MemPalace reconnects on a later run.</p>
    {operations.length > 0 && <div>
      <h4>Memory Operations</h4>
      {operations.slice(-10).reverse().map((message, index) => {
        const event = message.data as { operation?: string; ids?: string[]; id?: string };
        return <details key={index} style={{ marginBottom: '6px', fontSize: '12px' }}>
          <summary>{event.operation ?? 'status'}{event.id ? ' · ' + event.id.slice(0, 8) : ''}{event.ids ? ' · ' + event.ids.length + ' matches' : ''}</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(message.data, null, 2)}</pre>
        </details>;
      })}
    </div>}
  </div>;
};

export default MemoryInspector;
