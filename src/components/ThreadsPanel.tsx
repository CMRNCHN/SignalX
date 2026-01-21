import React, { useState, useEffect } from 'react';
import { invoke } from '../utils/tauri';
import { Input, Badge, Button } from './primitives';
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
      // Use get_threads command which returns ThreadSummary[]
      const response = await invoke<any>('get_threads');
      
      // Handle both wrapped response format and direct array
      let threadData: any[] = [];
      if (response && typeof response === 'object') {
        if (response.success && Array.isArray(response.data)) {
          threadData = response.data;
        } else if (Array.isArray(response)) {
          threadData = response;
        } else if (Array.isArray(response.data)) {
          threadData = response.data;
        }
      }
      
      // Map ThreadSummary to Thread format
      const parsedThreads: Thread[] = threadData.map((item: any) => {
        // ThreadSummary has: id, participants, last_message_timestamp, unread_count, message_count
        const threadId = item.id || String(item.thread_id || '');
        // Use first participant as name, or join all participants
        const participants = item.participants || [];
        const name = participants.length > 0 
          ? (participants.length === 1 ? participants[0] : `${participants[0]} +${participants.length - 1}`)
          : threadId;
        
        return {
          id: threadId,
          name: name,
          lastMessage: undefined, // ThreadSummary doesn't include last message content
          timestamp: item.last_message_timestamp || item.timestamp,
          unreadCount: item.unread_count || item.unreadCount || 0,
        };
      });
      
      setThreads(parsedThreads);
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      setError(`Failed to load threads: ${errorMsg}`);
      console.error('ThreadsPanel loadThreads error:', e);
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
        <Button
          variant="ghost"
          size="sm"
          icon={loading ? '⟳' : '↻'}
          iconPosition="left"
          onClick={loadThreads}
          disabled={loading}
          aria-label="Refresh threads"
        />
      </div>

      <div className="threads-search">
        <Input
          type="text"
          placeholder="Search threads..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          fullWidth
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
                <Badge variant="error" size="sm">
                  {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
                </Badge>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ThreadsPanel;

