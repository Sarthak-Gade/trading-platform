import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import InstrumentSearch from './InstrumentSearch';

interface Quote {
  symbol: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  marketState: string | null;
}

const BROKERAGE_FLAT_FEE = 20; // keep in sync with the server
const QUOTE_REFRESH_MS = 5000;

function OrderForm({ onOrderPlaced }: { onOrderPlaced: () => void }) {
  const { token } = useAuth();
  const [type, setType] = useState<'buy' | 'sell'>('buy');
  const [productType, setProductType] = useState<'CNC' | 'MIS'>('CNC');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [qty, setQty] = useState(1);
  const [limitPrice, setLimitPrice] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedInstrument, setSelectedInstrument] = useState<{ id: string; symbol: string } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load the live price when a stock is selected, then refresh it every few seconds
  useEffect(() => {
    if (!selectedInstrument) return;

    let cancelled = false;

    const loadQuote = () => {
      apiFetch(`/api/instruments/${selectedInstrument.id}/quote`, token)
        .then((data: Quote) => {
          if (cancelled) return;
          setQuote(data);
          setQuoteError('');
          // Pre-fill the limit price once, with the current market price
          setLimitPrice((prev) => (prev === '' ? data.price.toFixed(2) : prev));
        })
        .catch((err) => {
          if (cancelled) return;
          setQuoteError(err instanceof Error ? err.message : 'Live price unavailable right now');
        });
    };

    loadQuote();
    const timer = setInterval(loadQuote, QUOTE_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedInstrument, token]);

  const handleSelect = (inst: { id: string; symbol: string }) => {
    setSelectedInstrument({ id: inst.id, symbol: inst.symbol });
    setQuote(null);
    setQuoteError('');
    setLimitPrice('');
    setError('');
    setMessage('');
  };

  // The price this order would use: live price for market, typed price for limit
  const effectivePrice = orderType === 'market' ? (quote?.price ?? null) : Number(limitPrice);
  const priceIsValid = effectivePrice !== null && Number.isFinite(effectivePrice) && effectivePrice > 0;
  const estimatedValue = priceIsValid ? effectivePrice * qty : null;

  // For limit orders: would this fill right now, or wait for the price to move?
  const limitFillsNow =
    orderType === 'limit' && quote && priceIsValid
      ? type === 'buy'
        ? quote.price <= effectivePrice
        : quote.price >= effectivePrice
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedInstrument) {
      setError('Please select a stock first');
      return;
    }
    if (!priceIsValid) {
      setError(orderType === 'market' ? 'Waiting for the live price…' : 'Enter a valid limit price');
      return;
    }

    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      // The server fills market orders (and limit orders whose price is already reachable) right away.
      // Other limit orders stay pending until the price reaches the limit.
      const result = await apiFetch('/api/orders', token, {
        method: 'POST',
        body: JSON.stringify({
          instrumentId: selectedInstrument.id,
          type,
          orderType,
          productType,
          qty,
          // Market orders are priced by the server from the live quote, so no price is sent
          ...(orderType === 'limit' ? { orderPrice: Number(limitPrice) } : {}),
          validity: 'DAY',
        }),
      });

      if (result.trade) {
        setMessage(
          `${type === 'buy' ? 'Bought' : 'Sold'} ${qty} ${selectedInstrument.symbol} at ₹${Number(
            result.trade.pricePerShare
          ).toFixed(2)}`
        );
      } else {
        setMessage(
          `Limit order placed. It will ${type === 'buy' ? 'buy' : 'sell'} ${qty} ${
            selectedInstrument.symbol
          } when the price ${type === 'buy' ? 'falls to' : 'rises to'} ₹${Number(limitPrice).toFixed(
            2
          )}. You can cancel it in the Order Book.`
        );
      }
      onOrderPlaced();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setSubmitting(false);
    }
  };

  const changeColor = quote && quote.change !== null && quote.change < 0 ? '#ef5350' : '#26a69a';

  return (
    <div style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px', maxWidth: '400px' }}>
      <h2>Place Order {selectedInstrument ? `— ${selectedInstrument.symbol}` : ''}</h2>
      <InstrumentSearch onSelect={handleSelect} />

      {selectedInstrument && (
        <div style={{ margin: '0.75rem 0', padding: '0.75rem', borderRadius: '6px', background: '#131722' }}>
          {quote ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 700 }}>₹{quote.price.toFixed(2)}</span>
                {quote.change !== null && quote.changePercent !== null && (
                  <span style={{ color: changeColor, fontSize: '0.9rem' }}>
                    {quote.change >= 0 ? '+' : ''}
                    {quote.change.toFixed(2)} ({quote.changePercent >= 0 ? '+' : ''}
                    {quote.changePercent.toFixed(2)}%)
                  </span>
                )}
              </div>
              {quote.dayLow !== null && quote.dayHigh !== null && (
                <div style={{ fontSize: '0.8rem', color: '#9098ac', marginTop: '0.25rem' }}>
                  Day range: ₹{quote.dayLow.toFixed(2)} – ₹{quote.dayHigh.toFixed(2)}
                </div>
              )}
              {quote.marketState && quote.marketState !== 'REGULAR' && (
                <div style={{ fontSize: '0.8rem', color: '#9098ac', marginTop: '0.25rem' }}>
                  Market is not in a regular session — this is the last traded price.
                </div>
              )}
            </>
          ) : quoteError ? (
            <span style={{ color: '#ef5350', fontSize: '0.9rem' }}>{quoteError}</span>
          ) : (
            <span style={{ color: '#9098ac', fontSize: '0.9rem' }}>Loading live price…</span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>Type: </label>
          <select value={type} onChange={(e) => setType(e.target.value as 'buy' | 'sell')}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label>Product: </label>
          <select value={productType} onChange={(e) => setProductType(e.target.value as 'CNC' | 'MIS')}>
            <option value="CNC">CNC (Delivery)</option>
            <option value="MIS">MIS (Intraday)</option>
          </select>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label>Order: </label>
          <select value={orderType} onChange={(e) => setOrderType(e.target.value as 'market' | 'limit')}>
            <option value="market">Market (at live price)</option>
            <option value="limit">Limit (my price)</option>
          </select>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label>Quantity: </label>
          <input
            type="number"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
            style={{ width: '80px' }}
          />
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label>Price: ₹</label>
          {orderType === 'market' ? (
            <input
              type="text"
              value={quote ? quote.price.toFixed(2) : 'At market'}
              disabled
              style={{ width: '100px' }}
            />
          ) : (
            <input
              type="number"
              min={0}
              step="0.05"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              style={{ width: '100px' }}
            />
          )}
        </div>

        {limitFillsNow !== null && (
          <p style={{ fontSize: '0.85rem', color: limitFillsNow ? '#26a69a' : '#b8860b', margin: '0 0 0.75rem' }}>
            {limitFillsNow
              ? 'This price is already reachable, so the order will fill right away at the current price.'
              : `The order will wait until the price ${type === 'buy' ? 'falls to' : 'rises to'} ₹${Number(limitPrice).toFixed(
                  2
                )}${type === 'buy' ? ', and the amount is held from your balance until then' : ''}.`}
          </p>
        )}

        {estimatedValue !== null && (
          <p style={{ fontSize: '0.85rem', color: '#9098ac', margin: '0 0 0.75rem' }}>
            Approx. value: ₹{estimatedValue.toFixed(2)} + ₹{BROKERAGE_FLAT_FEE} brokerage
          </p>
        )}

        {error && <p style={{ color: 'red' }}>{error}</p>}
        {message && <p style={{ color: 'green' }}>{message}</p>}

        <button type="submit" disabled={submitting || !selectedInstrument}>
          {submitting ? 'Placing…' : type === 'buy' ? 'Buy' : 'Sell'}
        </button>
      </form>
    </div>
  );
}

export default OrderForm;
