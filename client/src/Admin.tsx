import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import { formatDateTime, inr } from './format';
import Icon, { type IconName } from './Icon';

interface RecentTrade {
  id: string;
  pricePerShare: string;
  sharesQty: number;
  totalPrice: string;
  executedAt: string;
  user: { email: string; fullName: string };
  instrument: { symbol: string };
}

interface AdminStats {
  totalUsers: number;
  totalOrders: number;
  totalTrades: number;
  pendingOrders: number;
  executedOrders: number;
  totalTradeVolume: string;
  recentTrades: RecentTrade[];
}

function Admin() {
  const { token } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/stats', token)
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load admin stats'));
  }, [token]);

  const cards: { label: string; value: string | number; icon: IconName; color: string }[] = stats
    ? [
        { label: 'Users', value: stats.totalUsers, icon: 'users', color: 'blue' },
        { label: 'Orders', value: stats.totalOrders, icon: 'list', color: 'purple' },
        { label: 'Trades', value: stats.totalTrades, icon: 'repeat', color: 'green' },
        { label: 'Pending orders', value: stats.pendingOrders, icon: 'clock', color: 'amber' },
        { label: 'Executed orders', value: stats.executedOrders, icon: 'check-circle', color: 'green' },
        { label: 'Trade volume', value: inr(Number(stats.totalTradeVolume)), icon: 'rupee', color: 'blue' },
      ]
    : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p>Platform-wide activity.</p>
        </div>
      </div>

      {error && (
        <div className="notice notice-error">
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      )}

      {stats && (
        <>
          <div className="stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {cards.map((c) => (
              <div key={c.label} className="card stat">
                <div>
                  <div className="stat-label">{c.label}</div>
                  <div className="stat-value">{c.value}</div>
                </div>
                <span className={`stat-icon ${c.color}`}><Icon name={c.icon} size={20} /></span>
              </div>
            ))}
          </div>

          <div className="card card-flush">
            <div className="card-head">
              <span className="card-title">Recent trades</span>
            </div>
            <div className="table-wrap" style={{ paddingTop: 8 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Stock</th>
                    <th className="num">Qty</th>
                    <th className="num">Price</th>
                    <th className="num">Total</th>
                    <th>Executed</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentTrades.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="strong">{t.user.fullName}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{t.user.email}</div>
                      </td>
                      <td>{t.instrument.symbol}</td>
                      <td className="num">{t.sharesQty}</td>
                      <td className="num">{inr(Number(t.pricePerShare))}</td>
                      <td className="num">{inr(Number(t.totalPrice))}</td>
                      <td className="muted nowrap">{formatDateTime(t.executedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Admin;
