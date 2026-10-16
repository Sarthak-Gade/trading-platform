import { inr, signedInr, tone } from './format';
import type { Quote } from './types';
import Icon from './Icon';

export interface Position {
  id: string;
  productType: string;
  netQty: number;
  avgPrice: string;
  realizedPnl: string;
  instrument: { id: string; symbol: string; name: string };
}

function Positions({ positions, quotes }: { positions: Position[]; quotes: Record<string, Quote> }) {
  if (positions.length === 0) {
    return (
      <div className="empty">
        <Icon name="activity" size={32} />
        No positions yet.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Stock</th>
            <th>Product</th>
            <th className="num">Net qty</th>
            <th className="num">Avg price</th>
            <th className="num">LTP</th>
            <th className="num">Realised P&amp;L</th>
            <th className="num">Unrealised P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const q = quotes[p.instrument.id];
            const realized = Number(p.realizedPnl);
            // Open longs gain when the price rises; open shorts (negative qty) gain when it falls
            const unrealized = q && p.netQty !== 0 ? (q.price - Number(p.avgPrice)) * p.netQty : null;
            return (
              <tr key={p.id}>
                <td>
                  <div className="sym">
                    <span className="symbol-chip">{p.instrument.symbol.slice(0, 2)}</span>
                    <strong>{p.instrument.symbol}</strong>
                  </div>
                </td>
                <td><span className="badge badge-blue">{p.productType}</span></td>
                <td className="num">{p.netQty}</td>
                <td className="num">{inr(Number(p.avgPrice))}</td>
                <td className="num">{q ? inr(q.price) : '—'}</td>
                <td className={`num ${tone(realized)}`}>{signedInr(realized)}</td>
                <td className={`num ${tone(unrealized)}`}>{unrealized !== null ? signedInr(unrealized) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default Positions;
