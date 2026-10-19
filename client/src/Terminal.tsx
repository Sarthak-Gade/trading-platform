import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useBalance } from './context/BalanceContext';
import { apiFetch } from './api';
import { inr, signedInr, signedPct, tone } from './format';
import { useLiveQuote, useSelectedInstrument } from './hooks';
import type { Instrument, Quote } from './types';
import InstrumentSearch from './InstrumentSearch';
import PriceChart from './PriceChart';
import OrderForm from './OrderForm';
import OrderBook from './OrderBook';
import TradeBook from './TradeBook';
import Watchlist from './Watchlist';
import Alerts from './Alerts';
import Icon, { type IconName } from './Icon';

type TabId = 'orders' | 'trades' | 'alerts';
const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'orders', label: 'Orders', icon: 'list' },
  { id: 'trades', label: 'Trades', icon: 'repeat' },
  { id: 'alerts', label: 'Alerts', icon: 'bell' },
];

interface HoldingRow {
  id: string;
  qty: number;
  investedValue: string;
  instrument: { id: string };
}
interface PositionRow {
  id: string;
  productType: string;
  netQty: number;
  avgPrice: string;
  realizedPnl: string;
  instrument: { id: string };
}

const PRODUCT_LABEL: Record<string, string> = {
  MIS: 'Intraday (MIS)',
  NRML: 'Carry-forward (NRML)',
};

function Pnl({ value, base }: { value: number; base: number }) {
  const pct = base > 0 ? (value / base) * 100 : null;
  return (
    <span className={tone(value)}>
      {signedInr(value)}
      {pct !== null && ` (${signedPct(pct)})`}
    </span>
  );
}

// What you hold in the selected stock, with profit or loss at the live price
function PositionCard({ instrument, quote, refreshKey }: { instrument: Instrument; quote: Quote | null; refreshKey: number }) {
  const { token } = useAuth();
  const [data, setData] = useState<{ id: string; holding: HoldingRow | null; positions: PositionRow[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch('/api/me/holdings', token), apiFetch('/api/me/positions', token)])
      .then(([holdings, positions]: [HoldingRow[], PositionRow[]]) => {
        if (cancelled) return;
        setData({
          id: instrument.id,
          holding: holdings.find((h) => h.instrument.id === instrument.id) ?? null,
          positions: positions.filter((p) => p.instrument.id === instrument.id),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, instrument.id, refreshKey]);

  // Ignore data that belongs to a stock the user has already switched away from
  const mine = data && data.id === instrument.id ? data : null;
  const price = quote?.price ?? null;

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Your position in {instrument.symbol}</span>
      </div>

      {!mine ? (
        <div className="skeleton" style={{ width: '100%', height: 64 }} />
      ) : !mine.holding && mine.positions.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          You do not hold {instrument.symbol} yet.
        </p>
      ) : (
        <div className="kv-group">
          {mine.holding && (
            <div className="kv">
              <div className="kv-title">Delivery (CNC)</div>
              <div className="kv-row"><span>Quantity</span><b>{mine.holding.qty}</b></div>
              <div className="kv-row">
                <span>Average price</span>
                <b>{inr(Number(mine.holding.investedValue) / mine.holding.qty)}</b>
              </div>
              <div className="kv-row"><span>Invested</span><b>{inr(Number(mine.holding.investedValue))}</b></div>
              <div className="kv-row">
                <span>Current value</span>
                <b>{price !== null ? inr(price * mine.holding.qty) : '—'}</b>
              </div>
              <div className="kv-row">
                <span>Unrealised P&amp;L</span>
                <b>
                  {price !== null ? (
                    <Pnl
                      value={price * mine.holding.qty - Number(mine.holding.investedValue)}
                      base={Number(mine.holding.investedValue)}
                    />
                  ) : (
                    '—'
                  )}
                </b>
              </div>
            </div>
          )}

          {mine.positions.map((p) => {
            const avg = Number(p.avgPrice);
            return (
              <div className="kv" key={p.id}>
                <div className="kv-title">{PRODUCT_LABEL[p.productType] ?? p.productType}</div>
                <div className="kv-row"><span>Net quantity</span><b>{p.netQty}</b></div>
                <div className="kv-row"><span>Average price</span><b>{inr(avg)}</b></div>
                <div className="kv-row">
                  <span>Unrealised P&amp;L</span>
                  <b>{price !== null ? <Pnl value={(price - avg) * p.netQty} base={avg * p.netQty} /> : '—'}</b>
                </div>
                <div className="kv-row">
                  <span>Realised P&amp;L</span>
                  <b className={tone(Number(p.realizedPnl))}>{signedInr(Number(p.realizedPnl))}</b>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Terminal() {
  const { refresh: refreshBalance } = useBalance();
  const { selected, select } = useSelectedInstrument();
  const [tab, setTab] = useState<TabId>('orders');
  const [refreshKey, setRefreshKey] = useState(0);
  const { quote, error: quoteError } = useLiveQuote(selected?.id ?? null);

  const handleOrderPlaced = () => {
    refreshBalance();
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1>Trading terminal</h1>
          <p>Chart, order ticket, your position and open orders for one stock, on a single screen.</p>
        </div>
        <InstrumentSearch hotkeys onSelect={select} />
      </div>

      {selected ? (
        <div className="terminal-grid">
          <aside className="terminal-left">
            <div className="card">
              <div className="card-head">
                <span className="card-title">Watchlist</span>
              </div>
              <Watchlist selected={selected} onSelect={select} />
            </div>
          </aside>

          <section className="terminal-center">
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
                  {quote.marketState && quote.marketState !== 'REGULAR' && (
                    <span>Market closed: showing the last traded price</span>
                  )}
                </div>
              )}

              <PriceChart instrumentId={selected.id} quote={quote} />
            </div>

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
                {tab === 'orders' && <OrderBook refreshKey={refreshKey} instrumentId={selected.id} />}
                {tab === 'trades' && <TradeBook refreshKey={refreshKey} instrumentId={selected.id} />}
                {tab === 'alerts' && <Alerts instrument={selected} quote={quote} />}
              </div>
            </div>
          </section>

          <aside className="terminal-right">
            <OrderForm
              key={selected.id}
              instrument={selected}
              quote={quote}
              quoteError={quoteError}
              onOrderPlaced={handleOrderPlaced}
            />
            <PositionCard instrument={selected} quote={quote} refreshKey={refreshKey} />
          </aside>
        </div>
      ) : (
        <div className="card empty">
          <Icon name="search" size={32} />
          Search for a stock above to open it in the terminal.
        </div>
      )}
    </div>
  );
}

export default Terminal;