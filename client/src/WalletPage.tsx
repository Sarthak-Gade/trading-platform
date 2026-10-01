import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Wallet from './Wallet';

function WalletPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState<{ availableBalance: string } | null>(null);

  const fetchBalance = () => {
    fetch('http://localhost:5000/api/me/balance', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setBalance(data));
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    fetchBalance();
  }, [token, navigate]);

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1>Wallet & Ledger</h1>
      <p style={{ color: '#9098ac', marginBottom: '1.5rem' }}>
        Manage virtual funds, simulate deposits/withdrawals, and audit ledger logs
      </p>

      {balance && (
        <div className="card" style={{ maxWidth: '300px', marginBottom: '1.5rem' }}>
          <div style={{ color: '#9098ac', fontSize: '0.8rem' }}>AVAILABLE BALANCE</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{balance.availableBalance}</div>
        </div>
      )}

      <div className="card">
        <Wallet onBalanceChanged={fetchBalance} />
      </div>
    </div>
  );
}

export default WalletPage;