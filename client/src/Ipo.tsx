import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import { inr } from './format';

type Phase = 'upcoming' | 'open' | 'closed' | 'allotted';

interface Application {
  id: string;
  lots: number;
  qty: number;
  bidPrice: string;
  fundsBlocked: string;
  status: string;
}

interface IpoItem {
  id: string;
  priceMin: string;
  priceMax: string;
  lotSize: number;
  openDate: string;
  closeDate: string;
  issuePrice: string | null;
  phase: Phase;
  instrument: { symbol: string; name: string };
  myApplication: Application | null;
}

interface InstrumentHit {
  id: string;
  symbol: string;
  name: string;
}

const RETAIL_LIMIT = 200000;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_LABEL: Record<string, string> = {
  applied: 'Applied',
  allotted: 'Allotted',
  not_allotted: 'Not allotted',
  cancelled: 'Cancelled',
};

function ApplyBox({ ipo, onDone }: { ipo: IpoItem; onDone: (msg: string) => void }) {
  const { token } = useAuth();
  const [lots, setLots] = useState('1');
  const [bid, setBid] = useState(String(Number(ipo.priceMax)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lotsNum = Number(lots);
  const bidNum = Number(bid);
  const qty = Number.isInteger(lotsNum) && lotsNum > 0 ? lotsNum * ipo.lotSize : 0;
  const amount = qty * (Number.isFinite(bidNum) ? bidNum : 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiFetch(`/api/ipos/${ipo.id}/apply`, token, {
        method: 'POST',
        body: JSON.stringify({ lots: lotsNum, bidPrice: bidNum }),
      });
      onDone('Bid placed. The amount is blocked until allotment.');
    } catch (err) {
      setError(errorMessage(err, 'Could not place the bid'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ipo-apply" onSubmit={submit}>
      <label>
        <span>Lots ({ipo.lotSize} shares each)</span>
        <input type="number" min={1} step={1} value={lots} onChange={(e) => setLots(e.target.value)} />
      </label>
      <label>
        <span>Bid price (₹)</span>
        <input
          type="number"
          step="0.05"
          min={Number(ipo.priceMin)}
          max={Number(ipo.priceMax)}
          value={bid}
          onChange={(e) => setBid(e.target.value)}
        />
      </label>
      <div className="ipo-amount">
        <span>Amount to block</span>
        <strong className={amount > RETAIL_LIMIT ? 'over' : ''}>{inr(amount)}</strong>
        <small>
          {qty} shares · retail limit {inr(RETAIL_LIMIT, 0)}
        </small>
      </div>
      {error && <p className="ipo-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy || qty === 0}>
        {busy ? 'Placing...' : 'Place bid'}
      </button>
    </form>
  );
}

function AdminCreate({ onDone }: { onDone: (msg: string) => void }) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<InstrumentHit[]>([]);
  const [picked, setPicked] = useState<InstrumentHit | null>(null);
  const [form, setForm] = useState({ priceMin: '', priceMax: '', lotSize: '', openDate: '', closeDate: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
        if (picked || query.trim().length < 2) return;
    const t = setTimeout(() => {
      apiFetch(`/api/instruments/search?q=${encodeURIComponent(query.trim())}`, token)
        .then((r) => setHits(r as InstrumentHit[]))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, picked, token]);
    // Results for an old search are hidden once the box is cleared or a company is picked
  const shownHits = picked || query.trim().length < 2 ? [] : hits;

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!picked) {
      setError('Pick a company first');
      return;
    }
    if (!form.openDate || !form.closeDate) {
      setError('Choose the open and close date');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/admin/ipos', token, {
        method: 'POST',
        body: JSON.stringify({
          instrumentId: picked.id,
          priceMin: Number(form.priceMin),
          priceMax: Number(form.priceMax),
          lotSize: Number(form.lotSize),
          openDate: new Date(form.openDate).toISOString(),
          closeDate: new Date(form.closeDate).toISOString(),
        }),
      });
      setPicked(null);
      setQuery('');
      setForm({ priceMin: '', priceMax: '', lotSize: '', openDate: '', closeDate: '' });
      onDone('IPO created');
    } catch (err) {
      setError(errorMessage(err, 'Could not create the IPO'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ipo-admin" onSubmit={submit}>
      <h3>Create an IPO (admin)</h3>
      <label>
        <span>Company</span>
        {picked ? (
          <div className="ipo-picked">
            {picked.symbol} · {picked.name}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(null)}>
              Change
            </button>
          </div>
        ) : (
          <>
            <input placeholder="Search a symbol or name" value={query} onChange={(e) => setQuery(e.target.value)} />
            {shownHits.length > 0 && (
              <ul className="ipo-hits">
                {shownHits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => setPicked(h)}>
                      <b>{h.symbol}</b> <span>{h.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </label>
      <div className="ipo-grid">
        <label>
          <span>Price min (₹)</span>
          <input type="number" step="0.05" value={form.priceMin} onChange={(e) => set('priceMin', e.target.value)} />
        </label>
        <label>
          <span>Price max (₹)</span>
          <input type="number" step="0.05" value={form.priceMax} onChange={(e) => set('priceMax', e.target.value)} />
        </label>
        <label>
          <span>Lot size</span>
          <input type="number" step="1" value={form.lotSize} onChange={(e) => set('lotSize', e.target.value)} />
        </label>
        <label>
          <span>Opens</span>
          <input type="datetime-local" value={form.openDate} onChange={(e) => set('openDate', e.target.value)} />
        </label>
        <label>
          <span>Closes</span>
          <input type="datetime-local" value={form.closeDate} onChange={(e) => set('closeDate', e.target.value)} />
        </label>
      </div>
      {error && <p className="ipo-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Creating...' : 'Create IPO'}
      </button>
    </form>
  );
}

export default function Ipo() {
  const { token, isAdmin } = useAuth();
  const [ipos, setIpos] = useState<IpoItem[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Bumping reloadKey re-runs the fetch below, so a bid, cancel or allotment can refresh the list
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    apiFetch('/api/ipos', token)
      .then((data) => setIpos(data as IpoItem[]))
      .catch((err) => setError(errorMessage(err, 'Could not load IPOs')))
      .finally(() => setLoading(false));
  }, [token, reloadKey]);



  function done(msg: string) {
    setError('');
    setMessage(msg);
    void load();
  }

  async function cancel(ipo: IpoItem) {
    if (!window.confirm(`Cancel your bid for ${ipo.instrument.symbol}?`)) return;
    setError('');
    try {
      await apiFetch(`/api/ipos/${ipo.id}/cancel`, token, { method: 'POST' });
      done('Bid cancelled and funds released.');
    } catch (err) {
      setError(errorMessage(err, 'Could not cancel the bid'));
    }
  }

  async function allot(ipo: IpoItem) {
    const input = window.prompt(
      `Final issue price for ${ipo.instrument.symbol} (₹${Number(ipo.priceMin)} to ₹${Number(ipo.priceMax)}). Leave blank for the top of the band.`,
      ''
    );
    if (input === null) return;
    setError('');
    try {
      const body = input.trim() === '' ? {} : { issuePrice: Number(input) };
      const r = await apiFetch(`/api/admin/ipos/${ipo.id}/allot`, token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      done(`Allotment done at ${inr(Number(r.issuePrice))}: ${r.allotted} allotted, ${r.notAllotted} not allotted.`);
    } catch (err) {
      setError(errorMessage(err, 'Could not run the allotment'));
    }
  }

  return (
    <div className="ipo-page">
      <div className="ipo-head">
        <h2>IPOs</h2>
        <p>Bid inside the price band. Your bid amount is blocked until allotment, then the unused part is refunded.</p>
      </div>

      {message && <div className="ipo-note ok">{message}</div>}
      {error && <div className="ipo-note bad">{error}</div>}

      {isAdmin && <AdminCreate onDone={done} />}

      {loading && <div className="ipo-empty">Loading...</div>}
      {!loading && ipos.length === 0 && <div className="ipo-empty">No IPOs yet.</div>}

      <div className="ipo-list">
        {ipos.map((ipo) => {
          const app = ipo.myApplication;
          return (
            <article key={ipo.id} className={`ipo-card ${ipo.phase}`}>
              <div className="ipo-top">
                <div>
                  <strong className="ipo-symbol">{ipo.instrument.symbol}</strong>
                  <span className="ipo-name">{ipo.instrument.name}</span>
                </div>
                <span className={`ipo-phase ${ipo.phase}`}>{ipo.phase.toUpperCase()}</span>
              </div>

              <div className="ipo-facts">
                <div>
                  <span>Price band</span>
                  <b>
                    {inr(Number(ipo.priceMin))} – {inr(Number(ipo.priceMax))}
                  </b>
                </div>
                <div>
                  <span>Lot size</span>
                  <b>{ipo.lotSize} shares</b>
                </div>
                <div>
                  <span>Min. investment</span>
                  <b>{inr(ipo.lotSize * Number(ipo.priceMax))}</b>
                </div>
                <div>
                  <span>Opens</span>
                  <b>{fmtDate(ipo.openDate)}</b>
                </div>
                <div>
                  <span>Closes</span>
                  <b>{fmtDate(ipo.closeDate)}</b>
                </div>
                {ipo.issuePrice && (
                  <div>
                    <span>Issue price</span>
                    <b>{inr(Number(ipo.issuePrice))}</b>
                  </div>
                )}
              </div>

              {app && (
                <div className={`ipo-mine ${app.status}`}>
                  <span>
                    Your bid: {app.lots} lot{app.lots > 1 ? 's' : ''} ({app.qty} shares) @ {inr(Number(app.bidPrice))}
                  </span>
                  <b>{STATUS_LABEL[app.status] ?? app.status}</b>
                </div>
              )}

              {ipo.phase === 'open' && !app && <ApplyBox ipo={ipo} onDone={done} />}
              {ipo.phase === 'open' && app?.status === 'applied' && (
                <button className="btn btn-danger btn-sm" onClick={() => void cancel(ipo)}>
                  Cancel bid
                </button>
              )}
              {isAdmin && ipo.phase === 'closed' && (
                <button className="btn btn-primary btn-sm" onClick={() => void allot(ipo)}>
                  Run allotment
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}