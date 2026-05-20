import React, { useState, useEffect } from 'react';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  created_at: string;
}

export const CustomersPanel: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/customers');
      const data = await response.json();
      setCustomers(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
      setLoading(false);
    }
  };

  const createCustomer = async () => {
    if (!name || !email) return;
    try {
      await fetch('http://localhost:3001/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, address })
      });
      setName('');
      setEmail('');
      setPhone('');
      setAddress('');
      fetchCustomers();
    } catch (error) {
      console.error('Failed to create customer:', error);
    }
  };

  if (loading) return <div>Loading customers...</div>;

  return (
    <div>
      <h2>Customers</h2>
      <div>
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          placeholder="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button onClick={createCustomer}>Add Customer</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Address</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id}>
              <td>{customer.name}</td>
              <td>{customer.email}</td>
              <td>{customer.phone}</td>
              <td>{customer.address}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
