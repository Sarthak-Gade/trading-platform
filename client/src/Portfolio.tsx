import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import { inr, signedInr, signedPct, tone } from './format';
import { useQuotes } from './hooks';
import Holdings, { type Holding } from './Holdings';
import Positions, { type Position } from './Positions';
import Icon from './Icon';

function Portfolio() {
  const { token } = useAuth();
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/me/holdings', token)
      .then(setHoldings)
      .catch(() => setError('Could not load holdings'));
    apiFetch('/api/me/positions', token)
      .then(setPositions)
      .catch(() => setError('Could not load positions'));
  }, [token]);

  const ids = [...(holdings ?? []), ...(positions ?? [])].map((x) => x.instrument.id);
  const quotes = useQuotes(ids);

  const invested = (holdings ?? []).reduce((s, h) => s + Number(h.investedValue), 0);
  const current = (holdings ?? []).reduce((s, h) => {
    const q = quotes[h.instrument.id];
    return s + (q ? q.price * h.qty : Number(h.investedValue));
  }, 0);
  const unrealized = current - invested;
  const unrealizedPct = invested > 0 ? (unrealized / invested) * 100 : 0;
  const realized = (positions ?? []).reduce((s, p) => s + Number(p.realizedPnl), 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Portfolio</h1>
          <p>Delivery holdings, intraday positions and your profit and loss, with live prices.</p>
        </div>
      </div>

      {error && (
        <div className="notice notice-error">
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      )}

      <div className="stats">
        <div className="card stat">
          <div>
            <div className="stat-label">Invested</div>
            <div className="stat-value">{inr(invested)}</div>
            <div className="stat-sub">{holdings?.length ?? 0} holdings</div>
          </div>
          <span className="stat-icon blue"><Icon name="briefcase" size={20} /></span>
        </div>
        <div className="card stat">
          <div>
            <div className="stat-label">Current value</div>
            <div className="stat-value">{inr(current)}</div>
            <div className="stat-sub">At live prices</div>
          </div>
          <span className="stat-icon purple"><Icon name="activity" size={20} /></span>
        </div>
        <div className="card stat">
          <div>
            <div className="stat-label">Unrealised P&amp;L</div>
            <div className={`stat-value ${tone(unrealized)}`}>{signedInr(unrealized)}</div>
            <div className={`stat-sub ${tone(unrealized)}`}>{signedPct(unrealizedPct)}</div>
          </div>
          <span className="stat-icon green"><Icon name="trending-up" size={20} /></span>
        </div>
        <div className="card stat">
          <div>
            <div className="stat-label">Realised P&amp;L</div>
            <div className={`stat-value ${tone(realized)}`}>{signedInr(realized)}</div>
            <div className="stat-sub">From closed trades</div>
          </div>
          <span className="stat-icon amber"><Icon name="rupee" size={20} /></span>
        </div>
      </div>

      <div className="card card-flush">
        <div className="card-head">
          <span className="card-title">Holdings</span>
        </div>
        <div style={{ paddingTop: 8 }}>
          {holdings ? <Holdings holdings={holdings} quotes={quotes} /> : <div className="empty">Loading…</div>}
        </div>
      </div>

      <div className="card card-flush">
        <div className="card-head">
          <span className="card-title">Positions</span>
        </div>
        <div style={{ paddingTop: 8 }}>
          {positions ? <Positions positions={positions} quotes={quotes} /> : <div className="empty">Loading…</div>}
        </div>
      </div>
    </div>
  );
}

export default Portfolio;
