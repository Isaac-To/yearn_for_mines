import React, { useState, useEffect } from 'react';
import type { ClientMessage } from './useWebSocket';

interface AgentControlPanelProps {
  connected: boolean;
  send: (msg: ClientMessage) => void;
  agentState?: string;
  currentGoal?: string | null;
}

const AgentControlPanel: React.FC<AgentControlPanelProps> = ({ connected, send, agentState = 'idle', currentGoal }) => {
  const [goal, setGoal] = useState('');
  const [defaultGoalLoaded, setDefaultGoalLoaded] = useState(false);

  // Load default goal from server config on mount
  useEffect(() => {
    if (defaultGoalLoaded) return;
    fetch('/api/agent-config')
      .then(res => res.json())
      .then((data: { defaultGoal?: string }) => {
        if (data.defaultGoal && !goal) {
          setGoal(data.defaultGoal);
        }
        setDefaultGoalLoaded(true);
      })
      .catch(() => {
        setDefaultGoalLoaded(true);
      });
  }, [defaultGoalLoaded, goal]);

  const isRunning = agentState === 'running';
  const isIdle = agentState === 'idle' || agentState === 'stopped';

  const handleStart = () => {
    if (!goal.trim()) return;
    send({ type: 'start_agent', data: { goal: goal.trim() } });
  };

  const handleStop = () => send({ type: 'stop_agent' });

  const handleNewGoal = () => {
    if (!goal.trim() || !isRunning) return;
    send({ type: 'set_goal', data: { goal: goal.trim() } });
  };

  const stateColor: Record<string, string> = {
    idle: '#888',
    running: '#2e7d32',
    paused: '#f9a825',
    stopped: '#c62828',
  };

  return (
    <div style={{ padding: '10px' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Agent Control</h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          display: 'inline-block',
          padding: '4px 10px',
          borderRadius: '4px',
          backgroundColor: stateColor[agentState] ?? '#888',
          fontSize: '13px',
        }}>
          {agentState.toUpperCase()}
        </div>

        {currentGoal && isRunning && (
          <div style={{ fontSize: '12px', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Goal: {currentGoal}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          value={goal}
          onChange={e => setGoal(e.target.value)}
          placeholder="Enter agent goal..."
          disabled={!connected}
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
          onKeyDown={e => {
            if (e.key === 'Enter') {
              if (isRunning) {
                handleNewGoal();
              } else {
                handleStart();
              }
            }
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {isIdle ? (
          <button
            onClick={handleStart}
            disabled={!connected || !goal.trim()}
            style={{
              padding: '6px 14px',
              backgroundColor: '#2e7d32',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              opacity: (!connected || !goal.trim()) ? 0.5 : 1,
            }}
          >
            ▶ Start
          </button>
        ) : (
          <>
            <button
              onClick={handleNewGoal}
              disabled={!connected || !goal.trim()}
              style={{
                padding: '6px 14px',
                backgroundColor: '#0277bd',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                opacity: (!connected || !goal.trim()) ? 0.5 : 1,
              }}
            >
              🔄 New Goal
            </button>

            <button
              onClick={handleStop}
              disabled={!connected}
              style={{
                padding: '6px 14px',
                backgroundColor: '#c62828',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                opacity: !connected ? 0.5 : 1,
              }}
            >
              ⏹ Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AgentControlPanel;