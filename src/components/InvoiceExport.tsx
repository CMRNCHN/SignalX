import { useState } from 'react';
import { exportForSignal, InvoiceData, InvoiceItem } from '../invoiceFormatter';
import './InvoiceExport.css';

export function InvoiceExport() {
  const [title, setTitle] = useState('PRICING');
  const [customer, setCustomer] = useState('');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }));

  const [items, setItems] = useState<InvoiceItem[]>([
    { name: 'Item 1', price: '0', group: '' },
  ]);

  const [payMethods, setPayMethods] = useState<Array<{ label: string; value: string }>>([
    { label: 'Venmo', value: '@handle' },
  ]);

  const [notes, setNotes] = useState('');
  const [footer, setFooter] = useState('');
  const [preview, setPreview] = useState('');

  const updateItem = (idx: number, field: keyof InvoiceItem, value: string) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { name: '', price: '0', group: '' }]);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updatePayMethod = (idx: number, field: 'label' | 'value', value: string) => {
    const newMethods = [...payMethods];
    newMethods[idx] = { ...newMethods[idx], [field]: value };
    setPayMethods(newMethods);
  };

  const addPayMethod = () => {
    setPayMethods([...payMethods, { label: '', value: '' }]);
  };

  const removePayMethod = (idx: number) => {
    setPayMethods(payMethods.filter((_, i) => i !== idx));
  };

  const generatePreview = () => {
    const invoice: InvoiceData = {
      title,
      customer,
      ref,
      date,
      items: items.filter(i => i.name.trim()),
      payMethods: payMethods.filter(m => m.label && m.value),
      notes,
      footer,
    };
    const output = exportForSignal(invoice);
    setPreview(output);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      alert('Copied to clipboard - ready to paste in Signal!');
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <div className="invoice-export">
      <div className="invoice-form">
        <h2>Invoice Export</h2>

        <div className="form-section">
          <h3>Header Info</h3>
          <div className="form-group">
            <label>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Customer</label>
              <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Jordan M." />
            </div>
            <div className="form-group">
              <label>Invoice #</label>
              <input value={ref} onChange={e => setRef(e.target.value)} placeholder="INV-1042" />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Line Items</h3>
          {items.map((item, idx) => (
            <div key={idx} className="item-row">
              <input
                placeholder="Item name"
                value={item.name}
                onChange={e => updateItem(idx, 'name', e.target.value)}
              />
              <input
                placeholder="Price"
                type="number"
                step="0.01"
                value={item.price}
                onChange={e => updateItem(idx, 'price', e.target.value)}
              />
              <input
                placeholder="Group (optional)"
                value={item.group || ''}
                onChange={e => updateItem(idx, 'group', e.target.value)}
              />
              {items.length > 1 && (
                <button onClick={() => removeItem(idx)} className="btn-remove">×</button>
              )}
            </div>
          ))}
          <button onClick={addItem} className="btn-add">+ Add Item</button>
        </div>

        <div className="form-section">
          <h3>Payment Methods</h3>
          {payMethods.map((method, idx) => (
            <div key={idx} className="payment-row">
              <input
                placeholder="Label (Venmo, CashApp, etc)"
                value={method.label}
                onChange={e => updatePayMethod(idx, 'label', e.target.value)}
              />
              <input
                placeholder="Handle or address"
                value={method.value}
                onChange={e => updatePayMethod(idx, 'value', e.target.value)}
              />
              {payMethods.length > 1 && (
                <button onClick={() => removePayMethod(idx)} className="btn-remove">×</button>
              )}
            </div>
          ))}
          <button onClick={addPayMethod} className="btn-add">+ Add Payment Method</button>
        </div>

        <div className="form-section">
          <h3>Notes & Footer</h3>
          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Terms, pickup info, etc."
              rows={3}
            />
          </div>
          <div className="form-group">
            <label>Footer (optional)</label>
            <input
              value={footer}
              onChange={e => setFooter(e.target.value)}
              placeholder="e.g., 'ask for bundle rate'"
            />
          </div>
        </div>

        <div className="form-actions">
          <button onClick={generatePreview} className="btn-primary">Generate Preview</button>
        </div>
      </div>

      {preview && (
        <div className="invoice-preview">
          <h2>Preview</h2>
          <pre>{preview}</pre>
          <button onClick={copyToClipboard} className="btn-primary">Copy for Signal</button>
          <p className="hint">Paste into Signal → sends as formatted code block</p>
        </div>
      )}
    </div>
  );
}
