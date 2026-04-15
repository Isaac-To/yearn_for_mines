import React, { useState } from 'react';
import type { ClientMessage } from './useWebSocket';

interface AgentControlPanelProps {
  connected: boolean;
  send: (msg: ClientMessage) => void;
  agentState?: string;
}

const AgentControlPanel: React.FC<AgentControlPanelProps> = ({ connected, send, agentState = 'idle' }) => {
  const [goal, setGoal] = useState('');

  const handleStart = () => {
    if (!goal.trim()) return;
    send({ type: 'start_agent', data: { goal: goal.trim() } });
  };

  const handleStop = () => send({ type: 'stop_agent' });
  const handlePause = () => send({ type: 'pause_agent' });
  const handleResume = () => send({ type: 'resume_agent' });

  const stateColor: Record<string, string> = {
    idle: '#888',
    running: '#2e7d32',
    paused: '#f9a825',
    stopped: '#c62828',
  };

  return (
    <div style={{ padding: '10px' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Agent Control</h3>

      <div style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: '4px',
        backgroundColor: stateColor[agentState] ?? '#888',
        fontSize: '13px',
        marginBottom: '10px',
      }}>
        {agentState.toUpperCase()}
      </div>

      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          value={goal}
          onChange={e => setGoal(e.target.value)}
          placeholder="Enter agent goal..."
          disabled={!connected || agentState === 'running'}
          style={{
            width: '100%',
            padding: '8px',
            backgroundColor: '#2a2a2a',
            color: '#e0e0e0',
            border: '1px solid #555',
            borderRadius: '4px',
            fontSize: '13px',
            boxSizing: 'border-box',
          }}
          onKeyDown={e => { if (e.key === 'Enter') handleStart(); }}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={handleStart}
          disabled={!connected || !goal.trim() || agentState === 'running'}
          style={{
            padding: '6px 14px',
            backgroundColor: '#2e7d32',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            opacity: (!connected || !goal.trim() || agentState === 'running') ? 0.5 : 1,
          }}
        >
          Start
        </button>

        <button
          onClick={handlePause}
          disabled={!connected || agentState !== 'running'}
          style={{
            padding: '6px 14px',
            backgroundColor: '#f57f17',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            opacity: (!connected || agentState !== 'running') ? 0.5 : 1,
          }}
        >
          Pause
        </button>

        <button
          onClick={handleResume}
          disabled={!connected || agentState !== 'paused'}
          style={{
            padding: '6px 14px',
            backgroundColor: '#0277bd',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            opacity: (!connected || agentState !== 'paused') ? 0.5 : 1,
          }}
        >
          Resume
        </button>

        <button
          onClick={handleStop}
          disabled={!connected || agentState === 'idle'}
          style={{
            padding: '6px 14px',
            backgroundColor: '#c62828',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            opacity: (!connected || agentState === 'idle') ? 0.5 : 1,
          }}
        >
          Stop
        </button>
      </div>
    </div>
  );
};

export default AgentControlPanel;