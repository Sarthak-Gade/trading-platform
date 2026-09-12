import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

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
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/stats', token)
      .then((data) => setStats(data))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Access denied');
        setTimeout(() => navigate('/dashboard'), 2000);
      });
  }, [token, navigate]);

  if (error) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <p style={{ color: 'red' }}>{error} — redirecting to dashboard...</p>
      </div>
    );
  }

  if (!stats) {
    return <div style={{ padding: '2rem' }}>Loading admin dashboard...</div>;
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Admin Dashboard</h1>

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <StatCard label="Total Users" value={stats.totalUsers} />
        <StatCard label="Total Orders" value={stats.totalOrders} />
        <StatCard label="Total Trades" value={stats.totalTrades} />
        <StatCard label="Pending Orders" value={stats.pendingOrders} />
        <StatCard label="Executed Orders" value={stats.executedOrders} />
        <StatCard label="Total Trade Volume" value={`₹${stats.totalTradeVolume}`} />
      </div>

      <h2>Recent Trades (Platform-Wide)</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '800px' }}>
        <thead>
          <tr>
            <th style={cellStyle}>User</th>
            <th style={cellStyle}>Symbol</th>
            <th style={cellStyle}>Qty</th>
            <th style={cellStyle}>Price</th>
            <th style={cellStyle}>Total</th>
            <th style={cellStyle}>Executed At</th>
          </tr>
        </thead>
        <tbody>
          {stats.recentTrades.map((t) => (
            <tr key={t.id}>
              <td style={cellStyle}>{t.user.fullName}</td>
              <td style={cellStyle}>{t.instrument.symbol}</td>
              <td style={cellStyle}>{t.sharesQty}</td>
              <td style={cellStyle}>₹{t.pricePerShare}</td>
              <td style={cellStyle}>₹{t.totalPrice}</td>
              <td style={cellStyle}>{new Date(t.executedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem', minWidth: '140px' }}>
      <div style={{ fontSize: '0.85rem', color: '#666' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{value}</div>
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '0.5rem',
  textAlign: 'left',
};

export default Admin;