import React from 'react';
import type { ServerMessage } from './useWebSocket';

interface MemoryInspectorProps {
  messages: ServerMessage[];
}

interface MemoryData {
  skills?: Array<{ wing: string; room: string; label: string; content: string }>;
  knowledgeFacts?: Array<{ subject: string; predicate: string; object: string; room: string }>;
  diaryEntries?: Array<{ timestamp: number; entry: string; mood: string }>;
}

const MemoryInspector: React.FC<MemoryInspectorProps> = ({ messages }) => {
  // For now, memory data comes from agent_step messages that contain memory operations
  // In a full implementation, this would query MemPalace via a REST endpoint
  const memorySteps = messages.filter(
    m => m.type === 'agent_step' && JSON.stringify(m.data).includes('mempalace')
  );

  return (
    <div style={{ padding: '10px' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Memory Inspector</h3>

      {memorySteps.length === 0 && (
        <p style={{ color: '#888', fontSize: '13px' }}>No memory operations recorded yet.</p>
      )}

      <div style={{ marginBottom: '12px' }}>
        <h4 style={{ fontSize: '13px', color: '#aaa', margin: '0 0 6px 0' }}>Skill Wings</h4>
        <div style={{ fontSize: '12px', color: '#888' }}>
          minecraft-skills: wood-gathering, crafting, mining, navigation, combat, farming, survival
        </div>
        <div style={{ fontSize: '12px', color: '#888' }}>
          minecraft-knowledge: blocks, items, mobs, recipes, biomes, mechanics
        </div>
      </div>

      {memorySteps.length > 0 && (
        <div>
          <h4 style={{ fontSize: '13px', color: '#aaa', margin: '0 0 6px 0' }}>Memory Operations</h4>
          {memorySteps.map((msg, i) => (
            <div key={i} style={{
              fontSize: '12px',
              padding: '4px 8px',
              backgroundColor: '#252525',
              borderRadius: '4px',
              marginBottom: '4px',
            }}>
              {JSON.stringify(msg.data).substring(0, 200)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MemoryInspector;