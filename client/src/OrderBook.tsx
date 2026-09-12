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

function OrderBook() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/me/orders', token)
      .then((data) => setOrders(data))
      .catch(() => setError('Could not load order history'));
  }, [token]);

  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  const statusColor = (status: string) => {
    if (status === 'executed') return 'green';
    if (status === 'pending') return '#b8860b';
    return 'red';
  };

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2>Order Book</h2>
      {orders.length === 0 ? (
        <p>No orders placed yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '800px' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Symbol</th>
              <th style={cellStyle}>Type</th>
              <th style={cellStyle}>Product</th>
              <th style={cellStyle}>Qty</th>
              <th style={cellStyle}>Price</th>
              <th style={cellStyle}>Status</th>
              <th style={cellStyle}>Placed At</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td style={cellStyle}>{o.instrument.symbol}</td>
                <td style={{ ...cellStyle, textTransform: 'capitalize' }}>{o.type}</td>
                <td style={cellStyle}>{o.productType}</td>
                <td style={cellStyle}>{o.qty}</td>
                <td style={cellStyle}>₹{o.orderPrice}</td>
                <td style={{ ...cellStyle, color: statusColor(o.status), fontWeight: 'bold' }}>
                  {o.status}
                </td>
                <td style={cellStyle}>{new Date(o.createdAt).toLocaleString()}</td>
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