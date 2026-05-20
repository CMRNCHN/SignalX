import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const runCommand = (cmd) => {
  try {
    const result = execSync(`./bin/signalx-backend ${cmd}`, { encoding: 'utf8' });
    return JSON.parse(result);
  } catch (error) {
    return { error: error.message };
  }
};

app.get('/api/customers', (req, res) => {
  res.json(runCommand('customer list'));
});

app.post('/api/customers', (req, res) => {
  const { name, email, phone, address } = req.body;
  const result = runCommand(`customer create "${name}" "${email}" "${phone}" "${address}"`);
  res.json(result);
});

app.get('/api/customers/:id', (req, res) => {
  const result = runCommand(`customer get ${req.params.id}`);
  res.json(result);
});

app.get('/api/orders', (req, res) => {
  res.json(runCommand('order list'));
});

app.post('/api/orders', (req, res) => {
  const { customerId, amount } = req.body;
  const result = runCommand(`order create ${customerId} ${amount}`);
  res.json(result);
});

app.get('/api/orders/:id', (req, res) => {
  const result = runCommand(`order get ${req.params.id}`);
  res.json(result);
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const result = runCommand(`order status ${req.params.id} ${status}`);
  res.json(result);
});

app.get('/api/invoices', (req, res) => {
  res.json(runCommand('invoice list'));
});

app.post('/api/invoices', (req, res) => {
  const { orderId } = req.body;
  const result = runCommand(`invoice create ${orderId}`);
  res.json(result);
});

app.get('/api/invoices/:id', (req, res) => {
  const result = runCommand(`invoice get ${req.params.id}`);
  res.json(result);
});

app.post('/api/invoices/:id/pay', (req, res) => {
  const { amount } = req.body;
  const result = runCommand(`invoice pay ${req.params.id} ${amount}`);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
