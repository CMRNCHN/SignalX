import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('dist'));

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
  res.json(runCommand(`customer create "${name}" "${email}" "${phone}" "${address}"`));
});

app.get('/api/orders', (req, res) => {
  res.json(runCommand('order list'));
});

app.post('/api/orders', (req, res) => {
  const { customerId, amount } = req.body;
  res.json(runCommand(`order create ${customerId} ${amount}`));
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  res.json(runCommand(`order status ${req.params.id} ${status}`));
});

app.get('/api/invoices', (req, res) => {
  res.json(runCommand('invoice list'));
});

app.post('/api/invoices', (req, res) => {
  const { orderId } = req.body;
  res.json(runCommand(`invoice create ${orderId}`));
});

app.post('/api/invoices/:id/pay', (req, res) => {
  const { amount } = req.body;
  res.json(runCommand(`invoice pay ${req.params.id} ${amount}`));
});

app.get('/api/signal/conversations', (req, res) => {
  res.json(runCommand('signal list'));
});

app.get('/api/signal/conversation/:customerId', (req, res) => {
  res.json(runCommand(`signal conversation ${req.params.customerId}`));
});

app.post('/api/signal/send', (req, res) => {
  const { phone, message } = req.body;
  res.json(runCommand(`signal send "${phone}" "${message}"`));
});

app.post('/api/signal/order-confirmation', (req, res) => {
  const { customerId, orderId } = req.body;
  runCommand(`order create ${customerId} 0`);
  res.json({ status: 'Order confirmation sent via Signal' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
