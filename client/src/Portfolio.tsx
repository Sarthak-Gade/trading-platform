import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import Holdings from './Holdings';
import Positions from './Positions';

interface Holding {
  investedValue: string;
}

interface Position {
  realizedPnl: string;
}

function Portfolio() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [totalInvested, setTotalInvested] = useState(0);
  const [totalRealizedPnl, setTotalRealizedPnl] = useState(0);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    apiFetch('/api/me/holdings', token).then((data: Holding[]) => {
      const sum = data.reduce((acc, h) => acc + Number(h.investedValue), 0);
      setTotalInvested(sum);
    });

    apiFetch('/api/me/positions', token).then((data: Position[]) => {
      const sum = data.reduce((acc, p) => acc + Number(p.realizedPnl), 0);
      setTotalRealizedPnl(sum);
    });
  }, [token, navigate]);

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1>Portfolio Holdings</h1>
      <p style={{ color: '#9098ac', marginBottom: '1.5rem' }}>
        Track delivery investments, active intraday contracts, and absolute performance metrics
      </p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ color: '#9098ac', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            TOTAL INVESTED (DELIVERY)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{totalInvested.toFixed(2)}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ color: '#9098ac', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            REALIZED PROFIT/LOSS
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: totalRealizedPnl >= 0 ? '#26a69a' : '#ef5350',
            }}
          >
            ₹{totalRealizedPnl.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="card">
        <Holdings />
      </div>
      <div className="card">
        <Positions />
      </div>
    </div>
  );
}

export default Portfolio;