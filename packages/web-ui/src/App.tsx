import React from 'react';
import { useWebSocket } from './useWebSocket';
import BotStatusPanel from './BotStatusPanel';
import ActionHistoryPanel from './ActionHistoryPanel';
import AgentControlPanel from './AgentControlPanel';
import MemoryInspector from './MemoryInspector';
import ScreenshotView from './ScreenshotView';

const App: React.FC = () => {
  const wsUrl = `ws://${window.location.hostname}:8080`;
  const { connected, messages, send } = useWebSocket(wsUrl);

  // Extract current agent state from messages
  const agentState = messages
    .filter(m => m.type === 'agent_state')
    .map(m => (m.data as any)?.state as string)
    .pop() ?? 'idle';

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px' }}>Yearn for Mines</h1>
        <div style={{
          padding: '4px 10px',
          borderRadius: '4px',
          fontSize: '12px',
          backgroundColor: connected ? '#2e7d32' : '#c62828',
          color: '#fff',
        }}>
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <AgentControlPanel connected={connected} send={send} agentState={agentState} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <section style={{ border: '1px solid #444', borderRadius: '8px', overflow: 'hidden' }}>
          <BotStatusPanel messages={messages} />
        </section>

        <section style={{ border: '1px solid #444', borderRadius: '8px', overflow: 'hidden' }}>
          <ActionHistoryPanel messages={messages} />
        </section>

        <section style={{ border: '1px solid #444', borderRadius: '8px', overflow: 'hidden' }}>
          <MemoryInspector messages={messages} />
        </section>

        <section style={{ border: '1px solid #444', borderRadius: '8px', overflow: 'hidden' }}>
          <ScreenshotView messages={messages} />
        </section>
      </div>
    </div>
  );
};

export default App;