import React, { useState, useEffect } from 'react'
import { OrdersPanel } from './OrdersPanel'
import { CustomersPanel } from './CustomersPanel'
import { InvoicesPanel } from './InvoicesPanel'
import './MessengerCore.css'

interface Contact {
  id: string
  name: string
  number: string
  lastMessage?: string
  unread?: number
}

interface Message {
  id: string
  sender: string
  content: string
  timestamp: string
  orderId?: string
}

export const MessengerCore: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [sidePanel, setSidePanel] = useState<'orders' | 'customers' | 'invoices' | null>(null)

  const sendMessage = async () => {
    if (!messageInput || !selectedContact) return

    const newMessage: Message = {
      id: Math.random().toString(),
      sender: 'You',
      content: messageInput,
      timestamp: new Date().toISOString()
    }

    setMessages([...messages, newMessage])
    setMessageInput('')
  }

  const sendOrderNotification = (orderId: string, status: string) => {
    if (!selectedContact) return

    const notification: Message = {
      id: Math.random().toString(),
      sender: 'System',
      content: `Order ${orderId} status updated to: ${status}`,
      timestamp: new Date().toISOString(),
      orderId
    }

    setMessages([...messages, notification])
  }

  return (
    <div className="messenger-core">
      <div className="messenger-container">
        <div className="contacts-list">
          <h2>Messages</h2>
          <div className="contacts">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className={`contact ${selectedContact?.id === contact.id ? 'active' : ''}`}
                onClick={() => setSelectedContact(contact)}
              >
                <div className="contact-info">
                  <h3>{contact.name}</h3>
                  <p>{contact.lastMessage || 'No messages yet'}</p>
                </div>
                {contact.unread && <span className="unread">{contact.unread}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="chat-area">
          {selectedContact ? (
            <>
              <div className="chat-header">
                <h2>{selectedContact.name}</h2>
                <div className="header-buttons">
                  <button onClick={() => setSidePanel('orders')}>Orders</button>
                  <button onClick={() => setSidePanel('customers')}>Customers</button>
                  <button onClick={() => setSidePanel('invoices')}>Invoices</button>
                </div>
              </div>

              <div className="messages-container">
                {messages.map((msg) => (
                  <div key={msg.id} className={`message ${msg.sender === 'You' ? 'sent' : 'received'}`}>
                    <div className="message-content">
                      <p>{msg.content}</p>
                      {msg.orderId && <span className="order-id">Order: {msg.orderId}</span>}
                      <span className="timestamp">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="message-input-area">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button onClick={sendMessage}>Send</button>
              </div>
            </>
          ) : (
            <div className="no-chat">Select a contact to start messaging</div>
          )}
        </div>
      </div>

      <div className="side-panel">
        {sidePanel === 'orders' && <OrdersPanel />}
        {sidePanel === 'customers' && <CustomersPanel />}
        {sidePanel === 'invoices' && <InvoicesPanel />}
        {!sidePanel && (
          <div className="panel-placeholder">
            Select an option above to manage orders, customers, or invoices
          </div>
        )}
      </div>
    </div>
  )
}
