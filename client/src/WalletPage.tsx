import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useBalance } from './context/BalanceContext';
import { apiFetch } from './api';
import { formatDateTime, inr } from './format';
import Icon from './Icon';

interface Transaction {
  id: string;
  type: string;
  description: string;
  amount: string;
  runningBalance: string;
  createdAt: string;
}

const CREDITS = ['deposit', 'trade_credit', 'refund'];
const QUICK = [1000, 5000, 10000, 50000];

function WalletPage() {
  const { token } = useAuth();
  const { balance, refresh } = useBalance();
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadTransactions = useCallback(() => {
    apiFetch('/api/me/transactions', token)
      .then((data: Transaction[]) => setTransactions(data))
      .catch(() => setError('Could not load the ledger'));
  }, [token]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(mode === 'deposit' ? '/api/me/deposit' : '/api/me/withdraw', token, {
        method: 'POST',
        body: JSON.stringify({ amount: value }),
      });
      setMessage(`${mode === 'deposit' ? 'Added' : 'Withdrew'} ${inr(value)} successfully`);
      setAmount('');
      loadTransactions();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Wallet &amp; Ledger</h1>
          <p>Add virtual funds, withdraw, and audit every rupee that moves.</p>
        </div>
      </div>

      <div className="card hero-balance">
        <div>
          <div className="stat-label">Available balance</div>
          <div className="amount">{balance ? inr(Number(balance.availableBalance)) : <span className="skeleton">₹0,00,000.00</span>}</div>
        </div>
        <span className="stat-icon blue" style={{ width: 54, height: 54 }}>
          <Icon name="wallet" size={26} />
        </span>
      </div>

      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)', alignItems: 'start' }}>
        <form className="card stack" onSubmit={submit}>
          <div className="seg">
            <button type="button" className={`seg-btn${mode === 'deposit' ? ' active buy' : ''}`} onClick={() => setMode('deposit')}>
              Add funds
            </button>
            <button type="button" className={`seg-btn${mode === 'withdraw' ? ' active sell' : ''}`} onClick={() => setMode('withdraw')}>
              Withdraw
            </button>
          </div>

          <div className="field">
            <label className="label" htmlFor="amount">Amount (₹)</label>
            <input
              id="amount"
              className="input"
              type="number"
              min={0}
              step="any"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="chips">
            {QUICK.map((q) => (
              <button key={q} type="button" className="chip" onClick={() => setAmount(String(q))}>
                {inr(q, 0)}
              </button>
            ))}
          </div>

          {error && (
            <div className="notice notice-error" role="alert">
              <Icon name="alert-circle" size={16} /> {error}
            </div>
          )}
          {message && (
            <div className="notice notice-success" role="status">
              <Icon name="check-circle" size={16} /> {message}
            </div>
          )}

          <button
            type="submit"
            className={`btn btn-lg btn-block ${mode === 'deposit' ? 'btn-buy' : 'btn-sell'}`}
            disabled={busy}
          >
            {busy ? 'Processing…' : mode === 'deposit' ? 'Add funds' : 'Withdraw'}
          </button>
        </form>

        <div className="card card-flush">
          <div className="card-head">
            <span className="card-title">Transaction ledger</span>
          </div>
          {!transactions ? (
            <div className="empty">Loading…</div>
          ) : transactions.length === 0 ? (
            <div className="empty">
              <Icon name="file-text" size={32} />
              No transactions yet.
            </div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="num">Amount</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => {
                    const credit = CREDITS.includes(t.type) || Number(t.amount) > 0;
                    return (
                      <tr key={t.id}>
                        <td className="muted nowrap">{formatDateTime(t.createdAt)}</td>
                        <td>
                          {t.description}
                          <div><span className="badge badge-gray">{t.type.replace('_', ' ')}</span></div>
                        </td>
                        <td className={`num ${credit ? 'up' : 'down'}`} style={{ fontWeight: 700 }}>
                          {credit ? '+' : '−'}{inr(Math.abs(Number(t.amount)))}
                        </td>
                        <td className="num">{inr(Number(t.runningBalance))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WalletPage;
