import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './ThreadsPanel.css';

interface Thread {
  id: string;
  name: string;
  lastMessage?: string;
  timestamp?: number;
  unreadCount?: number;
}

interface ThreadsPanelProps {
  onSelectThread?: (thread: Thread) => void;
  selectedThread?: string;
}

const ThreadsPanel: React.FC<ThreadsPanelProps> = ({ onSelectThread, selectedThread }) => {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadThreads = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await invoke<any>('signal_list_threads');
      if (response.success) {
        // Parse the threads from the response
        let parsedThreads: Thread[] = [];
        
        if (Array.isArray(response.data)) {
          parsedThreads = response.data.map((item: any, idx: number) => {
            const threadId = item.id || item.threadId || item.number || `thread-${idx}`;
            const name = item.name || item.displayName || item.number || threadId;
            return {
              id: threadId,
              name: name,
              lastMessage: item.lastMessage || item.preview || undefined,
              timestamp: item.timestamp || item.lastMessageTimestamp || undefined,
              unreadCount: item.unreadCount || 0,
            };
          });
        } else if (typeof response.data === 'string') {
          try {
            const parsed = JSON.parse(response.data);
            if (Array.isArray(parsed)) {
              parsedThreads = parsed.map((item: any, idx: number) => {
                const threadId = item.id || item.threadId || item.number || `thread-${idx}`;
                const name = item.name || item.displayName || item.number || threadId;
                return {
                  id: threadId,
                  name: name,
                  lastMessage: item.lastMessage || item.preview || undefined,
                  timestamp: item.timestamp || item.lastMessageTimestamp || undefined,
                  unreadCount: item.unreadCount || 0,
                };
              });
            }
          } catch {
            setError('Failed to parse threads data');
          }
        }
        
        setThreads(parsedThreads);
      } else {
        setError(response.error || 'Failed to load threads');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThreads();
  }, []);

  const filteredThreads = threads.filter((thread) => {
    const query = searchQuery.toLowerCase();
    return (
      thread.name.toLowerCase().includes(query) ||
      (thread.lastMessage && thread.lastMessage.toLowerCase().includes(query))
    );
  });

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
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
    <div className="threads-panel panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2>Threads</h2>
        <button
          onClick={loadThreads}
          disabled={loading}
          className="refresh-button"
          title="Refresh threads"
        >
          {loading ? '⟳' : '↻'}
        </button>
      </div>

      <div className="threads-search">
        <input
          type="text"
          placeholder="Search threads..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="threads-error">
          {error}
        </div>
      )}

      <div className="threads-list">
        {loading ? (
          <div className="threads-loading">Loading threads...</div>
        ) : filteredThreads.length === 0 ? (
          <div className="threads-empty">
            {searchQuery ? 'No threads found' : 'No threads available'}
          </div>
        ) : (
          filteredThreads.map((thread) => (
            <div
              key={thread.id}
              className={`thread-item ${selectedThread === thread.id ? 'selected' : ''}`}
              onClick={() => onSelectThread?.(thread)}
            >
              <div className="thread-info">
                <div className="thread-header">
                  <div className="thread-name">{thread.name}</div>
                  {thread.timestamp && (
                    <div className="thread-time">{formatTime(thread.timestamp)}</div>
                  )}
                </div>
                {thread.lastMessage && (
                  <div className="thread-preview">{thread.lastMessage}</div>
                )}
              </div>
              {thread.unreadCount && thread.unreadCount > 0 && (
                <div className="thread-unread">{thread.unreadCount}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ThreadsPanel;

