import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './context/AuthContext';
import { API_BASE, apiFetch } from './api';
import { inr } from './format';
import type { Instrument, Quote } from './types';
import Icon from './Icon';

interface Alert {
  id: string;
  triggerPrice: string;
  condition: string;
  status: string;
  instrument: { symbol: string };
}

// Price alerts for the stock currently selected on the dashboard
function Alerts({ instrument, quote }: { instrument: Instrument; quote: Quote | null }) {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [triggerPrice, setTriggerPrice] = useState('');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    apiFetch('/api/me/alerts', token)
      .then((data: Alert[]) => setAlerts(data))
      .catch(() => setError('Could not load alerts'));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = io(API_BASE);
    let timer: ReturnType<typeof setTimeout> | undefined;
    socket.on('alertTriggered', (data: { alertId: string; price: number }) => {
      setToast(`Alert triggered at ${inr(data.price)}`);
      load();
      clearTimeout(timer);
      timer = setTimeout(() => setToast(''), 6000);
    });
    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const price = Number(triggerPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setError('Enter a valid trigger price');
      return;
    }
    try {
      await apiFetch('/api/alerts', token, {
        method: 'POST',
        body: JSON.stringify({ instrumentId: instrument.id, triggerPrice: price, condition }),
      });
      setTriggerPrice('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the alert');
    }
  };

  const remove = async (id: string) => {
    try {
      await apiFetch(`/api/alerts/${id}`, token, { method: 'DELETE' });
      load();
    } catch {
      setError('Could not delete the alert');
    }
  };

  return (
    <div className="stack">
      {toast && (
        <div className="notice notice-warn toast" role="status">
          <Icon name="bell" size={16} /> {toast}
        </div>
      )}

      <form className="inline-form" onSubmit={create}>
        <div className="field" style={{ maxWidth: 140 }}>
          <label className="label" htmlFor="alert-cond">{instrument.symbol} goes</label>
          <select
            id="alert-cond"
            className="input"
            value={condition}
            onChange={(e) => setCondition(e.target.value as 'above' | 'below')}
          >
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="alert-price">Trigger price (₹)</label>
          <input
            id="alert-price"
            className="input"
            type="number"
            min={0}
            step="0.05"
            placeholder={quote ? quote.price.toFixed(2) : 'Price'}
            value={triggerPrice}
            onChange={(e) => setTriggerPrice(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary">
          <Icon name="plus" size={16} /> Set alert
        </button>
      </form>

      {error && (
        <div className="notice notice-error">
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      )}

      {alerts && alerts.length === 0 ? (
        <div className="empty">
          <Icon name="bell" size={32} />
          No alerts yet.
        </div>
      ) : (
        <ul className="list">
          {(alerts ?? []).map((a) => (
            <li key={a.id} className="list-item">
              <span className="symbol-chip">{a.instrument.symbol.slice(0, 2)}</span>
              <div className="list-main">
                <strong>{a.instrument.symbol}</strong>
                <small>
                  {a.condition === 'above' ? 'Rises above' : 'Falls below'} {inr(Number(a.triggerPrice))}
                </small>
              </div>
              <span className={`badge ${a.status === 'triggered' ? 'badge-green' : 'badge-blue'}`}>{a.status}</span>
              <button type="button" className="icon-btn danger" aria-label="Delete alert" onClick={() => remove(a.id)}>
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Alerts;
