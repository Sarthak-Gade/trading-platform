import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { API_BASE, apiFetch } from './api';
import { inr } from './format';
import Icon from './Icon';

interface NoteDay {
  date: string; // YYYY-MM-DD, Indian time
  trades: number;
  buyValue: number;
  sellValue: number;
  charges: number;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function prettyDate(date: string): string {
  // Noon avoids the date shifting across time zones
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default function ContractNotes() {
  const { token } = useAuth();
  const [days, setDays] = useState<NoteDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyDate, setBusyDate] = useState('');
  const [pickDate, setPickDate] = useState(todayIst());

  useEffect(() => {
    apiFetch('/api/me/contract-notes', token)
      .then((data) => setDays(data as NoteDay[]))
      .catch((err) => setError(errorMessage(err, 'Could not load your contract notes')))
      .finally(() => setLoading(false));
  }, [token]);

  // The PDF route needs the login token, so it is fetched here and saved as a file
  async function download(date: string) {
    setError('');
    setBusyDate(date);
    try {
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/api/me/contract-notes/${date}/pdf`, {
          headers: { Authorization: `Bearer ${token ?? ''}` },
        });
      } catch {
        throw new Error('Could not connect to the server. Is it running?');
      }

      if (!res.ok) {
        if (res.status === 401) window.dispatchEvent(new Event('auth:expired'));
        let message = 'Could not download the contract note';
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // not JSON
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `contract-note-${date}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err, 'Could not download the contract note'));
    } finally {
      setBusyDate('');
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Contract notes</h1>
          <p>A PDF statement for every day you traded: each trade, the charges, and the net amount. It is also emailed to you after market close.</p>
        </div>
      </div>

      {error && (
        <div className="notice notice-error" role="alert">
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <span className="card-title">Download for a date</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            type="date"
            style={{ maxWidth: 200 }}
            value={pickDate}
            max={todayIst()}
            onChange={(e) => setPickDate(e.target.value)}
          />
          <button
            className="btn btn-primary"
            disabled={!pickDate || busyDate === pickDate}
            onClick={() => void download(pickDate)}
          >
            <Icon name="file-text" size={16} /> {busyDate === pickDate ? 'Preparing...' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="card card-flush">
        <div className="card-head">
          <span className="card-title">Days you traded</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Trades</th>
                <th>Buy value</th>
                <th>Sell value</th>
                <th>Charges</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6}>Loading...</td>
                </tr>
              )}
              {!loading && days.length === 0 && (
                <tr>
                  <td colSpan={6}>No trades yet. Your contract notes appear here after your first trade.</td>
                </tr>
              )}
              {days.map((d) => (
                <tr key={d.date}>
                  <td>{prettyDate(d.date)}</td>
                  <td>{d.trades}</td>
                  <td>{inr(d.buyValue)}</td>
                  <td>{inr(d.sellValue)}</td>
                  <td>{inr(d.charges)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busyDate === d.date}
                      onClick={() => void download(d.date)}
                    >
                      {busyDate === d.date ? 'Preparing...' : 'Download PDF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}