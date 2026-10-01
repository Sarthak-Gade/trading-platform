import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

interface Order {
  id: string;
  type: string;
  orderType: string;
  productType: string;
  qty: number;
  orderPrice: string;
  status: string;
  createdAt: string;
  instrument: { symbol: string };
}

const REFRESH_MS = 5000;

function OrderBook({ onOrdersChanged }: { onOrdersChanged?: () => void }) {
  const { token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadOrders = () => {
    apiFetch('/api/me/orders', token)
      .then((data: Order[]) => {
        setOrders(data);
        setError('');
      })
      .catch(() => setError('Could not load order history'));
  };

  // Load once, then keep refreshing so orders filled by the background matcher show up on their own
  useEffect(() => {
    loadOrders();
    const timer = setInterval(loadOrders, REFRESH_MS);
    return () => clearInterval(timer);
  }, [token]);

  const handleCancel = async (orderId: string) => {
    setCancellingId(orderId);
    setError('');

    try {
      await apiFetch(`/api/orders/${orderId}/cancel`, token, { method: 'POST' });
      loadOrders();
      onOrdersChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the order');
      loadOrders();
    } finally {
      setCancellingId(null);
    }
  };

  const statusColor = (status: string) => {
    if (status === 'executed') return 'green';
    if (status === 'pending') return '#b8860b';
    return 'red';
  };

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2>Order Book</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {orders.length === 0 ? (
        <p>No orders placed yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '900px' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Symbol</th>
              <th style={cellStyle}>Type</th>
              <th style={cellStyle}>Order</th>
              <th style={cellStyle}>Product</th>
              <th style={cellStyle}>Qty</th>
              <th style={cellStyle}>Price</th>
              <th style={cellStyle}>Status</th>
              <th style={cellStyle}>Placed At</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td style={cellStyle}>{o.instrument.symbol}</td>
                <td style={{ ...cellStyle, textTransform: 'capitalize' }}>{o.type}</td>
                <td style={{ ...cellStyle, textTransform: 'capitalize' }}>{o.orderType}</td>
                <td style={cellStyle}>{o.productType}</td>
                <td style={cellStyle}>{o.qty}</td>
                <td style={cellStyle}>₹{o.orderPrice}</td>
                <td style={{ ...cellStyle, color: statusColor(o.status), fontWeight: 'bold' }}>
                  {o.status}
                </td>
                <td style={cellStyle}>{new Date(o.createdAt).toLocaleString()}</td>
                <td style={cellStyle}>
                  {o.status === 'pending' && (
                    <button onClick={() => handleCancel(o.id)} disabled={cancellingId === o.id}>
                      {cancellingId === o.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '0.5rem',
  textAlign: 'left',
};

export default OrderBook;
