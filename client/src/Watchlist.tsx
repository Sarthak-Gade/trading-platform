import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

const RELIANCE_INSTRUMENT_ID = '6bbe2977-4af6-4591-9953-18e40ffc8a82';

interface WatchlistItem {
  id: string;
  instrument: { symbol: string; name: string };
}

interface WatchlistData {
  id: string;
  name: string;
  items: WatchlistItem[];
}

interface WatchlistSummary {
  id: string;
  name: string;
}

function Watchlist() {
  const { token } = useAuth();
  const [watchlists, setWatchlists] = useState<WatchlistSummary[]>([]);
  const [activeWatchlist, setActiveWatchlist] = useState<WatchlistData | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const fetchWatchlists = () => {
    apiFetch('/api/me/watchlists', token)
      .then((data) => setWatchlists(data))
      .catch(() => setError('Could not load watchlists'));
  };

  useEffect(() => {
    fetchWatchlists();
  }, [token]);

  const fetchWatchlistDetail = (id: string) => {
    apiFetch(`/api/watchlists/${id}`, token)
      .then((data) => setActiveWatchlist(data))
      .catch(() => setError('Could not load watchlist details'));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      await apiFetch('/api/watchlists', token, {
        method: 'POST',
        body: JSON.stringify({ name: newName }),
      });
      setNewName('');
      fetchWatchlists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create watchlist');
    }
  };

  const handleAddReliance = async () => {
    if (!activeWatchlist) return;

    try {
      await apiFetch(`/api/watchlists/${activeWatchlist.id}/items`, token, {
        method: 'POST',
        body: JSON.stringify({ instrumentId: RELIANCE_INSTRUMENT_ID }),
      });
      fetchWatchlistDetail(activeWatchlist.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add instrument');
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!activeWatchlist) return;

    try {
      await apiFetch(`/api/watchlists/${activeWatchlist.id}/items/${itemId}`, token, {
        method: 'DELETE',
      });
      fetchWatchlistDetail(activeWatchlist.id);
    } catch {
      setError('Could not remove item');
    }
  };

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2>Watchlists</h2>

      <form onSubmit={handleCreate} style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="New watchlist name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ padding: '0.4rem' }}
        />
        <button type="submit" style={{ marginLeft: '0.5rem' }}>
          Create Watchlist
        </button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {watchlists.length === 0 ? (
        <p>No watchlists yet.</p>
      ) : (
        <div style={{ marginBottom: '1rem' }}>
          {watchlists.map((w) => (
            <button
              key={w.id}
              onClick={() => fetchWatchlistDetail(w.id)}
              style={{
                marginRight: '0.5rem',
                fontWeight: activeWatchlist?.id === w.id ? 'bold' : 'normal',
              }}
            >
              {w.name}
            </button>
          ))}
        </div>
      )}

      {activeWatchlist && (
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem', maxWidth: '400px' }}>
          <h3>{activeWatchlist.name}</h3>
          <button onClick={handleAddReliance} style={{ marginBottom: '0.75rem' }}>
            + Add RELIANCE
          </button>
          {activeWatchlist.items.length === 0 ? (
            <p>No instruments added yet.</p>
          ) : (
            <ul>
              {activeWatchlist.items.map((item) => (
                <li key={item.id}>
                  {item.instrument.symbol} — {item.instrument.name}{' '}
                  <button onClick={() => handleRemoveItem(item.id)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default Watchlist;