import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

interface Transaction {
  id: string;
  type: string;
  description: string;
  amount: string;
  runningBalance: string;
  createdAt: string;
}

function Wallet({ onBalanceChanged }: { onBalanceChanged: () => void }) {
  const { token } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchTransactions = () => {
    apiFetch('/api/me/transactions', token)
      .then((data) => setTransactions(data))
      .catch(() => setError('Could not load transaction history'));
  };

  useEffect(() => {
    fetchTransactions();
  }, [token]);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      await apiFetch('/api/me/deposit', token, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(depositAmount) }),
      });
      setMessage(`Deposited ₹${depositAmount} successfully`);
      setDepositAmount('');
      fetchTransactions();
      onBalanceChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      await apiFetch('/api/me/withdraw', token, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(withdrawAmount) }),
      });
      setMessage(`Withdrew ₹${withdrawAmount} successfully`);
      setWithdrawAmount('');
      fetchTransactions();
      onBalanceChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    }
  };

  const typeColor = (type: string) => {
    if (type === 'deposit' || type === 'trade_credit') return '#26a69a';
    if (type === 'withdrawal' || type === 'trade_debit' || type === 'charges') return '#ef5350';
    return '#e4e6eb';
  };

  return (
    <div>
      <h2>Wallet & Ledger</h2>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <form onSubmit={handleDeposit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="number"
            placeholder="Amount"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            required
            style={{ padding: '0.4rem', width: '120px' }}
          />
          <button type="submit" style={{ background: '#26a69a' }}>Deposit</button>
        </form>

        <form onSubmit={handleWithdraw} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="number"
            placeholder="Amount"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            required
            style={{ padding: '0.4rem', width: '120px' }}
          />
          <button type="submit" style={{ background: '#ef5350' }}>Withdraw</button>
        </form>
      </div>

      {error && <p style={{ color: '#ef5350' }}>{error}</p>}
      {message && <p style={{ color: '#26a69a' }}>{message}</p>}

      <h3 style={{ fontSize: '0.9rem', color: '#9098ac', marginTop: '1.5rem' }}>Transaction Ledger</h3>
      {transactions.length === 0 ? (
        <p>No transactions yet.</p>
      ) : (
        <table style={{ width: '100%', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Date</th>
              <th style={cellStyle}>Description</th>
              <th style={cellStyle}>Type</th>
              <th style={cellStyle}>Amount</th>
              <th style={cellStyle}>Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td style={cellStyle}>{new Date(t.createdAt).toLocaleString()}</td>
                <td style={cellStyle}>{t.description}</td>
                <td style={cellStyle}>{t.type}</td>
                <td style={{ ...cellStyle, color: typeColor(t.type), fontWeight: 'bold' }}>
                  {Number(t.amount) >= 0 ? '+' : ''}₹{t.amount}
                </td>
                <td style={cellStyle}>₹{t.runningBalance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #2a2f42',
  padding: '0.5rem',
  textAlign: 'left',
};

export default Wallet;