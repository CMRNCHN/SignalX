import React, { useState, useEffect } from 'react';

interface Order {
  id: string;
  customer_id: string;
  status: string;
  total_amount: number;
  created_at: string;
}

export const OrdersPanel: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/orders');
      const data = await response.json();
      setOrders(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      setLoading(false);
    }
  };

  const createOrder = async () => {
    if (!customerId || !amount) return;
    try {
      await fetch('http://localhost:3001/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, amount: parseFloat(amount) })
      });
      setCustomerId('');
      setAmount('');
      fetchOrders();
    } catch (error) {
      console.error('Failed to create order:', error);
    }
  };

  const updateStatus = async (orderId: string, status: string) => {
    try {
      await fetch(`http://localhost:3001/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchOrders();
    } catch (error) {
      console.error('Failed to update order:', error);
    }
  };

  if (loading) return <div>Loading orders...</div>;

  return (
    <div>
      <h2>Orders</h2>
      <div>
        <input
          placeholder="Customer ID"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        />
        <input
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button onClick={createOrder}>Create Order</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.id.substring(0, 8)}</td>
              <td>{order.customer_id.substring(0, 8)}</td>
              <td>${order.total_amount.toFixed(2)}</td>
              <td>
                <select
                  value={order.status}
                  onChange={(e) => updateStatus(order.id, e.target.value)}
                >
                  <option>pending</option>
                  <option>processing</option>
                  <option>completed</option>
                  <option>shipped</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
