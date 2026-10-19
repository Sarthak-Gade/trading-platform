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
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop_loss' | 'take_profit'>('market');
  const [qty, setQty] = useState(1);
  const [limitPrice, setLimitPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [chargesResult, setChargesResult] = useState<{ key: string; data: Charges } | null>(null);

  // The price this order would use: live price for market, typed price for limit, trigger price for SL / TP
  const limitValue = Number(limitPrice);
  const triggerValue = Number(triggerPrice);
  const isTrigger = orderType === 'stop_loss' || orderType === 'take_profit';
  // Orders execute only in market hours; the server makes the final decision
  const marketClosed = quote !== null && quote.marketState !== null && quote.marketState !== 'REGULAR';
  const effectivePrice = orderType === 'market' ? (quote?.price ?? null) : isTrigger ? triggerValue : limitValue;
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

  // Stop-loss and take-profit only sell, so switching to Buy goes back to a normal order
  const chooseSide = (next: 'buy' | 'sell') => {
    setSide(next);
    if (next === 'buy' && isTrigger) setOrderType('market');
  };

  // Starts the trigger a little away from the live price, on the correct side for the order
  const chooseTrigger = (kind: 'stop_loss' | 'take_profit') => {
    setOrderType(kind);
    if (!triggerPrice && quote) {
      const start = kind === 'stop_loss' ? quote.price * 0.95 : quote.price * 1.05;
      setTriggerPrice(start.toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!priceIsValid) {
      setError(
        orderType === 'market' ? 'Waiting for the live price…' : isTrigger ? 'Enter a valid trigger price' : 'Enter a valid limit price'
      );
      return;
    }
    if (isTrigger && quote) {
      if (orderType === 'stop_loss' && triggerValue >= quote.price) {
        setError(`Stop-loss trigger must be below the current price (${inr(quote.price)})`);
        return;
      }
      if (orderType === 'take_profit' && triggerValue <= quote.price) {
        setError(`Take-profit trigger must be above the current price (${inr(quote.price)})`);
        return;
      }
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
          ...(isTrigger ? { triggerPrice: triggerValue } : {}),
          validity: 'DAY',
        }),
      });

      // Stop-loss and take-profit wait on the server until the price is reached
      if (isTrigger) {
        setMessage(
          orderType === 'stop_loss'
            ? `Stop-loss set: ${qty} ${instrument.symbol} will sell if the price falls to ${inr(triggerValue)}`
            : `Take-profit set: ${qty} ${instrument.symbol} will sell if the price rises to ${inr(triggerValue)}`
        );
        onOrderPlaced();
        return;
      }

      if (order.trade) {
        // Market orders, and limit orders already at their price, are filled when the server answers
        setMessage(
          `${side === 'buy' ? 'Bought' : 'Sold'} ${qty} ${instrument.symbol} at ${inr(
            Number(order.trade.pricePerShare)
          )}`
        );
      } else {
        // A limit order waits until the market reaches its price
        setMessage(
          `Limit order placed: it will ${side === 'buy' ? 'buy' : 'sell'} ${qty} ${instrument.symbol} when the price ${
            side === 'buy' ? 'falls to' : 'rises to'
          } ${inr(limitValue)} or better`
        );
      }
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
        <button type="button" className={`seg-btn${side === 'buy' ? ' active buy' : ''}`} onClick={() => chooseSide('buy')}>
          Buy
        </button>
        <button type="button" className={`seg-btn${side === 'sell' ? ' active sell' : ''}`} onClick={() => chooseSide('sell')}>
          Sell
        </button>
      </div>

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
          {side === 'sell' && (
            <>
              <button
                type="button"
                className={`seg-btn${orderType === 'stop_loss' ? ' active' : ''}`}
                onClick={() => chooseTrigger('stop_loss')}
                title="Sell automatically if the price falls to your trigger"
              >
                Stop-loss
              </button>
              <button
                type="button"
                className={`seg-btn${orderType === 'take_profit' ? ' active' : ''}`}
                onClick={() => chooseTrigger('take_profit')}
                title="Sell automatically if the price rises to your trigger"
              >
                Take-profit
              </button>
            </>
          )}
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
            {orderType === 'market' ? 'Price (live)' : isTrigger ? 'Trigger price (₹)' : 'Limit price (₹)'}
          </label>
          {orderType === 'market' ? (
            <input id="price" className="input" disabled value={quote ? quote.price.toFixed(2) : 'At market'} />
          ) : isTrigger ? (
            <input
              id="price"
              className="input"
              type="number"
              min={0}
              step="0.05"
              value={triggerPrice}
              onChange={(e) => setTriggerPrice(e.target.value)}
            />
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

      {marketClosed && (
        <div className="notice notice-info">
          <Icon name="alert-circle" size={16} />
          {orderType === 'market'
            ? 'The market is closed. Market orders cannot execute now. Use a limit order and it will wait for the open.'
            : 'The market is closed. This order will be placed and can execute only once the market opens.'}
        </div>
      )}

      {isTrigger && (
        <div className="notice notice-info">
          <Icon name="alert-circle" size={16} />
          {orderType === 'stop_loss'
            ? 'Sells at the market price once the price falls to the trigger. It can fill below the trigger if the price drops fast.'
            : 'Sells at the market price once the price rises to the trigger.'}
          {' '}The shares stay reserved until it fires or you cancel it.
        </div>
      )}

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
        {submitting
          ? 'Placing order…'
          : isTrigger
            ? `Set ${orderType === 'stop_loss' ? 'stop-loss' : 'take-profit'} on ${qty} ${instrument.symbol}`
            : `${side === 'buy' ? 'Buy' : 'Sell'} ${qty} ${instrument.symbol}`}
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