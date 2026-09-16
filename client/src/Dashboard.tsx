import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import PriceChart from './PriceChart';
import OrderForm from './OrderForm';
import Holdings from './Holdings';
import Positions from './Positions';
import Alerts from './Alerts';
import OrderBook from './OrderBook';
import TradeBook from './TradeBook';
import Watchlist from './Watchlist';
import Profile from './Profile';
import BankAccounts from './BankAccounts';

interface Balance {
  availableBalance: string;
  usedMargin: string;
}

function Dashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [error, setError] = useState('');

  const fetchBalance = () => {
    fetch('http://localhost:5000/api/me/balance', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch balance');
        return res.json();
      })
      .then((data) => setBalance(data))
      .catch(() => setError('Could not load balance'));
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    fetchBalance();
  }, [token, navigate]);

  return (
    <div className="dashboard-grid">
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {balance && (
        <div className="card">
          <h2>Balance</h2>
          <p>Available: ₹{balance.availableBalance}</p>
          <p>Used Margin: ₹{balance.usedMargin}</p>
        </div>
      )}

      <div className="card">
        <Profile />
      </div>

      <div className="card">
        <BankAccounts />
      </div>

      <div className="card">
        <OrderForm onOrderPlaced={fetchBalance} />
      </div>

      <div className="card">
        <Holdings />
      </div>

      <div className="card">
        <Positions />
      </div>

      <div className="card">
        <Alerts />
      </div>

      <div className="card">
        <Watchlist />
      </div>

      <div className="card full-width">
        <OrderBook />
      </div>

      <div className="card full-width">
        <TradeBook />
      </div>

      <div className="card full-width">
        <h2>Live Price Chart — RELIANCE (NSE)</h2>
        <PriceChart />
      </div>
    </div>
  );
}

export default Dashboard;