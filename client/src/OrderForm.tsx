import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import { inr } from './format';
import type { Charges, Instrument, Quote } from './types';
import Icon from './Icon';

interface Props {
  instrument: Instrument;
  quote: Quote | null;
  quoteError: string;
  onOrderPlaced: () => void;
}

function OrderForm({ instrument, quote, quoteError, onOrderPlaced }: Props) {
  const { token } = useAuth();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [productType, setProductType] = useState<'CNC' | 'MIS'>('CNC');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [qty, setQty] = useState(1);
  const [limitPrice, setLimitPrice] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [chargesResult, setChargesResult] = useState<{ key: string; data: Charges } | null>(null);

  // The price this order would use: live price for market, typed price for limit
  const limitValue = Number(limitPrice);
  const effectivePrice = orderType === 'market' ? (quote?.price ?? null) : limitValue;
  const priceIsValid = effectivePrice !== null && Number.isFinite(effectivePrice) && effectivePrice > 0;

  // A breakdown only shows while it still matches the current inputs
  const chargesKey = `${instrument.id}|${side}|${productType}|${qty}|${effectivePrice}`;
  const charges = priceIsValid && chargesResult?.key === chargesKey ? chargesResult.data : null;

  // Ask the server for the exact charges, so the formula lives in one place only
  useEffect(() => {
    if (!priceIsValid || effectivePrice === null) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      apiFetch(
        `/api/charges/estimate?direction=${side}&productType=${productType}&quantity=${qty}&price=${effectivePrice}`,
        token
      )
        .then((data: Charges) => {
          if (!cancelled) setChargesResult({ key: chargesKey, data });
        })
        .catch(() => {
          // No breakdown if the estimate fails; the order itself is unaffected
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [side, productType, qty, effectivePrice, priceIsValid, chargesKey, token]);

  const setQuantity = (value: number) => setQty(Math.min(100000, Math.max(1, Math.floor(value) || 1)));

  const fillMarketPrice = () => {
    if (quote) setLimitPrice(quote.price.toFixed(2));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!priceIsValid) {
      setError(orderType === 'market' ? 'Waiting for the live price…' : 'Enter a valid limit price');
      return;
    }

    setSubmitting(true);
    try {
      const order = await apiFetch('/api/orders', token, {
        method: 'POST',
        body: JSON.stringify({
          instrumentId: instrument.id,
          type: side,
          orderType,
          productType,
          qty,
          // Market orders are priced by the server from the live quote, so no price is sent
          ...(orderType === 'limit' ? { orderPrice: limitValue } : {}),
          validity: 'DAY',
        }),
      });

      const result = await apiFetch(`/api/orders/${order.id}/execute`, token, { method: 'POST' });

      setMessage(
        `${side === 'buy' ? 'Bought' : 'Sold'} ${qty} ${instrument.symbol} at ${inr(
          Number(result.trade.pricePerShare)
        )}`
      );
      onOrderPlaced();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setSubmitting(false);
    }
  };

  const total = charges
    ? side === 'buy'
      ? charges.tradeValue + charges.totalCharges
      : charges.tradeValue - charges.totalCharges
    : null;

  return (
    <form className="card ticket" onSubmit={handleSubmit}>
      <div className="ticket-sym">
        <div className="row">
          <span className="symbol-chip">{instrument.symbol.slice(0, 2)}</span>
          <div>
            <div className="strong">{instrument.symbol}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {quote ? `LTP ${inr(quote.price)}` : quoteError ? 'Price unavailable' : 'Loading price…'}
            </div>
          </div>
        </div>
        <span className="card-title">Order ticket</span>
      </div>

      <div className="seg" role="tablist" aria-label="Buy or sell">
        <button type="button" className={`seg-btn${side === 'buy' ? ' active buy' : ''}`} onClick={() => setSide('buy')}>
          Buy
        </button>
        <button type="button" className={`seg-btn${side === 'sell' ? ' active sell' : ''}`} onClick={() => setSide('sell')}>
          Sell
        </button>
      </div>

      <div className="two-col">
        <div className="field">
          <span className="label">Product</span>
          <div className="seg">
            <button type="button" className={`seg-btn${productType === 'CNC' ? ' active' : ''}`} onClick={() => setProductType('CNC')} title="Delivery">
              CNC
            </button>
            <button type="button" className={`seg-btn${productType === 'MIS' ? ' active' : ''}`} onClick={() => setProductType('MIS')} title="Intraday">
              MIS
            </button>
          </div>
        </div>
        <div className="field">
          <span className="label">Order type</span>
          <div className="seg">
            <button
              type="button"
              className={`seg-btn${orderType === 'market' ? ' active' : ''}`}
              onClick={() => setOrderType('market')}
            >
              Market
            </button>
            <button
              type="button"
              className={`seg-btn${orderType === 'limit' ? ' active' : ''}`}
              onClick={() => {
                setOrderType('limit');
                if (!limitPrice) fillMarketPrice();
              }}
            >
              Limit
            </button>
          </div>
        </div>
      </div>

      <div className="two-col">
        <div className="field">
          <label className="label" htmlFor="qty">Quantity</label>
          <div className="stepper">
            <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(qty - 1)}>
              <Icon name="minus" size={14} />
            </button>
            <input
              id="qty"
              className="input"
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
            <button type="button" aria-label="Increase quantity" onClick={() => setQuantity(qty + 1)}>
              <Icon name="plus" size={14} />
            </button>
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="price">
            {orderType === 'market' ? 'Price (live)' : 'Limit price (₹)'}
          </label>
          {orderType === 'market' ? (
            <input id="price" className="input" disabled value={quote ? quote.price.toFixed(2) : 'At market'} />
          ) : (
            <input
              id="price"
              className="input"
              type="number"
              min={0}
              step="0.05"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="chips">
        {[1, 5, 10, 25, 50, 100].map((n) => (
          <button key={n} type="button" className="chip" onClick={() => setQuantity(n)}>
            {n}
          </button>
        ))}
        {orderType === 'limit' && quote && (
          <button type="button" className="chip" onClick={fillMarketPrice}>
            Use LTP
          </button>
        )}
      </div>

      {charges ? (
        <details className="charges">
          <summary>
            <span>
              {side === 'buy' ? 'You pay about' : 'You receive about'} <b>{inr(total ?? 0)}</b>
            </span>
            <Icon name="chevron-down" size={16} />
          </summary>
          <div className="charges-body">
            <ChargeRow label="Trade value" value={charges.tradeValue} />
            <ChargeRow label="Brokerage" value={charges.brokerage} />
            <ChargeRow label="STT" value={charges.stt} />
            <ChargeRow label="Exchange charges" value={charges.exchangeCharges} />
            <ChargeRow label="SEBI fee" value={charges.sebiCharges} />
            <ChargeRow label="GST" value={charges.gst} />
            <ChargeRow label="Stamp duty" value={charges.stampDuty} />
            <div className="charges-row total">
              <span>Total charges</span>
              <span>{inr(charges.totalCharges)}</span>
            </div>
          </div>
        </details>
      ) : (
        <div className="charges">
          <div className="charges-body" style={{ borderTop: 'none', padding: '11px 14px', color: 'var(--muted)' }}>
            {quoteError || 'Charges appear once the price is known.'}
          </div>
        </div>
      )}

      {error && (
        <div className="notice notice-error" role="alert">
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      )}
      {message && (
        <div className="notice notice-success" role="status">
          <Icon name="check-circle" size={16} /> {message}
        </div>
      )}

      <button
        type="submit"
        className={`btn btn-lg btn-block ${side === 'buy' ? 'btn-buy' : 'btn-sell'}`}
        disabled={submitting || !priceIsValid}
      >
        {submitting ? 'Placing order…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${qty} ${instrument.symbol}`}
      </button>
    </form>
  );
}

function ChargeRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="charges-row">
      <span>{label}</span>
      <span>{inr(value)}</span>
    </div>
  );
}

export default OrderForm;
