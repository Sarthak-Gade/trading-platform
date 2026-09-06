import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

interface Position {
  id: string;
  productType: string;
  netQty: number;
  avgPrice: string;
  realizedPnl: string;
  instrument: {
    symbol: string;
  };
}

function Positions() {
  const { token } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/me/positions', token)
      .then((data) => setPositions(data))
      .catch(() => setError('Could not load positions'));
  }, [token]);

  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2>Positions</h2>
      {positions.length === 0 ? (
        <p>No open positions.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '600px' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Symbol</th>
              <th style={cellStyle}>Product</th>
              <th style={cellStyle}>Net Qty</th>
              <th style={cellStyle}>Avg Price</th>
              <th style={cellStyle}>Realized P&L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id}>
                <td style={cellStyle}>{p.instrument.symbol}</td>
                <td style={cellStyle}>{p.productType}</td>
                <td style={cellStyle}>{p.netQty}</td>
                <td style={cellStyle}>₹{p.avgPrice}</td>
                <td style={{ ...cellStyle, color: Number(p.realizedPnl) >= 0 ? 'green' : 'red' }}>
                  ₹{p.realizedPnl}
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

export default Positions;