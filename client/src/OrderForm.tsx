import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import InstrumentSearch from './InstrumentSearch';


function OrderForm({ onOrderPlaced }: { onOrderPlaced: () => void }) {
  const { token } = useAuth();
  const [type, setType] = useState<'buy' | 'sell'>('buy');
  const [productType, setProductType] = useState<'CNC' | 'MIS'>('CNC');
  const [qty, setQty] = useState(1);
  const [orderPrice, setOrderPrice] = useState(2500);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedInstrument, setSelectedInstrument] = useState<{ id: string; symbol: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstrument) {
  setError('Please select a stock first');
  return;
}
    setError('');
    setMessage('');

    try {
      const order = await apiFetch('/api/orders', token, {
        method: 'POST',
        body: JSON.stringify({
          instrumentId: selectedInstrument?.id,
          type,
          orderType: 'market',
          productType,
          qty,
          orderPrice,
          validity: 'DAY',
        }),
      });

      const result = await apiFetch(`/api/orders/${order.id}/execute`, token, {
        method: 'POST',
      });

      setMessage(`Order executed! Trade ID: ${result.trade.id}`);
      onOrderPlaced();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order failed');
    }
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px', maxWidth: '400px' }}>
        <h2>Place Order {selectedInstrument ? `— ${selectedInstrument.symbol}` : ''}</h2>
        <InstrumentSearch onSelect={(inst) => setSelectedInstrument({ id: inst.id, symbol: inst.symbol })} />
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>Type: </label>
          <select value={type} onChange={(e) => setType(e.target.value as 'buy' | 'sell')}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label>Product: </label>
          <select value={productType} onChange={(e) => setProductType(e.target.value as 'CNC' | 'MIS')}>
            <option value="CNC">CNC (Delivery)</option>
            <option value="MIS">MIS (Intraday)</option>
          </select>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label>Quantity: </label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            style={{ width: '80px' }}
          />
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label>Price: ₹</label>
          <input
            type="number"
            min={0}
            value={orderPrice}
            onChange={(e) => setOrderPrice(Number(e.target.value))}
            style={{ width: '100px' }}
          />
        </div>

        {error && <p style={{ color: 'red' }}>{error}</p>}
        {message && <p style={{ color: 'green' }}>{message}</p>}

        <button type="submit">Place & Execute Order</button>
      </form>
    </div>
  );
}

export default OrderForm;