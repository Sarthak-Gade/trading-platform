import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

const RELIANCE_INSTRUMENT_ID = '6bbe2977-4af6-4591-9953-18e40ffc8a82';

interface Alert {
  id: string;
  triggerPrice: string;
  condition: string;
  status: string;
  instrument: {
    symbol: string;
  };
}

function Alerts() {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [triggerPrice, setTriggerPrice] = useState(100000);
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');

  const fetchAlerts = () => {
    apiFetch('/api/me/alerts', token)
      .then((data) => setAlerts(data))
      .catch(() => setError('Could not load alerts'));
  };

  useEffect(() => {
    fetchAlerts();
  }, [token]);

  useEffect(() => {
    const socket = io('http://localhost:5000');

    socket.on('alertTriggered', (data: { alertId: string; price: number }) => {
      setNotification(`Alert triggered! Price hit ${data.price}`);
      fetchAlerts();
      setTimeout(() => setNotification(''), 5000);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await apiFetch('/api/alerts', token, {
        method: 'POST',
        body: JSON.stringify({
          instrumentId: RELIANCE_INSTRUMENT_ID,
          triggerPrice,
          condition,
        }),
      });
      fetchAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create alert');
    }
  };

  const handleDelete = async (alertId: string) => {
    try {
      await apiFetch(`/api/alerts/${alertId}`, token, { method: 'DELETE' });
      fetchAlerts();
    } catch {
      setError('Could not delete alert');
    }
  };

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2>Price Alerts</h2>

      {notification && (
        <div style={{ background: '#fff3cd', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem' }}>
          {notification}
        </div>
      )}

      <form onSubmit={handleCreate} style={{ marginBottom: '1rem' }}>
        <select value={condition} onChange={(e) => setCondition(e.target.value as 'above' | 'below')}>
          <option value="above">Above</option>
          <option value="below">Below</option>
        </select>
        <input
          type="number"
          value={triggerPrice}
          onChange={(e) => setTriggerPrice(Number(e.target.value))}
          style={{ width: '120px', marginLeft: '0.5rem' }}
        />
        <button type="submit" style={{ marginLeft: '0.5rem' }}>
          Set Alert
        </button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {alerts.length === 0 ? (
        <p>No alerts set.</p>
      ) : (
        <ul>
          {alerts.map((a) => (
            <li key={a.id}>
              {a.instrument.symbol} — {a.condition} ₹{a.triggerPrice} —{' '}
              <strong>{a.status}</strong>{' '}
              <button onClick={() => handleDelete(a.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Alerts;