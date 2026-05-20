import React, { useState } from 'react'
import { CustomersPanel } from './components/CustomersPanel'
import { OrdersPanel } from './components/OrdersPanel'
import { InvoicesPanel } from './components/InvoicesPanel'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('customers')

  return (
    <div className="app-container">
      <div className="header">
        <h1>SignalX</h1>
        <p>Order Management System</p>
      </div>

      <div className="nav-tabs">
        <button
          className={activeTab === 'customers' ? 'active' : ''}
          onClick={() => setActiveTab('customers')}
        >
          Customers
        </button>
        <button
          className={activeTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveTab('orders')}
        >
          Orders
        </button>
        <button
          className={activeTab === 'invoices' ? 'active' : ''}
          onClick={() => setActiveTab('invoices')}
        >
          Invoices
        </button>
      </div>

      <div className="content">
        {activeTab === 'customers' && <CustomersPanel />}
        {activeTab === 'orders' && <OrdersPanel />}
        {activeTab === 'invoices' && <InvoicesPanel />}
      </div>
    </div>
  )
}

export default App
