import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useBalance } from './context/BalanceContext';
import { apiFetch } from './api';
import { inr, signedInr, signedPct, tone } from './format';
import { useLiveQuote } from './hooks';
import type { Instrument } from './types';
import InstrumentSearch from './InstrumentSearch';
import PriceChart from './PriceChart';
import OrderForm from './OrderForm';
import OrderBook from './OrderBook';
import TradeBook from './TradeBook';
import Watchlist from './Watchlist';
import Alerts from './Alerts';
import Icon, { type IconName } from './Icon';

const SELECTED_KEY = 'selectedInstrument';
const DEFAULT_SYMBOL = 'RELIANCE';

type TabId = 'orders' | 'trades' | 'watchlist' | 'alerts';
const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'orders', label: 'Orders', icon: 'list' },
  { id: 'trades', label: 'Trades', icon: 'repeat' },
  { id: 'watchlist', label: 'Watchlist', icon: 'star' },
  { id: 'alerts', label: 'Alerts', icon: 'bell' },
];

function readSelected(): Instrument | null {
  try {
    const raw = localStorage.getItem(SELECTED_KEY);
    return raw ? (JSON.parse(raw) as Instrument) : null;
  } catch {
    return null;
  }
}

interface Summary {
  invested: number;
  realized: number;
  pending: number;
}

function Dashboard() {
  const { token, user } = useAuth();
  const { balance, refresh: refreshBalance } = useBalance();
  const [selected, setSelected] = useState<Instrument | null>(readSelected);
  const [tab, setTab] = useState<TabId>('orders');
  const [refreshKey, setRefreshKey] = useState(0);
  const [needsKyc, setNeedsKyc] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const { quote, error: quoteError } = useLiveQuote(selected?.id ?? null);

  const select = useCallback((instrument: Instrument) => {
    setSelected(instrument);
    try {
      localStorage.setItem(SELECTED_KEY, JSON.stringify(instrument));
    } catch {
      // storage can be blocked; the choice just won't be remembered
    }
  }, []);

  // First visit: open on RELIANCE
  useEffect(() => {
    if (selected || !token) return;
    apiFetch(`/api/instruments/search?q=${DEFAULT_SYMBOL}`, token)
      .then((items: Instrument[]) => {
        const match = items.find((i) => i.symbol.toUpperCase().startsWith(DEFAULT_SYMBOL)) ?? items[0];
        if (match) select(match);
      })
      .catch(() => undefined);
  }, [selected, token, select]);

  // KYC banner
  useEffect(() => {
    apiFetch('/api/me/account', token)
      .then(() => setNeedsKyc(false))
      .catch((err) => setNeedsKyc(err instanceof Error && /not found/i.test(err.message)));
  }, [token]);

  // Numbers for the stat cards; reload after every order
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch('/api/me/holdings', token),
      apiFetch('/api/me/positions', token),
      apiFetch('/api/me/orders', token),
    ])
      .then(([holdings, positions, orders]) => {
        if (cancelled) return;
        setSummary({
          invested: holdings.reduce((s: number, h: { investedValue: string }) => s + Number(h.investedValue), 0),
          realized: positions.reduce((s: number, p: { realizedPnl: string }) => s + Number(p.realizedPnl), 0),
          pending: orders.filter((o: { status: string }) => o.status === 'pending').length,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  const handleOrderPlaced = () => {
    refreshBalance();
    setRefreshKey((k) => k + 1);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.fullName ?? 'Trader').split(' ')[0];

  const available = balance ? Number(balance.availableBalance) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>
            {greeting}, {firstName}
          </h1>
          <p>Search a stock, watch it live and place an order in seconds.</p>
        </div>
        <InstrumentSearch hotkeys onSelect={select} />
      </div>

      {needsKyc && (
        <div className="banner">
          <Icon name="shield" size={22} />
          <div style={{ flex: 1 }}>
            <strong>Complete your KYC profile</strong>
            <p>Add your PAN and personal details to finish setting up your account.</p>
          </div>
          <Link to="/profile" className="btn btn-primary btn-sm">
            Complete KYC
          </Link>
        </div>
      )}

      <div className="stats">
        <div className="card stat">
          <div>
            <div className="stat-label">Available balance</div>
            <div className="stat-value">{available !== null ? inr(available) : <span className="skeleton">0</span>}</div>
            <div className="stat-sub">Ready to trade</div>
          </div>
          <span className="stat-icon blue"><Icon name="wallet" size={20} /></span>
        </div>
        <div className="card stat">
          <div>
            <div className="stat-label">Invested (delivery)</div>
            <div className="stat-value">{summary ? inr(summary.invested) : <span className="skeleton">0</span>}</div>
            <div className="stat-sub">At buy price</div>
          </div>
          <span className="stat-icon purple"><Icon name="briefcase" size={20} /></span>
        </div>
        <div className="card stat">
          <div>
            <div className="stat-label">Realised P&amp;L</div>
            <div className={`stat-value ${summary ? tone(summary.realized) : ''}`}>
              {summary ? signedInr(summary.realized) : <span className="skeleton">0</span>}
            </div>
            <div className="stat-sub">From closed positions</div>
          </div>
          <span className="stat-icon green"><Icon name="trending-up" size={20} /></span>
        </div>
        <div className="card stat">
          <div>
            <div className="stat-label">Pending orders</div>
            <div className="stat-value">{summary ? summary.pending : <span className="skeleton">0</span>}</div>
            <div className="stat-sub">Waiting to execute</div>
          </div>
          <span className="stat-icon amber"><Icon name="clock" size={20} /></span>
        </div>
      </div>

      {selected ? (
        <div className="trade-grid">
          <div className="card">
            <div className="quote-head">
              <div className="quote-title">
                <span className="symbol-chip">{selected.symbol.slice(0, 2)}</span>
                <div>
                  <h2>{selected.symbol}</h2>
                  <p>{selected.name}</p>
                </div>
              </div>
              <div className="quote-price">
                {quote ? (
                  <>
                    <div className="big">{inr(quote.price)}</div>
                    {quote.change !== null && quote.changePercent !== null && (
                      <span className={`delta ${tone(quote.change)}`}>
                        <Icon name={quote.change >= 0 ? 'arrow-up-right' : 'arrow-down-right'} size={14} />
                        {signedInr(quote.change)} ({signedPct(quote.changePercent)})
                      </span>
                    )}
                  </>
                ) : quoteError ? (
                  <span className="down" style={{ fontSize: 13 }}>{quoteError}</span>
                ) : (
                  <div className="big"><span className="skeleton">₹0000.00</span></div>
                )}
              </div>
            </div>

            {quote && (
              <div className="quote-meta">
                {quote.previousClose !== null && <span>Prev close <b>{inr(quote.previousClose)}</b></span>}
                {quote.dayHigh !== null && <span>High <b>{inr(quote.dayHigh)}</b></span>}
                {quote.dayLow !== null && <span>Low <b>{inr(quote.dayLow)}</b></span>}
                {quote.marketState && quote.marketState !== 'REGULAR' && <span>Last traded price (market not in regular session)</span>}
              </div>
            )}

            <PriceChart instrumentId={selected.id} quote={quote} />
          </div>

          <OrderForm
            key={selected.id}
            instrument={selected}
            quote={quote}
            quoteError={quoteError}
            onOrderPlaced={handleOrderPlaced}
          />
        </div>
      ) : (
        <div className="card empty">
          <Icon name="search" size={32} />
          Search for a stock above to see its live chart and trade it.
        </div>
      )}

      <div className="card card-flush">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={16} /> {t.label}
            </button>
          ))}
        </div>
        <div className="tab-panel" key={tab}>
          {tab === 'orders' && <OrderBook refreshKey={refreshKey} />}
          {tab === 'trades' && <TradeBook refreshKey={refreshKey} />}
          {tab === 'watchlist' && selected && <Watchlist selected={selected} onSelect={select} />}
          {tab === 'alerts' && selected && <Alerts instrument={selected} quote={quote} />}
          {(tab === 'watchlist' || tab === 'alerts') && !selected && (
            <div className="empty">Pick a stock first.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
