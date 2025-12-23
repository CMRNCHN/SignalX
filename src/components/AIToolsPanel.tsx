import React, { useState } from 'react';
import './AIToolsPanel.css';

interface AIToolsPanelProps {
  messages?: Array<{ content: string; sender: string }>;
  onAction?: (action: string, result: string) => void;
}

const AIToolsPanel: React.FC<AIToolsPanelProps> = ({ messages = [], onAction }) => {
  const [processing, setProcessing] = useState<string | null>(null);

  const handleAction = async (action: string) => {
    setProcessing(action);
    
    // Simulate AI processing (replace with actual AI API calls)
    setTimeout(() => {
      let result = '';
      
      switch (action) {
        case 'summarize':
          const recentMessages = messages.slice(-10).map(m => m.content).join(' ');
          result = `Summary: ${recentMessages.substring(0, 100)}${recentMessages.length > 100 ? '...' : ''}`;
          break;
        case 'extract':
          result = 'Action items:\n• Review messages\n• Follow up on pending items';
          break;
        case 'rewrite':
          const lastMessage = messages[messages.length - 1]?.content || '';
          result = `Rewritten: "${lastMessage}" → More professional version`;
          break;
        case 'lookup':
          result = 'Trackr lookup: Connect to Trackr API for pricing information';
          break;
        default:
          result = 'Action completed';
      }
      
      if (onAction) {
        onAction(action, result);
      }
      setProcessing(null);
    }, 1000);
  };

  const suggestions = [
    { 
      id: 'summarize',
      label: 'Summarize Conversation', 
      color: '#A9E8D9',
      disabled: messages.length === 0
    },
    { 
      id: 'extract',
      label: 'Extract Action Items', 
      color: '#A8D0FF',
      disabled: messages.length === 0
    },
    { 
      id: 'rewrite',
      label: 'Rewrite Message', 
      color: '#FFE8A3',
      disabled: messages.length === 0
    },
    { 
      id: 'lookup',
      label: 'Trackr Price Lookup', 
      color: '#FFB1A8',
      disabled: false
    }
  ];

  return (
    <div className="ai-tools-panel panel ai-tools-panel">
      <h2>AI Tools</h2>
      <div className="suggestions-list">
        {suggestions.map((sug) => (
          <button
            key={sug.id}
            className="suggestion-button"
            style={{ 
              backgroundColor: sug.color,
              opacity: sug.disabled ? 0.5 : 1,
              cursor: sug.disabled ? 'not-allowed' : 'pointer'
            }}
            onClick={() => !sug.disabled && !processing && handleAction(sug.id)}
            disabled={sug.disabled || !!processing}
          >
            {processing === sug.id ? 'Processing...' : sug.label}
          </button>
        ))}
      </div>
      {messages.length === 0 && (
        <div style={{ 
          fontSize: '0.75rem', 
          color: '#8D94A1', 
          marginTop: '12px',
          textAlign: 'center'
        }}>
          Start a conversation to use AI tools
        </div>
      )}
    </div>
  );
};

export default AIToolsPanel;