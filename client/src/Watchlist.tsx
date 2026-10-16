import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import { inr, signedPct, tone } from './format';
import { useQuotes } from './hooks';
import type { Instrument } from './types';
import InstrumentSearch from './InstrumentSearch';
import Icon from './Icon';

interface Item {
  id: string;
  instrument: Instrument;
}
interface WatchlistData {
  id: string;
  name: string;
  items: Item[];
}
interface Summary {
  id: string;
  name: string;
}

interface Props {
  selected: Instrument;
  onSelect: (instrument: Instrument) => void;
}

function Watchlist({ selected, onSelect }: Props) {
  const { token } = useAuth();
  const [lists, setLists] = useState<Summary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WatchlistData | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const loadLists = useCallback(() => {
    apiFetch('/api/me/watchlists', token)
      .then((data: Summary[]) => {
        setLists(data);
        // Open the first list by default
        setActiveId((current) => current ?? data[0]?.id ?? null);
      })
      .catch(() => setError('Could not load watchlists'));
  }, [token]);

  const loadDetail = useCallback(
    (id: string) => {
      apiFetch(`/api/watchlists/${id}`, token)
        .then((data: WatchlistData) => setDetail(data))
        .catch(() => setError('Could not load this watchlist'));
    },
    [token]
  );

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (activeId) loadDetail(activeId);
  }, [activeId, loadDetail]);

  const items = detail && detail.id === activeId ? detail.items : [];
  const quotes = useQuotes(items.map((i) => i.instrument.id));

  const createList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    try {
      const created: Summary = await apiFetch('/api/watchlists', token, {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName('');
      setActiveId(created.id);
      loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the watchlist');
    }
  };

  const addStock = async (instrument: Instrument) => {
    if (!activeId) {
      setError('Create a watchlist first');
      return;
    }
    setError('');
    try {
      await apiFetch(`/api/watchlists/${activeId}/items`, token, {
        method: 'POST',
        body: JSON.stringify({ instrumentId: instrument.id }),
      });
      loadDetail(activeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the stock');
    }
  };

  const removeItem = async (itemId: string) => {
    if (!activeId) return;
    try {
      await apiFetch(`/api/watchlists/${activeId}/items/${itemId}`, token, { method: 'DELETE' });
      loadDetail(activeId);
    } catch {
      setError('Could not remove the stock');
    }
  };

  return (
    <div className="stack">
      {error && (
        <div className="notice notice-error">
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      )}

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="pill-tabs">
          {(lists ?? []).map((l) => (
            <button
              key={l.id}
              type="button"
              className={`pill-tab${l.id === activeId ? ' active' : ''}`}
              onClick={() => setActiveId(l.id)}
            >
              {l.name}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <form className="row" onSubmit={createList}>
          <input
            className="input"
            style={{ width: 170, height: 34 }}
            placeholder="New watchlist"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="btn btn-ghost btn-sm">
            <Icon name="plus" size={14} /> Create
          </button>
        </form>
      </div>

      {activeId && (
        <InstrumentSearch compact placeholder="Add a stock to this watchlist" onSelect={addStock} />
      )}

      {lists && lists.length === 0 ? (
        <div className="empty">
          <Icon name="star" size={32} />
          Create a watchlist to track your favourite stocks.
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <Icon name="star" size={32} />
          This watchlist is empty. Search above to add a stock.
        </div>
      ) : (
        <ul className="list">
          {items.map((item) => {
            const q = quotes[item.instrument.id];
            const isSelected = item.instrument.id === selected.id;
            return (
              <li
                key={item.id}
                className="list-item clickable"
                style={isSelected ? { borderColor: 'rgba(59,130,246,0.55)' } : undefined}
                onClick={() => onSelect(item.instrument)}
              >
                <span className="symbol-chip">{item.instrument.symbol.slice(0, 2)}</span>
                <div className="list-main">
                  <strong>{item.instrument.symbol}</strong>
                  <small>{item.instrument.name}</small>
                </div>
                <div className="list-end">
                  <strong>{q ? inr(q.price) : '—'}</strong>
                  {q && q.changePercent !== null && (
                    <small className={tone(q.changePercent)}>{signedPct(q.changePercent)}</small>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label={`Remove ${item.instrument.symbol}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeItem(item.id);
                  }}
                >
                  <Icon name="x" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default Watchlist;
