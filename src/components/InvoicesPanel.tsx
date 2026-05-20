import React, { useState, useEffect } from 'react';

interface Invoice {
  id: string;
  order_id: string;
  invoice_number: string;
  amount_due: number;
  amount_paid: number;
  status: string;
  created_at: string;
}

export const InvoicesPanel: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderId, setOrderId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/invoices');
      const data = await response.json();
      setInvoices(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
      setLoading(false);
    }
  };

  const createInvoice = async () => {
    if (!orderId) return;
    try {
      await fetch('http://localhost:3001/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
      setOrderId('');
      fetchInvoices();
    } catch (error) {
      console.error('Failed to create invoice:', error);
    }
  };

  const recordPayment = async (invoiceId: string) => {
    if (!paymentAmount) return;
    try {
      await fetch(`http://localhost:3001/api/invoices/${invoiceId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(paymentAmount) })
      });
      setPaymentAmount('');
      setSelectedInvoice(null);
      fetchInvoices();
    } catch (error) {
      console.error('Failed to record payment:', error);
    }
  };

  if (loading) return <div>Loading invoices...</div>;

  return (
    <div>
      <h2>Invoices</h2>
      <div>
        <input
          placeholder="Order ID"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        />
        <button onClick={createInvoice}>Create Invoice</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Order ID</th>
            <th>Amount Due</th>
            <th>Amount Paid</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>{invoice.invoice_number}</td>
              <td>{invoice.order_id.substring(0, 8)}</td>
              <td>${invoice.amount_due.toFixed(2)}</td>
              <td>${invoice.amount_paid.toFixed(2)}</td>
              <td>{invoice.status}</td>
              <td>
                {selectedInvoice === invoice.id ? (
                  <div>
                    <input
                      type="number"
                      placeholder="Amount"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                    />
                    <button onClick={() => recordPayment(invoice.id)}>Pay</button>
                    <button onClick={() => setSelectedInvoice(null)}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setSelectedInvoice(invoice.id)}>Record Payment</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
