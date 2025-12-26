/**
 * Accessible ChatPanel - Complete Integration Example
 * Shows how to apply all accessibility features to a real component
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  // Hooks
  useAnnounceListChanges,
  useAnnounceLoading,
  useKeyboardShortcut,
  useEscapeKey,
  
  // Utilities
  announce,
  announcements,
  
  // Components
  FormField,
  TextArea,
  AccessibleMenu,
  Tooltip,
  
  // Types
  MenuItem,
} from '../utils/a11y';

interface Message {
  id: string;
  sender: 'you' | 'contact';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'failed';
}

interface AccessibleChatPanelProps {
  messages: Message[];
  contactName: string;
  contactNumber: string;
  onSendMessage: (content: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onClearChat?: () => Promise<void>;
  isLoading?: boolean;
  isSending?: boolean;
}

export const AccessibleChatPanel: React.FC<AccessibleChatPanelProps> = ({
  messages,
  contactName,
  contactNumber,
  onSendMessage,
  onDeleteMessage,
  onClearChat,
  isLoading = false,
  isSending = false,
}) => {
  const [messageInput, setMessageInput] = useState('');
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Announce new messages
  useAnnounceListChanges(messages, 'message');

  // Announce loading states
  useAnnounceLoading(isLoading, 'Loading messages', 'Messages loaded');
  useAnnounceLoading(isSending, 'Sending message', 'Message sent');

  // Keyboard shortcut: Send message with Cmd/Ctrl + Enter
  useKeyboardShortcut({
    id: 'send-message',
    key: 'Enter',
    meta: true,
    description: 'Send message',
    handler: handleSend,
    category: 'Chat',
  });

  // Keyboard shortcut: Focus message input
  useKeyboardShortcut({
    id: 'focus-input',
    key: 'i',
    description: 'Focus message input',
    handler: () => inputRef.current?.focus(),
    category: 'Chat',
  });

  // Keyboard shortcut: Clear chat
  useKeyboardShortcut({
    id: 'clear-chat',
    key: 'k',
    meta: true,
    shift: true,
    description: 'Clear chat',
    handler: async () => {
      if (onClearChat && confirm('Clear all messages?')) {
        await onClearChat();
        announce(announcements.deleted('All messages'));
      }
    },
    category: 'Chat',
  });

  // Clear focused message with Escape
  useEscapeKey(() => {
    if (focusedMessageId) {
      setFocusedMessageId(null);
      announce('Message focus cleared');
    }
  }, !!focusedMessageId);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  async function handleSend() {
    if (!messageInput.trim() || isSending) return;

    const content = messageInput;
    setMessageInput('');

    try {
      await onSendMessage(content);
      announce(announcements.success('Message sent'));
      
      // Return focus to input
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (error) {
      announce(announcements.error('Failed to send message'));
      setMessageInput(content); // Restore message
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send with Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Message context menu
  const getMessageMenuItems = (message: Message): MenuItem[] => {
    const items: MenuItem[] = [
      {
        id: 'copy',
        label: 'Copy message',
        icon: '📋',
        onClick: () => {
          navigator.clipboard.writeText(message.content);
          announce(announcements.success('Message copied'));
        },
      },
    ];

    if (message.sender === 'you' && onDeleteMessage) {
      items.push(
        { id: 'sep1', label: '', separator: true },
        {
          id: 'delete',
          label: 'Delete message',
          icon: '🗑️',
          onClick: async () => {
            if (confirm('Delete this message?')) {
              await onDeleteMessage(message.id);
              announce(announcements.deleted('Message'));
            }
          },
        }
      );
    }

    return items;
  };

  return (
    <div
      className="accessible-chat-panel"
      role="region"
      aria-label={`Chat with ${contactName}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#111827',
        color: '#E0E0E0',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '16px',
          borderBottom: '1px solid #374151',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h2
            id="chat-title"
            style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}
          >
            {contactName}
          </h2>
          <div style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>
            {contactNumber}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <Tooltip content="Search messages (⌘F)">
            <button
              aria-label="Search messages"
              style={{
                padding: '8px',
                backgroundColor: '#374151',
                border: 'none',
                borderRadius: '6px',
                color: '#E0E0E0',
                cursor: 'pointer',
              }}
            >
              🔍
            </button>
          </Tooltip>

          {onClearChat && (
            <Tooltip content="Clear chat (⌘⇧K)">
              <button
                onClick={async () => {
                  if (confirm('Clear all messages?')) {
                    await onClearChat();
                    announce(announcements.deleted('All messages'));
                  }
                }}
                aria-label="Clear chat"
                style={{
                  padding: '8px',
                  backgroundColor: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#E0E0E0',
                  cursor: 'pointer',
                }}
              >
                🗑️
              </button>
            </Tooltip>
          )}
        </div>
      </header>

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Messages"
        aria-describedby="chat-title"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}
          >
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div
            role="status"
            style={{
              textAlign: 'center',
              padding: '40px',
              color: '#9CA3AF',
            }}
          >
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={message.id}
              role="article"
              aria-label={`Message ${index + 1} from ${message.sender === 'you' ? 'you' : contactName} at ${message.timestamp.toLocaleTimeString()}`}
              tabIndex={0}
              onFocus={() => setFocusedMessageId(message.id)}
              onBlur={() => setFocusedMessageId(null)}
              style={{
                display: 'flex',
                justifyContent: message.sender === 'you' ? 'flex-end' : 'flex-start',
                outline: focusedMessageId === message.id ? '2px solid #3b82f6' : 'none',
                outlineOffset: '4px',
                borderRadius: '8px',
              }}
            >
              <div style={{ maxWidth: '70%', position: 'relative' }}>
                <div
                  style={{
                    backgroundColor: message.sender === 'you' ? '#3b82f6' : '#374151',
                    color: '#E0E0E0',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    wordBreak: 'break-word',
                  }}
                >
                  {message.content}

                  {/* Message status */}
                  {message.sender === 'you' && message.status && (
                    <span
                      aria-label={`Status: ${message.status}`}
                      style={{
                        fontSize: '0.75rem',
                        marginLeft: '8px',
                        opacity: 0.7,
                      }}
                    >
                      {message.status === 'sending' && '⏳'}
                      {message.status === 'sent' && '✓'}
                      {message.status === 'failed' && '✗'}
                    </span>
                  )}
                </div>

                {/* Timestamp */}
                <time
                  dateTime={message.timestamp.toISOString()}
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: '#6B7280',
                    marginTop: '4px',
                    textAlign: message.sender === 'you' ? 'right' : 'left',
                  }}
                >
                  {message.timestamp.toLocaleTimeString()}
                </time>

                {/* Context menu */}
                {focusedMessageId === message.id && (
                  <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                    <AccessibleMenu
                      trigger={
                        <button
                          aria-label="Message options"
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#E0E0E0',
                            cursor: 'pointer',
                          }}
                        >
                          ⋯
                        </button>
                      }
                      items={getMessageMenuItems(message)}
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        aria-label="Send message"
        style={{
          padding: '16px',
          borderTop: '1px solid #374151',
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-end',
        }}
      >
        <FormField
          label="Message"
          hint={`Press Enter to send, Shift+Enter for new line. Or press ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter`}
          style={{ flex: 1, marginBottom: 0 }}
        >
          <TextArea
            ref={inputRef}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isSending}
            aria-label="Message input"
            aria-describedby="message-hint"
            style={{ minHeight: '44px', maxHeight: '120px', resize: 'vertical' }}
          />
        </FormField>

        <Tooltip content={`Send message (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter)`}>
          <button
            type="submit"
            disabled={!messageInput.trim() || isSending}
            aria-label="Send message"
            style={{
              padding: '12px 24px',
              backgroundColor: messageInput.trim() && !isSending ? '#3b82f6' : '#374151',
              color: '#E0E0E0',
              border: 'none',
              borderRadius: '8px',
              cursor: messageInput.trim() && !isSending ? 'pointer' : 'not-allowed',
              fontWeight: 600,
              minHeight: '44px',
            }}
          >
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </Tooltip>
      </form>

      {/* Screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{
          position: 'absolute',
          left: '-10000px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
      >
        {messages.length > 0 && `${messages.length} messages in conversation`}
        {isSending && 'Sending message'}
        {isLoading && 'Loading messages'}
      </div>
    </div>
  );
};

export default AccessibleChatPanel;


