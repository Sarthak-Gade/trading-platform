import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
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

interface PriceTick {
  s: string;
  p: number;
}

function Positions() {
  const { token } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  useEffect(() => {
    apiFetch('/api/me/positions', token)
      .then((data) => setPositions(data))
      .catch(() => setError('Could not load positions'));
  }, [token]);

  useEffect(() => {
    const socket = io('http://localhost:5000');

    socket.on('priceUpdate', (data: PriceTick[]) => {
  const relianceTick = data.find((tick) => tick.s === 'RELIANCE.NS');
  if (relianceTick) {
    setCurrentPrice(relianceTick.p);
  }
});

    return () => {
      socket.disconnect();
    };
  }, []);

  const calculateUnrealizedPnl = (position: Position): number | null => {
    if (currentPrice === null) return null;
    return (currentPrice - Number(position.avgPrice)) * position.netQty;
  };

  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2>Positions</h2>
      {currentPrice !== null && (
        <p style={{ fontSize: '0.9rem', color: '#666' }}>
          Live reference price: ₹{currentPrice.toFixed(2)}
        </p>
      )}
      {positions.length === 0 ? (
        <p>No open positions.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '700px' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Symbol</th>
              <th style={cellStyle}>Product</th>
              <th style={cellStyle}>Net Qty</th>
              <th style={cellStyle}>Avg Price</th>
              <th style={cellStyle}>Realized P&L</th>
              <th style={cellStyle}>Unrealized P&L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const unrealized = calculateUnrealizedPnl(p);
              return (
                <tr key={p.id}>
                  <td style={cellStyle}>{p.instrument.symbol}</td>
                  <td style={cellStyle}>{p.productType}</td>
                  <td style={cellStyle}>{p.netQty}</td>
                  <td style={cellStyle}>₹{p.avgPrice}</td>
                  <td style={{ ...cellStyle, color: Number(p.realizedPnl) >= 0 ? 'green' : 'red' }}>
                    ₹{p.realizedPnl}
                  </td>
                  <td style={{ ...cellStyle, color: unrealized !== null && unrealized >= 0 ? 'green' : 'red' }}>
                    {unrealized !== null ? `₹${unrealized.toFixed(2)}` : '—'}
                  </td>
                </tr>
              );
            })}
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