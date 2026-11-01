import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import { inr, signedInr, signedPct, tone } from './format';
import { useSelectedInstrument } from './hooks';
import CandleChart from './CandleChart';
import Icon from './Icon';

interface IndexQuote {
  key: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  prevClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  marketState: string | null;
}

interface Member {
  instrumentId: string | null;
  symbol: string;
  name: string;
  industry: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

interface Constituents {
  key: string;
  name: string;
  members: Member[];
  stale: boolean;
  note?: string;
}

type SortMode = 'gainers' | 'losers' | 'name';
const REFRESH_MS = 15_000;

function Indices() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { select } = useSelectedInstrument();

  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [indicesError, setIndicesError] = useState('');
  const [selectedKey, setSelectedKey] = useState('NIFTY50');
  const [constituents, setConstituents] = useState<Constituents | null>(null);
  const [membersError, setMembersError] = useState<{ key: string; message: string } | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('gainers');

  // Index quotes, refreshed every 15 seconds
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => {
      apiFetch('/api/market/indices', token)
        .then((res: { indices: IndexQuote[] }) => {
          if (cancelled) return;
          setIndices(res.indices);
          setIndicesError('');
        })
        .catch((err) => {
          if (!cancelled) setIndicesError(err instanceof Error ? err.message : 'Could not load the indices');
        });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  // Members of the selected index
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => {
      apiFetch(`/api/market/indices/${encodeURIComponent(selectedKey)}/constituents`, token)
        .then((res: Constituents) => {
          if (cancelled) return;
          setConstituents(res);
          setMembersError(null);
        })
        .catch((err) => {
          if (!cancelled) {
            setMembersError({ key: selectedKey, message: err instanceof Error ? err.message : 'Could not load the stocks' });
          }
        });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, selectedKey]);

  const active = indices.find((i) => i.key === selectedKey) ?? null;
  const members = constituents && constituents.key === selectedKey ? constituents : null;

  const rows = useMemo(() => {
    if (!members) return [];
    const q = search.trim().toLowerCase();
    const list = members.members.filter(
      (m) => !q || m.symbol.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
    );
    const pct = (m: Member) => m.changePercent ?? 0;
    if (sort === 'gainers') return [...list].sort((a, b) => pct(b) - pct(a));
    if (sort === 'losers') return [...list].sort((a, b) => pct(a) - pct(b));
    return [...list].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [members, search, sort]);

  const advancing = members ? members.members.filter((m) => (m.change ?? 0) > 0).length : 0;
  const declining = members ? members.members.filter((m) => (m.change ?? 0) < 0).length : 0;

  function openInTerminal(m: Member) {
    if (!m.instrumentId) return;
    select({ id: m.instrumentId, symbol: m.symbol, name: m.name });
    navigate('/terminal');
  }

  const membersMessage = membersError && membersError.key === selectedKey ? membersError.message : '';

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1>Indices</h1>
          <p>Live index levels, candlestick charts with pattern markers, and the stocks inside each index.</p>
        </div>
      </div>

      {indicesError && (
        <div className="notice notice-error" role="alert">
          <Icon name="alert-circle" size={16} /> {indicesError}
        </div>
      )}

      <div className="index-grid">
        {indices.length === 0 && !indicesError
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="index-card skeleton" style={{ height: 92 }} />)
          : indices.map((ix) => (
              <button
                key={ix.key}
                type="button"
                className={`index-card${ix.key === selectedKey ? ' active' : ''}`}
                onClick={() => setSelectedKey(ix.key)}
              >
                <span className="index-name">{ix.name}</span>
                <span className="index-price">{ix.price !== null ? inr(ix.price) : '—'}</span>
                {ix.change !== null && ix.changePercent !== null ? (
                  <span className={`delta ${tone(ix.change)}`}>
                    <Icon name={ix.change >= 0 ? 'arrow-up-right' : 'arrow-down-right'} size={14} />
                    {signedInr(ix.change)} ({signedPct(ix.changePercent)})
                  </span>
                ) : (
                  <span className="muted">No change data</span>
                )}
              </button>
            ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <span className="card-title">{active?.name ?? selectedKey}</span>
          {active && active.dayHigh !== null && active.dayLow !== null && (
            <span className="muted" style={{ fontSize: 12 }}>
              Day range {inr(active.dayLow)} – {inr(active.dayHigh)}
            </span>
          )}
        </div>
        <CandleChart key={selectedKey} kind="index" id={selectedKey} />
      </div>

      <div className="card card-flush">
        <div className="card-head">
          <span className="card-title">
            Stocks in {active?.name ?? selectedKey}
            {members && members.members.length > 0 && (
              <small className="muted"> · <span className="up">{advancing} up</span> · <span className="down">{declining} down</span></small>
            )}
          </span>
          <div className="index-controls">
            <input
              className="input"
              placeholder="Search a stock"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 200 }}
            />
            <div className="pill-tabs">
              {(['gainers', 'losers', 'name'] as SortMode[]).map((s) => (
                <button key={s} type="button" className={`pill-tab${sort === s ? ' active' : ''}`} onClick={() => setSort(s)}>
                  {s === 'gainers' ? 'Top gainers' : s === 'losers' ? 'Top losers' : 'A–Z'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {membersMessage && (
          <div className="notice notice-error" role="alert" style={{ margin: 12 }}>
            <Icon name="alert-circle" size={16} /> {membersMessage}
          </div>
        )}
        {members?.stale && <p className="muted" style={{ padding: '0 16px' }}>Prices may be a little old.</p>}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Company</th>
                <th>Industry</th>
                <th>Price</th>
                <th>Change</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!members && !membersMessage && (
                <tr><td colSpan={6}>Loading...</td></tr>
              )}
              {members && members.members.length === 0 && (
                <tr><td colSpan={6}>{members.note ?? 'No stocks to show for this index.'}</td></tr>
              )}
              {members && members.members.length > 0 && rows.length === 0 && (
                <tr><td colSpan={6}>No stock matches "{search}".</td></tr>
              )}
              {rows.map((m) => (
                <tr key={m.symbol}>
                  <td><b>{m.symbol}</b></td>
                  <td>{m.name}</td>
                  <td>{m.industry || '—'}</td>
                  <td>{m.price !== null ? inr(m.price) : '—'}</td>
                  <td className={tone(m.change)}>
                    {m.change !== null && m.changePercent !== null ? `${signedInr(m.change)} (${signedPct(m.changePercent)})` : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={!m.instrumentId}
                      title={m.instrumentId ? '' : 'This stock is not in the TradeSim instrument list'}
                      onClick={() => openInTerminal(m)}
                    >
                      Trade
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

export default Indices;