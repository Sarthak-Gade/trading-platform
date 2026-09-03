import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import PriceChart from './PriceChart';

interface Balance {
  availableBalance: string;
  usedMargin: string;
}

function Dashboard() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    fetch('http://localhost:5000/api/me/balance', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch balance');
        return res.json();
      })
      .then((data) => setBalance(data))
      .catch(() => setError('Could not load balance'));
  }, [token, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Dashboard</h1>
        <button onClick={handleLogout}>Log Out</button>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {balance && (
        <div style={{ marginBottom: '2rem' }}>
          <h2>Balance</h2>
          <p>Available: ₹{balance.availableBalance}</p>
          <p>Used Margin: ₹{balance.usedMargin}</p>
        </div>
      )}

      <h2>Live Price Chart — BTC/USDT</h2>
      <PriceChart />
    </div>
  );
}

export default Dashboard;