import { inr, signedInr, signedPct, tone } from './format';
import type { Quote } from './types';
import Icon from './Icon';

export interface Holding {
  id: string;
  qty: number;
  investedValue: string;
  instrument: { id: string; symbol: string; name: string };
}

function Holdings({ holdings, quotes }: { holdings: Holding[]; quotes: Record<string, Quote> }) {
  if (holdings.length === 0) {
    return (
      <div className="empty">
        <Icon name="briefcase" size={32} />
        No holdings yet. Buy a stock with CNC (delivery) to see it here.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Stock</th>
            <th className="num">Qty</th>
            <th className="num">Avg price</th>
            <th className="num">LTP</th>
            <th className="num">Invested</th>
            <th className="num">Current</th>
            <th className="num">P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const invested = Number(h.investedValue);
            const q = quotes[h.instrument.id];
            const current = q ? q.price * h.qty : null;
            const pnl = current !== null ? current - invested : null;
            const pct = pnl !== null && invested > 0 ? (pnl / invested) * 100 : null;
            return (
              <tr key={h.id}>
                <td>
                  <div className="sym">
                    <span className="symbol-chip">{h.instrument.symbol.slice(0, 2)}</span>
                    <div>
                      <strong>{h.instrument.symbol}</strong>
                      <small>{h.instrument.name}</small>
                    </div>
                  </div>
                </td>
                <td className="num">{h.qty}</td>
                <td className="num">{inr(invested / h.qty)}</td>
                <td className="num">{q ? inr(q.price) : '—'}</td>
                <td className="num">{inr(invested)}</td>
                <td className="num">{current !== null ? inr(current) : '—'}</td>
                <td className={`num ${tone(pnl)}`}>
                  {pnl !== null ? (
                    <>
                      {signedInr(pnl)}
                      {pct !== null && <div style={{ fontSize: 11.5 }}>{signedPct(pct)}</div>}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default Holdings;
