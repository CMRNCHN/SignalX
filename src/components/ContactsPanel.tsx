import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './ContactsPanel.css';

interface Contact {
  number: string;
  name?: string;
  uuid?: string;
}

interface ContactsPanelProps {
  onSelectContact?: (contact: Contact) => void;
  selectedContact?: string;
}

const ContactsPanel: React.FC<ContactsPanelProps> = ({ onSelectContact, selectedContact }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadContacts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await invoke<any>('list_contacts');
      if (response.success) {
        // Parse the contacts from the response
        let parsedContacts: Contact[] = [];
        
        if (Array.isArray(response.data)) {
          parsedContacts = response.data.map((item: any) => ({
            number: item.number || item.phoneNumber || '',
            name: item.name || item.displayName || undefined,
            uuid: item.uuid || undefined,
          }));
        } else if (typeof response.data === 'string') {
          // Try to parse as JSON string
          try {
            const parsed = JSON.parse(response.data);
            if (Array.isArray(parsed)) {
              parsedContacts = parsed.map((item: any) => ({
                number: item.number || item.phoneNumber || '',
                name: item.name || item.displayName || undefined,
                uuid: item.uuid || undefined,
              }));
            }
          } catch {
            // If parsing fails, treat as error
            setError('Failed to parse contacts data');
          }
        }
        
        setContacts(parsedContacts);
      } else {
        setError(response.error || 'Failed to load contacts');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const filteredContacts = contacts.filter((contact) => {
    const query = searchQuery.toLowerCase();
    return (
      contact.number.toLowerCase().includes(query) ||
      (contact.name && contact.name.toLowerCase().includes(query))
    );
  });

  const getDisplayName = (contact: Contact) => {
    return contact.name || contact.number || 'Unknown';
  };

  return (
    <div className="contacts-panel panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2>Contacts</h2>
        <button
          onClick={loadContacts}
          disabled={loading}
          className="refresh-button"
          title="Refresh contacts"
        >
          {loading ? '⟳' : '↻'}
        </button>
      </div>

      <div className="contacts-search">
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="contacts-error">
          {error}
        </div>
      )}

      <div className="contacts-list">
        {loading ? (
          <div className="contacts-loading">Loading contacts...</div>
        ) : filteredContacts.length === 0 ? (
          <div className="contacts-empty">
            {searchQuery ? 'No contacts found' : 'No contacts available'}
          </div>
        ) : (
          filteredContacts.map((contact, idx) => (
            <div
              key={contact.number || contact.uuid || idx}
              className={`contact-item ${selectedContact === contact.number ? 'selected' : ''}`}
              onClick={() => onSelectContact?.(contact)}
            >
              <div className="contact-avatar">
                {getDisplayName(contact).charAt(0).toUpperCase()}
              </div>
              <div className="contact-info">
                <div className="contact-name">{getDisplayName(contact)}</div>
                {contact.name && contact.number && (
                  <div className="contact-number">{contact.number}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ContactsPanel;

