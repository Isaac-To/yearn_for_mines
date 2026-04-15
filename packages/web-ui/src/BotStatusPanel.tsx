import React from 'react';
import type { ServerMessage } from './useWebSocket';

interface BotStatusPanelProps {
  messages: ServerMessage[];
}

interface BotStatusData {
  observation?: string;
  connected?: boolean;
}

function ProgressBar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
        <span>{label}</span>
        <span>{value}/{max}</span>
      </div>
      <div style={{ backgroundColor: '#333', borderRadius: '3px', height: '14px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

/**
 * Parse observation text into structured fields for display.
 */
function parseObservation(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = text.split('\n');
  let currentSection = '';

  for (const line of lines) {
    if (line.startsWith('=== ') && line.endsWith(' ===')) {
      currentSection = line.replace(/=== /g, '').trim();
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      fields[`${currentSection}.${key}`] = value;
      fields[key] = value;
    }
  }

  return fields;
}

const BotStatusPanel: React.FC<BotStatusPanelProps> = ({ messages }) => {
  const statusMsg = messages
    .filter(m => m.type === 'bot_status')
    .pop() as ServerMessage | undefined;

  const data = (statusMsg?.data as BotStatusData) ?? {};
  const obs = data.observation ?? '';
  const fields = obs ? parseObservation(obs) : {};
  const connected = data.connected ?? false;

  const health = parseInt(fields['Health']?.split('/')[0] ?? '0', 10) || 0;
  const food = parseInt(fields['Food']?.split('/')[0]?.trim() ?? '0', 10) || 0;

  return (
    <div style={{ padding: '10px' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Bot Status</h3>

      {!connected && !obs && (
        <p style={{ color: '#888', fontSize: '13px' }}>No bot connected</p>
      )}

      {obs && (
        <>
          <ProgressBar value={health} max={20} label="Health" color="#c62828" />
          <ProgressBar value={food} max={20} label="Food" color="#f9a825" />

          {fields['Location'] && (
            <div style={{ fontSize: '13px', marginTop: '8px' }}>
              <strong>Position:</strong> {fields['Location']}
            </div>
          )}

          {fields['Dimension'] && (
            <div style={{ fontSize: '13px' }}>
              <strong>Dimension:</strong> {fields['Dimension']}
            </div>
          )}

          {fields['Biome'] && (
            <div style={{ fontSize: '13px' }}>
              <strong>Biome:</strong> {fields['Biome']}
            </div>
          )}

          {fields['Time'] && (
            <div style={{ fontSize: '13px' }}>
              <strong>Time:</strong> {fields['Time']}
            </div>
          )}

          {fields['Weather'] && (
            <div style={{ fontSize: '13px' }}>
              <strong>Weather:</strong> {fields['Weather']}
            </div>
          )}

          {fields['Held'] && (
            <div style={{ fontSize: '13px', marginTop: '8px' }}>
              <strong>Held:</strong> {fields['Held']}
            </div>
          )}

          <details style={{ marginTop: '10px', fontSize: '12px' }}>
            <summary style={{ cursor: 'pointer', color: '#aaa' }}>Raw Observation</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11px', maxHeight: '200px', overflow: 'auto' }}>
              {obs}
            </pre>
          </details>
        </>
      )}
    </div>
  );
};

export default BotStatusPanel;