import React from 'react';
import type { ServerMessage } from './useWebSocket';

interface ScreenshotViewProps {
  messages: ServerMessage[];
}

const ScreenshotView: React.FC<ScreenshotViewProps> = ({ messages }) => {
  // Look for screenshot data in bot_status messages
  const screenshotData = messages
    .filter(m => m.type === 'bot_status' && (m.data as any)?.screenshot)
    .map(m => (m.data as any).screenshot as string)
    .pop();

  return (
    <div style={{ padding: '10px' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Bot Perspective</h3>

      {screenshotData ? (
        <img
          src={`data:image/png;base64,${screenshotData}`}
          alt="Bot perspective"
          style={{
            width: '100%',
            maxWidth: '640px',
            borderRadius: '4px',
            border: '1px solid #555',
          }}
        />
      ) : (
        <div style={{
          width: '100%',
          maxWidth: '640px',
          height: '240px',
          backgroundColor: '#252525',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#555',
          fontSize: '14px',
          border: '1px solid #333',
        }}>
          VLM screenshot not available
        </div>
      )}
    </div>
  );
};

export default ScreenshotView;