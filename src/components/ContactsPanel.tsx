import React, { useState, useEffect } from 'react';
import { invoke } from '../utils/tauri';
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
      // Use list_contact_meta which is the proper command
      const response = await invoke<any>('list_contact_meta');
      
      // Handle both wrapped response format and direct array
      let contactData: any[] = [];
      if (response && typeof response === 'object') {
        if (response.success && Array.isArray(response.data)) {
          contactData = response.data;
        } else if (Array.isArray(response)) {
          contactData = response;
        } else if (Array.isArray(response.data)) {
          contactData = response.data;
        }
      }
      
      // Map ContactMeta to Contact format
      // ContactMeta has: contact_id, display_name, alias, categories, favorite, muted, etc.
      const parsedContacts: Contact[] = contactData.map((item: any) => {
        const contactId = item.contact_id || item.number || '';
        const displayName = item.display_name || item.alias || contactId;
        
        return {
          number: contactId,
          name: displayName !== contactId ? displayName : undefined,
          uuid: item.uuid || undefined,
        };
      });
      
      setContacts(parsedContacts);
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      setError(`Failed to load contacts: ${errorMsg}`);
      console.error('ContactsPanel loadContacts error:', e);
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

