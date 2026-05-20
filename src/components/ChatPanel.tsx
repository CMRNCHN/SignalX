import React, { useState, useRef, useEffect } from 'react';
import './ChatPanel.css';

export interface Message {
  id: number;
  sender: 'you' | 'ai' | 'contact';
  content: string;
  timestamp?: Date;
  senderNumber?: string;
  senderName?: string;
  recipient?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
}

interface Conversation {
  recipient: string;
  name: string;
  lastMessage: Message | null;
  unreadCount: number;
}

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  selectedRecipient?: string;
  isSending?: boolean;
  onClearMessages?: () => void;
  conversations?: Conversation[];
  onSelectConversation?: (recipient: string) => void;
  onToggleSearch?: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ 
  messages, 
  onSendMessage, 
  selectedRecipient,
  isSending = false,
  onClearMessages,
  conversations = [],
  onSelectConversation,
  onToggleSearch
}) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isSending) {
      onSendMessage(inputValue);
      setInputValue('');
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'sending': return '⏳';
      case 'sent': return '✓';
      case 'delivered': return '✓✓';
      case 'read': return '✓✓';
      default: return '';
    }
  };

  return (
    <div className="chat-panel panel chat-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <h2 style={{ margin: 0 }}>Conversation</h2>
          {conversations.length > 0 && (
            <div style={{ 
              display: 'flex', 
              gap: '4px', 
              overflowX: 'auto',
              flex: 1,
              minWidth: 0
            }}>
              {conversations.slice(0, 5).map((conv) => (
                <button
                  key={conv.recipient}
                  onClick={() => onSelectConversation?.(conv.recipient)}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    backgroundColor: selectedRecipient === conv.recipient ? '#272C33' : '#1E2227',
                    color: selectedRecipient === conv.recipient ? '#F3F4F6' : '#8D94A1',
                    border: '1px solid #3E4146',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s',
                  }}
                  title={conv.name}
                >
                  {conv.name.length > 10 ? conv.name.substring(0, 10) + '...' : conv.name}
                  {conv.unreadCount > 0 && (
                    <span style={{ 
                      marginLeft: '4px',
                      backgroundColor: '#FFB1A8',
                      color: '#1A1C1F',
                      borderRadius: '8px',
                      padding: '1px 4px',
                      fontSize: '0.65rem'
                    }}>
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {onToggleSearch && (
            <button
              onClick={onToggleSearch}
              style={{
                fontSize: '0.75rem',
                padding: '4px 8px',
                backgroundColor: '#2B3138',
                color: '#8D94A1',
                border: '1px solid #3E4146',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              title="Search (Cmd+K)"
            >
              🔍
            </button>
          )}
          {selectedRecipient && (
            <div style={{ 
              fontSize: '0.85rem', 
              color: '#8D94A1',
              backgroundColor: '#272C33',
              padding: '4px 8px',
              borderRadius: '6px'
            }}>
              To: {selectedRecipient}
            </div>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm('Clear all messages?')) {
                  if (onClearMessages) {
                    onClearMessages();
                  } else {
                    localStorage.removeItem('signalx_messages');
                    window.location.reload();
                  }
                }
              }}
              style={{
                fontSize: '0.75rem',
                padding: '4px 8px',
                backgroundColor: '#2B3138',
                color: '#8D94A1',
                border: '1px solid #3E4146',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#3E4146';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2B3138';
              }}
              title="Clear messages"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div style={{ color: '#8D94A1', textAlign: 'center', padding: '24px' }}>
            No messages yet. Start a conversation!
          </div>
        ) : (
          <>
            {messages.map(msg => {
              const formatTime = (date?: Date) => {
                if (!date) return '';
                const now = new Date();
                const diff = now.getTime() - date.getTime();
                const minutes = Math.floor(diff / 60000);
                const hours = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);
                
                if (minutes < 1) return 'just now';
                if (minutes < 60) return `${minutes}m ago`;
                if (hours < 24) return `${hours}h ago`;
                if (days < 7) return `${days}d ago`;
                return date.toLocaleDateString();
              };

              return (
                <div
                  key={msg.id}
                  className={`chat-message ${
                    msg.sender === 'you' 
                      ? 'chat-message-you' 
                      : msg.sender === 'ai'
                      ? 'chat-message-ai'
                      : 'chat-message-contact'
                  }`}
                >
                  {msg.sender === 'contact' && msg.senderName && (
                    <div style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 600, 
                      marginBottom: '4px',
                      opacity: 0.9
                    }}>
                      {msg.senderName}
                    </div>
                  )}
                  <div>{msg.content}</div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginTop: '4px'
                  }}>
                    {msg.timestamp && (
                      <div style={{ 
                        fontSize: '0.7rem', 
                        opacity: 0.7 
                      }}>
                        {formatTime(msg.timestamp)}
                      </div>
                    )}
                    {msg.sender === 'you' && msg.status && (
                      <div style={{ 
                        fontSize: '0.7rem', 
                        opacity: 0.7,
                        marginLeft: 'auto'
                      }}>
                        {getStatusIcon(msg.status)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder={
            selectedRecipient 
              ? `Message ${selectedRecipient}...` 
              : "Type: +1234567890: your message or select a contact"
          }
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isSending}
        />
        <button type="submit" disabled={isSending || !inputValue.trim()}>
          {isSending ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;