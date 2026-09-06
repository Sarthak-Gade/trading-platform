import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

interface Holding {
  id: string;
  qty: number;
  investedValue: string;
  instrument: {
    symbol: string;
    name: string;
    exchange: string;
  };
}

function Holdings() {
  const { token } = useAuth();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/me/holdings', token)
      .then((data) => setHoldings(data))
      .catch(() => setError('Could not load holdings'));
  }, [token]);

  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2>Holdings</h2>
      {holdings.length === 0 ? (
        <p>No holdings yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '600px' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Symbol</th>
              <th style={cellStyle}>Qty</th>
              <th style={cellStyle}>Invested Value</th>
              <th style={cellStyle}>Avg Price</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.id}>
                <td style={cellStyle}>{h.instrument.symbol}</td>
                <td style={cellStyle}>{h.qty}</td>
                <td style={cellStyle}>₹{h.investedValue}</td>
                <td style={cellStyle}>₹{(Number(h.investedValue) / h.qty).toFixed(2)}</td>
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

export default Holdings;