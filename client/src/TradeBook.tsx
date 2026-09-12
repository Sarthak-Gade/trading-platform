import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

interface Trade {
  id: string;
  pricePerShare: string;
  sharesQty: number;
  totalPrice: string;
  brokerage: string;
  executedAt: string;
  instrument: { symbol: string };
}

function TradeBook() {
  const { token } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/me/trades', token)
      .then((data) => setTrades(data))
      .catch(() => setError('Could not load trade history'));
  }, [token]);

  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2>Trade Book</h2>
      {trades.length === 0 ? (
        <p>No trades executed yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '800px' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Symbol</th>
              <th style={cellStyle}>Qty</th>
              <th style={cellStyle}>Price/Share</th>
              <th style={cellStyle}>Brokerage</th>
              <th style={cellStyle}>Total</th>
              <th style={cellStyle}>Executed At</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id}>
                <td style={cellStyle}>{t.instrument.symbol}</td>
                <td style={cellStyle}>{t.sharesQty}</td>
                <td style={cellStyle}>₹{t.pricePerShare}</td>
                <td style={cellStyle}>₹{t.brokerage}</td>
                <td style={cellStyle}>₹{t.totalPrice}</td>
                <td style={cellStyle}>{new Date(t.executedAt).toLocaleString()}</td>
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

export default TradeBook;