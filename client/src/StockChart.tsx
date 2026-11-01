import { useState } from 'react';
import type { Quote } from './types';
import PriceChart from './PriceChart';
import CandleChart from './CandleChart';

interface Props {
  instrumentId: string;
  quote: Quote | null;
}

// One chart for a stock, used by the dashboard and the terminal:
// candles with timeframes and pattern markers (default), or the live price line.
function StockChart({ instrumentId, quote }: Props) {
  const [mode, setMode] = useState<'candles' | 'live'>('candles');

  return (
    <div>
      <div className="pill-tabs" style={{ marginBottom: 10 }}>
        <button type="button" className={`pill-tab${mode === 'candles' ? ' active' : ''}`} onClick={() => setMode('candles')}>
          Candles &amp; patterns
        </button>
        <button type="button" className={`pill-tab${mode === 'live' ? ' active' : ''}`} onClick={() => setMode('live')}>
          Live price
        </button>
      </div>
      {mode === 'candles' ? (
        <CandleChart key={instrumentId} kind="instrument" id={instrumentId} />
      ) : (
        <PriceChart instrumentId={instrumentId} quote={quote} />
      )}
    </div>
  );
}

export default StockChart;